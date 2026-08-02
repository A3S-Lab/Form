import { useEffect, useState } from 'react';
import type { JsonValue } from '../../../src/core';
import {
  defineFormNodeRegistry,
  type FormNodeDesignProps,
  type FormNodeInspectorProps,
  type FormNodeRenderProps,
} from '../../../src/react';

function JsonDesign({ node, schema, required }: FormNodeDesignProps) {
  return (
    <div className="playground-json-design">
      <div>
        <strong>
          {node.label}
          {required && <em>*</em>}
        </strong>
        <span>{node.description ?? '编辑结构化 JSON 配置'}</span>
      </div>
      <code>{schema?.type === 'array' ? '[ … ]' : '{ … }'}</code>
    </div>
  );
}

function JsonNode({ id, node, value, disabled, invalid, onChange }: FormNodeRenderProps) {
  const fallback = node.schema?.default ?? (node.schema?.type === 'array' ? [] : {});
  const serialized = JSON.stringify(value ?? fallback, null, 2);
  const [source, setSource] = useState(serialized);
  const [parseError, setParseError] = useState('');

  useEffect(() => {
    setSource(serialized);
    setParseError('');
  }, [serialized]);

  return (
    <div className={`playground-json-node${parseError ? ' is-invalid' : ''}`}>
      <label className="playground-json-label" htmlFor={id}>
        {node.label}
      </label>
      {node.description && <span className="playground-json-help">{node.description}</span>}
      <textarea
        id={id}
        aria-invalid={invalid || Boolean(parseError) || undefined}
        aria-describedby={parseError ? `${id}-json-error` : undefined}
        disabled={disabled}
        spellCheck={false}
        value={source}
        onChange={(event) => {
          const nextSource = event.target.value;
          setSource(nextSource);
          try {
            const nextValue: unknown = JSON.parse(nextSource);
            if (
              nextValue === null ||
              typeof nextValue === 'string' ||
              typeof nextValue === 'number' ||
              typeof nextValue === 'boolean' ||
              Array.isArray(nextValue) ||
              typeof nextValue === 'object'
            ) {
              onChange(nextValue as JsonValue);
              setParseError('');
            }
          } catch {
            setParseError('JSON 格式无效，请检查括号、引号和逗号。');
          }
        }}
      />
      {parseError && (
        <span className="playground-json-error" id={`${id}-json-error`} role="alert">
          {parseError}
        </span>
      )}
    </div>
  );
}

function RatingDesign({ node, required }: FormNodeDesignProps) {
  const maximum = Number(node.customProps?.maximum ?? 5);
  return (
    <div className="playground-rating-design">
      <div>
        <strong>
          {node.label}
          {required && <em>*</em>}
        </strong>
        <span>{node.description ?? '请选择满意度评分'}</span>
      </div>
      <div aria-hidden="true">{'★'.repeat(Math.min(maximum, 5))}</div>
    </div>
  );
}

function RatingNode({ id, node, value, disabled, invalid, onChange }: FormNodeRenderProps) {
  const maximum = Math.max(3, Math.min(10, Number(node.customProps?.maximum ?? 5)));
  const current = typeof value === 'number' ? value : 0;
  return (
    <fieldset
      className={`playground-rating-node${invalid ? ' is-invalid' : ''}`}
      disabled={disabled}
    >
      <legend id={`${id}-label`}>{node.label}</legend>
      {node.description && <p>{node.description}</p>}
      <div role="radiogroup" aria-labelledby={`${id}-label`}>
        {Array.from({ length: maximum }, (_, index) => index + 1).map((rating) => (
          <label className={rating <= current ? 'is-active' : ''} key={rating}>
            <input
              type="radio"
              name={id}
              value={rating}
              checked={rating === current}
              aria-label={`${rating} 星`}
              onChange={() => onChange(rating)}
            />
            <span aria-hidden="true">★</span>
          </label>
        ))}
      </div>
      <output>{current > 0 ? `${current} / ${maximum}` : '尚未评分'}</output>
    </fieldset>
  );
}

function RatingInspector({ node, onUpdate }: FormNodeInspectorProps) {
  const maximum = Number(node.customProps?.maximum ?? 5);
  return (
    <div className="playground-rating-inspector">
      <div className="a3s-form-control">
        <span>
          最大星数
          <small>3 至 10</small>
        </span>
        <input
          aria-label="评分最大星数"
          type="number"
          min="3"
          max="10"
          value={maximum}
          onChange={(event) => {
            const next = Math.max(3, Math.min(10, Number(event.target.value)));
            onUpdate({
              node: { customProps: { ...node.customProps, maximum: next } },
              schema: { maximum: next },
            });
          }}
        />
      </div>
    </div>
  );
}

export const playgroundNodeRegistry = defineFormNodeRegistry({
  'a3s.json': {
    kind: 'field',
    catalog: {
      section: 'business',
      sectionLabel: '业务组件',
      label: 'JSON 配置',
      description: '可校验的结构化 JSON 编辑器',
      glyph: '{ }',
    },
    schema: {},
    defaults: {
      width: 12,
      description: '请输入合法 JSON',
    },
    design: JsonDesign,
    render: JsonNode,
  },
  'a3s.rating': {
    kind: 'field',
    catalog: {
      section: 'business',
      sectionLabel: '业务组件',
      label: '评分',
      description: '可配置星级的满意度评分',
      glyph: '★',
    },
    schema: { type: 'number', minimum: 1, maximum: 5 },
    defaults: {
      width: 6,
      description: '请为本次体验评分',
      customProps: { maximum: 5 },
    },
    design: RatingDesign,
    render: RatingNode,
    inspector: RatingInspector,
  },
});
