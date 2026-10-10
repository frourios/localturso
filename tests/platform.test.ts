import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const directory = await mkdtemp(join(tmpdir(), 'localturso-unit-'));
process.env.LOCALTURSO_DATA_DIR = directory;
process.env.LOCALTURSO_ORG = 'local';
process.env.LOCALTURSO_PLATFORM_TOKEN = 'unit-token';
// Import the actual route modules so each handler is tested with App Router params.
const databases = await import('../src/app/v1/organizations/[org]/databases/route');
const database = await import('../src/app/v1/organizations/[org]/databases/[name]/route');
const databaseConfiguration =
  await import('../src/app/v1/organizations/[org]/databases/[name]/configuration/route');
const databaseTokens =
  await import('../src/app/v1/organizations/[org]/databases/[name]/auth/tokens/route');
const databaseRotation =
  await import('../src/app/v1/organizations/[org]/databases/[name]/auth/rotate/route');
const groups = await import('../src/app/v1/organizations/[org]/groups/route');
const group = await import('../src/app/v1/organizations/[org]/groups/[name]/route');
const groupConfiguration =
  await import('../src/app/v1/organizations/[org]/groups/[name]/configuration/route');
const groupTokens =
  await import('../src/app/v1/organizations/[org]/groups/[name]/auth/tokens/route');
const groupRotation =
  await import('../src/app/v1/organizations/[org]/groups/[name]/auth/rotate/route');
const organizations = await import('../src/app/v1/organizations/route');
const organization = await import('../src/app/v1/organizations/[org]/route');
const locations = await import('../src/app/v1/locations/route');
const pipeline = await import('../src/app/db/[id]/v2/pipeline/route');
type Handler = (
  request: Request,
  context: { params: Promise<{ org: string; name: string }> },
) => Promise<Response> | Response;
const routes: Record<string, Record<string, Handler>> = {
  databases,
  'databases/:name': database,
  'databases/:name/configuration': databaseConfiguration,
  'databases/:name/auth/tokens': databaseTokens,
  'databases/:name/auth/rotate': databaseRotation,
  groups,
  'groups/:name': group,
  'groups/:name/configuration': groupConfiguration,
  'groups/:name/auth/tokens': groupTokens,
  'groups/:name/auth/rotate': groupRotation,
};
const { LibsqlServer } = await import('../server/service/libsqlServer');
const { getStore, createStore } = await import('../server/service/drizzleClient');
const { databaseQuery } = await import('../server/domain/database/store/databaseQuery');
const { authorizeDatabase, expirationSeconds } = await import('../server/service/token');
const root = 'http://127.0.0.1:5050/v1/organizations/local/';
function request(path: string, method = 'GET', body?: unknown, token = 'unit-token') {
  const [resource, name, ...rest] = path.split('?')[0]!.split('/');
  const key = [resource, ...(name ? [':name'] : []), ...rest].join('/');
  const handler = routes[key]?.[method];
  if (!handler) throw new Error(`No test handler for ${method} ${key}`);
  return handler(
    new Request(root + path, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }),
    }),
    {
      params: Promise.resolve({ org: 'local', ...(name ? { name } : {}) } as {
        org: string;
        name: string;
      }),
    },
  );
}
async function body(path: string, method = 'GET', input?: unknown) {
  const response = await request(path, method, input);
  expect(response.status).toBe(200);
  return response.json();
}
beforeAll(() => {
  for (const method of ['create', 'delete', 'fork', 'configure'] as const)
    vi.spyOn(LibsqlServer.prototype, method).mockResolvedValue(undefined);
});
afterAll(async () => {
  vi.restoreAllMocks();
  (await getStore()).client.close();
  await rm(directory, { recursive: true, force: true });
});

