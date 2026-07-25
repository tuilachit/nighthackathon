import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Cuboid {
  readonly center: Point3;
  readonly size: Point3;
}

interface HeroModel {
  readonly filename: string;
  readonly dimensionsMm: Point3;
  readonly color: readonly [number, number, number];
  readonly usdz: boolean;
}

const heroModels: readonly HeroModel[] = [
  {
    filename: "ikea-laiva",
    dimensionsMm: { x: 619, y: 1651, z: 241 },
    color: [0.18, 0.12, 0.08],
    usdz: true,
  },
  {
    filename: "ikea-baggebo-tall",
    dimensionsMm: { x: 499, y: 1600, z: 251 },
    color: [0.88, 0.88, 0.84],
    usdz: false,
  },
  {
    filename: "target-dorm-3-white",
    dimensionsMm: { x: 622, y: 914, z: 240 },
    color: [0.9, 0.88, 0.82],
    usdz: true,
  },
  {
    filename: "target-dorm-3-black",
    dimensionsMm: { x: 622, y: 914, z: 240 },
    color: [0.12, 0.12, 0.11],
    usdz: false,
  },
  {
    filename: "wayfair-ebern-oak",
    dimensionsMm: { x: 610, y: 1753, z: 231 },
    color: [0.55, 0.32, 0.16],
    usdz: true,
  },
  {
    filename: "wayfair-ebern-black",
    dimensionsMm: { x: 610, y: 1753, z: 231 },
    color: [0.1, 0.1, 0.09],
    usdz: false,
  },
];

const normalizedCuboids: readonly Cuboid[] = [
  { center: { x: -0.47, y: 0.5, z: 0 }, size: { x: 0.06, y: 1, z: 1 } },
  { center: { x: 0.47, y: 0.5, z: 0 }, size: { x: 0.06, y: 1, z: 1 } },
  { center: { x: 0, y: 0.03, z: 0 }, size: { x: 0.88, y: 0.06, z: 1 } },
  { center: { x: 0, y: 0.97, z: 0 }, size: { x: 0.88, y: 0.06, z: 1 } },
  { center: { x: 0, y: 0.265, z: 0 }, size: { x: 0.88, y: 0.04, z: 1 } },
  { center: { x: 0, y: 0.5, z: 0 }, size: { x: 0.88, y: 0.04, z: 1 } },
  { center: { x: 0, y: 0.735, z: 0 }, size: { x: 0.88, y: 0.04, z: 1 } },
  { center: { x: 0, y: 0.5, z: 0.47 }, size: { x: 0.88, y: 0.88, z: 0.06 } },
];

const glbOutputDirectory = resolve(process.cwd(), "public/models/glb");
const usdzOutputDirectory = resolve(process.cwd(), "public/models/usdz");
const usdaOutputDirectory = resolve(process.cwd(), "scripts/catalog/generated-usda");
mkdirSync(glbOutputDirectory, { recursive: true });
mkdirSync(usdzOutputDirectory, { recursive: true });
mkdirSync(usdaOutputDirectory, { recursive: true });

for (const model of heroModels) {
  writeFileSync(
    resolve(glbOutputDirectory, `${model.filename}.glb`),
    createGlb(model),
  );
  if (model.usdz) {
    createUsdz(model);
  }
}

function createGlb(model: HeroModel): Buffer {
  const dimensionsMeters = scalePoint(model.dimensionsMm, 0.001);
  const cuboids = normalizedCuboids.map((cuboid) => ({
    center: multiplyPoints(cuboid.center, dimensionsMeters),
    size: multiplyPoints(cuboid.size, dimensionsMeters),
  }));
  const positions: number[] = [];
  const indices: number[] = [];
  for (const cuboid of cuboids) {
    appendCuboid(cuboid, positions, indices);
  }

  const positionBytes = Buffer.from(new Float32Array(positions).buffer);
  const indexBytes = Buffer.from(new Uint32Array(indices).buffer);
  const binaryChunk = padBuffer(Buffer.concat([positionBytes, indexBytes]), 4, 0);
  const json = {
    asset: { version: "2.0", generator: "Night Hack exact-scale shelf generator" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: model.filename }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: model.filename,
        pbrMetallicRoughness: {
          baseColorFactor: [...model.color, 1],
          metallicFactor: 0,
          roughnessFactor: 0.72,
        },
      },
    ],
    buffers: [{ byteLength: binaryChunk.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: positionBytes.length,
        byteLength: indexBytes.length,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [-dimensionsMeters.x / 2, 0, -dimensionsMeters.z / 2],
        max: [dimensionsMeters.x / 2, dimensionsMeters.y, dimensionsMeters.z / 2],
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: indices.length,
        type: "SCALAR",
        min: [0],
        max: [positions.length / 3 - 1],
      },
    ],
  };
  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(json), "utf8"), 4, 0x20);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binaryChunk.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]);
}

