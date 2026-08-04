import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import type {
  CatalogProduct,
  ProductDimensions,
} from "../../lib/catalog-types";
import { requireValidCatalog } from "../../lib/catalog-validation";

interface GltfAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
}

interface GltfBufferView {
  readonly buffer: number;
  readonly byteLength: number;
  readonly byteOffset?: number;
  readonly byteStride?: number;
}

interface GltfPrimitive {
  readonly attributes?: Readonly<Record<string, number>>;
  readonly indices?: number;
  readonly mode?: number;
}

interface GltfNode {
  readonly children?: readonly number[];
  readonly matrix?: readonly number[];
  readonly mesh?: number;
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly translation?: readonly number[];
}

interface GltfJson {
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: readonly GltfBufferView[];
  readonly meshes?: readonly { readonly primitives?: readonly GltfPrimitive[] }[];
  readonly nodes?: readonly GltfNode[];
  readonly scene?: number;
  readonly scenes?: readonly { readonly nodes?: readonly number[] }[];
}

interface GlbDocument {
  readonly binary: Buffer;
  readonly json: GltfJson;
}

interface ConvertedMesh {
  readonly bounds: Box3;
  readonly faceVertexIndices: readonly number[];
  readonly points: readonly Vector3[];
}

interface ConversionReportItem {
  readonly productId: string;
  readonly usdzPath: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly depthMm: number;
}

const CATALOG_PATH = resolve(process.cwd(), "public/catalog.json");
const USDZ_DIRECTORY = resolve(process.cwd(), "public/models/usdz");
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BINARY_CHUNK_TYPE = 0x004e4942;
const TRIANGLES_MODE = 4;
const BOUNDS_TOLERANCE_MM = 0.1;

