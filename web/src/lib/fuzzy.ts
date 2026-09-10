// Tiny dependency-free fuzzy matcher for search/filter across the app.
// Subsequence match with scoring: consecutive characters and word-start hits score higher.
// Returns 0 for no match; higher is a better match.

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = (text ?? "").toLowerCase();
  if (!q) return 1; // empty query matches everything (low, neutral score)
  if (!t) return 0;

  let score = 0;
  let qi = 0;
  let prevMatch = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      let bonus = 1;
      if (ti === prevMatch + 1) bonus += 2; // consecutive
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-" || t[ti - 1] === "_") bonus += 3; // word start
      score += bonus;
      prevMatch = ti;
      qi++;
    }
  }
  if (qi < q.length) return 0; // not all query chars found in order
  // prefer shorter targets and exact substring hits
  if (t.includes(q)) score += 5;
  score += Math.max(0, 10 - t.length / 4);
  return score;
}

/** Filter + sort items by fuzzy match on the string produced by `toText`. */
export function fuzzyFilter<T>(items: T[], query: string, toText: (item: T) => string): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(q, toText(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}
