import "server-only";

import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import type { ProductDimensions } from "@/lib/catalog-types";

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const MAX_GLB_BYTES = 100 * 1024 * 1024;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_CHUNKS = 16;
const MAX_NODE_VISITS = 100_000;
const MAX_POSITION_READS = 10_000_000;

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
  readonly meshes?: readonly GltfMesh[];
  readonly accessors?: readonly GltfAccessor[];
  readonly bufferViews?: readonly GltfBufferView[];
  readonly buffers?: readonly GltfBuffer[];
  readonly images?: readonly GltfImage[];
  readonly [key: string]: unknown;
}

interface GltfMesh {
  readonly primitives?: readonly GltfPrimitive[];
  readonly weights?: unknown;
  readonly extensions?: unknown;
  readonly [key: string]: unknown;
}

interface GltfPrimitive {
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly indices?: unknown;
  readonly targets?: unknown;
  readonly extensions?: unknown;
  readonly [key: string]: unknown;
}

interface GltfAccessor {
  readonly bufferView?: number;
  readonly byteOffset?: number;
  readonly componentType?: number;
  readonly count?: number;
  readonly type?: string;
  readonly normalized?: boolean;
  readonly sparse?: unknown;
  readonly [key: string]: unknown;
}

interface GltfBufferView {
  readonly buffer?: number;
  readonly byteOffset?: number;
  readonly byteLength?: number;
  readonly byteStride?: number;
  readonly extensions?: unknown;
  readonly [key: string]: unknown;
}

interface GltfBuffer {
  readonly byteLength?: number;
  readonly uri?: unknown;
  readonly [key: string]: unknown;
}

interface GltfImage {
  readonly bufferView?: number;
  readonly uri?: unknown;
  readonly [key: string]: unknown;
}

interface GltfNode {
  readonly children?: readonly number[];
  readonly mesh?: number;
  readonly matrix?: readonly number[];
  readonly translation?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: readonly number[];
  readonly skin?: unknown;
  readonly weights?: unknown;
  readonly extensions?: unknown;
  readonly name?: string;
  readonly [key: string]: unknown;
}

interface PositionReader {
  readonly count: number;
  readonly read: (index: number) => readonly [number, number, number];
}

interface ComponentReader {
  readonly bytes: number;
  readonly read: (buffer: Buffer, offset: number) => number;
  readonly normalize?: (value: number) => number;
}

const COMPONENT_READERS: Readonly<Record<number, ComponentReader>> = {
  5120: {
    bytes: 1,
    read: (buffer, offset) => buffer.readInt8(offset),
    normalize: (value) => Math.max(value / 127, -1),
  },
  5121: {
    bytes: 1,
    read: (buffer, offset) => buffer.readUInt8(offset),
    normalize: (value) => value / 255,
  },
  5122: {
    bytes: 2,
    read: (buffer, offset) => buffer.readInt16LE(offset),
    normalize: (value) => Math.max(value / 32_767, -1),
  },
  5123: {
    bytes: 2,
    read: (buffer, offset) => buffer.readUInt16LE(offset),
    normalize: (value) => value / 65_535,
  },
  5125: {
    bytes: 4,
    read: (buffer, offset) => buffer.readUInt32LE(offset),
    normalize: (value) => value / 4_294_967_295,
  },
  5126: {
    bytes: 4,
    read: (buffer, offset) => buffer.readFloatLE(offset),
  },
};

