import { databaseQuery } from '../domain/database/store/databaseQuery';
import { getStore } from './drizzleClient';
import { authorizePlatform, handle } from './http';
import { assertPlatform } from './platformError';
import { env } from './serverEnvs';

export type RouteContext<P> = { params: Promise<P> };

// Route modules declare their methods and operations; this wrapper only handles shared validation.
export function platformRoute<P extends { org?: string; name?: string } = Record<string, never>>(
  operation: (request: Request, params: P) => Promise<Response>,
  kind: 'database' | 'group' = 'database',
) {
  return (request: Request, context: RouteContext<P>) =>
    handle(async () => {
      authorizePlatform(request);
      const params = await context.params;
      if (params.org !== undefined)
        assertPlatform(params.org === env.LOCALTURSO_ORG, 404, 'organization not found');
      await authorizeScope(request, params.name, kind);
      return operation(request, params);
    });
}

export function groupPlatformRoute<P extends { org?: string; name?: string }>(
  operation: (request: Request, params: P) => Promise<Response>,
) {
  return platformRoute(operation, 'group');
}

async function authorizeScope(
  request: Request,
  name: string | undefined,
  kind: 'database' | 'group',
) {
  const group = env.LOCALTURSO_TOKEN_GROUP;
  if (!group) return;
  if (kind === 'group') {
    if (name === undefined)
      assertPlatform(
        request.method === 'GET',
        403,
        'group-scoped token cannot access org-level resources',
      );
    else assertPlatform(name === group, 404, 'group not found');
  } else if (name !== undefined) {
    const record = await databaseQuery.find(await getStore(), name);
    assertPlatform(record.group === group, 404, 'database not found');
  }
}
