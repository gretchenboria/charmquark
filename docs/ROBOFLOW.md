# Roboflow annotation handoff

Once a run passes QA, its imagery should be able to leave CharmQuark for
annotation and come back as a versioned dataset. This is the outbound half:
a QA-passed run's image assets are pushed to a Roboflow project, and the linkage
(run → workspace/project/batch, and later → dataset version) is recorded in D1 so
lineage survives the six months until someone asks where a model's training data
came from.

It is deliberately small, and deliberately explicit about where it stops.

---

## Configuration

`ROBOFLOW_API_KEY` is a Worker **secret**, never a var and never in a tracked
file:

```bash
wrangler secret put ROBOFLOW_API_KEY
wrangler secret put ROBOFLOW_WORKSPACE   # optional; only used for the lineage record and the project proxy
```

Locally, copy `api/.dev.vars.example` to `api/.dev.vars` (gitignored) and fill it
in.

**The guard mirrors billing exactly.** `GET /api/runs/:id/roboflow` returns
`annotation_configured: false` — the same shape as billing's
`payments_configured` — so the UI can decline to offer the action. Any call that
needs the key without one returns **503** naming the missing secret rather than
half-working:

```
Annotation export is not configured: this Worker has no Roboflow API key.
Set it with `wrangler secret put ROBOFLOW_API_KEY` (see docs/ROBOFLOW.md).
```

---

## Endpoints CharmQuark exposes

| Call | Effect |
|---|---|
| `GET /api/runs/:id/roboflow` | Whether the integration is configured, plus every export already made for this run |
| `POST /api/runs/:id/roboflow/export` | Push this run's image documents to a Roboflow project. Body: `{project, workspace?, batch?, split?, force?}` |
| `PATCH /api/roboflow/exports/:id` | Record which Roboflow dataset version was cut from an export |
| `GET /api/roboflow/projects/:project` | Proxy Roboflow's project view (image counts, classes, versions) so the browser never holds the key |

The export refuses a run whose QA has not passed (409), because annotation time
is expensive and labelling a failed capture wastes it. `force: true` overrides
that for the case where QA was adjudicated outside the app.

Two deliberate limits:

- **25 images per export.** A Worker's subrequest budget is finite and this is
  one request per image. The response carries `remaining`; call again for the
  rest. Better a stated cap than a silent truncation.
- **Bytes, not URLs.** The vault is private. Roboflow's hosted-URL upload form
  needs a URL *their* servers can fetch, and publishing run imagery to make an
  upload work would be the wrong trade — so each image is read from R2 and sent
  base64-encoded in the request body, which is the documented alternative.

The per-image receipt (`roboflow_exports.results`) records each document's
filename, the Roboflow image id, whether Roboflow called it a duplicate, and any
error. An export that dropped three frames is recorded as `PARTIAL`, not rounded
up to `COMPLETE`.

---

## Roboflow endpoints used, and how they were verified

Verified against Roboflow's live documentation on 2026-09-10 by fetching the
Markdown source of each page (`https://docs.roboflow.com/<path>.md`).

### 1. Key check / workspace identity — **verified**

```
GET https://api.roboflow.com/
Authorization: Bearer $ROBOFLOW_API_KEY
```

Returns `{"welcome": ..., "instructions": ..., "docs": ..., "workspace": "my-workspace"}`.

Source: <https://docs.roboflow.com/reference/platform/rest-api> ("Root endpoint").

### 2. Project metadata and version list — **verified**

```
GET https://api.roboflow.com/:workspace/:project?api_key=$ROBOFLOW_API_KEY
```

Returns `{workspace: {...}, project: {id, type, name, images, unannotated,
splits, classes, versions: [{id, name, created, images, splits}, ...]}}`.

Source: <https://docs.roboflow.com/platform/workspaces/list-workspaces-and-projects>
("Get a Project and List Versions").

Used by `GET /api/roboflow/projects/:project`.