/** Wraps an embedded, self-contained GLB scene in a non-uniform scale and verifies its true vertex bounds. */
export function rescaleGlbToDimensions(
  source: Buffer,
  target: ProductDimensions,
  label: string,
): Buffer {
  assertTargetDimensions(target);
  const document = parseGlb(source);
  const { sceneIndex, scenes, roots } = defaultScene(document.json);
  const nodes = [...(document.json.nodes ?? [])];

  const sourceBounds = computeBounds(document, roots);
  const sourceSize = sourceBounds.getSize(new Vector3());
  if (sourceSize.x <= 0 || sourceSize.y <= 0 || sourceSize.z <= 0) {
    throw new Error(`${label} GLB has degenerate geometry.`);
  }
  const targetMeters = new Vector3(
    target.widthMm / 1_000,
    target.heightMm / 1_000,
    target.depthMm / 1_000,
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
    name: `Verified catalog scale: ${label}`,
    children: [...roots],
    matrix: wrapper.elements,
  });

  const nextScenes = scenes.map((candidate, index) =>
    index === sceneIndex ? { ...candidate, nodes: [wrapperIndex] } : candidate,
  );
  const scaled = buildGlb({
    json: { ...document.json, scenes: nextScenes, nodes },
    chunks: document.chunks,
  });
  assertGlbDimensions(scaled, target, label);
  return scaled;
}

/** Throws unless the GLB's true world-space vertex bounds match all catalog axes within 0.1 mm. */
export function assertGlbDimensions(
  glb: Buffer,
  expected: ProductDimensions,
  label: string,
): void {
  const actual = readGlbDimensionsMm(glb);
  const values = [
    ["width", actual.widthMm, expected.widthMm],
    ["height", actual.heightMm, expected.heightMm],
    ["depth", actual.depthMm, expected.depthMm],
  ] as const;
  for (const [axis, measured, wanted] of values) {
    if (Math.abs(measured - wanted) > 0.1) {
      throw new Error(`${label} scaled ${axis} is ${measured.toFixed(3)} mm; expected ${wanted} mm.`);
    }
  }
}

/** Reads true world-space POSITION bounds from a self-contained GLB. Accessor min/max metadata is never trusted. */
export function readGlbDimensionsMm(glb: Buffer): ProductDimensions {
  const document = parseGlb(glb);
  const { roots } = defaultScene(document.json);
  const size = computeBounds(document, roots)
    .getSize(new Vector3())
    .multiplyScalar(1_000);
  return { widthMm: size.x, heightMm: size.y, depthMm: size.z };
}

function defaultScene(json: GltfJson): {
  readonly sceneIndex: number;
  readonly scenes: readonly { readonly nodes?: readonly number[] }[];
  readonly roots: readonly number[];
} {
  const scenes = json.scenes;
  const sceneIndex = json.scene ?? 0;
  if (!Array.isArray(scenes) || !isIndex(sceneIndex) || sceneIndex >= scenes.length) {
    throw new Error("GLB has no valid default scene.");
  }
  const scene = scenes[sceneIndex];
  if (!isRecord(scene) || !isIndexArray(scene.nodes) || scene.nodes.length === 0) {
    throw new Error("GLB has no default scene roots.");
  }
  return { sceneIndex, scenes, roots: scene.nodes };
}

