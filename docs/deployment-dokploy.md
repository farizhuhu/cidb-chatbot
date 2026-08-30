# Deploying to Dokploy with Docker

The stack is three containers defined in [`docker-compose.yml`](../docker-compose.yml):

| Service | Image | Role | Exposed |
|---|---|---|---|
| `app` | `docker/app/Dockerfile` (PHP 8.2 + Apache) | REST API **and** the chat widget, on one origin | port 80, via Traefik |
| `ocr` | `docker/ocr/Dockerfile` (Python 3.11 + PaddleOCR) | Document verification | internal only |
| `db` | `postgres:16-alpine` | PostgreSQL 16 | internal only |

The `app` container serves `home.html` at `/`, `frontend_api.js` and `assets/` as
static files, and sends everything else to `backend/public/index.php`. Because
the widget and the API share an origin, `frontend_api.js` resolves its API base
to `window.location.origin` in production — no rebuild per environment, and no
CORS configuration unless you embed the widget on another site.

## 1. Prerequisites

- A Dokploy server with the `dokploy-network` Docker network (Dokploy creates it).
- A DNS record pointing your domain at the Dokploy host.
- ~4 GB free disk. The OCR image is ~2.1 GB because PaddleOCR models are baked
  in at build time; the app image is ~770 MB.

## 2. Create the Dokploy project

1. **Project → Create Service → Compose.**
2. Provider: your Git repository, branch `main`.
3. **Compose Path:** `./docker-compose.yml`.

## 3. Set environment variables

In the Compose service's **Environment** tab, paste the contents of
[`.env.docker.example`](../.env.docker.example) and fill it in. Four values have
no default and the stack will refuse to start without them:

| Variable | Notes |
|---|---|
| `APP_URL` | Public URL, e.g. `https://chatbot.cidb.gov.my` |
| `APP_ENCRYPTION_KEY` | `openssl rand -hex 32` — encrypts sensitive fields at rest |
| `DB_PASSWORD` | Used by both `db` and `app` |
| `RPA_BOT_API_KEY` | Ticket-insert credential (see the security note below) |

`DB_HOST`, `OCR_SERVICE_BASE_URL`, `STORAGE_PATH` and `LOG_PATH` are pinned to
the container topology in `docker-compose.yml` — do not override them.

## 4. Add the domain

**Domains → Add Domain:**

- Service Name: `app`
- Container Port: `80`
- HTTPS on, Certificate: Let's Encrypt

Dokploy generates the Traefik labels. The compose file deliberately publishes no
host ports — `app` only joins `dokploy-network` so Traefik can route to it,
while `db` and `ocr` stay on the private `internal` network.

## 5. Deploy

Press **Deploy**. First build takes roughly 10–20 minutes, almost entirely
PaddlePaddle wheels and OCR model downloads; later deploys reuse those layers.

On first boot the stack sets itself up with no manual steps:

1. Postgres runs `docker/db/initdb/*.sql` — the baseline schema (14 tables) and
   reference data (languages, states, request types, document types, config).
   These run **only** when the data directory is empty.
2. The `app` entrypoint waits for the database, then applies the 13 incremental
   migrations in `backend/migrations/`.
3. Apache starts.

Verify: `https://your-domain/health.php` returns `{"status":"ok",...}`, and
`https://your-domain/faq/topics` returns FAQ topics from the database.

## When the baseline schema changes

`docker/db/initdb/*.sql` runs **only against an empty data directory**. If those
files change, an already-deployed stack keeps its old schema — redeploying is not
enough. Recreate the database volume:

```bash
docker compose down -v && docker compose up -d
```

In Dokploy, delete the Compose service's `db-data` volume before redeploying.
This destroys all data, so only do it while the deployment is still disposable.

## Schema provenance — read this before trusting the baseline

`001_baseline_schema.sql` was extracted from section 11 of
`BACKEND_DATABASE_DESIGN.md`, which is a **design document, not a dump of a
working database**. It has already been found to diverge from the code:

- `chatbot_applicants` specified `full_name_ciphertext` / `full_name_hash` /
  `identity_number_ciphertext` / `identity_number_hash`. That encryption design
  was never implemented — the code writes plaintext `full_name` and
  `identity_number`, so the identity step failed with `column "full_name" does
  not exist`.