### 3. Image upload — **verified**

```
POST https://api.roboflow.com/dataset/:project/upload?api_key=...&name=...&split=...&batch=...
```

Documented query parameters: `api_key`, `image` (a URL, when the image is hosted
elsewhere), `name`, `batch`, `tag` (repeatable), `split` (`train` | `valid` |
`test`, default `train`), `sequence_number`, `sequence_size`, `inference_id`.

Three documented body forms, all against the same URL:

- `multipart/form-data` with a `file` part (documented as recommended for local files);
- a **base64-encoded image as the raw request body** — this is what CharmQuark sends;
- no body at all, with `image=<url-encoded URL>` in the query string.

Source: <https://docs.roboflow.com/datasets/manage/manage-images> ("Upload an
Image", cURL/JavaScript/Python tabs).

### Authentication

Roboflow documents three channels: an `Authorization: Bearer <key>` header
(recommended), an `api_key` field in a JSON POST body, and an `?api_key=` query
parameter (documented as legacy, "still works", discouraged for production
because it keeps the key in URLs and logs).

Source: <https://docs.roboflow.com/reference/platform/rest-api/authenticate-with-the-rest-api>.

CharmQuark uses the bearer header for the project proxy. The **upload** call uses
`?api_key=` because that is the form the upload endpoint is documented with in
every one of its examples; the request is Worker → Roboflow over TLS with no
intermediary logging the URL. Switching it to a bearer header is a one-line
change in `api/src/routes/roboflow.ts` if Roboflow documents the header for that
endpoint.

---

## What is NOT verified, and therefore not implemented

**Generating a dataset version has no documented REST endpoint.** Roboflow's
"Create a Dataset Version" page documents the UI ("click Generate"), the Python
SDK (`Project.generate_version(settings={...})`, which returns the new version
number) and an MCP tool (`versions_generate`) — but no HTTP route. The only
REST endpoint on that page is an unrelated split rebalance
(`POST /:workspace/:project/splits/rebalance`, returning an async task at
`https://api.roboflow.com/:workspace/asynctasks/:id`).

Source: <https://docs.roboflow.com/datasets/versions/dataset-versions/create-a-dataset-version>.

So CharmQuark does not create versions. `roboflow_exports.dataset_version` exists
and `PATCH /api/roboflow/exports/:id` records the number once a version is cut in
the Roboflow UI or via their SDK. Lineage stays traceable; no endpoint is
invented.

Also unverified, and therefore not relied on:

- **The upload response schema is not documented as a schema.** The fields
  `id`, `success` and `duplicate` are visible in Roboflow's own sample code
  (the Swift tab reads exactly those three). CharmQuark reads them defensively:
  an absent field is treated as "not reported", never as a success.
- **A newer staging-batch upload API** appears in search results
  (`POST /data-staging/v1/external/:workspace/batches/:batch_id/upload/image`, and
  a bulk `.tar` variant for batches over 5,000 images). Its documentation page
  404s at the URL the search index carries, so it was not used.
- **Roboflow's inbound direction** — pulling an annotated, versioned dataset back
  into CharmQuark — is not implemented at all. Dataset export is documented at
  `/:workspace/:project/:version/:format`, but nothing here calls it.
- **Rate limits and per-plan quotas** were not checked. The 25-image cap is a
  Worker-side subrequest limit, not a Roboflow one.

---

## Schema

`db/migrations/0003_qa.sql`:

```sql
CREATE TABLE roboflow_exports (
  id, run_id, workspace, project, batch, split,
  status,           -- PENDING | COMPLETE | PARTIAL | FAILED
  image_count, duplicate_count, failed_count,
  results,          -- [{document_id, filename, roboflow_id, duplicate, error}]
  dataset_version,  -- set by PATCH once a version is cut
  error, created_by, created_at, updated_at
);
```

No foreign key to any Roboflow id: those live in someone else's database, and
this table records only what their API said.
