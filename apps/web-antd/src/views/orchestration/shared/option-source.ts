/**
 * 统一的「选项数据源」模型与加载器。
 *
 * 背景：级联、下拉、单选、多选各自从 `optionItems` 静态取数，用户 / 部门组件则各自
 * 硬编码调用身份接口——三套取数逻辑、两种数据形态，既用不上逻辑编排，也没法统一配置。
 *
 * 这里把「选项从哪来」抽象成 `OptionDataSource`：
 * - `static`  —— 设计器里手写的 optionItems（原有行为，默认值）
 * - `builtin` —— 平台内置提供者（用户、部门）
 * - `flow`    —— 逻辑编排流程出参（可映射字段、可传参、可组树）
 *
 * 三种来源最终都归一到 `OptionNode[]`，渲染层只认这一个结构。
 * 加载器**全程不抛异常**：失败返回 `{ ok: false, error }`，由调用方决定展示与降级。
 */
import type { DeptTreeNode } from './org-options';

import { runLogicApi } from '#/api/saas/orchestration';

import { loadDeptTree, loadUserOptions } from './org-options';
import { safeJsonStringify } from './safe-json';

export type OptionSourceKind = 'builtin' | 'flow' | 'static';

/** 平台内置的数据提供者 */
export type OptionProvider = 'dept' | 'user';

/** 统一选项节点：下拉、单选、多选、级联、树全部渲染它 */
export interface OptionNode {
  label: string;
  value: unknown;
  disabled?: boolean;
  children?: OptionNode[];
}

/**
 * 选项数据源定义（持久化在 `widget.options.dataSource` / `field.controlProps.optionSource`）。
 *
 * 只写入用户真正配置过的键，未配置的走运行时默认值——避免存量表单定义被默认值污染。
 */
export interface OptionDataSource {
  kind: OptionSourceKind;
  /** kind=builtin：使用哪个内置提供者 */
  provider?: OptionProvider;
  /** kind=flow：已发布流程的 flowKey */
  flowKey?: string;
  /** kind=flow：调用入参；值是模板串，`{{字段}}` 与 `{{form.字段}}` 等价 */
  params?: Record<string, string>;
  /** 出参字段映射，默认 label / value / children */
  labelField?: string;
  valueField?: string;
  childrenField?: string;
  /** 出参是扁平列表时，用它指定父级字段，前端组装成树 */
  parentField?: string;
  /**
   * 组树时「顶层节点的父值」。父值为空、或等于该值，即视为根节点。
   * 适用于 `parent_id = 0` 这类哨兵约定；若某个真实节点 id 恰好等于它，
   * 该约定优先，请改用自引用根（`pid = id`）或空父值。
   */
  rootValue?: string;
}

export type OptionLoadResult =
  | { error: string; nodes: OptionNode[]; ok: false }
  | { nodes: OptionNode[]; ok: true };

export interface LoadOptionInput {
  source: OptionDataSource;
  /** kind=static 时使用 */
  optionItems?: unknown;
  /** 入参模板取值作用域，通常传 `{ form: 当前表单模型, field: 字段名 }` */
  scope?: Record<string, unknown>;
}

/** 支持数据源的控件：选项类 + 用户 / 部门。注意 `tree` 是「子表行容器」，不是选项树。 */
const OPTION_WIDGET_TYPES = new Set([
  'cascader',
  'checkbox',
  'dept-picker',
  'radio',
  'select',
  'user-picker',
]);

const BUILTIN_BY_WIDGET: Record<string, OptionProvider> = {
  'dept-picker': 'dept',
  'user-picker': 'user',
};

/**
 * 运行态表单用的 control 名 → vform 组件名。
 *
 * 同一件事两套命名（设计态 `user-picker` / 运行态 `userPicker`），
 * 这里统一收敛，避免每个调用点各自判断。
 */
const CONTROL_ALIAS: Record<string, string> = {
  deptPicker: 'dept-picker',
  userPicker: 'user-picker',
};

