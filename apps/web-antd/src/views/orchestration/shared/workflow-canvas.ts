import type { Node } from '@antv/x6';

import type { WfConditionItem } from '../workflows/workflow-condition-editor.vue';

import {
  Clipboard,
  Dnd,
  Graph,
  History,
  Keyboard,
  MiniMap,
  Selection,
  Snapline,
} from '@antv/x6';

export type WfKind = 'approver' | 'cc' | 'condition' | 'end' | 'start';

export interface WfGraphNode {
  id: string;
  type: WfKind;
  x: number;
  y: number;
  data: Record<string, unknown>;
}

export interface WfGraphEdge {
  id: string;
  source: string;
  target: string;
  data?: {
    items?: WfConditionItem[];
    combine?: string;
    conditionField?: string;
    conditionOp?: string;
    conditionValue?: string;
    /** W6：条件分支优先级，数字小者优先 */
    priority?: number;
    /** W6：显式默认分支（无条件兜底） */
    isDefault?: boolean;
  };
}

export interface WfGraphData {
  nodes: WfGraphNode[];
  edges: WfGraphEdge[];
}

export type WfSelection =
  | { kind: '' }
  | { kind: 'edge'; id: string; data: Record<string, unknown> }
  | { kind: 'node'; id: string; data: Record<string, unknown> };

interface PaletteItem {
  kind: WfKind;
  label: string;
  desc: string;
  shape: string;
  geometry: 'circle' | 'diamond' | 'rect';
  color: string;
  bg: string;
  icon: string;
  width: number;
  height: number;
}

const PALETTE: PaletteItem[] = [
  {
    kind: 'start',
    label: '开始',
    desc: '流程入口',
    shape: 'wf-start',
    geometry: 'circle',
    color: '#1677ff',
    bg: '#e6f4ff',
    icon: '始',
    width: 76,
    height: 76,
  },
  {
    kind: 'approver',
    label: '接收',
    desc: '办理人处理',
    shape: 'wf-receive',
    geometry: 'rect',
    color: '#d46b08',
    bg: '#fff7e6',
    icon: '收',
    width: 210,
    height: 64,
  },
  {
    kind: 'cc',
    label: '抄送',
    desc: '通知，不挡流程',
    shape: 'wf-cc',
    geometry: 'rect',
    color: '#08979c',
    bg: '#e6fffb',
    icon: '抄',
    width: 210,
    height: 64,
  },
  {
    kind: 'condition',
    label: '条件',
    desc: '按连线分叉',
    shape: 'wf-condition',
    geometry: 'diamond',
    color: '#d48806',
    bg: '#fffbe6',
    icon: '件',
    width: 140,
    height: 84,
  },
  {
    kind: 'end',
    label: '结束',
    desc: '流程终止',
    shape: 'wf-end',
    geometry: 'circle',
    color: '#595959',
    bg: '#f5f5f5',
    icon: '止',
    width: 76,
    height: 76,
  },
];

const PORTS = {
  groups: {
    top: portGroup('top'),
    right: portGroup('right'),
    bottom: portGroup('bottom'),
    left: portGroup('left'),
  },
  items: [
    { id: 'top', group: 'top' },
    { id: 'right', group: 'right' },
    { id: 'bottom', group: 'bottom' },
    { id: 'left', group: 'left' },
  ],
};

function portGroup(position: string) {
  return {
    position,
    attrs: {
      circle: {
        r: 4,
        magnet: true,
        stroke: '#5F95FF',
        strokeWidth: 1,
        fill: '#fff',
      },
    },
  };
}

function paletteOf(kind: string) {
  const found = PALETTE.find((item) => item.kind === kind);
  if (found) return found;
  const fallback = PALETTE[1];
  if (!fallback) throw new Error('审批节点面板为空');
  return fallback;
}

let shapesReady = false;

