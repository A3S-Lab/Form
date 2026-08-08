import type {
  ActionDefinition,
  DataSourceDefinition,
  FormDocument,
  JsonObject,
  JsonSchema,
  UiNode,
  UiOption,
} from '../../../src/core';
import type { PlaygroundWorkspaceSeed } from './workspace';

export type WorkflowNodeKind =
  | 'start'
  | 'template'
  | 'llm'
  | 'agent'
  | 'tool'
  | 'router'
  | 'memory'
  | 'http'
  | 'approval'
  | 'output';

interface WorkflowFieldSpec {
  key: string;
  label: string;
  widget?: string;
  description?: string;
  placeholder?: string;
  width?: 1 | 2 | 3 | 4 | 6 | 12;
  options?: readonly UiOption[];
  readOnly?: boolean;
  dataSource?: string;
}

export interface WorkflowNodeDescriptorSnapshot {
  kind: WorkflowNodeKind;
  label: string;
  description: string;
  defaultConfig: JsonObject;
  properties: Record<string, JsonSchema>;
  required?: readonly string[];
  fields: readonly WorkflowFieldSpec[];
  dataSources?: readonly DataSourceDefinition[];
  note: string;
}

const workflowActions: ActionDefinition[] = [
  {
    id: 'save-draft',
    registryKey: 'host.save-draft.v1',
    label: '保存配置',
    tone: 'secondary',
  },
  {
    id: 'submit',
    registryKey: 'host.submit.v1',
    label: '应用到节点',
    tone: 'primary',
  },
];

function fieldId(kind: WorkflowNodeKind, key: string): string {
  return `${kind}-${key.replaceAll('_', '-')}`;
}

function createWorkflowForm(spec: WorkflowNodeDescriptorSnapshot): FormDocument {
  const rootId = `${spec.kind}-root`;
  const sectionId = `${spec.kind}-configuration`;
  const noteId = `${spec.kind}-contract-note`;
  const fieldNodes: UiNode[] = spec.fields.map((field) => ({
    id: fieldId(spec.kind, field.key),
    kind: 'field',
    label: field.label,
    description: field.description,
    schemaPath: `/properties/${field.key}`,
    widget: field.widget ?? 'text',
    placeholder: field.placeholder,
    width: field.width ?? 12,
    options: field.options ? [...field.options] : undefined,
    dataSource: field.dataSource,
    readOnly: field.readOnly,
  }));

  return {
    kind: 'a3s.form',
    apiVersion: 'a3s.dev/form/v1alpha1',
    metadata: {
      title: `${spec.label}节点配置`,
      description: spec.description,
      locale: 'zh-CN',
      tags: ['A3S Workflow', 'NodeDescriptor', spec.kind],
      owner: 'A3S Workflow',
      compatibility: ['a3s-workflow/v1'],
    },
    revision: 1,
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      title: `${spec.label}节点配置`,
      description: spec.description,
      default: structuredClone(spec.defaultConfig),
      properties: spec.properties,
      required: spec.required ? [...spec.required] : undefined,
      additionalProperties: false,
    },
    ui: {
      root: rootId,
      nodes: [
        {
          id: rootId,
          kind: 'root',
          label: `${spec.label}节点配置`,
          description: spec.description,
          columns: 12,
          gap: 16,
          children: [sectionId],
        },
        {
          id: sectionId,
          kind: 'section',
          label: '节点参数',
          description: '参数键、顺序和默认值与 a3s-workflow NodeDescriptor 保持一致。',
          layout: 'card',
          columns: 12,
          gap: 16,
          width: 12,
          children: [noteId, ...fieldNodes.map((field) => field.id)],
        },
        {
          id: noteId,
          kind: 'content',
          presentation: 'text',
          content: spec.note,
          width: 12,
        },
        ...fieldNodes,
      ],
    },
    rules: [],
    dataSources: spec.dataSources?.map((source) => structuredClone(source)) ?? [],
    actions: workflowActions,
  };
}

const methodOptions: readonly UiOption[] = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
];

