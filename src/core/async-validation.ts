import { evaluateFormValue } from './state';
import type {
  AsyncValidationEvaluation,
  AsyncValidationIssue,
  AsyncValidationOptions,
  AsyncValidationResponse,
  AsyncValidationScope,
  FieldError,
  FormAsyncValidator,
  FormPlan,
  FormValueEvaluation,
  JsonObject,
} from './types';

const issueCodePattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fallbackPath(scope: AsyncValidationScope): string {
  return scope.kind === 'field' ? scope.path : '';
}

function isValuePath(path: string): boolean {
  return path === '' || path.split('.').every((segment) => segment.length > 0);
}

function isScopeValid(plan: FormPlan, scope: AsyncValidationScope): boolean {
  if (scope.kind === 'form') return true;
  return plan.nodeById[scope.nodeId]?.valuePath === scope.path;
}

function hasBlockingErrors(evaluation: FormValueEvaluation, scope: AsyncValidationScope): boolean {
  if (scope.kind === 'form') return evaluation.errors.length > 0;
  return evaluation.errors.some(
    (error) => error.path === scope.path || error.path.startsWith(`${scope.path}.`),
  );
}

function validationFailure(
  evaluation: FormValueEvaluation,
  scope: AsyncValidationScope,
  code: 'invalid_scope' | 'invalid_response' | 'unavailable',
  message: string,
): AsyncValidationEvaluation {
  const asyncErrors = [{ path: fallbackPath(scope), code: `async.${code}`, message }];
  return {
    ...evaluation,
    errors: [...evaluation.errors, ...asyncErrors],
    asyncErrors,
    status: 'unavailable',
  };
}

export function mapAsyncValidationIssues(
  response: unknown,
  scope: AsyncValidationScope,
): FieldError[] {
  if (
    !isRecord(response) ||
    Object.keys(response).some((key) => key !== 'issues' && response[key] !== undefined) ||
    !Array.isArray(response.issues)
  ) {
    throw new TypeError('Async validation response must contain only an issues array.');
  }

  const errors: FieldError[] = [];
  const seen = new Set<string>();
  for (const input of response.issues) {
    if (
      !isRecord(input) ||
      Object.keys(input).some(
        (key) => !['path', 'code', 'message'].includes(key) && input[key] !== undefined,
      )
    ) {
      throw new TypeError('Async validation issues must use the closed issue shape.');
    }
    const issue = input as unknown as AsyncValidationIssue;
    const path = issue.path ?? fallbackPath(scope);
    if (
      typeof path !== 'string' ||
      !isValuePath(path) ||
      typeof issue.code !== 'string' ||
      !issueCodePattern.test(issue.code) ||
      typeof issue.message !== 'string' ||
      issue.message.trim().length === 0
    ) {
      throw new TypeError('Async validation issue fields are invalid.');
    }
    const error = { path, code: `async.${issue.code}`, message: issue.message.trim() };
    const identity = `${error.path}\u0000${error.code}\u0000${error.message}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    errors.push(error);
  }
  return errors;
}

export async function validateFormValueAsync(
  plan: FormPlan,
  value: JsonObject,
  validator?: FormAsyncValidator,
  options: AsyncValidationOptions = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<AsyncValidationEvaluation> {
  const evaluation = evaluateFormValue(plan, value);
  const scope = options.scope ?? { kind: 'form' };
  if (!isScopeValid(plan, scope)) {
    return validationFailure(
      evaluation,
      scope,
      'invalid_scope',
      'The asynchronous validation scope does not match the compiled form plan.',
    );
  }
  if (hasBlockingErrors(evaluation, scope)) {
    return { ...evaluation, asyncErrors: [], status: 'invalid' };
  }
  if (signal.aborted) return { ...evaluation, asyncErrors: [], status: 'cancelled' };
  if (!validator) return { ...evaluation, asyncErrors: [], status: 'valid' };

  const request = {
    plan,
    value: structuredClone(evaluation.value),
    scope,
    trigger: options.trigger ?? (scope.kind === 'field' ? 'blur' : 'submit'),
    locale: options.locale ?? plan.metadata.locale ?? 'en-US',
  } as const;
  let response: AsyncValidationResponse;
  try {
    response = await validator(request, signal);
  } catch {
    if (signal.aborted) return { ...evaluation, asyncErrors: [], status: 'cancelled' };
    return validationFailure(
      evaluation,
      scope,
      'unavailable',
      'Validation could not be completed. Try again.',
    );
  }
  if (signal.aborted) return { ...evaluation, asyncErrors: [], status: 'cancelled' };

  let asyncErrors: FieldError[];
  try {
    asyncErrors = mapAsyncValidationIssues(response, scope);
  } catch {
    return validationFailure(
      evaluation,
      scope,
      'invalid_response',
      'The host returned an invalid asynchronous validation response.',
    );
  }
  return {
    ...evaluation,
    errors: [...evaluation.errors, ...asyncErrors],
    asyncErrors,
    status: asyncErrors.length > 0 ? 'invalid' : 'valid',
  };
}
