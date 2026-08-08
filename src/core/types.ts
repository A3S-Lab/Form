export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JsonSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  type?: 'null' | 'boolean' | 'object' | 'array' | 'number' | 'integer' | 'string';
  title?: string;
  description?: string;
  default?: JsonValue;
  enum?: JsonValue[];
  const?: JsonValue;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  [keyword: string]: unknown;
}

export type UiNodeKind = 'root' | 'section' | 'group' | 'field' | 'repeater' | 'content';

export type UiLayout =
  | 'flow'
  | 'grid'
  | 'columns'
  | 'card'
  | 'tabs'
  | 'tab'
  | 'collapse'
  | 'collapse-panel';

export type UiPresentation = 'text' | 'divider' | 'spacer';

export interface UiOption {
  label: string;
  value: JsonPrimitive;
  disabled?: boolean;
}

export interface UiNode {
  id: string;
  kind: UiNodeKind;
  label?: string;
  description?: string;
  schemaPath?: string;
  widget?: string;
  children?: string[];
  columns?: 1 | 2 | 3 | 4 | 6 | 12;
  width?: 1 | 2 | 3 | 4 | 6 | 12;
  placeholder?: string;
  content?: string;
  layout?: UiLayout;
  presentation?: UiPresentation;
  gap?: 0 | 8 | 12 | 16 | 24 | 32;
  options?: UiOption[];
  customProps?: JsonObject;
  dataSource?: string;
  readOnly?: boolean;
  hidden?: boolean;
}

export interface FormUi {
  root: string;
  nodes: UiNode[];
}

export type FormExpression =
  | { op: 'literal'; value: JsonValue }
  | { op: 'field'; path: string }
  | { op: 'not'; value: FormExpression }
  | { op: 'all' | 'any'; values: FormExpression[] }
  | { op: 'coalesce' | 'concat'; values: FormExpression[] }
  | {
      op: 'if';
      condition: FormExpression;
      whenTrue: FormExpression;
      whenFalse: FormExpression;
    }
  | {
      op:
        | 'eq'
        | 'ne'
        | 'gt'
        | 'gte'
        | 'lt'
        | 'lte'
        | 'contains'
        | 'in'
        | 'add'
        | 'subtract'
        | 'multiply'
        | 'divide';
      left: FormExpression;
      right: FormExpression;
    }
  | { op: 'exists'; value: FormExpression };

export type FormRuleKind = 'visible' | 'enabled' | 'computed' | 'validate';

export interface FormRule {
  id: string;
  target: string;
  kind: FormRuleKind;
  expression: FormExpression;
  message?: string;
}

export interface DataSourceDefinition {
  id: string;
  registryKey: string;
  parameters?: JsonObject;
  cacheTtlMs?: number;
  dependencies?: string[];
  trigger?: 'mount' | 'focus';
  searchable?: boolean;
  debounceMs?: number;
  pageSize?: number;
}

export interface ActionDefinition {
  id: string;
  registryKey: string;
  label: string;
  tone?: 'primary' | 'secondary' | 'danger';
  payload?: JsonObject;
}

