# LocalTurso

A local Turso Platform API emulator with a database console and real libSQL execution.

Create tenant databases, mint database or group tokens, run SQL, fork databases, and tear everything down without a Turso Cloud account.

## Start with Docker

Save the following as `compose.yml` in any directory. Docker Compose is the only prerequisite; the configuration works as-is without additional files or a Turso account.

`compose.yml`

```yaml
services:
  localturso:
    image: frourio/localturso:latest
    ports:
      - '5050:5050'
    environment:
      LOCALTURSO_ORG: ${LOCALTURSO_ORG:-local}
      LOCALTURSO_PLATFORM_TOKEN: ${LOCALTURSO_PLATFORM_TOKEN:-localturso-platform-token}
      LOCALTURSO_PUBLIC_URL: ${LOCALTURSO_PUBLIC_URL:-http://127.0.0.1:5050}
      LIBSQL_URL: http://libsql:8080
      LIBSQL_ADMIN_URL: http://libsql:8081
    volumes:
      - platform:/usr/src/app/data
    depends_on:
      libsql:
        condition: service_started
  libsql:
    image: ghcr.io/tursodatabase/libsql-server@sha256:6dd3eb276d9d3604e4a48ac4a999a2e267814732d57d7e94c04ba71482333a67
    command:
      [
        'sqld',
        '--enable-namespaces',
        '--disable-default-namespace',
        '--http-listen-addr',
        '0.0.0.0:8080',
        '--admin-listen-addr',
        '0.0.0.0:8081',
      ]
    volumes:
      - databases:/var/lib/sqld
volumes:
  platform:
  databases:
```

Run this command from the same directory:

```sh
docker compose up -d
```

Open <http://127.0.0.1:5050>. Connect with organization `local` and platform token `localturso-platform-token`. The console can create databases and groups, issue/invalidate tokens, run SQL, and delete resources.

The compose stack has two services: LocalTurso (API, UI, authenticated SQL gateway) and libSQL Server (SQL engine and namespace admin API). Only LocalTurso's port is published. Both metadata/signing keys and SQL databases are persisted in named volumes. `docker compose down` preserves them; `docker compose down -v` removes them.

The Compose example uses the [`frourio/localturso`](https://hub.docker.com/r/frourio/localturso) Docker image. The libSQL image is pinned by digest to the version verified by integration tests.

## Connect from a Next.js service

Install the same SDKs used with Turso Cloud:

```sh
npm install @tursodatabase/api @libsql/client
```

Use a configurable Platform API base URL and database URL scheme in your server-side code:

```ts
import { createClient } from '@libsql/client';
import { createClient as createPlatformClient } from '@tursodatabase/api';

const platform = createPlatformClient({
  org: process.env.TURSO_ORG!,
  token: process.env.TURSO_PLATFORM_TOKEN!,
  baseUrl: process.env.TURSO_PLATFORM_URL ?? 'https://api.turso.tech/v1/',
});

const database = await platform.databases.create('tenant-example', { group: 'default' });
const { jwt } = await platform.databases.createToken(database.name);
const db = createClient({
  url: `${process.env.TURSO_DATABASE_SCHEME ?? 'libsql'}://${database.hostname}`,
  authToken: jwt,
});

try {
  await db.execute('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, body TEXT)');
  await db.execute({ sql: 'INSERT INTO messages(body) VALUES (?)', args: ['hello'] });
  console.log((await db.execute('SELECT * FROM messages')).rows);
} finally {
  db.close();
  await platform.databases.delete(database.name);
}
```

Local `.env.local` in the consuming Next.js application:

```dotenv
TURSO_ORG=local
TURSO_PLATFORM_TOKEN=localturso-platform-token
TURSO_PLATFORM_URL=http://127.0.0.1:5050/v1/
TURSO_DATABASE_SCHEME=http
```

Keep the trailing slash in the Platform API base URL. LocalTurso returns a `Hostname` containing an HTTP gateway path and trailing slash (`127.0.0.1:5050/db/<uuid>/`), rather than Turso Cloud's DNS-only hostname. Preserve this path and slash when creating the SQL client. Use `http://` for the local endpoint; `libsql://` defaults to TLS.

For an application running in another container, set `LOCALTURSO_PUBLIC_URL=http://localturso:5050` and use that same address for the consumer's `TURSO_PLATFORM_URL`. The public URL must be reachable by the SQL client. Platform API tokens and database tokens have separate roles; use only the database/group token for SQL requests.

## Drizzle in the consuming application

```ts
import { drizzle } from 'drizzle-orm/libsql';

// db is the @libsql/client instance from the example above.
const orm = drizzle(db);
```

LocalTurso's own Drizzle schema stores groups, database metadata, token generations, and the persistent Ed25519 signing key. Tenant SQL is always executed by libSQL Server, not by a mocked database or the metadata store.

