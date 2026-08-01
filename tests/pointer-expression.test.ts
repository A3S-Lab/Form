import {
  decodePointer,
  evaluateExpression,
  expressionFieldPaths,
  type FormExpression,
  getAtPath,
  getAtPointer,
  schemaPointerToValuePath,
  setAtPath,
} from '../src/core';

describe('JSON pointer and value path helpers', () => {
  it('decodes escaped pointers and reads values', () => {
    const value = { 'a/b': { '~key': 2 }, nested: { value: 'ok' } };
    expect(decodePointer('')).toEqual([]);
    expect(decodePointer('/a~1b/~0key')).toEqual(['a/b', '~key']);
    expect(getAtPointer(value, '/a~1b/~0key')).toBe(2);
    expect(getAtPointer(value, '/missing/value')).toBeUndefined();
    expect(getAtPath(value, 'nested.value')).toBe('ok');
    expect(getAtPath(value, '')).toBe(value);
    expect(getAtPath(value, 'nested.missing.value')).toBeUndefined();
    expect(() => decodePointer('bad')).toThrow('Invalid JSON Pointer');
  });

  it('writes immutable paths and maps schema paths', () => {
    const original = { profile: { name: 'old' } };
    expect(setAtPath(original, 'profile.name', 'new')).toEqual({ profile: { name: 'new' } });
    expect(original.profile.name).toBe('old');
    expect(setAtPath({}, 'profile.name', 'new')).toEqual({ profile: { name: 'new' } });
    expect(setAtPath({}, '', { root: true })).toEqual({ root: true });
    expect(schemaPointerToValuePath('/properties/profile/properties/name')).toBe('profile.name');
    expect(schemaPointerToValuePath('/items/name')).toBeUndefined();
  });
});

describe('bounded expressions', () => {
  const value = { age: 20, role: 'admin', tags: ['a', 'b'], empty: '', enabled: true };
  const literal = (item: unknown): FormExpression => ({ op: 'literal', value: item as never });
  const field = (path: string): FormExpression => ({ op: 'field', path });
  const binary = (
    op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in',
    left: FormExpression,
    right: FormExpression,
  ): FormExpression => ({ op, left, right });

  it.each([
    [binary('eq', field('role'), literal('admin')), true],
    [binary('ne', field('role'), literal('member')), true],
    [binary('gt', field('age'), literal(18)), true],
    [binary('gte', field('age'), literal(20)), true],
    [binary('lt', field('age'), literal(21)), true],
    [binary('lte', field('age'), literal(20)), true],
    [binary('contains', field('role'), literal('min')), true],
    [binary('contains', field('tags'), literal('b')), true],
    [binary('in', field('role'), literal(['admin', 'owner'])), true],
  ])('evaluates %j', (expression, expected) => {
    expect(evaluateExpression(expression as FormExpression, value)).toBe(expected);
  });

  it('evaluates boolean composition and existence', () => {
    const expression: FormExpression = {
      op: 'all',
      values: [
        { op: 'exists', value: field('role') },
        { op: 'not', value: { op: 'exists', value: field('missing') } },
        { op: 'any', values: [literal(false), field('enabled')] },
      ],
    };
    expect(evaluateExpression(expression, value)).toBe(true);
    expect(evaluateExpression({ op: 'exists', value: field('empty') }, value)).toBe(false);
    expect(expressionFieldPaths(expression).sort()).toEqual(['enabled', 'missing', 'role']);
  });

  it('returns undefined for missing fields and enforces operation limits', () => {
    expect(evaluateExpression(field('missing'), value)).toBeUndefined();
    expect(evaluateExpression(binary('gt', literal({ object: true }), literal(1)), value)).toBe(
      false,
    );
    expect(
      evaluateExpression(binary('contains', literal({ object: true }), literal('x')), value),
    ).toBe(false);
    expect(evaluateExpression(binary('contains', literal('value'), literal(null)), value)).toBe(
      true,
    );
    expect(evaluateExpression(binary('in', literal('x'), literal('not-an-array')), value)).toBe(
      false,
    );
    expect(evaluateExpression(binary('eq', literal(null), literal(null)), value)).toBe(true);
    expect(evaluateExpression(binary('eq', literal(true), literal(true)), value)).toBe(true);
    expect(() =>
      evaluateExpression({ op: 'not', value: field('enabled') }, value, { maxOperations: 1 }),
    ).toThrow('operation limit');
  });
});
