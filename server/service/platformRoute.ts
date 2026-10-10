import { nameSchema } from '../../src/schemas/platform';
import { authorizePlatform, handle } from './http';
import { assertPlatform } from './platformError';
import { env } from './serverEnvs';

export type RouteContext<P> = { params: Promise<P> };

// Route modules declare their methods and operations; this wrapper only handles shared validation.
export function platformRoute<P extends { org?: string; name?: string } = Record<string, never>>(
  operation: (request: Request, params: P) => Promise<Response>,
) {
  return (request: Request, context: RouteContext<P>) =>
    handle(async () => {
      authorizePlatform(request);
      const params = await context.params;
      if (params.org !== undefined)
        assertPlatform(params.org === env.LOCALTURSO_ORG, 404, 'organization not found');
      if (params.name !== undefined) nameSchema.parse(params.name);
      return operation(request, params);
    });
}
