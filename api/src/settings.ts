/**
 * Loading deployment settings: stock defaults overlaid with the overrides in the
 * `settings` table. A stored value that no longer validates (hand-edited SQL, a
 * spec that tightened) falls back to its default and says so in the log, so a bad
 * row degrades one rule instead of breaking scheduling.
 */
import { SETTING_DEFAULTS, SETTING_SPECS, isSettingKey, type Settings } from "./contracts";

export async function loadSettings(db: D1Database): Promise<Settings> {
  const settings = structuredClone(SETTING_DEFAULTS);
  const { results } = await db.prepare(`SELECT key, value FROM settings`).all<{ key: string; value: string }>();
  for (const row of results) {
    if (!isSettingKey(row.key)) continue;
    let value: unknown;
    try {
      value = JSON.parse(row.value);
    } catch {
      console.warn(`settings: ${row.key} is not valid JSON; using the default`);
      continue;
    }
    const problem = SETTING_SPECS[row.key].validate(value);
    if (problem) {
      console.warn(`settings: stored ${row.key} ${problem}; using the default`);
      continue;
    }
    (settings as unknown as Record<string, unknown>)[row.key] = value;
  }
  return settings;
}