export interface FormMetadata {
  title: string;
  description?: string;
  locale?: string;
  tags?: string[];
  owner?: string;
  compatibility?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FormDocument {
  kind: 'a3s.form';
  apiVersion: 'a3s.dev/form/v1alpha1';
  schema: JsonSchema;
  ui: FormUi;
  rules?: FormRule[];
  dataSources?: DataSourceDefinition[];
  actions?: ActionDefinition[];
  metadata: FormMetadata;
  revision: number;
  digest?: string;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface FormDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path: string;
  hint?: string;
}

export interface CompilerLimits {
  maxSerializedBytes: number;
  maxNodes: number;
  maxDepth: number;
  maxRules: number;
  maxExpressionOperations: number;
  maxPatchOperations: number;
}

export interface CompilerCapabilities {
  widgets?: Iterable<string>;
  dataSources?: Iterable<string>;
  actions?: Iterable<string>;
}

export interface CompileOptions {
  capabilities?: CompilerCapabilities;
  limits?: Partial<CompilerLimits>;
  requireDigest?: boolean;
}

export interface CompiledNode extends UiNode {
  valuePath?: string;
  schema?: JsonSchema;
  depth: number;
}

export interface FormPlan {
  apiVersion: 'a3s.dev/form-plan/v1alpha1';
  schemaProfile: 'a3s.dev/form-schema-profile/1';
  sourceRevision: number;
  sourceDigest: string;
  metadata: FormMetadata;
  schema: JsonSchema;
  root: string;
  nodes: CompiledNode[];
  nodeById: Readonly<Record<string, CompiledNode>>;
  rules: FormRule[];
  expressionOperationLimit: number;
  dependencyOrder: string[];
  dataSources: DataSourceDefinition[];
  actions: ActionDefinition[];
}

export interface CompileResult {
  ok: boolean;
  document?: FormDocument;
  plan?: FormPlan;
  diagnostics: FormDiagnostic[];
}

export interface PatchPrecondition {
  path: string;
  exists?: boolean;
  equals?: JsonValue;
}

export type FormPatchOperation =
  | { op: 'set'; path: string; value: JsonValue }
  | { op: 'remove'; path: string }
  | { op: 'insert'; path: string; index: number; value: JsonValue }
  | { op: 'move'; from: string; path: string; index?: number };

export interface FormPatch {
  apiVersion: 'a3s.dev/form-patch/v1alpha1';
  baseRevision: number;
  description?: string;
  preconditions?: PatchPrecondition[];
  operations: FormPatchOperation[];
}

export interface PatchConflict {
  code: 'revision_mismatch' | 'precondition_failed' | 'invalid_operation';
  path: string;
  message: string;
}

export type ApplyPatchResult =
  | {
      ok: true;
      document: FormDocument;
      plan: FormPlan;
      diagnostics: FormDiagnostic[];
    }
  | {
      ok: false;
      conflicts: PatchConflict[];
      diagnostics: FormDiagnostic[];
    };

export interface FormRef {
  uri: string;
  revision: number;
  digest: string;
  mode: 'configuration' | 'interaction' | 'read-only';
}

export interface FieldError {
  path: string;
  code: string;
  message: string;
}

export type ComputedRuleTraceStatus = 'set' | 'removed' | 'unchanged' | 'error' | 'skipped';

export interface ComputedRuleTraceEntry {
  ruleId: string;
  target: string;
  path: string;
  dependencies: string[];
  status: ComputedRuleTraceStatus;
  previousValue?: JsonValue;
  nextValue?: JsonValue;
  error?: string;
}

export interface ComputedRuleEvaluationOptions {
  includeValues?: boolean;
}

export interface ComputedRuleEvaluation {
  value: JsonObject;
  trace: ComputedRuleTraceEntry[];
  errors: FieldError[];
}

export type FormValueEvaluation = ComputedRuleEvaluation;

export type AsyncValidationScope =
  | { kind: 'form' }
  | { kind: 'field'; nodeId: string; path: string };

export type AsyncValidationTrigger = 'blur' | 'submit';

export interface AsyncValidationIssue {
  path?: string;
  code: string;
  message: string;
}

export interface AsyncValidationRequest {
  plan: FormPlan;
  value: JsonObject;
  scope: AsyncValidationScope;
  trigger: AsyncValidationTrigger;
  locale: string;
}

export interface AsyncValidationResponse {
  issues: AsyncValidationIssue[];
}

export type FormAsyncValidator = (
  request: AsyncValidationRequest,
  signal: AbortSignal,
) => Promise<AsyncValidationResponse>;

export type AsyncValidationStatus = 'valid' | 'invalid' | 'cancelled' | 'unavailable';

export interface AsyncValidationOptions {
  scope?: AsyncValidationScope;
  trigger?: AsyncValidationTrigger;
  locale?: string;
}

export interface AsyncValidationEvaluation extends FormValueEvaluation {
  asyncErrors: FieldError[];
  status: AsyncValidationStatus;
}

export interface DataSourceRequest {
  definition: DataSourceDefinition;
  query?: string;
  cursor?: string;
  limit?: number;
  value: JsonObject;
  locale: string;
}

export interface DataSourcePage {
  options: UiOption[];
  nextCursor?: string;
}

export type DataSourceResponse = UiOption[] | DataSourcePage;

export interface ActionRequest {
  definition: ActionDefinition;
  value: JsonObject;
  plan: FormPlan;
}

export interface FormHostAdapter {
  resolveDataSource?: (
    request: DataSourceRequest,
    signal: AbortSignal,
  ) => Promise<DataSourceResponse>;
  validateValue?: FormAsyncValidator;
  // biome-ignore lint/suspicious/noConfusingVoidType: Host actions may intentionally return no payload.
  invokeAction?: (request: ActionRequest, signal: AbortSignal) => Promise<JsonValue | void>;
}

export interface CompileWorkerRequest {
  id: string;
  type: 'compile';
  document: FormDocument;
  options?: CompileOptions;
}

export interface CompileWorkerResponse {
  id: string;
  type: 'result';
  result: CompileResult;
}
