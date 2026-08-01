import { createA3SCloudFormAdapter } from '../src/cloud';
import { compileForm, createFormRef, type FormDocument, type JsonObject } from '../src/core';
import {
  createInteractionRequest,
  createWorkflowFormBinding,
  interactionResultPayload,
  validateInteractionSubmission,
  verifyPinnedForm,
  type WorkflowInteractionSubmission,
} from '../src/workflow';
import { createDocument } from './fixtures';

describe('Workflow and Cloud seams', () => {
  const published = () => compileForm(createDocument()).document as FormDocument;

  it('verifies revision and digest pins before accepting interaction values', () => {
    const document = published();
    const form = createFormRef(document, 'a3s://forms/test', 'interaction');
    expect(verifyPinnedForm(document, form).ok).toBe(true);
    expect(verifyPinnedForm(document, { ...form, revision: 99 })).toEqual(
      expect.objectContaining({ ok: false, code: 'revision_mismatch' }),
    );
    expect(verifyPinnedForm(document, { ...form, digest: 'sha256:bad' })).toEqual(
      expect.objectContaining({ ok: false, code: 'digest_mismatch' }),
    );
    expect(verifyPinnedForm({ ...document, digest: 'sha256:bad' }, form)).toEqual(
      expect.objectContaining({ ok: false, code: 'invalid_document' }),
    );

    const submission: WorkflowInteractionSubmission = {
      apiVersion: 'a3s.dev/form-submission/v1alpha1',
      runId: 'run-1',
      nodeId: 'approve',
      form,
      value: { name: '张三', age: 20 },
      submittedAt: '2026-08-02T00:00:00Z',
    };
    expect(validateInteractionSubmission(document, submission)).toEqual(
      expect.objectContaining({ ok: true, digest: form.digest }),
    );
    expect(validateInteractionSubmission(document, { ...submission, value: {} })).toEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(
      validateInteractionSubmission(document, { ...submission, form: { ...form, digest: 'bad' } }),
    ).toEqual(expect.objectContaining({ ok: false }));
    expect(interactionResultPayload(submission)).toEqual(
      expect.objectContaining({ runId: 'run-1', formDigest: form.digest, actorRef: null }),
    );
    expect(interactionResultPayload({ ...submission, actorRef: 'user:reviewer' })).toEqual(
      expect.objectContaining({ actorRef: 'user:reviewer' }),
    );
  });

  it('creates mode-safe configuration and interaction envelopes', () => {
    const document = published();
    const configuration = createFormRef(document, 'a3s://forms/config', 'configuration');
    const interaction = createFormRef(document, 'a3s://forms/interaction', 'interaction');
    expect(createWorkflowFormBinding(configuration, { model: 'a3s-code' })).toEqual(
      expect.objectContaining({ configuration: { model: 'a3s-code' } }),
    );
    expect(() => createWorkflowFormBinding(interaction, {})).toThrow('configuration FormRef');
    expect(
      createInteractionRequest('run-1', 'human-review', interaction, {
        initialValue: { approved: false },
        expiresAt: '2026-08-03T00:00:00Z',
      }),
    ).toEqual(expect.objectContaining({ runId: 'run-1', nodeId: 'human-review' }));
    expect(createInteractionRequest('run-2', 'review', interaction)).toEqual(
      expect.objectContaining({ initialValue: undefined, expiresAt: undefined }),
    );
    expect(() => createInteractionRequest('run-1', 'node', configuration)).toThrow(
      'interaction FormRef',
    );
  });

  it('binds Cloud context to host-owned registries without serializing it', async () => {
    const context = {
      organizationId: 'org-1',
      projectId: 'project-1',
      environmentId: 'prod',
      locale: 'zh-CN',
    };
    let received: JsonObject | undefined;
    const adapter = createA3SCloudFormAdapter({
      context,
      resolveDataSource: async (cloud, request) => {
        received = { organizationId: cloud.organizationId, source: request.definition.id };
        return [{ label: '研发', value: 'engineering' }];
      },
      invokeAction: async (cloud, request) => ({
        organizationId: cloud.organizationId,
        action: request.definition.id,
      }),
    });
    const plan = compileForm(createDocument()).plan as NonNullable<
      ReturnType<typeof compileForm>['plan']
    >;
    const signal = new AbortController().signal;
    const options = await adapter.resolveDataSource?.(
      { definition: plan.dataSources[0], value: {}, locale: 'zh-CN' },
      signal,
    );
    expect(options?.[0].value).toBe('engineering');
    expect(received).toEqual({ organizationId: 'org-1', source: 'roles' });
    const action = await adapter.invokeAction?.(
      { definition: plan.actions[0], value: {}, plan },
      signal,
    );
    expect(action).toEqual({ organizationId: 'org-1', action: 'submit' });
    expect(JSON.stringify(plan)).not.toContain('org-1');
    expect(createA3SCloudFormAdapter({ context })).toEqual({
      resolveDataSource: undefined,
      invokeAction: undefined,
    });
    const emptyAdapter = createA3SCloudFormAdapter({
      context,
      resolveDataSource: (() => undefined) as never,
      invokeAction: (() => undefined) as never,
    });
    await expect(
      emptyAdapter.resolveDataSource?.(
        { definition: plan.dataSources[0], value: {}, locale: 'zh-CN' },
        signal,
      ),
    ).resolves.toEqual([]);
    await expect(
      emptyAdapter.invokeAction?.({ definition: plan.actions[0], value: {}, plan }, signal),
    ).resolves.toBeUndefined();
  });
});