function computeBounds(document: GlbDocument, roots: readonly number[]): Box3 {
  const json = document.json;
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  if (!Array.isArray(nodes) || !Array.isArray(meshes)) {
    throw new Error("GLB nodes and meshes must be arrays.");
  }
  const bounds = new Box3();
  const active = new Set<number>();
  const transformed = new Vector3();
  let nodeVisits = 0;
  let positionReads = 0;

  const visit = (nodeIndex: number, parentMatrix: Matrix4): void => {
    nodeVisits += 1;
    if (nodeVisits > MAX_NODE_VISITS) {
      throw new Error("GLB node graph is too large.");
    }
    if (!isIndex(nodeIndex) || nodeIndex >= nodes.length) {
      throw new Error(`GLB references missing node ${String(nodeIndex)}.`);
    }
    if (active.has(nodeIndex)) {
      throw new Error("GLB node graph contains a cycle.");
    }
    const node = nodes[nodeIndex];
    if (!isRecord(node)) {
      throw new Error(`GLB node ${nodeIndex} is invalid.`);
    }
    if (Object.prototype.hasOwnProperty.call(node, "skin")) {
      throw new Error("Skinned GLB nodes are not supported for dimension verification.");
    }
    if (Object.prototype.hasOwnProperty.call(node, "weights")) {
      throw new Error("Morph-weighted GLB nodes are not supported for dimension verification.");
    }
    if (Object.prototype.hasOwnProperty.call(node, "extensions")) {
      throw new Error("GLB node extensions, including GPU instancing, are not supported for dimension verification.");
    }
    active.add(nodeIndex);
    const worldMatrix = parentMatrix.clone().multiply(nodeMatrix(node));
    if (node.mesh !== undefined) {
      if (!isIndex(node.mesh) || node.mesh >= meshes.length) {
        throw new Error(`GLB references missing mesh ${String(node.mesh)}.`);
      }
      const mesh = meshes[node.mesh];
      if (!isRecord(mesh) || !Array.isArray(mesh.primitives)) {
        throw new Error(`GLB mesh ${node.mesh} is invalid.`);
      }
      if (Object.prototype.hasOwnProperty.call(mesh, "weights")) {
        throw new Error("Morph-weighted GLB meshes are not supported for dimension verification.");
      }
      if (Object.prototype.hasOwnProperty.call(mesh, "extensions")) {
        throw new Error("GLB mesh extensions are not supported for dimension verification.");
      }
      for (const primitive of mesh.primitives) {
        if (!isRecord(primitive)) {
          throw new Error("GLB mesh primitive is invalid.");
        }
        if (primitive.extensions !== undefined) {
          throw new Error("GLB compressed mesh primitives are not supported for dimension verification.");
        }
        if (Object.prototype.hasOwnProperty.call(primitive, "targets")) {
          throw new Error("GLB morph targets are not supported for dimension verification.");
        }
        const attributes = primitive.attributes;
        if (!isRecord(attributes)) {
          throw new Error("GLB mesh primitive has no valid attributes.");
        }
        if (Object.keys(attributes).some((name) => name.startsWith("JOINTS_") || name.startsWith("WEIGHTS_"))) {
          throw new Error("Skinned GLB vertex attributes are not supported for dimension verification.");
        }
        const accessorIndex = attributes.POSITION;
        if (accessorIndex === undefined) {
          continue;
        }
        readPositions(document, accessorIndex, primitive.indices, (x, y, z) => {
          positionReads += 1;
          if (positionReads > MAX_POSITION_READS) {
            throw new Error("GLB contains too many POSITION values to verify safely.");
          }
          transformed.set(x, y, z).applyMatrix4(worldMatrix);
          if (![transformed.x, transformed.y, transformed.z].every(Number.isFinite)) {
            throw new Error("GLB transformed POSITION values must be finite.");
          }
          bounds.expandByPoint(transformed);
        });
      }
    }
    if (node.children !== undefined && !isIndexArray(node.children)) {
      throw new Error(`GLB node ${nodeIndex} has invalid children.`);
    }
    for (const child of node.children ?? []) {
      visit(child, worldMatrix);
    }
    active.delete(nodeIndex);
  };
  for (const root of roots) {
    visit(root, new Matrix4());
  }
  if (bounds.isEmpty()) {
    throw new Error("GLB contains no bounded mesh geometry.");
  }
  return bounds;
}

function readPositions(
  document: GlbDocument,
  accessorIndex: unknown,
  indicesAccessorIndex: unknown,
  consume: (x: number, y: number, z: number) => void,
): void {
  const positions = positionReader(document, accessorIndex);
  if (indicesAccessorIndex === undefined) {
    for (let index = 0; index < positions.count; index += 1) {
      consume(...positions.read(index));
    }
    return;
  }
  readIndices(document, indicesAccessorIndex, positions.count, (index) => {
    consume(...positions.read(index));
  });
}

