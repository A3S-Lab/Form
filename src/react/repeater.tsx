import type { CSSProperties, ReactNode } from 'react';
import {
  type CompiledNode,
  type FieldError,
  type FormLocaleMessages,
  formatFormMessage,
  type JsonObject,
  type JsonSchema,
  type JsonValue,
} from '../core';
import { useStableRepeaterRows } from './repeater-state';

interface RepeaterFieldProps {
  id: string;
  node: CompiledNode;
  items: JsonValue[];
  valuePath: string;
  required: boolean;
  disabled: boolean;
  validating: boolean;
  describedBy?: string;
  errors: readonly FieldError[];
  messages: Readonly<FormLocaleMessages>;
  style: CSSProperties;
  onBlur: () => void;
  onChange: (items: JsonValue[]) => void;
  identifyItem?: (item: JsonValue, index: number) => string | undefined;
  renderRow: (index: number, key: string) => ReactNode;
  validationStatus?: ReactNode;
}

function RepeaterIcon({ name }: { name: 'add' | 'up' | 'down' | 'remove' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none">
      {name === 'add' && <path d="M8 3.25v9.5M3.25 8h9.5" />}
      {name === 'up' && <path d="m4.25 9.75 3.75-3.5 3.75 3.5" />}
      {name === 'down' && <path d="m4.25 6.25 3.75 3.5 3.75-3.5" />}
      {name === 'remove' && (
        <path d="M3.75 4.75h8.5M6 4.75V3.5h4v1.25m1.25 0-.5 8H5.25l-.5-8M6.75 7v3.5M9.25 7v3.5" />
      )}
    </svg>
  );
}

function generatedItemKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultValue(schema: JsonSchema | undefined): JsonValue {
  if (schema?.default !== undefined) return structuredClone(schema.default);
  if (schema?.type === 'object') {
    const value: JsonObject = {};
    for (const [property, child] of Object.entries(schema.properties ?? {})) {
      if (child.default !== undefined) value[property] = structuredClone(child.default);
    }
    return value;
  }
  if (schema?.type === 'array') return [];
  if (schema?.type === 'boolean') return false;
  if (schema?.type === 'number') return schema.minimum ?? 0;
  if (schema?.type === 'integer') return Math.ceil(schema.minimum ?? 0);
  if (schema?.type === 'null') return null;
  return '';
}

function createItem(node: CompiledNode): JsonValue {
  const item = defaultValue(node.schema?.items);
  if (
    node.itemKey &&
    item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    typeof item[node.itemKey] !== 'string'
  ) {
    item[node.itemKey] = generatedItemKey();
  }
  return item;
}

function RowActions({
  index,
  count,
  minimum,
  label,
  messages,
  onMove,
  onRemove,
  removeLabel,
}: {
  index: number;
  count: number;
  minimum: number;
  label: string;
  messages: Readonly<FormLocaleMessages>;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  removeLabel?: string;
}) {
  const itemNumber = index + 1;
  return (
    <span className="a3s-form-repeater-row-actions">
      <button
        type="button"
        className="btn"
        data-size="sm"
        data-variant="ghost"
        disabled={index === 0}
        aria-label={formatFormMessage(messages, 'repeaterMoveUpLabel', {
          index: itemNumber,
          label,
        })}
        onClick={() => onMove(-1)}
      >
        <RepeaterIcon name="up" />
      </button>
      <button
        type="button"
        className="btn"
        data-size="sm"
        data-variant="ghost"
        disabled={index === count - 1}
        aria-label={formatFormMessage(messages, 'repeaterMoveDownLabel', {
          index: itemNumber,
          label,
        })}
        onClick={() => onMove(1)}
      >
        <RepeaterIcon name="down" />
      </button>
      <button
        type="button"
        className="btn"
        data-size="sm"
        data-variant="ghost"
        disabled={count <= minimum}
        title={count <= minimum ? messages.repeaterMinimumReached : undefined}
        aria-label={
          removeLabel ??
          formatFormMessage(messages, 'repeaterRemoveLabel', { index: itemNumber, label })
        }
        onClick={onRemove}
      >
        <RepeaterIcon name="remove" />
      </button>
    </span>
  );
}

