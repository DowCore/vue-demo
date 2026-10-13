import type { FlowNodeKind } from './flow-meta';

import {
  getPaletteItem,
  isExecutableKind,
  NODE_PALETTE,
  nodeSize,
  normalizeNodeKind,
} from './flow-meta';
import { reportConfigFallback, tryJsonParse } from './safe-json';

export interface ConditionItem {
  no: number;
  left: string;
  op: string;
  right: boolean | number | string;
}

export interface NodeBinding {
  name: string;
  type?: string;
  required?: boolean;
  from: string | { literal: unknown } | { template: string };
  to?: string;
  /** array 出参时：相对行内 map（与 End.map.item 同形） */
  map?: { item?: OutputMapItem[] };
}

export interface VisibleTo {
  mode: 'all' | 'none' | 'permissions' | 'roles';
  roleNames?: string[];
  permissions?: string[];
}

export interface InputRule {
  /**
   * 通用：required | min | max | minLength | maxLength | minItems | maxItems | pattern | enum | email | guid | url
   * 灵活：expr（条件为真则失败）| assert（条件为假则失败）
   */
  type: string;
  /** 数值 / 正则 / 枚举数组 / 布尔表达式字符串 */
  value?: boolean | number | string | string[];
  message?: string;
}

export interface InputParameter {
  name: string;
  displayName?: string;
  type: string;
  required?: boolean;
  source: 'input' | 'system';
  systemKey?: string;
  systemExpr?: string;
  description?: string;
  default?: unknown;
  /** 声明式校验规则（非 JS） */
  rules?: InputRule[];
  /** object 类型的下行字段 */
  properties?: InputParameter[];
  /** array 元素 schema（可为 object + properties） */
  items?: InputParameter;
}

export interface OutputMapItem {
  name: string;
  type?: string;
  from: string | { literal: unknown } | { template: string };
  visibleTo?: VisibleTo;
  sensitive?: boolean;
  /**
   * 嵌套投影（可无限层级）：
   * type=array → 对 from 数组逐行 map.item；
   * type=object → 对 from 对象按 map.item 投影字段。
   */
  map?: { item?: OutputMapItem[] };
}

export interface OutputParameter {
  name: string;
  type: string;
  from: string;
  visibleTo?: VisibleTo;
  sensitive?: boolean;
  description?: string;
  map?: { item?: OutputMapItem[] };
  aggregate?: { op: string; path?: string };
  wrap?: string;
  /**
   * true → API data 直接等于本字段值（array/object），
   * 得到 { success, data: [...] } 而非 { data: { name: [...] } }。
   * 此时 finalOutputs 只能有这一项。
   */
  promote?: boolean;
  /** 分组：扁平行 → 主表多字段 + 子表 */
  group?: {
    by: string | string[];
    header?: Array<{
      name: string;
      from?: string;
      take?: 'first' | 'last';
      aggregate?: { op: string; path?: string };
      visibleTo?: VisibleTo;
      sensitive?: boolean;
    }>;
    children?: {
      name: string;
      map?: { item?: OutputMapItem[] };
      visibleTo?: VisibleTo;
    };
    /** 单组时把 header/children 提升到 data 根级 */
    promote?: boolean;
  };
}

export interface MaskRule {
  field: string;
  op: string;
  value?: string;
  keepStart?: number;
  keepEnd?: number;
  maskChar?: string;
  saltFrom?: string;
}

export interface DslNode {
  id: string;
  type: string;
  /** 引用名：下游用 setLevel.level 或短名 level */
  ref?: string;
  kind?: string;
  async?: boolean;
  /** Http/Sql 业务数据根，如 body.data */
  resultRoot?: string;
  expression?: string;
  message?: string;
  name?: string;
  variable?: string;
  value?: unknown;
  method?: string;
  url?: string;
  body?: unknown;
  bodyMode?: string;
  responseVariable?: string;
  script?: string;
  /** Code/Sql 绑定的数据源编码 */
  dataSourceId?: string;
  strategy?: string;
  maskStrategy?: string;
  itemField?: string;
  maskRules?: MaskRule[];
  items?: ConditionItem[];
  inputs?: NodeBinding[];
  outputs?: NodeBinding[];
  /** End 最终出参 */
  finalOutputs?: OutputParameter[];
  headers?: NodeBinding[];
  failWhen?: string;
  failMessage?: string;
  failCode?: string;
  failItems?: ConditionItem[];
  failCombine?: string;
  entry?: { items: ConditionItem[]; combine?: string };
  /** RabbitMqPublish */
  exchange?: string;
  exchangeType?: string;
  routingKey?: string;
  persistent?: boolean;
  onError?: string;
  payloadMode?: string;
  payloadFrom?: string;
  payload?: { item?: OutputMapItem[] };
  /** SubFlow */
  subFlowKey?: string;
  // ---- 控制流原语：ForEach（node.type = ForEach） ----
  /** 待迭代数组的路径，如 input.items / results.query.items */
  itemsPath?: string;
  /** 循环体内单项变量名（默认 item） */
  itemVar?: string;
  /** 循环体内下标变量名（默认 index） */
  indexVar?: string;
  /** 迭代上限，超过即失败（后端硬上限 10000） */
  maxIterations?: number;
  /** failFast | continueOnError */
  itemErrorMode?: string;
  /** 并发度，1..16 */
  concurrency?: number;
  /** 内联循环体（与 subFlowKey 二选一，LoopBody 优先） */
  loopBody?: DslSubGraph;
  // ---- 控制流原语：Parallel（node.type = Parallel） ----
  /** all | any | allSettled */
  joinMode?: string;
  /** 单分支超时（毫秒） */
  branchTimeoutMs?: number;
  /** 分支列表，至少 2 条 */
  branches?: DslBranch[];
  /**
   * 节点级超时（毫秒）。0/未设置表示不限时，由后端默认 30s 兜底。
   * 与后端 FlowDslNode.timeoutMs 对应。
   */
  timeoutMs?: number;
  /**
   * 允许写操作（资源 create/update/delete）在瞬态故障下重试。
   * 默认关闭；开启时必须同时提供 idempotencyKey 入参，否则发布前校验报错。
   */
  retryOnWrite?: boolean;
}