function positionReader(
  document: GlbDocument,
  accessorIndex: unknown,
): PositionReader {
  const { json } = document;
  const accessors = json.accessors;
  const bufferViews = json.bufferViews;
  if (!Array.isArray(accessors) || !isIndex(accessorIndex) || accessorIndex >= accessors.length) {
    throw new Error(`GLB references missing POSITION accessor ${String(accessorIndex)}.`);
  }
  if (!Array.isArray(bufferViews)) {
    throw new Error("GLB has no valid buffer views.");
  }
  const accessor = accessors[accessorIndex];
  if (!isRecord(accessor)) {
    throw new Error(`GLB POSITION accessor ${accessorIndex} is invalid.`);
  }
  if (Object.prototype.hasOwnProperty.call(accessor, "sparse")) {
    throw new Error("Sparse GLB POSITION accessors are not supported for dimension verification.");
  }
  if (accessor.type !== "VEC3") {
    throw new Error("GLB POSITION accessor must have type VEC3.");
  }
  if (!isIndex(accessor.bufferView) || accessor.bufferView >= bufferViews.length) {
    throw new Error("GLB POSITION accessor has no valid embedded buffer view.");
  }
  if (!isPositiveSafeInteger(accessor.count)) {
    throw new Error("GLB POSITION accessor count must be a positive safe integer.");
  }
  const positionCount = accessor.count;
  if (accessor.normalized !== undefined && typeof accessor.normalized !== "boolean") {
    throw new Error("GLB POSITION accessor normalized flag is invalid.");
  }
  const component = COMPONENT_READERS[Number(accessor.componentType)];
  if (component === undefined) {
    throw new Error(`GLB POSITION component type ${String(accessor.componentType)} is unsupported.`);
  }
  if (accessor.normalized === true && component.normalize === undefined) {
    throw new Error("Floating-point GLB POSITION accessors cannot be normalized.");
  }

  const view = bufferViews[accessor.bufferView];
  if (!isRecord(view)) {
    throw new Error(`GLB buffer view ${accessor.bufferView} is invalid.`);
  }
  if (view.extensions !== undefined) {
    throw new Error("Compressed GLB buffer views are not supported for dimension verification.");
  }
  if (view.buffer !== 0) {
    throw new Error("GLB POSITION data must use the embedded binary buffer.");
  }
  const viewOffset = optionalNonNegativeSafeInteger(view.byteOffset, "buffer view byteOffset");
  const viewLength = requiredNonNegativeSafeInteger(view.byteLength, "buffer view byteLength");
  const accessorOffset = optionalNonNegativeSafeInteger(accessor.byteOffset, "accessor byteOffset");
  const elementBytes = component.bytes * 3;
  const stride = view.byteStride === undefined
    ? elementBytes
    : requiredPositiveSafeInteger(view.byteStride, "buffer view byteStride");
  if (
    stride < elementBytes ||
    (view.byteStride !== undefined && (stride > 252 || stride % 4 !== 0)) ||
    stride % component.bytes !== 0
  ) {
    throw new Error("GLB POSITION byteStride is invalid for its component type.");
  }
  if ((viewOffset + accessorOffset) % component.bytes !== 0) {
    throw new Error("GLB POSITION data is not aligned to its component size.");
  }

  const finalRelativeByte = accessorOffset + (positionCount - 1) * stride + elementBytes;
  const finalAbsoluteByte = viewOffset + finalRelativeByte;
  if (
    !Number.isSafeInteger(finalRelativeByte) ||
    !Number.isSafeInteger(finalAbsoluteByte) ||
    finalRelativeByte > viewLength
  ) {
    throw new Error("GLB POSITION accessor exceeds its buffer view.");
  }
  const bufferLength = embeddedBufferLength(json);
  const binary = binaryChunk(document);
  if (viewOffset + viewLength > bufferLength || finalAbsoluteByte > bufferLength || finalAbsoluteByte > binary.length) {
    throw new Error("GLB POSITION accessor exceeds the embedded buffer.");
  }

  const read = (index: number): readonly [number, number, number] => {
    if (!isIndex(index) || index >= positionCount) {
      throw new Error(`GLB POSITION index ${String(index)} is out of range.`);
    }
    const base = viewOffset + accessorOffset + index * stride;
    const values = [0, 1, 2].map((axis) => {
      const raw = component.read(binary, base + axis * component.bytes);
      return accessor.normalized === true ? component.normalize?.(raw) : raw;
    });
    if (values.some((value) => value === undefined || !Number.isFinite(value))) {
      throw new Error("GLB POSITION values must be finite.");
    }
    return [values[0] as number, values[1] as number, values[2] as number];
  };
  return { count: positionCount, read };
}

