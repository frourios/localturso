import { getStore } from './drizzleClient';
import { PlatformError } from './platformError';
import { env } from './serverEnvs';
import { publicSigningKey } from './token';
export class LibsqlServer {
  constructor(private adminUrl = env.LIBSQL_ADMIN_URL) {}
  async request(path: string, method: string, body?: unknown) {
    let response: Response;
    try {
      response = await fetch(`${this.adminUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new PlatformError(503, 'libSQL server unavailable');
    }
    if (!response.ok) {
      console.error(
        'libSQL admin request failed',
        method,
        path,
        response.status,
        await response.text(),
      );
      throw new PlatformError(502, 'libSQL server operation failed');
    }
  }
  async create(id: string) {
    return this.request(`/v1/namespaces/${id}/create`, 'POST', {
      jwt_key: await publicSigningKey(await getStore()),
    });
  }
  delete(id: string) {
    return this.request(`/v1/namespaces/${id}`, 'DELETE');
  }
  fork(source: string, target: string) {
    return this.request(`/v1/namespaces/${source}/fork/${target}`, 'POST');
  }
  async configure(id: string, reads: boolean, writes: boolean) {
    return this.request(`/v1/namespaces/${id}/config`, 'POST', {
      block_reads: reads,
      block_writes: writes,
      block_reason: null,
      max_db_size: null,
      heartbeat_url: null,
      jwt_key: await publicSigningKey(await getStore()),
      allow_attach: false,
      txn_timeout_s: null,
      durability_mode: null,
    });
  }
}
