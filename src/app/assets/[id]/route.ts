import { NextResponse } from "next/server";
import { getPublicAsset } from "@/lib/data/public";
import { asAnon } from "@/lib/db";
import { uuidSchema } from "@/lib/validation";

/** Serves branding images (headshots, logos, hero images) stored in the database. */
export async function GET(_request: Request, { params }: RouteContext<"/assets/[id]">) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const asset = await asAnon((tx) => getPublicAsset(tx, id));
  if (!asset) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(Buffer.from(asset.data), {
    headers: {
      "Content-Type": asset.content_type,
      // Each upload gets a new id, so the bytes behind a URL never change.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
