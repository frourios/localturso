import { getStore } from '../../../../server/service/drizzleClient';
import { handle, json } from '../../../../server/service/http';
import { PlatformError } from '../../../../server/service/platformError';
import { env } from '../../../../server/service/serverEnvs';
export const GET = () =>
  handle(async () => {
    await (await getStore()).client.execute('SELECT 1');
    try {
      const response = await fetch(env.LIBSQL_ADMIN_URL, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('unhealthy');
    } catch {
      throw new PlatformError(503, 'libSQL server unavailable');
    }
    return json({ status: 'ok', name: 'LocalTurso', organization: env.LOCALTURSO_ORG });
  });
