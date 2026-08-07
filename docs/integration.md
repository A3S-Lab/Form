# A3S Form 集成指南

## React

```tsx
import { FormDesigner, FormRenderer } from '@a3s-lab/form/react';
import { assertCompiled, type FormDocument, type JsonObject } from '@a3s-lab/form/core';
import '@a3s-lab/form/styles.css';

const plan = assertCompiled(document);

<FormDesigner
  document={document}
  value={previewValue}
  onChange={setDocument}
  onValueChange={setPreviewValue}
  onAction={handleAction}
/>

<FormRenderer
  plan={plan}
  value={value}
  errors={errors}
  onChange={setValue}
  onAction={handleAction}
/>
```

`FormDesigner` 和 `FormRenderer` 都是受控接口。宿主应保存新文档/值，不要依赖组件内部状态作为业务事实源。

### A3S UI 样式契约

`@a3s-lab/form` 精确依赖已发布的 `@a3s-lab/ui@0.2.0`。构建产物会把预编译 UI 基础样式与 Form 自身样式合并到 `@a3s-lab/form/styles.css`，因此嵌入 Designer 或 Renderer 时只导入这一份样式。

Renderer 使用 `field`、`fieldset`、`input`、`select`、`btn`、`tabs`、`accordion` 和 `card` 契约；Designer 与 Playground 进一步使用 `workspace-header` 和 `app-shell`。原有 `a3s-form-*` 类继续保留，宿主已有的选择器和自动化测试不需要迁移。

### 自定义表单节点

`FormNodeRegistry` 把一个业务节点的组件目录、默认 Schema、设计态渲染、专属配置面板和运行态渲染收敛为同一份注册定义。文档只保存 registry key 与 JSON 配置，不保存或执行任意 JavaScript。

```tsx
import {
  defineFormNodeRegistry,
  type FormNodeDesignProps,
  type FormNodeInspectorProps,
  type FormNodeRenderProps,
} from '@a3s-lab/form/react';

const nodeRegistry = defineFormNodeRegistry({
  'company.rating': {
    kind: 'field',
    catalog: {
      section: 'business',
      sectionLabel: '业务组件',
      label: '评分',
      description: '采集满意度评分',
      glyph: '★',
    },
    schema: { type: 'number', minimum: 1, maximum: 5 },
    defaults: { width: 6, customProps: { maximum: 5 } },
    design: RatingDesign,
    inspector: RatingInspector,
    render: RatingNode,
  },
});

function RatingDesign({ node }: FormNodeDesignProps) {
  return <div>{node.label} · ☆☆☆☆☆</div>;
}

function RatingInspector({ node, onUpdate }: FormNodeInspectorProps) {
  return (
    <input
      value={Number(node.customProps?.maximum ?? 5)}
      onChange={(event) => {
        const maximum = Number(event.target.value);
        onUpdate({
          node: { customProps: { maximum } },
          schema: { maximum },
        });
      }}
    />
  );
}

function RatingNode({ node, value, onChange }: FormNodeRenderProps) {
  return (
    <button type="button" onClick={() => onChange(5)}>
      {node.label}：{String(value ?? 0)} 星
    </button>
  );
}

const plan = assertCompiled(document, {
  capabilities: { widgets: Object.keys(nodeRegistry) },
});

<FormDesigner document={document} onChange={setDocument} nodeRegistry={nodeRegistry} />;
<FormRenderer plan={plan} value={value} onChange={setValue} nodeRegistry={nodeRegistry} />;
```

`field` 与 `repeater` 类型的自定义节点会创建 Schema 绑定；`content` 用于无值展示节点；`group` 与 `section` 可继续接收子节点和跨容器拖放。配置同时影响节点与 Schema 时，应使用原子 `onUpdate({ node, schema })`；单侧更新仍可使用 `onUpdateNode` 或 `onUpdateSchema`。未在能力列表中声明的 registry key 会被编译器拒绝。

## Vue 3

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { A3SFormRenderer } from '@a3s-lab/form/vue';

const value = ref({});
</script>

<template>
  <A3SFormRenderer
    :plan="plan"
    v-model="value"
    @action="({ actionId, value }) => handleAction(actionId, value)"
  />
</template>
```

Vue adapter 会先解除 Vue reactive proxy，再把普通对象传入只读编译计划和 React 内核，避免结构化克隆边界出错。

## Web Component

```ts
import { defineA3SFormElements } from '@a3s-lab/form/web-component';

defineA3SFormElements();
const renderer = document.querySelector('a3s-form-renderer');
renderer.plan = plan;
renderer.value = value;
renderer.addEventListener('value-change', (event) => save(event.detail));
renderer.addEventListener('form-action', (event) => invoke(event.detail));
```

提供 `<a3s-form-renderer>` 和 `<a3s-form-designer>`，注册函数可重复调用。事件使用 `bubbles: true` 与 `composed: true`，可以穿过常见组件边界。

## A3S Cloud

```ts
import { createA3SCloudFormAdapter } from '@a3s-lab/form/cloud';

const hostAdapter = createA3SCloudFormAdapter({
  context: { organizationId, projectId, environmentId, locale: 'zh-CN' },
  resolveDataSource: (context, request, signal) =>
    cloud.forms.resolveOptions(context, request, signal),
  invokeAction: (context, request, signal) =>
    cloud.forms.invokeAction(context, request, signal),
});
```

Cloud adapter 只绑定上下文。鉴权、租户隔离、限流、存储、密钥和审计继续由 A3S Cloud 负责，避免产生第二套平台模型。

## A3S Workflow

```ts
import {
  createInteractionRequest,
  createWorkflowFormBinding,
  validateInteractionSubmission,
} from '@a3s-lab/form/workflow';

const binding = createWorkflowFormBinding(configurationFormRef, nodeConfiguration);
const request = createInteractionRequest(runId, nodeId, interactionFormRef, {
  initialValue,
  expiresAt,
});
const result = validateInteractionSubmission(publishedDocument, submission);
```

`FormRef` 必须固定 `revision` 和 `digest`。工作流运行打开交互后，即使表单后来发布了新版本，当前提交仍按最初固定的表单校验。

## CLI 与 Coding Agent Skill

构建后可以直接运行：

```bash
node dist/cli.js sample --output form.json --pretty
node dist/cli.js validate form.json --pretty
node dist/cli.js compile form.json --output plan.json --pretty
node dist/cli.js diff before.json after.json --output change.patch.json --pretty
node dist/cli.js patch form.json change.patch.json --output candidate.json --pretty
```

`skills/a3s-form` 提供 `$a3s-form` Skill。Coding Agent 应通过 CLI 校验文档、生成/审阅 revision-bound `FormPatch`，不要模拟点击设计器或直接改写 digest。

## Worker 编译

```ts
import { FormCompilerClient } from '@a3s-lab/form';

const worker = new Worker(
  new URL('@a3s-lab/form/compiler.worker.js', import.meta.url),
  { type: 'module' },
);
const compiler = new FormCompilerClient(worker);
const result = await compiler.compile(document, options, abortSignal);
compiler.dispose();
```

每次请求都带唯一 ID；取消或释放客户端会拒绝对应 Promise，并忽略不匹配的 Worker 响应。
