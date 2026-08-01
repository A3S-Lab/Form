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
