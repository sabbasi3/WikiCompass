// HMAC-signed tokens for journey action URLs.
//
// Threat model: possession of a journey URL = identity for that journey.
// Anyone with the URL can skip-ahead, pause, cancel, or unsubscribe.
// This is the same trust model as a bookmark link (or an email
// unsubscribe link) — share the URL, share the powers.
//
// What the token protects against: someone *guessing* a journey id and
// poking the action route to mess with another user's journey. The
// signed token closes that off — without the secret, you can't forge
// a valid (id, token) pair.
//
// One token per journey, valid for the journey's lifetime. The token
// signs only the journey id, not the action — same URL works for skip,
// pause, cancel, etc. Trade-off chosen deliberately: fewer URLs to
// pass around in emails, one token to remember.

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.JOURNEY_TOKEN_SECRET;

if (!SECRET) {
  throw new Error(
    "JOURNEY_TOKEN_SECRET is required. Generate with: openssl rand -hex 32",
  );
}

// HMAC-SHA256 → base64url (URL-safe, no padding) keeps the token short
// enough for clean query strings: `?token=<43 chars>`.
function sign(journeyId: string): string {
  const hmac = createHmac("sha256", SECRET!);
  hmac.update(journeyId);
  return hmac
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function signJourneyToken(journeyId: string): string {
  return sign(journeyId);
}

// Constant-time comparison — defends against timing attacks that could
// otherwise leak the token byte-by-byte. node:crypto's timingSafeEqual
// requires equal-length buffers, so we length-check first.
export function verifyJourneyToken(journeyId: string, token: string): boolean {
  const expected = sign(journeyId);
  if (expected.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
