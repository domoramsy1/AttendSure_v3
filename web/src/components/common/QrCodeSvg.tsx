// AttendSure Web - QR Code SVG Component
// File: D:\AttendSure_V3\web\src\components\common\QrCodeSvg.tsx

/**
 * AttendSure - Zero-Dependency Local QR Code SVG Generator (ISO/IEC 18004)
 * File: web/src/components/common/QrCodeSvg.tsx
 *
 * Generates standard Byte-mode QR codes (Versions 1-10, Error Correction Level L)
 * completely inside the browser so signed student and teacher QR codes work
 * offline and never transmit sensitive tokens to external third-party servers.
 */

import React, { useMemo } from 'react';
import { QR_COLORS } from '../../theme/tokens';

type BlockGroup = readonly [blocks: number, dataCodewords: number, ecCodewords: number];

interface VersionSpec {
  version: number;
  maxBytes: number;
  totalData: number;
  groups: readonly BlockGroup[];
  alignment: readonly number[];
}

const VERSION_SPECS: readonly VersionSpec[] = [
  { version: 1, maxBytes: 17, totalData: 19, groups: [[1, 19, 7]], alignment: [] },
  { version: 2, maxBytes: 32, totalData: 34, groups: [[1, 34, 10]], alignment: [6, 18] },
  { version: 3, maxBytes: 53, totalData: 55, groups: [[1, 55, 15]], alignment: [6, 22] },
  { version: 4, maxBytes: 78, totalData: 80, groups: [[1, 80, 20]], alignment: [6, 26] },
  { version: 5, maxBytes: 106, totalData: 108, groups: [[1, 108, 26]], alignment: [6, 30] },
  { version: 6, maxBytes: 134, totalData: 136, groups: [[2, 68, 18]], alignment: [6, 34] },
  { version: 7, maxBytes: 154, totalData: 156, groups: [[2, 78, 20]], alignment: [6, 22, 38] },
  { version: 8, maxBytes: 192, totalData: 194, groups: [[2, 97, 24]], alignment: [6, 24, 42] },
  { version: 9, maxBytes: 230, totalData: 232, groups: [[2, 116, 30]], alignment: [6, 26, 46] },
  { version: 10, maxBytes: 271, totalData: 274, groups: [[2, 68, 18], [2, 69, 18]], alignment: [6, 28, 50] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

const gfMul = (a: number, b: number): number => {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
};

const rsGeneratorPoly = (degree: number): Uint8Array => {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
};

const rsComputeEc = (data: Uint8Array, ecCount: number): Uint8Array => {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
};

const computeFormatBits = (mask: number): number => {
  const data = (0b01 << 3) | (mask & 0b111); // ECC Level L = 01
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
};

const computeVersionBits = (version: number): number => {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
  }
  return (version << 12) | rem;
};

const applyMaskCheck = (mask: number, r: number, c: number): boolean => {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
};

const writeFormatBits = (grid: boolean[][], size: number, mask: number) => {
  const bits = computeFormatBits(mask);
  const topLeftCoords: Array<[number, number]> = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const splitCoords: Array<[number, number]> = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
    [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
    [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  for (let i = 0; i < 15; i++) {
    const dark = Boolean((bits >> (14 - i)) & 1);
    const [r1, c1] = topLeftCoords[i];
    const [r2, c2] = splitCoords[i];
    grid[r1][c1] = dark;
    grid[r2][c2] = dark;
  }
};

const scoreGrid = (grid: boolean[][], size: number): number => {
  let penalty = 0;
  let darkCount = 0;

  for (let r = 0; r < size; r++) {
    let rowRun = 1;
    let colRun = 1;
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) darkCount++;
      if (c > 0) {
        if (grid[r][c] === grid[r][c - 1]) rowRun++;
        else {
          if (rowRun >= 5) penalty += 3 + (rowRun - 5);
          rowRun = 1;
        }
        if (grid[c][r] === grid[c - 1][r]) colRun++;
        else {
          if (colRun >= 5) penalty += 3 + (colRun - 5);
          colRun = 1;
        }
      }
      if (r < size - 1 && c < size - 1) {
        const v = grid[r][c];
        if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) {
          penalty += 3;
        }
      }
    }
    if (rowRun >= 5) penalty += 3 + (rowRun - 5);
    if (colRun >= 5) penalty += 3 + (colRun - 5);
  }

  const ratio = (darkCount * 100) / (size * size);
  penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return penalty;
};

