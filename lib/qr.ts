export interface QrCodeModule {
  readonly row: number;
  readonly col: number;
}

export interface QrCodePattern {
  readonly size: number;
  readonly modules: readonly QrCodeModule[];
}

function getHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function isFinder(row: number, col: number, originRow: number, originCol: number): boolean {
  const withinRow = row >= originRow && row < originRow + 7;
  const withinCol = col >= originCol && col < originCol + 7;

  if (!withinRow || !withinCol) {
    return false;
  }

  const localRow = row - originRow;
  const localCol = col - originCol;
  const edge = localRow === 0 || localRow === 6 || localCol === 0 || localCol === 6;
  const center = localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4;

  return edge || center;
}

export function createDeterministicQrPattern(value: string): QrCodePattern {
  const size = 29;
  const modules: QrCodeModule[] = [];
  const hash = getHash(value);

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const finder =
        isFinder(row, col, 0, 0) || isFinder(row, col, 0, size - 7) || isFinder(row, col, size - 7, 0);
      const dataBit = ((row * 31 + col * 17 + hash + ((hash >> ((row + col) % 16)) & 1)) % 5) <= 1;

      if (finder || dataBit) {
        modules.push({ row, col });
      }
    }
  }

  return { size, modules };
}
