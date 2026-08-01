import { getAtPath } from './pointer';
import type { FormExpression, JsonObject, JsonValue } from './types';

export interface ExpressionOptions {
  maxOperations?: number;
}

export function expressionFieldPaths(expression: FormExpression): string[] {
  const found = new Set<string>();
  const visit = (node: FormExpression): void => {
    if (node.op === 'field') found.add(node.path);
    else if (node.op === 'not' || node.op === 'exists') visit(node.value);
    else if ('values' in node) node.values.forEach(visit);
    else if (node.op !== 'literal') {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(expression);
  return [...found];
}

function comparable(value: unknown): string | number | boolean | null | undefined {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
    ? value
    : undefined;
}

export function evaluateExpression(
  expression: FormExpression,
  value: JsonObject,
  options: ExpressionOptions = {},
): JsonValue | undefined {
  const limit = options.maxOperations ?? 256;
  let operations = 0;
  const evaluate = (node: FormExpression): JsonValue | undefined => {
    operations += 1;
    if (operations > limit) throw new Error(`Expression operation limit exceeded (${limit}).`);
    switch (node.op) {
      case 'literal':
        return node.value;
      case 'field':
        return getAtPath(value, node.path) as JsonValue | undefined;
      case 'not':
        return !evaluate(node.value);
      case 'exists': {
        const result = evaluate(node.value);
        return result !== undefined && result !== null && result !== '';
      }
      case 'all':
        return node.values.every((item) => Boolean(evaluate(item)));
      case 'any':
        return node.values.some((item) => Boolean(evaluate(item)));
      default: {
        const left = evaluate(node.left);
        const right = evaluate(node.right);
        switch (node.op) {
          case 'eq':
            return Object.is(left, right);
          case 'ne':
            return !Object.is(left, right);
          case 'gt':
            return (comparable(left) as never) > (comparable(right) as never);
          case 'gte':
            return (comparable(left) as never) >= (comparable(right) as never);
          case 'lt':
            return (comparable(left) as never) < (comparable(right) as never);
          case 'lte':
            return (comparable(left) as never) <= (comparable(right) as never);
          case 'contains':
            return typeof left === 'string'
              ? left.includes(String(right ?? ''))
              : Array.isArray(left) && left.some((item) => Object.is(item, right));
          case 'in':
            return Array.isArray(right) && right.some((item) => Object.is(item, left));
        }
      }
    }
  };
  return evaluate(expression);
}
