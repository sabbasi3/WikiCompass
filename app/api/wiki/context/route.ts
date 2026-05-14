import { NextResponse } from "next/server";

export async function POST(_req: Request) {
  return NextResponse.json({ context: null }, { status: 501 });
}
