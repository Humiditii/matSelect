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

// How many of the top picks to find suppliers for.
const PICKS_TO_SOURCE = 3;

// Commodity materials stocked almost everywhere by builders' merchants, hardware shops and plastics stockists.
const COMMON_MATERIALS =
  /mild steel|galvanised|stainless|aluminium|aluminum|copper|brass|pvc|polyethylene|polypropylene|acrylic|polycarbonate|pine|spruce|plywood|mdf|oak|concrete|float glass|toughened|polystyrene|rubber|epdm|fibreglass|glass fibre \/ polyester|pla\b|petg|abs\b|nylon/i;
// Materials usually made by a few specialist producers and often imported.
const RARE_MATERIALS =
  /titanium|carbon-ceramic|carbon-carbon|c\/sic|aramid|zirconia|silicon carbide|aerogel|metal-matrix|flax/i;

type Availability = NonNullable<SourcingItemI['availability']>;

const DEMO_AVAILABILITY_NOTES: Record<Availability, string> = {
  'widely available':
    'Usually stocked by builders’ merchants, metal or plastics stockists and hardware shops.',
  'likely imported':
    'Made by a few specialist producers; expect to order from a distributor or import it.',
  'specialist suppliers':
    'Available from specialist distributors; ask for the grade by name.',
};

function guessAvailability(materialName: string): Availability {
  if (COMMON_MATERIALS.test(materialName)) return 'widely available';
  if (RARE_MATERIALS.test(materialName)) return 'likely imported';
  return 'specialist suppliers';
}

const nameWithGrade = (pick: RankedMaterial) =>
  pick.grade ? `${pick.name} (${pick.grade})` : pick.name;

// Search text for a material, e.g. "Aluminium 6061-T6".
const searchName = (pick: RankedMaterial) =>
  pick.grade ? `${pick.name} ${pick.grade}` : pick.name;

const placeName = (country: string, city: string | null) =>
  city ? `${city}, ${countryName(country)}` : countryName(country);

const googleSearchUrl = (query: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(query.replace(/\s+/g, ' '))}`;

function searchLinks(name: string, form: string | undefined, place: string) {
  return [
    {
      label: `Suppliers in ${place}`,
      url: googleSearchUrl(`${name} ${form ?? ''} supplier ${place}`),
    },
    {
      label: 'Price',
      url: googleSearchUrl(`${name} ${form ?? ''} price ${place}`),
    },
  ];
}

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

  // Suppliers and availability of the top picks in a country. Saved per country, for one city at a time.
  async findSources(
    id: string,
    request: FindSourcesDto,
    ctx: LlmContextI,
  ): Promise<SourcingResultI> {
    const result = await this.selectionService.getSelectionById(id);
    const city = request.city?.trim() || null;
    const cached = result.sourcing?.[request.country];
    if (
      !request.refresh &&
      cached &&
      cached.city === city &&
      (cached.dataSource === 'llm' || !this.llm.isLive(ctx))
    )
      return cached;

    const picks = result.ranking.slice(0, PICKS_TO_SOURCE);
    const sourcing = this.llm.isLive(ctx)
      ? await this.liveSources(result, picks, request.country, city, ctx)
      : this.demoSources(result, picks, request.country, city);

    await this.selectionRepo.update(id, {
      $set: { [`sourcing.${request.country}`]: sourcing },
    });
    return sourcing;
  }

  private materialFor(result: SelectionResult, pick: RankedMaterial) {
    return result.materials.find((m) => m.id === pick.materialId);
  }

  // Without a key: availability from simple rules, plus search links the user can follow.
  private demoSources(
    result: SelectionResult,
    picks: RankedMaterial[],
    country: string,
    city: string | null,
  ): SourcingResultI {
    const place = placeName(country, city);
    const items: SourcingItemI[] = picks.map((pick) => {
      const material = this.materialFor(result, pick);
      const availability = guessAvailability(pick.name);
      return {
        materialId: pick.materialId,
        name: nameWithGrade(pick),
        availability,
        forms: material?.forms ?? [],
        suppliers: [],
        searchLinks: searchLinks(searchName(pick), material?.forms?.[0], place),
        notes: DEMO_AVAILABILITY_NOTES[availability],
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

  // With a key: one Claude call with live web search in the country, returning suppliers with links.
  private async liveSources(
    result: SelectionResult,
    picks: RankedMaterial[],
    country: string,
    city: string | null,
    ctx: LlmContextI,
  ): Promise<SourcingResultI> {
    const place = placeName(country, city);
    const list = picks
      .map((pick, i) => {
        const material = this.materialFor(result, pick);
        return `${i + 1}. ${nameWithGrade(pick)} — forms: ${(material?.forms ?? []).join(', ') || 'any'}${pick.sizing ? `; needed size: ${pick.sizing.dimension}` : ''}`;
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
    } catch (err) {
      this.logger.warn(
        `SourcingService: could not parse sourcing answer (${(err as Error).message})`,
      );
    }

    const isUrl = (url: string) => /^https?:\/\/[^\s]+$/i.test(url.trim());
    const items: SourcingItemI[] = picks.map((pick, i) => {
      const material = this.materialFor(result, pick);
      const found = parsed?.items[i];
      const fallbackNote = parsed
        ? ''
        : 'The search answer could not be read; use the search links below.';
      return {
        materialId: pick.materialId,
        name: nameWithGrade(pick),
        availability: found?.availability ?? null,
        forms: found?.forms?.length
          ? found.forms.slice(0, 6)
          : (material?.forms ?? []),
        suppliers: (found?.suppliers ?? [])
          .filter((supplier) => isUrl(supplier.url))
          .slice(0, 4)
          .map((supplier) => ({
            name: supplier.name.slice(0, 120),
            url: supplier.url.trim(),
            note: supplier.note.slice(0, 200),
          })),
        searchLinks: searchLinks(searchName(pick), material?.forms?.[0], place),
        notes: (found?.notes ?? fallbackNote).slice(0, 400),
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
