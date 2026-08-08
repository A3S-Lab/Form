import type { JsonObject, JsonValue } from './types';

export function decodePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON Pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
}

export function getAtPointer(value: unknown, pointer: string): unknown {
  return decodePointer(pointer).reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

export function getAtPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

export function setAtPath(value: JsonObject, path: string, next: JsonValue): JsonObject {
  const copy = structuredClone(value);
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return next as JsonObject;
  let current: JsonObject | JsonValue[] = copy;
  for (const [index, part] of parts.slice(0, -1).entries()) {
    const nextPart = parts[index + 1];
    const createContainer = (): JsonObject | JsonValue[] => (/^\d+$/.test(nextPart) ? [] : {});
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(part)) return copy;
      const itemIndex = Number(part);
      const child = current[itemIndex];
      if (child === null || typeof child !== 'object') current[itemIndex] = createContainer();
      current = current[itemIndex] as JsonObject | JsonValue[];
      continue;
    }
    const child = current[part];
    if (child === null || typeof child !== 'object') current[part] = createContainer();
    current = current[part] as JsonObject | JsonValue[];
  }
  const finalPart = parts.at(-1) as string;
  if (Array.isArray(current)) {
    if (!/^\d+$/.test(finalPart)) return copy;
    current[Number(finalPart)] = next;
  } else current[finalPart] = next;
  return copy;
}

export function removeAtPath(value: JsonObject, path: string): JsonObject {
  const copy = structuredClone(value);
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return {};
  let current: JsonObject | JsonValue[] = copy;
  for (const part of parts.slice(0, -1)) {
    const child = Array.isArray(current)
      ? /^\d+$/.test(part)
        ? current[Number(part)]
        : undefined
      : current[part];
    if (child === null || typeof child !== 'object') return copy;
    current = child as JsonObject | JsonValue[];
  }
  const finalPart = parts.at(-1) as string;
  if (Array.isArray(current)) {
    if (!/^\d+$/.test(finalPart)) return copy;
    current.splice(Number(finalPart), 1);
  } else delete current[finalPart];
  return copy;
}

export function schemaPointerToValuePath(pointer: string): string | undefined {
  const template = schemaPointerToValuePathTemplate(pointer);
  return template?.includes('*') ? undefined : template;
}

export function schemaPointerToValuePathTemplate(pointer: string): string | undefined {
  const parts = decodePointer(pointer);
  const output: string[] = [];
  for (let index = 0; index < parts.length; ) {
    if (parts[index] === 'properties' && parts[index + 1]) {
      output.push(parts[index + 1]);
      index += 2;
      continue;
    }
    if (parts[index] === 'items') {
      output.push('*');
      index += 1;
      continue;
    }
    return undefined;
  }
  return output.length > 0 ? output.join('.') : undefined;
}

export function resolveValuePathTemplate(
  template: string | undefined,
  indices: readonly number[] = [],
): string | undefined {
  if (!template) return undefined;
  let index = 0;
  const resolved = template.split('.').map((segment) => {
    if (segment !== '*') return segment;
    const value = indices[index];
    index += 1;
    return value === undefined ? '*' : String(value);
  });
  return !resolved.includes('*') ? resolved.join('.') : undefined;
}

export function matchValuePathTemplate(
  template: string | undefined,
  path: string,
): number[] | undefined {
  if (!template) return undefined;
  const templateParts = template.split('.');
  const pathParts = path.split('.');
  if (templateParts.length !== pathParts.length) return undefined;
  const indices: number[] = [];
  for (const [index, segment] of templateParts.entries()) {
    const candidate = pathParts[index];
    if (segment === '*') {
      if (!/^\d+$/.test(candidate)) return undefined;
      indices.push(Number(candidate));
    } else if (segment !== candidate) return undefined;
  }
  return indices;
}