async function main(): Promise<void> {
  let products = await readCatalog();
  const verifyOnly = process.argv.includes("--verify-only");
  const candidates = products.filter(
    (product) =>
      product.model?.glbPath !== undefined &&
      (verifyOnly ? product.model.usdzPath !== undefined : product.model.usdzPath === undefined),
  );
  const report: ConversionReportItem[] = [];

  for (const product of candidates) {
    const model = product.model;
    if (model === undefined) {
      continue;
    }
    const filename = `${product.id}.usdz`;
    const publicPath = `/models/usdz/${filename}`;
    const outputPath = resolve(USDZ_DIRECTORY, filename);

    if (verifyOnly) {
      await verifyUsdz(outputPath, product.dimensions, product.id);
    } else {
      const source = await readFile(
        resolve(process.cwd(), "public", model.glbPath.replace(/^\//, "")),
      );
      await convertGlbToUsdz(source, outputPath, product);
      products = products.map((candidate) =>
        candidate.id === product.id
          ? {
              ...candidate,
              model: {
                ...model,
                usdzPath: publicPath,
              },
            }
          : candidate,
      );
      await writeCatalog(products);
    }

    report.push({
      productId: product.id,
      usdzPath: publicPath,
      widthMm: product.dimensions.widthMm,
      heightMm: product.dimensions.heightMm,
      depthMm: product.dimensions.depthMm,
    });
    console.log(
      `${product.id}: USDZ ${product.dimensions.widthMm} × ` +
        `${product.dimensions.heightMm} × ${product.dimensions.depthMm} mm verified.`,
    );
  }

  console.log(`USDZ_REPORT ${JSON.stringify(report)}`);
}

async function convertGlbToUsdz(
  source: Buffer,
  outputPath: string,
  product: CatalogProduct,
): Promise<void> {
  const document = parseGlb(source);
  const meshes = convertMeshes(document);
  assertCombinedBounds(meshes, product.dimensions, product.id);
  const color = productColor(product);
  const usda = createUsda(product, meshes, color);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "fitment-usdz-"));
  const usdaPath = join(temporaryDirectory, `${product.id}.usda`);
  const temporaryOutputPath = join(temporaryDirectory, `${product.id}.usdz`);

  try {
    await writeFile(usdaPath, usda, "utf8");
    runRequired("usdzip", [temporaryOutputPath, "--arkitAsset", usdaPath]);
    await verifyUsdz(temporaryOutputPath, product.dimensions, product.id);
    await rename(temporaryOutputPath, outputPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseGlb(buffer: Buffer): GlbDocument {
  if (
    buffer.length < 20 ||
    buffer.readUInt32LE(0) !== 0x46546c67 ||
    buffer.readUInt32LE(4) !== 2
  ) {
    throw new Error(`${basename(CATALOG_PATH)} model is not a GLB v2 file.`);
  }

  let json: GltfJson | undefined;
  let binary: Buffer | undefined;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) {
      throw new Error("GLB chunk exceeds file length.");
    }
    if (type === JSON_CHUNK_TYPE) {
      json = JSON.parse(
        buffer.subarray(start, end).toString("utf8").replace(/\u0000+$/g, "").trim(),
      ) as GltfJson;
    } else if (type === BINARY_CHUNK_TYPE) {
      binary = buffer.subarray(start, end);
    }
    offset = end;
  }
  if (json === undefined || binary === undefined) {
    throw new Error("GLB requires JSON and binary chunks.");
  }
  return { json, binary };
}

function convertMeshes(document: GlbDocument): readonly ConvertedMesh[] {
  const scene = document.json.scenes?.[document.json.scene ?? 0];
  if (scene?.nodes === undefined || scene.nodes.length === 0) {
    throw new Error("GLB has no default scene roots.");
  }
  const nodes = document.json.nodes ?? [];
  const meshes = document.json.meshes ?? [];
  const converted: ConvertedMesh[] = [];

  function visit(nodeIndex: number, parentMatrix: Matrix4): void {
    const node = nodes[nodeIndex];
    if (node === undefined) {
      throw new Error(`GLB references missing node ${nodeIndex}.`);
    }
    const worldMatrix = parentMatrix.clone().multiply(nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = meshes[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        const positionAccessor = primitive.attributes?.POSITION;
        if (positionAccessor === undefined) {
          continue;
        }
        if ((primitive.mode ?? TRIANGLES_MODE) !== TRIANGLES_MODE) {
          throw new Error("USDZ conversion supports triangle primitives only.");
        }
        const points = readVectorAccessor(document, positionAccessor).map(
          (point) => point.applyMatrix4(worldMatrix),
        );
        const indices =
          primitive.indices === undefined
            ? points.map((_, index) => index)
            : readScalarAccessor(document, primitive.indices);
        if (indices.length % 3 !== 0) {
          throw new Error("Triangle index count must be divisible by three.");
        }
        const bounds = new Box3().setFromPoints(points);
        converted.push({ points, faceVertexIndices: indices, bounds });
      }
    }
    for (const child of node.children ?? []) {
      visit(child, worldMatrix);
    }
  }

  for (const root of scene.nodes) {
    visit(root, new Matrix4());
  }
  if (converted.length === 0) {
    throw new Error("GLB contains no triangle geometry.");
  }
  return converted;
}

function readVectorAccessor(
  document: GlbDocument,
  accessorIndex: number,
): Vector3[] {
  const accessor = requiredAccessor(document, accessorIndex, "VEC3");
  if (accessor.componentType !== 5126) {
    throw new Error("POSITION accessors must use float32 values.");
  }
  const view = requiredBufferView(document, accessor);
  const stride = view.byteStride ?? 12;
  const baseOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, index) => {
    const offset = baseOffset + index * stride;
    return new Vector3(
      document.binary.readFloatLE(offset),
      document.binary.readFloatLE(offset + 4),
      document.binary.readFloatLE(offset + 8),
    );
  });
}

