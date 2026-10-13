import 'dotenv/config';
import { z } from 'zod';
export const env = z
  .object({
    LOCALTURSO_ORG: z
      .string()
      .regex(/^[a-z0-9-]{1,64}$/)
      .default('local'),
    LOCALTURSO_PLATFORM_TOKEN: z.string().min(1).default('localturso-platform-token'),
    LOCALTURSO_TOKEN_GROUP: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)
        .optional(),
    ),
    LOCALTURSO_DATA_DIR: z.string().default('./data'),
    LOCALTURSO_PUBLIC_URL: z.url().default('http://127.0.0.1:5050'),
    LIBSQL_ADMIN_URL: z.url().default('http://127.0.0.1:8081'),
    LIBSQL_URL: z.url().default('http://127.0.0.1:8080'),
  })
  .parse(process.env);
