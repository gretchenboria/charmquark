#!/usr/bin/env bash
# PreToolUse guard: stops an agent from editing CharmQuark's core files by
# accident. It is a guardrail, not security — anyone with the repo can bypass it
# locally. The real lock is CODEOWNERS plus required CI checks on main.
#
# Reads the tool call JSON on stdin; exit 2 blocks the edit and the message on
# stderr is shown to the agent. See AGENTS.md "Protected zones".
#
# Deliberate core work: `touch .claude/core-unlock` (gitignored; delete it when
# done), or start the agent with CQ_CORE_UNLOCK=1.
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
[ "${CQ_CORE_UNLOCK:-}" = "1" ] && exit 0
[ -f "$ROOT/.claude/core-unlock" ] && exit 0

FILE="$(node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try {
      const t = JSON.parse(s).tool_input || {};
      process.stdout.write(t.file_path || t.notebook_path || t.path || "");
    } catch { /* not JSON: nothing to guard */ }
  });
')"
[ -z "$FILE" ] && exit 0

case "$FILE" in
  "$ROOT"/*) REL="${FILE#"$ROOT"/}" ;;
  /*) exit 0 ;;                      # outside the repo
  *) REL="${FILE#./}" ;;
esac

reason=""
case "$REL" in
  api/src/auth.ts|api/src/identity.ts|api/src/access.ts|api/src/jwt.ts|api/src/tokens.ts|api/src/secrets.ts)
    reason="authentication and authorization — a mistake here lets anyone act as anyone" ;;
  api/src/billing.ts|api/src/routes/billing.ts)
    reason="money: credit debits and the Stripe webhook" ;;
  api/src/changes.ts|api/src/changesets.ts)
    reason="the shared write path (If-Match, audit, atomic change sets) every mutation relies on" ;;
  api/src/domain.ts)
    reason="readiness and effort rules — most tuning belongs in deployment settings (packages/contracts/src/settings.ts), not code" ;;
  packages/contracts/src/enums.ts)
    reason="enums must equal their SQL CHECK constraints — write the migration first; api/test/contracts.test.ts enforces it" ;;
  db/seed/*)
    reason="generated — edit api/src/seedData.ts, then run: npm --prefix api run db:seed:generate" ;;
  db/migrations/*.sql)
    if git -C "$ROOT" ls-files --error-unmatch "$REL" >/dev/null 2>&1; then
      reason="committed migrations are append-only — add a new numbered migration instead"
    fi ;;
  .github/*|api/wrangler.jsonc|web/wrangler.jsonc)
    reason="CI, deploy and infrastructure configuration" ;;
  .claude/settings.json|.claude/hooks/*|.gemini/*|AGENTS.md|CLAUDE.md|GEMINI.md)
    reason="the agent guardrails themselves" ;;
esac

[ -z "$reason" ] && exit 0

cat >&2 <<MSG
Blocked: $REL is a protected core file ($reason).
Do not work around this. Tell the user what you want to change and why. If they
agree, they unlock it for the task with:  touch .claude/core-unlock  (delete it after)
Changes to protected files also need code-owner review (.github/CODEOWNERS).
MSG
exit 2
