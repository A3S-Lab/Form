import { digestDocument, sealDocument } from './canonical';
import { expressionFieldPaths } from './expression';
import { getAtPointer, schemaPointerToValuePath } from './pointer';
import { A3S_FORM_SCHEMA_PROFILE_1_ID, inspectSchemaProfile } from './schema-profile';
import type {
  CompiledNode,
  CompileOptions,
  CompileResult,
  CompilerLimits,
  FormDiagnostic,
  FormDocument,
  FormExpression,
  FormPlan,
  FormRule,
  UiNode,
} from './types';

export const DEFAULT_COMPILER_LIMITS: CompilerLimits = Object.freeze({
  maxSerializedBytes: 1_000_000,
  maxNodes: 1_000,
  maxDepth: 32,
  maxRules: 1_000,
  maxExpressionOperations: 256,
  maxPatchOperations: 256,
});

export const DEFAULT_WIDGETS = Object.freeze([
  'text',
  'textarea',
  'number',
  'select',
  'radio',
  'checkbox',
  'switch',
  'date',
  'email',
  'password',
]);

function diagnostic(
  code: string,
  message: string,
  path: string,
  severity: FormDiagnostic['severity'] = 'error',
  hint?: string,
): FormDiagnostic {
  return { code, message, path, severity, hint };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function expressionSize(expression: FormExpression): number {
  if (expression.op === 'literal' || expression.op === 'field') return 1;
  if (expression.op === 'not' || expression.op === 'exists')
    return 1 + expressionSize(expression.value);
  if ('values' in expression) {
    return 1 + expression.values.reduce((total, item) => total + expressionSize(item), 0);
  }
  return 1 + expressionSize(expression.left) + expressionSize(expression.right);
}

function normalize(document: FormDocument): FormDocument {
  const normalized = structuredClone(document);
  normalized.metadata.locale ??= 'zh-CN';
  normalized.metadata.tags ??= [];
  normalized.rules ??= [];
  normalized.dataSources ??= [];
  normalized.actions ??= [];
  for (const node of normalized.ui.nodes) {
    if (node.kind !== 'field' && node.kind !== 'content') node.children ??= [];
    if (node.kind === 'field') node.widget ??= 'text';
    node.width ??= 12;
  }
  return sealDocument(normalized);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function inspectStructure(input: unknown, diagnostics: FormDiagnostic[]): input is FormDocument {
  if (!isRecord(input)) {
    diagnostics.push(diagnostic('document.type', '表单文档必须是 JSON 对象。', ''));
    return false;
  }
  if (input.kind !== 'a3s.form')
    diagnostics.push(diagnostic('document.kind', 'kind 必须是 a3s.form。', '/kind'));
  if (input.apiVersion !== 'a3s.dev/form/v1alpha1') {
    diagnostics.push(
      diagnostic(
        'document.api_version',
        '不支持的 apiVersion。',
        '/apiVersion',
        'error',
        '使用 a3s.dev/form/v1alpha1。',
      ),
    );
  }
  if (!isRecord(input.schema))
    diagnostics.push(diagnostic('schema.type', 'schema 必须是 JSON Schema 对象。', '/schema'));
  if (!isRecord(input.ui)) diagnostics.push(diagnostic('ui.type', 'ui 必须是对象。', '/ui'));
  else {
    if (typeof input.ui.root !== 'string')
      diagnostics.push(diagnostic('ui.root', 'ui.root 必须引用根节点 ID。', '/ui/root'));
    if (!Array.isArray(input.ui.nodes))
      diagnostics.push(diagnostic('ui.nodes', 'ui.nodes 必须是数组。', '/ui/nodes'));
  }
  if (!isRecord(input.metadata) || typeof input.metadata.title !== 'string') {
    diagnostics.push(
      diagnostic('metadata.title', 'metadata.title 必须是非空字符串。', '/metadata/title'),
    );
  }
  if (!Number.isSafeInteger(input.revision) || (input.revision as number) < 0) {
    diagnostics.push(diagnostic('document.revision', 'revision 必须是非负安全整数。', '/revision'));
  }
  return !diagnostics.some((item) => item.severity === 'error');
}

function ruleDependencyOrder(
  rules: FormRule[],
  nodes: Map<string, CompiledNode>,
  diagnostics: FormDiagnostic[],
): string[] {
  const byPath = new Map<string, string>();
  for (const node of nodes.values()) if (node.valuePath) byPath.set(node.valuePath, node.id);
  const graph = new Map<string, Set<string>>();
  for (const rule of rules) {
    graph.set(rule.target, graph.get(rule.target) ?? new Set());
    for (const path of expressionFieldPaths(rule.expression)) {
      const dependency = byPath.get(path);
      if (dependency && dependency !== rule.target) graph.get(rule.target)?.add(dependency);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];
  let cycle = false;
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      cycle = true;
      diagnostics.push(
        diagnostic(
          'rules.cycle',
          `规则依赖形成环：${id}。`,
          `/rules`,
          'error',
          '移除循环计算或可见性依赖。',
        ),
      );
      return;
    }
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  };
  for (const id of graph.keys()) visit(id);
  return cycle ? [] : order;
}

export function compileForm(input: unknown, options: CompileOptions = {}): CompileResult {
  const diagnostics: FormDiagnostic[] = [];
  if (!inspectStructure(input, diagnostics)) return { ok: false, diagnostics };
  const document = input as FormDocument;
  const limits = { ...DEFAULT_COMPILER_LIMITS, ...options.limits };
  const serialized = JSON.stringify(document);
  if (new TextEncoder().encode(serialized).byteLength > limits.maxSerializedBytes) {
    diagnostics.push(
      diagnostic('limits.document_size', `文档超过 ${limits.maxSerializedBytes} 字节限制。`, ''),
    );
  }
  diagnostics.push(...inspectSchemaProfile(document.schema));
  if (options.requireDigest && !document.digest) {
    diagnostics.push(diagnostic('digest.required', '发布态表单必须包含 digest。', '/digest'));
  }
  if (document.digest && document.digest !== digestDocument(document)) {
    diagnostics.push(
      diagnostic(
        'digest.mismatch',
        'digest 与当前文档内容不一致。',
        '/digest',
        'error',
        '重新封存文档后再发布。',
      ),
    );
  }

  const sourceNodes = document.ui.nodes;
  if (sourceNodes.length > limits.maxNodes) {
    diagnostics.push(
      diagnostic('limits.nodes', `节点数量超过 ${limits.maxNodes} 个限制。`, '/ui/nodes'),
    );
  }
  const nodes = new Map<string, CompiledNode>();
  for (const [index, node] of sourceNodes.entries()) {
    const path = `/ui/nodes/${index}`;
    if (!isRecord(node) || typeof node.id !== 'string' || !node.id.trim()) {
      diagnostics.push(diagnostic('node.id', '每个节点都必须有非空 id。', `${path}/id`));
      continue;
    }
    if (nodes.has(node.id)) {
      diagnostics.push(diagnostic('node.duplicate', `节点 ID ${node.id} 重复。`, `${path}/id`));
      continue;
    }
    if (!['root', 'section', 'group', 'field', 'repeater', 'content'].includes(node.kind)) {
      diagnostics.push(
        diagnostic('node.kind', `节点 ${node.id} 的 kind 不受支持。`, `${path}/kind`),
      );
      continue;
    }
    let schema: import('./types').JsonSchema | undefined;
    let valuePath: string | undefined;
    if (node.kind === 'field' || node.kind === 'repeater') {
      if (!node.schemaPath)
        diagnostics.push(
          diagnostic('node.schema_path', `节点 ${node.id} 缺少 schemaPath。`, `${path}/schemaPath`),
        );
      else {
        try {
          const resolvedSchema = getAtPointer(document.schema, node.schemaPath);
          valuePath = schemaPointerToValuePath(node.schemaPath);
          if (!isRecord(resolvedSchema) || !valuePath) {
            diagnostics.push(
              diagnostic(
                'node.schema_reference',
                `节点 ${node.id} 的 schemaPath 无效。`,
                `${path}/schemaPath`,
              ),
            );
          } else schema = resolvedSchema as import('./types').JsonSchema;
        } catch {
          diagnostics.push(
            diagnostic(
              'node.schema_reference',
              `节点 ${node.id} 的 schemaPath 不是有效 JSON Pointer。`,
              `${path}/schemaPath`,
            ),
          );
        }
      }
    }
    nodes.set(node.id, { ...(node as UiNode), schema, valuePath, depth: 0 });
  }
  if (!nodes.has(document.ui.root)) {
    diagnostics.push(diagnostic('ui.root_reference', 'ui.root 引用了不存在的节点。', '/ui/root'));
  }

  const customWidgets = options.capabilities?.widgets ?? [];
  const widgets = new Set<string>([...DEFAULT_WIDGETS, ...customWidgets]);
  const dataSourceCapabilities = new Set(options.capabilities?.dataSources ?? []);
  const actionCapabilities = new Set(options.capabilities?.actions ?? []);
  for (const [index, node] of sourceNodes.entries()) {
    if (!isRecord(node)) continue;
    if (node.widget && !widgets.has(node.widget)) {
      diagnostics.push(
        diagnostic('capability.widget', `未注册组件 ${node.widget}。`, `/ui/nodes/${index}/widget`),
      );
    }
    if (
      node.dataSource &&
      !(document.dataSources ?? []).some((item) => isRecord(item) && item.id === node.dataSource)
    ) {
      diagnostics.push(
        diagnostic(
          'node.data_source',
          `节点 ${node.id} 引用了不存在的数据源。`,
          `/ui/nodes/${index}/dataSource`,
        ),
      );
    }
    for (const child of node.children ?? []) {
      if (!nodes.has(child))
        diagnostics.push(
          diagnostic(
            'node.child_reference',
            `子节点 ${child} 不存在。`,
            `/ui/nodes/${index}/children`,
          ),
        );
    }
  }
  for (const [index, source] of (document.dataSources ?? []).entries()) {
    if (!isRecord(source) || typeof source.registryKey !== 'string') {
      diagnostics.push(
        diagnostic('data_source.definition', '数据源定义无效。', `/dataSources/${index}`),
      );
      continue;
    }
    if (dataSourceCapabilities.size > 0 && !dataSourceCapabilities.has(source.registryKey)) {
      diagnostics.push(
        diagnostic(
          'capability.data_source',
          `宿主未声明数据源能力 ${source.registryKey}。`,
          `/dataSources/${index}/registryKey`,
        ),
      );
    }
  }
  for (const [index, action] of (document.actions ?? []).entries()) {
    if (!isRecord(action) || typeof action.registryKey !== 'string') {
      diagnostics.push(diagnostic('action.definition', '动作定义无效。', `/actions/${index}`));
      continue;
    }
    if (actionCapabilities.size > 0 && !actionCapabilities.has(action.registryKey)) {
      diagnostics.push(
        diagnostic(
          'capability.action',
          `宿主未声明动作能力 ${action.registryKey}。`,
          `/actions/${index}/registryKey`,
        ),
      );
    }
  }

  const visiting = new Set<string>();
  const reached = new Set<string>();
  const walk = (id: string, depth: number): void => {
    if (visiting.has(id)) {
      diagnostics.push(diagnostic('layout.cycle', `布局节点 ${id} 形成循环。`, '/ui/nodes'));
      return;
    }
    const node = nodes.get(id);
    if (!node) return;
    if (depth > limits.maxDepth) {
      diagnostics.push(
        diagnostic('limits.depth', `布局深度超过 ${limits.maxDepth} 层限制。`, '/ui/nodes'),
      );
      return;
    }
    node.depth = Math.max(node.depth, depth);
    reached.add(id);
    visiting.add(id);
    for (const child of node.children ?? []) walk(child, depth + 1);
    visiting.delete(id);
  };
  walk(document.ui.root, 0);
  for (const id of nodes.keys()) {
    if (!reached.has(id))
      diagnostics.push(
        diagnostic('layout.unreachable', `节点 ${id} 不在根布局中。`, '/ui/nodes', 'warning'),
      );
  }

  const rules = document.rules ?? [];
  if (rules.length > limits.maxRules)
    diagnostics.push(
      diagnostic('limits.rules', `规则数量超过 ${limits.maxRules} 个限制。`, '/rules'),
    );
  const ruleIds = new Set<string>();
  const validRules: FormRule[] = [];
  for (const [index, rule] of rules.entries()) {
    if (
      !isRecord(rule) ||
      typeof rule.id !== 'string' ||
      typeof rule.target !== 'string' ||
      !isRecord(rule.expression)
    ) {
      diagnostics.push(diagnostic('rule.definition', '规则定义无效。', `/rules/${index}`));
      continue;
    }
    if (ruleIds.has(rule.id))
      diagnostics.push(
        diagnostic('rule.duplicate', `规则 ID ${rule.id} 重复。`, `/rules/${index}/id`),
      );
    ruleIds.add(rule.id);
    if (!nodes.has(rule.target))
      diagnostics.push(
        diagnostic('rule.target', `规则目标 ${rule.target} 不存在。`, `/rules/${index}/target`),
      );
    try {
      if (expressionSize(rule.expression) > limits.maxExpressionOperations) {
        diagnostics.push(
          diagnostic(
            'limits.expression',
            `规则 ${rule.id} 超过表达式操作数限制。`,
            `/rules/${index}/expression`,
          ),
        );
      }
      validRules.push(rule);
    } catch {
      diagnostics.push(
        diagnostic(
          'rule.expression',
          `规则 ${rule.id} 的表达式无效。`,
          `/rules/${index}/expression`,
        ),
      );
    }
  }
  const dependencyOrder = ruleDependencyOrder(validRules, nodes, diagnostics);
  if (diagnostics.some((item) => item.severity === 'error')) return { ok: false, diagnostics };

  const normalized = normalize(document);
  const normalizedNodes = normalized.ui.nodes.map((item) => {
    const compiled = nodes.get(item.id) as CompiledNode;
    return {
      ...item,
      schema: compiled.schema,
      valuePath: compiled.valuePath,
      depth: compiled.depth,
    };
  });
  const nodeById = Object.fromEntries(normalizedNodes.map((node) => [node.id, node]));
  const plan: FormPlan = {
    apiVersion: 'a3s.dev/form-plan/v1alpha1',
    schemaProfile: A3S_FORM_SCHEMA_PROFILE_1_ID,
    sourceRevision: normalized.revision,
    sourceDigest: normalized.digest as string,
    metadata: normalized.metadata,
    schema: normalized.schema,
    root: normalized.ui.root,
    nodes: normalizedNodes,
    nodeById,
    rules: normalized.rules ?? [],
    dependencyOrder,
    dataSources: normalized.dataSources ?? [],
    actions: normalized.actions ?? [],
  };
  return { ok: true, document: deepFreeze(normalized), plan: deepFreeze(plan), diagnostics };
}

export function assertCompiled(input: unknown, options?: CompileOptions): FormPlan {
  const result = compileForm(input, options);
  if (!result.ok || !result.plan) {
    const message = result.diagnostics
      .map((item) => `${item.path || '/'}: ${item.message}`)
      .join('\n');
    throw new Error(message || 'Form compilation failed.');
  }
  return result.plan;
}
