# AGENTS.md: editing this CharmQuark configuration

This folder is one CharmQuark deployment's configuration, as files. People and
coding agents (Claude Code, Gemini CLI, others) edit the files. `cq.mjs` plans
and applies them through the deployment's API, as the owner of the API token and
with that person's permissions. Nothing here is CharmQuark's source code.

## Files

| Path | What |
|---|---|
| `settings.json` | Scheduling, risk, limit and assistant rules. Only a Fleet Lead can change them. |
| `records/<type>.json` | Campaigns, labs, robots, operators, sensors, mission groups, lab blackouts, sensor rigs, inventory, missions. |
| `workflows/index.json` + `workflows/*.bpmn` | BPMN workflows. Tasks bind to CharmQuark services with `cq:service`. |
| `schemas/` | JSON Schemas pulled from the deployment. Do not edit; `pull` replaces them. |
| `.cq/` | The last plan's digest. Not committed. |

## The loop

1. `node cq.mjs pull` before you start. It overwrites the files, so commit or stash first.
2. Make the edit the person asked for, and nothing else.
3. `node cq.mjs plan`. Read the whole plan and show it to the person. If it lists a change you did not intend, stop.
4. `node cq.mjs apply` applies exactly that plan. It refuses if the deployment changed since, then pulls fresh ids and versions.
5. Commit the files.

## Rules

- **Ids.** Never invent or change an `id`. Leave `id` out to create a record. Give a new record a `ref`, and write `"$ref:<ref>"` wherever another new record needs its id.
- **Versions.** Keep `version` exactly as pulled. If plan reports a version conflict, someone changed that record: pull again and redo the edit. Never edit a version by hand.
- **Deleting.** Removing a record from a file deletes nothing unless you plan and apply with `--prune`. Use `--prune` only when a person asked for a deletion, and point out every `-` line in the plan.
- **Locked fields.** A field that isn't in the schema can't be set here. It is derived, or set by an action in the app: risk assessment, legal review, confirming or advancing runs. Don't work around that. Missions' `risk_level` and `legal_approval` change only when a Fleet Lead applies.
- **Problems.** Plan names every problem: validation, permissions, stale versions, duplicates. Fix the files; don't retry blindly.
- **Token.** Never write the token into a file or a commit. It comes from `CHARMQUARK_TOKEN`.

## Looking things up (MCP)

`.mcp.json` (Claude Code) and `.gemini/settings.json` (Gemini CLI) connect to
the deployment's MCP server with the same token. Use it to read: `describe_schema`,
`get_record`, `get_run_readiness`, `list_service_tasks`, `validate_bpmn`. Make
changes through the files and `cq`, so every change is planned, reviewed and
kept in git.
