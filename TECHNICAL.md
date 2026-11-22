# whatsapp-decrypt — developer notes

Companion to [README.md](README.md). Everything below is grounded in the
analyst report for this repo; claims the report could not resolve are marked
`UNKNOWN — requires human input`.

## Stack

Exact resolved versions come from `package-lock.json` (lockfileVersion 3), not
the caret ranges in `package.json`. The manifest states a minimum; the lockfile
is what actually resolves.

- Express 5.1.0 (`package-lock.json:852-855`) and TypeScript 5.8.3 (`package-lock.json:2436-2439`).
- `sqlite3` 5.1.7 (`package-lock.json:2206`) behind the `sqlite` 5.1.1 wrapper (`package-lock.json:2200`); `cors` 2.8.5 (`package-lock.json:631`); `ts-node` 10.x (`package-lock.json:2366`); `@types/node` 24.0.3 (`package-lock.json:207`).
- Node 24 across build, deps and runtime stages (`Dockerfile:1,9,14`). This is pinned by the base image, not by a `package.json` `engines` field, which is absent (`package-lock.json` / manifest note).
- Build is `npm run build` → `tsc`, target ES2020, commonjs, output to `dist/` (`package.json:7`, `tsconfig.json:3-9`); the compiled `dist/` is copied into the runtime image (`Dockerfile:24`).

No manifest/lockfile version disagreements were found; the caret ranges resolve
to the exact versions above (`package.json:14-25`).

## Architecture

There is no front controller or static document root — this is a JSON API only.
The single entry point is `dist/index.js` (`package.json:5`, `src/index.ts:318-350`,
`Dockerfile:28`). A foreground Node process calls `initializeDatabase`, which
opens the supplied SQLite file read-only (`sqlite3.OPEN_READONLY`,
`src/index.ts:273-286`) before `app.listen` (`src/index.ts:292`); a bad path calls
`process.exit(1)` during boot (`src/index.ts:304-307,330-333`).

Routing is inline in `WhatsAppAPI.setupRoutes` (`src/index.ts:21-271`);
`src/routes.ts` is empty (0 lines). Global middleware is only `cors()` and
`express.json()` (`src/index.ts:16-19`). Seven source GET routes plus one
build-injected `GET /` shim make eight runtime endpoints:

- `/chats`, `/group-chats`, `/contact-chats` — chat lists joined to `jid` and last `message` (`src/index.ts:24-55,59-91,95-126`).
- `/chat/:id` — paginated messages for one chat (`?page`, `?limit`, default 100) with media and quoted fields (`src/index.ts:130-184`).
- `/calls` — paginated call log (`?page`, `?limit`, default 50) (`src/index.ts:188-231`).
- `/health` — liveness plus `database: connected|disconnected` (`src/index.ts:234-240`).
- `/stats` — `COUNT(*)` over chat, message and call_log (`src/index.ts:244-270`).
- `/` — `{"success":true}` with HTTP 200, injected into compiled output by `sed` (`Dockerfile:7`, `CONTAINERIZE.md:28`); it does not exist in source.

No background work: no cron, jobs, queues, `setInterval`, or outbound HTTP calls
were found (inventory `queue_scheduler:false`). The Python utilities do local
AES/zlib decryption only (`main.py:9,110-121`, `decrypt_media.py:3,32-54`).

## Data model

Every table belongs to WhatsApp's own `msgstore.db` schema. The repo has **no
migration and no SQL dump**; the shape is inferred only from inline `SELECT`s in
`src/index.ts` and the interfaces in `src/types/*.ts`. The exact production
schema and version is `UNKNOWN — requires human input`.

| Table | Key columns (as evidenced) | Relationships |
|---|---|---|
| `chat` | `_id`, `jid_row_id`, `subject`, `sort_timestamp`, `last_message_row_id` | `jid_row_id` → `jid._id`; `last_message_row_id` → `message._id` (`src/index.ts:36,70,106,250`) |
| `jid` | `_id`, `user`, `raw_string` | Joined from `chat` and `call_log`; `%g.us` suffix marks groups (`src/index.ts:37,71,107,206`) |
| `message` | `_id`, `chat_row_id`, `text_data`, `key_id`, `from_me`, `timestamp`, `message_type` | `chat_row_id` → `chat._id`; `_id` → `message_media` / `message_quoted` (`src/index.ts:38,72,108,154,163,251`) |
| `message_media` | `message_row_id`, `file_path` | LEFT JOIN from `message._id` (`src/index.ts:155`) |
| `message_quoted` | `message_row_id`, `text_data`, `from_me`, `key_id` | LEFT JOIN from `message._id` (`src/index.ts:156`) |
| `call_log` | `_id`, `from_me`, `timestamp`, `video_call`, `duration`, `jid_row_id` | LEFT JOIN `jid_row_id` → `jid._id` (`src/index.ts:205,211,252`) |

All six tables are queried with no migration and no dump
(`src/index.ts:28-40,63-75,99-111,143-164,196-209,250-252`). The committed `.db`
files (`msgstore.real.db`, `mssgstore.db`, `wa.db`, `axolotl.db`) are runtime
data, not schema definitions, and the app never writes them (`src/index.ts:278`).
The `appInfo`/`extension` maps in `decrypt_media.py:10-29` are media metadata,
not tables. There are no whatsmeow device/session tables here — that belongs to
a different repo.

