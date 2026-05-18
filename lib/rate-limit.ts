import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server"; //  Next.js helper for building HTTP responses with status codes and headers

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

const kvConfigured = Boolean(url && token);

export const mapRateLimit = kvConfigured
  ? new Ratelimit({
      redis: new Redis({ url: url!, token: token! }),
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      analytics: true,
      prefix: "wikicompass:map",
    })
  : null;

export function getClientIp(req: Request): string {
  const clientIp = req.headers.get("x-vercel-forwarded-for");
  if (clientIp) return clientIp.split(",")[0].trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "anonymous";
}

// Result of a rate-limit check. Discriminated union so the caller
// has one obvious shape to handle both branches:
//   if (!result.ok) return result.response;  // 429 with body + retry-after
//   useHeaders(result.headers);               // X-RateLimit-* for success
export type RateLimitResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; response: NextResponse };

// Check the rate limit for an incoming request and either allow it
// (returning the X-RateLimit-* headers to attach to whatever response
// the caller produces) or block it (returning a fully-formed 429
// response the caller should return immediately).
//
// Degrades to ok-with-empty-headers when no Redis is configured — dev
// mode without env vars stays usable.
export async function checkRateLimit(req: Request): Promise<RateLimitResult> {
  if (!mapRateLimit) {
    return { ok: true, headers: {} };
  }
  const ip = getClientIp(req);
  const { success, limit, remaining, reset } = await mapRateLimit.limit(ip);
  const retryAfterSeconds = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
  const headers = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(reset / 1000)),
  };
  if (!success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          kind: "rate_limited",
          message: `You have hit the rate limit. Try again in ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}.`,
          retryAfterSeconds,
          limit,
        },
        {
          status: 429,
          headers: { ...headers, "Retry-After": String(retryAfterSeconds) },
        },
      ),
    };
  }
  return { ok: true, headers };
}