/** ForEach 内联循环体 / Parallel 分支内联子图 */
export interface DslSubGraph {
  inputs?: InputParameter[];
  nodes: DslNode[];
  edges: DslEdge[];
}

/** Parallel 的单个分支：subFlowKey 与 body 二选一（body 优先） */
export interface DslBranch {
  ref: string;
  subFlowKey?: string;
  body?: DslSubGraph;
  inputs?: NodeBinding[];
  timeoutMs?: number;
  optional?: boolean;
}

export interface DslEdge {
  source: string;
  target: string;
  when?: string;
  combine?: string;
  isDefault?: boolean;
}

export interface DslDocument {
  version?: string;
  key?: string;
  trigger?: { type: string };
  inputs?: InputParameter[];
  outputs?: OutputParameter[];
  nodes: DslNode[];
  edges: DslEdge[];
}

export interface FlowGraphNode {
  id: string;
  shape: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  label?: string;
  data: Record<string, unknown>;
}

export interface FlowGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: Record<string, unknown>;
}

export interface FlowGraphData {
  engine?: 'x6';
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
}

/** @deprecated 兼容旧命名 */
export type LfGraphData = FlowGraphData;

export function parseDsl(dslJson?: string): DslDocument {
  if (!dslJson?.trim()) {
    return {
      version: '1.1',
      trigger: { type: 'Manual' },
      inputs: [],
      outputs: [],
      nodes: [],
      edges: [],
    };
  }
  const parsed = tryJsonParse<DslDocument>(dslJson);
  if (!parsed.ok) {
    throw new Error(`流程 DSL 不是合法 JSON：${parsed.error}`);
  }
  const raw = parsed.value;
  return {
    version: raw.version || '1.1',
    key: raw.key,
    trigger: raw.trigger || { type: 'Manual' },
    inputs: raw.inputs || [],
    outputs: raw.outputs || [],
    nodes: raw.nodes || [],
    edges: raw.edges || [],
  };
}

function cellId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'cell' in (value as object)) {
    return String((value as { cell: string }).cell);
  }
  return '';
}

function normalizeShape(shape: string, nodeType?: unknown): string {
  const kind = normalizeNodeKind(String(nodeType || ''));
  const knownKind = NODE_PALETTE.some((x) => x.kind === kind);
  if (knownKind) return getPaletteItem(kind).shape;
  // 旧形状名兼容
  if (shape === 'flow-set-variable') return getPaletteItem('Assign').shape;
  if (NODE_PALETTE.some((x) => x.shape === shape)) return shape;
  return getPaletteItem(kind || 'Log').shape;
}

export function parseGraph(graphJson?: string): FlowGraphData | null {
  if (!graphJson?.trim() || graphJson.trim() === '{}') return null;
  try {
    const raw = JSON.parse(graphJson) as any;
    const cells = Array.isArray(raw.cells) ? raw.cells : null;
    const rawNodes = cells
      ? cells.filter(
          (c: any) => c.shape && c.shape !== 'edge' && c.shape !== 'flow-edge',
        )
      : raw.nodes;
    const rawEdges = cells
      ? cells.filter((c: any) => c.shape === 'edge' || c.shape === 'flow-edge')
      : raw.edges;
    if (!rawNodes?.length) return null;

    const nodes: FlowGraphNode[] = rawNodes.map((n: any) => {
      let data = n.data || n.properties || {};
      const x = n.x ?? n.position?.x ?? 0;
      const y = n.y ?? n.position?.y ?? 0;
      const kind = normalizeNodeKind(String(data.nodeType || ''));
      if (kind && kind !== data.nodeType) {
        data = { ...data, nodeType: kind };
      }
      const size = nodeSize(kind);
      return {
        id: String(n.id),
        shape: normalizeShape(n.shape || n.type, kind),
        x,
        y,
        width: n.width ?? n.size?.width ?? size.width,
        height: n.height ?? n.size?.height ?? size.height,
        label:
          n.label ||
          (typeof n.text === 'string' ? n.text : n.text?.value) ||
          '',
        data,
      };
    });

    const edges: FlowGraphEdge[] = (rawEdges || []).map((e: any, i: number) => {
      const source = cellId(e.source ?? e.sourceNodeId);
      const target = cellId(e.target ?? e.targetNodeId);
      const data = e.data || e.properties || {};
      const label = String(
        data.combine ||
          data.when ||
          (data.isDefault ? 'else' : '') ||
          e.label ||
          (typeof e.text === 'string' ? e.text : e.text?.value) ||
          e.labels?.[0]?.attrs?.label?.text ||
          '',
      );
      return {
        id: String(e.id || `e_${source}_${target}_${i}`),
        source,
        target,
        label,
        data: {
          ...data,
          when: data.when || '',
          combine: data.combine || '',
          isDefault: !!data.isDefault,
        },
      };
    });

    return { engine: 'x6', nodes, edges };
  } catch {
    return null;
  }
}

