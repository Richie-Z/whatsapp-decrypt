# CONTAINERIZE - Solo/whatsapp-decrypt

Archetype: node-api. Generated 2026-11-20T22:42:25+07:00 by .opencode/scripts/render.sh on branch chore/containerize (uncommitted).

## Generated files
- Dockerfile (template: Dockerfile.node-api)
- Jenkinsfile (CI only; parameters REGISTRY, HARBOR_PROJECT, HARBOR_CRED_ID)
- .dockerignore

## Local run
```sh
bash .opencode/scripts/build.sh Solo/whatsapp-decrypt
bash .opencode/scripts/smoke.sh Solo/whatsapp-decrypt
```
Manual run: podman run --rm --network=host --env-file /home/richie/Documents/Programming/Projects/.smoke.env -e PORT=<free-port> containerize/whatsapp-decrypt:local

## Required env var NAMES (values never stored here)
unknown - inspect app config (do not print secret values)

## DB smoke
boot + healthcheck only (DB not smoke-tested). db_driver: unknown. Never migrate/seed/modify; DBs are live.

## Flags
- agent label 'node' unverified on k3s Jenkins (only bun/buildah proven by BenchCheck) - confirm with user

## Runtime notes
- App entry point requires a positional msgstore.db path and reads the port from a second positional arg; it ignores the PORT env var. The image CMD passes `${MSGSTORE_DB:-/app/data/msgstore.db}` and `${PORT:-8080}` explicitly. Mount a real msgstore.db and set MSGSTORE_DB for actual use; the baked file is an empty read-only placeholder.
- App exposes /health, /stats, /chats, ... but no `/` route. The build adds a `GET /` 200 shim to dist/index.js and the container healthcheck targets `/health`.
- Toolkit gap: smoke.sh hardcodes an HTTP probe on `/` for all node-api repos. Recommended template/script change: allow a per-repo health path (e.g. `.opencode/overrides.json` `smoke[repo].HEALTH_PATH`, default `/`) and use it for the HTTP check and container HEALTHCHECK, so apps without a root route do not need a baked shim.

Smoke results: 2026-11-21T02:11:43+07:00 boot=PASS http=200 db=not verified (no read-only CLI for node-api; health endpoint only)
Smoke results: 2026-11-21T15:02:53+07:00 boot=PASS http=200 db=skipped (legacy mysqli app; pgsql not supported without a code rewrite)
