import {
  type FormEvent,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DataSourceCoordinator,
  evaluateFormValue,
  type FieldError,
  type FormHostAdapter,
  type FormLocaleCatalogOverride,
  type FormLocaleMessages,
  type FormPlan,
  fieldState,
  formatFormMessage,
  IncrementalComputedRuleEvaluator,
  type JsonObject,
  readFormValue,
  resolveFormLocaleCatalog,
  type UiNode,
  updateFormValue,
  validateFormValueAsync,
} from '../core';
import { DataSourceSearch, DataSourceStatus, useFormDataSource } from './data-source';
import { type FormWidgetRegistry, NativeWidget } from './native-widget';
import type { FormNodeRegistry } from './node-registry';
import { subscribedNodePropsEqual } from './subscriptions';

export type { FormWidget, FormWidgetProps, FormWidgetRegistry } from './native-widget';

export interface FormRendererProps {
  plan: FormPlan;
  value: JsonObject;
  onChange: (value: JsonObject) => void;
  onAction?: (actionId: string, value: JsonObject) => void | Promise<void>;
  errors?: FieldError[];
  hostAdapter?: FormHostAdapter;
  widgetRegistry?: FormWidgetRegistry;
  nodeRegistry?: FormNodeRegistry;
  readOnly?: boolean;
  locale?: string;
  localeCatalog?: FormLocaleCatalogOverride;
  className?: string;
}

function formItemStyle(width: number | undefined, extra?: React.CSSProperties) {
  return {
    '--a3s-form-item-column': `span ${width ?? 12}`,
    ...extra,
  } as React.CSSProperties;
}

function isRequiredField(plan: FormPlan, node: UiNode): boolean {
  const tokens = node.schemaPath
    ?.split('/')
    .slice(1)
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (!tokens || tokens.length < 2 || tokens.at(-2) !== 'properties') return false;
  let parent: unknown = plan.schema;
  for (const token of tokens.slice(0, -2)) {
    if (!parent || typeof parent !== 'object' || !(token in parent)) return false;
    parent = (parent as Record<string, unknown>)[token];
  }
  if (!parent || typeof parent !== 'object') return false;
  const required = (parent as { required?: unknown }).required;
  return Array.isArray(required) && required.includes(tokens.at(-1));
}

interface NodeViewProps extends FormRendererProps {
  dataSourceCoordinator: DataSourceCoordinator;
  getValue: () => JsonObject;
  messages: Readonly<FormLocaleMessages>;
  nodeId: string;
  errorMap: Map<string, FieldError[]>;
  prefix: string;
  onFieldBlur: (nodeId: string, path: string) => void;
  validatingPaths: ReadonlySet<string>;
  suppressHeading?: boolean;
}

function ValidationStatus({
  label,
  messages,
}: {
  label: string;
  messages: Readonly<FormLocaleMessages>;
}) {
  return (
    <span
      className="a3s-form-validation-status"
      role="status"
      aria-label={formatFormMessage(messages, 'validationPendingLabel', { label })}
    >
      {messages.validationPending}
    </span>
  );
}

function NodeView(props: NodeViewProps): ReactNode {
  const node = props.plan.nodeById[props.nodeId];
  const extension = node?.widget ? props.nodeRegistry?.[node.widget] : undefined;
  if ((node?.kind === 'field' || node?.kind === 'repeater') && !extension) {
    return <SubscribedNodeView {...props} />;
  }
  return <NodeViewContent {...props} />;
}