export const workflowNodeDescriptors: readonly WorkflowNodeDescriptorSnapshot[] = [
  {
    kind: 'start',
    label: '开始',
    description: '定义工作流的初始输入参数。',
    defaultConfig: {},
    properties: {},
    fields: [],
    note: 'NodeDescriptor.default_config 为 {}。开始节点不声明额外配置，直接输出工作流输入。',
  },
  {
    kind: 'template',
    label: '模板转换',
    description: '使用 input.* 和 steps.<node>.* 变量构建 JSON。',
    defaultConfig: { value: { message: '你好，{{input.name}}！' } },
    properties: {
      value: {
        title: '输出值',
        description: '支持对象、数组、标量与工作流模板变量。',
        default: { message: '你好，{{input.name}}！' },
      },
    },
    required: ['value'],
    fields: [
      {
        key: 'value',
        label: '输出值（value）',
        widget: 'a3s.json',
        description: '默认值：{ "message": "你好，{{input.name}}！" }',
        width: 12,
      },
    ],
    note: '公开配置只包含 value；表单不会混入执行器兼容但描述符未公开的 template 参数。',
  },
  {
    kind: 'llm',
    label: '大语言模型',
    description: '通过 A3S Gateway 调用 OpenAI 兼容模型。',
    defaultConfig: { model: '', system: '', prompt: '{{input.prompt}}' },
    properties: {
      model: { type: 'string', title: '模型', default: '' },
      system: { type: 'string', title: '系统提示词', default: '' },
      prompt: {
        type: 'string',
        title: '用户提示词',
        minLength: 1,
        default: '{{input.prompt}}',
      },
    },
    required: ['prompt'],
    fields: [
      {
        key: 'model',
        label: '模型（model）',
        widget: 'select',
        dataSource: 'models',
        placeholder: '留空使用 Runtime 默认模型',
        width: 12,
      },
      {
        key: 'system',
        label: '系统提示词（system）',
        widget: 'textarea',
        placeholder: '定义模型角色和约束',
        width: 12,
      },
      {
        key: 'prompt',
        label: '用户提示词（prompt）',
        widget: 'textarea',
        placeholder: '{{input.prompt}}',
        width: 12,
      },
    ],
    dataSources: [
      {
        id: 'models',
        registryKey: 'playground.workflow.models',
        trigger: 'focus',
        searchable: true,
        debounceMs: 180,
        pageSize: 3,
        cacheTtlMs: 30_000,
      },
    ],
    note: '字段严格对应默认配置：model、system、prompt。',
  },
  {
    kind: 'agent',
    label: '智能体',
    description: '以隔离的 Runtime 任务运行有界模型与工具循环。',
    defaultConfig: { model: '', prompt: '{{input.prompt}}', maxIterations: 6, tools: [] },
    properties: {
      model: { type: 'string', title: '模型', default: '' },
      prompt: {
        type: 'string',
        title: '任务提示词',
        minLength: 1,
        default: '{{input.prompt}}',
      },
      maxIterations: {
        type: 'integer',
        title: '最大迭代次数',
        minimum: 1,
        maximum: 16,
        default: 6,
      },
      tools: {
        type: 'array',
        title: '工具定义',
        default: [],
        items: { type: 'object' },
      },
    },
    required: ['prompt', 'maxIterations', 'tools'],
    fields: [
      {
        key: 'model',
        label: '模型（model）',
        widget: 'select',
        dataSource: 'models',
        placeholder: '留空使用 Runtime 默认模型',
        width: 12,
      },
      {
        key: 'prompt',
        label: '任务提示词（prompt）',
        widget: 'textarea',
        placeholder: '{{input.prompt}}',
        width: 12,
      },
      {
        key: 'maxIterations',
        label: '最大迭代次数（maxIterations）',
        widget: 'number',
        description: '允许范围 1–16，默认 6。',
        width: 12,
      },
      {
        key: 'tools',
        label: '工具定义（tools）',
        widget: 'a3s.json',
        description: '默认值：[]',
        width: 12,
      },
    ],
    dataSources: [
      {
        id: 'models',
        registryKey: 'playground.workflow.models',
        trigger: 'focus',
        searchable: true,
        debounceMs: 180,
        pageSize: 3,
        cacheTtlMs: 30_000,
      },
    ],
    note: '字段严格对应默认配置：model、prompt、maxIterations、tools。',
  },
  {
    kind: 'tool',
    label: '工具',
    description: '使用密钥引用调用白名单中的工具端点。',
    defaultConfig: { method: 'POST', endpoint: 'https://api.example.com', body: {} },
    properties: {
      method: {
        type: 'string',
        title: '请求方法',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        default: 'POST',
      },
      endpoint: {
        type: 'string',
        title: '工具端点',
        format: 'uri',
        minLength: 1,
        default: 'https://api.example.com',
      },
      body: { title: '请求体', default: {} },
    },
    required: ['method', 'endpoint', 'body'],
    fields: [
      { key: 'method', label: '请求方法（method）', widget: 'select', options: methodOptions },
      {
        key: 'endpoint',
        label: '工具端点（endpoint）',
        placeholder: 'https://api.example.com',
      },
      { key: 'body', label: '请求体（body）', widget: 'a3s.json' },
    ],
    note: '字段严格对应默认配置：method、endpoint、body。',
  },
  {
    kind: 'router',
    label: '条件分支',
    description: '根据类型化条件选择一个具名执行分支。',
    defaultConfig: { routes: [], default: 'default' },
    properties: {
      routes: {
        type: 'array',
        title: '分支规则',
        default: [],
        items: {
          type: 'object',
          properties: {
            when: {
              type: 'object',
              properties: { value: {}, equals: {} },
              required: ['value'],
            },
            route: { type: 'string', minLength: 1 },
          },
          required: ['when', 'route'],
        },
      },
      default: { type: 'string', title: '默认分支', minLength: 1, default: 'default' },
    },
    required: ['routes', 'default'],
    fields: [
      {
        key: 'routes',
        label: '分支规则（routes）',
        widget: 'a3s.json',
        description: '默认值：[]',
      },
      {
        key: 'default',
        label: '默认分支（default）',
        placeholder: 'default',
      },
    ],
    note: '字段严格对应默认配置：routes、default。',
  },
  {
    kind: 'memory',
    label: '记忆',
    description: '通过 PostgreSQL 支持的 A3S Memory 边界存取智能体记忆。',
    defaultConfig: { operation: 'search', query: '{{input.query}}', limit: 5 },
    properties: {
      operation: {
        type: 'string',
        title: '操作',
        enum: ['search'],
        default: 'search',
      },
      query: { type: 'string', title: '检索词', default: '{{input.query}}' },
      limit: { type: 'integer', title: '结果数量', minimum: 1, default: 5 },
    },
    required: ['operation', 'query', 'limit'],
    fields: [
      {
        key: 'operation',
        label: '操作（operation）',
        widget: 'select',
        options: [{ label: '检索记忆', value: 'search' }],
      },
      {
        key: 'query',
        label: '检索词（query）',
        placeholder: '{{input.query}}',
      },
      { key: 'limit', label: '结果数量（limit）', widget: 'number' },
    ],
    note: '当前 NodeDescriptor 公开 search 配置：operation、query、limit；不补造其他操作参数。',
  },
  {
    kind: 'http',
    label: 'HTTP 请求',
    description: '以持久化步骤调用白名单中的 HTTP 端点。',
    defaultConfig: { method: 'GET', url: 'https://api.example.com' },
    properties: {
      method: {
        type: 'string',
        title: '请求方法',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        default: 'GET',
      },
      url: {
        type: 'string',
        title: '请求 URL',
        format: 'uri',
        minLength: 1,
        default: 'https://api.example.com',
      },
    },
    required: ['method', 'url'],
    fields: [
      { key: 'method', label: '请求方法（method）', widget: 'select', options: methodOptions },
      {
        key: 'url',
        label: '请求 URL（url）',
        placeholder: 'https://api.example.com',
      },
    ],
    note: '字段严格对应默认配置：method、url。',
  },
  {
    kind: 'approval',
    label: '人工审批',
    description: '暂停持久化运行，等待人工响应。',
    defaultConfig: { message: '是否批准本次运行？' },
    properties: {
      message: {
        type: 'string',
        title: '审批提示',
        minLength: 1,
        default: '是否批准本次运行？',
      },
    },
    required: ['message'],
    fields: [
      {
        key: 'message',
        label: '审批提示（message）',
        widget: 'textarea',
        placeholder: '是否批准本次运行？',
      },
    ],
    note: '公开配置只包含 message，不混入执行器内部兼容字段。',
  },
  {
    kind: 'output',
    label: '结束',
    description: '使用上游结果完成本次运行。',
    defaultConfig: {},
    properties: {},
    fields: [],
    note: 'NodeDescriptor.default_config 为 {}。结束节点默认直接使用上游结果。',
  },
];

export const workflowNodeKinds: readonly WorkflowNodeKind[] = workflowNodeDescriptors.map(
  (descriptor) => descriptor.kind,
);

export const workflowFormSeeds: readonly PlaygroundWorkspaceSeed[] = workflowNodeDescriptors.map(
  (descriptor) => ({
    id: `workflow-${descriptor.kind}-config`,
    seedVersion: 3,
    document: createWorkflowForm(descriptor),
  }),
);
