import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import type { CatalogProduct } from "../../lib/catalog-types";
import { requireValidCatalog } from "../../lib/catalog-validation";

interface DimensionsMm {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
}

interface MeshyTask {
  readonly result?: string;
  readonly id?: string;
  readonly status?: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  readonly model_urls?: {
    readonly glb?: string;
    readonly usdz?: string;
  };
  readonly task_error?: {
    readonly message?: string;
  };
  readonly consumed_credits?: number;
}

interface MeshyGenerationResult {
  readonly productId: string;
  readonly consumedCredits: number;
  readonly glbPath: string;
}

interface GlbChunk {
  readonly type: number;
  readonly data: Buffer;
}

interface GlbDocument {
  readonly json: GltfJson;
  readonly chunks: readonly GlbChunk[];
}

interface GltfJson {
  readonly asset: Record<string, unknown>;
  readonly scene?: number;
  readonly scenes?: readonly { readonly nodes?: readonly number[] }[];
  readonly nodes?: readonly GltfNode[];
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly attributes?: Readonly<Record<string, number>>;
    }[];
  }[];
  readonly accessors?: readonly {
    readonly min?: readonly number[];
    readonly max?: readonly number[];
  }[];
  [key: string]: unknown;
}

interface GltfNode {
  readonly children?: readonly number[];
  readonly mesh?: number;
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly name?: string;
  [key: string]: unknown;
}

const MESHY_API = "https://api.meshy.ai/openapi/v1/image-to-3d";
const CATALOG_PATH = resolve(process.cwd(), "public/catalog.json");
const CATALOG_TEMP_PATH = `${CATALOG_PATH}.meshy.tmp`;
const GLB_DIRECTORY = resolve(process.cwd(), "public/models/glb");
const SELECTED_IDS = [
  "ikea-40178591", // LAIVA: dark, slim, visually distinctive
  "ikea-20436713", // BAGGEBO: tall white shelf
  "ikea-50481172", // BAGGEBO: open metal shelf
] as const;
const POLL_INTERVAL_MS = 8_000;
const MAX_POLLS = 180;
const JSON_CHUNK_TYPE = 0x4e4f534a;

