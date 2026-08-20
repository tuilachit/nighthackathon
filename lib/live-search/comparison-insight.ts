import type { SpaceMeasurement } from "@/lib/catalog-types";
import type { DecisionCandidate } from "@/lib/live-search/types";
import { buildComparisonVerdict, shortName } from "@/lib/live-search/comparison-verdict";

/**
 * Optional model-written comparison insight. The deterministic verdict is the
 * decision support; this adds two sentences of tailored guidance on top when
 * a model key is configured. It is allowed to fail into undefined for any
 * reason — a missing key, a slow provider, or output that breaks the fact
 * gate — and the comparison stays complete without it.
 *
 * The model receives only facts the two candidates already display, and its
 * output is rejected if it contains any number that does not appear in those
 * facts, so the insight can phrase trade-offs but never invent measurements,
 * prices, or percentages.
 */

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const REQUEST_TIMEOUT_MS = 4_500;
const MAX_INSIGHT_LENGTH = 360;

export interface ComparisonInsightInput {
  readonly measurement: Pick<SpaceMeasurement, "widthMm" | "heightMm" | "depthMm">;
  readonly first: DecisionCandidate;
  readonly second: DecisionCandidate;
}

interface CandidateFacts {
  readonly name: string;
  readonly retailer: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
  readonly fitStatus: string;
  readonly minimumClearanceMm: number;
  readonly fitReasons: readonly string[];
}

function candidateFacts(candidate: DecisionCandidate): CandidateFacts {
  return {
    name: shortName(candidate),
    retailer: candidate.retailer.label,
    priceMinor: candidate.price.minor,
    currency: candidate.price.currency,
    widthMm: candidate.assembledDimensions.widthMm,
    heightMm: candidate.assembledDimensions.heightMm,
    depthMm: candidate.assembledDimensions.depthMm,
    fitStatus: candidate.fitStatus,
    minimumClearanceMm: candidate.fit.minimumClearanceMm,
    fitReasons: candidate.fit.reasons,
  };
}

/** Every digit run in the model's text must already appear in the fact payload. */
export function containsOnlyKnownNumbers(text: string, factPayload: string): boolean {
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return numbers.every((value) => factPayload.includes(value));
}

function sanitizeInsight(raw: string, factPayload: string): string | undefined {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0 || collapsed.length > MAX_INSIGHT_LENGTH) {
    return undefined;
  }
  if (/https?:\/\/|www\.|[<>{}[\]`#*_|\\]/.test(collapsed)) {
    return undefined;
  }
  if (!containsOnlyKnownNumbers(collapsed, factPayload)) {
    return undefined;
  }
  return collapsed;
}

function insightPrompt(input: ComparisonInsightInput): { system: string; user: string } {
  const verdict = buildComparisonVerdict(input.first, input.second);
  const payload = {
    spaceMm: input.measurement,
    products: [candidateFacts(input.first), candidateFacts(input.second)],
    deterministicFindings: verdict.factors.map((factor) => factor.statement),
  };
  return {
    system: [
      "You help a shopper choose between two furniture items already checked against their measured space.",
      "Use ONLY the provided facts. Never introduce a number, measurement, price, or claim that is not present in them.",
      "Answer in at most two plain sentences: which situations favour each item, or why one is the clear choice.",
      "Prices are integers in minor units (cents). No markdown, no lists, no URLs.",
    ].join("\n"),
    user: JSON.stringify(payload),
  };
}

async function askAnthropic(
  apiKey: string,
  prompt: { system: string; user: string },
  fetchImplementation: typeof fetch,
): Promise<string | undefined> {
  const response = await fetchImplementation(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: process.env.ANTHROPIC_INSIGHT_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 200,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    }),
  });
  if (!response.ok) {
    return undefined;
  }
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const content = (payload as { content?: readonly { text?: string }[] }).content;
  const text = Array.isArray(content) ? content[0]?.text : undefined;
  return typeof text === "string" ? text : undefined;
}

async function askOpenAi(
  apiKey: string,
  prompt: { system: string; user: string },
  fetchImplementation: typeof fetch,
): Promise<string | undefined> {
  const response = await fetchImplementation(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: process.env.OPENAI_INSIGHT_MODEL ?? DEFAULT_OPENAI_MODEL,
      reasoning_effort: "none",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });
  if (!response.ok) {
    return undefined;
  }
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const choices = (payload as { choices?: readonly { message?: { content?: string } }[] }).choices;
  const text = Array.isArray(choices) ? choices[0]?.message?.content : undefined;
  return typeof text === "string" ? text : undefined;
}

export async function generateComparisonInsight(
  input: ComparisonInsightInput,
  fetchImplementation: typeof fetch = fetch,
): Promise<string | undefined> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if ((anthropicKey === undefined || anthropicKey.length === 0) &&
      (openAiKey === undefined || openAiKey.length === 0)) {
    return undefined;
  }
  const prompt = insightPrompt(input);
  try {
    const raw = anthropicKey !== undefined && anthropicKey.length > 0
      ? await askAnthropic(anthropicKey, prompt, fetchImplementation)
      : await askOpenAi(openAiKey as string, prompt, fetchImplementation);
    if (raw === undefined) {
      return undefined;
    }
    return sanitizeInsight(raw, prompt.user);
  } catch {
    // A slow or failing provider must never degrade the comparison.
    return undefined;
  }
}