function layoutFromDsl(
  dsl: DslDocument,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const children = new Map<string, string[]>();
  for (const edge of dsl.edges) {
    const list = children.get(edge.source) || [];
    list.push(edge.target);
    children.set(edge.source, list);
  }

  const start = dsl.nodes.find((n) => n.type === 'Start')?.id;
  if (!start) {
    dsl.nodes.forEach((n, i) => pos.set(n.id, { x: 280, y: 80 + i * 140 }));
    return pos;
  }

  const visited = new Set<string>();
  const queue: Array<{ id: string; x: number; y: number }> = [
    { id: start, x: 420, y: 80 },
  ];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) continue;
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    pos.set(cur.id, { x: cur.x, y: cur.y });
    const next = children.get(cur.id) || [];
    if (next.length <= 1) {
      next.forEach((id) => queue.push({ id, x: cur.x, y: cur.y + 140 }));
    } else {
      const span = (next.length - 1) * 260;
      next.forEach((id, i) => {
        queue.push({ id, x: cur.x - span / 2 + i * 260, y: cur.y + 150 });
      });
    }
  }

  dsl.nodes.forEach((n, i) => {
    if (!pos.has(n.id)) {
      pos.set(n.id, {
        x: 140 + (i % 4) * 240,
        y: 80 + Math.floor(i / 4) * 140,
      });
    }
  });
  return pos;
}

export function nodeCaption(node: DslNode | Record<string, unknown>) {
  const n = node as DslNode & { nodeType?: string; asyncMode?: boolean };
  const type = normalizeNodeKind(String(n.type || n.nodeType || ''));
  const asyncPrefix = n.async || n.asyncMode ? '⚡' : '';
  const meta = getPaletteItem(type);
  if (type === 'Condition') {
    const items = n.items;
    if (items?.length) {
      const first = items[0];
      if (!first) return `${items.length} 条件`;
      const summary =
        `${first.left || '?'} ${first.op || ''} ${first.right ?? ''}`.trim();
      return items.length === 1 ? summary : `${items.length} 条件`;
    }
    if (n.expression) return String(n.expression);
    return '条件分支';
  }
  if (type === 'Log' && n.message) {
    return `${asyncPrefix}${String(n.message)}`;
  }
  if (type === 'HttpCall' && n.url) {
    return `${asyncPrefix}${n.method || 'GET'} ${n.url}`;
  }
  if (type === 'SubFlow') {
    const key = (n as DslNode).subFlowKey || '';
    return key ? `${asyncPrefix}SubFlow ${key}` : `${asyncPrefix}逻辑组件`;
  }
  if (type === 'Assign') {
    const outputs = n.outputs;
    if (outputs?.length) {
      return `${asyncPrefix}${outputs.map((o) => o.name).join(', ')}`;
    }
    const name = n.name || n.variable;
    if (name) return `${asyncPrefix}${String(name)}`;
    return `${asyncPrefix}赋值`;
  }
  if (type === 'Throw') {
    return String(n.failMessage || n.message || '抛异常');
  }
  if (type === 'ForEach') {
    const n2 = n as DslNode;
    const src = String(n2.itemsPath || '');
    let tag = '';
    if (n2.subFlowKey) tag = `→ ${n2.subFlowKey}`;
    else if (n2.loopBody) tag = '↻ 内联循环体';
    return `${asyncPrefix}循环${src ? ` ${src}` : ''}${tag ? ` ${tag}` : ''}`;
  }
  if (type === 'Parallel') {
    const n2 = n as DslNode;
    const count = n2.branches?.length || 0;
    const mode = String(n2.joinMode || 'all');
    return `${asyncPrefix}并行 ×${count}（${mode}）`;
  }
  return `${asyncPrefix}${meta.label}`;
}

function serializeBindings(list?: NodeBinding[]) {
  return JSON.stringify(list || [], null, 2);
}

