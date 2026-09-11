---
description: Turn a hardcoded rule or limit into a deployment setting
argument-hint: <what to make configurable, e.g. "max runs per operator per day">
---

Make `$ARGUMENTS` a deployment setting instead of a constant.

1. Find every use of the constant: `grep -rn` across `api/src` and `web/src`, quoting `'--include=*.ts'`.
2. In `packages/contracts/src/settings.ts`:
   - Add the key to `Settings`, named `group.snake_case`.
   - Add a `SETTING_DEFAULTS` value **equal to today's behaviour**.
   - Add a `SETTING_SPECS` entry with a label, a description that says what it changes, and a validator.
   - Extend `validateSettings` if it interacts with other settings.
3. Pass settings in rather than reading globals.
   - Pure functions take `rules: Settings = SETTING_DEFAULTS`.
   - Routes call `await loadSettings(c.env.DB)` (`api/src/settings.ts`).
   - If the rule lives in `api/src/domain.ts` (protected), ask first.
4. Tests:
   - Add cases to `api/test/settings.test.ts`: the stock default reproduces old behaviour, and a custom value changes it.
   - Add a smoke check if a route's behaviour depends on it.
5. Document it in `docs/ACCESS.md` → Settings if a customer would care.
6. Verify with the Definition of done in AGENTS.md.
