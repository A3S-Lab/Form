import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { assertCompiled, type FormDocument, type JsonObject } from '../src/core';
import { FormRenderer, type FormWidgetProps } from '../src/react';
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
    fireEvent.click(screen.getByRole('checkbox', { name: /启用/ }));
    expect(await screen.findByLabelText('年龄')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('年龄'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(action).toBe('submit'));
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
    fireEvent.click(screen.getByRole('checkbox', { name: '启用' }));
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
    );
    document.ui.nodes[0].children?.push('tabs', 'collapse', 'columns');
    render(<RendererHarness document={document} />);
    expect(screen.getByRole('tablist', { name: '分类资料' })).toBeTruthy();
    expect(screen.getByText('基本页内容')).toBeTruthy();
    expect(screen.queryByText('补充页内容')).toBeNull();
    expect(screen.getByText('下一部分')).toBeTruthy();
    expect(window.document.querySelector('.a3s-form-spacer')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '补充资料' }));
    expect(screen.getByText('补充页内容')).toBeTruthy();
    expect(screen.queryByText('基本页内容')).toBeNull();
    expect(screen.getByText('通知设置')).toBeTruthy();
    expect(screen.getByText('权限设置')).toBeTruthy();
    expect(screen.getByText('通知内容')).toBeTruthy();
    expect(screen.getByText('权限内容')).toBeTruthy();
    expect(screen.getByText('左栏')).toBeTruthy();
    expect(screen.getByText('右栏')).toBeTruthy();
  });

  it('uses host actions and renders externally controlled errors and read-only state', async () => {
    const document = createDocument();
    document.actions?.unshift({
      id: 'draft',
      registryKey: 'test.draft',
      label: '保存草稿',
      tone: 'secondary',
    });
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
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(calls).toEqual(['draft', 'submit']));
    rerender(
      <FormRenderer
        plan={plan}
        value={{ name: '张三' }}
        onChange={() => undefined}
        errors={[
          { path: 'name', code: 'one', message: '错误一' },
          { path: 'name', code: 'two', message: '错误二' },
        ]}
        readOnly
        className="embedded-form"
        locale="zh-Hans"
      />,
    );
    expect(screen.getByText('错误一')).toBeTruthy();
    expect(screen.getByText('错误二')).toBeTruthy();
    expect(screen.getByLabelText('姓名').getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('姓名') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '提交' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('姓名').closest('form')?.className).toContain('embedded-form');
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