function NodeViewContent(props: NodeViewProps): ReactNode {
  const {
    plan,
    nodeId,
    value,
    onChange,
    widgetRegistry = {},
    nodeRegistry = {},
    errorMap,
    prefix,
  } = props;
  const node = plan.nodeById[nodeId];
  const [activeLayoutChild, setActiveLayoutChild] = useState<string>();
  const state = fieldState(plan, nodeId, value);
  const validating = node.valuePath ? props.validatingPaths.has(node.valuePath) : false;
  const dataSource = useFormDataSource({
    coordinator: props.dataSourceCoordinator,
    getValue: props.getValue,
    hostAdapter: props.hostAdapter,
    locale: props.locale ?? plan.metadata.locale ?? 'zh-CN',
    node,
    plan,
    value,
    visible: state.visible,
  });
  const options = dataSource.options;
  if (!node || !state.visible) return null;
  const extension = node.widget ? nodeRegistry[node.widget] : undefined;
  if (extension) {
    const CustomNode = extension.render;
    const current = node.valuePath ? readFormValue(value, node.valuePath) : undefined;
    const errors = node.valuePath ? (errorMap.get(node.valuePath) ?? []) : [];
    const inputId = `${prefix}-${node.id}`;
    const children = (node.children ?? []).length ? (
      <div className="a3s-form-custom-children">
        {(node.children ?? []).map((child) => (
          <NodeView key={child} {...props} nodeId={child} />
        ))}
      </div>
    ) : undefined;
    return (
      <div
        className={`a3s-form-custom-node field${errors.length ? ' is-invalid' : ''}`}
        data-node-type={node.widget}
        data-invalid={errors.length > 0 || undefined}
        data-validating={validating || undefined}
        aria-busy={
          validating || dataSource.status === 'loading' || dataSource.loadingMore || undefined
        }
        style={formItemStyle(node.width)}
      >
        <DataSourceSearch
          label={node.label ?? node.id}
          messages={props.messages}
          state={dataSource}
        />
        <CustomNode
          id={inputId}
          node={node}
          plan={plan}
          value={current}
          formValue={value}
          messages={props.messages}
          disabled={Boolean(
            props.readOnly ||
              !state.enabled ||
              dataSource.status === 'blocked' ||
              dataSource.status === 'loading',
          )}
          invalid={errors.length > 0}
          errors={errors}
          options={options}
          dataSource={dataSource}
          onChange={(next) => {
            if (node.valuePath) onChange(updateFormValue(props.getValue(), node.valuePath, next));
          }}
          onFormChange={onChange}
          onBlur={
            state.enabled && node.valuePath
              ? () => props.onFieldBlur(node.id, node.valuePath as string)
              : undefined
          }
          onFocus={dataSource.activate}
        >
          {children}
        </CustomNode>
        <DataSourceStatus
          label={node.label ?? node.id}
          messages={props.messages}
          state={dataSource}
        />
        {errors.map((error) => (
          <div className="a3s-form-error" role="alert" key={`${error.code}-${error.message}`}>
            {error.message}
          </div>
        ))}
        {validating && <ValidationStatus label={node.label ?? node.id} messages={props.messages} />}
      </div>
    );
  }
  if (node.kind === 'content') {
    if (node.presentation === 'divider')
      return (
        <div className="a3s-form-content a3s-form-divider" style={formItemStyle(node.width)}>
          <span />
          {node.content && <em>{node.content}</em>}
          <span />
        </div>
      );
    if (node.presentation === 'spacer')
      return (
        <div
          className="a3s-form-content a3s-form-spacer"
          style={formItemStyle(node.width, { height: node.gap ?? 24 })}
          aria-hidden="true"
        />
      );
    return (
      <div className="a3s-form-content" style={formItemStyle(node.width)}>
        {node.content}
      </div>
    );
  }
  if (node.kind !== 'field' && node.kind !== 'repeater') {
    const Tag = node.kind === 'section' ? 'section' : 'div';
    const layoutStyle = {
      '--a3s-form-gap': `${node.gap ?? 16}px`,
      '--a3s-form-item-column': `span ${node.width ?? 12}`,
    } as React.CSSProperties;
    if (node.layout === 'tabs') {
      const tabs = (node.children ?? [])
        .map((child) => plan.nodeById[child])
        .filter((child) => child !== undefined);
      const active = tabs.some((tab) => tab.id === activeLayoutChild)
        ? activeLayoutChild
        : tabs[0]?.id;
      return (
        <section
          className="a3s-form-layout a3s-form-tabs tabs"
          aria-labelledby={node.label ? `${prefix}-${node.id}-title` : undefined}
          style={layoutStyle}
        >
          {!props.suppressHeading && node.label && (
            <header>
              <h2 id={`${prefix}-${node.id}-title`}>{node.label}</h2>
              {node.description && <p>{node.description}</p>}
            </header>
          )}
          <div className="a3s-form-tablist" role="tablist" aria-label={node.label}>
            {tabs.map((tab) => (
              <button
                type="button"
                role="tab"
                id={`${prefix}-${node.id}-tab-${tab.id}`}
                aria-selected={tab.id === active}
                aria-controls={`${prefix}-${node.id}-panel`}
                tabIndex={tab.id === active ? 0 : -1}
                key={tab.id}
                onKeyDown={(event) => handleLayoutTabKey(event, tabs, tab.id, setActiveLayoutChild)}
                onClick={() => setActiveLayoutChild(tab.id)}
              >
                {tab.label ?? tab.id}
              </button>
            ))}
          </div>
          {active && (
            <div
              className="a3s-form-tabpanel"
              id={`${prefix}-${node.id}-panel`}
              role="tabpanel"
              aria-labelledby={`${prefix}-${node.id}-tab-${active}`}
            >
              <NodeView {...props} nodeId={active} suppressHeading />
            </div>
          )}
        </section>
      );
    }
    if (node.layout === 'collapse') {
      return (
        <section
          className="a3s-form-layout a3s-form-collapse accordion"
          aria-labelledby={node.label ? `${prefix}-${node.id}-title` : undefined}
          style={layoutStyle}
        >
          {!props.suppressHeading && node.label && (
            <header>
              <h2 id={`${prefix}-${node.id}-title`}>{node.label}</h2>
              {node.description && <p>{node.description}</p>}
            </header>
          )}
          {(node.children ?? []).map((child) => {
            const panel = plan.nodeById[child];
            return (
              <details key={child} open>
                <summary>{panel?.label ?? child}</summary>
                <NodeView {...props} nodeId={child} suppressHeading />
              </details>
            );
          })}
        </section>
      );
    }
    return (
      <Tag
        className={`a3s-form-layout a3s-form-${node.kind} a3s-form-${node.layout ?? 'flow'}${node.layout === 'card' ? ' card' : ''}`}
        aria-labelledby={node.label ? `${prefix}-${node.id}-title` : undefined}
        style={layoutStyle}
      >
        {!props.suppressHeading && node.label && (
          <header>
            <h2 id={`${prefix}-${node.id}-title`}>{node.label}</h2>
            {node.description && <p>{node.description}</p>}
          </header>
        )}
        <div
          className="a3s-form-grid"
          style={
            {
              '--a3s-form-columns': node.columns ?? 12,
              '--a3s-form-gap': `${node.gap ?? 16}px`,
            } as React.CSSProperties
          }
        >
          {(node.children ?? []).map((child) => (
            <NodeView key={child} {...props} nodeId={child} />
          ))}
        </div>
      </Tag>
    );
  }
  if (!node.valuePath) return null;
  const current = readFormValue(value, node.valuePath);
  const errors = errorMap.get(node.valuePath) ?? [];
  const inputId = `${prefix}-${node.id}`;
  const required = isRequiredField(plan, node);
  const describedBy = [
    node.description ? `${inputId}-help` : undefined,
    ...errors.map((_, index) => `${inputId}-error-${index + 1}`),
  ]
    .filter(Boolean)
    .join(' ');
  const Widget = widgetRegistry[node.widget ?? 'text'] ?? NativeWidget;
  if (node.kind === 'repeater') {
    const items = Array.isArray(current) ? current : [];
    return (
      <fieldset
        className={`a3s-form-field a3s-form-repeater fieldset${errors.length ? ' is-invalid' : ''}`}
        style={formItemStyle(node.width)}
        disabled={props.readOnly || !state.enabled}
        aria-describedby={describedBy || undefined}
        aria-busy={validating || undefined}
        data-validating={validating || undefined}
        onBlur={(event) => {
          if (state.enabled && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
            props.onFieldBlur(node.id, node.valuePath as string);
          }
        }}
      >
        <legend className={required ? 'is-required' : undefined}>{node.label ?? node.id}</legend>
        {node.description && (
          <div className="a3s-form-help" id={`${inputId}-help`}>
            {node.description}
          </div>
        )}
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Primitive repeater values have no separate stable identity.
          <div className="a3s-form-repeat-row" key={`${node.id}-${index}`}>
            <input
              className="input"
              aria-label={`${node.label ?? node.id} ${index + 1}`}
              value={String(item ?? '')}
              onChange={(event) => {
                const next = [...items];
                next[index] = event.target.value;
                onChange(updateFormValue(props.getValue(), node.valuePath as string, next));
              }}
            />
            <button
              type="button"
              className="btn"
              data-size="sm"
              data-variant="destructive"
              onClick={() =>
                onChange(
                  updateFormValue(
                    props.getValue(),
                    node.valuePath as string,
                    items.filter((_, itemIndex) => itemIndex !== index),
                  ),
                )
              }
            >
              {props.messages.repeaterRemove}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="a3s-form-secondary btn"
          data-size="sm"
          data-variant="secondary"
          onClick={() =>
            onChange(updateFormValue(props.getValue(), node.valuePath as string, [...items, '']))
          }
        >
          {props.messages.repeaterAdd}
        </button>
        {errors.map((error, index) => (
          <div
            className="a3s-form-error"
            id={`${inputId}-error-${index + 1}`}
            role="alert"
            key={`${error.code}-${error.message}`}
          >
            {error.message}
          </div>
        ))}
        {validating && <ValidationStatus label={node.label ?? node.id} messages={props.messages} />}
      </fieldset>
    );
  }
  return (
    <div
      className={`a3s-form-field field${errors.length ? ' is-invalid' : ''}`}
      data-invalid={errors.length > 0 || undefined}
      data-validating={validating || undefined}
      aria-busy={
        validating || dataSource.status === 'loading' || dataSource.loadingMore || undefined
      }
      style={formItemStyle(node.width)}
    >
      {node.widget !== 'checkbox' && node.widget !== 'switch' && (
        <label
          id={`${inputId}-label`}
          htmlFor={inputId}
          className={required ? 'is-required' : undefined}
        >
          {node.label ?? node.id}
        </label>
      )}
      {node.description && (
        <div className="a3s-form-help" id={`${inputId}-help`}>
          {node.description}
        </div>
      )}
      <DataSourceSearch
        label={node.label ?? node.id}
        messages={props.messages}
        state={dataSource}
      />
      <Widget
        id={inputId}
        node={node}
        value={current}
        disabled={Boolean(
          props.readOnly ||
            !state.enabled ||
            dataSource.status === 'blocked' ||
            dataSource.status === 'loading',
        )}
        invalid={errors.length > 0}
        required={required}
        describedBy={describedBy || undefined}
        options={options}
        dataSource={dataSource}
        messages={props.messages}
        onChange={(next) =>
          onChange(updateFormValue(props.getValue(), node.valuePath as string, next))
        }
        onBlur={
          state.enabled ? () => props.onFieldBlur(node.id, node.valuePath as string) : undefined
        }
        onFocus={dataSource.activate}
      />
      <DataSourceStatus
        label={node.label ?? node.id}
        messages={props.messages}
        state={dataSource}
      />
      {errors.map((error, index) => (
        <div
          className="a3s-form-error"
          id={`${inputId}-error-${index + 1}`}
          role="alert"
          key={`${error.code}-${error.message}`}
        >
          {error.message}
        </div>
      ))}
      {validating && <ValidationStatus label={node.label ?? node.id} messages={props.messages} />}
    </div>
  );
}