function readScalarAccessor(
  document: GlbDocument,
  accessorIndex: number,
): number[] {
  const accessor = requiredAccessor(document, accessorIndex, "SCALAR");
  const componentSize = componentByteSize(accessor.componentType);
  const view = requiredBufferView(document, accessor);
  const stride = view.byteStride ?? componentSize;
  const baseOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, index) =>
    readUnsignedComponent(
      document.binary,
      baseOffset + index * stride,
      accessor.componentType,
    ),
  );
}

function requiredAccessor(
  document: GlbDocument,
  accessorIndex: number,
  type: string,
): GltfAccessor {
  const accessor = document.json.accessors?.[accessorIndex];
  if (accessor === undefined || accessor.type !== type || accessor.bufferView === undefined) {
    throw new Error(`GLB accessor ${accessorIndex} must be a buffered ${type}.`);
  }
  return accessor;
}

function requiredBufferView(
  document: GlbDocument,
  accessor: GltfAccessor,
): GltfBufferView {
  const view = document.json.bufferViews?.[accessor.bufferView ?? -1];
  if (view === undefined || view.buffer !== 0) {
    throw new Error("GLB accessor must reference the embedded binary buffer.");
  }
  return view;
}

function componentByteSize(componentType: number): number {
  if (componentType === 5121) return 1;
  if (componentType === 5123) return 2;
  if (componentType === 5125) return 4;
  throw new Error(`Unsupported index component type ${componentType}.`);
}

function readUnsignedComponent(
  buffer: Buffer,
  offset: number,
  componentType: number,
): number {
  if (componentType === 5121) return buffer.readUInt8(offset);
  if (componentType === 5123) return buffer.readUInt16LE(offset);
  if (componentType === 5125) return buffer.readUInt32LE(offset);
  throw new Error(`Unsupported index component type ${componentType}.`);
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

function createUsda(
  product: CatalogProduct,
  meshes: readonly ConvertedMesh[],
  color: readonly [number, number, number],
): string {
  const meshPrims = meshes
    .map((mesh, index) => createMeshPrim(mesh, index, color))
    .join("\n");
  return [
    "#usda 1.0",
    "(",
    '    defaultPrim = "FitmentProduct"',
    "    metersPerUnit = 1",
    '    upAxis = "Y"',
    ")",
    "",
    'def Xform "FitmentProduct"',
    "{",
    `    custom string fitment:catalogId = "${escapeUsdString(product.id)}"`,
    `    custom string fitment:catalogDimensionsMm = "${product.dimensions.widthMm}x${product.dimensions.heightMm}x${product.dimensions.depthMm}"`,
    meshPrims,
    "}",
    "",
  ].join("\n");
}

function createMeshPrim(
  mesh: ConvertedMesh,
  index: number,
  color: readonly [number, number, number],
): string {
  const points = mesh.points.map((point) => `(${usdNumber(point.x)}, ${usdNumber(point.y)}, ${usdNumber(point.z)})`);
  const faceCounts = Array.from(
    { length: mesh.faceVertexIndices.length / 3 },
    () => "3",
  );
  return [
    `    def Mesh "Mesh_${index}"`,
    "    {",
    `        float3[] extent = [(${vectorText(mesh.bounds.min)}), (${vectorText(mesh.bounds.max)})]`,
    `        int[] faceVertexCounts = [${faceCounts.join(", ")}]`,
    `        int[] faceVertexIndices = [${mesh.faceVertexIndices.join(", ")}]`,
    `        point3f[] points = [${points.join(", ")}]`,
    `        color3f[] primvars:displayColor = [(${color.join(", ")})] (`,
    '            interpolation = "constant"',
    "        )",
    '        uniform token subdivisionScheme = "none"',
    "    }",
  ].join("\n");
}

function productColor(product: CatalogProduct): readonly [number, number, number] {
  const color = product.colors.join(" ").toLowerCase();
  if (color.includes("black")) return [0.08, 0.1, 0.09];
  if (color.includes("blue")) return [0.16, 0.3, 0.42];
  if (color.includes("green")) return [0.2, 0.38, 0.3];
  if (color.includes("red")) return [0.55, 0.16, 0.13];
  if (color.includes("brown") || color.includes("oak") || color.includes("walnut")) {
    return [0.48, 0.3, 0.16];
  }
  if (color.includes("gray") || color.includes("grey")) return [0.46, 0.48, 0.47];
  return [0.88, 0.89, 0.86];
}

async function verifyUsdz(
  usdzPath: string,
  expected: ProductDimensions,
  label: string,
): Promise<void> {
  runRequired("usdcat", ["--loadOnly", usdzPath]);
  runRequired("usdchecker", [usdzPath]);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "fitment-usdz-verify-"));
  const flattenedPath = join(temporaryDirectory, `${label}.usda`);
  try {
    runRequired("usdcat", [usdzPath, "--flatten", "-o", flattenedPath]);
    const flattened = await readFile(flattenedPath, "utf8");
    const bounds = parseUsdExtents(flattened);
    assertBounds(bounds, expected, label);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseUsdExtents(usda: string): Box3 {
  const bounds = new Box3();
  const pattern = /float3\[\]\s+extent\s*=\s*\[\(([^)]+)\),\s*\(([^)]+)\)\]/g;
  for (const match of usda.matchAll(pattern)) {
    bounds.expandByPoint(parseUsdVector(match[1]));
    bounds.expandByPoint(parseUsdVector(match[2]));
  }
  if (bounds.isEmpty()) {
    throw new Error("USDZ contains no mesh extents.");
  }
  return bounds;
}

