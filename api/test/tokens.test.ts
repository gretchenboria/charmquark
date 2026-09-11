/** Unit tests for personal access token generation and hashing. Run with `npm --prefix api test`. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { TOKEN_PREFIX, displayPrefix, generateToken, hashToken, isPatToken, parseScopes } from "../src/tokens.ts";

test("tokens carry the prefix, are url-safe and unique", () => {
  const a = generateToken();
  const b = generateToken();
  assert.ok(a.startsWith(TOKEN_PREFIX));
  assert.match(a.slice(TOKEN_PREFIX.length), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.ok(isPatToken(a));
  assert.ok(!isPatToken("eyJhbGciOiJSUzI1NiJ9.x.y"));
});

test("the stored hash is deterministic hex and never contains the token", async () => {
  const t = generateToken();
  const h = await hashToken(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await hashToken(t));
  assert.notEqual(h, await hashToken(generateToken()));
  assert.ok(!h.includes(t.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 10)));
});

test("the display prefix is too short to use", () => {
  const t = generateToken();
  assert.equal(displayPrefix(t).length, TOKEN_PREFIX.length + 6);
  assert.ok(t.length - displayPrefix(t).length >= 37);
});

test("scopes parse defensively", () => {
  assert.deepEqual(parseScopes('["read","write"]'), ["read", "write"]);
  assert.deepEqual(parseScopes('["read","admin"]'), ["read"]);
  assert.deepEqual(parseScopes("not json"), []);
  assert.deepEqual(parseScopes(null), []);
});
