import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  RankedMaterial,
  SelectionResult,
  SourcingItemI,
  SourcingResultI,
} from 'src/common/domain/domain.types';
import { LlmContextI } from 'src/common/interface/main.interface';
import { AppLoggerService } from 'src/common/logging/logging.service';
import { LlmService, extractJson } from 'src/core/llm/llm.service';
import { countryName } from 'src/core/llm/prompts/llm.prompts';
import { SelectionRepository } from '../selection/repository/selection.repository';
import { SelectionService } from '../selection/selection.service';
import { FindSourcesDto } from './dto/sourcing.dto';

/** How many of the top picks to find suppliers for. */
const TOP_N = 3;

/** Commodity materials stocked by ordinary builders' merchants, hardware and plastics stockists almost everywhere. */
const COMMON =
  /mild steel|galvanised|stainless|aluminium|aluminum|copper|brass|pvc|polyethylene|polypropylene|acrylic|polycarbonate|pine|spruce|plywood|mdf|oak|concrete|float glass|toughened|polystyrene|rubber|epdm|fibreglass|glass fibre \/ polyester|pla\b|petg|abs\b|nylon/i;
/** Materials usually made by a few specialist producers and often imported. */
const RARE =
  /titanium|carbon-ceramic|carbon-carbon|c\/sic|aramid|zirconia|silicon carbide|aerogel|metal-matrix|flax/i;

const SourcingOutput = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      availability: z
        .enum(['widely available', 'specialist suppliers', 'likely imported'])
        .nullable()
        .catch(null),
      forms: z.array(z.string()).default([]),
      suppliers: z
        .array(
          z.object({
            name: z.string(),
            url: z.string(),
            note: z.string().default(''),
          }),
        )
        .default([]),
      notes: z.string().default(''),
    }),
  ),
});

@Injectable()
export class SourcingService {
  constructor(
    private readonly selectionService: SelectionService,
    private readonly selectionRepo: SelectionRepository,
    private readonly llm: LlmService,
    private readonly logger: AppLoggerService,
  ) {}

  /** Suppliers / availability for the top picks in a country. Cached per country (and city). */
  async findSources(
    id: string,
    p: FindSourcesDto,
    ctx: LlmContextI,
  ): Promise<SourcingResultI> {
    const result = await this.selectionService.getSelectionById(id);
    const city = p.city?.trim() || null;
    const cached = result.sourcing?.[p.country];
    if (
      !p.refresh &&
      cached &&
      cached.city === city &&
      (cached.dataSource === 'llm' || !this.llm.isLive(ctx))
    )
      return cached;

    const picks = result.ranking.slice(0, TOP_N);
    const sourcing = this.llm.isLive(ctx)
      ? await this.liveSources(result, picks, p.country, city, ctx)
      : this.demoSources(result, picks, p.country, city);

    await this.selectionRepo.update(id, {
      $set: { [`sourcing.${p.country}`]: sourcing },
    });
    return sourcing;
  }

