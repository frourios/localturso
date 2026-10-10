import { databaseUrl } from '../domain/database/store/databaseDto';
import { databaseQuery } from '../domain/database/store/databaseQuery';
import { getStore } from './drizzleClient';
import { handle } from './http';
import { assertPlatform, PlatformError } from './platformError';
import type { RouteContext } from './platformRoute';
import { env } from './serverEnvs';
import { authorizeDatabase } from './token';

export type SqlEndpoint =
  | 'v2/pipeline'
  | 'v2/cursor'
  | 'v3/pipeline'
  | 'v3/cursor'
  | 'version'
  | 'health'
  | 'dump';

export const sqlProxy =
  (path: SqlEndpoint) => (request: Request, context: RouteContext<{ id: string }>) =>
    handle(async () => {
      const url = new URL(request.url);
      const { id } = await context.params;
      assertPlatform(id && /^[a-f0-9-]{36}$/.test(id), 404, 'database not found');
      const store = await getStore();
      const record = await databaseQuery.findById(store, id);
      await authorizeDatabase(store, record, request.headers.get('authorization'));
      let upstream: Response;
      try {
        // namespace JWT validation in sqld enforces read-only permissions, including prepared SQL and batches.
        upstream = await fetch(`${env.LIBSQL_URL}/${path}${url.search}`, {
          method: request.method,
          headers: {
            'content-type': request.headers.get('content-type') ?? 'application/json',
            'x-namespace': record.id,
            authorization: request.headers.get('authorization')!,
          },
          body: request.method === 'POST' ? await request.text() : undefined,
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        });
      } catch {
        throw new PlatformError(503, 'libSQL server unavailable');
      }
      const headers = new Headers({
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      });
      // Keep Hrana sticky-session routing on the public authenticated gateway.
      if (path.endsWith('/pipeline') && upstream.ok) {
        const body = await upstream.json();
        if (body.base_url) body.base_url = databaseUrl(record);
        return Response.json(body, { status: upstream.status, headers });
      }
      if (path.endsWith('/cursor') && upstream.ok) {
        // Cursor headers are the first JSON line. Rewriting avoids leaking the internal sqld address.
        const text = await upstream.text();
        const end = text.indexOf('\n');
        if (end >= 0) {
          const head = JSON.parse(text.slice(0, end));
          if (head.base_url) head.base_url = databaseUrl(record);
          return new Response(`${JSON.stringify(head)}${text.slice(end)}`, {
            status: upstream.status,
            headers,
          });
        }
        return new Response(text, { status: upstream.status, headers });
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    });
