import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDataSourceRequestKey,
  type DataSourceCoordinator,
  type DataSourceDefinition,
  type DataSourceLease,
  type FormHostAdapter,
  type FormPlan,
  getAtPath,
  type JsonObject,
  type JsonValue,
  type UiNode,
  type UiOption,
} from '../core';

export type FormDataSourceStatus =
  | 'static'
  | 'idle'
  | 'blocked'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error';

export interface FormDataSourceState {
  definition?: DataSourceDefinition;
  options: UiOption[];
  status: FormDataSourceStatus;
  query: string;
  searchable: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  pageError: boolean;
  activate: () => void;
  setQuery: (query: string) => void;
  retry: () => void;
  loadMore: () => void;
}

interface UseFormDataSourceOptions {
  coordinator: DataSourceCoordinator;
  hostAdapter?: FormHostAdapter;
  locale: string;
  node: UiNode;
  plan: FormPlan;
  value: JsonObject;
  visible: boolean;
}

function hasDependencyValue(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function mergeOptions(current: UiOption[], incoming: UiOption[]): UiOption[] {
  const merged = new Map(current.map((option) => [String(option.value), option]));
  for (const option of incoming) merged.set(String(option.value), option);
  return [...merged.values()];
}

export function useFormDataSource({
  coordinator,
  hostAdapter,
  locale,
  node,
  plan,
  value,
  visible,
}: UseFormDataSourceOptions): FormDataSourceState {
  const definition = useMemo(
    () => plan.dataSources.find((source) => source.id === node.dataSource),
    [node.dataSource, plan.dataSources],
  );
  const staticOptions = node.options;
  const resolver = hostAdapter?.resolveDataSource;
  const valueRef = useRef(value);
  valueRef.current = value;
  const [activated, setActivated] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [options, setOptions] = useState<UiOption[]>(staticOptions ?? []);
  const [status, setStatus] = useState<FormDataSourceStatus>(
    staticOptions
      ? 'static'
      : !definition
        ? 'ready'
        : definition.trigger === 'focus'
          ? 'idle'
          : 'loading',
  );
  const [nextCursor, setNextCursor] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [retryRevision, setRetryRevision] = useState(0);
  const generationRef = useRef(0);
  const pageLeaseRef = useRef<DataSourceLease | undefined>(undefined);

  const dependenciesReady = useMemo(
    () =>
      (definition?.dependencies ?? []).every((path) =>
        hasDependencyValue(getAtPath(value, path) as JsonValue | undefined),
      ),
    [definition?.dependencies, value],
  );
  const active = definition?.trigger !== 'focus' || activated;
  const requestKey = useMemo(
    () =>
      definition
        ? createDataSourceRequestKey(plan, definition, value, {
            locale,
            query: debouncedQuery || undefined,
          })
        : '',
    [debouncedQuery, definition, locale, plan, value],
  );

  useEffect(() => {
    const delay = definition?.searchable ? (definition.debounceMs ?? 250) : 0;
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), delay);
    return () => window.clearTimeout(timeout);
  }, [definition?.debounceMs, definition?.searchable, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: A source identity change resets field-local activation and search state.
  useEffect(() => {
    setActivated(false);
    setQuery('');
    setDebouncedQuery('');
  }, [definition?.id, definition?.registryKey, definition?.trigger]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryRevision intentionally invalidates an otherwise identical failed request.
  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    pageLeaseRef.current?.release();
    pageLeaseRef.current = undefined;
    setLoadingMore(false);
    setPageError(false);
    setNextCursor(undefined);

    if (staticOptions) {
      setOptions(staticOptions);
      setStatus('static');
      return;
    }
    setOptions([]);
    if (!definition) {
      setStatus('ready');
      return;
    }
    if (!visible || !active) {
      setStatus('idle');
      return;
    }
    if (!dependenciesReady) {
      setStatus('blocked');
      return;
    }
    if (!resolver) {
      setStatus('error');
      return;
    }

    setStatus('loading');
    const lease = coordinator.acquire(requestKey, definition.cacheTtlMs ?? 0, (signal) =>
      resolver(
        {
          definition,
          value: structuredClone(valueRef.current),
          locale,
          query: debouncedQuery || undefined,
          limit: definition.pageSize,
        },
        signal,
      ),
    );
    lease.promise
      .then((page) => {
        if (generationRef.current !== generation) return;
        setOptions(page.options);
        setNextCursor(page.nextCursor);
        setStatus(page.options.length === 0 ? 'empty' : 'ready');
      })
      .catch(() => {
        if (generationRef.current !== generation) return;
        setStatus('error');
        console.warn('A3S Form data source failed.');
      });
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
      lease.release();
    };
  }, [
    active,
    coordinator,
    debouncedQuery,
    definition,
    dependenciesReady,
    locale,
    requestKey,
    resolver,
    retryRevision,
    staticOptions,
    visible,
  ]);

  const loadMore = useCallback(() => {
    if (
      !definition ||
      !resolver ||
      !nextCursor ||
      loadingMore ||
      status === 'loading' ||
      !visible
    ) {
      return;
    }
    const generation = generationRef.current;
    const cursor = nextCursor;
    const key = createDataSourceRequestKey(plan, definition, valueRef.current, {
      locale,
      query: debouncedQuery || undefined,
      cursor,
    });
    setLoadingMore(true);
    setPageError(false);
    const lease = coordinator.acquire(key, definition.cacheTtlMs ?? 0, (signal) =>
      resolver(
        {
          definition,
          value: structuredClone(valueRef.current),
          locale,
          query: debouncedQuery || undefined,
          cursor,
          limit: definition.pageSize,
        },
        signal,
      ),
    );
    pageLeaseRef.current?.release();
    pageLeaseRef.current = lease;
    lease.promise
      .then((page) => {
        if (generationRef.current !== generation || pageLeaseRef.current !== lease) return;
        setOptions((current) => mergeOptions(current, page.options));
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (generationRef.current !== generation || pageLeaseRef.current !== lease) return;
        setPageError(true);
        console.warn('A3S Form data-source page failed.');
      })
      .finally(() => {
        if (pageLeaseRef.current !== lease) return;
        pageLeaseRef.current = undefined;
        setLoadingMore(false);
        lease.release();
      });
  }, [
    coordinator,
    debouncedQuery,
    definition,
    loadingMore,
    locale,
    nextCursor,
    plan,
    resolver,
    status,
    visible,
  ]);

  return {
    definition,
    options: staticOptions ?? options,
    status,
    query,
    searchable: Boolean(definition?.searchable && !staticOptions),
    hasMore: Boolean(nextCursor),
    loadingMore,
    pageError,
    activate: () => setActivated(true),
    setQuery,
    retry: () => {
      if (pageError) loadMore();
      else setRetryRevision((current) => current + 1);
    },
    loadMore,
  };
}

