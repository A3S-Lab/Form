import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { compileForm, type FormDocument, type JsonObject } from '../src/core';
import { FormDesigner } from '../src/react';
import { createDocument } from './fixtures';

function DesignerHarness({ initial = createDocument() }: { initial?: FormDocument }) {
  const [document, setDocument] = useState(() => compileForm(initial).document as FormDocument);
  return (
    <>
      <FormDesigner document={document} onChange={setDocument} />
      <output data-testid="designer-document">{JSON.stringify(document)}</output>
    </>
  );
}

function RawDesignerHarness({ initial }: { initial: FormDocument }) {
  const [document, setDocument] = useState(initial);
  return (
    <>
      <FormDesigner document={document} onChange={setDocument} />
      <output data-testid="designer-document">{JSON.stringify(document)}</output>
    </>
  );
}

function currentDocument(): FormDocument {
  return JSON.parse(screen.getByTestId('designer-document').textContent ?? '{}') as FormDocument;
}

function dragTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    effectAllowed: 'none',
    getData: (type: string) => values.get(type) ?? '',
    setData: (type: string, value: string) => values.set(type, value),
  } as unknown as DataTransfer;
}

describe('React FormDesigner', () => {
  it('adds, configures, previews, deletes and restores fields in Chinese', () => {
    render(<DesignerHarness />);
    expect(screen.getByTestId('form-designer')).toBeTruthy();
    expect(screen.getByText(/编译通过/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /单行文本/ }));
    expect(screen.getByTestId('designer-document').textContent).toContain('field-1');
    fireEvent.change(screen.getByLabelText('字段标题'), { target: { value: '联系电话' } });
    fireEvent.change(screen.getByLabelText('字段组件'), { target: { value: 'textarea' } });
    fireEvent.change(screen.getByLabelText('字段说明'), { target: { value: '请留下联系方式' } });
    fireEvent.change(screen.getByLabelText('占位提示'), { target: { value: '手机或座机' } });
    fireEvent.change(screen.getByLabelText('栅格宽度'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: '校验' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '必填字段' }));
    expect(screen.getByRole('button', { name: /联系电话/ })).toBeTruthy();
    expect(screen.getByTestId('designer-document').textContent).toContain('请留下联系方式');

    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    fireEvent.change(screen.getByLabelText('联系电话'), { target: { value: '010-12345678' } });
    expect((screen.getByLabelText('联系电话') as HTMLTextAreaElement).value).toBe('010-12345678');
    fireEvent.click(screen.getByRole('button', { name: '设计' }));
    fireEvent.click(screen.getByRole('button', { name: '属性' }));
    fireEvent.click(screen.getByRole('button', { name: '删除字段' }));
    expect(screen.queryByRole('button', { name: /联系电话/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /撤销/ }));
    expect(screen.getByRole('button', { name: /联系电话/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重做/ }));
    expect(screen.queryByRole('button', { name: /联系电话/ })).toBeNull();
  });

  it('reviews revision-bound structured patches and rejects malformed input', () => {
    const document = compileForm(createDocument()).document as FormDocument;
    render(<DesignerHarness initial={document} />);
    fireEvent.click(screen.getByRole('button', { name: '高级' }));
    const editor = screen.getByLabelText('FormPatch JSON');
    fireEvent.change(editor, { target: { value: '{invalid' } });
    fireEvent.click(screen.getByRole('button', { name: '校验并应用' }));
    expect(screen.getByText('补丁不是有效 JSON，请检查后重试。')).toBeTruthy();

    fireEvent.change(editor, {
      target: {
        value: JSON.stringify({
          apiVersion: 'a3s.dev/form-patch/v1alpha1',
          baseRevision: document.revision,
          operations: [{ op: 'set', path: '/metadata/title', value: 'AI 审阅后的表单' }],
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '校验并应用' }));
    expect(screen.getByText(/已应用 1 项受控变更/)).toBeTruthy();
    expect(screen.getByTestId('designer-document').textContent).toContain('AI 审阅后的表单');
  });

  it('forwards preview actions to the embedding host', async () => {
    let action = '';
    const document = compileForm(createDocument()).document as FormDocument;
    function Harness() {
      const [value, setValue] = useState<JsonObject>({ name: '张三' });
      return (
        <FormDesigner
          document={document}
          onChange={() => undefined}
          value={value}
          onValueChange={setValue}
          onAction={(id) => {
            action = id;
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(action).toBe('submit'));
  });

  it('creates mainstream layout presets and edits structural items', () => {
    render(<DesignerHarness />);
    const selectRoot = () => fireEvent.click(screen.getByRole('button', { name: '选择基础信息' }));

    selectRoot();
    fireEvent.click(screen.getByRole('button', { name: '添加两栏布局' }));
    let document = currentDocument();
    const columns = document.ui.nodes.find((node) => node.layout === 'columns');
    expect(columns?.children).toHaveLength(2);
    expect(
      columns?.children?.map((id) => document.ui.nodes.find((node) => node.id === id)?.width),
    ).toEqual([6, 6]);

    fireEvent.click(screen.getByRole('button', { name: '添加单行文本字段' }));
    document = currentDocument();
    const firstColumn = document.ui.nodes.find((node) => node.id === columns?.children?.[0]);
    expect(firstColumn?.children).toContain('field-1');

    selectRoot();
    fireEvent.click(screen.getByRole('button', { name: '添加标签页' }));
    document = currentDocument();
    const tabs = document.ui.nodes.find((node) => node.layout === 'tabs');
    expect(tabs?.children).toHaveLength(2);
    fireEvent.click(
      within(screen.getByRole('complementary', { name: '属性面板' })).getByRole('button', {
        name: '添加标签页',
      }),
    );
    document = currentDocument();
    expect(document.ui.nodes.find((node) => node.id === tabs?.id)?.children).toHaveLength(3);

    selectRoot();
    fireEvent.click(screen.getByRole('button', { name: '添加折叠面板' }));
    selectRoot();
    fireEvent.click(screen.getByRole('button', { name: '添加卡片分组' }));
    selectRoot();
    fireEvent.click(screen.getByRole('button', { name: '添加分隔线' }));
    selectRoot();
    fireEvent.click(screen.getByRole('button', { name: '添加间距' }));
    document = currentDocument();
    expect(document.ui.nodes.some((node) => node.layout === 'collapse')).toBe(true);
    expect(document.ui.nodes.some((node) => node.layout === 'card')).toBe(true);
    expect(document.ui.nodes.some((node) => node.presentation === 'divider')).toBe(true);
    expect(document.ui.nodes.some((node) => node.presentation === 'spacer')).toBe(true);

    fireEvent.change(screen.getByLabelText('间距高度'), { target: { value: '32' } });
    fireEvent.click(screen.getByRole('button', { name: '移动' }));
    expect(screen.getByTestId('designer-canvas').querySelector('.is-mobile')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    expect(screen.getByRole('tablist')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '标签页 2' }));
  });

  it('supports palette drops, exact reordering and cross-container moves', () => {
    render(<DesignerHarness />);
    fireEvent.click(screen.getByRole('button', { name: '选择基础信息' }));
    fireEvent.click(screen.getByRole('button', { name: '添加两栏布局' }));
    const columns = currentDocument().ui.nodes.find((node) => node.layout === 'columns');
    const firstColumnId = columns?.children?.[0] as string;

    const fieldTransfer = dragTransfer();
    const nameNode = window.document.querySelector('[data-node-id="name"]') as HTMLElement;
    fireEvent.dragStart(nameNode, { dataTransfer: fieldTransfer });
    const columnDrop = screen.getByRole('button', { name: `插入到${firstColumnId}第1位` });
    fireEvent.dragEnter(columnDrop, { dataTransfer: fieldTransfer });
    expect(columnDrop.className).toContain('is-active');
    fireEvent.dragLeave(columnDrop, { dataTransfer: fieldTransfer });
    expect(columnDrop.className).not.toContain('is-active');
    fireEvent.dragEnter(columnDrop, { dataTransfer: fieldTransfer });
    fireEvent.drop(columnDrop, { dataTransfer: fieldTransfer });
    let document = currentDocument();
    expect(document.ui.nodes.find((node) => node.id === firstColumnId)?.children).toEqual(['name']);
    expect(document.ui.nodes.find((node) => node.id === document.ui.root)?.children).not.toContain(
      'name',
    );

    const catalogTransfer = dragTransfer();
    fireEvent.dragStart(screen.getByRole('button', { name: '添加数字字段' }), {
      dataTransfer: catalogTransfer,
    });
    fireEvent.drop(screen.getByRole('button', { name: `插入到${firstColumnId}第1位` }), {
      dataTransfer: catalogTransfer,
    });
    document = currentDocument();
    expect(document.ui.nodes.find((node) => node.id === firstColumnId)?.children?.[0]).toBe(
      'field-1',
    );

    const roleTransfer = dragTransfer();
    fireEvent.dragStart(window.document.querySelector('[data-node-id="role"]') as HTMLElement, {
      dataTransfer: roleTransfer,
    });
    fireEvent.drop(screen.getByRole('button', { name: '插入到root第1位' }), {
      dataTransfer: roleTransfer,
    });
    expect(currentDocument().ui.nodes.find((node) => node.id === 'root')?.children?.[0]).toBe(
      'role',
    );

    const reorderTransfer = dragTransfer();
    fireEvent.dragStart(window.document.querySelector('[data-node-id="role"]') as HTMLElement, {
      dataTransfer: reorderTransfer,
    });
    fireEvent.drop(screen.getByRole('button', { name: '插入到root第5位' }), {
      dataTransfer: reorderTransfer,
    });
    expect(
      currentDocument()
        .ui.nodes.find((node) => node.id === 'root')
        ?.children?.at(-1),
    ).toBe('role');
    fireEvent.click(screen.getByRole('button', { name: '下移节点' }));

    const rootTransfer = dragTransfer();
    rootTransfer.setData('application/x-a3s-form-node', 'root');
    fireEvent.drop(screen.getByRole('button', { name: '插入到root第1位' }), {
      dataTransfer: rootTransfer,
    });
    const selfTransfer = dragTransfer();
    selfTransfer.setData('application/x-a3s-form-node', firstColumnId);
    fireEvent.drop(screen.getByRole('button', { name: `插入到${firstColumnId}第1位` }), {
      dataTransfer: selfTransfer,
    });
    const missingTransfer = dragTransfer();
    missingTransfer.setData('application/x-a3s-form-node', 'missing-node');
    fireEvent.drop(screen.getByRole('button', { name: '插入到root第1位' }), {
      dataTransfer: missingTransfer,
    });

    const cycleTransfer = dragTransfer();
    fireEvent.dragStart(
      window.document.querySelector(`[data-node-id="${columns?.id}"]`) as HTMLElement,
      { dataTransfer: cycleTransfer },
    );
    const revision = currentDocument().revision;
    fireEvent.drop(screen.getByRole('button', { name: `插入到${firstColumnId}第2位` }), {
      dataTransfer: cycleTransfer,
    });
    expect(currentDocument().revision).toBe(revision);
  });

  it('duplicates nested layouts and configures options, rules and numeric constraints', () => {
    render(<DesignerHarness />);
    fireEvent.click(screen.getByRole('button', { name: '选择基础信息' }));
    fireEvent.click(screen.getByRole('button', { name: '添加两栏布局' }));
    const layout = currentDocument().ui.nodes.find((node) => node.layout === 'columns');
    const heading = window.document.querySelector(
      `[data-node-id="${layout?.id}"] .a3s-form-design-container-heading > button`,
    ) as HTMLButtonElement;
    fireEvent.click(heading);
    fireEvent.click(
      within(screen.getByRole('complementary', { name: '属性面板' })).getByRole('button', {
        name: '复制节点',
      }),
    );
    let document = currentDocument();
    expect(document.ui.nodes.filter((node) => node.layout === 'columns')).toHaveLength(2);
    expect(document.ui.nodes.filter((node) => node.layout === 'flow')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: '上移节点' }));
    fireEvent.click(screen.getByRole('button', { name: '下移节点' }));

    fireEvent.click(screen.getByRole('button', { name: '选择基础信息' }));
    fireEvent.click(screen.getByRole('button', { name: '添加下拉选择字段' }));
    fireEvent.change(screen.getByLabelText('字段选项'), {
      target: { value: '研发部\n产品部\n运营部' },
    });
    fireEvent.click(screen.getByRole('button', { name: '校验' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '必填字段' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '只读字段' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '默认隐藏' }));
    fireEvent.change(screen.getByLabelText('最小字符数'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('最大字符数'), { target: { value: '20' } });
    document = currentDocument();
    const selectNode = document.ui.nodes.find(
      (node) => node.widget === 'select' && node.id.startsWith('field-'),
    );
    const selectProperty = selectNode?.schemaPath?.replace('/properties/', '') as string;
    expect(selectNode?.options?.map((option) => option.label)).toEqual([
      '研发部',
      '产品部',
      '运营部',
    ]);
    expect(selectNode?.readOnly).toBe(true);
    expect(selectNode?.hidden).toBe(true);
    expect(document.schema.properties?.[selectProperty]?.minLength).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: '属性' }));
    fireEvent.click(screen.getByRole('button', { name: '选择基础信息' }));
    fireEvent.click(screen.getByRole('button', { name: '添加数字字段' }));
    fireEvent.click(screen.getByRole('button', { name: '校验' }));
    fireEvent.change(screen.getByLabelText('最小值'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('最大值'), { target: { value: '99' } });
    document = currentDocument();
    const numberNode = document.ui.nodes.find(
      (node) => node.widget === 'number' && node.id.startsWith('field-'),
    );
    const numberProperty = numberNode?.schemaPath?.replace('/properties/', '') as string;
    expect(document.schema.properties?.[numberProperty]?.minimum).toBe(1);
    expect(document.schema.properties?.[numberProperty]?.maximum).toBe(99);
  });

  it('covers layout settings, remaining native components and canvas actions', () => {
    render(<DesignerHarness />);
    const selectRoot = () => fireEvent.click(screen.getByRole('button', { name: '选择基础信息' }));
    const addAtRoot = (name: string) => {
      selectRoot();
      fireEvent.click(screen.getByRole('button', { name }));
    };

    selectRoot();
    fireEvent.change(screen.getByLabelText('表单标题'), { target: { value: '供应商登记' } });
    fireEvent.change(screen.getByLabelText('表单说明'), { target: { value: '请完善企业资料' } });
    fireEvent.change(screen.getByLabelText('画布栏数'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('画布间距'), { target: { value: '8' } });

    addAtRoot('添加栅格容器');
    fireEvent.change(screen.getByLabelText('字段标题'), { target: { value: '联系人信息' } });
    fireEvent.change(screen.getByLabelText('字段说明'), { target: { value: '主要联系人' } });
    fireEvent.change(screen.getByLabelText('内部栏数'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('内部间距'), { target: { value: '24' } });
    addAtRoot('添加三栏布局');
    addAtRoot('添加单选项字段');
    fireEvent.change(screen.getByLabelText('字段选项'), { target: { value: '甲\n乙' } });
    addAtRoot('添加开关字段');
    addAtRoot('添加重复项字段');

    let document = currentDocument();
    const repeater = document.ui.nodes.find((node) => node.kind === 'repeater');
    const repeaterView = window.document.querySelector(
      `[data-node-id="${repeater?.id}"]`,
    ) as HTMLElement;
    fireEvent.click(within(repeaterView).getByRole('button', { name: '复制节点' }));
    document = currentDocument();
    const repeaterCopy = document.ui.nodes.find(
      (node) => node.kind === 'repeater' && node.id !== repeater?.id,
    );
    const repeaterCopyView = window.document.querySelector(
      `[data-node-id="${repeaterCopy?.id}"]`,
    ) as HTMLElement;
    fireEvent.click(within(repeaterCopyView).getByRole('button', { name: '删除节点' }));

    addAtRoot('添加邮箱字段');
    addAtRoot('添加密码字段');
    addAtRoot('添加日期字段');
    addAtRoot('添加说明文字');
    fireEvent.change(screen.getByLabelText('说明文字内容'), { target: { value: '提交前请核对' } });
    addAtRoot('添加分隔线');
    fireEvent.change(screen.getByLabelText('分隔线标题'), { target: { value: '补充资料' } });
    addAtRoot('添加折叠面板');
    fireEvent.click(
      within(screen.getByRole('complementary', { name: '属性面板' })).getByRole('button', {
        name: '添加折叠面板',
      }),
    );

    expect(currentDocument().metadata.title).toBe('供应商登记');
    expect(currentDocument().ui.nodes.some((node) => node.layout === 'grid')).toBe(true);
    expect(
      currentDocument()
        .ui.nodes.filter((node) => node.layout === 'columns')
        .at(-1)?.children,
    ).toHaveLength(3);
    expect(screen.getByText('主要联系人')).toBeTruthy();
    expect(screen.getByText('提交前请核对')).toBeTruthy();
    expect(screen.getByText('补充资料')).toBeTruthy();
  });

  it('duplicates required fields with collision-safe schema keys and protects the last panel', () => {
    render(<DesignerHarness />);
    fireEvent.click(screen.getByRole('button', { name: '选择姓名' }));
    const inspector = screen.getByRole('complementary', { name: '属性面板' });
    fireEvent.click(within(inspector).getByRole('button', { name: '复制节点' }));
    fireEvent.click(screen.getByRole('button', { name: '选择姓名' }));
    fireEvent.click(within(inspector).getByRole('button', { name: '复制节点' }));
    let document = currentDocument();
    expect(document.schema.properties?.name_copy).toBeTruthy();
    expect(document.schema.properties?.name_copy_2).toBeTruthy();
    expect(document.schema.required).toEqual(expect.arrayContaining(['name_copy', 'name_copy_2']));

    fireEvent.click(screen.getByRole('button', { name: '选择基础信息' }));
    fireEvent.click(screen.getByRole('button', { name: '添加折叠面板' }));
    document = currentDocument();
    const collapse = document.ui.nodes.find((node) => node.layout === 'collapse');
    const firstPanel = document.ui.nodes.find((node) => node.id === collapse?.children?.[0]);
    const secondPanel = document.ui.nodes.find((node) => node.id === collapse?.children?.[1]);
    fireEvent.click(screen.getByRole('button', { name: firstPanel?.label }));
    fireEvent.click(within(inspector).getByRole('button', { name: '删除节点' }));
    fireEvent.click(screen.getByRole('button', { name: secondPanel?.label }));
    const revision = currentDocument().revision;
    fireEvent.click(within(inspector).getByRole('button', { name: '删除节点' }));
    expect(currentDocument().revision).toBe(revision);
  });

  it('renders sparse layout labels and widget defaults while keeping inspectors editable', () => {
    const sparse = createDocument();
    sparse.schema = {
      type: 'object',
      properties: {
        choice: { type: 'string' },
        enabled: { type: 'boolean' },
        rows: { type: 'array', items: { type: 'string' } },
        amount: { type: 'number', minimum: 1 },
      },
      required: [],
    };
    sparse.rules = undefined;
    sparse.dataSources = undefined;
    sparse.ui.nodes = [
      {
        id: 'root',
        kind: 'root',
        children: [
          'tabs',
          'collapse',
          'group',
          'radio',
          'switch',
          'repeater',
          'plain-content',
          'spacer',
          'amount',
        ],
      },
      { id: 'tabs', kind: 'group', layout: 'tabs', children: ['tab'] },
      { id: 'tab', kind: 'group', layout: 'tab', children: [] },
      { id: 'collapse', kind: 'group', layout: 'collapse', children: ['panel'] },
      { id: 'panel', kind: 'group', layout: 'collapse-panel', children: [] },
      { id: 'group', kind: 'section', description: '无标题分组', children: [] },
      { id: 'radio', kind: 'field', schemaPath: '/properties/choice', widget: 'radio' },
      { id: 'switch', kind: 'field', schemaPath: '/properties/enabled', widget: 'switch' },
      { id: 'repeater', kind: 'repeater', schemaPath: '/properties/rows' },
      { id: 'plain-content', kind: 'content' },
      { id: 'spacer', kind: 'content', presentation: 'spacer' },
      { id: 'amount', kind: 'field', schemaPath: '/properties/amount', widget: 'number' },
    ];
    render(<RawDesignerHarness initial={sparse} />);
    expect(screen.getByRole('tab', { name: '未命名标签' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '未命名面板' })).toBeTruthy();
    expect(screen.getByText('无标题分组')).toBeTruthy();
    expect(screen.getByText('列表项')).toBeTruthy();
    expect(screen.getByText('启用')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '未命名标签' }));
    expect(screen.getByText('标签页内容')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '未命名面板' }));
    expect(screen.getAllByRole('button', { name: '删除节点' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '选择plain-content' }));
    expect((screen.getByLabelText('说明文字内容') as HTMLTextAreaElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('说明文字内容'), { target: { value: '说明' } });
    fireEvent.click(screen.getByRole('button', { name: '选择spacer' }));
    expect((screen.getByLabelText('间距高度') as HTMLSelectElement).value).toBe('24');

    const groupHeading = window.document.querySelector(
      '[data-node-id="group"] .a3s-form-design-container-heading > button',
    ) as HTMLButtonElement;
    fireEvent.click(groupHeading);
    expect((screen.getByLabelText('内部栏数') as HTMLSelectElement).value).toBe('12');
    expect((screen.getByLabelText('内部间距') as HTMLSelectElement).value).toBe('16');

    fireEvent.click(screen.getByRole('button', { name: '选择root' }));
    fireEvent.click(screen.getByRole('button', { name: '校验' }));
    expect(screen.getByText('当前节点没有字段校验设置。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '选择amount' }));
    fireEvent.click(screen.getByRole('button', { name: '校验' }));
    fireEvent.change(screen.getByLabelText('最小值'), { target: { value: '' } });
  });

  it('fails closed for orphan field editing while covering missing schema defaults', () => {
    const orphan = createDocument();
    orphan.schema = { type: 'object', properties: {}, required: [] };
    orphan.rules = undefined;
    orphan.ui.nodes = [
      { id: 'root', kind: 'root', children: [] },
      {
        id: 'orphan-select',
        kind: 'field',
        schemaPath: '/properties/missing',
        widget: 'select',
      },
    ];
    render(<RawDesignerHarness initial={orphan} />);
    fireEvent.change(screen.getByLabelText('字段选项'), { target: { value: '孤立选项' } });
    fireEvent.click(
      within(screen.getByRole('complementary', { name: '属性面板' })).getByRole('button', {
        name: '复制节点',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '校验' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '必填字段' }));
    fireEvent.click(screen.getByRole('button', { name: '属性' }));
    fireEvent.click(screen.getByRole('button', { name: '删除字段' }));
    expect(currentDocument().ui.nodes.map((node) => node.id)).toEqual(['root']);
  });

  it('renders raw fallback, missing-reference and cycle states without recursing forever', () => {
    const fallback = createDocument();
    fallback.metadata.description = undefined;
    fallback.ui.nodes = [
      {
        id: 'root',
        kind: 'root',
        children: [
          'missing',
          'loop',
          'empty-group',
          'empty-tabs',
          'empty-collapse',
          'plain-content',
          'spacer',
        ],
      },
      { id: 'loop', kind: 'group', children: ['loop'] },
      { id: 'orphan-loop', kind: 'group', children: ['orphan-loop'] },
      { id: 'empty-group', kind: 'section', description: '空分组说明' },
      { id: 'empty-tabs', kind: 'group', layout: 'tabs' },
      { id: 'empty-collapse', kind: 'group', layout: 'collapse' },
      { id: 'plain-content', kind: 'content' },
      { id: 'spacer', kind: 'content', presentation: 'spacer' },
    ];
    render(<RawDesignerHarness initial={fallback} />);
    expect(screen.getByText('请填写以下信息')).toBeTruthy();
    expect(screen.getByText('布局存在循环：loop')).toBeTruthy();
    expect(screen.getByText('空分组说明')).toBeTruthy();
    expect(screen.getByText('在属性面板中编辑说明文字。')).toBeTruthy();
    expect(screen.getByText('间距 24px')).toBeTruthy();
    expect(screen.getAllByText('拖拽组件到这里，或从左侧点击添加').length).toBeGreaterThan(2);
    fireEvent.click(screen.getByRole('button', { name: '结构' }));
    expect(screen.getByRole('treeitem', { name: '选择loop' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '组件' }));
    const unknownTransfer = dragTransfer();
    unknownTransfer.setData('application/x-a3s-form-catalog', 'unknown-component');
    const rootDrop = screen.getByRole('button', { name: '插入到root第1位' });
    fireEvent.dragOver(rootDrop, { dataTransfer: unknownTransfer });
    fireEvent.drop(rootDrop, { dataTransfer: unknownTransfer });
    const emptyTransfer = dragTransfer();
    fireEvent.drop(rootDrop, { dataTransfer: emptyTransfer });
  });

  it('adds fields to selected containers, allocates unique ids and reports patch conflicts', () => {
    render(<DesignerHarness />);
    fireEvent.click(screen.getByRole('button', { name: '结构' }));
    fireEvent.click(screen.getByRole('treeitem', { name: '选择基础信息' }));
    fireEvent.click(screen.getByRole('button', { name: '组件' }));
    fireEvent.click(screen.getByRole('button', { name: '添加单行文本字段' }));
    fireEvent.click(screen.getByRole('button', { name: '添加单行文本字段' }));
    expect(screen.getByTestId('designer-document').textContent).toContain('field-1');
    expect(screen.getByTestId('designer-document').textContent).toContain('field-2');

    fireEvent.click(screen.getByRole('button', { name: '高级' }));
    fireEvent.change(screen.getByLabelText('FormPatch JSON'), {
      target: {
        value: JSON.stringify({
          apiVersion: 'a3s.dev/form-patch/v1alpha1',
          baseRevision: 0,
          operations: [{ op: 'set', path: '/metadata/title', value: '过期补丁' }],
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '校验并应用' }));
    expect(screen.getByText(/补丁基于 revision 0/)).toBeTruthy();
    expect(screen.getByTestId('designer-document').textContent).not.toContain('过期补丁');
  });

  it('shows compiler diagnostics and an empty inspector for invalid documents', () => {
    const invalid = createDocument();
    invalid.ui.root = 'missing';
    invalid.ui.nodes = [];
    render(<FormDesigner document={invalid} onChange={() => undefined} className="invalid-form" />);
    expect(screen.getByTestId('form-designer').className).toContain('invalid-form');
    expect(screen.getByRole('alert').textContent).toContain('编译诊断');
    expect(screen.getByText('选择一个节点以编辑属性。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('keeps sparse optional metadata editable through documented defaults', () => {
    const sparse = createDocument();
    sparse.schema.required = undefined;
    sparse.rules = [];
    sparse.dataSources = [];
    sparse.ui.nodes = [
      { id: 'root', kind: 'root', children: ['name'] },
      { id: 'name', kind: 'field', schemaPath: '/properties/name' },
    ];

    render(<DesignerHarness initial={sparse} />);
    fireEvent.click(screen.getByRole('button', { name: '结构' }));
    expect(screen.getByRole('treeitem', { name: '选择root' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: '选择name' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '属性' }));
    expect((screen.getByLabelText('字段标题') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('字段组件') as HTMLSelectElement).value).toBe('text');
    expect((screen.getByLabelText('栅格宽度') as HTMLSelectElement).value).toBe('12');

    fireEvent.click(screen.getByRole('button', { name: '校验' }));
    const required = screen.getByRole('checkbox', { name: '必填字段' });
    fireEvent.click(required);
    expect(screen.getByTestId('designer-document').textContent).toContain('"required":["name"]');
    fireEvent.click(required);
    expect(screen.getByTestId('designer-document').textContent).toContain('"required":[]');
  });

  it('fails closed for invalid mutations and safely removes cyclic unmapped nodes', () => {
    const invalid = createDocument();
    invalid.ui.root = 'missing-root';
    render(<FormDesigner document={invalid} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '添加数字字段' }));
    expect(screen.getByRole('alert')).toBeTruthy();

    const cyclic = createDocument();
    cyclic.rules = [];
    cyclic.ui.nodes = [
      { id: 'root', kind: 'root', label: '根节点', children: ['orphan'] },
      { id: 'orphan', kind: 'field', label: '孤立字段', children: ['orphan'] },
    ];
    let changed: FormDocument | undefined;
    const view = render(
      <FormDesigner
        document={cyclic}
        onChange={(next) => {
          changed = next;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '删除字段' }));
    expect(changed?.ui.nodes.map((node) => node.id)).toEqual(['root']);
    view.unmount();
  });
});
