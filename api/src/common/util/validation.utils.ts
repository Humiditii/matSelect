import { ZodTypeAny, z } from 'zod';
import { AppException } from '../appResponse.parser';
import { ValidationIssueI } from '../interface/main.interface';

/**
 * Validates a value against a zod schema. On failure throws a 400 carrying `issues: [{ path, message }]`,
 * which the web app shows next to the fields.
 */
export function zodParse<T extends ZodTypeAny>(
  schema: T,
  value: unknown,
  prefix = '',
): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issues: ValidationIssueI[] = result.error.issues.map((issue) => ({
    path:
      [prefix, ...issue.path].filter((part) => part !== '').join('.') ||
      '(body)',
    message: issue.message,
  }));

  throw new AppException(
    `Invalid request: ${issues.map((i) => `${i.path} — ${i.message}`).join('; ')}`,
    400,
    false,
    { issues },
  );
}
