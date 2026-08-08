import { evaluateExpression, expressionFieldPaths } from './expression';
import { getAtPath, removeAtPath, setAtPath } from './pointer';
import { isSchemaFormatValid, jsonValuesEqual } from './schema-profile';
import type {
  ComputedRuleEvaluation,
  ComputedRuleEvaluationOptions,
  ComputedRuleTraceEntry,
  FieldError,
  FormPlan,
  FormValueEvaluation,
  JsonObject,
  JsonSchema,
  JsonValue,
} from './types';

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

function valuesEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return left === undefined && right === undefined ? true : jsonValuesEqual(left, right);
}

function traceValues(
  entry: ComputedRuleTraceEntry,
  previousValue: JsonValue | undefined,
  nextValue: JsonValue | undefined,
  includeValues: boolean,
): ComputedRuleTraceEntry {
  if (!includeValues) return entry;
  if (previousValue !== undefined) entry.previousValue = structuredClone(previousValue);
  if (nextValue !== undefined) entry.nextValue = structuredClone(nextValue);
  return entry;
}

export function evaluateComputedRules(
  plan: FormPlan,
  value: JsonObject,
  options: ComputedRuleEvaluationOptions = {},
): ComputedRuleEvaluation {
  let current = structuredClone(value);
  const trace: ComputedRuleTraceEntry[] = [];
  const errors: FieldError[] = [];
  const computedRules = new Map(
    plan.rules.filter((rule) => rule.kind === 'computed').map((rule) => [rule.target, rule]),
  );
  const targetByPath = new Map<string, string>();
  for (const target of computedRules.keys()) {
    const path = plan.nodeById[target]?.valuePath;
    if (path) targetByPath.set(path, target);
  }
  const failedTargets = new Set<string>();

  for (const target of plan.dependencyOrder) {
    const rule = computedRules.get(target);
    const path = plan.nodeById[target]?.valuePath;
    if (!rule || !path) continue;
    const dependencies = expressionFieldPaths(rule.expression).sort();
    const previousValue = getAtPath(current, path) as JsonValue | undefined;
    const failedDependencies = dependencies
      .map((dependency) => targetByPath.get(dependency))
      .filter((dependency): dependency is string => Boolean(dependency))
      .filter((dependency) => failedTargets.has(dependency));
    if (failedDependencies.length > 0) {
      current = removeAtPath(current, path);
      failedTargets.add(target);
      const message = `Computed rule ${rule.id} was skipped because a dependency failed.`;
      errors.push({ path, code: `rule.${rule.id}.dependency`, message });
      trace.push(
        traceValues(
          {
            ruleId: rule.id,
            target,
            path,
            dependencies,
            status: 'skipped',
            error: message,
          },
          previousValue,
          undefined,
          Boolean(options.includeValues),
        ),
      );
      continue;
    }
    try {
      const nextValue = evaluateExpression(rule.expression, current, {
        maxOperations: plan.expressionOperationLimit,
      });
      const unchanged = valuesEqual(previousValue, nextValue);
      const status = unchanged ? 'unchanged' : nextValue === undefined ? 'removed' : 'set';
      if (!unchanged) {
        current =
          nextValue === undefined
            ? removeAtPath(current, path)
            : setAtPath(current, path, nextValue);
      }
      trace.push(
        traceValues(
          { ruleId: rule.id, target, path, dependencies, status },
          previousValue,
          nextValue,
          Boolean(options.includeValues),
        ),
      );
    } catch (error) {
      current = removeAtPath(current, path);
      failedTargets.add(target);
      const message = String(error);
      errors.push({ path, code: `rule.${rule.id}.evaluation`, message });
      trace.push(
        traceValues(
          {
            ruleId: rule.id,
            target,
            path,
            dependencies,
            status: 'error',
            error: message,
          },
          previousValue,
          undefined,
          Boolean(options.includeValues),
        ),
      );
    }
  }
  return { value: current, trace, errors };
}

export function evaluateFormValue(
  plan: FormPlan,
  value: JsonObject,
  options: ComputedRuleEvaluationOptions = {},
): FormValueEvaluation {
  const computed = evaluateComputedRules(plan, value, options);
  const errors = [...computed.errors];
  validateSchema(plan.schema, computed.value, '', errors);
  for (const rule of plan.rules) {
    if (rule.kind !== 'validate') continue;
    let valid = false;
    try {
      valid = Boolean(
        evaluateExpression(rule.expression, computed.value, {
          maxOperations: plan.expressionOperationLimit,
        }),
      );
    } catch (error) {
      const node = plan.nodeById[rule.target];
      errors.push({
        path: node?.valuePath ?? rule.target,
        code: `rule.${rule.id}.evaluation`,
        message: String(error),
      });
      continue;
    }
    if (!valid) {
      const node = plan.nodeById[rule.target];
      errors.push({
        path: node?.valuePath ?? rule.target,
        code: `rule.${rule.id}`,
        message: rule.message ?? '输入未通过业务规则校验。',
      });
    }
  }
  return { ...computed, errors };
}

export function validateFormValue(plan: FormPlan, value: JsonObject): FieldError[] {
  return evaluateFormValue(plan, value).errors;
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
    try {
      if (rule.kind === 'visible')
        visible = Boolean(
          evaluateExpression(rule.expression, value, {
            maxOperations: plan.expressionOperationLimit,
          }),
        );
      if (rule.kind === 'enabled')
        enabled = Boolean(
          evaluateExpression(rule.expression, value, {
            maxOperations: plan.expressionOperationLimit,
          }),
        );
    } catch {
      if (rule.kind === 'visible') visible = false;
      if (rule.kind === 'enabled') enabled = false;
    }
  }
  if (plan.rules.some((rule) => rule.kind === 'computed' && rule.target === nodeId))
    enabled = false;
  return { visible, enabled };
}

export function updateFormValue(value: JsonObject, path: string, next: JsonValue): JsonObject {
  return setAtPath(value, path, next);
}

export function readFormValue(value: JsonObject, path: string): JsonValue | undefined {
  return getAtPath(value, path) as JsonValue | undefined;
}