## Auth

None. There is no auth middleware, token, API key, session, login or registration
(`src/index.ts:21-271`; `src/routes.ts` is empty). The only global middleware is
permissive `cors()` allowing all origins and `express.json()`
(`src/index.ts:17-18`). Each GET handler begins only with an `if (!this.db)`
readiness check, not an auth gate (`src/index.ts:26,61,97,132,190,246`). Every
endpoint — including the injected `/` — is reachable without credentials.

## External services

None. The database is a local SQLite file supplied as a positional argument and
opened read-only (`src/index.ts:2-3,273-279`); there is no external DB server,
cache, session store, queue, mail or object storage, and no third-party HTTP
calls.

No env var names are configured by the app: no `.env*` files exist and there is
no `process.env` use in `src/` (env-var names are `UNKNOWN — requires human input`;
`CONTAINERIZE.md:17-18`). The image sets `NODE_ENV` and `PORT` and its CMD reads
shell variables `MSGSTORE_DB` and `PORT` to build positional args
(`Dockerfile:22,28`), but the app reads neither as an env var; real values, if
any, are `UNKNOWN — requires human input`. No values are recorded here.

## Operational risks

- Baked empty database: the runtime stage creates a zero-byte `/app/data/msgstore.db` (`Dockerfile:20`) used as the CMD default (`Dockerfile:28`). Every data query against it fails with "no such table" → HTTP 500 (`src/index.ts:28-40,47-54`). A real decrypted DB must be mounted and its path passed. Whether one will be supplied, and by whom, is `UNKNOWN — requires human input`.
- Ephemeral state: `/app/data/msgstore.db` is the whole data source and must come from a mount in real use; no volume is declared (`Dockerfile:14-28`, `src/index.ts:278`).
- Committed credentials and personal data: a key file and crypt14 backup plus several decrypted/sample databases and encrypted media are committed at the repo root. These are real chat/crypto artifacts of uncertain provenance — review before publishing or reusing. Their status (sanctioned test data or to be removed) is `UNKNOWN — requires human input`. No values appear here.
- Fragile build-time patch: `GET /` is a `sed` rewrite of the exact string `this.app = (0, express_1.default)();` in `dist/index.js` (`Dockerfile:7`). A change to the constructor (`src/index.ts:10-14`) or to emitted output can silently break it, while the HTTP probe depends on `/` returning 200 (`CONTAINERIZE.md:28-29`).
- Port mismatch: the app reads the port only from positional `argv` (default 3000, `src/index.ts:288,328`), never from env. Changing only `PORT` still binds the baked port without the CMD's positional wiring (`Dockerfile:28`).
- No auth plus permissive CORS exposes chat/message/call data to any client that can reach the pod (`src/index.ts:17`).
- Database errors return HTTP 500 with raw `error.message` in the JSON body, which can leak schema/path details (`src/index.ts:47-54,84-90,118-125,177-183,224-230,263-269`).
- Boot-time side effect: `initializeDatabase` opens the DB before `app.listen` (`src/index.ts:273-286,292`); no build-time DB query occurs.
- Above one replica, each replica must independently mount the same correct `msgstore.db`; the baked empty DB leaves every replica's data endpoints unusable by default (`Dockerfile:20`).

## Container layout

A single Node 24-slim foreground process runs the compiled TypeScript; no nginx,
FPM or process manager is involved, and runtime deps are pruned with
`npm ci --omit=dev` (`Dockerfile:9-28`). The three stages are build (`node:24`:
`npm ci`, build, then `sed` shim injection, `Dockerfile:1-7`), deps (`node:24`,
`Dockerfile:9-12`) and runtime (`node:24-slim`: installs `curl`, creates
`/app/data` and an empty `msgstore.db`, `NODE_ENV=production PORT=8080`, copies
deps + `dist`, `USER node`, `EXPOSE 8080`, `Dockerfile:14-28`). Logs go to stdout
and no runtime writes are required (`src/index.ts:278,281,283,293-302`).

Repo-local fixes that must not be lost, all in the Dockerfile:

- The `GET /` shim injected with `sed` at `Dockerfile:7`, because the app has no root route and the HTTP probe targets `/` (`CONTAINERIZE.md:28-29`).
- Creation of `/app/data` and the baked empty `msgstore.db` with `chmod 644` at `Dockerfile:19-21`, plus `USER node` (`Dockerfile:26`).
- The CMD passing two positional args — `${MSGSTORE_DB:-/app/data/msgstore.db}` and `${PORT:-8080}` — because the app ignores env vars (`Dockerfile:28`, `src/index.ts:319-328`).
- `curl` installed for the container probe (`Dockerfile:16-18`).

This is one of the six never-re-render repos: regenerating from the
`Dockerfile.node-api` template would drop the `sed` root shim, the baked empty DB
and `/app/data` setup, and the positional-arg CMD this CLI-style app requires
(`Dockerfile:7,19-21,28`, `CONTAINERIZE.md:27-29`). Adopting a per-repo health
path such as `/health` instead of the baked shim is `UNKNOWN — requires human input`
(`CONTAINERIZE.md:29`).
