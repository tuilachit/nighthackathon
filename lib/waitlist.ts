const NOTION_API_URL = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2026-03-11";

export interface WaitlistRequest {
  readonly prototypeId: string;
  readonly productName: string;
  readonly email: string;
  readonly name?: string;
  readonly role?: string;
  readonly source: "launch-page";
}

export interface WaitlistSuccess {
  readonly ok: true;
  readonly notionPageId: string;
}

export interface WaitlistFailure {
  readonly ok: false;
  readonly error: string;
  readonly status: number;
}

export type WaitlistResult = WaitlistSuccess | WaitlistFailure;

export function parseWaitlistRequest(value: unknown): WaitlistRequest | WaitlistFailure {
  if (!isRecord(value)) {
    return failure("Waitlist request body is required.", 400);
  }

  const prototypeId = normalizeString(value.prototypeId, 120);
  const productName = normalizeString(value.productName, 160);
  const email = normalizeString(value.email, 320).toLowerCase();
  const name = normalizeOptionalString(value.name, 160);
  const role = normalizeOptionalString(value.role, 160);

  if (prototypeId.length === 0) {
    return failure("Prototype ID is required.", 400);
  }

  if (productName.length === 0) {
    return failure("Product name is required.", 400);
  }

  if (email.length === 0) {
    return failure("Email is required.", 400);
  }

  if (!isValidEmail(email)) {
    return failure("Enter a valid email address.", 400);
  }

  return {
    prototypeId,
    productName,
    email,
    name,
    role,
    source: "launch-page",
  };
}

export async function createNotionWaitlistLead(input: WaitlistRequest): Promise<WaitlistResult> {
  if (process.env.ENABLE_NOTION !== "true") {
    return failure("Notion waitlist is not enabled. Set ENABLE_NOTION=true.", 503);
  }

  const token = process.env.NOTION_TOKEN?.trim();
  const parent = getNotionParent();

  if (token === undefined || token.length === 0) {
    return failure("Missing NOTION_TOKEN.", 503);
  }

  if (parent === undefined) {
    return failure("Missing NOTION_WAITLIST_DATABASE_ID or NOTION_WAITLIST_DATA_SOURCE_ID.", 503);
  }

  const response = await fetch(NOTION_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      parent,
      properties: createNotionProperties(input),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as { readonly id?: string; readonly message?: string };

  if (!response.ok || data.id === undefined) {
    return failure(data.message ?? `Notion request failed with status ${response.status}.`, response.ok ? 502 : response.status);
  }

  return {
    ok: true,
    notionPageId: data.id,
  };
}

function getNotionParent():
  | { readonly type: "data_source_id"; readonly data_source_id: string }
  | { readonly type: "database_id"; readonly database_id: string }
  | undefined {
  const dataSourceId = process.env.NOTION_WAITLIST_DATA_SOURCE_ID?.trim();
  if (dataSourceId !== undefined && dataSourceId.length > 0) {
    return { type: "data_source_id", data_source_id: dataSourceId };
  }

  const databaseId = process.env.NOTION_WAITLIST_DATABASE_ID?.trim();
  if (databaseId !== undefined && databaseId.length > 0) {
    return { type: "database_id", database_id: databaseId };
  }

  return undefined;
}

function createNotionProperties(input: WaitlistRequest): Record<string, unknown> {
  const displayName = input.name !== undefined && input.name.length > 0 ? input.name : input.email;
  const role = input.role !== undefined && input.role.length > 0 ? input.role : "Early access";

  return {
    Name: {
      title: [{ text: { content: displayName } }],
    },
    Email: {
      email: input.email,
    },
    Product: {
      rich_text: [{ text: { content: input.productName } }],
    },
    "Prototype ID": {
      rich_text: [{ text: { content: input.prototypeId } }],
    },
    Role: {
      rich_text: [{ text: { content: role } }],
    },
    Source: {
      select: { name: input.source },
    },
    Status: {
      select: { name: "New" },
    },
    "Created At": {
      date: { start: new Date().toISOString() },
    },
  };
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeOptionalString(value: unknown, maxLength: number): string | undefined {
  const normalized = normalizeString(value, maxLength);
  return normalized.length > 0 ? normalized : undefined;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function failure(error: string, status: number): WaitlistFailure {
  return { ok: false, error, status };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
