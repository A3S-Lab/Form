import {
  canonicalize,
  createWasmSha256,
  describeWasmAcceleration,
  digestDocument,
  sealDocument,
  sha256,
  sha256JavaScript,
  sha256Using,
  sha256WithAccelerator,
  wasmAccelerationStatus,
} from '../src/core';
import { createDocument } from './fixtures';

describe('canonical JSON and digest', () => {
  it('sorts object keys while preserving arrays and unicode', () => {
    expect(canonicalize({ z: [3, null, '中'], a: true })).toBe('{"a":true,"z":[3,null,"中"]}');
    expect(canonicalize({ negativeZero: -0 })).toBe('{"negativeZero":0}');
    expect(canonicalize({ a: 1, skipped: undefined } as never)).toBe('{"a":1}');
  });

  it('rejects unsupported canonical values', () => {
    expect(() => canonicalize({ value: Number.NaN } as never)).toThrow('non-finite');
    expect(() => canonicalize({ value: Number.POSITIVE_INFINITY } as never)).toThrow('non-finite');
    expect(() => canonicalize(Symbol('x') as never)).toThrow('Unsupported');
  });

  it('implements SHA-256 deterministically', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('uses the Rust WASM accelerator with parity across UTF-8 and block boundaries', () => {
    const accelerator = createWasmSha256();
    expect(accelerator).toBeDefined();
    expect(accelerator?.version).toBe('1.0.0');
    expect(accelerator?.capacity).toBe(4 * 1024 * 1024);

    for (const value of ['', 'abc', '你好，A3S', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64)]) {
      expect(accelerator?.digest(value)).toBe(sha256JavaScript(value));
    }
    expect(accelerator?.digest('x'.repeat((accelerator?.capacity ?? 0) + 1))).toBeUndefined();
    expect(sha256WithAccelerator(accelerator, 'abc')).toBe(sha256JavaScript('abc'));
    expect(sha256WithAccelerator(undefined, 'abc')).toBeUndefined();
  });

  it('reports accelerator availability and falls back safely', () => {
    const accelerator = createWasmSha256();
    expect(describeWasmAcceleration(accelerator)).toEqual({
      available: true,
      engine: 'rust-sha256',
      version: '1.0.0',
      capacity: 4 * 1024 * 1024,
    });
    expect(describeWasmAcceleration(undefined)).toEqual({
      available: false,
      engine: 'javascript',
    });
    expect(wasmAccelerationStatus()).toEqual(describeWasmAcceleration(accelerator));
    expect(createWasmSha256(null)).toBeUndefined();
    expect(createWasmSha256(WebAssembly, new Uint8Array([0]))).toBeUndefined();

    const expected = sha256JavaScript('fallback');
    expect(sha256Using('fallback', () => undefined)).toBe(expected);
    expect(sha256Using('fallback', () => 'accelerated')).toBe('accelerated');
  });

  it('seals a clone and excludes an existing digest from hashing', () => {
    const document = createDocument();
    const sealed = sealDocument(document);
    expect(sealed).not.toBe(document);
    expect(document.digest).toBeUndefined();
    expect(sealed.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(digestDocument({ ...sealed, digest: 'stale' })).toBe(sealed.digest);
  });
});
