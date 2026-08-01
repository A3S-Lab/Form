import { canonicalize, digestDocument, sealDocument, sha256 } from '../src/core';
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

  it('seals a clone and excludes an existing digest from hashing', () => {
    const document = createDocument();
    const sealed = sealDocument(document);
    expect(sealed).not.toBe(document);
    expect(document.digest).toBeUndefined();
    expect(sealed.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(digestDocument({ ...sealed, digest: 'stale' })).toBe(sealed.digest);
  });
});
