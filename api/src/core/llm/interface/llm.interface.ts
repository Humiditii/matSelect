import { ZodType, ZodTypeDef } from 'zod';

export interface StructuredCallI<T> {
  readonly label: string;
  readonly system: string;
  /** Builds the user message; receives validation errors on the corrective retry. */
  readonly user: (validationErrors?: string) => string;
  readonly schema: Record<string, unknown>;
  readonly parse: ZodType<T, ZodTypeDef, unknown>;
  readonly maxTokens?: number;
}
