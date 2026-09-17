export type DefinitionStatus = 0 | 1 | 2;
export type InstanceStatus = 0 | 1 | 2 | 3;

export const definitionStatusMeta: Record<
  number,
  { color: string; text: string; tone: string }
> = {
  0: { color: 'default', text: '草稿', tone: 'bg-slate-100 text-slate-600' },
  1: {
    color: 'success',
    text: '已发布',
    tone: 'bg-emerald-50 text-emerald-700',
  },
  2: { color: 'error', text: '已禁用', tone: 'bg-rose-50 text-rose-700' },
};

export const instanceStatusMeta: Record<
  number,
  { color: string; text: string; tone: string }
> = {
  0: { color: 'processing', text: '运行中', tone: 'bg-sky-50 text-sky-700' },
  1: { color: 'success', text: '成功', tone: 'bg-emerald-50 text-emerald-700' },
  2: { color: 'error', text: '失败', tone: 'bg-rose-50 text-rose-700' },
  3: { color: 'default', text: '已取消', tone: 'bg-slate-100 text-slate-600' },
};

/** 结构节点：控制流，不产出业务出参 */
export type FlowStructureKind = 'Condition' | 'End' | 'Start';

/** 可执行节点：方法调用语义，声明 inputs/outputs → results */
export type FlowExecutableKind =
  | 'Assign'
  | 'Code'
  | 'HttpCall'
  | 'Log'
  | 'Mask'
  | 'Throw';

export type FlowNodeKind =
  | 'SetVariable'
  | FlowExecutableKind
  | FlowStructureKind;

export const EXECUTABLE_NODE_KINDS: FlowExecutableKind[] = [
  'Assign',
  'HttpCall',
  'Log',
  'Code',
  'Throw',
  'Mask',
];

export function isExecutableKind(kind: string): boolean {
  const n = normalizeNodeKind(kind);
  return (EXECUTABLE_NODE_KINDS as string[]).includes(n);
}

/** SetVariable → Assign */
export function normalizeNodeKind(kind: string): string {
  if (kind === 'SetVariable') return 'Assign';
  return kind;
}

export type FlowShape = 'circle' | 'diamond' | 'rect';

export interface NodePaletteItem {
  kind: FlowNodeKind;
  label: string;
  desc: string;
  shape: string;
  geometry: FlowShape;
  icon: string;
  color: string;
  bg: string;
}

export const NODE_PALETTE: NodePaletteItem[] = [
  {
    kind: 'Start',
    label: '开始',
    desc: '流程入口',
    shape: 'flow-start',
    geometry: 'circle',
    icon: '▶',
    color: '#389e0d',
    bg: '#f6ffed',
  },
  {
    kind: 'Condition',
    label: '条件',
    desc: '多条件 + 逻辑组合',
    shape: 'flow-condition',
    geometry: 'diamond',
    icon: '◇',
    color: '#d46b08',
    bg: '#fff7e6',
  },
  {
    kind: 'Assign',
    label: '赋值',
    desc: '入参映射 → 出参供下游',
    shape: 'flow-assign',
    geometry: 'rect',
    icon: 'VAR',
    color: '#08979c',
    bg: '#e6fffb',
  },
  {
    kind: 'HttpCall',
    label: 'HTTP',
    desc: 'Method/URL + 参数/Header',
    shape: 'flow-http-call',
    geometry: 'rect',
    icon: 'API',
    color: '#2f54eb',
    bg: '#f0f5ff',
  },
  {
    kind: 'Code',
    label: '代码',
    desc: 'JS 沙箱 / 选库 db.*',
    shape: 'flow-code',
    geometry: 'rect',
    icon: '{ }',
    color: '#531dab',
    bg: '#f9f0ff',
  },
  {
    kind: 'Log',
    label: '日志',
    desc: '{{path}} 模板调试输出',
    shape: 'flow-log',
    geometry: 'rect',
    icon: 'LOG',
    color: '#1677ff',
    bg: '#e6f4ff',
  },
  {
    kind: 'Throw',
    label: '抛异常',
    desc: '条件成立抛业务异常',
    shape: 'flow-throw',
    geometry: 'rect',
    icon: 'ERR',
    color: '#cf1322',
    bg: '#fff1f0',
  },
  {
    kind: 'Mask',
    label: '脱敏',
    desc: '手机号/密码等打码',
    shape: 'flow-mask',
    geometry: 'rect',
    icon: '***',
    color: '#c41d7f',
    bg: '#fff0f6',
  },
  {
    kind: 'End',
    label: '结束',
    desc: '最终 API 出参',
    shape: 'flow-end',
    geometry: 'circle',
    icon: '■',
    color: '#595959',
    bg: '#fafafa',
  },
];

export function getPaletteItem(kind: string): NodePaletteItem {
  const normalized = normalizeNodeKind(kind);
  return (
    NODE_PALETTE.find((x) => x.kind === normalized) || {
      kind: 'Log',
      label: kind,
      desc: '',
      shape: 'flow-log',
      geometry: 'rect',
      icon: 'LOG',
      color: '#1677ff',
      bg: '#e6f4ff',
    }
  );
}

export function nodeSize(kind: string) {
  const item = getPaletteItem(kind);
  if (item.geometry === 'circle') return { width: 72, height: 72 };
  if (item.geometry === 'diamond') return { width: 140, height: 100 };
  return { width: 168, height: 64 };
}

export function formatDateTime(value?: Date | null | string) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { hour12: false });
}