async function main(): Promise<void> {
  const products = await readCatalog();
  const roadmapId = process.argv
    .find((argument) => argument.startsWith("--catalog-product="))
    ?.slice("--catalog-product=".length);
  const selectedIds: readonly string[] = roadmapId === undefined ? SELECTED_IDS : [roadmapId];
  const selected = selectedIds.map((id) => {
    const product = products.find((candidate) => candidate.id === id);
    if (product === undefined) {
      throw new Error(`Selected catalog product ${id} is missing.`);
    }
    if (!product.imagePath.startsWith("https://")) {
      throw new Error(`${id} does not have a retailer HTTPS image.`);
    }
    assertDimensions(product.dimensions, id);
    return product;
  });

  if (process.argv.includes("--self-test")) {
    const source = await readFile(resolve(process.cwd(), "public/models/unit-box.glb"));
    for (const product of selected) {
      const scaled = rescaleGlb(source, product.dimensions, product.id);
      assertBounds(scaled, product.dimensions, product.id);
    }
    console.log(`Self-test passed for ${selected.length} exact-dimension targets.`);
    return;
  }

  if (process.argv.includes("--verify-existing")) {
    for (const product of selected) {
      const glbPath = product.model?.glbPath;
      if (glbPath === undefined) {
        throw new Error(`${product.id} has no cached GLB metadata.`);
      }
      const glb = await readFile(resolve(process.cwd(), "public", glbPath.replace(/^\//, "")));
      assertBounds(glb, product.dimensions, product.id);
      console.log(
        `${product.id}: ${product.dimensions.widthMm} × ${product.dimensions.heightMm} × ${product.dimensions.depthMm} mm verified.`,
      );
    }
    return;
  }

  const apiKey = process.env.MESHY_API_KEY?.trim();
  if (apiKey === undefined || apiKey === "") {
    throw new Error("MESHY_API_KEY is missing or empty.");
  }
  if (process.env.ENABLE_MESHY !== "true") {
    throw new Error("ENABLE_MESHY must be true.");
  }

  await mkdir(GLB_DIRECTORY, { recursive: true });
  for (const product of selected) {
    const result = await generateProduct(apiKey, product, products);
    console.log(`MESHY_RESULT ${JSON.stringify(result)}`);
  }
}

async function generateProduct(
  apiKey: string,
  product: CatalogProduct,
  products: CatalogProduct[],
): Promise<MeshyGenerationResult> {
  const image = await fetchRequired(product.imagePath, "retailer image");
  const imageType = image.headers.get("content-type")?.split(";")[0];
  if (imageType === undefined || !/^image\/(png|jpe?g|webp)$/i.test(imageType)) {
    throw new Error(`${product.id} retailer image has unsupported content type.`);
  }
  const imageDataUrl = `data:${imageType};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
  const taskId = await createTask(apiKey, imageDataUrl);
  const task = await waitForTask(apiKey, taskId);
  const glbUrl = task.model_urls?.glb;
  if (glbUrl === undefined || !isHttpsUrl(glbUrl, ".glb")) {
    throw new Error(`${product.id} Meshy task returned no valid GLB.`);
  }

  const modelResponse = await fetchRequired(glbUrl, "Meshy GLB");
  const source = Buffer.from(await modelResponse.arrayBuffer());
  const scaled = rescaleGlb(source, product.dimensions, product.id);
  assertBounds(scaled, product.dimensions, product.id);

  const filename = `meshy-${product.id}.glb`;
  const glbPath = resolve(GLB_DIRECTORY, filename);
  const temporaryGlbPath = `${glbPath}.tmp`;
  await writeFile(temporaryGlbPath, scaled);
  await rename(temporaryGlbPath, glbPath);
  const productIndex = products.findIndex((candidate) => candidate.id === product.id);
  products[productIndex] = {
    ...product,
    model: {
      glbPath: `/models/glb/${filename}`,
      scaleVerified: true,
      nativeDimensionsMm: product.dimensions,
    },
  };
  const validated = requireValidCatalog(products);
  await writeFile(
    CATALOG_TEMP_PATH,
    `${JSON.stringify(validated, null, 2)}\n`,
  );
  await rename(CATALOG_TEMP_PATH, CATALOG_PATH);
  console.log(`${product.id}: GLB cached and exact bounds verified.`);
  return {
    productId: product.id,
    consumedCredits: task.consumed_credits ?? 0,
    glbPath: `/models/glb/${filename}`,
  };
}

async function createTask(apiKey: string, imageDataUrl: string): Promise<string> {
  const response = await fetch(MESHY_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageDataUrl,
      enable_pbr: true,
      should_remesh: true,
      should_texture: true,
      target_formats: ["glb"],
      auto_size: true,
      origin_at: "bottom",
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    if (response.status === 402) {
      throw new MeshyCreditExhaustedError(
        `Meshy create failed with HTTP 402: ${detail}`,
      );
    }
    throw new Error(
      `Meshy create failed with HTTP ${response.status}: ${detail}`,
    );
  }
  const task = (await response.json()) as MeshyTask;
  if (task.result === undefined) {
    throw new Error("Meshy create returned no task id.");
  }
  return task.result;
}

async function waitForTask(apiKey: string, taskId: string): Promise<MeshyTask> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const response = await fetch(`${MESHY_API}/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`Meshy poll failed with HTTP ${response.status}.`);
    }
    const task = (await response.json()) as MeshyTask;
    if (task.status === "SUCCEEDED") {
      return task;
    }
    if (task.status === "FAILED" || task.status === "EXPIRED") {
      throw new Error(task.task_error?.message ?? `Meshy task ${task.status.toLowerCase()}.`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, POLL_INTERVAL_MS));
  }
  throw new Error("Meshy task exceeded the polling deadline.");
}

async function fetchRequired(url: string, label: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  return response;
}

function rescaleGlb(source: Buffer, target: DimensionsMm, label: string): Buffer {
  const document = parseGlb(source);
  const sceneIndex = document.json.scene ?? 0;
  const scenes = document.json.scenes;
  const nodes = [...(document.json.nodes ?? [])];
  const scene = scenes?.[sceneIndex];
  const sceneRoots = scene?.nodes;
  if (scenes === undefined || scene === undefined || sceneRoots === undefined || sceneRoots.length === 0) {
    throw new Error(`${label} GLB has no default scene roots.`);
  }

  const sourceBounds = computeBounds(document.json, sceneRoots);
  const sourceSize = sourceBounds.getSize(new Vector3());
  if (sourceSize.x <= 0 || sourceSize.y <= 0 || sourceSize.z <= 0) {
    throw new Error(`${label} GLB has degenerate geometry.`);
  }
  const targetMeters = new Vector3(
    target.widthMm / 1000,
    target.heightMm / 1000,
    target.depthMm / 1000,
  );
  const scale = targetMeters.clone().divide(sourceSize);
  const center = sourceBounds.getCenter(new Vector3());
  const translation = new Vector3(
    -center.x * scale.x,
    -sourceBounds.min.y * scale.y,
    -center.z * scale.z,
  );
  const wrapper = new Matrix4().makeScale(scale.x, scale.y, scale.z);
  wrapper.setPosition(translation);
  const wrapperIndex = nodes.length;
  nodes.push({
    name: `Exact catalog scale: ${label}`,
    children: [...sceneRoots],
    matrix: wrapper.elements,
  });

  const nextScenes = scenes.map((candidate, index) =>
    index === sceneIndex ? { ...candidate, nodes: [wrapperIndex] } : candidate,
  );
  const nextJson: GltfJson = { ...document.json, scenes: nextScenes, nodes };
  return buildGlb({ json: nextJson, chunks: document.chunks });
}

