import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Document } from 'mongoose';

export type SelectionDocument = Selection & Document;

/**
 * One material selection: the confirmed brief, every candidate with its AI-estimated data, and the
 * engine's full result. Nested engine output is stored as plain objects (validated in code, not by Mongo).
 */
@Schema({
  timestamps: true,
  collection: 'material_selections',
  minimize: false,
})
export class Selection {
  // DECISION: UUID ids (not ObjectIds) keep result URLs opaque and stable.
  @Prop({ type: String, default: () => randomUUID() })
  _id: string;

  @Prop({ required: true, index: true })
  title: string;

  @Prop({ type: String, default: null })
  topPick: string | null;

  @Prop({ default: 0 })
  candidateCount: number;

  @Prop({ type: Object, required: true })
  spec: Record<string, any>;

  @Prop({ required: true, enum: ['sizing', 'index'] })
  mode: string;

  @Prop({ required: true })
  objectiveLabel: string;

  @Prop({ required: true })
  objectiveUnit: string;

  @Prop({ required: true })
  lowerIsBetter: boolean;

  @Prop({ type: Object, required: true })
  index: Record<string, any>;

  @Prop({ required: true })
  safetyFactor: number;

  @Prop({ type: [String], default: [] })
  activeConstraints: string[];

  @Prop({ type: [Object], default: [] })
  ranking: Record<string, any>[];

  @Prop({ type: [Object], default: [] })
  rejected: Record<string, any>[];

  @Prop({ type: [Object], default: [] })
  notEvaluated: Record<string, any>[];

  @Prop({ type: [Object], default: [] })
  invalidData: Record<string, any>[];

  @Prop({ type: [Object], default: [] })
  materials: Record<string, any>[];

  @Prop({ type: [String], default: [] })
  warnings: string[];

  @Prop({ type: [String], default: [] })
  safetyNotes: string[];

  @Prop({ required: true, enum: ['llm', 'mock'] })
  dataSource: string;

  @Prop({ enum: ['server', 'user', 'none'], default: 'none' })
  keySource: string;

  @Prop({ type: Object, default: {} })
  explanations: Record<string, any>;

  /** Where-to-buy results, keyed by country code. */
  @Prop({ type: Object, default: {} })
  sourcing: Record<string, any>;

  @Prop({ type: Object, default: {} })
  timingsMs: Record<string, number>;

  @Prop({ required: true })
  mcSamples: number;

  @Prop({ required: true })
  seed: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SelectionSchema = SchemaFactory.createForClass(Selection);
SelectionSchema.index({ createdAt: -1 });
