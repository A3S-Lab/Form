# A3S Form 架构

A3S Form 是可嵌入的 AI Native Form Designer。它把表单定义、可视化设计、运行时渲染和 Coding Agent 修改收敛到同一个、可版本化的 `FormDocument`，并把存储、权限、数据源和副作用留给宿主系统。

## 总体结构

```text
                 ┌─────────────────────────────────────────────┐
                 │             作者与 Coding Agent             │
                 │ 人工设计 / CLI / $a3s-form Skill / FormPatch │
                 └──────────────────────┬──────────────────────┘
                                        │ 受控变更
                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                             A3S Form                                     │
│                                                                          │
│  ┌──────────────┐       ┌──────────────────────┐       ┌──────────────┐  │
│  │ 中文 Designer │◄─────►│ canonical FormDocument│──────►│ 确定性编译器  │  │
│  │ 画布/结构/属性 │       │ schema/ui/rules/ref  │       │ 校验/依赖/摘要 │  │
│  └──────┬───────┘       └──────────────────────┘       └──────┬───────┘  │
│         │ 共享预览语义                               Web Worker │          │
│         └──────────────────────────────────────────────────────┤          │
│                                                               ▼          │
│                                                        immutable FormPlan │
│                                                               │          │
│                          ┌────────────────────────────────────┼────────┐  │
│                          ▼                    ▼               ▼        │  │
│                    React Renderer       Vue Adapter     Web Component  │  │
└──────────────────────────┬────────────────────┬───────────────┬─────────┘
                           └────────────────────┼───────────────┘
                                                │ controlled value/action
                         ┌──────────────────────┴──────────────────────┐
                         │                   宿主边界                  │
                         │ A3S Cloud / A3S Workflow / 独立产品         │
                         │ 权限、租户、存储、数据源、动作、审计、密钥    │
                         └─────────────────────────────────────────────┘
```

## 不变量

1. Designer 和 Renderer 都以同一编译器生成的 `FormPlan` 为准，预览与生产运行时不会各自解释原始 JSON。
2. `FormDocument` 是唯一表单定义源。`revision` 提供乐观版本，canonical SHA-256 `digest` 固定发布内容。
3. Renderer 是受控组件。值、错误、异步业务校验、持久化、身份和动作副作用均由宿主所有。
4. AI 只提交绑定 `baseRevision` 的类型化 `FormPatch`；校验通过后才能原子应用，并生成新 revision 与 digest。
5. 文档中不执行任意 JavaScript。组件、数据源和动作只通过宿主允许的 registry key 解析。

## 编译管线

```text
输入边界检查
  -> 结构与资源上限
  -> UI/schema 引用校验
  -> 规则依赖图与环检测
  -> 宿主 capability 校验
  -> 规范化与 canonical digest
  -> 深度冻结 FormDocument 与 FormPlan
```

`compiler-client` 可以把编译请求放进可取消 Web Worker。主线程只接收带请求 ID 的结果，过期响应不会覆盖最新文档。核心编译器无数据库、网络和 UI 依赖，因此也可以作为无状态任务在宿主的隔离运行环境中横向扩缩容。

## 表单文档

```text
FormDocument
├── schema          封闭的 A3S Form Schema Profile 1
├── ui              节点、布局、widget key、提示和选项
├── rules           visible/enabled/computed/validate 有界纯表达式
├── dataSources     宿主解析的声明式数据请求
├── actions         宿主解析的声明式动作
├── metadata        标题、语言、所有者和兼容信息
├── revision        单调递增版本
└── digest          可发布文档的 canonical SHA-256
```

表单值不属于 `FormDocument`。交互值由宿主控制，避免设计定义与租户业务数据混在同一个生命周期中。

## A3S Workflow 与 A3S Cloud

工作流只持有不可变的 `FormRef { uri, revision, digest, mode }`。节点配置使用 `configuration` 模式，持久化人工交互使用 `interaction` 模式。提交必须再次匹配 revision/digest，并通过对应 schema 校验，之后才能恢复工作流运行。

A3S Code 开发的 agentic 节点可以请求一个受治理的交互，但 Agent 不直接获得开放浏览器、数据库凭据或任意动作通道。A3S Cloud 通过 `createA3SCloudFormAdapter` 注入组织、项目、环境上下文和宿主回调；A3S Form 不复制 Cloud 的权限或存储模型。

## 扩展与扩缩容边界

| 部件 | 状态模型 | 建议部署方式 |
| --- | --- | --- |
| Core compiler / validation | 无状态、确定性 | Worker、本地进程或隔离 Runtime，可独立扩缩容 |
| React/Vue/Web Component Renderer | 客户端受控状态、可取消校验请求 | 随宿主前端嵌入 |
| Designer | 本地编辑状态 + 宿主文档 | 按需加载，保存交给宿主 |
| Data source / action registry | 宿主业务状态 | 由 A3S Cloud 或产品服务授权与扩缩容 |
| Workflow interaction | 耐久运行状态 | 由 A3S Workflow 持久化与恢复 |

这种分层让 Form 保持轻量可嵌入，同时允许宿主把无状态编译、数据源和动作分别放到合适的运行环境中。