function createUsdz(model: HeroModel): void {
  const dimensionsMeters = scalePoint(model.dimensionsMm, 0.001);
  const primName = model.filename.replaceAll("-", "_");
  const prims = normalizedCuboids
    .map((cuboid, index) => {
      const center = multiplyPoints(cuboid.center, dimensionsMeters);
      const size = multiplyPoints(cuboid.size, dimensionsMeters);
      return [
        `    def Cube "Part${index + 1}"`,
        "    {",
        "        double size = 1",
        `        color3f[] primvars:displayColor = [(${model.color.join(", ")})]`,
        `        double3 xformOp:translate = (${center.x}, ${center.y}, ${center.z})`,
        `        float3 xformOp:scale = (${size.x}, ${size.y}, ${size.z})`,
        '        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]',
        "    }",
      ].join("\n");
    })
    .join("\n");
  const usdaPath = resolve(usdaOutputDirectory, `${model.filename}.usda`);
  const usdzPath = resolve(usdzOutputDirectory, `${model.filename}.usdz`);
  writeFileSync(
    usdaPath,
    [
      "#usda 1.0",
      "(",
      `    defaultPrim = "${primName}"`,
      "    metersPerUnit = 1",
      '    upAxis = "Y"',
      ")",
      "",
      `def Xform "${primName}"`,
      "{",
      prims,
      "}",
      "",
    ].join("\n"),
  );

  const result = spawnSync("usdzip", [usdzPath, "--arkitAsset", usdaPath], {
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`Could not create ${model.filename}.usdz: ${result.stderr || result.error}`);
  }
}

function appendCuboid(cuboid: Cuboid, targetPositions: number[], targetIndices: number[]): void {
  const baseIndex = targetPositions.length / 3;
  const half = scalePoint(cuboid.size, 0.5);
  const vertices: readonly Point3[] = [
    { x: -half.x, y: -half.y, z: -half.z },
    { x: half.x, y: -half.y, z: -half.z },
    { x: half.x, y: half.y, z: -half.z },
    { x: -half.x, y: half.y, z: -half.z },
    { x: -half.x, y: -half.y, z: half.z },
    { x: half.x, y: -half.y, z: half.z },
    { x: half.x, y: half.y, z: half.z },
    { x: -half.x, y: half.y, z: half.z },
  ];
  for (const vertex of vertices) {
    targetPositions.push(
      vertex.x + cuboid.center.x,
      vertex.y + cuboid.center.y,
      vertex.z + cuboid.center.z,
    );
  }
  const localIndices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    3, 2, 6, 3, 6, 7,
    1, 5, 6, 1, 6, 2,
    0, 3, 7, 0, 7, 4,
  ];
  targetIndices.push(...localIndices.map((index) => index + baseIndex));
}

function multiplyPoints(left: Point3, right: Point3): Point3 {
  return { x: left.x * right.x, y: left.y * right.y, z: left.z * right.z };
}

function scalePoint(point: Point3, scalar: number): Point3 {
  return { x: point.x * scalar, y: point.y * scalar, z: point.z * scalar };
}

function padBuffer(buffer: Buffer, alignment: number, fill: number): Buffer {
  const remainder = buffer.length % alignment;
  if (remainder === 0) {
    return buffer;
  }
  return Buffer.concat([buffer, Buffer.alloc(alignment - remainder, fill)]);
}
