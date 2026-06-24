import { NextResponse } from "next/server";

export async function GET() {
  const multiplayerUrl =
    process.env.MULTIPLAYER_SERVER_URL ||
    process.env.NEXT_PUBLIC_MULTIPLAYER_URL ||
    "";

  return NextResponse.json({ multiplayerUrl });
}
