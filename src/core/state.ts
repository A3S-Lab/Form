import { evaluateExpression, expressionFieldPaths } from './expression';
import { formatFormMessage, resolveFormLocaleCatalog } from './locale';
import { getAtPath, removeAtPath, setAtPath } from './pointer';
import { isSchemaFormatValid, jsonValuesEqual } from './schema-profile';
import type {
  ComputedRuleEvaluation,
  ComputedRuleEvaluationOptions,
  ComputedRuleTraceEntry,
  FieldError,
  FormLocaleMessages,
  FormPlan,
  FormRule,
  FormValueEvaluation,
  FormValueEvaluationOptions,
  IncrementalComputedRuleEvaluation,
  JsonObject,
  JsonSchema,
  JsonValue,
} from './types';

interface DependencySnapshot {
  path: string;
  present: boolean;
  value?: JsonValue;
}

interface CachedComputedRule {
  dependencies: DependencySnapshot[];
  outputPresent: boolean;
  output?: JsonValue;
}

function validateSchema(
  schema: JsonSchema,
  value: unknown,
  path: string,
  errors: FieldError[],
  messages: Readonly<FormLocaleMessages>,
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
    errors.push({
      path,
      code: 'type',
      message: formatFormMessage(messages, 'validationType', { type: schema.type ?? '' }),
    });
    return;
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength)
      errors.push({
        path,
        code: 'minLength',
        message: formatFormMessage(messages, 'validationMinLength', {
          minimum: schema.minLength,
        }),
      });
    if (schema.maxLength !== undefined && length > schema.maxLength)
      errors.push({
        path,
        code: 'maxLength',
        message: formatFormMessage(messages, 'validationMaxLength', {
          maximum: schema.maxLength,
        }),
      });
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern, 'u').test(value))
          errors.push({ path, code: 'pattern', message: messages.validationPattern });
      } catch {
        errors.push({
          path,
          code: 'pattern.invalid',
          message: messages.validationInvalidPattern,
        });
      }
    }
    if (schema.format && !isSchemaFormatValid(schema.format, value))
      errors.push({
        path,
        code: `format.${schema.format}`,
        message: formatFormMessage(messages, 'validationFormat', { format: schema.format }),
      });
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push({
        path,
        code: 'minimum',
        message: formatFormMessage(messages, 'validationMinimum', {
          minimum: schema.minimum,
        }),
      });
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push({
        path,
        code: 'maximum',
        message: formatFormMessage(messages, 'validationMaximum', {
          maximum: schema.maximum,
        }),
      });
  }
  if (schema.const !== undefined && !jsonValuesEqual(schema.const, value))
    errors.push({ path, code: 'const', message: messages.validationConst });
  if (schema.enum && !schema.enum.some((item) => jsonValuesEqual(item, value)))
    errors.push({ path, code: 'enum', message: messages.validationEnum });
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push({
        path,
        code: 'minItems',
        message: formatFormMessage(messages, 'validationMinItems', {
          minimum: schema.minItems,
        }),
      });
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      errors.push({
        path,
        code: 'maxItems',
        message: formatFormMessage(messages, 'validationMaxItems', {
          maximum: schema.maxItems,
        }),
      });
    if (
      schema.uniqueItems &&
      value.some((item, index) =>
        value.slice(0, index).some((previous) => jsonValuesEqual(previous, item)),
      )
    )
      errors.push({ path, code: 'uniqueItems', message: messages.validationUniqueItems });
    if (schema.items)
      value.forEach((item, index) => {
        validateSchema(schema.items as JsonSchema, item, `${path}.${index}`, errors, messages);
      });
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (object[required] === undefined || object[required] === null || object[required] === '')
        errors.push({
          path: path ? `${path}.${required}` : required,
          code: 'required',
          message: messages.validationRequired,
        });
    }
    for (const [key, child] of Object.entries(schema.properties ?? {}))
      validateSchema(child, object[key], path ? `${path}.${key}` : key, errors, messages);
    for (const [key, childValue] of Object.entries(object)) {
      if (key in (schema.properties ?? {})) continue;
      const childPath = path ? `${path}.${key}` : key;
      if (schema.additionalProperties === false) {
        errors.push({
          path: childPath,
          code: 'additionalProperties',
          message: messages.validationAdditionalProperties,
        });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateSchema(schema.additionalProperties, childValue, childPath, errors, messages);
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

function snapshotDependencies(value: JsonObject, paths: readonly string[]): DependencySnapshot[] {
  return paths.map((path) => {
    const dependency = getAtPath(value, path) as JsonValue | undefined;
    return dependency === undefined
      ? { path, present: false }
      : { path, present: true, value: structuredClone(dependency) };
  });
}

function dependencySnapshotsEqual(
  left: readonly DependencySnapshot[],
  right: readonly DependencySnapshot[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const candidate = right[index];
    if (!candidate || entry.path !== candidate.path || entry.present !== candidate.present) {
      return false;
    }
    return !entry.present || jsonValuesEqual(entry.value, candidate.value);
  });
}

function applyComputedOutput(
  value: JsonObject,
  path: string,
  nextValue: JsonValue | undefined,
  unchanged: boolean,
): JsonObject {
  if (unchanged) return value;
  return nextValue === undefined ? removeAtPath(value, path) : setAtPath(value, path, nextValue);
}

export class IncrementalComputedRuleEvaluator {
  #plan?: FormPlan;
  #cache = new Map<string, CachedComputedRule>();
  #computedRules = new Map<string, FormRule>();
  #targetByPath = new Map<string, string>();

  clear(): void {
    this.#plan = undefined;
    this.#cache.clear();
    this.#computedRules.clear();
    this.#targetByPath.clear();
  }

  evaluate(
    plan: FormPlan,
    value: JsonObject,
    options: ComputedRuleEvaluationOptions = {},
  ): IncrementalComputedRuleEvaluation {
    this.#setPlan(plan);
    let current = structuredClone(value);
    const trace: ComputedRuleTraceEntry[] = [];
    const errors: FieldError[] = [];
    const evaluatedRuleIds: string[] = [];
    const reusedRuleIds: string[] = [];
    const failedTargets = new Set<string>();

    for (const target of plan.dependencyOrder) {
      const rule = this.#computedRules.get(target);
      const path = plan.nodeById[target]?.valuePath;
      if (!rule || !path) continue;
      const dependencies = [
        ...(plan.ruleDependencies?.[rule.id] ?? expressionFieldPaths(rule.expression).sort()),
      ];
      const previousValue = getAtPath(current, path) as JsonValue | undefined;
      const failedDependencies = dependencies
        .map((dependency) => this.#targetByPath.get(dependency))
        .filter((dependency): dependency is string => Boolean(dependency))
        .filter((dependency) => failedTargets.has(dependency));
      if (failedDependencies.length > 0) {
        this.#cache.delete(target);
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

      const dependencySnapshot = snapshotDependencies(current, dependencies);
      const cached = this.#cache.get(target);
      try {
        const reused = Boolean(
          cached && dependencySnapshotsEqual(cached.dependencies, dependencySnapshot),
        );
        const nextValue = reused
          ? cached?.outputPresent
            ? structuredClone(cached.output as JsonValue)
            : undefined
          : evaluateExpression(rule.expression, current, {
              maxOperations: plan.expressionOperationLimit,
            });
        if (reused) reusedRuleIds.push(rule.id);
        else {
          evaluatedRuleIds.push(rule.id);
          this.#cache.set(target, {
            dependencies: dependencySnapshot,
            outputPresent: nextValue !== undefined,
            ...(nextValue === undefined ? {} : { output: structuredClone(nextValue) }),
          });
        }
        const unchanged = valuesEqual(previousValue, nextValue);
        const status = unchanged ? 'unchanged' : nextValue === undefined ? 'removed' : 'set';
        current = applyComputedOutput(current, path, nextValue, unchanged);
        trace.push(
          traceValues(
            { ruleId: rule.id, target, path, dependencies, status },
            previousValue,
            nextValue,
            Boolean(options.includeValues),
          ),
        );
      } catch (error) {
        this.#cache.delete(target);
        evaluatedRuleIds.push(rule.id);
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
    return { value: current, trace, errors, evaluatedRuleIds, reusedRuleIds };
  }

  #setPlan(plan: FormPlan): void {
    if (this.#plan === plan) return;
    this.clear();
    this.#plan = plan;
    this.#computedRules = new Map(
      plan.rules.filter((rule) => rule.kind === 'computed').map((rule) => [rule.target, rule]),
    );
    for (const target of this.#computedRules.keys()) {
      const path = plan.nodeById[target]?.valuePath;
      if (path) this.#targetByPath.set(path, target);
    }
  }
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
  options: FormValueEvaluationOptions = {},
): FormValueEvaluation {
  const computed = evaluateComputedRules(plan, value, options);
  const errors = [...computed.errors];
  const messages = resolveFormLocaleCatalog(
    options.locale ?? plan.metadata.locale,
    options.localeCatalog,
  ).messages;
  validateSchema(plan.schema, computed.value, '', errors, messages);
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
        message: rule.message ?? messages.validationRule,
      });
    }
  }
  return { ...computed, errors };
}

export function validateFormValue(
  plan: FormPlan,
  value: JsonObject,
  options: FormValueEvaluationOptions = {},
): FieldError[] {
  return evaluateFormValue(plan, value, options).errors;
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