function parseBindings(raw: string): NodeBinding[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeItems(list?: ConditionItem[]) {
  return JSON.stringify(list || [], null, 2);
}

function parseItems(raw: string): ConditionItem[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function defaultNodeData(
  kind: FlowNodeKind | string,
): Record<string, unknown> {
  const normalized = normalizeNodeKind(String(kind)) as FlowNodeKind;
  const base: Record<string, unknown> = {
    nodeType: normalized,
    refName: suggestRefName(normalized),
    expression: '',
    message: normalized === 'Log' ? 'High amount: {{input.amount}}' : '',
    name: '',
    value: '',
    method: 'GET',
    url: normalized === 'HttpCall' ? 'mock://echo' : '',
    body: '',
    bodyMode: 'auto',
    responseVariable: '',
    asyncMode: false,
    resultRoot: normalized === 'HttpCall' ? 'body.data' : '',
    script:
      normalized === 'Code'
        ? `const amount = Number(nodeInput.amount || 0);
return {
  level: amount > 1000 ? 'high' : 'normal',
  amount
};`
        : '',
    dataSourceId: '',
    strategy: 'firstMatch',
    itemsJson: '[]',
    inputsJson: '[]',
    outputsJson: '[]',
    headersJson: '[]',
    failWhen: '',
    failMessage: '',
    failCode: '',
    failItemsJson: '[]',
    failCombine: '',
    maskStrategy: 'rules',
    itemField: 'rows',
    maskRulesJson: '[]',
    finalOutputsJson: '[]',
    exchange: '',
    exchangeType: 'fanout',
    routingKey: '',
    persistent: true,
    onError: 'fail',
    payloadMode: 'object',
    payloadFrom: '',
    payloadJson: '[]',
    subFlowKey: '',
    // 控制流原语：ForEach
    itemsPath: '',
    itemVar: 'item',
    indexVar: 'index',
    maxIterations: 1000,
    itemErrorMode: 'failFast',
    concurrency: 1,
    loopBodyJson: '',
    // 控制流原语：Parallel
    joinMode: 'all',
    branchTimeoutMs: 0,
    branchesJson: '[]',
    // 节点级超时（全节点通用；0 表示不限时，后端默认 30000）
    timeoutMs: 0,
    // 写操作弹性开关（默认关闭；开启需配 idempotencyKey）
    retryOnWrite: false,
  };

  if (normalized === 'Condition') {
    base.itemsJson = serializeItems([
      { no: 1, left: 'input.amount', op: 'gt', right: 1000 },
    ]);
  }

  if (normalized === 'Assign') {
    base.refName = 'setLevel';
    base.inputsJson = serializeBindings([
      { name: 'level', type: 'string', from: { literal: 'high' } },
    ]);
    base.outputsJson = serializeBindings([
      { name: 'level', type: 'string', from: 'level' },
    ]);
  }

  if (normalized === 'Log') {
    base.outputsJson = serializeBindings([
      { name: 'message', from: 'message' },
    ]);
  }

  if (normalized === 'HttpCall') {
    base.refName = 'http1';
    base.method = 'POST';
    base.bodyMode = 'auto';
    base.asyncMode = false;
    base.resultRoot = 'body';
    base.inputsJson = serializeBindings([
      { name: 'amount', from: 'input.amount' },
    ]);
    base.headersJson = serializeBindings([
      { name: 'Accept', from: { literal: 'application/json' } },
    ]);
    base.outputsJson = serializeBindings([
      { name: 'httpStatus', from: 'statusCode' },
      { name: 'echoUrl', from: 'url' },
    ]);
    base.failWhen = '';
    base.failMessage = '';
  }

  if (normalized === 'Code') {
    base.refName = 'code1';
    base.resultRoot = 'return';
    base.inputsJson = serializeBindings([
      { name: 'amount', from: 'input.amount' },
    ]);
    base.outputsJson = serializeBindings([{ name: 'level', from: 'level' }]);
  }

  if (normalized === 'RabbitMqPublish') {
    base.refName = 'mqBroadcast';
    base.exchange = 'Meta.Dow.Orchestration.Broadcast';
    base.exchangeType = 'fanout';
    base.routingKey = '';
    base.persistent = true;
    base.onError = 'fail';
    base.payloadMode = 'object';
    base.asyncMode = false;
    base.inputsJson = serializeBindings([
      { name: 'orderId', from: 'input.order.id' },
      { name: 'amount', from: 'input.amount' },
    ]);
    base.payloadJson = JSON.stringify(
      [
        { name: 'orderId', type: 'string', from: 'orderId' },
        { name: 'amount', type: 'number', from: 'amount' },
      ],
      null,
      0,
    );
    // 消息体字段即「输出内容」；回执由执行器自动写入，无需配 outputs
    base.outputsJson = '[]';
  }

  if (normalized === 'SubFlow') {
    base.refName = 'sub1';
    base.subFlowKey = '';
    base.onError = 'fail';
    base.resultRoot = 'data';
    base.asyncMode = false;
    base.inputsJson = serializeBindings([
      { name: 'amount', from: 'input.amount' },
    ]);
    base.outputsJson = serializeBindings([
      { name: 'level', from: 'level' },
      { name: 'success', from: 'success' },
    ]);
  }

  if (normalized === 'ResourceQuery') {
    base.refName = 'query';
    base.inputsJson = serializeBindings([
      { name: 'resourceCode', from: 'input.resourceCode' },
      { name: 'page', from: 'input.page' },
      { name: 'pageSize', from: 'input.pageSize' },
      { name: 'sorting', from: 'input.sorting' },
      { name: 'filters', from: 'input.filters' },
      { name: 'columns', from: 'input.columns' },
    ]);
    base.outputsJson = serializeBindings([
      { name: 'items', type: 'array', from: 'items' },
      { name: 'total', type: 'number', from: 'total' },
    ]);
  }

  if (normalized === 'ResourceGet') {
    base.refName = 'get';
    base.inputsJson = serializeBindings([
      { name: 'resourceCode', from: 'input.resourceCode' },
      { name: 'id', from: 'input.id' },
    ]);
    base.outputsJson = serializeBindings([
      { name: 'record', type: 'object', from: 'record' },
    ]);
  }

  if (normalized === 'ResourceCreate') {
    base.refName = 'create';
    base.inputsJson = serializeBindings([
      { name: 'resourceCode', from: 'input.resourceCode' },
      { name: 'record', from: 'input.record' },
    ]);
    base.outputsJson = serializeBindings([
      { name: 'id', type: 'string', from: 'id' },
    ]);
  }

  if (normalized === 'ResourceUpdate') {
    base.refName = 'update';
    base.inputsJson = serializeBindings([
      { name: 'resourceCode', from: 'input.resourceCode' },
      { name: 'id', from: 'input.id' },
      { name: 'concurrencyStamp', from: 'input.concurrencyStamp' },
      { name: 'record', from: 'input.record' },
    ]);
    base.outputsJson = serializeBindings([
      { name: 'id', type: 'string', from: 'id' },
      { name: 'concurrencyStamp', type: 'string', from: 'concurrencyStamp' },
    ]);
  }

  if (normalized === 'ResourceDelete') {
    base.refName = 'delete';
    base.inputsJson = serializeBindings([
      { name: 'resourceCode', from: 'input.resourceCode' },
      { name: 'id', from: 'input.id' },
    ]);
    base.outputsJson = serializeBindings([
      { name: 'id', type: 'string', from: 'id' },
      { name: 'deleted', type: 'boolean', from: 'deleted' },
    ]);
  }

  if (normalized === 'Throw') {
    base.refName = 'throw1';
    base.failItemsJson = serializeItems([
      { no: 1, left: 'input.amount', op: 'lt', right: 0 },
    ]);
    base.failCombine = '1';
    base.failMessage = '金额不能为负数：{{input.amount}}';
    base.failCode = 'Biz:InvalidAmount';
    base.outputsJson = serializeBindings([{ name: 'thrown', from: 'thrown' }]);
  }

  if (normalized === 'Mask') {
    base.refName = 'mask1';
    base.maskStrategy = 'rules';
    base.itemField = 'rows';
    base.inputsJson = serializeBindings([
      { name: 'token', from: 'input.token' },
    ]);
    base.maskRulesJson = JSON.stringify(
      [{ field: 'token', op: 'mask', keepStart: 7, keepEnd: 0, maskChar: '*' }],
      null,
      0,
    );
    base.outputsJson = serializeBindings([
      { name: 'tokenMasked', from: 'token' },
    ]);
  }

  if (normalized === 'End') {
    base.finalOutputsJson = '[]';
  }

  if (normalized === 'ForEach') {
    base.refName = 'each1';
    base.itemsPath = 'input.items';
    base.itemVar = 'item';
    base.indexVar = 'index';
    base.concurrency = 1;
    base.maxIterations = 100;
    base.itemErrorMode = 'failFast';
    base.asyncMode = false;
    // 循环体默认用内联子图，避免必须先去建一条已发布流程
    base.subFlowKey = '';
    base.inputsJson = serializeBindings([
      { name: 'items', type: 'array', from: 'input.items' },
    ]);
    base.outputsJson = serializeBindings([
      { name: 'items', type: 'array', from: 'items' },
      { name: 'count', type: 'number', from: 'count' },
      { name: 'succeeded', type: 'number', from: 'succeeded' },
      { name: 'failed', type: 'array', from: 'failed' },
    ]);
    base.loopBodyJson = JSON.stringify(defaultLoopBodyGraph(), null, 2);
  }

  if (normalized === 'Parallel') {
    base.refName = 'fan1';
    base.joinMode = 'all';
    base.branchTimeoutMs = 0;
    base.asyncMode = false;
    base.inputsJson = '[]';
    base.outputsJson = serializeBindings([
      { name: 'ok', type: 'boolean', from: 'ok' },
      { name: 'succeeded', type: 'number', from: 'succeeded' },
      { name: 'failed', type: 'array', from: 'failed' },
    ]);
    base.branchesJson = JSON.stringify(defaultParallelBranches(), null, 2);
  }

  return base;
}

/**
 * ForEach 的默认内联循环体：Start → Assign(item/index) → End。
 * 结构对齐后端 ControlFlowDemoSeedContributor 的 loopBody 示例。
 */
function defaultLoopBodyGraph(): DslSubGraph {
  return {
    inputs: [
      { name: 'item', type: 'object', source: 'input' },
      { name: 'index', type: 'number', source: 'input' },
    ],
    nodes: [
      { id: 'body_start', type: 'Start' },
      {
        id: 'body_pick',
        type: 'Assign',
        ref: 'pick',
        inputs: [
          { name: 'item', type: 'object', from: 'item' },
          { name: 'index', type: 'number', from: 'index' },
        ],
        outputs: [
          { name: 'index', type: 'number', from: 'index' },
          { name: 'value', type: 'object', from: 'item' },
        ],
      },
      {
        id: 'body_end',
        type: 'End',
        finalOutputs: [
          {
            name: 'index',
            type: 'number',
            from: 'index',
            visibleTo: { mode: 'all' },
          },
          {
            name: 'value',
            type: 'object',
            from: 'value',
            visibleTo: { mode: 'all' },
          },
        ],
      },
    ],
    edges: [
      { source: 'body_start', target: 'body_pick' },
      { source: 'body_pick', target: 'body_end' },
    ],
  };
}

/** Parallel 的默认两条分支（各自独立子图，跑在独立上下文里）。 */
function defaultParallelBranches(): DslBranch[] {
  return [
    { ref: 'branchA', body: defaultLinearBody('a') },
    { ref: 'branchB', body: defaultLinearBody('b'), optional: false },
  ];
}

/** 生成一段 Start → Assign → End 的极简子图，prefix 用于避免 id 冲突。 */
function defaultLinearBody(prefix: string): DslSubGraph {
  return {
    nodes: [
      { id: `${prefix}_s`, type: 'Start' },
      {
        id: `${prefix}_a`,
        type: 'Assign',
        ref: `${prefix}A`,
        inputs: [{ name: 'value', type: 'string', from: { literal: '' } }],
        outputs: [{ name: 'value', type: 'string', from: 'value' }],
      },
      {
        id: `${prefix}_e`,
        type: 'End',
        finalOutputs: [
          {
            name: 'value',
            type: 'string',
            from: 'value',
            visibleTo: { mode: 'all' },
          },
        ],
      },
    ],
    edges: [
      { source: `${prefix}_s`, target: `${prefix}_a` },
      { source: `${prefix}_a`, target: `${prefix}_e` },
    ],
  };
}

let refSeq = 1;
export function suggestRefName(kind: string) {
  const base = normalizeNodeKind(kind).toLowerCase().replace(/call$/i, '');
  refSeq += 1;
  return `${base}${refSeq}`;
}

/** Assign 节点：产出 list 的推荐示例（字面量 JSON + type=array） */
export function listAssignSampleBindings(): {
  refName: string;
  inputs: NodeBinding[];
  outputs: NodeBinding[];
} {
  return {
    refName: 'prepLines',
    inputs: [
      {
        name: 'lineItems',
        type: 'array',
        from: {
          literal: [
            { id: 'ORD-1001', qty: 2 },
            { id: 'ORD-1001-B', qty: 1 },
          ],
        },
      },
    ],
    outputs: [{ name: 'lineItems', type: 'array', from: 'lineItems' }],
  };
}

export function nodeRefOf(node: {
  id: string;
  data?: Record<string, unknown>;
  ref?: string;
}): string {
  const fromData = String(node.data?.refName || '').trim();
  if (fromData) return fromData;
  if (node.ref?.trim()) return node.ref.trim();
  return node.id;
}

/** 收集可引用路径：优先短名 level，其次 setLevel.level；array 附加 .0 / map 列 */
/** 宽容解析 JSON 数组；失败返回空数组（仅用于提示注入，不打断渲染） */
function looseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // 无效 JSON 不注入提示
    return [];
  }
}

