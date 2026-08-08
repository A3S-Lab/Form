import { useMemo, useState } from 'react';
import type {
  CompileOptions,
  FieldError,
  FormDocument,
  FormHostAdapter,
  FormRef,
  JsonObject,
} from '../src/core';
import { type FormNodeRegistry, FormRenderer, type FormWidgetRegistry } from '../src/react';
import {
  createWorkflowNodeConfiguration,
  validateWorkflowNodeConfiguration,
  verifyPinnedForm,
  type WorkflowNodeConfiguration,
} from '../src/workflow';

export interface DifyLikeWorkflowNodeProps {
  document: FormDocument;
  form: FormRef;
  nodeType: string;
  nodeId: string;
  value: JsonObject;
  onChange: (value: JsonObject) => void;
  onCommit: (configuration: WorkflowNodeConfiguration) => void | Promise<void>;
  compileOptions?: CompileOptions;
  hostAdapter?: FormHostAdapter;
  locale?: string;
  nodeRegistry?: FormNodeRegistry;
  readOnly?: boolean;
  widgetRegistry?: FormWidgetRegistry;
}

/**
 * A reference host component for a Dify-like workflow node settings panel.
 * The workflow host owns the controlled value, persistence, policy, and side effects.
 */
export function DifyLikeWorkflowNode(props: DifyLikeWorkflowNodeProps) {
  const [hostErrors, setHostErrors] = useState<FieldError[]>([]);
  const pinned = useMemo(
    () => verifyPinnedForm(props.document, props.form, props.compileOptions),
    [props.compileOptions, props.document, props.form],
  );
  if (!pinned.ok)
    return <div role="alert">The node form no longer matches its pinned release.</div>;

  const commit = async (_actionId: string, validatedValue: JsonObject) => {
    const configuration = createWorkflowNodeConfiguration({
      nodeType: props.nodeType,
      nodeId: props.nodeId,
      form: props.form,
      value: validatedValue,
      locale: props.locale,
      readOnly: props.readOnly,
    });
    const validation = validateWorkflowNodeConfiguration(
      pinned.document,
      configuration,
      props.compileOptions,
    );
    if (!validation.ok) {
      setHostErrors(validation.errors);
      return;
    }
    setHostErrors([]);
    await props.onCommit({ ...configuration, value: validation.value });
  };

  return (
    <FormRenderer
      plan={pinned.plan}
      value={props.value}
      errors={hostErrors.length > 0 ? hostErrors : undefined}
      hostAdapter={props.hostAdapter}
      locale={props.locale}
      nodeRegistry={props.nodeRegistry}
      readOnly={props.readOnly}
      widgetRegistry={props.widgetRegistry}
      onChange={(value) => {
        setHostErrors([]);
        props.onChange(value);
      }}
      onAction={commit}
    />
  );
}