function readIndices(
  document: GlbDocument,
  accessorIndex: unknown,
  positionCount: number,
  consume: (index: number) => void,
): void {
  const { json } = document;
  const accessors = json.accessors;
  const bufferViews = json.bufferViews;
  if (!Array.isArray(accessors) || !isIndex(accessorIndex) || accessorIndex >= accessors.length) {
    throw new Error(`GLB references missing index accessor ${String(accessorIndex)}.`);
  }
  if (!Array.isArray(bufferViews)) {
    throw new Error("GLB has no valid buffer views.");
  }
  const accessor = accessors[accessorIndex];
  if (!isRecord(accessor)) {
    throw new Error(`GLB index accessor ${accessorIndex} is invalid.`);
  }
  if (Object.prototype.hasOwnProperty.call(accessor, "sparse")) {
    throw new Error("Sparse GLB index accessors are not supported for dimension verification.");
  }
  if (accessor.type !== "SCALAR") {
    throw new Error("GLB index accessor must have type SCALAR.");
  }
  if (!isIndex(accessor.bufferView) || accessor.bufferView >= bufferViews.length) {
    throw new Error("GLB index accessor has no valid embedded buffer view.");
  }
  if (!isPositiveSafeInteger(accessor.count) || accessor.count > MAX_POSITION_READS) {
    throw new Error("GLB index accessor count must be a bounded positive safe integer.");
  }
  if (accessor.normalized !== undefined && accessor.normalized !== false) {
    throw new Error("GLB index accessor cannot be normalized.");
  }
  const componentType = Number(accessor.componentType);
  if (componentType !== 5121 && componentType !== 5123 && componentType !== 5125) {
    throw new Error(`GLB index component type ${String(accessor.componentType)} is unsupported.`);
  }
  const component = COMPONENT_READERS[componentType];
  const view = bufferViews[accessor.bufferView];
  if (!isRecord(view)) {
    throw new Error(`GLB buffer view ${accessor.bufferView} is invalid.`);
  }
  if (view.extensions !== undefined) {
    throw new Error("Compressed GLB index buffer views are not supported for dimension verification.");
  }
  if (view.buffer !== 0) {
    throw new Error("GLB index data must use the embedded binary buffer.");
  }
  const viewOffset = optionalNonNegativeSafeInteger(view.byteOffset, "buffer view byteOffset");
  const viewLength = requiredNonNegativeSafeInteger(view.byteLength, "buffer view byteLength");
  const accessorOffset = optionalNonNegativeSafeInteger(accessor.byteOffset, "accessor byteOffset");
  const stride = view.byteStride === undefined
    ? component.bytes
    : requiredPositiveSafeInteger(view.byteStride, "buffer view byteStride");
  if (
    stride < component.bytes ||
    (view.byteStride !== undefined && (stride > 252 || stride % 4 !== 0)) ||
    stride % component.bytes !== 0
  ) {
    throw new Error("GLB index byteStride is invalid for its component type.");
  }
  if ((viewOffset + accessorOffset) % component.bytes !== 0) {
    throw new Error("GLB index data is not aligned to its component size.");
  }
  const finalRelativeByte = accessorOffset + (accessor.count - 1) * stride + component.bytes;
  const finalAbsoluteByte = viewOffset + finalRelativeByte;
  if (
    !Number.isSafeInteger(finalRelativeByte) ||
    !Number.isSafeInteger(finalAbsoluteByte) ||
    finalRelativeByte > viewLength
  ) {
    throw new Error("GLB index accessor exceeds its buffer view.");
  }
  const bufferLength = embeddedBufferLength(json);
  const binary = binaryChunk(document);
  if (viewOffset + viewLength > bufferLength || finalAbsoluteByte > bufferLength || finalAbsoluteByte > binary.length) {
    throw new Error("GLB index accessor exceeds the embedded buffer.");
  }
  for (let element = 0; element < accessor.count; element += 1) {
    const value = component.read(binary, viewOffset + accessorOffset + element * stride);
    if (!Number.isSafeInteger(value) || value < 0 || value >= positionCount) {
      throw new Error(`GLB index value ${String(value)} is out of range for ${positionCount} POSITION values.`);
    }
    consume(value);
  }
}

