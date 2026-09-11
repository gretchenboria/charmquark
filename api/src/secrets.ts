/**
 * Sealing for third-party credentials stored in D1.
 *
 * A Roboflow (or, later, LLM provider) key pasted into the Integrations page is a
 * credential that spends someone's money, so it is never at rest in plaintext:
 * AES-256-GCM under a key derived from the `INTEGRATION_KEY_SECRET` Worker
 * secret. A database dump without that secret yields nothing usable, and GCM's
 * tag means a tampered row fails to open rather than decrypting to garbage.
 *
 * Generate the secret with `openssl rand -base64 32`. It is hashed to a 256-bit
 * key, which is sound for a high-entropy random secret (not for a password).
 * Rotating it orphans existing rows — re-enter the keys afterwards.
 *
 * Format: `v1.<base64 iv>.<base64 ciphertext+tag>` — versioned so the scheme can
 * change without guessing what an old row is.
 */

const VERSION = "v1";

const toB64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(secret: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await deriveKey(secret),
    new TextEncoder().encode(plaintext),
  );
  return `${VERSION}.${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

/** Throws when the secret is wrong or the value was altered. */
export async function unseal(secret: string, sealed: string): Promise<string> {
  const [version, iv, ct] = sealed.split(".");
  if (version !== VERSION || !iv || !ct) throw new Error("unrecognised sealed value");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) },
    await deriveKey(secret),
    fromB64(ct),
  );
  return new TextDecoder().decode(pt);
}