function canonicalType(type: string): string {
  return CONTROL_ALIAS[type] ?? type;
}

/** 出参组树的深度上限，防脏数据把界面递归卡死 */
const MAX_TREE_DEPTH = 32;

/** 单引号内的整串占位符：保留原类型（数字仍是数字） */
const WHOLE_TEMPLATE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
const TEMPLATE = /\{\{\s*([^}]+?)\s*\}\}/g;

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function nonEmpty(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isOptionWidget(type: string): boolean {
  return OPTION_WIDGET_TYPES.has(canonicalType(type));
}

/** 控件类型对应的内置提供者——user-picker / dept-picker 的既有行为，现作为数据源默认值 */
export function builtinProviderFor(type: string): OptionProvider | undefined {
  return BUILTIN_BY_WIDGET[canonicalType(type)];
}

function normalizeParams(raw: unknown): Record<string, string> | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const name = key.trim();
    if (!name || value === null || value === undefined) continue;
    out[name] = asText(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 解析已持久化的数据源定义；非法或缺失返回 null。 */
export function normalizeOptionSource(raw: unknown): null | OptionDataSource {
  if (!isPlainRecord(raw)) return null;
  const provider =
    raw.provider === 'dept' || raw.provider === 'user'
      ? raw.provider
      : undefined;
  const flowKey = nonEmpty(raw.flowKey);
  const params = normalizeParams(raw.params);
  const labelField = nonEmpty(raw.labelField);
  const valueField = nonEmpty(raw.valueField);
  const childrenField = nonEmpty(raw.childrenField);
  const parentField = nonEmpty(raw.parentField);
  const rootValue = nonEmpty(raw.rootValue);
  return {
    kind: raw.kind === 'flow' || raw.kind === 'builtin' ? raw.kind : 'static',
    ...(provider ? { provider } : {}),
    ...(flowKey ? { flowKey } : {}),
    ...(params ? { params } : {}),
    ...(labelField ? { labelField } : {}),
    ...(valueField ? { valueField } : {}),
    ...(childrenField ? { childrenField } : {}),
    ...(parentField ? { parentField } : {}),
    ...(rootValue ? { rootValue } : {}),
  };
}

/**
 * 解析控件实际生效的数据源。
 *
 * 显式配置优先；未配置时按控件类型给默认值——用户 / 部门走内置提供者，其余保持静态。
 * 这样存量表单（没有 dataSource 字段）行为完全不变。
 *
 * 第二个参数允许传「设计态 widget.options」（键为 `dataSource`）或
 * 「运行态 field.controlProps」（键为 `optionSource`），两种载体都能识别。
 */
export function resolveOptionSource(
  widgetType: string,
  options?: null | Record<string, any>,
): OptionDataSource {
  const declared = normalizeOptionSource(
    options?.dataSource ?? options?.optionSource,
  );
  if (declared) return declared;
  const provider = builtinProviderFor(widgetType);
  return provider ? { kind: 'builtin', provider } : { kind: 'static' };
}

/** 是否值得把数据源写进表单定义：显式配置过，或本身带内置提供者 */
export function shouldEmitOptionSource(
  widgetType: string,
  options?: null | Record<string, any>,
): boolean {
  if (normalizeOptionSource(options?.dataSource)) return true;
  return !!builtinProviderFor(widgetType);
}

/* ------------------------------- 静态选项 ------------------------------- */

function staticNode(item: unknown): null | OptionNode {
  if (!isPlainRecord(item)) return null;
  const value = item.value;
  if (value === null || value === undefined) return null;
  const children = staticOptionNodes(item.children);
  return {
    label: asText(item.label ?? value),
    // 刻意保留原始类型：设计器里 value 可能是数字，不能被统一成字符串
    value,
    ...(item.disabled === true ? { disabled: true } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

/** 静态 `optionItems` → 统一节点（保留 value 原类型与 children 结构） */
export function staticOptionNodes(optionItems: unknown): OptionNode[] {
  if (!Array.isArray(optionItems)) return [];
  const out: OptionNode[] = [];
  for (const item of optionItems) {
    const node = staticNode(item);
    if (node) out.push(node);
  }
  return out;
}

/* ------------------------------- 出参映射 ------------------------------- */

/** 读字段，支持 `a.b` 点路径 */
function readField(row: Record<string, unknown>, field: string): unknown {
  if (!field.includes('.')) return row[field];
  let current: unknown = row;
  for (const part of field.split('.')) {
    if (!isPlainRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function rowToNode(
  row: Record<string, unknown>,
  labelField: string,
  valueField: string,
  childrenField: string,
  depth: number,
): null | OptionNode {
  const value = readField(row, valueField);
  if (value === null || value === undefined || value === '') return null;
  const node: OptionNode = {
    label: asText(readField(row, labelField) ?? value),
    value,
  };
  if (depth >= MAX_TREE_DEPTH) return node;
  const nested = readField(row, childrenField);
  if (!Array.isArray(nested)) return node;
  const children: OptionNode[] = [];
  for (const child of nested) {
    if (!isPlainRecord(child)) continue;
    const parsed = rowToNode(
      child,
      labelField,
      valueField,
      childrenField,
      depth + 1,
    );
    if (parsed) children.push(parsed);
  }
  if (children.length > 0) node.children = children;
  return node;
}

interface FlatEntry {
  key: string;
  node: OptionNode;
  parent: unknown;
}

function flatKey(value: unknown): string {
  return value === null || value === undefined || value === ''
    ? ''
    : String(value);
}

/** 沿父链上溯判断是否成环（脏数据保护，避免死循环） */
function isCyclic(entry: FlatEntry, index: Map<string, FlatEntry>): boolean {
  const seen = new Set<string>([entry.key]);
  let current = entry;
  for (let depth = 0; depth < MAX_TREE_DEPTH; depth += 1) {
    const parentKey = flatKey(current.parent);
    // 父值为空：正常到顶
    if (!parentKey) return false;
    // 自引用（pid = id）是合法的单根写法，到它就是到顶
    if (parentKey === current.key) return false;
    if (seen.has(parentKey)) return true;
    seen.add(parentKey);
    const next = index.get(parentKey);
    // 父级不存在：按孤儿处理，降级为根
    if (!next) return false;
    current = next;
  }
  // 超过深度上限，视为异常数据
  return true;
}

/** 扁平列表按 parentField 组装成树；找不到父级或成环的节点降级为根，保证不丢数据。 */
function buildTreeFromFlat(
  rows: Record<string, unknown>[],
  source: OptionDataSource,
): OptionNode[] {
  const labelField = source.labelField || 'label';
  const valueField = source.valueField || 'value';
  const parentField = source.parentField || 'parentId';
  const rootKey = flatKey(source.rootValue);
  const entries: FlatEntry[] = [];
  for (const row of rows) {
    const value = readField(row, valueField);
    if (value === null || value === undefined || value === '') continue;
    entries.push({
      key: String(value),
      node: {
        label: asText(readField(row, labelField) ?? value),
        value,
      },
      parent: readField(row, parentField),
    });
  }
  const index = new Map<string, FlatEntry>();
  for (const entry of entries) index.set(entry.key, entry);

  const roots: OptionNode[] = [];
  for (const entry of entries) {
    const parentKey = flatKey(entry.parent);
    const isRoot = parentKey === '' || (!!rootKey && parentKey === rootKey);
    const parent = isRoot ? undefined : index.get(parentKey);
    if (!parent || parent.key === entry.key || isCyclic(entry, index)) {
      roots.push(entry.node);
      continue;
    }
    parent.node.children = [...(parent.node.children || []), entry.node];
  }
  return roots;
}

/** 出参行 → 选项节点。支持嵌套 children，或用 parentField 把扁平列表组装成树。 */
export function mapRowsToNodes(
  rows: unknown[],
  source: OptionDataSource,
): OptionNode[] {
  const list = rows.filter((row) => isPlainRecord(row));
  if (source.parentField) return buildTreeFromFlat(list, source);
  const labelField = source.labelField || 'label';
  const valueField = source.valueField || 'value';
  const childrenField = source.childrenField || 'children';
  const out: OptionNode[] = [];
  for (const row of list) {
    const node = rowToNode(row, labelField, valueField, childrenField, 0);
    if (node) out.push(node);
  }
  return out;
}

/** 从流程出参里提出行数组，尽量不挑形状（数组本身，或 rows / items / list / data 里的数组）。 */
export function extractRows(data: unknown): null | Record<string, unknown>[] {
  if (Array.isArray(data)) {
    const rows = data.filter((row) => isPlainRecord(row));
    return rows.length > 0 || data.length === 0 ? rows : null;
  }
  if (isPlainRecord(data)) {
    for (const key of ['rows', 'items', 'list', 'data']) {
      const value = data[key];
      if (Array.isArray(value)) {
        return value.filter((row) => isPlainRecord(row));
      }
    }
  }
  return null;
}

/* ------------------------------- 入参模板 ------------------------------- */

/**
 * 取作用域里的值，支持 `a.b` 点路径。
 *
 * 作用域形如 `{ field, form }`。为了让模板写起来自然，`{{字段名}}` 与
 * `{{form.字段名}}` 等价：直接命中失败后再到 `form` 里找一次。
 */
export function readScopeValue(
  scope: Record<string, unknown> | undefined,
  path: string,
): unknown {
  const key = path.trim();
  if (!key || !scope) return undefined;
  const direct = readField(scope, key);
  if (direct !== undefined) return direct;
  if (!isPlainRecord(scope.form)) return undefined;
  const inner = key.startsWith('form.') ? key.slice(5).trim() : key;
  return inner ? readField(scope.form, inner) : undefined;
}

/**
 * 渲染单个入参模板。
 *
 * 整串就是一个占位符时保留原类型（`{{amount}}` 传数字而非字符串）；
 * 混排在文本里则按字符串拼接。
 */
export function renderParamValue(
  text: string,
  scope?: Record<string, unknown>,
): unknown {
  const whole = WHOLE_TEMPLATE.exec(text);
  if (whole?.[1]) return readScopeValue(scope, whole[1]);
  return text.replaceAll(TEMPLATE, (_match, expr: string) =>
    asText(readScopeValue(scope, expr)),
  );
}

export function renderParams(
  params: Record<string, string> | undefined,
  scope?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params || {})) {
    out[key] = renderParamValue(value, scope);
  }
  return out;
}

/** 入参指纹：指纹未变就不必重新请求流程（避免重复取数与抖动） */
export function paramsFingerprint(
  source: OptionDataSource,
  scope?: Record<string, unknown>,
): string {
  if (!source.params || Object.keys(source.params).length === 0) return '';
  return safeJsonStringify(renderParams(source.params, scope));
}

/**
 * 模板表达式 → 它实际依赖的表单字段名。
 *
 * `{{form.a}}` 与 `{{a}}` 都指表单字段 a；`{{field}}` 是当前字段名而非模型值，忽略。
 */
function modelFieldOf(expr: string): string | undefined {
  const key = expr.trim();
  if (!key || key === 'field') return undefined;
  const inner = key.startsWith('form.') ? key.slice(5).trim() : key;
  return inner.split('.')[0]?.trim() || undefined;
}

/**
 * 入参模板里被引用的顶层字段名。
 *
 * 用于判断「哪些字段变化需要重新取数」——只监听真正被引用的字段，
 * 而不是整个表单模型，避免每次敲键盘都触发取数判定。
 */
export function templateFields(
  params: Record<string, string> | undefined,
): string[] {
  const fields = new Set<string>();
  for (const text of Object.values(params || {})) {
    for (const match of text.matchAll(TEMPLATE)) {
      const field = modelFieldOf(match[1] || '');
      if (field) fields.add(field);
    }
  }
  return [...fields];
}

/* --------------------------------- 加载 --------------------------------- */

function deptNodeToOption(node: DeptTreeNode): OptionNode {
  const children = node.children?.map((child) => deptNodeToOption(child)) ?? [];
  return {
    label: node.title,
    value: node.value,
    ...(children.length > 0 ? { children } : {}),
  };
}

async function loadBuiltin(
  provider?: OptionProvider,
): Promise<OptionLoadResult> {
  if (provider === 'dept') {
    const tree = await loadDeptTree();
    return { nodes: tree.map((node) => deptNodeToOption(node)), ok: true };
  }
  if (provider === 'user') {
    const items = await loadUserOptions();
    return {
      nodes: items.map((item) => ({ label: item.label, value: item.value })),
      ok: true,
    };
  }
  return { error: '未指定内置数据提供者（用户 / 部门）', nodes: [], ok: false };
}

/** 同参数请求合并：多行/多字段共用同一数据源时只打一次流程 */
const inflight = new Map<string, Promise<OptionLoadResult>>();

function buildFlowPayload(
  source: OptionDataSource,
  scope?: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...renderParams(source.params, scope),
  };
  if (scope?.form !== undefined) payload.form = scope.form;
  if (scope?.field !== undefined) payload.field = scope.field;
  return payload;
}

async function loadFromFlow(
  source: OptionDataSource,
  scope?: Record<string, unknown>,
): Promise<OptionLoadResult> {
  const flowKey = source.flowKey?.trim();
  if (!flowKey)
    return { error: '数据源未绑定逻辑编排流程', nodes: [], ok: false };
  const payload = buildFlowPayload(source, scope);
  const dedupeKey = `${flowKey}::${safeJsonStringify(payload)}`;
  const cached = inflight.get(dedupeKey);
  if (cached) return cached;

  const pending = runLogicApi(flowKey, payload)
    .then((res): OptionLoadResult => {
      if (res?.success === false) {
        return { error: res.error || '逻辑编排执行失败', nodes: [], ok: false };
      }
      const rows = extractRows(res?.data);
      if (!rows) {
        return {
          error: '流程未返回数组：出参请为数组，或对象中的 rows / items',
          nodes: [],
          ok: false,
        };
      }
      return { nodes: mapRowsToNodes(rows, source), ok: true };
    })
    .catch((error: unknown): OptionLoadResult => ({
      error: error instanceof Error ? error.message : String(error),
      nodes: [],
      ok: false,
    }))
    .finally(() => {
      inflight.delete(dedupeKey);
    });
  inflight.set(dedupeKey, pending);
  return pending;
}

/**
 * 统一加载入口。任何来源、任何异常都以结果对象返回，绝不抛出。
 */
export async function loadOptionNodes(
  input: LoadOptionInput,
): Promise<OptionLoadResult> {
  const { source } = input;
  try {
    if (source.kind === 'static') {
      return { nodes: staticOptionNodes(input.optionItems), ok: true };
    }
    if (source.kind === 'builtin') return await loadBuiltin(source.provider);
    return await loadFromFlow(source, input.scope);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      nodes: [],
      ok: false,
    };
  }
}

/* ------------------------------- 设计器辅助 ------------------------------- */

/** 节点总数（含子级），用于试加载结果提示 */
export function countNodes(nodes: OptionNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countNodes(node.children || []);
  }
  return total;
}

/** 前若干级标签预览，用于试加载结果提示 */
export function describeNodes(nodes: OptionNode[], limit = 5): string {
  const labels: string[] = [];
  const walk = (list: OptionNode[]) => {
    for (const node of list) {
      if (labels.length >= limit) return;
      labels.push(node.label);
      walk(node.children || []);
    }
  };
  walk(nodes);
  return labels.join('、');
}
