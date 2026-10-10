import { z } from 'zod';
import { assertPlatform, PlatformError } from './platformError';
export async function rejectTokenBody(request: Request) {
  const text = await request.text();
  if (!text) return;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new PlatformError(400, 'invalid JSON body');
  }
  const emptyPermissions = z
    .object({
      permissions: z
        .object({
          read_attach: z
            .object({
              databases: z.array(z.string()).max(0).optional(),
            })
            .strict()
            .optional(),
        })
        .strict()
        .optional(),
    })
    .strict();
  assertPlatform(
    emptyPermissions.safeParse(body).success,
    501,
    'custom token permissions are not implemented',
  );
}
