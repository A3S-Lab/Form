import {
  assertCompiled,
  type FormDocument,
  fieldState,
  readFormValue,
  updateFormValue,
  validateFormValue,
} from '../src/core';
import { createDocument } from './fixtures';

function planFor(document: FormDocument = createDocument()) {
  return assertCompiled(document);
}

describe('headless form state', () => {
  it('reads and immutably updates controlled values', () => {
    const value = { profile: { name: '旧值' } };
    const next = updateFormValue(value, 'profile.name', '新值');
    expect(readFormValue(next, 'profile.name')).toBe('新值');
    expect(readFormValue(next, 'missing')).toBeUndefined();
    expect(value.profile.name).toBe('旧值');
  });

  it('validates required, type and numeric constraints', () => {
    const errors = validateFormValue(planFor(), {
      age: 17.5,
      active: 'yes',
      role: 'owner',
    } as never);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'name', code: 'required' }),
        expect.objectContaining({ path: 'age', code: 'type' }),
        expect.objectContaining({ path: 'active', code: 'type' }),
        expect.objectContaining({ path: 'role', code: 'enum' }),
      ]),
    );

    const below = validateFormValue(planFor(), { name: '张三', age: 17 });
    expect(below).toContainEqual(expect.objectContaining({ code: 'minimum' }));
    const document = createDocument();
    (
      document.schema.properties?.age as NonNullable<typeof document.schema.properties>[string]
    ).maximum = 65;
    expect(validateFormValue(planFor(document), { name: '张三', age: 66 })).toContainEqual(
      expect.objectContaining({ code: 'maximum' }),
    );
  });

  it('validates string length, pattern, email and invalid schema patterns', () => {
    const document = createDocument();
    document.schema.properties = {
      ...document.schema.properties,
      name: { type: 'string', minLength: 2, maxLength: 3, pattern: '^[A-Z]+$', format: 'email' },
    };
    document.schema.required = ['name'];
    const plan = planFor(document);
    const result = validateFormValue(plan, { name: 'toolong' });
    expect(result.map((item) => item.code)).toEqual(
      expect.arrayContaining(['maxLength', 'pattern', 'format.email']),
    );
    expect(validateFormValue(plan, { name: 'A' }).map((item) => item.code)).toContain('minLength');

    const defensivePlan = structuredClone(plan);
    defensivePlan.schema.properties = {
      ...defensivePlan.schema.properties,
      broken: { type: 'string', pattern: '[' },
    };
    expect(validateFormValue(defensivePlan, { name: 'A@b.co', broken: 'x' })).toContainEqual(
      expect.objectContaining({ path: 'broken', code: 'pattern.invalid' }),
    );
  });

  it('validates arrays and nested objects', () => {
    const document = createDocument();
    document.rules = [];
    document.schema = {
      type: 'object',
      required: ['profile'],
      properties: {
        profile: {
          type: 'object',
          required: ['city'],
          properties: { city: { type: 'string' } },
        },
        tags: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
      },
    };
    document.ui.nodes[1].schemaPath = '/properties/profile';
    document.ui.nodes[2].schemaPath = '/properties/tags';
    document.ui.nodes[3].kind = 'content';
    delete document.ui.nodes[3].schemaPath;
    document.ui.nodes[4].kind = 'content';
    delete document.ui.nodes[4].schemaPath;
    delete document.ui.nodes[4].dataSource;
    const plan = planFor(document);
    expect(validateFormValue(plan, { profile: {}, tags: ['one'] })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'profile.city', code: 'required' }),
        expect.objectContaining({ path: 'tags', code: 'minItems' }),
      ]),
    );
    expect(
      validateFormValue(plan, { profile: { city: '上海' }, tags: ['1', '2', '3', '4'] }),
    ).toContainEqual(expect.objectContaining({ code: 'maxItems' }));
    expect(
      validateFormValue(plan, { profile: { city: '上海' }, tags: ['1', 2] as never }),
    ).toContainEqual(expect.objectContaining({ path: 'tags.1', code: 'type' }));

    const unconstrainedItems = structuredClone(plan);
    if (unconstrainedItems.schema.properties?.tags) {
      delete unconstrainedItems.schema.properties.tags.items;
    }
    expect(
      validateFormValue(unconstrainedItems, { profile: { city: '上海' }, tags: ['one', 2] }),
    ).toEqual([]);
  });

  it('accepts null and valid primitive values without false positives', () => {
    expect(
      validateFormValue(planFor(), { name: '张三', age: 20, active: true, role: 'admin' }),
    ).toEqual([]);
    expect(
      validateFormValue(planFor(), { name: '张三', age: null, active: null, role: null }),
    ).toEqual([]);
    expect(validateFormValue(planFor(), { name: '' })).toContainEqual(
      expect.objectContaining({ code: 'required' }),
    );
  });

  it('handles schemas without explicit types and finite number checks', () => {
    const document = createDocument();
    document.schema.properties = {
      ...document.schema.properties,
      anything: { title: '任意值' },
      score: { type: 'number' },
    };
    expect(
      validateFormValue(planFor(document), {
        name: '张三',
        anything: { nested: true },
        score: 1.5,
      }),
    ).toEqual([]);
    expect(
      validateFormValue(planFor(document), { name: '张三', score: Number.NaN }),
    ).toContainEqual(expect.objectContaining({ path: 'score', code: 'type' }));
  });

  it('applies validation rules using the same expression engine', () => {
    const document = createDocument();
    document.rules?.push({
      id: 'adult-admin',
      target: 'age',
      kind: 'validate',
      message: '管理员必须年满 21 岁。',
      expression: {
        op: 'any',
        values: [
          {
            op: 'ne',
            left: { op: 'field', path: 'role' },
            right: { op: 'literal', value: 'admin' },
          },
          { op: 'gte', left: { op: 'field', path: 'age' }, right: { op: 'literal', value: 21 } },
        ],
      },
    });
    const errors = validateFormValue(planFor(document), { name: '张三', age: 20, role: 'admin' });
    expect(errors).toContainEqual({
      path: 'age',
      code: 'rule.adult-admin',
      message: '管理员必须年满 21 岁。',
    });

    const fallback = createDocument();
    fallback.rules?.push({
      id: 'root-check',
      target: 'root',
      kind: 'validate',
      expression: { op: 'literal', value: false },
    });
    expect(validateFormValue(planFor(fallback), { name: '张三' })).toContainEqual({
      path: 'root',
      code: 'rule.root-check',
      message: '输入未通过业务规则校验。',
    });
  });

  it('computes visibility and enablement states', () => {
    const document = createDocument();
    document.ui.nodes[2].readOnly = true;
    document.ui.nodes[4].hidden = true;
    document.rules?.push({
      id: 'enable-age',
      target: 'age',
      kind: 'enabled',
      expression: { op: 'field', path: 'active' },
    });
    document.rules?.push({
      id: 'show-active',
      target: 'active',
      kind: 'visible',
      expression: { op: 'literal', value: true },
    });
    const plan = planFor(document);
    expect(fieldState(plan, 'age', { active: false })).toEqual({ visible: false, enabled: false });
    expect(fieldState(plan, 'age', { active: true })).toEqual({ visible: true, enabled: true });
    expect(fieldState(plan, 'active', {})).toEqual({ visible: true, enabled: true });
    expect(fieldState(plan, 'role', {})).toEqual({ visible: false, enabled: true });
    expect(fieldState(plan, 'missing', {})).toEqual({ visible: true, enabled: true });
  });
});
