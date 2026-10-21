export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Detects the image type from its leading bytes rather than trusting the
 * browser-supplied MIME type or file name. SVG is deliberately not accepted
 * because it can carry scripts.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type ImageCheck =
  | { ok: true; bytes: Uint8Array; contentType: ImageType }
  | { ok: false; error: string };

/** Returns null when no file was chosen. */
export async function readImageUpload(value: FormDataEntryValue | null): Promise<ImageCheck | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  if (value.size > MAX_IMAGE_BYTES) return { ok: false, error: "Images must be 2 MB or smaller." };
  const bytes = new Uint8Array(await value.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, error: "Upload a JPG, PNG or WebP image." };
  return { ok: true, bytes, contentType };
}

export function assetUrl(id: string | null | undefined): string | null {
  return id ? `/assets/${id}` : null;
}