export function collectResultPathHints(graph: FlowGraphData): string[] {
  const shortNames = new Map<string, number>();
  const qualified: string[] = [];
  const arrayHints: string[] = [];

  for (const n of graph.nodes || []) {
    const kind = normalizeNodeKind(String(n.data?.nodeType || ''));
    if (!isExecutableKind(kind)) continue;
    const ref = nodeRefOf(n);
    // Parallel 的分支产出不是静态 outputs，而是按分支 ref 命名：<节点ref>.<分支ref>
    if (kind === 'Parallel') {
      for (const b of looseJsonArray(String(n.data?.branchesJson || '[]'))) {
        const branchRef = String((b as { ref?: string })?.ref || '').trim();
        if (branchRef) qualified.push(`${ref}.${branchRef}`);
      }
    }
    const outputs = parseBindings(String(n.data?.outputsJson || '[]'));
    if (outputs.length === 0) {
      qualified.push(ref);
      continue;
    }
    for (const o of outputs) {
      if (!o.name) continue;
      shortNames.set(o.name, (shortNames.get(o.name) || 0) + 1);
      qualified.push(`${ref}.${o.name}`);
      if (o.type === 'array') {
        arrayHints.push(
          o.name,
          `${ref}.${o.name}`,
          `${o.name}.count`,
          `${ref}.${o.name}.count`,
        );
        const mapFields = o.map?.item || [];
        if (mapFields.length > 0) {
          for (const f of mapFields) {
            const fname = String(f.name || '').trim();
            if (!fname) continue;
            arrayHints.push(
              `${o.name}.0.${fname}`,
              `${ref}.${o.name}.0.${fname}`,
            );
          }
        } else {
          arrayHints.push(
            `${o.name}.0`,
            `${ref}.${o.name}.0`,
            `${o.name}.0.id`,
            `${o.name}.0.order`,
            `${ref}.${o.name}.0.id`,
            `${o.name}.first.order`,
            `${o.name}.last.order`,
            `${o.name}.max.date`,
            `${o.name}.sum.amount`,
          );
        }
      }
    }
  }

  const shorts = [...shortNames.entries()]
    .filter(([, count]) => count === 1)
    .map(([name]) => name);

  return [...shorts, ...arrayHints, ...qualified].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );
}

