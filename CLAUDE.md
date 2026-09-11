@AGENTS.md

## Claude Code specifics

- `.claude/settings.json` denies deploys, remote D1 writes, secret changes, force-pushes and reading `.env` files. A `PreToolUse` hook (`.claude/hooks/guard-core.sh`) blocks edits to the protected zones listed above. When it blocks you, explain the change to the user and let them decide. Don't work around it.
- Project commands encode the recipes: `/add-resource`, `/add-setting`, `/add-migration`.
- Run the Definition of done checks yourself before saying a change is finished, and report failures verbatim.
