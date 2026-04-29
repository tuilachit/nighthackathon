import { createFallbackAnalysis } from "./analyzer";
import type { FeatureCallout, ProductAnalysis, ProductCategory } from "./prototype-types";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const SUPPORTED_CATEGORIES = ["bottle", "lamp", "chair", "box", "device", "unknown"] as const satisfies readonly ProductCategory[];

interface AnalyzeInput {
  readonly prompt: string;
  readonly imageDataUrl?: string | null;
  readonly founderContext?: string;
}

interface ChatCompletionResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | readonly { readonly type?: string; readonly text?: string }[];
    };
  }[];
}

export async function analyzeProductConcept(input: AnalyzeInput): Promise<ProductAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = createFallbackAnalysis(input.prompt);

  if (apiKey === undefined || apiKey.trim() === "") {
    return fallback;
  }

  try {
    const raw = await requestOpenAIAnalysis(apiKey, input);
    return normalizeAnalysis(JSON.parse(raw), fallback);
  } catch (error) {
    console.warn("OpenAI product analysis failed; using fallback analysis.", error);
    return fallback;
  }
}

async function requestOpenAIAnalysis(apiKey: string, input: AnalyzeInput): Promise<string> {
  const content: Record<string, unknown>[] = [
    {
      type: "text",
      text: [
        "Analyze this rough product concept for a hackathon AR prototype.",
        "Return concise fields that can drive high-fidelity text/image-to-3D generation.",
        "Keep the object as one centered physical product with no scene or background.",
        "Do not ask for or emphasize color palette, branding, logo placement, or visual identity.",
        "The refined prompt must focus on the physical object: silhouette, proportions, materials, surface texture, visible parts, controls, seams, openings, grips, attachments, and hero functional details.",
        `User prompt: ${input.prompt}`,
        input.founderContext !== undefined && input.founderContext.trim() !== "" ? `Founder clarifications:\n${input.founderContext}` : "",
      ].join("\n"),
    },
  ];

  if (input.imageDataUrl !== undefined && input.imageDataUrl !== null) {
    content.push({
      type: "image_url",
      image_url: { url: input.imageDataUrl, detail: "low" },
    });
  }

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL ?? "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content: "You convert rough product sketches and founder answers into structured product analysis for a 3D generation pipeline.",
        },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "reality_mvp_product_analysis",
          strict: true,
          schema: productAnalysisSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const contentValue = data.choices?.[0]?.message?.content;
  if (typeof contentValue === "string") {
    return contentValue;
  }

  if (Array.isArray(contentValue)) {
    const text = contentValue.map((part) => part.text ?? "").join("");
    if (text.length > 0) {
      return text;
    }
  }

  throw new Error("OpenAI response did not include analysis content.");
}

const productAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: SUPPORTED_CATEGORIES },
    productName: { type: "string" },
    shape: { type: "string" },
    materials: { type: "array", items: { type: "string" } },
    features: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          description: { type: "string" },
        },
        required: ["label", "description"],
      },
    },
    intendedUse: { type: "string" },
    refinedMeshyPrompt: { type: "string" },
    fallbackCategory: { type: "string", enum: SUPPORTED_CATEGORIES },
    visualDirection: { type: "string" },
    generationNotes: { type: "array", items: { type: "string" } },
  },
  required: [
    "category",
    "productName",
    "shape",
    "materials",
    "features",
    "intendedUse",
    "refinedMeshyPrompt",
    "fallbackCategory",
    "visualDirection",
    "generationNotes",
  ],
};

function normalizeAnalysis(value: unknown, fallback: ProductAnalysis): ProductAnalysis {
  const objectValue = isRecord(value) ? value : {};
  const category = normalizeCategory(objectValue.category, fallback.category);
  const fallbackCategory = normalizeCategory(objectValue.fallbackCategory, category);

  return {
    category,
    productName: normalizeString(objectValue.productName, fallback.productName, 120),
    shape: normalizeString(objectValue.shape, fallback.shape, 300),
    materials: normalizeStringArray(objectValue.materials, fallback.materials, 6),
    features: normalizeFeatures(objectValue.features, fallback.features),
    intendedUse: normalizeString(objectValue.intendedUse, fallback.intendedUse, 300),
    refinedMeshyPrompt: normalizeString(objectValue.refinedMeshyPrompt, fallback.refinedMeshyPrompt, 1200),
    fallbackCategory,
    visualDirection: normalizeString(objectValue.visualDirection, fallback.visualDirection, 500),
    generationNotes: normalizeStringArray(objectValue.generationNotes, fallback.generationNotes, 5),
    source: "openai",
  };
}

function normalizeCategory(value: unknown, fallback: ProductCategory): ProductCategory {
  return SUPPORTED_CATEGORIES.includes(value as ProductCategory) ? (value as ProductCategory) : fallback;
}

function normalizeString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeStringArray(value: unknown, fallback: readonly string[], maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const cleaned = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.slice(0, maxItems) : [...fallback];
}

function normalizeFeatures(value: unknown, fallback: readonly FeatureCallout[]): FeatureCallout[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const cleaned = value
    .filter(isRecord)
    .map((feature, index) => ({
      label: normalizeString(feature.label, fallback[index]?.label ?? `Feature ${index + 1}`, 80),
      description: normalizeString(feature.description, fallback[index]?.description ?? "Visible product detail.", 160),
    }))
    .slice(0, 5);

  return cleaned.length > 0 ? cleaned : [...fallback];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