export function generateQrMatrix(rawValue: string): boolean[][] {
  const input = (rawValue || '').trim() || 'ATTENDSURE';
  const encoded = new TextEncoder().encode(input);
  const payloadBytes = encoded.length > 271 ? encoded.slice(0, 271) : encoded;

  const spec =
    VERSION_SPECS.find((s) => payloadBytes.length <= s.maxBytes) ||
    VERSION_SPECS[VERSION_SPECS.length - 1];

  // Build data codeword bit stream (Byte mode 0100)
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4);
  pushBits(payloadBytes.length, spec.version >= 10 ? 16 : 8);
  for (let i = 0; i < payloadBytes.length; i++) pushBits(payloadBytes[i], 8);

  const totalDataBits = spec.totalData * 8;
  const termBits = Math.min(4, totalDataBits - bits.length);
  for (let i = 0; i < termBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(spec.totalData);
  let byteIdx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes[byteIdx++] = b;
  }
  let padToggle = 0;
  while (byteIdx < spec.totalData) {
    dataBytes[byteIdx++] = padToggle === 0 ? 0xec : 0x11;
    padToggle ^= 1;
  }

  // Split blocks & compute Reed-Solomon error correction
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [blockCount, dataLen, ecLen] of spec.groups) {
    for (let b = 0; b < blockCount; b++) {
      const slice = dataBytes.slice(offset, offset + dataLen);
      offset += dataLen;
      dataBlocks.push(slice);
      ecBlocks.push(rsComputeEc(slice, ecLen));
    }
  }

  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  const ecLen = ecBlocks[0].length;
  const finalBytes: number[] = [];
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) finalBytes.push(blk[i]);
    }
  }
  for (let i = 0; i < ecLen; i++) {
    for (const ec of ecBlocks) finalBytes.push(ec[i]);
  }

  const finalBits: boolean[] = [];
  for (const byteVal of finalBytes) {
    for (let i = 7; i >= 0; i--) finalBits.push(Boolean((byteVal >> i) & 1));
  }

  const size = spec.version * 4 + 17;
  const baseGrid: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const isFunc: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    baseGrid[r][c] = dark;
    isFunc[r][c] = true;
  };

  // 1. Finder patterns + white separators
  const placeFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onOuterBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunc(r, c, inOuter && (onOuterBorder || inCore));
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. Alignment patterns
  for (const rCenter of spec.alignment) {
    for (const cCenter of spec.alignment) {
      if (isFunc[rCenter][cCenter]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFunc(rCenter + dr, cCenter + dc, dist === 0 || dist === 2);
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    if (!isFunc[6][i]) setFunc(6, i, dark);
    if (!isFunc[i][6]) setFunc(i, 6, dark);
  }

  // 4. Always-dark module + format info reservation
  setFunc(4 * spec.version + 9, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!isFunc[8][i]) setFunc(8, i, false);
    if (!isFunc[i][8]) setFunc(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, size - 1 - i, false);
    if (i < 7) setFunc(size - 1 - i, 8, false);
  }

  // 5. Version info blocks (v7+)
  if (spec.version >= 7) {
    const vBits = computeVersionBits(spec.version);
    for (let i = 0; i < 18; i++) {
      const dark = Boolean((vBits >> i) & 1);
      const a = Math.floor(i / 3);
      const b = i % 3;
      setFunc(a, size - 11 + b, dark);
      setFunc(size - 11 + b, a, dark);
    }
  }

  // 6. Zig-zag data bit placement
  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!isFunc[row][c]) {
          baseGrid[row][c] = bitIdx < finalBits.length ? finalBits[bitIdx] : false;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }

  // 7. Pick optimal mask (0..7)
  let bestGrid = baseGrid;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseGrid.map((row, r) =>
      row.map((val, c) => (isFunc[r][c] ? val : applyMaskCheck(mask, r, c) ? !val : val))
    );
    writeFormatBits(candidate, size, mask);
    const penalty = scoreGrid(candidate, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestGrid = candidate;
    }
  }

  return bestGrid;
}

export function buildQrSvgPath(matrix: boolean[][], quietZone = 4): { viewBoxSize: number; path: string } {
  const size = matrix.length;
  const parts: string[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        parts.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
      }
    }
  }
  return { viewBoxSize: size + quietZone * 2, path: parts.join('') };
}

export function buildQrSvgDataUri(value: string, size = 180): string {
  const matrix = generateQrMatrix(value);
  const { viewBoxSize, path } = buildQrSvgPath(matrix, 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${QR_COLORS.background}"/><path d="${path}" fill="${QR_COLORS.foreground}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface QrCodeSvgProps {
  value: string;
  size?: number;
  label?: string;
  style?: React.CSSProperties;
}

export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({
  value,
  size = 180,
  label = 'AttendSure QR code',
  style,
}) => {
  const { viewBoxSize, path } = useMemo(() => {
    const matrix = generateQrMatrix(value);
    return buildQrSvgPath(matrix, 4);
  }, [value]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      style={{
        display: 'block',
        backgroundColor: QR_COLORS.background,
        borderRadius: 6,
        ...style,
      }}
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill={QR_COLORS.background} />
      <path d={path} fill={QR_COLORS.foreground} />
    </svg>
  );
};

export default QrCodeSvg;
