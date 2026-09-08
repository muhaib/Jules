import { z } from 'zod';

/**
 * Validated environment. Fails fast at boot rather than surfacing as a confusing
 * runtime error deep inside a request.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  APP_URL: z.string().url().default('http://localhost:3000'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),

  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const MAX_UPLOAD_BYTES = () => env().MAX_UPLOAD_MB * 1024 * 1024;
