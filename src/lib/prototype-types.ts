export type PrototypeCategory = "bottle" | "lamp" | "chair" | "box" | "device";

export type GenerationMode = "none" | "image-to-3d" | "text-to-3d";
export type ModelSource = "fallback" | "generated";

export type FallbackReason =
  | "none"
  | "meshy-disabled"
  | "missing-api-key"
  | "image-generation-failed"
  | "text-generation-failed"
  | "timeout"
  | "invalid-model-url"
  | "unsupported-category";

export type MeshyStatus =
  | { state: "disabled"; reason: FallbackReason }
  | { state: "pending"; mode: Exclude<GenerationMode, "none"> }
  | { state: "succeeded"; mode: Exclude<GenerationMode, "none">; remoteModelUrl: string }
  | { state: "failed"; reason: FallbackReason; message: string }
  | { state: "timeout"; message: string };

export type PrototypeModel = {
  glbPath: string;
  iosPath?: string;
  fallbackGlbPath: string;
  source: ModelSource;
  category: PrototypeCategory;
  generationMode: GenerationMode;
  remoteModelUrl?: string;
};

export type PrototypeSpec = {
  id: string;
  name: string;
  prompt: string;
  category: PrototypeCategory;
  shape: string;
  materials: string[];
  features: string[];
  intendedUse: string;
  refined3DPrompt: string;
  model: PrototypeModel;
  meshy: MeshyStatus;
  fallbackReason: FallbackReason;
};

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; message: string };
