/**
 * AttendSure - Buffer Polyfill Shim
 * File: mobile/src/shims/buffer.js
 */

let BufferClass;

try {
  BufferClass = require('buffer/').Buffer;
} catch (e1) {
  try {
    BufferClass = require('buffer').Buffer;
  } catch (e2) {
    BufferClass = global.Buffer;
  }
}

if (!BufferClass) {
  BufferClass = class Buffer {
    constructor(arg) {
      this.data = arg;
    }
    static from(data) {
      return {
        toString: () => String(data),
      };
    }
    static isBuffer() {
      return false;
    }
  };
}

if (typeof global !== 'undefined' && !global.Buffer) {
  global.Buffer = BufferClass;
}

module.exports = {
  Buffer: BufferClass,
  default: { Buffer: BufferClass },
};
