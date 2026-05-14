import { NextResponse } from "next/server";
import { z } from "zod";

import { searchWikipedia } from "@/lib/wiki";

const searchRequestSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { kind: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        kind: "error",
        message: "Invalid request",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const candidates = await searchWikipedia(
      parsed.data.query,
      parsed.data.limit ?? 10,
    );
    return NextResponse.json({ kind: "results", candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ kind: "error", message }, { status: 502 });
  }
}