export function DataSourceSearch({ label, state }: { label: string; state: FormDataSourceState }) {
  if (!state.searchable) return null;
  return (
    <label className="a3s-form-data-source-search">
      <span>搜索选项</span>
      <input
        type="search"
        className="input"
        aria-label={`搜索 ${label} 选项`}
        placeholder="输入关键词"
        disabled={state.status === 'blocked'}
        value={state.query}
        onFocus={state.activate}
        onChange={(event) => state.setQuery(event.target.value)}
      />
    </label>
  );
}

export function DataSourceStatus({ label, state }: { label: string; state: FormDataSourceState }) {
  if (!state.definition || state.status === 'static' || state.status === 'ready') {
    if (!state.hasMore && !state.pageError) return null;
  }
  return (
    <div className="a3s-form-data-source-status" data-status={state.status}>
      {state.status === 'idle' && <span>聚焦字段后加载选项。</span>}
      {state.status === 'blocked' && <span role="status">请先完成关联字段。</span>}
      {state.status === 'loading' && (
        <span role="status" aria-label={`正在加载 ${label} 选项`}>
          正在加载选项…
        </span>
      )}
      {state.status === 'empty' && <span role="status">暂无可用选项。</span>}
      {state.status === 'error' && (
        <div role="alert" aria-label={`${label} 选项加载失败`}>
          <span>选项加载失败。</span>
          <button
            type="button"
            className="btn"
            onClick={state.retry}
            aria-label={`重试加载 ${label} 选项`}
          >
            重试
          </button>
        </div>
      )}
      {state.pageError && state.status !== 'error' && (
        <div role="alert" aria-label={`${label} 更多选项加载失败`}>
          <span>更多选项加载失败。</span>
          <button
            type="button"
            className="btn"
            onClick={state.retry}
            aria-label={`重试加载 ${label} 更多选项`}
          >
            重试
          </button>
        </div>
      )}
      {state.hasMore && !state.pageError && (
        <button
          type="button"
          className="a3s-form-data-source-more btn"
          data-size="sm"
          data-variant="secondary"
          disabled={state.loadingMore}
          onClick={state.loadMore}
          aria-label="加载更多选项"
        >
          {state.loadingMore ? '加载中…' : '加载更多'}
        </button>
      )}
    </div>
  );
}
