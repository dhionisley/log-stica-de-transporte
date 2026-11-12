import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), {
        message: 'must use the postgres or postgresql protocol',
      }),
    REDIS_URL: z
      .string()
      .url()
      .refine((value) => ['redis:', 'rediss:'].includes(new URL(value).protocol), {
        message: 'must use the redis or rediss protocol',
      }),
    OTEL_SERVICE_NAME: z.string().trim().min(1).default('transport-api'),
  })
  .passthrough();

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.') || 'environment'))];
  throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
}