function formatNodeBody(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body) return JSON.stringify(body, null, 2);
  return '';
}

export function dslToGraph(
  dsl: DslDocument,
  existing?: FlowGraphData | null,
): FlowGraphData {
  const pos = new Map<string, { x: number; y: number }>();
  existing?.nodes.forEach((n) => pos.set(n.id, { x: n.x, y: n.y }));
  const auto = layoutFromDsl(dsl);

  const nodes: FlowGraphNode[] = dsl.nodes.map((node) => {
    const type = normalizeNodeKind(node.type);
    const meta = getPaletteItem(type);
    const size = nodeSize(type);
    const p = pos.get(node.id) || auto.get(node.id) || { x: 200, y: 100 };
    return {
      id: node.id,
      shape: meta.shape,
      x: p.x,
      y: p.y,
      width: size.width,
      height: size.height,
      label: nodeCaption({ ...node, type }),
      data: {
        ...defaultNodeData(type as FlowNodeKind),
        nodeType: type,
        refName: node.ref || node.id,
        expression: node.expression || '',
        message: node.message || '',
        name: node.name || node.variable || '',
        value:
          typeof node.value === 'string'
            ? node.value
            : JSON.stringify(node.value ?? ''),
        method: node.method || 'GET',
        url: node.url || '',
        body: formatNodeBody(node.body),
        responseVariable: node.responseVariable || '',
        script: node.script || '',
        dataSourceId: node.dataSourceId || '',
        bodyMode: node.bodyMode || 'auto',
        asyncMode: !!node.async,
        resultRoot: node.resultRoot || '',
        strategy: node.strategy || 'firstMatch',
        itemsJson: serializeItems(node.items),
        inputsJson: serializeBindings(node.inputs),
        outputsJson: serializeBindings(node.outputs),
        headersJson: serializeBindings(node.headers),
        failWhen: node.failWhen || '',
        failMessage: node.failMessage || '',
        failCode: node.failCode || '',
        failItemsJson: serializeItems(node.failItems),
        failCombine: node.failCombine || '',
        maskStrategy: node.maskStrategy || node.strategy || 'rules',
        itemField: node.itemField || 'rows',
        maskRulesJson: JSON.stringify(node.maskRules || [], null, 0),
        finalOutputsJson: JSON.stringify(
          node.finalOutputs || (type === 'End' ? dsl.outputs || [] : []),
          null,
          0,
        ),
        exchange: node.exchange || '',
        exchangeType: node.exchangeType || 'fanout',
        routingKey: node.routingKey || '',
        persistent: node.persistent !== false,
        onError: node.onError || 'fail',
        payloadMode: node.payloadMode || 'object',
        payloadFrom: node.payloadFrom || '',
        payloadJson: JSON.stringify(node.payload?.item || [], null, 0),
        subFlowKey: node.subFlowKey || '',
        itemsPath: node.itemsPath || '',
        itemVar: node.itemVar || 'item',
        indexVar: node.indexVar || 'index',
        maxIterations: node.maxIterations ?? 1000,
        itemErrorMode: node.itemErrorMode || 'failFast',
        concurrency: node.concurrency ?? 1,
        loopBodyJson: node.loopBody
          ? JSON.stringify(node.loopBody, null, 2)
          : '',
        joinMode: node.joinMode || 'all',
        branchTimeoutMs: node.branchTimeoutMs ?? 0,
        branchesJson: JSON.stringify(node.branches || [], null, 2),
        timeoutMs: node.timeoutMs ?? 0,
        retryOnWrite: node.retryOnWrite ?? false,
      },
    };
  });

  const edges: FlowGraphEdge[] = dsl.edges.map((edge, i) => {
    let combine = String(edge.combine || '').trim();
    let isDefault = !!edge.isDefault;
    const when = String(edge.when || '').trim();
    if (!combine && !isDefault) {
      if (when === 'true') combine = '1';
      else if (when === 'false') isDefault = true;
    }
    const label = combine || (isDefault ? 'else' : '') || '';
    return {
      id: `e_${edge.source}_${edge.target}_${i}`,
      source: edge.source,
      target: edge.target,
      label,
      data: {
        when: '',
        combine,
        isDefault,
      },
    };
  });

  return { engine: 'x6', nodes, edges };
}