  // -------------------------------------------------------------------------
  private searchLinks(name: string, form: string | undefined, place: string) {
    const q = (s: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(s)}`;
    return [
      {
        label: `Suppliers in ${place}`,
        url: q(`${name} ${form ?? ''} supplier ${place}`.replace(/\s+/g, ' ')),
      },
      {
        label: 'Price',
        url: q(`${name} ${form ?? ''} price ${place}`.replace(/\s+/g, ' ')),
      },
    ];
  }

  private materialFor(result: SelectionResult, r: RankedMaterial) {
    return result.materials.find((m) => m.id === r.materialId);
  }

  /** No key: availability from simple rules, plus search links the user can follow. */
  private demoSources(
    result: SelectionResult,
    picks: RankedMaterial[],
    country: string,
    city: string | null,
  ): SourcingResultI {
    const place = city
      ? `${city}, ${countryName(country)}`
      : countryName(country);
    const items: SourcingItemI[] = picks.map((r) => {
      const m = this.materialFor(result, r);
      const label = r.grade ? `${r.name} ${r.grade}` : r.name;
      const availability = COMMON.test(r.name)
        ? 'widely available'
        : RARE.test(r.name)
          ? 'likely imported'
          : 'specialist suppliers';
      return {
        materialId: r.materialId,
        name: r.grade ? `${r.name} (${r.grade})` : r.name,
        availability,
        forms: m?.forms ?? [],
        suppliers: [],
        searchLinks: this.searchLinks(label, m?.forms?.[0], place),
        notes:
          availability === 'widely available'
            ? 'Usually stocked by builders’ merchants, metal or plastics stockists and hardware shops.'
            : availability === 'likely imported'
              ? 'Made by a few specialist producers; expect to order from a distributor or import it.'
              : 'Available from specialist distributors; ask for the grade by name.',
      };
    });
    return {
      country,
      countryName: countryName(country),
      city,
      generatedAt: new Date().toISOString(),
      dataSource: 'mock',
      items,
      note: 'Demo mode: availability is a general guide and the links open a web search. Add a Claude API key for named suppliers found by live web search.',
    };
  }

  /** With a key: one Claude call with live web search localised to the country, returning suppliers with links. */
  private async liveSources(
    result: SelectionResult,
    picks: RankedMaterial[],
    country: string,
    city: string | null,
    ctx: LlmContextI,
  ): Promise<SourcingResultI> {
    const place = city
      ? `${city}, ${countryName(country)}`
      : countryName(country);
    const list = picks
      .map((r, i) => {
        const m = this.materialFor(result, r);
        return `${i + 1}. ${r.name}${r.grade ? ` (${r.grade})` : ''} — forms: ${(m?.forms ?? []).join(', ') || 'any'}${r.sizing ? `; needed size: ${r.sizing.dimension}` : ''}`;
      })
      .join('\n');

    const system = `You help someone buy engineering materials locally. Use web search to find real suppliers, stockists, distributors or markets in the given country (prefer the given city), and how easy each material is to get there.
- Search efficiently: one or two searches per material, covering all the materials.
- Prefer suppliers that list the exact material. If none do, list general stockists of that material type found in search results (e.g. timber merchants or markets for a wood, metal stockholders for an alloy, plastics distributors for a polymer) and say "general stockist" in the note.
- Only list suppliers that appeared in your search results, with the URL of their own website, product page or directory listing. Never invent a supplier or a URL. If you find none, return an empty supplier list and say so in notes.

When you are done searching, reply with ONLY this JSON object and nothing else:
{"items":[{"name":"<material as given>","availability":"widely available" | "specialist suppliers" | "likely imported" | null,"forms":["stock forms sold locally"],"suppliers":[{"name":"…","url":"https://…","note":"what they sell / where"}],"notes":"one or two sentences: local availability, typical lead time or price level if found"}]}
Keep the materials in the given order. At most 4 suppliers per material.`;
    const user = `Country: ${countryName(country)} (${country})${city ? `\nCity: ${city}` : ''}\n\nMaterials:\n${list}`;

    const text = await this.llm.searchWeb(
      ctx,
      `sourcing:${country}`,
      system,
      user,
      { country, city },
      15,
    );

    let parsed: z.infer<typeof SourcingOutput> | null = null;
    try {
      parsed = SourcingOutput.parse(JSON.parse(extractJson(text)));
    } catch (e) {
      this.logger.warn(
        `SourcingService: could not parse sourcing answer (${(e as Error).message})`,
      );
    }

    const isUrl = (u: string) => /^https?:\/\/[^\s]+$/i.test(u.trim());
    const items: SourcingItemI[] = picks.map((r, i) => {
      const m = this.materialFor(result, r);
      const got = parsed?.items[i];
      return {
        materialId: r.materialId,
        name: r.grade ? `${r.name} (${r.grade})` : r.name,
        availability: got?.availability ?? null,
        forms: got?.forms?.length ? got.forms.slice(0, 6) : (m?.forms ?? []),
        suppliers: (got?.suppliers ?? [])
          .filter((s) => isUrl(s.url))
          .slice(0, 4)
          .map((s) => ({
            name: s.name.slice(0, 120),
            url: s.url.trim(),
            note: s.note.slice(0, 200),
          })),
        searchLinks: this.searchLinks(
          r.grade ? `${r.name} ${r.grade}` : r.name,
          m?.forms?.[0],
          place,
        ),
        notes: (
          got?.notes ??
          (parsed
            ? ''
            : 'The search answer could not be read; use the search links below.')
        ).slice(0, 400),
      };
    });

    return {
      country,
      countryName: countryName(country),
      city,
      generatedAt: new Date().toISOString(),
      dataSource: 'llm',
      items,
      note: 'Found by live web search. Check stock, grade and price with each supplier before ordering.',
    };
  }
}