function parseUsdVector(value: string): Vector3 {
  const numbers = value.split(",").map((component) => Number(component.trim()));
  if (numbers.length !== 3 || numbers.some((component) => !Number.isFinite(component))) {
    throw new Error(`Invalid USD vector: ${value}`);
  }
  return new Vector3(numbers[0], numbers[1], numbers[2]);
}

function assertCombinedBounds(
  meshes: readonly ConvertedMesh[],
  expected: ProductDimensions,
  label: string,
): void {
  const bounds = meshes.reduce(
    (combined, mesh) => combined.union(mesh.bounds),
    new Box3(),
  );
  assertBounds(bounds, expected, label);
}

function assertBounds(bounds: Box3, expected: ProductDimensions, label: string): void {
  const size = bounds.getSize(new Vector3()).multiplyScalar(1000);
  const actual = [size.x, size.y, size.z];
  const wanted = [expected.widthMm, expected.heightMm, expected.depthMm];
  actual.forEach((value, index) => {
    if (Math.abs(value - wanted[index]) > BOUNDS_TOLERANCE_MM) {
      throw new Error(
        `${label} USDZ bound mismatch on axis ${index}: ${value.toFixed(3)} vs ${wanted[index]} mm.`,
      );
    }
  });
}

function runRequired(command: string, arguments_: readonly string[]): void {
  const result = spawnSync(command, [...arguments_], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} failed: ${result.stderr || result.stdout || result.error?.message}`,
    );
  }
}

function vectorText(vector: Vector3): string {
  return `${usdNumber(vector.x)}, ${usdNumber(vector.y)}, ${usdNumber(vector.z)}`;
}

function usdNumber(value: number): string {
  const normalized = Math.abs(value) < 1e-10 ? 0 : value;
  return Number(normalized.toFixed(9)).toString();
}

function escapeUsdString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function readCatalog(): Promise<readonly CatalogProduct[]> {
  const parsed = JSON.parse(await readFile(CATALOG_PATH, "utf8")) as unknown;
  return requireValidCatalog(parsed);
}

async function writeCatalog(products: readonly CatalogProduct[]): Promise<void> {
  const validated = requireValidCatalog(products);
  const temporaryPath = `${CATALOG_PATH}.usdz.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  await rename(temporaryPath, CATALOG_PATH);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "USDZ conversion failed.");
  process.exitCode = 1;
});
