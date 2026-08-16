import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertGlbDimensions,
  readGlbDimensionsMm,
  rescaleGlbToDimensions,
} from "./glb";

const fixturePath = join(process.cwd(), "public/models/unit-box.glb");
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const GLB_MAGIC = 0x46546c67;

function rewriteJson(
  source: Buffer,
  change: (json: Record<string, unknown>) => void,
): Buffer {
  const jsonLength = source.readUInt32LE(12);
  expect(source.readUInt32LE(16)).toBe(JSON_CHUNK_TYPE);
  const json = JSON.parse(
    source.subarray(20, 20 + jsonLength).toString("utf8").trim(),
  ) as Record<string, unknown>;
  change(json);
  const jsonData = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const remainder = source.subarray(20 + jsonLength);
  const output = Buffer.alloc(20 + jsonData.length + remainder.length);
  source.copy(output, 0, 0, 12);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonData.length, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  jsonData.copy(output, 20);
  remainder.copy(output, 20 + jsonData.length);
  return output;
}

function buildGlb(json: Record<string, unknown>, binary: Buffer): Buffer {
  const jsonData = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binaryData = pad(binary, 0);
  const totalLength = 12 + 8 + jsonData.length + 8 + binaryData.length;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(jsonData.length, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  jsonData.copy(output, 20);
  const binaryHeader = 20 + jsonData.length;
  output.writeUInt32LE(binaryData.length, binaryHeader);
  output.writeUInt32LE(BIN_CHUNK_TYPE, binaryHeader + 4);
  binaryData.copy(output, binaryHeader + 8);
  return output;
}

function pad(buffer: Buffer, fill: number): Buffer {
  const remainder = buffer.length % 4;
  return remainder === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)]);
}

function positionGlb(
  binary: Buffer,
  accessor: Record<string, unknown>,
  bufferView: Record<string, unknown>,
): Buffer {
  return buildGlb({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [accessor],
    bufferViews: [{ buffer: 0, ...bufferView }],
    buffers: [{ byteLength: binary.length }],
  }, binary);
}

function indexedPositionGlb(
  positions: readonly (readonly [number, number, number])[],
  indices: readonly number[],
): Buffer {
  const positionBytes = Buffer.alloc(positions.length * 12);
  positions.flat().forEach((value, index) => positionBytes.writeFloatLE(value, index * 4));
  const indexBytes = Buffer.alloc(indices.length * 2);
  indices.forEach((value, index) => indexBytes.writeUInt16LE(value, index * 2));
  const binary = Buffer.concat([positionBytes, indexBytes]);
  return buildGlb({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length },
      { buffer: 0, byteOffset: positionBytes.length, byteLength: indexBytes.length },
    ],
    buffers: [{ byteLength: binary.length }],
  }, binary);
}

