import type { UploadValidationResult } from "./prototype-types";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function validateImageUpload(file: File): UploadValidationResult {
  if (file.size === 0) return { ok: false, message: "The selected image is empty." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: "Use an image smaller than 8 MB for the demo." };
  if (!file.type.startsWith("image/")) return { ok: false, message: "Upload a PNG, JPG, or phone camera image." };
  return { ok: true };
}
