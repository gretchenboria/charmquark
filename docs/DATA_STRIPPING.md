# Data provenance and stripping

CharmQuark is derived from a predecessor application ("Gala") that held real
programme data. This records exactly what was removed, so the lineage is
auditable and nothing proprietary rides along.

## What was carried over

Only **code and structure**: the scheduling canvas, the readiness engine, the
effort-budget auto-scheduler, the QA gate model, the CSV round-trip, and the
React component library. All of it was rewritten from FastAPI/SQLAlchemy to
Hono/D1 in the process.

## What was removed

| Removed | Replaced with |
|---|---|
| Real programme codenames (three internal project names used as the campaign type) | `PERCEPTION` / `MANIPULATION` / `NAVIGATION` |
| Recorded session CSVs (`backend/CSV_SYNC/*`) — real participant codes, task names, locations, device names | Nothing; run sheets are generated on demand into R2 |
| The predecessor's study data (task catalogue, sessions, participants) | A fictional seed: `db/seed/0001_dummy.sql` |
| Human research subjects (`participants` — name, email, consent state, booking) | `robots` — a fleet asset, no personal data at all |
| Apartment locations | `labs` |
| Vendor design tokens (a named corporate brand palette, `Docs/Apple_Design_Tokens.md`) | A palette sampled from the CharmQuark mark — see [BRAND.md](BRAND.md) |
| Vendor logo and wordmark assets | The CharmQuark mark, wordmark and favicon (`web/public/charmquark-*.svg`) |
| Vendor SSO references (`AppleConnect`/DSID identity seam) | A neutral header shim in `api/src/auth.ts`, ready for Cloudflare Access |
| Vendor-specific comments throughout the component library | Neutral descriptions |
| A cooking-domain hazard lexicon in the risk calculator | A robot-operations hazard lexicon (voltage, pinch points, suspended loads, teleop…) |
| Third-party sync integration (`wrike_sync/`) and its demo seed | Not carried over |

## Personally identifying data

The predecessor's participant table held names, emails and consent records. It
is **gone** — CharmQuark has no equivalent table and no schema slot for research
subjects. `robots` carries codes, platforms and serial numbers.

The `operators` and `users` tables do hold staff names and emails, as any
workforce system must. Everything in the seed is fictional and uses the reserved
`.invalid` TLD, which can never resolve.

## Verifying

```bash
# no legacy domain vocabulary anywhere in the source
grep -rniE "participant|apartment|\bgala\b" web/src api/src db --include="*.ts" --include="*.tsx" --include="*.sql"

# no real email addresses in the seed
grep -oE "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+" db/seed/*.sql | sort -u
```

Both should return only `.invalid` addresses and no matches respectively.
The end-to-end suite also asserts the rendered UI contains none of the legacy
vocabulary.

## Vocabulary

The predecessor's research vocabulary is gone from the code as well as the data.
`Study`/`Task`/`Session`/`Device`/`DeviceFleet` are now
`Campaign`/`Mission`/`Run`/`Sensor`/`SensorRig` — see
[ROADMAP.md](ROADMAP.md#the-naming-decision--made-and-applied) for the reasoning.

```bash
# no research-era object names should remain
grep -rnE "\b(Study|Session|TaskGroup|DeviceFleet)\b" web/src api/src db \
  --include="*.ts" --include="*.tsx" --include="*.sql"
```