## Local development

Node.js 22.12+ and Docker Compose are required.

```sh
npm ci
cp .env.example .env
docker compose -f compose.dev.yml up -d
npm run dev
```

The development compose file binds libSQL's SQL and admin ports to loopback only. The application initializes Drizzle migrations and the `default` group on first use. `npm run db:migrate` can initialize metadata explicitly. Generate schema changes with `npm run db:generate` and commit the generated migrations.

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
```

`npm test` runs isolated metadata/API tests and skips the Docker-dependent suite. `test:integration` builds and starts the real production App Router server on port 5052, uses temporary metadata, connects to the development libSQL server, and exercises the official Turso SDK plus `@libsql/client`. It deletes its tenant databases afterward. Start the development compose stack first. Override the integration port with `LOCALTURSO_TEST_PORT` if needed.

## Configuration

| Variable                    | Default                     | Purpose                                    |
| --------------------------- | --------------------------- | ------------------------------------------ |
| `PORT`                      | `5050` in Docker            | Production HTTP listen port                |
| `HOST`                      | `0.0.0.0`                   | Production listen address                  |
| `LOCALTURSO_ORG`            | `local`                     | Single local organization slug             |
| `LOCALTURSO_PLATFORM_TOKEN` | `localturso-platform-token` | Bearer credential for Platform API         |
| `LOCALTURSO_PUBLIC_URL`     | `http://127.0.0.1:5050`     | URL used to generate SQL client endpoints  |
| `LOCALTURSO_DATA_DIR`       | `./data`                    | Drizzle metadata and signing-key directory |
| `LIBSQL_URL`                | `http://127.0.0.1:8080`     | Internal libSQL SQL endpoint               |
| `LIBSQL_ADMIN_URL`          | `http://127.0.0.1:8081`     | Internal namespace admin endpoint          |

## API coverage

