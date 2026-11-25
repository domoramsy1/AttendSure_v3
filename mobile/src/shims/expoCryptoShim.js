// AttendSure Mobile - Expo Crypto Shim
// File: D:\AttendSure_V3\mobile\src\shims\expoCryptoShim.js

/**
 * AttendSure Mobile - Safe ExpoCrypto Shim with Pure-JS FIPS 180-4 SHA-256 Fallback
 * Prevents "[runtime not ready]: Error: Cannot find native module 'ExpoCrypto'"
 * when running in runtimes where the native ExpoCrypto module is unavailable.
 * File: mobile/src/shims/expoCryptoShim.js
 */

function loadNativeExpoCrypto() {
  try {
    const core = require('expo-modules-core');
    if (core && typeof core.requireOptionalNativeModule === 'function') {
      return core.requireOptionalNativeModule('ExpoCrypto') || null;
    }
  } catch {
    // Fall back cleanly to pure-JS implementation
  }
  return null;
}

const nativeExpoCrypto = loadNativeExpoCrypto();

export const CryptoDigestAlgorithm = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
  MD2: 'MD2',
  MD4: 'MD4',
  MD5: 'MD5',
};

export const CryptoEncoding = {
  HEX: 'hex',
  BASE64: 'base64',
};

// FIPS 180-4 SHA-256 Round Constants
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8ToBytes(input) {
  const str = String(input ?? '');
  if (typeof TextEncoder !== 'undefined') {
    try {
      return new TextEncoder().encode(str);
    } catch {
      // Fall through to manual UTF-8 encoding
    }
  }
  const out = [];
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        out.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f)
        );
        i += 1;
        continue;
      }
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function sha256Bytes(messageBytes) {
  const bytes = messageBytes instanceof Uint8Array ? messageBytes : new Uint8Array(messageBytes || []);
  const msgLen = bytes.length;
  const totalBlocks = Math.ceil((msgLen + 9) / 64);
  const padded = new Uint8Array(totalBlocks * 64);
  padded.set(bytes, 0);
  padded[msgLen] = 0x80;

  const bitLenHi = Math.floor(msgLen / 0x20000000);
  const bitLenLo = (msgLen << 3) >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLenHi, false);
  view.setUint32(padded.length - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
      const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function bytesToBase64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    const triplet = (b0 << 16) | (b1 << 8) | b2;
    result += BASE64_CHARS[(triplet >> 18) & 0x3f];
    result += BASE64_CHARS[(triplet >> 12) & 0x3f];
    result += hasB1 ? BASE64_CHARS[(triplet >> 6) & 0x3f] : '=';
    result += hasB2 ? BASE64_CHARS[triplet & 0x3f] : '=';
  }
  return result;
}

function decodeBase64ToBytes(b64) {
  const clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i]);
    const c1 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? -1 : BASE64_CHARS.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? -1 : BASE64_CHARS.indexOf(clean[i + 3]);
    if (c0 < 0 || c1 < 0) break;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) bytes.push(((c1 & 0x0f) << 4) | (c2 >> 2));
    if (c3 >= 0) bytes.push(((c2 & 0x03) << 6) | c3);
  }
  return new Uint8Array(bytes);
}

let prngState = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

function nextFallbackByte() {
  prngState = (prngState + 0x9e3779b9) >>> 0;
  let z = prngState ^ Math.floor(Math.random() * 0xffffffff);
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) & 0xff;
}

export function getRandomValues(typedArray) {
  if (!typedArray || typeof typedArray.byteLength !== 'number') {
    throw new TypeError('Expected a TypedArray argument for getRandomValues.');
  }

  if (nativeExpoCrypto && typeof nativeExpoCrypto.getRandomValues === 'function') {
    try {
      nativeExpoCrypto.getRandomValues(typedArray);
      return typedArray;
    } catch {
      // Fall through to WebCrypto / JS fallback
    }
  }

  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    try {
      return globalThis.crypto.getRandomValues(typedArray);
    } catch {
      // Fall through to JS fallback
    }
  }

  const byteView = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  for (let i = 0; i < byteView.length; i += 1) {
    byteView[i] = nextFallbackByte();
  }
  return typedArray;
}

export function getRandomBytes(byteCount) {
  const size = Math.max(0, Math.min(65536, Math.floor(Number(byteCount) || 0)));
  const bytes = new Uint8Array(size);
  if (size === 0) return bytes;
  return getRandomValues(bytes);
}

export async function getRandomBytesAsync(byteCount) {
  const size = Math.max(0, Math.min(65536, Math.floor(Number(byteCount) || 0)));
  if (size === 0) return new Uint8Array(0);

  if (nativeExpoCrypto && typeof nativeExpoCrypto.getRandomBytesAsync === 'function') {
    try {
      const nativeResult = await nativeExpoCrypto.getRandomBytesAsync(size);
      if (nativeResult instanceof Uint8Array) return nativeResult;
      if (Array.isArray(nativeResult)) return new Uint8Array(nativeResult);
      if (typeof nativeResult === 'string') return decodeBase64ToBytes(nativeResult).slice(0, size);
    } catch {
      // Fall back to getRandomBytes
    }
  }
  return getRandomBytes(size);
}

export function randomUUID() {
  if (nativeExpoCrypto && typeof nativeExpoCrypto.randomUUID === 'function') {
    try {
      const nativeUuid = nativeExpoCrypto.randomUUID();
      if (typeof nativeUuid === 'string' && nativeUuid.length >= 32) {
        return nativeUuid;
      }
    } catch {
      // Fall through
    }
  }

  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // Fall through
    }
  }

  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant 10
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function digest(algorithm, data) {
  const inputBytes =
    data instanceof Uint8Array
      ? data
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : utf8ToBytes(data);

  if (nativeExpoCrypto && typeof nativeExpoCrypto.digest === 'function') {
    try {
      return await nativeExpoCrypto.digest(algorithm, inputBytes);
    } catch {
      // Fall back to pure-JS SHA-256
    }
  }
  return sha256Bytes(inputBytes).buffer;
}

export async function digestStringAsync(algorithm, data, options = {}) {
  const encoding = options?.encoding || CryptoEncoding.HEX;
  const text = String(data ?? '');

  if (nativeExpoCrypto && typeof nativeExpoCrypto.digestStringAsync === 'function') {
    try {
      return await nativeExpoCrypto.digestStringAsync(algorithm, text, { encoding });
    } catch {
      // Fall back to pure-JS SHA-256
    }
  }

  const digestBytes = sha256Bytes(utf8ToBytes(text));
  if (encoding === CryptoEncoding.BASE64) {
    return bytesToBase64(digestBytes);
  }
  return bytesToHex(digestBytes);
}

export default {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  getRandomValues,
  getRandomBytes,
  getRandomBytesAsync,
  randomUUID,
  digest,
  digestStringAsync,
};
