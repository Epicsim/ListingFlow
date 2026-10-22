import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

const logo = await readFile(join(process.cwd(), "public/brand/listingflow-logo-v1.png"));

export default function Icon() {
  // Frame only the symbol from the approved artwork, keeping it centered with
  // breathing room. Next.js renders and caches the small PNG at build time.
  const scale = size.width / 480;

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <img
        src={`data:image/png;base64,${logo.toString("base64")}`}
        alt=""
        width={2172 * scale}
        height={724 * scale}
        style={{ position: "absolute", left: -112 * scale, top: -124 * scale }}
      />
    </div>,
    size,
  );
}