describe("GLB exact-dimension processing", () => {
  it("rescales an existing model fixture to every verified catalog axis", () => {
    const source = readFileSync(fixturePath);
    const sourceBefore = Buffer.from(source);
    const target = { widthMm: 617, heightMm: 1_743, depthMm: 283 };

    const scaled = rescaleGlbToDimensions(source, target, "test product");
    const actual = readGlbDimensionsMm(scaled);

    expect(source.equals(sourceBefore)).toBe(true);
    expect(actual.widthMm).toBeCloseTo(target.widthMm, 6);
    expect(actual.heightMm).toBeCloseTo(target.heightMm, 6);
    expect(actual.depthMm).toBeCloseTo(target.depthMm, 6);
    expect(() => assertGlbDimensions(scaled, target, "test product")).not.toThrow();
  });

  it("rejects a mismatched verification target", () => {
    const scaled = rescaleGlbToDimensions(
      readFileSync(fixturePath),
      { widthMm: 600, heightMm: 1_700, depthMm: 300 },
      "test product",
    );

    expect(() => assertGlbDimensions(
      scaled,
      { widthMm: 601, heightMm: 1_700, depthMm: 300 },
      "test product",
    )).toThrow("scaled width");
  });

  it.each([
    { widthMm: 0, heightMm: 1_000, depthMm: 300 },
    { widthMm: 600, heightMm: Number.NaN, depthMm: 300 },
    { widthMm: 600, heightMm: 1_000, depthMm: -1 },
  ])("rejects invalid target dimensions", (target) => {
    expect(() => rescaleGlbToDimensions(
      readFileSync(fixturePath),
      target,
      "invalid target",
    )).toThrow("positive finite numbers");
  });

  it("rejects a truncated or non-GLB payload", () => {
    expect(() => readGlbDimensionsMm(Buffer.from("not-a-glb"))).toThrow(
      "Model is not a complete GLB v2 file.",
    );
  });

  it("ignores lying accessor min/max and uses the embedded POSITION bytes", () => {
    const dishonest = rewriteJson(readFileSync(fixturePath), (json) => {
      const accessors = json.accessors as Record<string, unknown>[];
      accessors[0].min = [-500, -500, -500];
      accessors[0].max = [500, 500, 500];
    });

    expect(readGlbDimensionsMm(dishonest)).toEqual({
      widthMm: 1_000,
      heightMm: 1_000,
      depthMm: 1_000,
    });
    const target = { widthMm: 617, heightMm: 1_743, depthMm: 283 };
    const scaled = rescaleGlbToDimensions(dishonest, target, "dishonest model");
    expect(readGlbDimensionsMm(scaled).widthMm).toBeCloseTo(target.widthMm, 6);
    expect(readGlbDimensionsMm(scaled).heightMm).toBeCloseTo(target.heightMm, 6);
    expect(readGlbDimensionsMm(scaled).depthMm).toBeCloseTo(target.depthMm, 6);
  });

  it("supports interleaved POSITION data with buffer-view and accessor offsets", () => {
    const binary = Buffer.alloc(40, 0x7f);
    [-1, -2, -3].forEach((value, axis) => binary.writeFloatLE(value, 8 + axis * 4));
    [4, 5, 6].forEach((value, axis) => binary.writeFloatLE(value, 24 + axis * 4));
    const glb = positionGlb(
      binary,
      { bufferView: 0, byteOffset: 4, componentType: 5126, count: 2, type: "VEC3" },
      { byteOffset: 4, byteLength: 36, byteStride: 16 },
    );

    expect(readGlbDimensionsMm(glb)).toEqual({
      widthMm: 5_000,
      heightMm: 7_000,
      depthMm: 9_000,
    });
  });

  it("decodes normalized integer POSITION components", () => {
    const binary = Buffer.alloc(12);
    [-32_767, 0, 32_767, 0, 32_767, -32_767].forEach((value, index) => {
      binary.writeInt16LE(value, index * 2);
    });
    const glb = positionGlb(
      binary,
      { bufferView: 0, componentType: 5122, normalized: true, count: 2, type: "VEC3" },
      { byteLength: 12 },
    );

    expect(readGlbDimensionsMm(glb)).toEqual({
      widthMm: 1_000,
      heightMm: 1_000,
      depthMm: 2_000,
    });
  });

  it("uses only vertices referenced by an indexed primitive when computing and scaling bounds", () => {
    const glb = indexedPositionGlb(
      [
        [-1, -2, -3],
        [4, 5, 6],
        [100, 200, 300],
      ],
      [0, 1],
    );

    expect(readGlbDimensionsMm(glb)).toEqual({
      widthMm: 5_000,
      heightMm: 7_000,
      depthMm: 9_000,
    });

    const target = { widthMm: 620, heightMm: 1_810, depthMm: 315 };
    const scaled = rescaleGlbToDimensions(glb, target, "indexed product");
    expect(readGlbDimensionsMm(scaled).widthMm).toBeCloseTo(target.widthMm, 6);
    expect(readGlbDimensionsMm(scaled).heightMm).toBeCloseTo(target.heightMm, 6);
    expect(readGlbDimensionsMm(scaled).depthMm).toBeCloseTo(target.depthMm, 6);
    expect(() => assertGlbDimensions(scaled, target, "indexed product")).not.toThrow();
  });

  it("rejects an index that does not reference a POSITION value", () => {
    const glb = indexedPositionGlb(
      [[0, 0, 0], [1, 1, 1]],
      [0, 2],
    );

    expect(() => readGlbDimensionsMm(glb)).toThrow(
      "GLB index value 2 is out of range for 2 POSITION values.",
    );
  });

  it.each([
    {
      name: "morph targets",
      mutate: (json: Record<string, unknown>) => {
        const meshes = json.meshes as { primitives: Record<string, unknown>[] }[];
        meshes[0].primitives[0].targets = [{ POSITION: 0 }];
      },
      message: "GLB morph targets are not supported",
    },
    {
      name: "a skinned node",
      mutate: (json: Record<string, unknown>) => {
        const nodes = json.nodes as Record<string, unknown>[];
        nodes[0].skin = 0;
      },
      message: "Skinned GLB nodes are not supported",
    },
    {
      name: "morph weights on a mesh",
      mutate: (json: Record<string, unknown>) => {
        const meshes = json.meshes as Record<string, unknown>[];
        meshes[0].weights = [0];
      },
      message: "Morph-weighted GLB meshes are not supported",
    },
    {
      name: "JOINTS vertex attributes",
      mutate: (json: Record<string, unknown>) => {
        const meshes = json.meshes as { primitives: { attributes: Record<string, unknown> }[] }[];
        meshes[0].primitives[0].attributes.JOINTS_0 = 0;
      },
      message: "Skinned GLB vertex attributes are not supported",
    },
    {
      name: "WEIGHTS vertex attributes",
      mutate: (json: Record<string, unknown>) => {
        const meshes = json.meshes as { primitives: { attributes: Record<string, unknown> }[] }[];
        meshes[0].primitives[0].attributes.WEIGHTS_0 = 0;
      },
      message: "Skinned GLB vertex attributes are not supported",
    },
    {
      name: "GPU instancing",
      mutate: (json: Record<string, unknown>) => {
        const nodes = json.nodes as Record<string, unknown>[];
        nodes[0].extensions = { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 0 } } };
      },
      message: "GLB node extensions, including GPU instancing, are not supported",
    },
    {
      name: "mesh-level geometry extensions",
      mutate: (json: Record<string, unknown>) => {
        const meshes = json.meshes as Record<string, unknown>[];
        meshes[0].extensions = { EXT_future_geometry: {} };
      },
      message: "GLB mesh extensions are not supported",
    },
    {
      name: "compressed primitive geometry",
      mutate: (json: Record<string, unknown>) => {
        const meshes = json.meshes as { primitives: Record<string, unknown>[] }[];
        meshes[0].primitives[0].extensions = { KHR_draco_mesh_compression: {} };
      },
      message: "GLB compressed mesh primitives are not supported",
    },
  ])("rejects unsupported geometry path: $name", ({ mutate, message }) => {
    const unsupported = rewriteJson(readFileSync(fixturePath), mutate);

    expect(() => readGlbDimensionsMm(unsupported)).toThrow(message);
  });

  it.each([
    {
      name: "external buffer",
      mutate: (json: Record<string, unknown>) => {
        const buffers = json.buffers as Record<string, unknown>[];
        buffers[0].uri = "https://attacker.invalid/model.bin";
      },
      message: "External GLB buffer URIs are not allowed.",
    },
    {
      name: "external image",
      mutate: (json: Record<string, unknown>) => {
        json.images = [{ uri: "https://attacker.invalid/texture.png" }];
      },
      message: "External GLB image URIs are not allowed.",
    },
    {
      name: "sparse position accessor",
      mutate: (json: Record<string, unknown>) => {
        const accessors = json.accessors as Record<string, unknown>[];
        accessors[0].sparse = { count: 1 };
      },
      message: "Sparse GLB accessors are not supported",
    },
    {
      name: "out-of-range position accessor",
      mutate: (json: Record<string, unknown>) => {
        const accessors = json.accessors as Record<string, unknown>[];
        accessors[0].byteOffset = 1_000_000;
      },
      message: "GLB POSITION accessor exceeds its buffer view.",
    },
  ])("rejects untrusted $name data", ({ mutate, message }) => {
    const malformed = rewriteJson(readFileSync(fixturePath), mutate);

    expect(() => readGlbDimensionsMm(malformed)).toThrow(message);
  });
});
