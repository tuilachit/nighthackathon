import type { ConceptRefinement } from "./prototype-types";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

interface RefineInput {
  readonly prompt: string;
  readonly imageDataUrl?: string | null;
}

interface ChatCompletionResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | readonly { readonly type?: string; readonly text?: string }[];
    };
  }[];
}

export async function refineConceptQuestions(input: RefineInput): Promise<ConceptRefinement> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = createFallbackRefinement(input.prompt);

  if (apiKey === undefined || apiKey.trim() === "") {
    return fallback;
  }

  try {
    const raw = await requestConceptRefinement(apiKey, input);
    return normalizeRefinement(JSON.parse(raw), fallback);
  } catch (error) {
    console.warn("OpenAI concept refinement failed; using fallback questions.", error);
    return fallback;
  }
}

function createFallbackRefinement(prompt: string): ConceptRefinement {
  return {
    questions: [
      {
        id: "brand",
        label: "Brand or logo",
        placeholder: "Example: OpenAI logo on the lid, small glowing wordmark on the front",
      },
      {
        id: "colors",
        label: "Color palette",
        placeholder: "Example: matte black body, neon green LED ring, brushed silver cap",
      },
      {
        id: "materials",
        label: "Materials and finish",
        placeholder: "Example: soft-touch plastic, glass strip, rubber grip texture",
      },
      {
        id: "signature-detail",
        label: "Must-have detail",
        placeholder: "Example: visible sensor window and app sync icon",
      },
    ],
    visualDirection: "Make the object visually distinctive with explicit colors, material contrast, brand placement, and one hero feature.",
    generationBrief: `The founder wants: ${prompt}`,
    promptAdditions: [
      "Use explicit color names and material finishes.",
      "Add a visible brand mark or logo area if the founder names one.",
      "Make the main feature readable from a three-quarter product view.",
    ],
    source: "fallback",
  };
}

async function requestConceptRefinement(apiKey: string, input: RefineInput): Promise<string> {
  const content: Record<string, unknown>[] = [
    {
      type: "text",
      text: [
        "You are helping a founder give enough visual context for a text/image-to-3D product prototype.",
        "Ask only questions that materially improve the final 3D asset.",
        "Focus on color, branding/logo placement, material finish, and one or two visible product details.",
        "Do not mention any vendor or implementation API.",
        `Initial founder prompt: ${input.prompt}`,
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
          content: "Return concise founder clarification questions and a high-level generation brief. Do not include hidden reasoning.",
        },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "reality_mvp_concept_refinement",
          strict: true,
          schema: conceptRefinementSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI refinement request failed: ${response.status} ${body}`);
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

  throw new Error("OpenAI response did not include refinement content.");
}

const conceptRefinementSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          placeholder: { type: "string" },
        },
        required: ["id", "label", "placeholder"],
      },
    },
    visualDirection: { type: "string" },
    generationBrief: { type: "string" },
    promptAdditions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string" },
    },
  },
  required: ["questions", "visualDirection", "generationBrief", "promptAdditions"],
};

function normalizeRefinement(value: unknown, fallback: ConceptRefinement): ConceptRefinement {
  const objectValue = isRecord(value) ? value : {};
  const questions = Array.isArray(objectValue.questions)
    ? objectValue.questions
        .filter(isRecord)
        .map((question, index) => ({
          id: normalizeString(question.id, `question-${index + 1}`, 40),
          label: normalizeString(question.label, fallback.questions[index]?.label ?? `Detail ${index + 1}`, 120),
          placeholder: normalizeString(question.placeholder, fallback.questions[index]?.placeholder ?? "", 180),
        }))
        .slice(0, 4)
    : fallback.questions;

  return {
    questions: questions.length === 4 ? questions : fallback.questions,
    visualDirection: normalizeString(objectValue.visualDirection, fallback.visualDirection, 500),
    generationBrief: normalizeString(objectValue.generationBrief, fallback.generationBrief, 500),
    promptAdditions: normalizeStringArray(objectValue.promptAdditions, fallback.promptAdditions),
    source: "openai",
  };
}

function normalizeString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeStringArray(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const cleaned = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.slice(0, 5) : [...fallback];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
