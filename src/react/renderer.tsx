import {
  type ComponentType,
  type FormEvent,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  evaluateComputedRules,
  evaluateFormValue,
  type FieldError,
  type FormHostAdapter,
  type FormPlan,
  fieldState,
  type JsonObject,
  type JsonValue,
  readFormValue,
  type UiNode,
  type UiOption,
  updateFormValue,
} from '../core';
import type { FormNodeRegistry } from './node-registry';
import { SelectControl } from './select-control';

export interface FormWidgetProps {
  id: string;
  node: UiNode;
  value: JsonValue | undefined;
  disabled: boolean;
  invalid: boolean;
  required?: boolean;
  describedBy?: string;
  options: UiOption[];
  onChange: (value: JsonValue) => void;
}

export type FormWidget = ComponentType<FormWidgetProps>;
export type FormWidgetRegistry = Record<string, FormWidget>;

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
  className?: string;
}

function formItemStyle(width: number | undefined, extra?: React.CSSProperties) {
  return {
    '--a3s-form-item-column': `span ${width ?? 12}`,
    ...extra,
  } as React.CSSProperties;
}

function NativeWidget({
  id,
  node,
  value,
  disabled,
  invalid,
  required,
  describedBy,
  options,
  onChange,
}: FormWidgetProps) {
  const common: InputHTMLAttributes<HTMLInputElement> = {
    id,
    className: 'input',
    disabled,
    required,
    'aria-label': node.label ?? node.id,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    placeholder: node.placeholder,
  };
  switch (node.widget) {
    case 'textarea':
      return (
        <textarea
          id={id}
          className="textarea"
          disabled={disabled}
          required={required}
          aria-label={node.label ?? node.id}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder={node.placeholder}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'number':
      return (
        <input
          {...common}
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : event.target.valueAsNumber)
          }
        />
      );
    case 'checkbox':
    case 'switch':
      return (
        <label className={`a3s-form-check is-${node.widget}${required ? ' is-required' : ''}`}>
          <input
            {...common}
            type="checkbox"
            role={node.widget === 'switch' ? 'switch' : undefined}
            aria-checked={node.widget === 'switch' ? Boolean(value) : undefined}
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{node.label ?? '启用'}</span>
        </label>
      );
    case 'select':
      return (
        <SelectControl
          id={id}
          disabled={disabled}
          required={required}
          aria-label={node.label ?? node.id}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={String(value ?? '')}
          onChange={(event) => {
            const selected = options.find((option) => String(option.value) === event.target.value);
            onChange(selected?.value ?? event.target.value);
          }}
        >
          <option value="">{node.placeholder ?? '请选择'}</option>
          {options.map((option) => (
            <option
              key={`${option.label}-${String(option.value)}`}
              value={String(option.value)}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </SelectControl>
      );
    case 'radio':
      return (
        <div
          className="a3s-form-choice-group"
          role="radiogroup"
          aria-label={node.label ?? node.id}
          aria-describedby={describedBy}
          aria-required={required || undefined}
        >
          {options.map((option) => (
            <label key={`${option.label}-${String(option.value)}`}>
              <input
                className="input"
                type="radio"
                name={id}
                value={String(option.value)}
                checked={Object.is(value, option.value)}
                disabled={disabled || option.disabled}
                required={required}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      );
    default:
      return (
        <input
          {...common}
          type={
            node.widget === 'email' || node.widget === 'password' || node.widget === 'date'
              ? node.widget
              : 'text'
          }
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
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

function useOptions(
  node: UiNode,
  plan: FormPlan,
  value: JsonObject,
  hostAdapter: FormHostAdapter | undefined,
  locale: string,
): UiOption[] {
  const [remote, setRemote] = useState<UiOption[]>([]);
  const source = useMemo(
    () => plan.dataSources.find((item) => item.id === node.dataSource),
    [node.dataSource, plan.dataSources],
  );
  useEffect(() => {
    if (!source || !hostAdapter?.resolveDataSource) return;
    const controller = new AbortController();
    hostAdapter
      .resolveDataSource({ definition: source, value, locale }, controller.signal)
      .then(setRemote)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.warn('A3S Form data source failed.', error);
      });
    return () => controller.abort();
  }, [hostAdapter, locale, source, value]);
  return node.options ?? remote;
}

interface NodeViewProps extends FormRendererProps {
  nodeId: string;
  errorMap: Map<string, FieldError[]>;
  prefix: string;
  suppressHeading?: boolean;
}

function NodeView(props: NodeViewProps): ReactNode {
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
  const options = useOptions(
    node,
    plan,
    value,
    props.hostAdapter,
    props.locale ?? plan.metadata.locale ?? 'zh-CN',
  );
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
        style={formItemStyle(node.width)}
      >
        <CustomNode
          id={inputId}
          node={node}
          plan={plan}
          value={current}
          formValue={value}
          disabled={Boolean(props.readOnly || !state.enabled)}
          invalid={errors.length > 0}
          errors={errors}
          options={options}
          onChange={(next) => {
            if (node.valuePath) onChange(updateFormValue(value, node.valuePath, next));
          }}
          onFormChange={onChange}
        >
          {children}
        </CustomNode>
        {errors.map((error) => (
          <div className="a3s-form-error" role="alert" key={error.code}>
            {error.message}
          </div>
        ))}
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
                onChange(updateFormValue(value, node.valuePath as string, next));
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
                    value,
                    node.valuePath as string,
                    items.filter((_, itemIndex) => itemIndex !== index),
                  ),
                )
              }
            >
              移除
            </button>
          </div>
        ))}
        <button
          type="button"
          className="a3s-form-secondary btn"
          data-size="sm"
          data-variant="secondary"
          onClick={() => onChange(updateFormValue(value, node.valuePath as string, [...items, '']))}
        >
          添加一项
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
      </fieldset>
    );
  }
  return (
    <div
      className={`a3s-form-field field${errors.length ? ' is-invalid' : ''}`}
      data-invalid={errors.length > 0 || undefined}
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
      <Widget
        id={inputId}
        node={node}
        value={current}
        disabled={Boolean(props.readOnly || !state.enabled)}
        invalid={errors.length > 0}
        required={required}
        describedBy={describedBy || undefined}
        options={options}
        onChange={(next) => onChange(updateFormValue(value, node.valuePath as string, next))}
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
    </div>
  );
}

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
  const [submittedErrors, setSubmittedErrors] = useState<FieldError[]>([]);
  const [pendingAction, setPendingAction] = useState<string>();
  const [actionError, setActionError] = useState('');
  const computed = useMemo(
    () => evaluateComputedRules(props.plan, props.value),
    [props.plan, props.value],
  );
  const runtimeValue = computed.value;
  const errors = useMemo(() => {
    const hostErrors = props.errors ?? submittedErrors;
    return [
      ...computed.errors,
      ...hostErrors.filter(
        (error) =>
          !computed.errors.some(
            (computedError) =>
              computedError.path === error.path && computedError.code === error.code,
          ),
      ),
    ];
  }, [computed.errors, props.errors, submittedErrors]);
  const errorMap = useMemo(() => {
    const map = new Map<string, FieldError[]>();
    for (const error of errors) map.set(error.path, [...(map.get(error.path) ?? []), error]);
    return map;
  }, [errors]);
  const defaultAction =
    props.plan.actions.find((item) => item.tone === 'primary') ?? props.plan.actions[0];

  useEffect(() => () => actionController.current?.abort(), []);

  const focusError = (path: string) => {
    const node = Object.values(props.plan.nodeById).find((item) => item.valuePath === path);
    if (!node) return;
    const control = window.document.getElementById(`${prefix}-${node.id}`);
    control?.focus();
    control?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const changeValue = (next: JsonObject) => {
    const evaluation = evaluateFormValue(props.plan, next);
    props.onChange(evaluation.value);
    if (props.errors === undefined && submittedErrors.length > 0) {
      setSubmittedErrors(evaluation.errors);
    }
  };

  const invoke = async (actionId: string, requiresValidation: boolean) => {
    if (pendingAction) return;
    setActionError('');
    const evaluation = evaluateFormValue(props.plan, runtimeValue);
    if (requiresValidation) {
      const nextErrors = evaluation.errors;
      setSubmittedErrors(nextErrors);
      if (nextErrors.length > 0) {
        window.requestAnimationFrame(() => focusError(nextErrors[0].path));
        return;
      }
    }
    const definition = props.plan.actions.find((item) => item.id === actionId);
    if (!definition) return;
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
      if (!controller.signal.aborted) setActionError('操作没有完成，请检查网络或宿主状态后重试。');
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
      aria-busy={Boolean(pendingAction)}
      lang={props.locale ?? props.plan.metadata.locale ?? 'zh-CN'}
    >
      <NodeView
        {...props}
        value={runtimeValue}
        onChange={changeValue}
        nodeId={props.plan.root}
        errorMap={errorMap}
        prefix={prefix}
      />
      {errors.length > 0 && (
        <section className="a3s-form-error-summary" role="alert" aria-label="表单校验结果">
          <strong>请检查 {errors.length} 项内容</strong>
          <ul>
            {errors.map((error) => {
              const node = Object.values(props.plan.nodeById).find(
                (item) => item.valuePath === error.path,
              );
              return (
                <li key={`${error.path}-${error.code}-${error.message}`}>
                  {node ? (
                    <button type="button" onClick={() => focusError(error.path)}>
                      {node.label ?? node.id}：{error.message}
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
                disabled={Boolean(props.readOnly || pendingAction)}
              >
                {pendingAction === action.id ? '处理中…' : action.label}
              </button>
            );
          })}
        </footer>
      )}
      {pendingAction && (
        <span className="a3s-form-action-progress" role="status" aria-live="polite">
          正在处理表单操作。
        </span>
      )}
    </form>
  );
}
