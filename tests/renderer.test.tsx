import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import {
  type AsyncValidationRequest,
  type AsyncValidationResponse,
  assertCompiled,
  type FormDocument,
  type FormHostAdapter,
  type JsonObject,
} from '../src/core';
import {
  defineFormNodeRegistry,
  type FormNodeRenderProps,
  FormRenderer,
  type FormWidgetProps,
} from '../src/react';
import { createDocument } from './fixtures';

function RendererHarness({
  document = createDocument(),
  onAction,
}: {
  document?: FormDocument;
  onAction?: (id: string) => void;
}) {
  const [value, setValue] = useState<JsonObject>({});
  return (
    <>
      <FormRenderer
        plan={assertCompiled(document)}
        value={value}
        onChange={setValue}
        onAction={(id) => onAction?.(id)}
      />
      <output data-testid="renderer-value">{JSON.stringify(value)}</output>
    </>
  );
}

describe('React FormRenderer', () => {
  it('keeps values controlled, evaluates rules and validates before actions', async () => {
    let action = '';
    render(
      <RendererHarness
        onAction={(id) => {
          action = id;
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: '基础信息' })).toBeTruthy();
    expect(screen.queryByLabelText('年龄')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('此项为必填项。')).toBeTruthy();
    expect(action).toBe('');

    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '张三' } });
    expect(screen.getByTestId('renderer-value').textContent).toContain('"name":"张三"');
    fireEvent.click(screen.getByRole('switch', { name: /启用/ }));
    expect(await screen.findByLabelText('年龄')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('年龄'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(action).toBe('submit'));
  });

  it('uses locale catalogs for runtime copy and host overrides', async () => {
    const document = createDocument();
    document.metadata.locale = 'en-US';
    const plan = assertCompiled(document);
    const localeCatalog = {
      apiVersion: 'a3s.dev/form-locale-catalog/v1' as const,
      messages: { selectPlaceholder: 'Choose a workflow role' },
    };
    const view = render(
      <FormRenderer
        plan={plan}
        value={{}}
        onChange={() => undefined}
        localeCatalog={localeCatalog}
      />,
    );

    expect(screen.getByRole('option', { name: 'Choose a workflow role' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('This field is required.')).toBeTruthy();
    expect(screen.getByRole('alert', { name: 'Form validation results' })).toBeTruthy();
    expect(screen.getByText('Review 1 field')).toBeTruthy();
    view.rerender(
      <FormRenderer
        plan={plan}
        value={{}}
        errors={[
          { path: 'name', code: 'host.name', message: 'Check the node name.' },
          { path: 'host', code: 'host.connection', message: 'Reconnect the workflow host.' },
        ]}
        localeCatalog={localeCatalog}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText('Review 2 fields')).toBeTruthy();
    expect(screen.getByText('Reconnect the workflow host.')).toBeTruthy();
    view.unmount();
  });

  it('renders computed fields as read-only and submits the derived controlled value', async () => {
    const document = createDocument();
    document.schema = {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        displayName: { type: 'string' },
      },
      required: ['firstName', 'displayName'],
      additionalProperties: false,
    };
    document.ui.nodes = [
      { id: 'root', kind: 'root', children: ['first-name', 'last-name', 'display-name'] },
      {
        id: 'first-name',
        kind: 'field',
        label: 'First name',
        schemaPath: '/properties/firstName',
      },
      {
        id: 'last-name',
        kind: 'field',
        label: 'Last name',
        schemaPath: '/properties/lastName',
      },
      {
        id: 'display-name',
        kind: 'field',
        label: 'Display name',
        schemaPath: '/properties/displayName',
      },
    ];
    document.dataSources = [];
    document.rules = [
      {
        id: 'derive-display-name',
        target: 'display-name',
        kind: 'computed',
        expression: {
          op: 'concat',
          values: [
            { op: 'field', path: 'firstName' },
            { op: 'literal', value: ' ' },
            { op: 'field', path: 'lastName' },
          ],
        },
      },
    ];
    const plan = assertCompiled(document);
    let submitted: JsonObject | undefined;
    function ComputedHarness() {
      const [value, setValue] = useState<JsonObject>({ firstName: 'Ada', lastName: 'Lovelace' });
      return (
        <>
          <FormRenderer
            plan={plan}
            value={value}
            onChange={setValue}
            onAction={(_actionId, next) => {
              submitted = next;
            }}
          />
          <output data-testid="computed-value">{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<ComputedHarness />);
    const displayName = screen.getByLabelText('Display name') as HTMLInputElement;
    expect(displayName.value).toBe('Ada Lovelace');
    expect(displayName.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Grace' } });
    expect(screen.getByTestId('computed-value').textContent).toContain(
      '"displayName":"Grace Lovelace"',
    );
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(submitted?.displayName).toBe('Grace Lovelace'));
  });

  it('runs field validation on blur and maps missing issue paths to the field', async () => {
    const plan = assertCompiled(createDocument());
    let received: AsyncValidationRequest | undefined;
    let resolve: ((response: AsyncValidationResponse) => void) | undefined;
    const hostAdapter: FormHostAdapter = {
      validateValue: (request) => {
        received = request;
        return new Promise((next) => {
          resolve = next;
        });
      },
    };

    function AsyncFieldHarness() {
      const [value, setValue] = useState<JsonObject>({ name: 'Taken' });
      return (
        <FormRenderer
          plan={plan}
          value={value}
          onChange={setValue}
          hostAdapter={hostAdapter}
          locale="en-US"
        />
      );
    }

    render(<AsyncFieldHarness />);
    fireEvent.blur(screen.getByLabelText('姓名'));
    expect(await screen.findByRole('status', { name: 'Validating 姓名' })).toBeTruthy();
    expect(received).toEqual(
      expect.objectContaining({
        scope: { kind: 'field', nodeId: 'name', path: 'name' },
        trigger: 'blur',
        locale: 'en-US',
      }),
    );

    resolve?.({ issues: [{ code: 'name_taken', message: 'This name is already in use.' }] });
    expect(await screen.findByText('This name is already in use.')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Validating 姓名' })).toBeNull();
    expect(screen.getByLabelText('姓名').getAttribute('aria-invalid')).toBe('true');
  });

  it('aborts stale field validation when the controlled value changes', async () => {
    const plan = assertCompiled(createDocument());
    const requests: Array<{
      request: AsyncValidationRequest;
      signal: AbortSignal;
      resolve: (response: AsyncValidationResponse) => void;
    }> = [];
    const hostAdapter: FormHostAdapter = {
      validateValue: (request, signal) =>
        new Promise((resolve) => {
          requests.push({ request, signal, resolve });
        }),
    };

    function RaceHarness() {
      const [value, setValue] = useState<JsonObject>({ name: 'First' });
      return (
        <FormRenderer plan={plan} value={value} onChange={setValue} hostAdapter={hostAdapter} />
      );
    }

    render(<RaceHarness />);
    const name = screen.getByLabelText('姓名');
    fireEvent.blur(name);
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.change(name, { target: { value: 'Second' } });
    expect(requests[0].signal.aborted).toBe(true);
    fireEvent.blur(screen.getByLabelText('姓名'));
    await waitFor(() => expect(requests).toHaveLength(2));

    requests[0].resolve({ issues: [{ code: 'stale', message: 'Stale response.' }] });
    requests[1].resolve({ issues: [] });
    await waitFor(() => expect(screen.queryByRole('status', { name: '正在校验姓名' })).toBeNull());
    expect(screen.queryByText('Stale response.')).toBeNull();
    expect(requests[1].request.value).toEqual(expect.objectContaining({ name: 'Second' }));
  });

  it('blocks submit until host form validation succeeds', async () => {
    const plan = assertCompiled(createDocument());
    let calls = 0;
    let actionValue: JsonObject | undefined;
    const hostAdapter: FormHostAdapter = {
      validateValue: async (request) => {
        calls += 1;
        return {
          issues:
            request.value.name === 'Blocked'
              ? [{ path: 'name', code: 'blocked', message: 'This node name is blocked.' }]
              : [],
        };
      },
    };

    function AsyncSubmitHarness() {
      const [value, setValue] = useState<JsonObject>({ name: 'Blocked' });
      return (
        <FormRenderer
          plan={plan}
          value={value}
          onChange={setValue}
          hostAdapter={hostAdapter}
          onAction={(_actionId, next) => {
            actionValue = next;
          }}
        />
      );
    }

    render(<AsyncSubmitHarness />);
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('This node name is blocked.')).toBeTruthy();
    expect(actionValue).toBeUndefined();

    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: 'Allowed' } });
    expect(screen.queryByText('This node name is blocked.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(actionValue).toEqual(expect.objectContaining({ name: 'Allowed' })));
    expect(calls).toBe(2);
  });

  it('cancels a pending submit validation when the host changes the controlled value', async () => {
    const plan = assertCompiled(createDocument());
    const requests: Array<{
      signal: AbortSignal;
      resolve: (response: AsyncValidationResponse) => void;
    }> = [];
    const hostAdapter: FormHostAdapter = {
      validateValue: (_request, signal) =>
        new Promise((resolve) => {
          requests.push({ signal, resolve });
        }),
    };
    let submitted: JsonObject | undefined;

    function SubmitRaceHarness() {
      const [value, setValue] = useState<JsonObject>({ name: 'Before' });
      return (
        <FormRenderer
          plan={plan}
          value={value}
          onChange={setValue}
          hostAdapter={hostAdapter}
          onAction={(_actionId, next) => {
            submitted = next;
          }}
        />
      );
    }

    render(<SubmitRaceHarness />);
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    const validating = await screen.findByRole('button', { name: '校验中…' });
    expect((validating as HTMLButtonElement).disabled).toBe(true);
    expect(validating.closest('form')?.getAttribute('aria-busy')).toBe('true');
    await waitFor(() => expect(requests).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: 'After' } });
    expect(requests[0].signal.aborted).toBe(true);
    requests[0].resolve({ issues: [{ code: 'stale', message: 'Stale submit response.' }] });
    await waitFor(() => expect(screen.getByRole('button', { name: '提交' })).toBeTruthy());
    expect(screen.queryByText('Stale submit response.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    requests[1].resolve({ issues: [] });
    await waitFor(() => expect(submitted).toEqual(expect.objectContaining({ name: 'After' })));
  });

  it('gives native controls consistent labels, required semantics and select framing', async () => {
    const document = createDocument();
    const name = document.ui.nodes.find((node) => node.id === 'name');
    const active = document.ui.nodes.find((node) => node.id === 'active');
    const role = document.ui.nodes.find((node) => node.id === 'role');
    if (name) name.description = '请填写证件上的姓名。';
    if (active) active.label = '显示年龄字段';
    if (role) role.placeholder = '请选择成员角色';

    render(<RendererHarness document={document} />);

    const nameInput = screen.getByLabelText('姓名') as HTMLInputElement;
    const roleSelect = screen.getByLabelText('角色') as HTMLSelectElement;
    const activeSwitch = screen.getByRole('switch', {
      name: '显示年龄字段',
    }) as HTMLInputElement;
    expect(nameInput.required).toBe(true);
    expect(nameInput.getAttribute('aria-describedby')).toContain('-name-help');
    expect(nameInput.labels?.[0]?.classList.contains('is-required')).toBe(true);
    expect(nameInput.classList.contains('input')).toBe(true);
    expect(nameInput.closest('.field')).toBeTruthy();
    expect(activeSwitch.classList.contains('input')).toBe(true);
    expect(roleSelect.classList.contains('select')).toBe(true);
    expect(roleSelect.closest('.a3s-form-select-control')).toBeTruthy();
    expect(screen.getByRole('option', { name: '请选择成员角色' })).toBeTruthy();

    const submit = screen.getByRole('button', { name: '提交' });
    expect(submit.classList.contains('btn')).toBe(true);
    expect(submit.getAttribute('data-variant')).toBe('primary');

    fireEvent.click(submit);
    await waitFor(() =>
      expect(nameInput.getAttribute('aria-describedby')).toContain('-name-error-1'),
    );
  });

  it('submits once through click and keyboard form submission paths', async () => {
    let actions = 0;
    render(
      <RendererHarness
        onAction={() => {
          actions += 1;
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: '张三' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(actions).toBe(1));
    fireEvent.submit(
      screen.getByRole('button', { name: '提交' }).closest('form') as HTMLFormElement,
    );
    await waitFor(() => expect(actions).toBe(2));
  });

  it('resolves host-owned options without persisting or submitting implicitly', async () => {
    const plan = assertCompiled(createDocument());
    const controller: { value: JsonObject } = { value: { name: '张三' } };
    render(
      <FormRenderer
        plan={plan}
        value={controller.value}
        onChange={(value) => {
          controller.value = value;
        }}
        hostAdapter={{
          resolveDataSource: async () => [{ label: '管理员', value: 'admin' }],
        }}
      />,
    );
    expect(await screen.findByRole('option', { name: '管理员' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('角色'), { target: { value: 'admin' } });
    expect(controller.value.role).toBe('admin');
  });

  it('renders trusted custom widgets and repeaters', () => {
    const document = createDocument();
    document.schema.properties = {
      ...document.schema.properties,
      tags: { type: 'array', items: { type: 'string' } },
      custom: { type: 'string' },
    };
    document.ui.nodes.push(
      { id: 'tags', kind: 'repeater', label: '标签', schemaPath: '/properties/tags', width: 12 },
      {
        id: 'custom',
        kind: 'field',
        label: '自定义字段',
        schemaPath: '/properties/custom',
        widget: 'company.custom',
        width: 12,
      },
      { id: 'content', kind: 'content', content: '静态说明' },
    );
    document.ui.nodes[0].children?.push('tags', 'custom', 'content');
    const plan = assertCompiled(document, { capabilities: { widgets: ['company.custom'] } });
    function CustomWidget({ id, value, onChange }: FormWidgetProps) {
      return (
        <button id={id} type="button" onClick={() => onChange('custom-value')}>
          {String(value ?? '设置自定义值')}
        </button>
      );
    }
    function Harness() {
      const [value, setValue] = useState<JsonObject>({});
      return (
        <FormRenderer
          plan={plan}
          value={value}
          onChange={setValue}
          widgetRegistry={{ 'company.custom': CustomWidget }}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByText('静态说明')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '添加一项' }));
    expect(screen.getByLabelText('标签 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '移除' }));
    expect(screen.queryByLabelText('标签 1')).toBeNull();
    const customButton = screen.getByRole('button', { name: '自定义字段' });
    fireEvent.click(customButton);
    expect(customButton.textContent).toBe('custom-value');
  });

  it('rerenders only fields subscribed to the changed value path', async () => {
    const document = createDocument();
    document.schema = {
      type: 'object',
      properties: {
        first: { type: 'string' },
        second: { type: 'string' },
        note: { type: 'string' },
      },
      additionalProperties: false,
    };
    document.ui.nodes = [
      { id: 'root', kind: 'root', children: ['first', 'second', 'note'] },
      {
        id: 'first',
        kind: 'field',
        label: 'First',
        schemaPath: '/properties/first',
        widget: 'test.counting',
      },
      {
        id: 'second',
        kind: 'field',
        label: 'Second',
        schemaPath: '/properties/second',
        widget: 'test.counting',
      },
      {
        id: 'note',
        kind: 'field',
        label: 'Note',
        schemaPath: '/properties/note',
        widget: 'test.counting',
      },
    ];
    document.dataSources = [];
    document.actions = [];
    document.rules = [
      {
        id: 'second-enabled-by-first',
        target: 'second',
        kind: 'enabled',
        expression: { op: 'exists', value: { op: 'field', path: 'first' } },
      },
    ];
    const plan = assertCompiled(document, { capabilities: { widgets: ['test.counting'] } });
    const renders = { first: 0, second: 0, note: 0 };
    function CountingWidget({ node, value, onChange }: FormWidgetProps) {
      renders[node.id as keyof typeof renders] += 1;
      return (
        <input
          aria-label={node.label}
          value={String(value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }
    const widgetRegistry = { 'test.counting': CountingWidget };

    function Harness() {
      const [value, setValue] = useState<JsonObject>({
        first: 'on',
        second: 'two',
        note: 'one',
      });
      return (
        <>
          <FormRenderer
            plan={plan}
            value={value}
            onChange={setValue}
            widgetRegistry={widgetRegistry}
          />
          <output data-testid="subscription-value">{JSON.stringify(value)}</output>
        </>
      );
    }

    render(<Harness />);
    await waitFor(() => expect(screen.getByLabelText('Note')).toBeTruthy());
    const initial = { ...renders };

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'changed' } });
    await waitFor(() => expect(renders.note).toBeGreaterThan(initial.note));
    expect(renders.first).toBe(initial.first);
    expect(renders.second).toBe(initial.second);

    const afterNote = { ...renders };
    fireEvent.change(screen.getByLabelText('First'), { target: { value: 'updated' } });
    await waitFor(() => expect(renders.first).toBeGreaterThan(afterNote.first));
    expect(renders.second).toBeGreaterThan(afterNote.second);
    expect(renders.note).toBe(afterNote.note);
    expect(screen.getByTestId('subscription-value').textContent).toContain('"note":"changed"');
  });

  it('rerenders conservatively for a transported plan without subscription metadata', () => {
    const plan = structuredClone(assertCompiled(createDocument()));
    delete (plan as Partial<typeof plan>).nodeSubscriptions;
    let renders = 0;
    function CountingWidget(props: FormWidgetProps) {
      renders += 1;
      return (
        <input
          aria-label={props.node.label}
          value={String(props.value ?? '')}
          onChange={(event) => props.onChange(event.target.value)}
        />
      );
    }
    const widgetRegistry = { text: CountingWidget };
    function Harness() {
      const [value, setValue] = useState<JsonObject>({ name: 'first' });
      return (
        <FormRenderer
          plan={plan}
          value={value}
          widgetRegistry={widgetRegistry}
          onChange={setValue}
        />
      );
    }

    render(<Harness />);
    const initial = renders;
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: 'second' } });
    expect(renders).toBeGreaterThan(initial);
  });

  it('projects required, invalid and locale states through A3S UI contracts', () => {
    const document = createDocument();
    document.metadata.locale = 'en-US';
    document.schema.required = ['name', 'active', 'tags', 'rating'];
    document.schema.properties = {
      ...document.schema.properties,
      tags: { type: 'array', items: { type: 'string' } },
      rating: { type: 'number' },
      notes: { type: 'string' },
      choice: { type: 'string' },
    };
    document.ui.nodes.push(
      { id: 'tags', kind: 'repeater', label: 'Tags', schemaPath: '/properties/tags' },
      {
        id: 'rating',
        kind: 'field',
        label: 'Rating',
        schemaPath: '/properties/rating',
        widget: 'company.rating',
      },
      { id: 'notes', kind: 'field', schemaPath: '/properties/notes', widget: 'textarea' },
      {
        id: 'choice',
        kind: 'field',
        schemaPath: '/properties/choice',
        widget: 'select',
        options: [{ label: 'First', value: 'first' }],
      },
    );
    document.ui.nodes[0].children?.push('tags', 'rating', 'notes', 'choice');
    const registry = defineFormNodeRegistry({
      'company.rating': {
        kind: 'field',
        catalog: {
          section: 'business',
          sectionLabel: 'Business',
          label: 'Rating',
          description: 'Numeric rating',
          glyph: 'R',
        },
        render: ({ id, value, onChange }: FormNodeRenderProps) => (
          <input
            id={id}
            aria-label="Rating"
            value={String(value ?? '')}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        ),
      },
    });
    const plan = assertCompiled(document, {
      capabilities: { widgets: Object.keys(registry) },
    });

    const { container } = render(
      <FormRenderer
        plan={plan}
        value={{}}
        onChange={() => undefined}
        errors={[
          { path: 'tags', code: 'tags.required', message: 'Add a tag.' },
          { path: 'rating', code: 'rating.required', message: 'Choose a rating.' },
        ]}
        nodeRegistry={registry}
      />,
    );

    expect(container.querySelector('form')?.lang).toBe('en-US');
    expect(screen.getByRole('switch', { name: '启用' }).hasAttribute('required')).toBe(true);
    expect(screen.getByRole('group', { name: 'Tags' }).classList.contains('is-invalid')).toBe(true);
    expect(
      screen.getByRole('group', { name: 'Tags' }).querySelector('legend')?.className,
    ).toContain('is-required');
    const rating = screen.getByLabelText('Rating').closest('.a3s-form-custom-node');
    expect(rating?.classList.contains('field')).toBe(true);
    expect(rating?.getAttribute('data-invalid')).toBe('true');
    expect(screen.getByLabelText('notes').classList.contains('textarea')).toBe(true);
    expect(screen.getByLabelText('choice').classList.contains('select')).toBe(true);
  });

  it('renders every native control, nested layout and controlled repeater edits', () => {
    const document = createDocument();
    document.rules = [];
    document.schema.properties = {
      ...document.schema.properties,
      bio: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'ready'] },
      tags: { type: 'array', items: { type: 'string' } },
      password: { type: 'string' },
      startDate: { type: 'string', format: 'date' },
    };
    const role = document.ui.nodes.find((node) => node.id === 'role');
    if (role) role.options = [{ label: '管理员', value: 'admin' }];
    document.ui.nodes.push(
      {
        id: 'details',
        kind: 'section',
        label: '详细信息',
        description: '更多资料',
        columns: 6,
        children: ['bio', 'status', 'tags', 'password', 'start-date', 'content'],
      },
      {
        id: 'bio',
        kind: 'field',
        label: '简介',
        schemaPath: '/properties/bio',
        widget: 'textarea',
      },
      {
        id: 'status',
        kind: 'field',
        label: '状态',
        schemaPath: '/properties/status',
        widget: 'radio',
        options: [
          { label: '草稿', value: 'draft' },
          { label: '就绪', value: 'ready', disabled: true },
        ],
      },
      { id: 'tags', kind: 'repeater', label: '标签', schemaPath: '/properties/tags' },
      {
        id: 'password',
        kind: 'field',
        label: '密码',
        schemaPath: '/properties/password',
        widget: 'password',
      },
      {
        id: 'start-date',
        kind: 'field',
        label: '开始日期',
        schemaPath: '/properties/startDate',
        widget: 'date',
      },
      { id: 'content', kind: 'content', content: '静态帮助内容' },
    );
    document.ui.nodes[0].children?.push('details');
    const plan = assertCompiled(document);
    function Harness() {
      const [value, setValue] = useState<JsonObject>({
        name: '张三',
        age: 20,
        bio: '原简介',
        status: 'draft',
        tags: ['一'],
      });
      return (
        <>
          <FormRenderer plan={plan} value={value} onChange={setValue} />
          <output data-testid="native-value">{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole('heading', { name: '详细信息' })).toBeTruthy();
    expect(screen.getByText('更多资料')).toBeTruthy();
    expect(screen.getByText('静态帮助内容')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('简介'), { target: { value: '新简介' } });
    fireEvent.change(screen.getByLabelText('年龄'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('switch', { name: '启用' }));
    fireEvent.change(screen.getByLabelText('角色'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('radio', { name: '草稿' }));
    fireEvent.change(screen.getByLabelText('标签 1'), { target: { value: '更新' } });
    fireEvent.click(screen.getByRole('button', { name: '添加一项' }));
    expect(screen.getByLabelText('标签 2')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: '移除' })[0]);
    expect(screen.getByLabelText('密码').getAttribute('type')).toBe('password');
    expect(screen.getByLabelText('开始日期').getAttribute('type')).toBe('date');
    expect(screen.getByTestId('native-value').textContent).toContain('"bio":"新简介"');
    expect(screen.getByTestId('native-value').textContent).toContain('"age":null');
    expect(screen.getByTestId('native-value').textContent).toContain('"role":"admin"');
  });

  it('renders tabs, collapsible panels, column containers and presentation nodes', () => {
    const document = createDocument();
    document.rules = [];
    document.ui.nodes.push(
      {
        id: 'tabs',
        kind: 'group',
        label: '分类资料',
        layout: 'tabs',
        children: ['tab-a', 'tab-b'],
      },
      {
        id: 'tab-a',
        kind: 'group',
        label: '基本资料',
        layout: 'tab',
        children: ['tab-a-content', 'divider', 'spacer'],
      },
      {
        id: 'tab-b',
        kind: 'group',
        label: '补充资料',
        layout: 'tab',
        children: ['tab-b-content'],
      },
      { id: 'tab-a-content', kind: 'content', content: '基本页内容' },
      { id: 'tab-b-content', kind: 'content', content: '补充页内容' },
      {
        id: 'divider',
        kind: 'content',
        presentation: 'divider',
        content: '下一部分',
      },
      { id: 'spacer', kind: 'content', presentation: 'spacer', gap: 32 },
      {
        id: 'collapse',
        kind: 'group',
        label: '更多设置',
        layout: 'collapse',
        children: ['panel-a', 'panel-b'],
      },
      {
        id: 'panel-a',
        kind: 'group',
        label: '通知设置',
        layout: 'collapse-panel',
        children: ['panel-a-content'],
      },
      {
        id: 'panel-b',
        kind: 'group',
        label: '权限设置',
        layout: 'collapse-panel',
        children: ['panel-b-content'],
      },
      { id: 'panel-a-content', kind: 'content', content: '通知内容' },
      { id: 'panel-b-content', kind: 'content', content: '权限内容' },
      {
        id: 'columns',
        kind: 'group',
        label: '双栏内容',
        layout: 'columns',
        children: ['column-a', 'column-b'],
      },
      {
        id: 'column-a',
        kind: 'group',
        layout: 'flow',
        width: 6,
        children: ['column-a-content'],
      },
      {
        id: 'column-b',
        kind: 'group',
        layout: 'flow',
        width: 6,
        children: ['column-b-content'],
      },
      { id: 'column-a-content', kind: 'content', content: '左栏' },
      { id: 'column-b-content', kind: 'content', content: '右栏' },
      {
        id: 'card',
        kind: 'group',
        label: '卡片内容',
        layout: 'card',
        children: ['card-content'],
      },
      { id: 'card-content', kind: 'content', content: '卡片正文' },
    );
    document.ui.nodes[0].children?.push('tabs', 'collapse', 'columns', 'card');
    render(<RendererHarness document={document} />);
    const tablist = screen.getByRole('tablist', { name: '分类资料' });
    expect(tablist.closest('.tabs')).toBeTruthy();
    expect(screen.getByText('基本页内容')).toBeTruthy();
    expect(screen.queryByText('补充页内容')).toBeNull();
    expect(screen.getByText('下一部分')).toBeTruthy();
    expect(window.document.querySelector('.a3s-form-spacer')).toBeTruthy();
    const basic = screen.getByRole('tab', { name: '基本资料' });
    fireEvent.keyDown(basic, { key: 'End' });
    expect(screen.getByText('补充页内容')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '补充资料' }).getAttribute('tabindex')).toBe('0');
    expect(screen.queryByText('基本页内容')).toBeNull();
    fireEvent.keyDown(screen.getByRole('tab', { name: '补充资料' }), { key: 'Home' });
    expect(screen.getByText('基本页内容')).toBeTruthy();
    fireEvent.keyDown(basic, { key: 'ArrowLeft' });
    expect(screen.getByText('补充页内容')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: '补充资料' }), { key: 'ArrowRight' });
    expect(screen.getByText('基本页内容')).toBeTruthy();
    fireEvent.keyDown(basic, { key: 'PageDown' });
    expect(screen.getByText('基本页内容')).toBeTruthy();
    fireEvent.keyDown(basic, { key: 'ArrowRight' });
    expect(screen.getByText('补充页内容')).toBeTruthy();
    expect(screen.getByText('通知设置')).toBeTruthy();
    expect(screen.getByText('权限设置')).toBeTruthy();
    expect(screen.getByText('通知内容')).toBeTruthy();
    expect(screen.getByText('权限内容')).toBeTruthy();
    expect(screen.getByText('左栏')).toBeTruthy();
    expect(screen.getByText('右栏')).toBeTruthy();
    expect(screen.getByText('通知设置').closest('.accordion')).toBeTruthy();
    expect(screen.getByText('卡片正文').closest('.card')).toBeTruthy();
  });

  it('uses host actions and renders externally controlled errors and read-only state', async () => {
    const document = createDocument();
    document.actions?.unshift({
      id: 'draft',
      registryKey: 'test.draft',
      label: '保存草稿',
      tone: 'secondary',
    });
    document.actions?.push(
      {
        id: 'delete',
        registryKey: 'test.delete',
        label: '删除记录',
        tone: 'danger',
      },
      {
        id: 'inspect',
        registryKey: 'test.inspect',
        label: '检查数据',
      },
    );
    const role = document.ui.nodes.find((node) => node.id === 'role');
    if (role) role.label = undefined;
    const plan = assertCompiled(document);
    const calls: string[] = [];
    const { rerender } = render(
      <FormRenderer
        plan={plan}
        value={{ name: '张三' }}
        onChange={() => undefined}
        hostAdapter={{
          invokeAction: async ({ definition }) => {
            calls.push(definition.id);
          },
        }}
        className="embedded-form"
        locale="zh-Hans"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));
    await waitFor(() => expect(calls).toEqual(['draft']));
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(calls).toEqual(['draft', 'submit']));
    const dangerAction = screen.getByRole('button', { name: '删除记录' });
    expect(dangerAction.getAttribute('data-variant')).toBe('destructive');
    expect(dangerAction.className).toContain('a3s-form-danger');
    fireEvent.click(dangerAction);
    await waitFor(() => expect(calls).toEqual(['draft', 'submit', 'delete']));
    fireEvent.click(screen.getByRole('button', { name: '检查数据' }));
    await waitFor(() => expect(calls).toEqual(['draft', 'submit', 'delete', 'inspect']));
    rerender(
      <FormRenderer
        plan={plan}
        value={{ name: '张三' }}
        onChange={() => undefined}
        errors={[
          { path: 'name', code: 'one', message: '错误一' },
          { path: 'name', code: 'two', message: '错误二' },
          { path: 'role', code: 'role', message: '角色错误' },
          { path: 'missing', code: 'missing', message: '表单级错误' },
        ]}
        readOnly
        className="embedded-form"
        locale="zh-Hans"
      />,
    );
    expect(screen.getAllByText(/错误一/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/错误二/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'role：角色错误' })).toBeTruthy();
    expect(screen.getByText('表单级错误')).toBeTruthy();
    expect(screen.getByLabelText('姓名').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('姓名') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '提交' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('姓名').closest('form')?.className).toContain('embedded-form');
  });

  it('saves incomplete drafts while keeping primary submission validation', async () => {
    const document = createDocument();
    document.actions?.unshift({
      id: 'draft',
      registryKey: 'test.draft',
      label: '保存草稿',
      tone: 'secondary',
    });
    const calls: string[] = [];
    render(
      <FormRenderer
        plan={assertCompiled(document)}
        value={{}}
        onChange={() => undefined}
        onAction={(id) => {
          calls.push(id);
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));
    await waitFor(() => expect(calls).toEqual(['draft']));
    expect(screen.queryByRole('alert', { name: '表单校验结果' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(screen.getByRole('alert', { name: '表单校验结果' })).toBeTruthy();
    expect(screen.getByText('请检查 1 项内容')).toBeTruthy();
    expect(calls).toEqual(['draft']);
  });

  it('locks actions while pending and reports rejected host actions', async () => {
    let resolveAction: (() => void) | undefined;
    const plan = assertCompiled(createDocument());
    const pendingView = render(
      <FormRenderer
        plan={plan}
        value={{ name: '张三' }}
        onChange={() => undefined}
        onAction={() =>
          new Promise<void>((resolve) => {
            resolveAction = resolve;
          })
        }
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    const pending = screen.getByRole('button', { name: '处理中…' }) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);
    expect(pending.closest('form')?.getAttribute('aria-busy')).toBe('true');
    resolveAction?.();
    await waitFor(() => expect(screen.getByRole('button', { name: '提交' })).toBeTruthy());
    pendingView.unmount();

    render(
      <FormRenderer
        plan={plan}
        value={{ name: '张三' }}
        onChange={() => undefined}
        onAction={async () => {
          throw new Error('host unavailable');
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('操作没有完成，请检查网络或宿主状态后重试。')).toBeTruthy();
  });

  it('reports host data-source failures only while mounted', async () => {
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    const plan = assertCompiled(createDocument());
    const { unmount } = render(
      <FormRenderer
        plan={plan}
        value={{ name: '张三' }}
        onChange={() => undefined}
        hostAdapter={{
          resolveDataSource: async () => {
            throw new Error('offline');
          },
        }}
      />,
    );
    await waitFor(() => expect(warnings).toHaveLength(1));
    unmount();
    console.warn = originalWarn;
  });

  it('renders sparse nodes through safe defaults and supports checkbox repeaters', () => {
    const document = createDocument();
    document.metadata.locale = undefined;
    document.rules = [];
    document.dataSources = [];
    document.actions = [];
    document.schema.properties = {
      accepted: { type: 'boolean' },
      notes: { type: 'array', items: { type: 'string' } },
      orphan: { type: 'string' },
    };
    document.schema.required = [];
    document.ui.nodes = [
      { id: 'root', kind: 'root', children: ['empty', 'accepted', 'notes', 'orphan'] },
      { id: 'empty', kind: 'group' },
      { id: 'accepted', kind: 'field', schemaPath: '/properties/accepted', widget: 'checkbox' },
      { id: 'notes', kind: 'repeater', schemaPath: '/properties/notes' },
      { id: 'orphan', kind: 'field', schemaPath: '/properties/orphan' },
    ];
    const compiledPlan = assertCompiled(document);
    const orphan = { ...compiledPlan.nodeById.orphan, valuePath: undefined };
    const plan = {
      ...compiledPlan,
      nodes: compiledPlan.nodes.map((node) => (node.id === 'orphan' ? orphan : node)),
      nodeById: { ...compiledPlan.nodeById, orphan },
    };

    function Harness() {
      const [value, setValue] = useState<JsonObject>({ notes: [null] });
      return (
        <>
          <FormRenderer plan={plan} value={value} onChange={setValue} />
          <output data-testid="sparse-value">{JSON.stringify(value)}</output>
        </>
      );
    }

    const { container } = render(<Harness />);
    expect(container.querySelector('form')?.lang).toBe('zh-CN');
    fireEvent.click(container.querySelector('input[type="checkbox"]') as HTMLInputElement);
    expect(screen.getByTestId('sparse-value').textContent).toContain('"accepted":true');
    expect(screen.getByLabelText('notes 1')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('notes 1'), { target: { value: '第一项' } });
    expect(screen.getByTestId('sparse-value').textContent).toContain('"notes":["第一项"]');
    expect(container.querySelector('input[id*="orphan"]')).toBeNull();
  });

  it('handles missing select values, non-primary submission and empty actions', async () => {
    const selectPlan = assertCompiled(createDocument());
    function SelectHarness() {
      const [value, setValue] = useState<JsonObject>({ name: '张三' });
      return (
        <>
          <FormRenderer plan={selectPlan} value={value} onChange={setValue} />
          <output data-testid="select-value">{JSON.stringify(value)}</output>
        </>
      );
    }
    const selectView = render(<SelectHarness />);
    fireEvent.change(screen.getByLabelText('角色'), { target: { value: 'missing' } });
    expect(screen.getByTestId('select-value').textContent).toContain('"role":""');
    selectView.unmount();

    const secondaryDocument = createDocument();
    secondaryDocument.actions = [
      { id: 'save', registryKey: 'test.save', label: '保存', tone: 'secondary' },
    ];
    const secondaryPlan = assertCompiled(secondaryDocument);
    const secondaryView = render(
      <FormRenderer plan={secondaryPlan} value={{ name: '张三' }} onChange={() => undefined} />,
    );
    fireEvent.submit(secondaryView.container.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeTruthy());
    secondaryView.unmount();

    const emptyDocument = createDocument();
    emptyDocument.actions = [];
    const emptyPlan = assertCompiled(emptyDocument);
    const emptyView = render(
      <FormRenderer plan={emptyPlan} value={{ name: '张三' }} onChange={() => undefined} />,
    );
    fireEvent.submit(emptyView.container.querySelector('form') as HTMLFormElement);
    expect(emptyView.container.querySelector('footer')).toBeNull();
    emptyView.unmount();
  });

  it('suppresses rejected data sources after their render is unmounted', async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    const plan = assertCompiled(createDocument());
    const view = render(
      <FormRenderer
        plan={plan}
        value={{ name: '张三' }}
        onChange={() => undefined}
        hostAdapter={{
          resolveDataSource: () =>
            new Promise((_, reject) => {
              rejectRequest = reject;
            }),
        }}
      />,
    );
    await waitFor(() => expect(rejectRequest).toBeTruthy());
    view.unmount();
    rejectRequest?.(new Error('cancelled'));
    await Promise.resolve();
    expect(warnings).toHaveLength(0);
    console.warn = originalWarn;
  });
});
