import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { PlatformError } from './platformError';
import { env } from './serverEnvs';
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
  'cache-control': 'no-store',
};
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
export const options = () => new Response(null, { status: 204, headers: cors });
export function authorizePlatform(request: Request) {
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${env.LOCALTURSO_PLATFORM_TOKEN}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new PlatformError(401, 'invalid platform API token');
}
export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new PlatformError(400, 'invalid JSON body');
  }
}
export async function handle(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PlatformError)
      return json(
        { ...(error.code ? { code: error.code } : {}), error: error.message },
        error.status,
      );
    if (error instanceof ZodError)
      return json(
        { error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
        400,
      );
    console.error(error);
    return json({ error: 'internal server error' }, 500);
  }
}
