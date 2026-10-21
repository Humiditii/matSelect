import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  AUDIENCES,
  COMPONENTS,
  CONFIDENCES,
  CRITERIA,
  DEFAULT_SAFETY_FACTORS,
  END_CONDITIONS,
  ENVIRONMENTS,
  FAMILIES,
  MUST_HAVES,
  OBJECTIVES,
  PROCESSES,
  PROCESS_RATINGS,
  PROPERTY_META,
  RATINGS,
  SAFETY_CLASSES,
  SECTIONS,
  SUPPORTS,
} from 'src/common/domain/domain.types';
import { SUPPORTED_UNITS } from 'src/engine/units';
import { LlmService } from 'src/core/llm/llm.service';

@Injectable()
export class AppService {
  constructor(
    private readonly llm: LlmService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  getHealth() {
    return {
      status: 'ok',
      // "anthropic" when the server has its own key; otherwise users may supply theirs, else demo data.
      llmProvider: this.llm.hasServerKey ? 'anthropic' : 'mock',
      serverHasKey: this.llm.hasServerKey,
      acceptsUserKey: !this.llm.hasServerKey,
      model: this.llm.model,
      database: this.connection.readyState === 1 ? 'connected' : 'disconnected',
    };
  }

  getMeta() {
    return {
      audiences: AUDIENCES,
      components: COMPONENTS,
      objectives: OBJECTIVES,
      criteria: CRITERIA,
      supports: SUPPORTS,
      endConditions: END_CONDITIONS,
      sections: SECTIONS,
      environments: ENVIRONMENTS,
      processes: PROCESSES,
      mustHaves: MUST_HAVES,
      families: FAMILIES,
      safetyClasses: SAFETY_CLASSES,
      ratings: RATINGS,
      processRatings: PROCESS_RATINGS,
      confidences: CONFIDENCES,
      defaultSafetyFactors: DEFAULT_SAFETY_FACTORS,
      units: SUPPORTED_UNITS,
      properties: PROPERTY_META,
    };
  }
}
