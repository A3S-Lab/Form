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
  let current: Record<string, JsonValue> = copy;
  for (const part of parts.slice(0, -1)) {
    const child = current[part];
    if (child === null || typeof child !== 'object' || Array.isArray(child)) current[part] = {};
    current = current[part] as JsonObject;
  }
  current[parts.at(-1) as string] = next;
  return copy;
}

export function removeAtPath(value: JsonObject, path: string): JsonObject {
  const copy = structuredClone(value);
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return {};
  let current: Record<string, JsonValue> = copy;
  for (const part of parts.slice(0, -1)) {
    const child = current[part];
    if (child === null || typeof child !== 'object' || Array.isArray(child)) return copy;
    current = child;
  }
  delete current[parts.at(-1) as string];
  return copy;
}

export function schemaPointerToValuePath(pointer: string): string | undefined {
  const parts = decodePointer(pointer);
  const output: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index] !== 'properties' || !parts[index + 1]) return undefined;
    output.push(parts[index + 1]);
    index += 1;
  }
  return output.join('.');
}
