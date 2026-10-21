import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'src/common/appResponse.parser';
import { CONFIGS } from 'src/common/constants/configs.constant';
import {
  Audience,
  Explanation,
  SelectionResult,
} from 'src/common/domain/domain.types';
import { LlmContextI } from 'src/common/interface/main.interface';
import { AppLoggerService } from 'src/common/logging/logging.service';
import { parseSpec, unitErrorToHttp } from 'src/common/util/spec.utils';
import { runSelection } from 'src/engine/pipeline';
import { UnitError } from 'src/engine/units';
import { LlmService } from 'src/core/llm/llm.service';
import { demoAdjust } from 'src/core/llm/mock/mock.data';
import { ExplanationService } from '../explanation/explanation.service';
import { MaterialService } from '../material/material.service';
import { SelectionSummaryI } from './interface/selection.interface';
import { SelectionRepository } from './repository/selection.repository';
import { SelectionDocument } from './schema/selection.schema';

@Injectable()
export class SelectionService {
  private readonly mcSamples: number;
  private readonly inflight = new Map<string, Promise<Explanation>>();

  constructor(
    private readonly selectionRepo: SelectionRepository,
    private readonly materialService: MaterialService,
    private readonly explanationService: ExplanationService,
    private readonly llm: LlmService,
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    this.mcSamples =
      Number(this.configService.get('MC_SAMPLES')) ||
      CONFIGS.DEFAULT_MC_SAMPLES;
  }

  /**
   * Candidates (Claude or demo) → deterministic engine → explanation → save.
   * Claude never ranks or filters: fit and order come only from `runSelection`.
   */
  async createSelection(
    specInput: unknown,
    ctx: LlmContextI,
  ): Promise<SelectionResult> {
    const spec = parseSpec(specInput); // 400 before spending anything on Claude
    const live = this.llm.isLive(ctx);
    const timingsMs: Record<string, number> = {};

    let t = Date.now();
    const { materials, warnings: candidateWarnings } =
      await this.materialService.getCandidates(spec, ctx);
    timingsMs.candidates = Date.now() - t;

    // Demo data can't rate custom environments or unknown custom properties: adapt the spec and say so.
    const adjusted = live ? { spec, notes: [] as string[] } : demoAdjust(spec);

    t = Date.now();
    let engine: ReturnType<typeof runSelection>;
    try {
      engine = runSelection(adjusted.spec, materials, {
        mcSamples: this.mcSamples,
      });
    } catch (e) {
      if (e instanceof UnitError) throw unitErrorToHttp(e);
      throw e;
    }
    timingsMs.engine = Date.now() - t;

    const draft: SelectionResult = {
      ...engine,
      spec, // keep the user's own wording so "Change requirements" shows what they entered
      id: '',
      createdAt: '',
      warnings: [...candidateWarnings, ...adjusted.notes, ...engine.warnings],
      dataSource: live ? 'llm' : 'mock',
      keySource: ctx.keySource,
      explanations: {},
      timingsMs,
    };

    t = Date.now();
    draft.explanations[spec.audience] =
      await this.explanationService.generateExplanation(
        draft,
        spec.audience,
        ctx,
      );
    timingsMs.explanation = Date.now() - t;

    const { id: _id, createdAt: _c, ...stored } = draft;
    const top = draft.ranking[0];
    const doc = await this.selectionRepo.create({
      ...stored,
      title: spec.title,
      topPick: top
        ? top.grade
          ? `${top.name} (${top.grade})`
          : top.name
        : null,
      candidateCount: materials.length,
    });

    const result = this.toResult(doc.toObject() as SelectionDocument);
    this.logger.log(
      `SelectionService: ${result.id} [${ctx.keySource} key] ${materials.length} candidates, ${result.ranking.length} fit, top=${top?.name ?? 'none'} ${JSON.stringify(timingsMs)}`,
    );
    return result;
  }

  async getSelectionById(id: string): Promise<SelectionResult> {
    const doc = await this.selectionRepo.findById(id);
    if (!doc) throw new AppException(`No selection with id "${id}".`, 404);
    return this.toResult(doc as SelectionDocument);
  }

  async getRecentSelections(): Promise<SelectionSummaryI[]> {
    const { documents } = await this.selectionRepo.search(
      {},
      undefined,
      undefined,
      { limit: CONFIGS.RECENT_SELECTIONS_LIMIT, page: 1 },
      ['_id', 'title', 'topPick', 'candidateCount', 'createdAt'],
    );
    return documents.map((d) => ({
      id: String(d._id),
      createdAt: new Date(d.createdAt as Date).toISOString(),
      title: d.title as string,
      topPick: (d.topPick as string) ?? null,
      candidates: (d.candidateCount as number) ?? 0,
    }));
  }

  /** Explanation for another audience: generated once (deduplicated while in flight), then cached. */
  async explainSelection(
    id: string,
    audience: Audience,
    ctx: LlmContextI,
  ): Promise<Explanation> {
    const result = await this.getSelectionById(id);
    const cached = result.explanations?.[audience];
    if (cached) return cached;

    const key = `${id}:${audience}`;
    let p = this.inflight.get(key);
    if (!p) {
      p = this.explanationService
        .generateExplanation(result, audience, ctx)
        .then(async (e) => {
          await this.selectionRepo.update(id, {
            $set: { [`explanations.${audience}`]: e },
          });
          return e;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  private toResult(doc: Partial<SelectionDocument>): SelectionResult {
    const {
      _id,
      __v,
      createdAt,
      updatedAt,
      title,
      topPick,
      candidateCount,
      ...rest
    } = doc as any;
    return {
      ...rest,
      id: String(_id),
      createdAt: new Date(createdAt).toISOString(),
    } as SelectionResult;
  }
}
