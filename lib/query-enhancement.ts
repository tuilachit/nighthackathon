import type { FurnitureQuery } from "./catalog-types";
import { parseFurnitureQueryValue } from "./query-parser";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_QUERY_MODEL = "gpt-5.6-luna";
const MAX_QUERY_LENGTH = 500;

interface ChatCompletionResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | readonly { readonly text?: string }[];
    };
  }[];
}

export async function enhanceFurnitureQuery(
  input: string,
): Promise<FurnitureQuery | undefined> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const text = input.trim().slice(0, MAX_QUERY_LENGTH);
  if (apiKey === undefined || apiKey.length === 0 || text.length === 0) {
    return undefined;
  }

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(1_200),
      body: JSON.stringify({
        model: process.env.OPENAI_QUERY_MODEL ?? DEFAULT_QUERY_MODEL,
        reasoning_effort: "none",
        messages: [
          {
            role: "system",
            content: [
              "Extract furniture-shopping intent for a verified storage-furniture catalog.",
              "Success means returning only the requested JSON shape.",
              "Use null when category or budget is not stated. Do not invent preferences.",
              "Allowed categories are bookcase, shelving-unit, sideboard, and drawer-unit.",
            ].join("\n"),
          },
          { role: "user", content: text },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "furniture_query",
            strict: true,
            schema: furnitureQuerySchema,
          },
        },
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = readMessageContent(data);
    if (content === undefined) {
      return undefined;
    }

    return parseFurnitureQueryValue(JSON.parse(content));
  } catch {
    return undefined;
  }
}

const furnitureQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      anyOf: [
        {
          type: "string",
          enum: ["bookcase", "shelving-unit", "sideboard", "drawer-unit"],
        },
        { type: "null" },
      ],
    },
    maxPrice: {
      anyOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "null" }],
    },
    materials: { type: "array", items: { type: "string" } },
    colors: { type: "array", items: { type: "string" } },
    styles: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
  },
  required: ["category", "maxPrice", "materials", "colors", "styles", "keywords"],
};

function readMessageContent(data: ChatCompletionResponse): string | undefined {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }

  const joined = content.map((part) => part.text ?? "").join("");
  return joined.length > 0 ? joined : undefined;
}
