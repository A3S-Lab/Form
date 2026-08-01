import type {
  ActionRequest,
  DataSourceRequest,
  FormHostAdapter,
  JsonValue,
  UiOption,
} from '../core/types';

export interface A3SCloudFormContext {
  organizationId: string;
  projectId: string;
  environmentId: string;
  locale?: string;
}

export interface A3SCloudFormBindings {
  context: A3SCloudFormContext;
  resolveDataSource?: (
    context: A3SCloudFormContext,
    request: DataSourceRequest,
    signal: AbortSignal,
  ) => Promise<UiOption[]>;
  invokeAction?: (
    context: A3SCloudFormContext,
    request: ActionRequest,
    signal: AbortSignal,
    // biome-ignore lint/suspicious/noConfusingVoidType: Host actions may intentionally return no payload.
  ) => Promise<JsonValue | void>;
}

export function createA3SCloudFormAdapter(bindings: A3SCloudFormBindings): FormHostAdapter {
  return {
    resolveDataSource: bindings.resolveDataSource
      ? (request, signal) =>
          bindings.resolveDataSource?.(bindings.context, request, signal) ?? Promise.resolve([])
      : undefined,
    invokeAction: bindings.invokeAction
      ? (request, signal) =>
          bindings.invokeAction?.(bindings.context, request, signal) ?? Promise.resolve()
      : undefined,
  };
}
