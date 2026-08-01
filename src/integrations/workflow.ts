import { compileForm } from '../core/compiler';
import { validateFormValue } from '../core/state';
import type { FieldError, FormDocument, FormRef, JsonObject, JsonValue } from '../core/types';

export interface WorkflowFormBinding {
  form: FormRef;
  configuration: JsonObject;
}

export interface WorkflowInteractionRequest {
  apiVersion: 'a3s.dev/form-interaction/v1alpha1';
  runId: string;
  nodeId: string;
  form: FormRef;
  initialValue?: JsonObject;
  expiresAt?: string;
}

export interface WorkflowInteractionSubmission {
  apiVersion: 'a3s.dev/form-submission/v1alpha1';
  runId: string;
  nodeId: string;
  form: FormRef;
  value: JsonObject;
  submittedAt: string;
  actorRef?: string;
}

export type PinnedFormVerification =
  | { ok: true; document: FormDocument; digest: string }
  | {
      ok: false;
      code: 'invalid_document' | 'revision_mismatch' | 'digest_mismatch';
      message: string;
    };

export function verifyPinnedForm(
  document: FormDocument,
  reference: FormRef,
): PinnedFormVerification {
  const result = compileForm(document, { requireDigest: true });
  if (!result.ok || !result.document) {
    return { ok: false, code: 'invalid_document', message: '表单文档未通过发布态编译校验。' };
  }
  if (result.document.revision !== reference.revision) {
    return { ok: false, code: 'revision_mismatch', message: 'FormRef revision 与表单文档不一致。' };
  }
  if (result.document.digest !== reference.digest) {
    return { ok: false, code: 'digest_mismatch', message: 'FormRef digest 与表单文档不一致。' };
  }
  return { ok: true, document: result.document, digest: result.document.digest };
}

export function createWorkflowFormBinding(
  form: FormRef,
  configuration: JsonObject,
): WorkflowFormBinding {
  if (form.mode !== 'configuration')
    throw new Error('Workflow node configuration requires a configuration FormRef.');
  return { form: structuredClone(form), configuration: structuredClone(configuration) };
}

export function createInteractionRequest(
  runId: string,
  nodeId: string,
  form: FormRef,
  options: { initialValue?: JsonObject; expiresAt?: string } = {},
): WorkflowInteractionRequest {
  if (form.mode !== 'interaction')
    throw new Error('Durable interaction requires an interaction FormRef.');
  return {
    apiVersion: 'a3s.dev/form-interaction/v1alpha1',
    runId,
    nodeId,
    form: structuredClone(form),
    initialValue: options.initialValue ? structuredClone(options.initialValue) : undefined,
    expiresAt: options.expiresAt,
  };
}

export function validateInteractionSubmission(
  document: FormDocument,
  submission: WorkflowInteractionSubmission,
): { ok: boolean; errors: FieldError[]; digest?: string; value?: JsonObject } {
  const verification = verifyPinnedForm(document, submission.form);
  if (!verification.ok) {
    return {
      ok: false,
      errors: [{ path: '', code: verification.code, message: verification.message }],
    };
  }
  const compiled = compileForm(verification.document);
  const errors = validateFormValue(
    compiled.plan as NonNullable<typeof compiled.plan>,
    submission.value,
  );
  return errors.length > 0
    ? { ok: false, errors, digest: verification.digest }
    : {
        ok: true,
        errors: [],
        digest: verification.digest,
        value: structuredClone(submission.value),
      };
}

export function interactionResultPayload(submission: WorkflowInteractionSubmission): JsonValue {
  return {
    runId: submission.runId,
    nodeId: submission.nodeId,
    formDigest: submission.form.digest,
    submittedAt: submission.submittedAt,
    actorRef: submission.actorRef ?? null,
    value: submission.value,
  };
}