function registerShapes() {
  if (shapesReady) return;
  shapesReady = true;

  Graph.registerEdge(
    'wf-edge',
    {
      inherit: 'edge',
      attrs: {
        line: {
          stroke: '#C0C6CF',
          strokeWidth: 1.5,
          targetMarker: { name: 'block', width: 10, height: 8 },
        },
      },
      defaultLabel: {
        markup: [
          { tagName: 'rect', selector: 'body' },
          { tagName: 'text', selector: 'label' },
        ],
        attrs: {
          label: {
            fill: '#64748b',
            fontSize: 11,
            textAnchor: 'middle',
            textVerticalAnchor: 'middle',
          },
          body: {
            ref: 'label',
            fill: '#ffffff',
            stroke: '#e5e7eb',
            rx: 4,
            ry: 4,
            refWidth: 10,
            refHeight: 6,
            refX: -5,
            refY: -3,
          },
        },
        position: { distance: 0.5 },
      },
    },
    true,
  );

  for (const item of PALETTE) {
    if (item.geometry === 'circle') {
      Graph.registerNode(
        item.shape,
        {
          inherit: 'circle',
          width: item.width,
          height: item.height,
          attrs: {
            body: { stroke: item.color, strokeWidth: 2, fill: item.bg },
            label: { fontSize: 13, fontWeight: 600, fill: item.color },
          },
          ports: PORTS,
        },
        true,
      );
    } else if (item.geometry === 'diamond') {
      Graph.registerNode(
        item.shape,
        {
          inherit: 'polygon',
          width: item.width,
          height: item.height,
          attrs: {
            body: {
              refPoints: '0,42 70,0 140,42 70,84',
              stroke: item.color,
              strokeWidth: 1.5,
              fill: item.bg,
            },
            label: { fontSize: 13, fontWeight: 600, fill: item.color },
          },
          ports: PORTS,
        },
        true,
      );
    } else {
      Graph.registerNode(
        item.shape,
        {
          inherit: 'rect',
          width: item.width,
          height: item.height,
          markup: [
            { tagName: 'rect', selector: 'body' },
            { tagName: 'rect', selector: 'accent' },
            { tagName: 'rect', selector: 'iconWrap' },
            { tagName: 'text', selector: 'icon' },
            { tagName: 'text', selector: 'title' },
            { tagName: 'text', selector: 'desc' },
          ],
          attrs: {
            body: {
              stroke: '#E5E7EB',
              strokeWidth: 1,
              fill: '#FFFFFF',
              rx: 10,
              ry: 10,
            },
            accent: {
              width: 4,
              height: item.height,
              x: 0,
              y: 0,
              fill: item.color,
            },
            iconWrap: {
              x: 14,
              y: 16,
              width: 32,
              height: 32,
              rx: 8,
              fill: item.bg,
            },
            icon: {
              x: 30,
              y: 32,
              textAnchor: 'middle',
              textVerticalAnchor: 'middle',
              fontSize: 12,
              fontWeight: 700,
              fill: item.color,
              text: item.icon,
            },
            title: {
              x: 54,
              y: 24,
              fontSize: 13,
              fontWeight: 600,
              fill: '#111827',
              textAnchor: 'start',
              textVerticalAnchor: 'middle',
            },
            desc: {
              x: 54,
              y: 44,
              fontSize: 11,
              fill: '#9CA3AF',
              textAnchor: 'start',
              textVerticalAnchor: 'middle',
              text: item.desc,
            },
          },
          ports: PORTS,
        },
        true,
      );
    }
  }
}

