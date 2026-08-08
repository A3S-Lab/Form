import {
  analyzeExpression,
  decodePointer,
  evaluateExpression,
  expressionFieldPaths,
  type FormExpression,
  getAtPath,
  getAtPointer,
  removeAtPath,
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
    expect(removeAtPath({ profile: { name: 'old', role: 'admin' } }, 'profile.name')).toEqual({
      profile: { role: 'admin' },
    });
    expect(removeAtPath(original, 'profile.missing')).toEqual(original);
    expect(removeAtPath({ profile: 'not-an-object' }, 'profile.name')).toEqual({
      profile: 'not-an-object',
    });
    expect(removeAtPath(original, '')).toEqual({});
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

  it('evaluates bounded arithmetic, branching, concatenation and fallback expressions', () => {
    const arithmetic = {
      op: 'divide',
      left: {
        op: 'subtract',
        left: {
          op: 'multiply',
          left: { op: 'add', left: field('age'), right: literal(2) },
          right: literal(3),
        },
        right: literal(6),
      },
      right: literal(2),
    } as FormExpression;
    expect(evaluateExpression(arithmetic, value)).toBe(30);
    expect(
      evaluateExpression(
        {
          op: 'if',
          condition: binary('gte', field('age'), literal(18)),
          whenTrue: {
            op: 'concat',
            values: [literal('role:'), field('role')],
          },
          whenFalse: literal('minor'),
        } as FormExpression,
        value,
      ),
    ).toBe('role:admin');
    expect(
      evaluateExpression(
        {
          op: 'coalesce',
          values: [field('missing'), literal(null), field('role')],
        } as FormExpression,
        value,
      ),
    ).toBe('admin');
  });

  it('uses structural equality and reports deterministic expression failures', () => {
    expect(
      evaluateExpression(binary('eq', literal({ a: 1, b: 2 }), literal({ b: 2, a: 1 })), value),
    ).toBe(true);
    expect(
      evaluateExpression(binary('contains', literal([{ id: 1 }]), literal({ id: 1 })), value),
    ).toBe(true);
    expect(() =>
      evaluateExpression(
        { op: 'divide', left: literal(1), right: literal(0) } as FormExpression,
        value,
      ),
    ).toThrow('divide by zero');
    expect(() =>
      evaluateExpression(
        { op: 'multiply', left: literal('2'), right: literal(2) } as FormExpression,
        value,
      ),
    ).toThrow('finite numbers');
    expect(() =>
      evaluateExpression(
        {
          op: 'multiply',
          left: literal(Number.MAX_VALUE),
          right: literal(Number.MAX_VALUE),
        } as FormExpression,
        value,
      ),
    ).toThrow('result must be a finite number');
    expect(() =>
      evaluateExpression(
        { op: 'concat', values: [literal({ sensitive: false })] } as FormExpression,
        value,
      ),
    ).toThrow('JSON primitives');
    expect(
      evaluateExpression(
        { op: 'coalesce', values: [field('missing'), literal(null)] } as FormExpression,
        value,
      ),
    ).toBeUndefined();
    expect(
      evaluateExpression(
        {
          op: 'if',
          condition: literal(false),
          whenTrue: literal('yes'),
          whenFalse: literal('no'),
        } as FormExpression,
        value,
      ),
    ).toBe('no');
  });

  it('analyzes only closed expression shapes', () => {
    const expression = {
      op: 'if',
      condition: field('enabled'),
      whenTrue: { op: 'concat', values: [field('role'), literal('!')] },
      whenFalse: literal('disabled'),
    } as FormExpression;
    expect(analyzeExpression(expression)).toEqual({
      size: 6,
      fieldPaths: ['enabled', 'role'],
    });
    expect(() => analyzeExpression({ op: 'field', path: '' })).toThrow('field path');
    expect(() => analyzeExpression({ op: 'unknown' })).toThrow('operator');
    expect(() => analyzeExpression({ op: 'literal' })).toThrow('literal');
    expect(() => analyzeExpression({ op: 'all', values: 'invalid' })).toThrow('values');
    expect(() =>
      analyzeExpression({ op: 'not', value: { op: 'literal', value: true }, extra: true }),
    ).toThrow('unexpected');
  });
});