LocalTurso implements a subset of the Turso **v1 Platform API**, using the official [OpenAPI specification](https://github.com/tursodatabase/turso-docs/blob/main/api-reference/openapi.json) and verifying it against `@tursodatabase/api`.

Every Platform route requires `Authorization: Bearer <platform-token>`. Resource routes are under `/v1/organizations/<LOCALTURSO_ORG>`.

| Resource                 | Routes                                                                                 | Behavior                                                         |
| ------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Organizations            | `GET /v1/organizations`, `GET /v1/organizations/:org`                                  | Configured single local organization                             |
| Locations                | `GET /v1/locations`                                                                    | `local` only                                                     |
| Databases                | `GET/POST /databases`, `GET/DELETE /databases/:name`                                   | Persistent metadata + real libSQL namespaces                     |
| Database filtering       | `GET /databases?group=...&parent=...`                                                  | Group name and parent DB UUID filters                            |
| Forks                    | `POST /databases` with `seed: { type: "database", name: "source" }`                    | Real sqld fork; independent subsequent writes                    |
| DB configuration         | `GET/PATCH /databases/:name/configuration`                                             | `block_reads`, `block_writes`, `delete_protection`               |
| DB tokens                | `POST /databases/:name/auth/tokens`                                                    | Ed25519 JWT, DB scope, expiration, read-only/full-access         |
| DB token invalidation    | `POST /databases/:name/auth/rotate`                                                    | Invalidates all DB-scoped tokens; group tokens remain valid      |
| Groups                   | `GET/POST /groups`, `GET/DELETE /groups/:name`                                         | Local metadata with default group                                |
| Group configuration      | `GET/PATCH /groups/:name/configuration`                                                | `delete_protection`; also protects member DB deletion            |
| Group tokens             | `POST /groups/:name/auth/tokens`                                                       | Access to every current/future DB in that group                  |
| Group token invalidation | `POST /groups/:name/auth/rotate`                                                       | Invalidates group tokens and DB tokens in the group              |
| SQL gateway              | `POST /db/:uuid/v2/pipeline`, `POST /db/:uuid/v3/pipeline`, `POST /db/:uuid/v3/cursor` | Delegates SQL and transaction behavior to sqld                   |
| SQL metadata/export      | `GET /db/:uuid/version`, `/health`, `/dump`                                            | Delegated to sqld; requires DB/group token                       |
| Health                   | `GET /publicApi/health`                                                                | Checks metadata and libSQL admin connectivity; no token required |

Token endpoints accept `?expiration=never` (default) or compound durations such as `1w2d6h30m`, and `?authorization=full-access` (default) or `read-only`. Default SDK permission bodies with an empty `read_attach.databases` array are accepted. Custom attach permissions are rejected with 501.

Database create/retrieve/list responses preserve Turso's `Name`, `DbId`, `Hostname` casing. The official SDK maps them to `name`, `id`, `hostname`. Deletion returns `{ database: "name" }`. Token issuance returns `{ jwt: "..." }`. Token rotation returns `{}` so the official SDK can parse the response.

### Deliberate differences and limits

- The SQL `Hostname` contains the gateway path and trailing slash. Construct `http://<hostname>` locally and preserve the path. No wildcard DNS or TLS certificate is needed.
- Only the configured organization and the `local` region exist. Group locations are logical metadata; no geographic replicas are started.
- Group deletion requires an empty group (409 otherwise). Delete member DBs explicitly first.
- Groups persist until explicitly deleted. If the `default` group is deleted, initialization recreates it on the next process start.
- DB recreation uses a fresh UUID, preventing old DB-scoped tokens from being reused. Group tokens intentionally cover newly created DBs in their group.
- SQL supports HTTP JSON Hrana, not WebSocket/protobuf, embedded replica sync, or Turso's newer database engine/sync protocol.
- Cursor responses are buffered while their routing header is rewritten; this is intended for local tests, not large production exports.
- Historical point-in-time forks, upload seeds, shared schema databases, remote encryption, size limits, IP/VPC access policies, billing/usage accounting, instances, team members, invites, API-token lifecycle, and v2/v3 Platform APIs are not implemented.
- Undefined endpoints return 404, and unsupported HTTP methods on defined routes return 405. Unsupported input fields return 400; unsupported token permissions return 501.
- The app runs as a single process. Control-plane mutations are serialized in that process. Namespace operations and metadata updates span two stores and cannot form a distributed transaction. Creation compensates for ordinary metadata write failures; crashes between operations may leave orphan namespaces or stale metadata. This is a test emulator, not a replacement for Turso Cloud's control plane.
- Keep the metadata and SQL volumes together when backing up or restoring. Losing metadata also loses signing keys and the mapping to namespaces.
- libSQL's admin port must remain private. The compose stack publishes only the authenticated application gateway; accessing sqld directly bypasses LocalTurso's token invalidation and scope checks.

## Architecture

```text
Next.js service / official Turso SDK / browser console
                 |
                 v
       LocalTurso (vinext App Router)
       |                         |
       | Platform API            | SQL gateway
       v                         v
  Zod validation          JWT scope/epoch verification
  domain use cases               |
  query / command                | SQL + original JWT
       |                         v
       v                 libSQL Server (sqld)
  Drizzle + libSQL       per-database namespace
  platform.db            JWT read-only enforcement
       |                 real SQL / transactions / fork
       v                         |
  platform volume                v
                           databases volume
```

This follows Magnito's separation of React UI and App Router handlers from server domain logic. Prisma is replaced with Drizzle's libSQL adapter.

- `src/app`: Platform API, SQL gateway, health routes, and console entry. Each endpoint declares its HTTP methods in a separate `route.ts`:
  - `v1/locations` and `v1/organizations`: location and organization listings.
  - `v1/organizations/[org]`: organization retrieval.
  - `v1/organizations/[org]/databases` and `groups`: resource listings and creation.
  - Each resource's `[name]`, `configuration`, `auth/tokens`, and `auth/rotate`: retrieval/deletion, configuration, token issuance, and token invalidation.
  - `db/[id]/v2/{pipeline,cursor}`, `db/[id]/v3/{pipeline,cursor}`, and `db/[id]/{version,health,dump}`: SQL gateway endpoints.
  - `publicApi/health`: application health.
    Route handlers use App Router's `params` and can be imported directly in unit tests. `server/service/platformRoute.ts` shares Platform authentication, parameter validation, and error handling; the SQL proxy receives a fixed endpoint from each route module.
- `src/components`: Browser console using the same API as external consumers.
- `src/schemas`: Zod request validation and public DTO types.
- `server/domain/database` and `server/domain/group`: model factories, use cases, commands, queries, and DTO conversion.
- `server/service`: environment validation, Drizzle initialization, serialization, JWT handling, HTTP errors, libSQL admin adapter, and SQL proxy.
- `drizzle`: checked-in metadata migrations.
- `tests`: isolated metadata/API tests and SDK integration tests against real sqld and the built production server.

Database names are validated separately from namespace IDs. Each database is backed by an immutable UUID namespace. SQL clients address `/db/<uuid>/`; the proxy looks up that UUID in the metadata, verifies DB/group claims and token generations, and sets `x-namespace` itself when forwarding to sqld. Client-provided routing headers are never forwarded.

The metadata volume holds one persistent Ed25519 signing key. Each namespace trusts its public key. LocalTurso checks the additional DB/group scope and generation claims; sqld checks the signature and the `a=ro/rw` permission itself. Token invalidation increments persistent generation counters and is enforced on every gateway request, including an existing transaction's next request.

The SQL gateway preserves Hrana batons and rewrites any upstream `base_url` to the public gateway URL. Multi-request transactions therefore stay on the same namespace and continue to pass through authorization.

## License

[MIT](LICENSE)