export function graphToDsl(
  graph: FlowGraphData,
  contract?: {
    inputs?: InputParameter[];
    outputs?: OutputParameter[];
    key?: string;
  },
): DslDocument {
  const nodes: DslNode[] = (graph.nodes || []).map((n) => {
    const p = n.data || {};
    const type = normalizeNodeKind(String(p.nodeType || 'Log')) as FlowNodeKind;
    const node: DslNode = { id: String(n.id), type };
    const refName = String(p.refName || '').trim();
    if (refName && refName !== n.id) {
      node.ref = refName;
    }
    // 可执行节点默认带上引用名，便于 DSL 阅读
    if (isExecutableKind(type) && !node.ref) {
      node.ref = refName || String(n.id);
    }

    // 节点级超时（全节点通用）。0 或空表示不限时，交由后端默认值（30s）。
    {
      const t = Number(p.timeoutMs);
      if (Number.isFinite(t) && t > 0) node.timeoutMs = Math.floor(t);
    }

    // 写操作弹性开关：仅资源写类节点有意义，其余类型后端会拒绝，故此处也只对写类节点回写。
    if (p.retryOnWrite === true) node.retryOnWrite = true;

    if (type === 'Condition') {
      const items = parseItems(String(p.itemsJson || '[]'));
      if (items.length > 0) {
        node.items = items;
        node.strategy = String(p.strategy || 'firstMatch');
      } else if (p.expression) {
        node.expression = String(p.expression || '');
      }
    }

    if (type === 'Log') {
      node.message = String(p.message || n.label || '');
    }

    if (type === 'HttpCall') {
      node.method = String(p.method || 'GET');
      node.url = String(p.url || '');
      node.bodyMode = String(p.bodyMode || 'auto') || undefined;
      node.responseVariable = String(p.responseVariable || '') || undefined;
      node.async = !!p.asyncMode;
      const rr = String(p.resultRoot || '').trim();
      node.resultRoot = rr || undefined;
      const bodyRaw = String(p.body || '').trim();
      if (bodyRaw) {
        try {
          node.body = JSON.parse(bodyRaw);
        } catch {
          node.body = bodyRaw;
        }
      }
      const headers = parseBindings(String(p.headersJson || '[]'));
      if (headers.length > 0) node.headers = headers;
    }

    if (type === 'Code') {
      node.script = String(p.script || '') || undefined;
      const ds = String(p.dataSourceId || '').trim();
      node.dataSourceId = ds || undefined;
      const rr = String(p.resultRoot || '').trim();
      node.resultRoot = rr || undefined;
    }

    if (type === 'Throw') {
      const failItems = parseItems(String(p.failItemsJson || '[]'));
      if (failItems.length > 0) {
        node.failItems = failItems;
        node.failCombine = String(p.failCombine || '') || undefined;
      } else {
        node.failWhen = String(p.failWhen || p.expression || '') || undefined;
      }
      node.failMessage = String(p.failMessage || p.message || '') || undefined;
      node.failCode = String(p.failCode || '') || undefined;
    }

    // 兼容旧图：Assign 可能仍带 name/value
    if (type === 'Assign' && String(p.name || '')) {
      node.name = String(p.name || '');
      const raw = String(p.value ?? '');
      try {
        node.value = raw ? JSON.parse(raw) : '';
      } catch {
        node.value = raw;
      }
    }

    if (type === 'Mask') {
      node.maskStrategy = String(p.maskStrategy || p.strategy || 'rules');
      node.itemField = String(p.itemField || 'rows') || undefined;
      try {
        const rules = JSON.parse(String(p.maskRulesJson || '[]'));
        if (Array.isArray(rules) && rules.length > 0) node.maskRules = rules;
      } catch (error) {
        reportConfigFallback('Mask 节点 maskRulesJson', error);
      }
    }

    if (type === 'RabbitMqPublish') {
      node.exchange = String(p.exchange || '').trim() || undefined;
      node.exchangeType = String(p.exchangeType || 'fanout') || 'fanout';
      node.routingKey = String(p.routingKey || '') || undefined;
      node.persistent = p.persistent !== false;
      node.onError = String(p.onError || 'fail') || 'fail';
      node.payloadMode = String(p.payloadMode || 'object') || 'object';
      node.payloadFrom = String(p.payloadFrom || '').trim() || undefined;
      try {
        const items = JSON.parse(String(p.payloadJson || '[]'));
        if (Array.isArray(items) && items.length > 0) {
          node.payload = { item: items };
        }
      } catch (error) {
        reportConfigFallback('RabbitMqPublish 节点 payloadJson', error);
      }
    }

    if (type === 'SubFlow') {
      node.subFlowKey = String(p.subFlowKey || '').trim() || undefined;
      node.onError = String(p.onError || 'fail') || 'fail';
      if (!node.resultRoot) node.resultRoot = 'data';
    }

    if (type === 'ForEach') {
      const itemsPath = String(p.itemsPath || '').trim();
      if (itemsPath) node.itemsPath = itemsPath;
      const itemVar = String(p.itemVar || '').trim();
      if (itemVar) node.itemVar = itemVar;
      const indexVar = String(p.indexVar || '').trim();
      if (indexVar) node.indexVar = indexVar;
      const maxIter = Number(p.maxIterations);
      if (Number.isFinite(maxIter) && maxIter > 0) {
        node.maxIterations = Math.floor(maxIter);
      }
      node.itemErrorMode = String(p.itemErrorMode || 'failFast') || 'failFast';
      const conc = Number(p.concurrency);
      if (Number.isFinite(conc) && conc > 0) {
        node.concurrency = Math.min(16, Math.floor(conc));
      }

      // 循环体：内联子图优先，其次已发布流程；解析失败必须显式回退而非静默丢体
      const bodyRaw = String(p.loopBodyJson || '').trim();
      const subKey = String(p.subFlowKey || '').trim();
      if (bodyRaw) {
        try {
          const parsed = JSON.parse(bodyRaw) as DslSubGraph;
          if (
            parsed &&
            Array.isArray(parsed.nodes) &&
            parsed.nodes.length > 0
          ) {
            node.loopBody = parsed;
            node.subFlowKey = undefined;
          } else if (subKey) {
            node.subFlowKey = subKey;
          }
        } catch (error) {
          reportConfigFallback('ForEach 节点 loopBodyJson', error);
          if (subKey) node.subFlowKey = subKey;
        }
      } else if (subKey) {
        node.subFlowKey = subKey;
      }
    }

    if (type === 'Parallel') {
      node.joinMode = String(p.joinMode || 'all') || 'all';
      const t = Number(p.branchTimeoutMs);
      if (Number.isFinite(t) && t > 0) node.branchTimeoutMs = Math.floor(t);
      try {
        const parsed = JSON.parse(String(p.branchesJson || '[]'));
        if (Array.isArray(parsed) && parsed.length > 0) {
          node.branches = parsed as DslBranch[];
        }
      } catch (error) {
        reportConfigFallback('Parallel 节点 branchesJson', error);
      }
    }

    if (type === 'End') {
      try {
        const finals = JSON.parse(String(p.finalOutputsJson || '[]'));
        if (Array.isArray(finals) && finals.length > 0) {
          node.finalOutputs = finals;
        }
      } catch (error) {
        reportConfigFallback('End 节点 finalOutputsJson', error);
      }
    }

    if (isExecutableKind(type)) {
      node.async = !!p.asyncMode;
      const inputs = parseBindings(String(p.inputsJson || '[]'));
      const outputs = parseBindings(String(p.outputsJson || '[]'));
      if (inputs.length > 0) node.inputs = inputs;
      if (outputs.length > 0) node.outputs = outputs;
      // 通用异常（Throw 已单独处理）
      if (type !== 'Throw') {
        const failItems = parseItems(String(p.failItemsJson || '[]'));
        if (failItems.length > 0) {
          node.failItems = failItems;
          node.failCombine = String(p.failCombine || '') || undefined;
        }
        const fw = String(p.failWhen || '').trim();
        const fm = String(p.failMessage || '').trim();
        const fc = String(p.failCode || '').trim();
        if (fw && failItems.length === 0) node.failWhen = fw;
        if (fm) node.failMessage = fm;
        if (fc) node.failCode = fc;
      }
    }

    return node;
  });

  const edges: DslEdge[] = (graph.edges || []).map((e) => {
    let combine = String(e.data?.combine || '').trim();
    let isDefault = !!e.data?.isDefault;
    const when = String(e.data?.when || '').trim();
    if (!combine && !isDefault) {
      if (when === 'true') combine = '1';
      else if (when === 'false') isDefault = true;
    }
    return {
      source: String(e.source),
      target: String(e.target),
      ...(combine ? { combine } : {}),
      ...(isDefault ? { isDefault: true } : {}),
    };
  });

  // End.finalOutputs 同步到根 outputs（定义摘要 / 兼容）
  const endNode = nodes.find((n) => n.type === 'End');
  const rootOutputs = endNode?.finalOutputs?.length
    ? endNode.finalOutputs
    : contract?.outputs || [];

  return {
    version: '1.1',
    key: contract?.key,
    trigger: { type: 'Manual' },
    inputs: contract?.inputs || [],
    outputs: rootOutputs,
    nodes,
    edges,
  };
}

