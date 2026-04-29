export type ProductCategory = "bottle" | "lamp" | "chair" | "box" | "device" | "unknown";

export type ModelSource = "fallback" | "generated";

export type GenerationMode = "none" | "image-to-3d" | "text-to-3d";

export type FallbackReason =
  | "none"
  | "meshy-disabled"
  | "missing-api-key"
  | "image-generation-failed"
  | "text-generation-failed"
  | "timeout"
  | "invalid-model-url"
  | "unsupported-category";

export type AnalysisStatus =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "analyzing" }
  | { kind: "ready" }
  | { kind: "failed"; message: string };

export type AssetStatus =
  | { kind: "ready" }
  | { kind: "missing"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "fallback"; reason: FallbackReason; message: string };

export type MeshyStatus =
  | { kind: "disabled"; reason: FallbackReason; message: string }
  | { kind: "pending"; mode: GenerationMode; message: string; taskId?: string; progress?: number }
  | {
      kind: "succeeded";
      mode: GenerationMode;
      message: string;
      taskId?: string;
      remoteModelUrl: string;
      remoteUsdzUrl?: string;
      thumbnailUrl?: string;
    }
  | { kind: "failed"; reason: FallbackReason; message: string; mode?: GenerationMode; taskId?: string }
  | { kind: "timeout"; message: string; mode?: GenerationMode; taskId?: string };

export type StorageStatus =
  | { kind: "unavailable"; message: string }
  | { kind: "saved"; message: string }
  | { kind: "failed"; message: string };

export type ArCompatibilityStatus =
  | { kind: "unknown"; message: string }
  | { kind: "webxr"; message: string }
  | { kind: "scene-viewer"; message: string }
  | { kind: "quick-look"; message: string }
  | { kind: "preview-only"; message: string };

export interface FeatureCallout {
  readonly label: string;
  readonly description: string;
}

export interface PrototypeModel {
  readonly glbPath: string;
  readonly iosPath?: string;
  readonly source: ModelSource;
  readonly category: ProductCategory;
  readonly generationMode: GenerationMode;
  readonly remoteModelUrl?: string;
  readonly remoteUsdzUrl?: string;
}

export interface PrototypeStatuses {
  readonly analysis: AnalysisStatus;
  readonly asset: AssetStatus;
  readonly meshy: MeshyStatus;
  readonly storage: StorageStatus;
  readonly arCompatibility: ArCompatibilityStatus;
}

export interface PrototypeSpec {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly category: ProductCategory;
  readonly shape: string;
  readonly materials: readonly string[];
  readonly features: readonly FeatureCallout[];
  readonly intendedUse: string;
  readonly refined3DPrompt: string;
  readonly model: PrototypeModel;
  readonly statuses: PrototypeStatuses;
  readonly analysis?: ProductAnalysis;
}

export interface ProductAnalysis {
  readonly category: ProductCategory;
  readonly productName: string;
  readonly shape: string;
  readonly materials: readonly string[];
  readonly features: readonly FeatureCallout[];
  readonly intendedUse: string;
  readonly refinedMeshyPrompt: string;
  readonly fallbackCategory: ProductCategory;
  readonly visualDirection: string;
  readonly generationNotes: readonly string[];
  readonly source: "openai" | "fallback";
}

export interface ConceptQuestion {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
}

export interface ConceptRefinement {
  readonly questions: readonly ConceptQuestion[];
  readonly visualDirection: string;
  readonly generationBrief: string;
  readonly promptAdditions: readonly string[];
  readonly source: "openai" | "fallback";
}

export interface GeneratedModelResult {
  readonly id: string;
  readonly mode: Exclude<GenerationMode, "none">;
  readonly status: "pending" | "succeeded" | "failed" | "timeout";
  readonly taskId?: string;
  readonly glbUrl?: string;
  readonly usdzUrl?: string;
  readonly thumbnailUrl?: string;
  readonly refinedMeshyPrompt: string;
  readonly fallbackModelPath: string;
  readonly error?: string;
  readonly progress?: number;
}

export interface BuildPackFile {
  readonly path: string;
  readonly language: string;
  readonly content: string;
  readonly warnings: readonly string[];
}

export interface BuildPack {
  readonly productId: string;
  readonly files: readonly BuildPackFile[];
}
