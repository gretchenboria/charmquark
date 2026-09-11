/**
 * Unit tests for token verification and credential sealing.
 *
 * Run with `npm --prefix api test`. A throwaway RSA key stands in for Google's
 * signing key and `fetch` is stubbed to serve it as the JWKS, so every check in
 * identity.ts / jwt.ts is exercised without a network or a Firebase project.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { FIREBASE_JWKS_URL, readBearer, verifyFirebaseIdToken } from "../src/identity.ts";
import { seal, unseal } from "../src/secrets.ts";

const PROJECT = "cq-test-project";
const now = () => Math.floor(Date.now() / 1000);
const b64url = (v: string | ArrayBuffer): string =>
  Buffer.from(typeof v === "string" ? v : new Uint8Array(v)).toString("base64url");

async function keypair(kid: string) {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid, alg: "RS256", use: "sig" };
  return { privateKey: pair.privateKey, jwk };
}

async function sign(privateKey: CryptoKey, header: object, payload: object): Promise<string> {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

const validClaims = () => ({
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: "uid-123",
  iat: now() - 10,
  auth_time: now() - 10,
  exp: now() + 3600,
  email: "Ops@Example.com",
  email_verified: true,
  name: "Ops Person",
});

function memoryKv() {
  const m = new Map<string, string>();
  return {
    store: m,
    async get(k: string, _type: "json") { const v = m.get(k); return v ? JSON.parse(v) : null; },
    async put(k: string, v: string) { m.set(k, v); },
  };
}

let fetches: string[] = [];
let served: object[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetches = [];
  globalThis.fetch = (async (url: string | URL) => {
    fetches.push(String(url));
    return new Response(JSON.stringify({ keys: served }), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

test("a valid Firebase token yields its identity, email lowercased", async () => {
  const k = await keypair("k1");
  served = [k.jwk];
  const token = await sign(k.privateKey, { alg: "RS256", kid: "k1" }, validClaims());
  const id = await verifyFirebaseIdToken(memoryKv(), PROJECT, token);
  assert.deepEqual(id, { uid: "uid-123", email: "ops@example.com", emailVerified: true, name: "Ops Person" });
  assert.deepEqual(fetches, [FIREBASE_JWKS_URL]);
});

test("the JWKS is served from cache on the second call", async () => {
  const k = await keypair("k1");
  served = [k.jwk];
  const kv = memoryKv();
  const token = await sign(k.privateKey, { alg: "RS256", kid: "k1" }, validClaims());
  await verifyFirebaseIdToken(kv, PROJECT, token);
  await verifyFirebaseIdToken(kv, PROJECT, token);
  assert.equal(fetches.length, 1);
});

test("an unknown kid forces one refetch, so key rotation does not lock people out", async () => {
  const old = await keypair("old");
  const rotated = await keypair("new");
  const kv = memoryKv();
  kv.store.set("firebase:jwks", JSON.stringify({ keys: [old.jwk] }));
  served = [rotated.jwk];
  const token = await sign(rotated.privateKey, { alg: "RS256", kid: "new" }, validClaims());
  const id = await verifyFirebaseIdToken(kv, PROJECT, token);
  assert.equal(id.uid, "uid-123");
  assert.equal(fetches.length, 1);
});

const rejects = async (name: string, mutate: (c: ReturnType<typeof validClaims>) => object, expected: RegExp, header: object = { alg: "RS256", kid: "k1" }) => {
  test(`rejects: ${name}`, async () => {
    const k = await keypair("k1");
    served = [k.jwk];
    const token = await sign(k.privateKey, header, mutate(validClaims()));
    await assert.rejects(verifyFirebaseIdToken(memoryKv(), PROJECT, token), expected);
  });
};

rejects("a token for another Firebase project (iss)", (c) => ({ ...c, iss: "https://securetoken.google.com/other" }), /another project/);
rejects("a token minted for another audience", (c) => ({ ...c, aud: "other" }), /not minted for this project/);
rejects("an expired token", (c) => ({ ...c, exp: now() - 3600 }), /expired/);
rejects("a token with no expiry", ({ exp: _exp, ...c }) => c, /no expiry/);
rejects("a token issued in the future", (c) => ({ ...c, iat: now() + 3600 }), /in the future/);
rejects("a token with no subject", (c) => ({ ...c, sub: "" }), /no subject/);
rejects("alg none", (c) => c, /unexpected alg/, { alg: "none", kid: "k1" });

test("rejects: a signature from a key that is not published", async () => {
  const published = await keypair("k1");
  const attacker = await keypair("k1");
  served = [published.jwk];
  const token = await sign(attacker.privateKey, { alg: "RS256", kid: "k1" }, validClaims());
  await assert.rejects(verifyFirebaseIdToken(memoryKv(), PROJECT, token), /signature is invalid/);
});

test("rejects: a tampered payload", async () => {
  const k = await keypair("k1");
  served = [k.jwk];
  const [h, , s] = (await sign(k.privateKey, { alg: "RS256", kid: "k1" }, validClaims())).split(".");
  const forged = `${h}.${b64url(JSON.stringify({ ...validClaims(), email: "ceo@example.com" }))}.${s}`;
  await assert.rejects(verifyFirebaseIdToken(memoryKv(), PROJECT, forged), /signature is invalid/);
});

test("rejects: garbage", async () => {
  served = [];
  await assert.rejects(verifyFirebaseIdToken(memoryKv(), PROJECT, "not.a.jwt"), /malformed/);
});

test("readBearer reads only a well-formed Bearer header", () => {
  const r = (v?: string) => new Request("https://x/api", { headers: v ? { Authorization: v } : {} });
  assert.equal(readBearer(r("Bearer abc.def.ghi")), "abc.def.ghi");
  assert.equal(readBearer(r("bearer abc")), "abc");
  assert.equal(readBearer(r("Basic abc")), null);
  assert.equal(readBearer(r()), null);
});

// ---------------------------------------------------------------- secrets
test("sealed credentials round-trip and never contain the plaintext", async () => {
  const sealed = await seal("s3cret-value", "rf_live_abc123");
  assert.ok(sealed.startsWith("v1."));
  assert.ok(!sealed.includes("rf_live_abc123"));
  assert.equal(await unseal("s3cret-value", sealed), "rf_live_abc123");
});

test("sealing the same value twice gives different ciphertexts (random IV)", async () => {
  assert.notEqual(await seal("k", "same"), await seal("k", "same"));
});

test("a sealed credential does not open with the wrong secret or after tampering", async () => {
  const sealed = await seal("right", "rf_live_abc123");
  await assert.rejects(unseal("wrong", sealed));
  const [v, iv, ct] = sealed.split(".");
  const flipped = `${v}.${iv}.${ct!.slice(0, -4)}${ct!.slice(-4) === "AAAA" ? "BBBB" : "AAAA"}`;
  await assert.rejects(unseal("right", flipped));
  await assert.rejects(unseal("right", "plaintext-from-before"), /unrecognised/);
});