- `cims_verification_results` was missing `retry_available` and
  `display_message`, both written by `VerificationService`.

Every `insert()` / `update()` payload and every repository read path has since
been checked mechanically against the live schema, and they now agree. But the
column types and constraints for the corrected columns are inferred from usage,
not from a real database. If a working CIDB database exists anywhere, diff it
against this file and prefer its definitions:

```bash
pg_dump --schema-only --no-owner --no-privileges <db> > real-schema.sql
```

## Using an existing database

If you already run a PostgreSQL instance with this schema:

1. Delete the `db` service and the `db-data` volume from `docker-compose.yml`,
   and drop `depends_on: db` from `app`.
2. Set `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` to the
   external instance.

The baseline SQL under `docker/db/initdb/` never runs against it. Migrations
still do, and are tracked in a history table, so already-applied ones are
skipped. Set `RUN_MIGRATIONS=false` if you would rather apply them by hand:

```bash
docker compose exec app php /var/www/app/backend/migrate.php
```

## Persistent data

| Volume | Mount | Contents |
|---|---|---|
| `db-data` | `/var/lib/postgresql/data` | Database |
| `app-storage` | `/var/www/storage` | Uploaded documents and signatures |
| `app-logs` | `/var/www/logs` | Application logs |
| `ocr-models` | `/root/.paddlex` | PaddleOCR model cache |

Back up `db-data` and `app-storage` — uploaded identity documents live on local
disk, not in the database. Set `UPLOAD_STORAGE_DRIVER` if you move to object
storage later.

## Embedding the widget on another site

Serve the page from its own host and point it at this deployment:

```html
<script>window.CIDB_API_BASE_URL = 'https://chatbot.cidb.gov.my';</script>
<script src="https://chatbot.cidb.gov.my/frontend_api.js"></script>
```

Then add that host to `CORS_ALLOWED_ORIGINS` (comma-separated) and redeploy.

## Security note

`.env.example` is committed to the repository and contains a live-looking
`RPA_BOT_API_KEY` along with the RPA endpoint IP. Anyone with repository access
has that credential. **Rotate it**, then set the new value only in Dokploy's
Environment tab, and replace the value in `.env.example` with an empty
placeholder.

## Troubleshooting

**`app` restarts in a loop** — check `docker compose logs app`. The entrypoint
exits deliberately when migrations fail so a half-migrated schema never serves
traffic. It also aborts after `DB_WAIT_ATTEMPTS` (default 30 × 2s) if the
database never becomes reachable.

**Domain returns 502 / 504 while `app` is healthy** — this is Traefik failing to
reach a container that is running fine. `app` holds an IP on both `internal` and
`dokploy-network`, and Traefik only sits on the latter; if it resolves the
`internal` address, every request times out at the proxy. The
`traefik.docker.network=dokploy-network` label on the `app` service pins the
right one. Confirm the label survived into the running container:

```bash
docker inspect <app-container> --format '{{ index .Config.Labels "traefik.docker.network" }}'
```

If it is empty, Dokploy replaced the labels rather than merging them. Fall back
to putting all three services on `dokploy-network` alone and deleting the
`internal` network — but then rename `db` to something project-specific, because
service names become DNS aliases on that shared network and a generic `db` can
collide with another Dokploy app's database.

Also confirm the domain targets service `app` port `80`, and that `app` reports
`healthy` in `docker compose ps`.

**Behind Cloudflare Tunnel** — leave the HTTPS toggle off in the Dokploy domain
(Cloudflare terminates TLS) and point the tunnel's public hostname at
`http://localhost:80`, where Traefik listens. Pointing it at `https://localhost:443`
yields a 502 because no TLS router exists for the host.

**OCR verification times out on the first request** — if the build-time model
prefetch failed (the build log prints a `WARNING` rather than
`paddleocr models cached`), the first request downloads models instead. The
`ocr-models` volume makes this a one-time cost.

**Widget loads but every API call fails** — open the browser console and check
`API_BASE_URL`. It should equal the page origin. It falls back to
`http://localhost:8000` only for `file://` pages and dev ports 3000/5173/5500.

## Local testing

```bash
cp .env.docker.example .env && docker compose up -d --build
```

Compose publishes no host ports, so reach it through the container network or
temporarily add `ports: ["8080:80"]` to `app`.
