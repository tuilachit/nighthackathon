export interface UploadValidationConfig {
  readonly maxBytes: number;
}

export type UploadValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly message: string };

export const DEFAULT_UPLOAD_CONFIG: UploadValidationConfig = {
  maxBytes: 6 * 1024 * 1024,
};

export function validateImageUpload(
  file: File,
  config: UploadValidationConfig = DEFAULT_UPLOAD_CONFIG,
): UploadValidationResult {
  if (file.size === 0) {
    return { valid: false, message: "Choose an image with content. Empty files cannot be analyzed." };
  }

  if (!file.type.startsWith("image/")) {
    return { valid: false, message: "Upload a sketch or product photo image." };
  }

  if (file.size > config.maxBytes) {
    return { valid: false, message: "Use an image under 6 MB for the mobile demo." };
  }

  return { valid: true };
}