function nodeId(kind: string) {
  return `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

function defaultData(kind: WfKind): Record<string, unknown> {
  const item = paletteOf(kind);
  return {
    nodeType: kind,
    name: item.label,
    beforeFlowKey: '',
    afterFlowKey: '',
    opinion: kind === 'approver' ? 'optional' : undefined,
    assigneeType: kind === 'approver' || kind === 'cc' ? 'role' : undefined,
    assigneeValue: '',
    assigneeFlowKey: '',
    multi: kind === 'approver' ? 'single' : undefined,
    multiRatio: kind === 'approver' ? 100 : undefined,
    conditionField: '',
    conditionOp: 'gt',
    conditionValue: '',
    conditionText: '',
  };
}

function caption(data: Record<string, unknown>) {
  const name = String(data.name || '').trim();
  return name || paletteOf(String(data.nodeType || '')).label;
}

function assigneeCaption(data: Record<string, unknown>) {
  const value = String(data.assigneeValue || '未填');
  if (data.assigneeType === 'starter') return '发起人';
  if (data.assigneeType === 'flow') {
    return `流程 ${data.assigneeFlowKey || '未选'}`;
  }
  if (data.assigneeType === 'user') return `用户 ${value}`;
  if (data.assigneeType === 'formField') return `字段 ${value}`;
  if (data.assigneeType === 'manager') return '部门主管';
  return `角色 ${value}`;
}

function multiCaption(data: Record<string, unknown>) {
  if (data.multi === 'all') return '会签';
  if (data.multi === 'any') return '或签';
  if (data.multi === 'sequential') return '依次';
  if (data.multi === 'ratio') return `比例 ${data.multiRatio || 100}%`;
  return '单人';
}

function subtitle(data: Record<string, unknown>) {
  const kind = String(data.nodeType || '');
  if (kind !== 'approver' && kind !== 'cc') return paletteOf(kind).desc;
  const who = assigneeCaption(data);
  if (kind === 'cc') return who;
  return `${who} · ${multiCaption(data)}`;
}

function applyVisual(node: Node, data: Record<string, unknown>) {
  const item = paletteOf(String(data.nodeType || ''));
  if (item.geometry === 'rect') {
    node.setAttrByPath('title/text', caption(data));
    node.setAttrByPath('desc/text', subtitle(data));
  } else {
    node.attr('label/text', caption(data));
  }
}

function edgeLabel(data: Record<string, unknown> | undefined) {
  if (data?.isDefault) return '默认分支';
  const items = Array.isArray(data?.items) ? data.items : [];
  const priority = Number(data?.priority || 0);
  const suffix = priority > 0 ? ` [P${priority}]` : '';
  if (items.length > 0) {
    const combine = String(data?.combine || '').trim();
    return `${combine || `${items.length} 条条件`}${suffix}`;
  }
  const field = String(data?.conditionField || '').trim();
  if (!field) return '';
  const op = String(data?.conditionOp || 'eq');
  const value = String(data?.conditionValue || '');
  const symbol: Record<string, string> = {
    gt: '>',
    gte: '≥',
    eq: '=',
    ne: '≠',
    lt: '<',
    contains: '包含',
  };
  return `${field} ${symbol[op] || op} ${value}${suffix}`.trim();
}

function createMetadata(
  kind: WfKind,
  x: number,
  y: number,
  data?: Record<string, unknown>,
  id?: string,
) {
  const item = paletteOf(kind);
  const payload = { ...defaultData(kind), ...data, nodeType: kind };
  const meta: Record<string, unknown> = {
    id: id || nodeId(kind),
    shape: item.shape,
    x,
    y,
    width: item.width,
    height: item.height,
    data: payload,
    ports: PORTS,
  };
  if (item.geometry === 'rect') {
    meta.attrs = {
      title: { text: caption(payload) },
      desc: { text: subtitle(payload) },
    };
  } else {
    meta.label = caption(payload);
  }
  return meta;
}

export function defaultWorkflowGraph(): WfGraphData {
  return {
    nodes: [
      {
        id: 'start',
        type: 'start',
        x: 320,
        y: 48,
        data: defaultData('start'),
      },
      {
        id: 'approver_1',
        type: 'approver',
        x: 250,
        y: 200,
        data: { ...defaultData('approver'), name: '接收' },
      },
      {
        id: 'end',
        type: 'end',
        x: 320,
        y: 360,
        data: defaultData('end'),
      },
    ],
    edges: [
      { id: 'e_start', source: 'start', target: 'approver_1' },
      { id: 'e_approver_1', source: 'approver_1', target: 'end' },
    ],
  };
}

/** 旧的 childNode 链铺到画布上。已经是 nodes/edges 的直接用。 */
export function processJsonToGraph(json: string): WfGraphData {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = null;
  }
  if (parsed && Array.isArray(parsed.nodes)) {
    return {
      nodes: parsed.nodes,
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
  }
  if (!parsed || !parsed.nodeId) return defaultWorkflowGraph();
  const nodes: WfGraphNode[] = [];
  const edges: WfGraphEdge[] = [];
  let current = parsed;
  let prev = '';
  let y = 48;
  while (current) {
    const type = (current.type || 'approver') as WfKind;
    const item = paletteOf(type);
    const id = String(current.nodeId);
    const data = { ...current, nodeType: type };
    delete data.childNode;
    delete data.nodeId;
    delete data.type;
    nodes.push({
      id,
      type,
      x: 360 - item.width / 2,
      y,
      data,
    });
    if (prev) {
      edges.push({ id: `e_${prev}_${id}`, source: prev, target: id });
    }
    prev = id;
    y += item.height + 72;
    current = current.childNode;
  }
  return nodes.length > 0 ? { nodes, edges } : defaultWorkflowGraph();
}

export class WorkflowCanvas {
  graph: Graph;
  private dnd: Dnd;
  private minimap: MiniMap;

  constructor(options: {
    container: HTMLElement;
    minimap: HTMLElement;
    data: WfGraphData;
    dark?: boolean;
    onSelect: (payload: WfSelection) => void;
    onDirty: () => void;
    onZoom?: (percent: number) => void;
  }) {
    registerShapes();
    const { container, minimap, data, dark, onSelect, onDirty, onZoom } =
      options;
    this.graph = new Graph({
      container,
      autoResize: true,
      background: { color: dark ? '#0f172a' : '#F5F7FA' },
      grid: {
        visible: true,
        type: 'dot',
        size: 16,
        args: { color: dark ? '#334155' : '#D0D5DD', thickness: 1 },
      },
      panning: { enabled: true, eventTypes: ['leftMouseDown', 'mouseWheel'] },
      mousewheel: {
        enabled: true,
        modifiers: ['ctrl', 'meta'],
        minScale: 0.35,
        maxScale: 2.2,
      },
      connecting: {
        router: { name: 'manhattan', args: { padding: 24 } },
        connector: { name: 'rounded', args: { radius: 8 } },
        anchor: 'center',
        connectionPoint: 'anchor',
        allowBlank: false,
        allowLoop: false,
        allowNode: false,
        allowEdge: false,
        highlight: true,
        snap: { radius: 28 },
        createEdge: () =>
          this.graph.createEdge({ shape: 'wf-edge', zIndex: -1 }),
        validateMagnet: ({ magnet }) =>
          magnet.getAttribute('port-group') !== 'top',
        validateConnection: ({
          sourceMagnet,
          targetMagnet,
          sourceCell,
          targetCell,
        }) => {
          if (!sourceMagnet || !targetMagnet || sourceCell === targetCell)
            return false;
          return (
            sourceMagnet.getAttribute('port-group') !== 'top' &&
            targetMagnet.getAttribute('port-group') !== 'bottom'
          );
        },
      },
      highlighting: {
        magnetAdsorbed: {
          name: 'stroke',
          args: { attrs: { fill: '#fff', stroke: '#5F95FF', strokeWidth: 2 } },
        },
      },
    });

    const selection = new Selection({
      enabled: true,
      multiple: true,
      rubberband: false,
      movable: true,
      showNodeSelectionBox: true,
      pointerEvents: 'none',
    });
    this.graph.use(selection);
    this.graph.use(new Snapline({ enabled: true }));
    this.graph.use(new Keyboard({ enabled: true }));
    this.graph.use(new Clipboard({ enabled: true }));
    this.graph.use(new History({ enabled: true }));
    this.minimap = new MiniMap({
      container: minimap,
      width: 180,
      height: 110,
      padding: 8,
    });
    this.graph.use(this.minimap);
    this.dnd = new Dnd({ target: this.graph, scaled: false });

    this.graph.fromJSON(this.toX6(data));
    this.graph.zoomToFit({ padding: 48, maxScale: 1 });
    this.graph.cleanHistory();

    this.graph.on('node:click', ({ node }) => {
      onSelect({ kind: 'node', id: node.id, data: { ...node.getData() } });
    });
    this.graph.on('edge:click', ({ edge }) => {
      onSelect({ kind: 'edge', id: edge.id, data: { ...edge.getData() } });
    });
    this.graph.on('blank:click', () => onSelect({ kind: '' }));
    this.graph.on('history:change', () => onDirty());
    this.graph.on('cell:added', () => onDirty());
    this.graph.on('cell:removed', () => onDirty());
    this.graph.on('node:moved', () => onDirty());
    this.graph.on('edge:connected', ({ edge }) => {
      edge.setData({
        items: [],
        combine: '',
        conditionField: '',
        conditionOp: 'eq',
        conditionValue: '',
      });
      onDirty();
    });
    this.graph.on('scale', () => onZoom?.(Math.round(this.graph.zoom() * 100)));

    const typing = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };
    this.graph.bindKey(['delete', 'backspace'], (event) => {
      if (typing(event as KeyboardEvent)) return;
      this.deleteSelected();
      onSelect({ kind: '' });
      return false;
    });
    this.graph.bindKey(['ctrl+z', 'meta+z'], () => {
      this.graph.undo();
      return false;
    });
    this.graph.bindKey(['ctrl+y', 'meta+shift+z'], () => {
      this.graph.redo();
      return false;
    });
    this.graph.bindKey(['ctrl+c', 'meta+c'], () => {
      const cells = this.graph.getSelectedCells().filter((cell) => {
        return !cell.isNode() || cell.getData()?.nodeType !== 'start';
      });
      if (cells.length > 0) this.graph.copy(cells);
      return false;
    });
    this.graph.bindKey(['ctrl+v', 'meta+v'], () => {
      const pasted = this.graph.paste({ offset: 32 });
      for (const cell of pasted) {
        if (cell.isNode() && cell.getData()?.nodeType === 'start') {
          this.graph.removeCell(cell);
        }
      }
      return false;
    });
  }

  deleteSelected() {
    const cells = this.graph.getSelectedCells().filter((cell) => {
      return !cell.isNode() || cell.getData()?.nodeType !== 'start';
    });
    if (cells.length > 0) this.graph.removeCells(cells);
  }

  destroy() {
    this.dnd.dispose();
    this.graph.dispose();
  }

  fitView() {
    this.graph.zoomToFit({ padding: 48, maxScale: 1 });
  }

  redo() {
    this.graph.redo();
  }

  resetZoom() {
    this.graph.zoom(1, { absolute: true });
    this.graph.centerContent();
  }

  setMiniMapVisible(visible: boolean) {
    const el = (this.minimap as any).container as HTMLElement | undefined;
    if (el) el.style.display = visible ? 'block' : 'none';
  }

  startDrag(kind: WfKind, event: MouseEvent) {
    if (kind === 'start') return;
    const node = this.graph.createNode(createMetadata(kind, 0, 0) as any);
    this.dnd.start(node, event);
  }

  toData(): WfGraphData {
    const json = this.graph.toJSON() as { cells?: any[] };
    const nodes: WfGraphNode[] = [];
    const edges: WfGraphEdge[] = [];
    for (const cell of json.cells || []) {
      if (cell.shape === 'wf-edge' || cell.shape === 'edge') {
        const source =
          typeof cell.source === 'string' ? cell.source : cell.source?.cell;
        const target =
          typeof cell.target === 'string' ? cell.target : cell.target?.cell;
        if (!source || !target) continue;
        edges.push({
          id: cell.id,
          source,
          target,
          data: {
            items: Array.isArray(cell.data?.items) ? cell.data.items : [],
            combine: cell.data?.combine || '',
            conditionField: cell.data?.conditionField || '',
            conditionOp: cell.data?.conditionOp || 'eq',
            conditionValue: cell.data?.conditionValue || '',
            priority: Number(cell.data?.priority || 0),
            isDefault: cell.data?.isDefault === true,
          },
        });
        continue;
      }
      const kind = String(cell.data?.nodeType || 'approver') as WfKind;
      nodes.push({
        id: cell.id,
        type: kind,
        x: cell.position?.x ?? 0,
        y: cell.position?.y ?? 0,
        data: { ...cell.data, nodeType: kind },
      });
    }
    return { nodes, edges };
  }

  undo() {
    this.graph.undo();
  }

  updateEdgeData(id: string, data: Record<string, unknown>) {
    const cell = this.graph.getCellById(id);
    if (!cell || !cell.isEdge()) return;
    const next = { ...cell.getData(), ...data };
    cell.setData(next, { overwrite: true });
    const text = edgeLabel(next);
    cell.setLabels(text ? [{ attrs: { label: { text } } }] : []);
  }

  updateNodeData(id: string, data: Record<string, unknown>) {
    const cell = this.graph.getCellById(id);
    if (!cell || !cell.isNode()) return;
    const next = { ...cell.getData(), ...data };
    cell.setData(next, { overwrite: true });
    applyVisual(cell, next);
  }

  zoomBy(delta: number) {
    const next = Math.min(2.2, Math.max(0.35, this.graph.zoom() + delta));
    this.graph.zoom(next, { absolute: true });
  }

  private toX6(data: WfGraphData) {
    return {
      nodes: data.nodes.map((node) =>
        createMetadata(
          node.type || (node.data?.nodeType as WfKind) || 'approver',
          node.x,
          node.y,
          node.data,
          node.id,
        ),
      ),
      edges: data.edges.map((edge) => {
        const text = edgeLabel(edge.data);
        return {
          id: edge.id,
          shape: 'wf-edge',
          source: { cell: edge.source, port: 'bottom' },
          target: { cell: edge.target, port: 'top' },
          data: edge.data || {},
          labels: text ? [{ attrs: { label: { text } } }] : [],
          zIndex: -1,
        };
      }),
    };
  }
}