function nodeMatrix(node: GltfNode): Matrix4 {
  if (node.matrix !== undefined) {
    if (node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined) {
      throw new Error("GLB node cannot define both matrix and TRS transforms.");
    }
    if (
      !Array.isArray(node.matrix) ||
      node.matrix.length !== 16 ||
      node.matrix.some((value) => typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new Error("GLB node matrix must contain 16 finite values.");
    }
    if (node.matrix[3] !== 0 || node.matrix[7] !== 0 || node.matrix[11] !== 0 || node.matrix[15] !== 1) {
      throw new Error("GLB node matrix must be affine.");
    }
    return new Matrix4().fromArray(node.matrix);
  }
  const translation = finiteVector(node.translation, 3, [0, 0, 0]);
  const rotation = finiteVector(node.rotation, 4, [0, 0, 0, 1]);
  const scale = finiteVector(node.scale, 3, [1, 1, 1]);
  return new Matrix4().compose(
    new Vector3().fromArray(translation),
    new Quaternion().fromArray(rotation),
    new Vector3().fromArray(scale),
  );
}

function finiteVector<const T extends readonly number[]>(
  value: readonly number[] | undefined,
  expectedLength: number,
  fallback: T,
): readonly number[] {
  if (value === undefined) {
    return fallback;
  }
  if (
    !Array.isArray(value) ||
    value.length !== expectedLength ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    throw new Error("GLB node transform contains invalid values.");
  }
  return value;
}

function parseGlb(buffer: Buffer): GlbDocument {
  if (
    buffer.length < 20 ||
    buffer.length > MAX_GLB_BYTES ||
    buffer.readUInt32LE(0) !== GLB_MAGIC ||
    buffer.readUInt32LE(4) !== GLB_VERSION ||
    buffer.readUInt32LE(8) !== buffer.length
  ) {
    throw new Error("Model is not a complete GLB v2 file.");
  }
  const chunks: GlbChunk[] = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    if (chunks.length >= MAX_CHUNKS) {
      throw new Error("GLB contains too many chunks.");
    }
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (length % 4 !== 0 || !Number.isSafeInteger(end) || end > buffer.length) {
      throw new Error("GLB chunk exceeds file length or is not four-byte aligned.");
    }
    chunks.push({ type, data: buffer.subarray(start, end) });
    offset = end;
  }
  if (offset !== buffer.length) {
    throw new Error("GLB contains trailing or truncated bytes.");
  }
  const jsonChunks = chunks.filter((chunk) => chunk.type === JSON_CHUNK_TYPE);
  const binaryChunks = chunks.filter((chunk) => chunk.type === BIN_CHUNK_TYPE);
  if (chunks[0]?.type !== JSON_CHUNK_TYPE || jsonChunks.length !== 1) {
    throw new Error("GLB must contain exactly one leading JSON chunk.");
  }
  if (jsonChunks[0].data.length > MAX_JSON_BYTES) {
    throw new Error("GLB JSON document is too large.");
  }
  if (binaryChunks.length > 1) {
    throw new Error("GLB contains multiple binary chunks.");
  }
  const value = parseJson(jsonChunks[0].data.toString("utf8").replace(/\u0000+$/g, "").trim());
  if (!isRecord(value) || !isRecord(value.asset)) {
    throw new Error("GLB JSON document is invalid.");
  }
  const document = { json: value as GltfJson, chunks };
  validateEmbeddedResources(document);
  return document;
}

