import { eq } from 'drizzle-orm';
import { importJWK, SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { groupQuery } from '../domain/group/store/groupQuery';
import type { Store } from './drizzleClient';
import { assertPlatform, PlatformError } from './platformError';
import { settings, type DatabaseRecord, type GroupRecord } from './schema';

export function expirationSeconds(value: string): number | undefined {
  if (value === 'never') return undefined;
  const parts = [...value.matchAll(/(\d+)([wdhms])/g)];
  assertPlatform(
    parts.length > 0 && parts.map((p) => p[0]).join('') === value,
    400,
    'Invalid expiration format',
  );
  const units: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  const seconds = parts.reduce((n, p) => n + Number(p[1]) * units[p[2]!], 0);
  assertPlatform(Number.isSafeInteger(seconds) && seconds > 0, 400, 'Invalid expiration format');
  return seconds;
}
async function signingKey(store: Store, publicOnly = false) {
  const [key] = await store.db.select().from(settings).where(eq(settings.key, 'jwt-private-key'));
  const jwk = JSON.parse(key!.value);
  if (publicOnly) delete jwk.d;
  return importJWK(jwk, 'EdDSA');
}
export async function createToken(
  store: Store,
  record: DatabaseRecord | GroupRecord,
  expiration: string,
  authorization: string,
) {
  const ttl = expirationSeconds(expiration);
  const group = 'group' in record ? await groupQuery.find(store, record.group) : record;
  const payload: JWTPayload = {
    a: authorization === 'read-only' ? 'ro' : 'rw',
    group_id: group.id,
    group_version: group.tokenVersion,
    ...('group' in record ? { database_id: record.id, database_version: record.tokenVersion } : {}),
  };
  let token = new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer('localturso')
    .setIssuedAt();
  if (ttl !== undefined) token = token.setExpirationTime(Math.floor(Date.now() / 1000) + ttl);
  return token.sign(await signingKey(store));
}
export async function authorizeDatabase(
  store: Store,
  record: DatabaseRecord,
  authorization: string | null,
) {
  assertPlatform(
    authorization !== null && authorization.startsWith('Bearer '),
    401,
    'missing database auth token',
  );
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(authorization.slice(7), await signingKey(store, true), {
      issuer: 'localturso',
      algorithms: ['EdDSA'],
    }));
  } catch {
    throw new PlatformError(401, 'invalid or expired database auth token');
  }
  const group = await groupQuery.find(store, record.group);
  assertPlatform(
    payload.group_id === group.id && payload.group_version === group.tokenVersion,
    401,
    'invalidated or wrong group token',
  );
  if (payload.database_id !== undefined) {
    assertPlatform(
      payload.database_id === record.id && payload.database_version === record.tokenVersion,
      401,
      'invalidated or wrong database token',
    );
  }
  assertPlatform(payload.a === 'rw' || payload.a === 'ro', 401, 'invalid token permissions');
  return payload;
}

export async function publicSigningKey(store: Store): Promise<string> {
  const [key] = await store.db.select().from(settings).where(eq(settings.key, 'jwt-private-key'));
  return JSON.parse(key!.value).x;
}