export function createDefaultGraph(): FlowGraphData {
  return dslToGraph(
    parseDsl(`{
  "version": "1.1",
  "inputs": [
    { "name": "amount", "type": "number", "required": true, "source": "input" }
  ],
  "outputs": [
    { "name": "message", "type": "string", "from": "message", "visibleTo": { "mode": "all" } }
  ],
  "nodes": [
    { "id": "start", "type": "Start" },
    {
      "id": "if1",
      "type": "Condition",
      "items": [{ "no": 1, "left": "input.amount", "op": "gt", "right": 1000 }]
    },
    {
      "id": "log_high",
      "type": "Log",
      "ref": "logHigh",
      "message": "High amount: {{input.amount}}",
      "outputs": [{ "name": "message", "from": "message" }]
    },
    {
      "id": "log_low",
      "type": "Log",
      "ref": "logLow",
      "message": "Normal amount: {{input.amount}}",
      "outputs": [{ "name": "message", "from": "message" }]
    },
    { "id": "end", "type": "End" }
  ],
  "edges": [
    { "source": "start", "target": "if1" },
    { "source": "if1", "target": "log_high", "combine": "1" },
    { "source": "if1", "target": "log_low", "isDefault": true },
    { "source": "log_high", "target": "end" },
    { "source": "log_low", "target": "end" }
  ]
}`),
  );
}

let nodeSeq = 1;
export function nextNodeId(kind: string) {
  nodeSeq += 1;
  return `${kind.toLowerCase()}_${Date.now().toString(36)}_${nodeSeq}`;
}

export { parseBindings, parseItems, serializeBindings, serializeItems };
