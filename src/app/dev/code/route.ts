import { NextResponse, type NextRequest } from "next/server";
import { AUTH_ENABLED } from "@/lib/auth";
import { getDb } from "@/lib/supabase";
import { devCodeNow } from "@/lib/coding-store";

// DEV ONLY — /dev/code?scheme=<id>: every application of the scheme still under a
// provisional reference is coded at once (on record as a dev coding), for the browser
// checks that need coded participants without the announcements and the act (5.3); the
// act itself is checked by verify-coding. 404 in a production build, with login on, or
// with a database configured — it never writes to a database.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development" || AUTH_ENABLED || getDb()) return new NextResponse(null, { status: 404 });
  if (req.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 403 });
  const scheme = req.nextUrl.searchParams.get("scheme") ?? "";
  const n = await devCodeNow(scheme);
  return NextResponse.json({ coded: n });
}
