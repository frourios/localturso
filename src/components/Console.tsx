'use client';
import { createClient } from '@libsql/client/web';
import { useState } from 'react';
import type { DatabaseDto, GroupDto } from '../schemas/platform';

export function Console() {
  const [org, setOrg] = useState('local');
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [databases, setDatabases] = useState<DatabaseDto[]>([]);
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [selected, setSelected] = useState<DatabaseDto>();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('default');
  const [groupName, setGroupName] = useState('');
  const [sql, setSql] = useState('SELECT name, type FROM sqlite_master');
  const [result, setResult] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function api(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`/v1/organizations/${encodeURIComponent(org)}/${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
    return json;
  }
  async function refresh() {
    const [db, gr] = await Promise.all([api('databases'), api('groups')]);
    setDatabases(db.databases);
    setGroups(gr.groups);
    setConnected(true);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <header>
        <span className="logo">◉</span>
        <div>
          <h1>LocalTurso</h1>
          <p>Your local database platform</p>
        </div>
        <span className="badge">LOCAL</span>
      </header>
      <section className="connection">
        <label>
          Organization
          <input value={org} onChange={(e) => setOrg(e.target.value)} />
        </label>
        <label>
          Platform token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="localturso-platform-token"
          />
        </label>
        <button disabled={busy} onClick={() => run(refresh)}>
          {connected ? 'Refresh' : 'Connect'}
        </button>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {connected && (
        <div className="grid">
          <section>
            <h2>
              Databases <small>{databases.length}</small>
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api('databases', 'POST', { name, group });
                  setName('');
                  await refresh();
                });
              }}
            >
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Database name"
                pattern="[a-z0-9-]+"
                maxLength={64}
              />
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.name}>{g.name}</option>
                ))}
              </select>
              <button disabled={busy}>Create</button>
            </form>
            <div className="list">
              {databases.map((db) => (
                <button
                  className={selected?.DbId === db.DbId ? 'database active' : 'database'}
                  key={db.DbId}
                  onClick={() => {
                    setSelected(db);
                    setResult('');
                    setAuthToken('');
                  }}
                >
                  <strong>{db.Name}</strong>
                  <span>{db.group}</span>
                </button>
              ))}
              {!databases.length && <p className="muted">Create a database to get started.</p>}
            </div>
            <h2>Groups</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api('groups', 'POST', { name: groupName, location: 'local' });
                  setGroupName('');
                  await refresh();
                });
              }}
            >
              <input
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                pattern="[a-z0-9-]+"
                maxLength={64}
              />
              <button disabled={busy}>Create</button>
            </form>
            {groups.map((g) => (
              <div className="group" key={g.uuid}>
                <span>{g.name}</span>
                <small>local</small>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Delete group ${g.name}?`))
                      run(async () => {
                        await api(`groups/${g.name}`, 'DELETE');
                        await refresh();
                      });
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </section>
          <section>
            {selected ? (
              <>
                <div className="title">
                  <h2>{selected.Name}</h2>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Delete ${selected.Name} and all its data?`))
                        run(async () => {
                          await api(`databases/${selected.Name}`, 'DELETE');
                          setSelected(undefined);
                          await refresh();
                        });
                    }}
                  >
                    Delete database
                  </button>
                </div>
                <label>
                  Database URL<code>{`${location.protocol}//${selected.Hostname}`}</code>
                </label>
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const response = await api(
                          `databases/${selected.Name}/auth/tokens`,
                          'POST',
                        );
                        setAuthToken(response.jwt);
                      })
                    }
                  >
                    Generate token
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(`databases/${selected.Name}/auth/rotate`, 'POST');
                        setAuthToken('');
                      })
                    }
                  >
                    Invalidate tokens
                  </button>
                </div>
                {authToken && (
                  <textarea readOnly aria-label="Database auth token" value={authToken} />
                )}
                <h2>SQL console</h2>
                <textarea
                  aria-label="SQL"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  rows={7}
                  spellCheck={false}
                />
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const { jwt } = await api(`databases/${selected.Name}/auth/tokens`, 'POST');
                      const client = createClient({
                        url: `${location.protocol}//${selected.Hostname}`,
                        authToken: jwt,
                      });
                      try {
                        const output = await client.execute(sql);
                        setResult(JSON.stringify(output.toJSON(), null, 2));
                      } finally {
                        client.close();
                      }
                    })
                  }
                >
                  Run SQL
                </button>
                <pre>{result || 'Query results appear here.'}</pre>
              </>
            ) : (
              <div className="empty">
                <h2>Select a database</h2>
                <p>Inspect connection details, generate tokens, and run SQL.</p>
              </div>
            )}
          </section>
        </div>
      )}
      <footer>Platform API and real libSQL · Local development and testing</footer>
    </main>
  );
}