function computeBounds(json: GltfJson, roots: readonly number[]): Box3 {
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  const bounds = new Box3();
  const visit = (nodeIndex: number, parentMatrix: Matrix4): void => {
    const node = nodes[nodeIndex];
    if (node === undefined) {
      throw new Error(`GLB references missing node ${nodeIndex}.`);
    }
    const worldMatrix = parentMatrix.clone().multiply(nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = meshes[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        const accessorIndex = primitive.attributes?.POSITION;
        const accessor = accessorIndex === undefined ? undefined : accessors[accessorIndex];
        if (
          accessor?.min === undefined ||
          accessor.max === undefined ||
          accessor.min.length < 3 ||
          accessor.max.length < 3
        ) {
          throw new Error("GLB POSITION accessor is missing min/max bounds.");
        }
        expandTransformedBox(bounds, accessor.min, accessor.max, worldMatrix);
      }
    }
    for (const child of node.children ?? []) {
      visit(child, worldMatrix);
    }
  };
  for (const root of roots) {
    visit(root, new Matrix4());
  }
  if (bounds.isEmpty()) {
    throw new Error("GLB contains no bounded mesh geometry.");
  }
  return bounds;
}

function nodeMatrix(node: GltfNode): Matrix4 {
  if (node.matrix !== undefined) {
    if (node.matrix.length !== 16) {
      throw new Error("GLB node matrix must have 16 values.");
    }
    return new Matrix4().fromArray(node.matrix);
  }
  const translation = new Vector3().fromArray(node.translation ?? [0, 0, 0]);
  const rotation = new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]);
  const scale = new Vector3().fromArray(node.scale ?? [1, 1, 1]);
  return new Matrix4().compose(translation, rotation, scale);
}

function expandTransformedBox(
  bounds: Box3,
  minimum: readonly number[],
  maximum: readonly number[],
  matrix: Matrix4,
): void {
  for (const x of [minimum[0], maximum[0]]) {
    for (const y of [minimum[1], maximum[1]]) {
      for (const z of [minimum[2], maximum[2]]) {
        bounds.expandByPoint(new Vector3(x, y, z).applyMatrix4(matrix));
      }
    }
  }
}

function assertBounds(glb: Buffer, expected: DimensionsMm, label: string): void {
  const document = parseGlb(glb);
  const scene = document.json.scenes?.[document.json.scene ?? 0];
  if (scene?.nodes === undefined) {
    throw new Error(`${label} scaled GLB has no default scene.`);
  }
  const sizeMm = computeBounds(document.json, scene.nodes).getSize(new Vector3()).multiplyScalar(1000);
  const actual = [sizeMm.x, sizeMm.y, sizeMm.z];
  const wanted = [expected.widthMm, expected.heightMm, expected.depthMm];
  actual.forEach((value, index) => {
    if (Math.abs(value - wanted[index]) > 0.1) {
      throw new Error(
        `${label} scaled bound mismatch on axis ${index}: ${value.toFixed(3)} vs ${wanted[index]} mm.`,
      );
    }
  });
}

function parseGlb(buffer: Buffer): GlbDocument {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) {
    throw new Error(`${basename(CATALOG_PATH)} model is not a GLB v2 file.`);
  }
  const chunks: GlbChunk[] = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) {
      throw new Error("GLB chunk exceeds file length.");
    }
    chunks.push({ type, data: buffer.subarray(start, end) });
    offset = end;
  }
  const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK_TYPE);
  if (jsonChunk === undefined) {
    throw new Error("GLB has no JSON chunk.");
  }
  const json = JSON.parse(jsonChunk.data.toString("utf8").replace(/\u0000+$/g, "").trim()) as GltfJson;
  return { json, chunks };
}

function buildGlb(document: GlbDocument): Buffer {
  const jsonData = pad(Buffer.from(JSON.stringify(document.json), "utf8"), 0x20);
  const chunks = document.chunks.map((chunk) =>
    chunk.type === JSON_CHUNK_TYPE ? { type: chunk.type, data: jsonData } : chunk,
  );
  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const encoded = chunks.flatMap((chunk) => {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.writeUInt32LE(chunk.data.length, 0);
    chunkHeader.writeUInt32LE(chunk.type, 4);
    return [chunkHeader, chunk.data];
  });
  return Buffer.concat([header, ...encoded]);
}

function pad(buffer: Buffer, fill: number): Buffer {
  const remainder = buffer.length % 4;
  return remainder === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)]);
}

async function readCatalog(): Promise<CatalogProduct[]> {
  const parsed = JSON.parse(await readFile(CATALOG_PATH, "utf8")) as unknown;
  return [...requireValidCatalog(parsed)];
}

function assertDimensions(dimensions: DimensionsMm, label: string): void {
  for (const [axis, value] of Object.entries(dimensions)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} has invalid ${axis}.`);
    }
  }
}

function isHttpsUrl(value: string, extension: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname.toLowerCase().endsWith(extension);
  } catch {
    return false;
  }
}

class MeshyCreditExhaustedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MeshyCreditExhaustedError";
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Meshy hero generation failed.");
  process.exitCode = error instanceof MeshyCreditExhaustedError ? 2 : 1;
});