describe('Platform API', () => {
  it('exposes organization and location handlers without path parsing', async () => {
    const req = new Request('http://localhost/irrelevant', {
      headers: { authorization: 'Bearer unit-token' },
    });
    expect(await (await organizations.GET(req, { params: Promise.resolve({}) })).json()).toEqual([
      { name: 'LocalTurso', slug: 'local', type: 'personal' },
    ]);
    expect(
      await (await organization.GET(req, { params: Promise.resolve({ org: 'local' }) })).json(),
    ).toMatchObject({ organization: { slug: 'local' } });
    expect(await (await locations.GET(req, { params: Promise.resolve({}) })).json()).toEqual({
      locations: { local: 'Local machine' },
    });
  });
  it('requires platform auth and scopes the organization', async () => {
    expect((await request('databases', 'GET', undefined, 'bad')).status).toBe(401);
    expect(
      (
        await databases.GET(
          new Request(root.replace('/local/', '/other/') + 'databases', {
            headers: { authorization: 'Bearer unit-token' },
          }),
          { params: Promise.resolve({ org: 'other' }) },
        )
      ).status,
    ).toBe(404);
  });
  it('seeds defaults and returns cloud-compatible field names', async () => {
    const result = await body('groups');
    expect(result.groups[0]).toMatchObject({
      name: 'default',
      primary: 'local',
      locations: ['local'],
    });
    const created = await body('databases', 'POST', { name: 'tenant-a' });
    expect(created.database).toEqual({
      Name: 'tenant-a',
      DbId: expect.any(String),
      Hostname: expect.stringContaining('/db/'),
    });
    expect((await body('databases/tenant-a')).database).toMatchObject({
      Name: 'tenant-a',
      group: 'default',
      block_reads: false,
    });
  });
  it('rejects duplicates, missing groups, invalid names, and unsupported options', async () => {
    expect((await request('databases', 'POST', { name: 'tenant-a' })).status).toBe(409);
    expect(
      (await request('databases', 'POST', { name: 'tenant-x', group: 'missing' })).status,
    ).toBe(400);
    expect((await request('databases', 'POST', { name: '../escape' })).status).toBe(400);
    expect(
      (await request('databases', 'POST', { name: 'encrypted', remote_encryption: {} })).status,
    ).toBe(400);
    expect((await request('databases/missing')).status).toBe(404);
  });
  it('serializes concurrent creates', async () => {
    const responses = await Promise.all([
      request('databases', 'POST', { name: 'racing' }),
      request('databases', 'POST', { name: 'racing' }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it('leaves metadata unchanged when namespace creation fails', async () => {
    vi.mocked(LibsqlServer.prototype.create).mockRejectedValueOnce(new Error('backend failed'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect((await request('databases', 'POST', { name: 'failed' })).status).toBe(500);
    } finally {
      error.mockRestore();
    }
    expect((await request('databases/failed')).status).toBe(404);
    await body('databases', 'POST', { name: 'after-failure' });
  });
  it('forks through sqld and filters branches by parent', async () => {
    const parent = (await body('databases/tenant-a')).database;
    const fork = await body('databases', 'POST', {
      name: 'branch',
      group: 'default',
      seed: { type: 'database', name: 'tenant-a' },
    });
    expect(LibsqlServer.prototype.fork).toHaveBeenCalledWith(parent.DbId, fork.database.DbId);
    expect(
      (await body(`databases?parent=${parent.DbId}`)).databases.map(
        (db: { Name: string }) => db.Name,
      ),
    ).toEqual(['branch']);
  });
  it('enforces database and group deletion protection', async () => {
    await body('databases/tenant-a/configuration', 'PATCH', { delete_protection: true });
    expect((await request('databases/tenant-a', 'DELETE')).status).toBe(400);
    await body('databases/tenant-a/configuration', 'PATCH', { delete_protection: false });
    await body('groups/default/configuration', 'PATCH', { delete_protection: true });
    expect((await request('databases/tenant-a', 'DELETE')).status).toBe(400);
    await body('groups/default/configuration', 'PATCH', { delete_protection: false });
  });
  it('accepts the official SDK default token body and rejects custom permissions', async () => {
    const jwt = (
      await body('databases/tenant-a/auth/tokens?authorization=read-only&expiration=1h', 'POST', {
        permissions: { read_attach: { databases: [] } },
      })
    ).jwt;
    expect(decodeJwt(jwt)).toMatchObject({ a: 'ro', exp: expect.any(Number) });
    expect(
      (
        await request('databases/tenant-a/auth/tokens', 'POST', {
          permissions: { read_attach: { databases: ['branch'] } },
        })
      ).status,
    ).toBe(501);
    expect(
      (await request('databases/tenant-a/auth/tokens?authorization=admin', 'POST')).status,
    ).toBe(400);
    expect(
      (await request('databases/tenant-a/auth/tokens?expiration=garbage', 'POST')).status,
    ).toBe(400);
  });
  it('rejects tokens for a different DB, expired tokens, and invalidated DB tokens', async () => {
    const store = await getStore();
    const a = await databaseQuery.find(store, 'tenant-a');
    const branch = await databaseQuery.find(store, 'branch');
    const { jwt } = await body('databases/tenant-a/auth/tokens', 'POST');
    await expect(authorizeDatabase(store, a, `Bearer ${jwt}`)).resolves.toMatchObject({
      database_id: a.id,
    });
    await expect(authorizeDatabase(store, branch, `Bearer ${jwt}`)).rejects.toMatchObject({
      status: 401,
    });
    await expect(authorizeDatabase(store, a, 'Bearer invalid')).rejects.toMatchObject({
      status: 401,
    });
    const now = Date.now();
    const expiring = (await body('databases/tenant-a/auth/tokens?expiration=1s', 'POST')).jwt;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now + 10000);
    try {
      await expect(authorizeDatabase(store, a, `Bearer ${expiring}`)).rejects.toMatchObject({
        status: 401,
      });
    } finally {
      vi.useRealTimers();
    }
    await body('databases/tenant-a/auth/rotate', 'POST');
    await expect(
      authorizeDatabase(store, await databaseQuery.find(store, a.name), `Bearer ${jwt}`),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('scopes group tokens and invalidates both DB and group tokens on group rotation', async () => {
    await body('groups', 'POST', { name: 'other', location: 'local' });
    await body('databases', 'POST', { name: 'tenant-b', group: 'other' });
    const store = await getStore();
    const { jwt } = await body('groups/default/auth/tokens', 'POST');
    const dbToken = (await body('databases/tenant-a/auth/tokens', 'POST')).jwt;
    const a = await databaseQuery.find(store, 'tenant-a');
    await expect(authorizeDatabase(store, a, `Bearer ${jwt}`)).resolves.toMatchObject({ a: 'rw' });
    await expect(
      authorizeDatabase(store, await databaseQuery.find(store, 'tenant-b'), `Bearer ${jwt}`),
    ).rejects.toMatchObject({ status: 401 });
    await body('groups/default/auth/rotate', 'POST');
    for (const token of [jwt, dbToken])
      await expect(authorizeDatabase(store, a, `Bearer ${token}`)).rejects.toMatchObject({
        status: 401,
      });
  });
  it('persists metadata and the signing key across reopening', async () => {
    const store = await getStore();
    const token = (await body('databases/tenant-a/auth/tokens', 'POST')).jwt;
    const reopened = await createStore(directory);
    try {
      expect((await databaseQuery.list(reopened)).length).toBeGreaterThan(0);
      await expect(
        authorizeDatabase(
          reopened,
          await databaseQuery.find(reopened, 'tenant-a'),
          `Bearer ${token}`,
        ),
      ).resolves.toMatchObject({ a: 'rw' });
    } finally {
      reopened.client.close();
    }
    expect(store.client.closed).toBe(false);
  });
  it('removes resources and prevents stale tokens from accessing recreated DBs', async () => {
    const store = await getStore();
    const old = await databaseQuery.find(store, 'tenant-b');
    const token = (await body('databases/tenant-b/auth/tokens', 'POST')).jwt;
    expect((await request('groups/other', 'DELETE')).status).toBe(409);
    await body('databases/tenant-b', 'DELETE');
    await body('databases', 'POST', { name: 'tenant-b', group: 'other' });
    const fresh = await databaseQuery.find(store, 'tenant-b');
    expect(fresh.id).not.toBe(old.id);
    await expect(authorizeDatabase(store, fresh, `Bearer ${token}`)).rejects.toMatchObject({
      status: 401,
    });
    await body('databases/tenant-b', 'DELETE');
    await body('groups/other', 'DELETE');
  });
  it('handles malformed JSON and allows preflight without credentials', async () => {
    expect(
      (
        await databases.POST(
          new Request(root + 'databases', {
            method: 'POST',
            headers: { authorization: 'Bearer unit-token' },
            body: '{',
          }),
          { params: Promise.resolve({ org: 'local' }) },
        )
      ).status,
    ).toBe(400);
    expect(databases.OPTIONS().status).toBe(204);
  });
  it('refuses SQL without a database token', async () => {
    const record = await databaseQuery.find(await getStore(), 'tenant-a');
    expect(
      (
        await pipeline.POST(
          new Request(`http://localhost/db/${record.id}/v2/pipeline`, {
            method: 'POST',
            body: '{}',
          }),
          { params: Promise.resolve({ id: record.id }) },
        )
      ).status,
    ).toBe(401);
  });
});

describe('token expiration', () => {
  it('parses compound durations and rejects partial or unsafe values', () => {
    expect(expirationSeconds('never')).toBeUndefined();
    expect(expirationSeconds('1w2d3h4m5s')).toBe(788645);
    for (const value of ['0s', '1hour', '-1s', '', '9007199254740992w'])
      expect(() => expirationSeconds(value)).toThrow();
  });
});
