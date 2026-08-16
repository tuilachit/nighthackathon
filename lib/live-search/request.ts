/** Raised before parsing when an HTTP request body exceeds its route budget. */
export class RequestBodyTooLargeError extends Error {
  public constructor() {
    super("The request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

/** Raised when a route that requires JSON receives malformed JSON. */
export class InvalidJsonBodyError extends Error {
  public constructor() {
    super("The request body must be valid JSON.");
    this.name = "InvalidJsonBodyError";
  }
}

/** Reads a request stream with a hard byte limit, including chunked bodies. */
export async function readBoundedText(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (request.body === null) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  const text = await readBoundedText(request, maximumBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InvalidJsonBodyError();
  }
}
