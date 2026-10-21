import { ZodTypeAny, z } from 'zod';
import { AppException } from '../appResponse.parser';
import { ValidationIssueI } from '../interface/main.interface';

/**
 * Validate a value against a zod schema; on failure throw a 400 AppException
 * carrying `issues: [{ path, message }]` for the web app to show next to the fields.
 */
export function zodParse<T extends ZodTypeAny>(
  schema: T,
  value: unknown,
  prefix = '',
): z.infer<T> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;

  const issues: ValidationIssueI[] = r.error.issues.map((i) => ({
    path: [prefix, ...i.path].filter((p) => p !== '').join('.') || '(body)',
    message: i.message,
  }));

  throw new AppException(
    `Invalid request: ${issues.map((i) => `${i.path} — ${i.message}`).join('; ')}`,
    400,
    false,
    { issues },
  );
}
