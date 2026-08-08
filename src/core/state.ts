import { evaluateExpression } from './expression';
import { getAtPath, setAtPath } from './pointer';
import { isSchemaFormatValid, jsonValuesEqual } from './schema-profile';
import type { FieldError, FormPlan, JsonObject, JsonSchema, JsonValue } from './types';

function validateSchema(
  schema: JsonSchema,
  value: unknown,
  path: string,
  errors: FieldError[],
): void {
  if (value === undefined || value === null) return;
  const typeMatches =
    !schema.type ||
    (schema.type === 'string' && typeof value === 'string') ||
    (schema.type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
    (schema.type === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
    (schema.type === 'boolean' && typeof value === 'boolean') ||
    (schema.type === 'array' && Array.isArray(value)) ||
    (schema.type === 'object' && typeof value === 'object' && !Array.isArray(value));
  if (!typeMatches) {
    errors.push({ path, code: 'type', message: `值类型必须是 ${schema.type}。` });
    return;
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength)
      errors.push({ path, code: 'minLength', message: `至少输入 ${schema.minLength} 个字符。` });
    if (schema.maxLength !== undefined && length > schema.maxLength)
      errors.push({ path, code: 'maxLength', message: `最多输入 ${schema.maxLength} 个字符。` });
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern, 'u').test(value))
          errors.push({ path, code: 'pattern', message: '输入内容格式不正确。' });
      } catch {
        errors.push({ path, code: 'pattern.invalid', message: 'Schema 中的正则表达式无效。' });
      }
    }
    if (schema.format && !isSchemaFormatValid(schema.format, value))
      errors.push({
        path,
        code: `format.${schema.format}`,
        message: `The value must match the ${schema.format} format.`,
      });
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push({ path, code: 'minimum', message: `数值不能小于 ${schema.minimum}。` });
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push({ path, code: 'maximum', message: `数值不能大于 ${schema.maximum}。` });
  }
  if (schema.const !== undefined && !jsonValuesEqual(schema.const, value))
    errors.push({ path, code: 'const', message: 'The value must match the required constant.' });
  if (schema.enum && !schema.enum.some((item) => jsonValuesEqual(item, value)))
    errors.push({ path, code: 'enum', message: '请选择允许的选项。' });
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push({ path, code: 'minItems', message: `至少需要 ${schema.minItems} 项。` });
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push({ path, code: 'maxItems', message: `最多允许 ${schema.maxItems} 项。` });
    if (
      schema.uniqueItems &&
      value.some((item, index) =>
        value.slice(0, index).some((previous) => jsonValuesEqual(previous, item)),
      )
    )
      errors.push({ path, code: 'uniqueItems', message: 'Array items must be unique.' });
    if (schema.items)
      value.forEach((item, index) => {
        validateSchema(schema.items as JsonSchema, item, `${path}.${index}`, errors);
      });
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (object[required] === undefined || object[required] === null || object[required] === '')
        errors.push({
          path: path ? `${path}.${required}` : required,
          code: 'required',
          message: '此项为必填项。',
        });
    }
    for (const [key, child] of Object.entries(schema.properties ?? {}))
      validateSchema(child, object[key], path ? `${path}.${key}` : key, errors);
    for (const [key, childValue] of Object.entries(object)) {
      if (key in (schema.properties ?? {})) continue;
      const childPath = path ? `${path}.${key}` : key;
      if (schema.additionalProperties === false) {
        errors.push({
          path: childPath,
          code: 'additionalProperties',
          message: 'Additional properties are not allowed.',
        });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateSchema(schema.additionalProperties, childValue, childPath, errors);
      }
    }
  }
}

export function validateFormValue(plan: FormPlan, value: JsonObject): FieldError[] {
  const errors: FieldError[] = [];
  validateSchema(plan.schema, value, '', errors);
  for (const rule of plan.rules) {
    if (rule.kind !== 'validate') continue;
    if (!evaluateExpression(rule.expression, value)) {
      const node = plan.nodeById[rule.target];
      errors.push({
        path: node?.valuePath ?? rule.target,
        code: `rule.${rule.id}`,
        message: rule.message ?? '输入未通过业务规则校验。',
      });
    }
  }
  return errors;
}

export function fieldState(
  plan: FormPlan,
  nodeId: string,
  value: JsonObject,
): { visible: boolean; enabled: boolean } {
  let visible = !plan.nodeById[nodeId]?.hidden;
  let enabled = !plan.nodeById[nodeId]?.readOnly;
  for (const rule of plan.rules) {
    if (rule.target !== nodeId) continue;
    if (rule.kind === 'visible') visible = Boolean(evaluateExpression(rule.expression, value));
    if (rule.kind === 'enabled') enabled = Boolean(evaluateExpression(rule.expression, value));
  }
  return { visible, enabled };
}

export function updateFormValue(value: JsonObject, path: string, next: JsonValue): JsonObject {
  return setAtPath(value, path, next);
}

export function readFormValue(value: JsonObject, path: string): JsonValue | undefined {
  return getAtPath(value, path) as JsonValue | undefined;
}