export function RepeaterField(props: RepeaterFieldProps) {
  const rows = useStableRepeaterRows(props.items, (item, index) => {
    try {
      const hostIdentity = props.identifyItem?.(item, index);
      if (hostIdentity) return hostIdentity;
    } catch {
      // The identity hook is advisory; runtime-owned keys remain available.
    }
    if (!props.node.itemKey || !item || typeof item !== 'object' || Array.isArray(item)) {
      return undefined;
    }
    const identity = item[props.node.itemKey];
    return typeof identity === 'string' ? identity : undefined;
  });
  const minimum = props.node.schema?.minItems ?? 0;
  const maximum = props.node.schema?.maxItems;
  const objectRows = props.node.schema?.items?.type === 'object';
  const atMaximum = maximum !== undefined && props.items.length >= maximum;
  const label = props.node.label ?? props.node.id;

  return (
    <fieldset
      className={`a3s-form-field a3s-form-repeater fieldset${objectRows ? ' is-object' : ''}${props.errors.length ? ' is-invalid' : ''}`}
      style={props.style}
      disabled={props.disabled}
      aria-describedby={props.describedBy}
      aria-busy={props.validating || undefined}
      data-validating={props.validating || undefined}
      data-a3s-form-path={props.valuePath}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) props.onBlur();
      }}
    >
      <legend className={props.required ? 'is-required' : undefined}>{label}</legend>
      {props.node.description && (
        <div className="a3s-form-help" id={`${props.id}-help`}>
          {props.node.description}
        </div>
      )}
      {props.items.length === 0 && (
        <p className="a3s-form-repeater-empty" role="status">
          {props.messages.repeaterEmpty}
        </p>
      )}
      {objectRows ? (
        <div className="a3s-form-repeater-rows">
          {rows.rows.map((row) => (
            <fieldset className="a3s-form-repeater-row" data-row-key={row.key} key={row.key}>
              <legend>
                <span>
                  {formatFormMessage(props.messages, 'repeaterItemLabel', {
                    index: row.index + 1,
                    label,
                  })}
                </span>
                <RowActions
                  index={row.index}
                  count={props.items.length}
                  minimum={minimum}
                  label={label}
                  messages={props.messages}
                  onMove={(offset) => props.onChange(rows.move(row.index, offset))}
                  onRemove={() => props.onChange(rows.remove(row.index))}
                />
              </legend>
              <div className="a3s-form-repeater-row-grid">
                {(props.node.children?.length ?? 0) > 0
                  ? props.renderRow(row.index, row.key)
                  : props.messages.repeaterTemplateEmpty}
              </div>
            </fieldset>
          ))}
        </div>
      ) : (
        <div className="a3s-form-repeat-list">
          {rows.rows.map((row) => (
            <div className="a3s-form-repeat-row" key={row.key}>
              <input
                className="input"
                aria-label={`${props.node.label ?? props.node.id} ${row.index + 1}`}
                value={String(row.value ?? '')}
                onChange={(event) => props.onChange(rows.update(row.index, event.target.value))}
              />
              <RowActions
                index={row.index}
                count={props.items.length}
                minimum={minimum}
                label={label}
                messages={props.messages}
                removeLabel={props.messages.repeaterRemove}
                onMove={(offset) => props.onChange(rows.move(row.index, offset))}
                onRemove={() => props.onChange(rows.remove(row.index))}
              />
            </div>
          ))}
        </div>
      )}
      <div className="a3s-form-repeater-footer">
        <button
          type="button"
          className="a3s-form-secondary btn"
          data-size="sm"
          data-variant="secondary"
          disabled={atMaximum}
          title={atMaximum ? props.messages.repeaterMaximumReached : undefined}
          onClick={() => props.onChange(rows.insert(createItem(props.node)))}
        >
          <RepeaterIcon name="add" />
          <span>{props.messages.repeaterAdd}</span>
        </button>
        {atMaximum && (
          <span className="a3s-form-repeater-limit" role="status">
            {props.messages.repeaterMaximumReached}
          </span>
        )}
      </div>
      {props.errors.map((error, index) => (
        <div
          className="a3s-form-error"
          id={`${props.id}-error-${index + 1}`}
          role="alert"
          key={`${error.code}-${error.message}`}
        >
          {error.message}
        </div>
      ))}
      {props.validationStatus}
    </fieldset>
  );
}
