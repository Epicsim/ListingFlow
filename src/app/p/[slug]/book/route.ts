import { type NextRequest, NextResponse } from "next/server";
import { recordBookingClick } from "@/lib/data/public";
import { asService } from "@/lib/db";
import { uuidSchema } from "@/lib/validation";

/**
 * Records a booking-link click, then sends the visitor to the agent's own
 * scheduler. A click is stored as a click only; it never creates or implies a
 * confirmed appointment. The destination always comes from the agent's saved
 * settings, never from the request, so this can't be used as an open redirect.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/p/[slug]/book">) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return new NextResponse("Not found", { status: 404 });

  const r = request.nextUrl.searchParams.get("r");
  const token = r && uuidSchema.safeParse(r).success ? r : null;
  const destination = await asService((tx) => recordBookingClick(tx, slug, token));

  const target = destination
    ? new URL(destination)
    : new URL(token ? `/p/${slug}/thanks?r=${token}` : `/p/${slug}`, request.url);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
