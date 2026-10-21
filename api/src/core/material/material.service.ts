import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from 'src/common/appResponse.parser';
import { CONFIGS } from 'src/common/constants/configs.constant';
import {
  DesignSpec,
  FAMILIES,
  Family,
  Material,
} from 'src/common/domain/domain.types';
import { LlmContextI } from 'src/common/interface/main.interface';
import { FAMILY_LABEL } from 'src/engine/labels';
import { LlmService } from 'src/core/llm/llm.service';
import { mockCandidates } from 'src/core/llm/mock/mock.data';
import {
  CANDIDATE_SCHEMA,
  CandidateOutput,
  toMaterials,
} from 'src/core/llm/outputs/llm.outputs';
import {
  CANDIDATE_SYSTEM,
  candidateUser,
} from 'src/core/llm/prompts/llm.prompts';
import { CandidateSetI } from './interface/material.interface';

@Injectable()
export class MaterialService {
  private readonly perFamily: number;

  constructor(
    private readonly llm: LlmService,
    private readonly configService: ConfigService,
  ) {
    this.perFamily =
      Number(this.configService.get('MATERIALS_PER_FAMILY')) ||
      CONFIGS.DEFAULT_MATERIALS_PER_FAMILY;
  }

  /**
   * candidate materials for every family the user did not exclude.
   * Claude: one parallel call per family; a failed family is skipped with a warning; all failing → 502.
   * Demo: the built-in curated set.
   */
  async getCandidates(
    spec: DesignSpec,
    ctx: LlmContextI,
  ): Promise<CandidateSetI> {
    const families = FAMILIES.filter((f) => !spec.excludeFamilies.includes(f));
    const usedIds = new Set<string>();

    if (!this.llm.isLive(ctx)) {
      const materials = families.flatMap((f) =>
        mockCandidates(f, this.perFamily).map((m) => ({
          ...m,
          id: uniqueId(`${f}-${m.name}-${m.grade ?? ''}`, usedIds),
        })),
      );
      return { materials, warnings: [] };
    }

    const settled = await Promise.allSettled(
      families.map((family) =>
        this.llm.structured(ctx, {
          label: `candidates:${family}`,
          system: CANDIDATE_SYSTEM,
          user: (errors) =>
            candidateUser(spec, family, this.perFamily) +
            (errors
              ? `\n\nYour previous answer failed validation:\n${errors}`
              : ''),
          schema: CANDIDATE_SCHEMA,
          parse: CandidateOutput,
          maxTokens: 32000,
        }),
      ),
    );

    const warnings: string[] = [];
    const materials: Material[] = [];
    const failures: AppException[] = [];

    settled.forEach((s, i) => {
      const family = families[i] as Family;
      if (s.status === 'fulfilled') {
        const items = toMaterials(
          s.value.materials,
          family,
          usedIds,
          spec.customEnvironments,
          spec.customProperties.map((p) => p.key),
        );
        const dropped = s.value.materials.length - items.length;
        if (dropped > 0)
          warnings.push(
            `Dropped ${dropped} ${FAMILY_LABEL[family].toLowerCase()} candidate(s) listed under the wrong family.`,
          );
        materials.push(...items);
      } else {
        const err = s.reason as AppException;
        failures.push(err);
        warnings.push(
          `Could not get ${FAMILY_LABEL[family].toLowerCase()} candidates from Claude, so that family was skipped (${err?.message ?? String(err)}).`,
        );
      }
    });

    if (!materials.length) {
      // A rejected user key is the user's to fix (401/403); everything else is an upstream failure (502).
      const first = failures[0];
      const status =
        typeof first?.getStatus === 'function' ? first.getStatus() : 502;
      throw new AppException(
        `Claude could not supply candidate materials for any family. ${first?.message ?? ''}`.trim(),
        [401, 403, 429].includes(status) ? status : 502,
      );
    }

    return { materials, warnings };
  }
}

function uniqueId(raw: string, used: Set<string>): string {
  const base =
    raw
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'material';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}
