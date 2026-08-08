import type { ComponentType, InputHTMLAttributes } from 'react';
import type { FormLocaleMessages, JsonValue, UiNode, UiOption } from '../core';
import type { FormDataSourceState } from './data-source';
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
  dataSource: FormDataSourceState;
  messages: Readonly<FormLocaleMessages>;
  onChange: (value: JsonValue) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}

export type FormWidget = ComponentType<FormWidgetProps>;
export type FormWidgetRegistry = Record<string, FormWidget>;

export function NativeWidget({
  id,
  node,
  value,
  disabled,
  invalid,
  required,
  describedBy,
  options,
  messages,
  onChange,
  onBlur,
  onFocus,
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
    onBlur,
    onFocus,
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
          onBlur={onBlur}
          onFocus={onFocus}
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
          <span>{node.label ?? messages.checkboxEnabled}</span>
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
          onBlur={onBlur}
          onFocus={onFocus}
        >
          <option value="">{node.placeholder ?? messages.selectPlaceholder}</option>
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
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.();
          }}
          onFocus={onFocus}
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