function validateEmbeddedResources(document: GlbDocument): void {
  const { accessors, asset, buffers, images, bufferViews } = document.json;
  if (asset.version !== "2.0") {
    throw new Error("GLB asset version must be 2.0.");
  }
  if (!Array.isArray(buffers) || buffers.length !== 1 || !isRecord(buffers[0])) {
    throw new Error("GLB must declare exactly one embedded binary buffer.");
  }
  if (Object.prototype.hasOwnProperty.call(buffers[0], "uri")) {
    throw new Error("External GLB buffer URIs are not allowed.");
  }
  const binary = binaryChunk(document);
  const declaredLength = embeddedBufferLength(document.json);
  if (declaredLength > binary.length || binary.length - declaredLength > 3) {
    throw new Error("GLB embedded buffer length does not match its binary chunk.");
  }
  if (bufferViews !== undefined) {
    if (!Array.isArray(bufferViews)) {
      throw new Error("GLB buffer views must be an array.");
    }
    for (const view of bufferViews) {
      if (!isRecord(view) || view.buffer !== 0) {
        throw new Error("GLB buffer view must reference the embedded binary buffer.");
      }
      const offset = optionalNonNegativeSafeInteger(view.byteOffset, "buffer view byteOffset");
      const length = requiredNonNegativeSafeInteger(view.byteLength, "buffer view byteLength");
      const end = offset + length;
      if (!Number.isSafeInteger(end) || end > declaredLength || end > binary.length) {
        throw new Error("GLB buffer view exceeds the embedded buffer.");
      }
    }
  }
  if (accessors !== undefined) {
    if (!Array.isArray(accessors)) {
      throw new Error("GLB accessors must be an array.");
    }
    for (const accessor of accessors) {
      if (!isRecord(accessor)) {
        throw new Error("GLB accessor is invalid.");
      }
      if (Object.prototype.hasOwnProperty.call(accessor, "sparse")) {
        throw new Error("Sparse GLB accessors are not supported for dimension verification.");
      }
    }
  }
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      throw new Error("GLB images must be an array.");
    }
    for (const image of images) {
      if (!isRecord(image)) {
        throw new Error("GLB image is invalid.");
      }
      if (Object.prototype.hasOwnProperty.call(image, "uri")) {
        throw new Error("External GLB image URIs are not allowed.");
      }
      if (!isIndex(image.bufferView) || !Array.isArray(bufferViews) || image.bufferView >= bufferViews.length) {
        throw new Error("Embedded GLB image has no valid buffer view.");
      }
    }
  }
}

function embeddedBufferLength(json: GltfJson): number {
  const buffer = json.buffers?.[0];
  if (!isRecord(buffer)) {
    throw new Error("GLB has no embedded buffer declaration.");
  }
  return requiredNonNegativeSafeInteger(buffer.byteLength, "embedded buffer byteLength");
}

function binaryChunk(document: GlbDocument): Buffer {
  const chunks = document.chunks.filter((chunk) => chunk.type === BIN_CHUNK_TYPE);
  if (chunks.length !== 1) {
    throw new Error("GLB must contain exactly one embedded binary chunk.");
  }
  return chunks[0].data;
}

function buildGlb(document: GlbDocument): Buffer {
  const jsonData = pad(Buffer.from(JSON.stringify(document.json), "utf8"), 0x20);
  const chunks = document.chunks.map((chunk) =>
    chunk.type === JSON_CHUNK_TYPE ? { type: chunk.type, data: jsonData } : chunk,
  );
  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  if (totalLength > MAX_GLB_BYTES) {
    throw new Error("Scaled GLB exceeds the maximum allowed size.");
  }
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(GLB_VERSION, 4);
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

function assertTargetDimensions(value: ProductDimensions): void {
  if (
    !Number.isFinite(value.widthMm) || value.widthMm <= 0 ||
    !Number.isFinite(value.heightMm) || value.heightMm <= 0 ||
    !Number.isFinite(value.depthMm) || value.depthMm <= 0
  ) {
    throw new Error("Target product dimensions must be positive finite numbers.");
  }
}

function optionalNonNegativeSafeInteger(value: unknown, label: string): number {
  return value === undefined ? 0 : requiredNonNegativeSafeInteger(value, label);
}

function requiredNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`GLB ${label} must be a non-negative safe integer.`);
  }
  return Number(value);
}

function requiredPositiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`GLB ${label} must be a positive safe integer.`);
  }
  return Number(value);
}

function isIndex(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isIndexArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isIndex);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
