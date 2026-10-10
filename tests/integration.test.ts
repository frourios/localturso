import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient, type Client } from '@libsql/client';
import { createClient as createPlatformClient } from '@tursodatabase/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs against the real App Router and sqld, never a mocked SQL implementation.
describe.skipIf(process.env.RUN_INTEGRATION !== '1')('official SDK + real libSQL', () => {
  const port = Number(process.env.LOCALTURSO_TEST_PORT ?? 5052);
  const origin = `http://127.0.0.1:${port}`;
  const token = 'integration-token';
  const api = createPlatformClient({ org: 'local', token, baseUrl: `${origin}/v1/` });
  let directory: string;
  let server: ChildProcess;
  let output = '';
  const names: string[] = [];
  const clients: Client[] = [];
  async function db(name: string, group = 'default', seed?: string) {
    const result = await api.databases.create(name, {
      group,
      ...(seed ? { seed: { type: 'database', name: seed } } : {}),
    });
    names.push(name);
    return result;
  }
  async function connect(name: string, authToken?: string) {
    const record = await api.databases.get(name);
    const jwt = authToken ?? (await api.databases.createToken(name)).jwt;
    const client = createClient({ url: `http://${record.hostname}`, authToken: jwt });
    clients.push(client);
    return client;
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'localturso-integration-'));
    server = spawn(process.execPath, ['dist/standalone/server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        LOCALTURSO_DATA_DIR: directory,
        LOCALTURSO_PUBLIC_URL: origin,
        LOCALTURSO_ORG: 'local',
        LOCALTURSO_PLATFORM_TOKEN: token,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout?.on('data', (data) => {
      output += data;
    });
    server.stderr?.on('data', (data) => {
      output += data;
    });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${origin}/publicApi/health`)).ok) return;
      } catch {}
      if (server.exitCode !== null) throw new Error(output);
      await delay(200);
    }
    throw new Error(`Server did not become healthy: ${output}`);
  }, 60000);
  afterAll(async () => {
    for (const client of clients) client.close();
    for (const name of [...names].reverse())
      await api.databases.delete(name).catch(() => undefined);
    await api.groups.delete('integration').catch(() => undefined);
    if (server && server.exitCode === null) {
      const closed = once(server, 'exit');
      server.kill('SIGTERM');
      await closed;
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it('routes explicit endpoints, rejects unsupported methods and handles preflight', async () => {
    const headers = { authorization: `Bearer ${token}` };
    for (const path of [
      '/v1/organizations/local/billing',
      '/v1/organizations/local/databases/missing/extra',
      '/db/00000000-0000-0000-0000-000000000000/admin',
    ])
      expect((await fetch(origin + path, { headers })).status).toBe(404);
    expect(
      (await fetch(`${origin}/v1/organizations/local/databases`, { method: 'PUT', headers }))
        .status,
    ).toBe(405);
    expect(
      (await fetch(`${origin}/v1/organizations/local/databases`, { method: 'OPTIONS' })).status,
    ).toBe(204);
    expect(
      (
        await fetch(`${origin}/db/00000000-0000-0000-0000-000000000000/v3/pipeline`, {
          method: 'OPTIONS',
        })
      ).status,
    ).toBe(204);
    expect((await fetch(`${origin}/v1/organizations/other/databases`, { headers })).status).toBe(
      404,
    );
  });
  it('creates resources and executes parameterized SQL, batches and transactions', async () => {
    expect((await api.groups.list())[0]!.name).toBe('default');
    await api.groups.create('integration', 'local');
    await db('integration-a', 'integration');
    const client = await connect('integration-a');
    await client.execute('CREATE TABLE messages (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
    await client.execute({ sql: 'INSERT INTO messages(body) VALUES (?)', args: ['hello'] });
    expect((await client.execute('SELECT body FROM messages')).rows[0]!.body).toBe('hello');
    const tx = await client.transaction('write');
    try {
      await tx.execute("INSERT INTO messages(body) VALUES ('rollback')");
      await tx.rollback();
    } finally {
      tx.close();
    }
    expect((await client.execute('SELECT count(*) AS count FROM messages')).rows[0]!.count).toBe(1);
    const batch = await client.batch(
      [
        { sql: 'INSERT INTO messages(body) VALUES (?)', args: ['batch'] },
        'SELECT count(*) AS count FROM messages',
      ],
      'write',
    );
    expect(batch[1]!.rows[0]!.count).toBe(2);
  });
  it('forks SQL data and isolates subsequent writes', async () => {
    await db('integration-branch', 'integration', 'integration-a');
    const branch = await connect('integration-branch');
    expect((await branch.execute('SELECT count(*) AS count FROM messages')).rows[0]!.count).toBe(2);
    await branch.execute("INSERT INTO messages(body) VALUES ('branch')");
    expect(
      (await (await connect('integration-a')).execute('SELECT count(*) AS count FROM messages'))
        .rows[0]!.count,
    ).toBe(2);
  });
  it('enforces read-only tokens inside libSQL and rejects cross-database tokens', async () => {
    const { jwt } = await api.databases.createToken('integration-a', {
      authorization: 'read-only',
    });
    const readOnly = await connect('integration-a', jwt);
    expect((await readOnly.execute('SELECT count(*) AS count FROM messages')).rows[0]!.count).toBe(
      2,
    );
    await expect(
      readOnly.execute("INSERT INTO messages(body) VALUES ('forbidden')"),
    ).rejects.toThrow();
    await expect((await connect('integration-branch', jwt)).execute('SELECT 1')).rejects.toThrow();
  });
  it('supports group tokens, token rotation, and deletion', async () => {
    const { jwt } = await api.groups.createToken('integration');
    await expect((await connect('integration-a', jwt)).execute('SELECT 1')).resolves.toBeDefined();
    await expect(
      (await connect('integration-branch', jwt)).execute('SELECT 1'),
    ).resolves.toBeDefined();
    await api.groups.rotateTokens('integration');
    await expect((await connect('integration-a', jwt)).execute('SELECT 1')).rejects.toThrow();
    const scoped = (await api.databases.createToken('integration-a')).jwt;
    await api.databases.rotateTokens('integration-a');
    await expect((await connect('integration-a', scoped)).execute('SELECT 1')).rejects.toThrow();
  });
  it('enforces database write blocks and protects deletion', async () => {
    const config = `${origin}/v1/organizations/local/databases/integration-a/configuration`;
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    expect(
      (
        await fetch(config, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ block_writes: true, delete_protection: true }),
        })
      ).status,
    ).toBe(200);
    const client = await connect('integration-a');
    await expect(client.execute('SELECT 1')).resolves.toBeDefined();
    await expect(client.execute("INSERT INTO messages(body) VALUES ('blocked')")).rejects.toThrow();
    await expect(api.databases.delete('integration-a')).rejects.toThrow();
    expect(
      (
        await fetch(config, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ block_writes: false, delete_protection: false }),
        })
      ).status,
    ).toBe(200);
  });
});
