import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

const kvConfigured = Boolean(url && token);

export const mapRateLimit = kvConfigured
  ? new Ratelimit({
      redis: new Redis({ url: url!, token: token! }),
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      analytics: true,
      prefix: "wikipath:map",
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