const SubscribedNodeView = memo(NodeViewContent, subscribedNodePropsEqual);

function handleLayoutTabKey(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  tabs: readonly { id: string }[],
  currentId: string,
  onChange: (id: string) => void,
) {
  const current = tabs.findIndex((tab) => tab.id === currentId);
  if (current < 0) return;
  let nextIndex: number | undefined;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  if (event.key === 'ArrowRight') nextIndex = (current + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (current - 1 + tabs.length) % tabs.length;
  if (nextIndex === undefined) return;
  event.preventDefault();
  onChange(tabs[nextIndex].id);
  const buttons =
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons?.[nextIndex]?.focus();
}

export function FormRenderer(props: FormRendererProps) {
  const generatedId = useId().replaceAll(':', '');
  const prefix = `a3sf-${generatedId}`;
  const formRef = useRef<HTMLFormElement>(null);
  const actionController = useRef<AbortController | null>(null);
  const formValidationController = useRef<AbortController | null>(null);
  const fieldValidationControllers = useRef(new Map<string, AbortController>());
  // biome-ignore lint/correctness/useExhaustiveDependencies: Resolver identity is the cache and tenant boundary.
  const dataSourceCoordinator = useMemo(
    () => new DataSourceCoordinator(),
    [props.hostAdapter?.resolveDataSource],
  );
  const validationBoundary = useRef({
    hostAdapter: props.hostAdapter,
    plan: props.plan,
    value: props.value,
  });
  const [submittedErrors, setSubmittedErrors] = useState<FieldError[]>([]);
  const [fieldAsyncErrors, setFieldAsyncErrors] = useState<Record<string, FieldError[]>>({});
  const [formAsyncErrors, setFormAsyncErrors] = useState<FieldError[]>([]);
  const [validatingPaths, setValidatingPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [validatingForm, setValidatingForm] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>();
  const [actionError, setActionError] = useState('');
  const locale = props.locale ?? props.plan.metadata.locale ?? 'zh-CN';
  const localeCatalog = useMemo(
    () => resolveFormLocaleCatalog(locale, props.localeCatalog),
    [locale, props.localeCatalog],
  );
  const messages = localeCatalog.messages;
  const computedRuleEvaluator = useMemo(() => new IncrementalComputedRuleEvaluator(), []);
  const computed = useMemo(
    () => computedRuleEvaluator.evaluate(props.plan, props.value),
    [computedRuleEvaluator, props.plan, props.value],
  );
  const runtimeValue = computed.value;
  const runtimeValueRef = useRef(runtimeValue);
  runtimeValueRef.current = runtimeValue;
  const getValue = useCallback(() => runtimeValueRef.current, []);
  const asyncErrors = useMemo(
    () => [
      ...Object.keys(fieldAsyncErrors)
        .sort()
        .flatMap((path) => fieldAsyncErrors[path]),
      ...formAsyncErrors,
    ],
    [fieldAsyncErrors, formAsyncErrors],
  );
  const errors = useMemo(() => {
    const hostErrors = props.errors ?? submittedErrors;
    const unique = new Map<string, FieldError>();
    for (const error of [...computed.errors, ...hostErrors, ...asyncErrors]) {
      unique.set(`${error.path}\u0000${error.code}\u0000${error.message}`, error);
    }
    return [...unique.values()];
  }, [asyncErrors, computed.errors, props.errors, submittedErrors]);
  const errorMap = useMemo(() => {
    const map = new Map<string, FieldError[]>();
    for (const error of errors) map.set(error.path, [...(map.get(error.path) ?? []), error]);
    return map;
  }, [errors]);
  const defaultAction =
    props.plan.actions.find((item) => item.tone === 'primary') ?? props.plan.actions[0];

  const abortFieldValidations = useCallback(() => {
    for (const controller of fieldValidationControllers.current.values()) controller.abort();
    fieldValidationControllers.current.clear();
  }, []);

  const cancelAsyncValidations = useCallback(() => {
    abortFieldValidations();
    formValidationController.current?.abort();
    formValidationController.current = null;
    setValidatingPaths(new Set());
    setValidatingForm(false);
    setFieldAsyncErrors({});
    setFormAsyncErrors([]);
  }, [abortFieldValidations]);

  useEffect(() => {
    const previous = validationBoundary.current;
    if (
      previous.hostAdapter === props.hostAdapter &&
      previous.plan === props.plan &&
      previous.value === props.value
    ) {
      return;
    }
    validationBoundary.current = {
      hostAdapter: props.hostAdapter,
      plan: props.plan,
      value: props.value,
    };
    cancelAsyncValidations();
  });

  useEffect(
    () => () => {
      actionController.current?.abort();
      formValidationController.current?.abort();
      abortFieldValidations();
    },
    [abortFieldValidations],
  );

  useEffect(() => () => dataSourceCoordinator.clear(), [dataSourceCoordinator]);

  const focusError = (path: string) => {
    const node = Object.values(props.plan.nodeById).find((item) => item.valuePath === path);
    if (!node) return;
    const control = window.document.getElementById(`${prefix}-${node.id}`);
    control?.focus();
    control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const changeValueImplementation = useRef<(next: JsonObject) => void>(() => undefined);
  const changeValue = useCallback(
    (next: JsonObject) => changeValueImplementation.current(next),
    [],
  );
  changeValueImplementation.current = (next: JsonObject) => {
    cancelAsyncValidations();
    const evaluation = evaluateFormValue(props.plan, next, {
      locale,
      localeCatalog: props.localeCatalog,
    });
    runtimeValueRef.current = evaluation.value;
    props.onChange(evaluation.value);
    if (props.errors === undefined && submittedErrors.length > 0) {
      setSubmittedErrors(evaluation.errors);
    }
  };

  const validateField = async (nodeId: string, path: string) => {
    const validator = props.hostAdapter?.validateValue;
    if (!validator || props.readOnly || formValidationController.current || pendingAction) return;

    fieldValidationControllers.current.get(path)?.abort();
    const controller = new AbortController();
    fieldValidationControllers.current.set(path, controller);
    setFieldAsyncErrors((current) => {
      if (!(path in current)) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
    setValidatingPaths((current) => new Set(current).add(path));

    const result = await validateFormValueAsync(
      props.plan,
      runtimeValue,
      validator,
      {
        scope: { kind: 'field', nodeId, path },
        trigger: 'blur',
        locale: props.locale ?? props.plan.metadata.locale,
        localeCatalog: props.localeCatalog,
      },
      controller.signal,
    );
    if (controller.signal.aborted || fieldValidationControllers.current.get(path) !== controller) {
      return;
    }
    fieldValidationControllers.current.delete(path);
    setValidatingPaths((current) => {
      if (!current.has(path)) return current;
      const next = new Set(current);
      next.delete(path);
      return next;
    });
    setFieldAsyncErrors((current) => {
      if (result.asyncErrors.length === 0) {
        if (!(path in current)) return current;
        const next = { ...current };
        delete next[path];
        return next;
      }
      return { ...current, [path]: result.asyncErrors };
    });
  };
  const validateFieldImplementation = useRef(validateField);
  validateFieldImplementation.current = validateField;
  const onFieldBlur = useCallback(
    (nodeId: string, path: string) => void validateFieldImplementation.current(nodeId, path),
    [],
  );

  const invoke = async (actionId: string, requiresValidation: boolean) => {
    if (pendingAction || formValidationController.current) return;
    const definition = props.plan.actions.find((item) => item.id === actionId);
    if (!definition) return;
    setActionError('');
    let evaluation = evaluateFormValue(props.plan, runtimeValue, {
      locale,
      localeCatalog: props.localeCatalog,
    });
    if (requiresValidation) {
      const nextErrors = evaluation.errors;
      setSubmittedErrors(nextErrors);
      if (nextErrors.length > 0) {
        window.requestAnimationFrame(() => focusError(nextErrors[0].path));
        return;
      }
      if (props.hostAdapter?.validateValue) {
        abortFieldValidations();
        setValidatingPaths(new Set());
        setFieldAsyncErrors({});
        setFormAsyncErrors([]);
        const controller = new AbortController();
        formValidationController.current = controller;
        setValidatingForm(true);
        const asyncEvaluation = await validateFormValueAsync(
          props.plan,
          evaluation.value,
          props.hostAdapter.validateValue,
          {
            scope: { kind: 'form' },
            trigger: 'submit',
            locale: props.locale ?? props.plan.metadata.locale,
            localeCatalog: props.localeCatalog,
          },
          controller.signal,
        );
        if (controller.signal.aborted || formValidationController.current !== controller) {
          return;
        }
        formValidationController.current = null;
        setValidatingForm(false);
        setFormAsyncErrors(asyncEvaluation.asyncErrors);
        if (asyncEvaluation.status !== 'valid') {
          const firstError = asyncEvaluation.errors[0];
          if (firstError) window.requestAnimationFrame(() => focusError(firstError.path));
          return;
        }
        evaluation = asyncEvaluation;
      }
    }
    setPendingAction(actionId);
    const controller = new AbortController();
    actionController.current = controller;
    try {
      if (props.onAction) await props.onAction(actionId, evaluation.value);
      else if (props.hostAdapter?.invokeAction) {
        await props.hostAdapter.invokeAction(
          { definition, value: evaluation.value, plan: props.plan },
          controller.signal,
        );
      }
    } catch {
      if (!controller.signal.aborted) setActionError(messages.actionFailed);
    } finally {
      if (!controller.signal.aborted) setPendingAction(undefined);
      if (actionController.current === controller) actionController.current = null;
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (defaultAction) {
      void invoke(
        defaultAction.id,
        defaultAction.tone === 'primary' || defaultAction.tone === undefined,
      );
    }
  };

  return (
    <form
      ref={formRef}
      className={`a3s-form-renderer ${props.className ?? ''}`}
      onSubmit={submit}
      noValidate
      aria-busy={Boolean(pendingAction || validatingForm)}
      lang={locale}
    >
      <NodeView
        {...props}
        value={runtimeValue}
        onChange={changeValue}
        dataSourceCoordinator={dataSourceCoordinator}
        getValue={getValue}
        messages={messages}
        nodeId={props.plan.root}
        errorMap={errorMap}
        prefix={prefix}
        onFieldBlur={onFieldBlur}
        validatingPaths={validatingPaths}
      />
      {errors.length > 0 && (
        <section
          className="a3s-form-error-summary"
          role="alert"
          aria-label={messages.errorSummaryLabel}
        >
          <strong>
            {formatFormMessage(messages, 'errorSummaryTitle', {
              count: errors.length,
              fieldLabel: errors.length === 1 ? 'field' : 'fields',
            })}
          </strong>
          <ul>
            {errors.map((error) => {
              const node = Object.values(props.plan.nodeById).find(
                (item) => item.valuePath === error.path,
              );
              return (
                <li key={`${error.path}-${error.code}-${error.message}`}>
                  {node ? (
                    <button type="button" onClick={() => focusError(error.path)}>
                      {node.label ?? node.id}
                      {messages.errorSummarySeparator}
                      {error.message}
                    </button>
                  ) : (
                    error.message
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {actionError && (
        <div className="a3s-form-action-error" role="alert">
          {actionError}
        </div>
      )}
      {props.plan.actions.length > 0 && (
        <footer className="a3s-form-actions">
          {props.plan.actions.map((action) => {
            const primary =
              action.tone === 'primary' ||
              (action.tone === undefined && action.id === defaultAction?.id);
            const danger = action.tone === 'danger';
            const variant = danger ? 'destructive' : primary ? 'primary' : 'secondary';
            return (
              <button
                key={action.id}
                type={primary ? 'submit' : 'button'}
                className={`btn ${danger ? 'a3s-form-danger' : primary ? 'a3s-form-primary' : 'a3s-form-secondary'}`}
                data-variant={variant}
                onClick={(event) => {
                  if (primary) event.preventDefault();
                  void invoke(action.id, primary);
                }}
                disabled={Boolean(props.readOnly || pendingAction || validatingForm)}
              >
                {pendingAction === action.id
                  ? messages.actionButtonPending
                  : validatingForm && primary
                    ? messages.formValidationButtonPending
                    : action.label}
              </button>
            );
          })}
        </footer>
      )}
      {pendingAction && (
        <span className="a3s-form-action-progress" role="status" aria-live="polite">
          {messages.actionPending}
        </span>
      )}
      {validatingForm && (
        <span
          className="a3s-form-action-progress"
          role="status"
          aria-label={messages.formValidationPendingLabel}
          aria-live="polite"
        >
          {messages.formValidationPending}
        </span>
      )}
    </form>
  );
}
