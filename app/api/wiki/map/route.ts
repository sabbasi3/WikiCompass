import { NextResponse } from "next/server";

export async function POST(_req: Request) {
  return NextResponse.json({ map: null }, { status: 501 });
}
