const org = process.env.TURSO_ORG,
  token = process.env.TURSO_PLATFORM_TOKEN,
  group = process.env.TURSO_GROUP;
if (!org || !token || !group) throw new Error('Missing development Turso credentials');
const base = `https://api.turso.tech/v1/organizations/${encodeURIComponent(org)}`;
const prefix = `ltprobe-${Date.now().toString(36)}-`;
const owned = new Set();
const results = [];
function safe(value) {
  if (typeof value === 'string') {
    for (const secret of [token, org, group]) value = value.replaceAll(secret, '[redacted]');
    value = value.replaceAll(prefix, '[probe]-');
    return value;
  }
  if (Array.isArray(value)) return value.map(safe);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !['jwt', 'Hostname', 'DbId'].includes(k))
        .map(([k, v]) => [k, safe(v)]),
    );
  return value;
}
async function call(path, method = 'GET', body) {
  const r = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await r.json().catch(() => undefined);
  return { status: r.status, json };
}
async function create(label, name, extra = {}) {
  const r = await call('/databases', 'POST', { name, group, ...extra });
  if (r.status === 200) owned.add(name);
  results.push({ label, status: r.status, ...(r.status === 200 ? {} : { body: safe(r.json) }) });
  return r;
}
async function remove(name) {
  try {
    const r = await call(`/databases/${encodeURIComponent(name)}`, 'DELETE');
    if (r.status === 200 || r.status === 404) owned.delete(name);
    else results.push({ label: 'cleanup', status: r.status, body: safe(r.json) });
  } catch {
    results.push({ label: 'cleanup', status: 'network-error' });
  }
}

try {
  const g = await call(`/groups/${encodeURIComponent(group)}`);
  results.push({ label: 'configured-group', status: g.status });
  if (g.status !== 200) throw new Error('Configured development group unavailable');
  if (g.json?.group?.delete_protection)
    throw new Error('Probe requires a development group without delete protection');
  for (const n of [32, 48, 52, 56, 57, 61, 64]) {
    const name = prefix + 'a'.repeat(n - prefix.length);
    await create(`database-name-length-${n}`, name);
    if (owned.has(name)) await remove(name);
  }
  for (const [label, name] of [
    ['uppercase', prefix + 'A'],
    ['underscore', prefix + 'a_b'],
    ['leading-hyphen', '-' + prefix + 'a'],
    ['trailing-hyphen', prefix + 'a-'],
  ]) {
    await create(label, name);
    if (owned.has(name)) await remove(name);
  }
  await create('missing-group', prefix + 'missing', { group: prefix + 'absent' });
  await create('missing-group-field', prefix + 'default', { group: undefined });
  if (owned.has(prefix + 'default')) await remove(prefix + 'default');
  const name = prefix + 'main';
  const c = await create('valid-create', name);
  if (c.status === 200) {
    await create('duplicate-create', name);
    const get = await call('/databases/' + name);
    results.push({
      label: 'retrieve',
      status: get.status,
      fields: Object.keys(get.json?.database ?? {}),
    });
    for (const params of [
      'expiration=1h&authorization=full-access',
      'expiration=1h&authorization=read-only',
      'expiration=bad&authorization=full-access',
      'expiration=1h&authorization=bad',
      '',
    ]) {
      const r = await call(`/databases/${name}/auth/tokens${params ? '?' + params : ''}`, 'POST');
      const jwt = r.json?.jwt;
      let claims;
      if (jwt) {
        const decoded = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));
        claims = {
          fields: Object.keys(decoded),
          access: decoded.a,
          expires: decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : null,
        };
      }
      results.push({
        label: 'token-' + (params || 'defaults'),
        status: r.status,
        ...(jwt ? { claims } : { body: safe(r.json) }),
      });
    }
    await remove(name);
    const d = await call('/databases/' + name, 'DELETE');
    results.push({ label: 'delete-missing', status: d.status, body: safe(d.json) });
  }
  const missing = await call('/databases/' + prefix + 'absent');
  results.push({ label: 'get-missing', status: missing.status, body: safe(missing.json) });
} finally {
  for (const name of owned) await remove(name);
  if (owned.size) process.exitCode = 1;
  console.log(
    JSON.stringify(
      { organizationLength: org.length, remainingOwnedDatabases: owned.size, results },
      null,
      2,
    ),
  );
}
