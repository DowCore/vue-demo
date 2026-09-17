import type { Node } from '@antv/x6';

import type { FlowGraphData } from './dsl-graph';
import type { FlowNodeKind } from './flow-meta';

import {
  Clipboard,
  Dnd,
  Export,
  Graph,
  History,
  Keyboard,
  MiniMap,
  Selection,
  Snapline,
} from '@antv/x6';

import { defaultNodeData, nextNodeId, nodeCaption } from './dsl-graph';
import { getPaletteItem, NODE_PALETTE, nodeSize } from './flow-meta';

export type SelectionHandler = (payload: {
  kind: '' | 'edge' | 'node';
  data?: any;
}) => void;

export interface FlowCanvasOptions {
  container: HTMLElement;
  minimap: HTMLElement;
  data: FlowGraphData;
  dark?: boolean;
  onSelect: SelectionHandler;
  onDirty: () => void;
  onZoom?: (percent: number) => void;
  onRequestPanel: () => void;
  onContextMenu: (payload: {
    kind: 'blank' | 'edge' | 'node';
    x: number;
    y: number;
    cellId?: string;
    graphPoint: { x: number; y: number };
  }) => void;
}

const PORTS = {
  groups: {
    top: {
      position: 'top',
      attrs: {
        circle: {
          r: 4,
          magnet: true,
          stroke: '#5F95FF',
          strokeWidth: 1,
          fill: '#fff',
        },
      },
    },
    right: {
      position: 'right',
      attrs: {
        circle: {
          r: 4,
          magnet: true,
          stroke: '#5F95FF',
          strokeWidth: 1,
          fill: '#fff',
        },
      },
    },
    bottom: {
      position: 'bottom',
      attrs: {
        circle: {
          r: 4,
          magnet: true,
          stroke: '#5F95FF',
          strokeWidth: 1,
          fill: '#fff',
        },
      },
    },
    left: {
      position: 'left',
      attrs: {
        circle: {
          r: 4,
          magnet: true,
          stroke: '#5F95FF',
          strokeWidth: 1,
          fill: '#fff',
        },
      },
    },
  },
  items: [
    { id: 'top', group: 'top' },
    { id: 'right', group: 'right' },
    { id: 'bottom', group: 'bottom' },
    { id: 'left', group: 'left' },
  ],
};

let shapesReady = false;

function registerShapes() {
  if (shapesReady) return;
  shapesReady = true;

  Graph.registerEdge(
    'flow-edge',
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

  for (const item of NODE_PALETTE) {
    if (item.geometry === 'circle') {
      Graph.registerNode(
        item.shape,
        {
          inherit: 'circle',
          width: 76,
          height: 76,
          attrs: {
            body: {
              stroke: item.color,
              strokeWidth: 2,
              fill: item.bg,
            },
            label: {
              fontSize: 13,
              fontWeight: 600,
              fill: item.color,
            },
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
          width: 140,
          height: 84,
          attrs: {
            body: {
              refPoints: '0,42 70,0 140,42 70,84',
              stroke: item.color,
              strokeWidth: 1.5,
              fill: item.bg,
            },
            label: {
              fontSize: 12,
              fontWeight: 600,
              fill: item.color,
            },
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
          width: 228,
          height: 60,
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
              height: 60,
              x: 0,
              y: 0,
              rx: 2,
              fill: item.color,
            },
            iconWrap: {
              x: 16,
              y: 14,
              width: 32,
              height: 32,
              rx: 8,
              fill: item.bg,
            },
            icon: {
              x: 32,
              y: 30,
              textAnchor: 'middle',
              textVerticalAnchor: 'middle',
              fontSize: 9,
              fontWeight: 700,
              fill: item.color,
              text: item.icon,
            },
            title: {
              x: 56,
              y: 24,
              fontSize: 13,
              fontWeight: 600,
              fill: '#111827',
              textAnchor: 'start',
              textVerticalAnchor: 'middle',
            },
            desc: {
              x: 56,
              y: 42,
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

function captionFromData(data: Record<string, unknown>) {
  let items: undefined | unknown[];
  try {
    const raw = data.itemsJson;
    if (typeof raw === 'string' && raw.trim()) {
      items = JSON.parse(raw);
    }
  } catch {
    items = undefined;
  }
  return nodeCaption({
    type: String(data.nodeType || ''),
    async: !!data.asyncMode,
    asyncMode: !!data.asyncMode,
    expression: String(data.expression || ''),
    message: String(data.message || ''),
    name: String(data.name || ''),
    url: String(data.url || ''),
    method: String(data.method || ''),
    items: Array.isArray(items) ? items : undefined,
  } as any);
}

export function applyNodeVisual(node: Node, data: Record<string, unknown>) {
  const kind = String(data.nodeType || '');
  const item = getPaletteItem(kind);
  const text = captionFromData(data);
  if (item.geometry === 'rect') {
    node.setAttrByPath('title/text', text);
    node.setAttrByPath('desc/text', item.desc);
    node.setAttrByPath('icon/text', item.icon);
  } else {
    node.attr('label/text', text);
  }
}

export function createNodeMetadata(
  kind: FlowNodeKind,
  x: number,
  y: number,
  data?: Record<string, unknown>,
  id?: string,
) {
  const item = getPaletteItem(kind);
  const size = nodeSize(kind);
  const payload = { ...defaultNodeData(kind), ...data, nodeType: kind };
  const label = captionFromData(payload);
  const meta: Record<string, unknown> = {
    id: id || nextNodeId(kind),
    shape: item.shape,
    x,
    y,
    width: size.width,
    height: size.height,
    data: payload,
  };
  if (item.geometry === 'rect') {
    meta.attrs = { title: { text: label }, desc: { text: item.desc } };
  } else {
    meta.label = label;
  }
  return meta;
}

function toGraphJson(data: FlowGraphData) {
  return {
    nodes: data.nodes.map((n) =>
      createNodeMetadata(
        String(n.data?.nodeType || 'Log') as FlowNodeKind,
        n.x,
        n.y,
        n.data,
        n.id,
      ),
    ),
    edges: data.edges.map((e) => {
      const branch = normalizeBranchData(
        e.data || {
          combine:
            e.label && e.label !== 'default' && e.label !== 'else'
              ? e.label
              : '',
          isDefault: e.label === 'default' || e.label === 'else',
        },
      );
      return {
        id: e.id,
        shape: 'flow-edge',
        source: { cell: e.source, port: 'bottom' },
        target: { cell: e.target, port: 'top' },
        data: {
          when: '',
          combine: branch.combine,
          isDefault: branch.isDefault,
        },
        labels: branch.label
          ? [{ attrs: { label: { text: branch.label } } }]
          : [],
      };
    }),
  };
}

export function graphToFlowData(graph: Graph): FlowGraphData {
  const json = graph.toJSON() as { cells?: any[] };
  const cells = json.cells || [];
  const nodes: FlowGraphData['nodes'] = [];
  const edges: FlowGraphData['edges'] = [];

  for (const cell of cells) {
    if (cell.shape === 'flow-edge' || cell.shape === 'edge') {
      const source =
        typeof cell.source === 'string' ? cell.source : cell.source?.cell;
      const target =
        typeof cell.target === 'string' ? cell.target : cell.target?.cell;
      const data = normalizeBranchData(cell.data || {});
      const label =
        data.label || String(cell.labels?.[0]?.attrs?.label?.text || '');
      edges.push({
        id: String(cell.id),
        source: String(source || ''),
        target: String(target || ''),
        label,
        data: {
          when: '',
          combine: data.combine,
          isDefault: data.isDefault,
        },
      });
    } else {
      nodes.push({
        id: String(cell.id),
        shape: cell.shape,
        x: cell.position?.x ?? cell.x ?? 0,
        y: cell.position?.y ?? cell.y ?? 0,
        width: cell.size?.width ?? cell.width,
        height: cell.size?.height ?? cell.height,
        label: cell.attrs?.title?.text || cell.attrs?.label?.text || cell.label,
        data: cell.data || {},
      });
    }
  }

  return { engine: 'x6', nodes, edges };
}

/** 统一出边标签：优先 combine / else，兼容旧 true/false、default */
export function normalizeBranchData(data: Record<string, unknown> = {}) {
  let combine = String(data.combine || '').trim();
  let isDefault = !!data.isDefault;
  const when = String(data.when || '').trim();

  if (combine === 'default' || combine === 'else') {
    isDefault = true;
    combine = '';
  }

  if (!combine && !isDefault) {
    if (when === 'true') combine = '1';
    else if (when === 'false') isDefault = true;
  }

  const label = combine || (isDefault ? 'else' : '') || '';
  return {
    when: '',
    combine,
    isDefault,
    label,
  };
}

export function setEdgeLabel(graph: Graph, edgeId: string, when: string) {
  const edge = graph.getCellById(edgeId);
  if (!edge || !edge.isEdge()) return;
  // 旧 API：不再写入 when，true → combine=1，false → default
  if (when === 'true') {
    setEdgeBranchData(graph, edgeId, {
      when: '',
      combine: '1',
      isDefault: false,
    });
  } else if (when === 'false') {
    setEdgeBranchData(graph, edgeId, {
      when: '',
      combine: '',
      isDefault: true,
    });
  } else {
    setEdgeBranchData(graph, edgeId, {
      when: '',
      combine: when || '',
      isDefault: false,
    });
  }
}

export function setEdgeBranchData(
  graph: Graph,
  edgeId: string,
  patch: { when?: string; combine?: string; isDefault?: boolean },
) {
  const edge = graph.getCellById(edgeId);
  if (!edge || !edge.isEdge()) return;
  const merged = { ...edge.getData(), ...patch };
  const next = normalizeBranchData(merged);
  edge.setData({ ...edge.getData(), ...next });
  if (next.label) {
    edge.setLabels([{ attrs: { label: { text: next.label } } }]);
  } else {
    edge.setLabels([]);
  }
}

function normalizeAllEdges(graph: Graph) {
  graph.getEdges().forEach((edge) => {
    const next = normalizeBranchData(edge.getData() || {});
    edge.setData({ ...edge.getData(), ...next });
    if (next.label) {
      edge.setLabels([{ attrs: { label: { text: next.label } } }]);
    } else {
      edge.setLabels([]);
    }
  });
}

export class FlowCanvas {
  graph: Graph;
  private dnd: Dnd;
  private minimap: MiniMap;
  private selection: Selection;

  constructor(options: FlowCanvasOptions) {
    registerShapes();
    const {
      container,
      minimap,
      data,
      dark,
      onSelect,
      onDirty,
      onZoom,
      onRequestPanel,
      onContextMenu,
    } = options;

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
        snap: { radius: 24 },
        createEdge: () =>
          this.graph.createEdge({
            shape: 'flow-edge',
            zIndex: -1,
          }),
        validateMagnet: ({ magnet }) =>
          magnet.getAttribute('port-group') !== 'top',
        validateConnection: ({
          sourceMagnet,
          targetMagnet,
          sourceCell,
          targetCell,
        }) => {
          if (!sourceMagnet || !targetMagnet || sourceCell === targetCell) {
            return false;
          }
          const sourceGroup = sourceMagnet.getAttribute('port-group');
          const targetGroup = targetMagnet.getAttribute('port-group');
          return sourceGroup !== 'top' && targetGroup !== 'bottom';
        },
      },
      highlighting: {
        magnetAdsorbed: {
          name: 'stroke',
          args: { attrs: { fill: '#fff', stroke: '#5F95FF', strokeWidth: 2 } },
        },
      },
    });

    this.selection = new Selection({
      enabled: true,
      multiple: true,
      rubberband: false,
      movable: true,
      showNodeSelectionBox: true,
      pointerEvents: 'none',
    });

    this.graph.use(this.selection);
    this.graph.use(new Snapline({ enabled: true }));
    this.graph.use(new Keyboard({ enabled: true }));
    this.graph.use(new Clipboard({ enabled: true }));
    this.graph.use(new History({ enabled: true }));
    this.graph.use(new Export());
    this.minimap = new MiniMap({
      container: minimap,
      width: 180,
      height: 110,
      padding: 8,
    });
    this.graph.use(this.minimap);

    this.dnd = new Dnd({
      target: this.graph,
      scaled: false,
    });

    this.graph.fromJSON(toGraphJson(data));
    normalizeAllEdges(this.graph);
    this.graph.zoomToFit({ padding: 48, maxScale: 1 });
    this.graph.cleanHistory();

    this.graph.on('node:click', ({ node }) => {
      onSelect({
        kind: 'node',
        data: { id: node.id, properties: node.getData() || {} },
      });
    });
    this.graph.on('edge:click', ({ edge }) => {
      const data = normalizeBranchData(edge.getData() || {});
      onSelect({
        kind: 'edge',
        data: {
          id: edge.id,
          properties: data,
          text: data.label,
        },
      });
    });
    this.graph.on('blank:click', () => onSelect({ kind: '' }));
    this.graph.on('node:dblclick', ({ node }) => {
      onSelect({
        kind: 'node',
        data: { id: node.id, properties: node.getData() || {} },
      });
      onRequestPanel();
    });
    this.graph.on('history:change', () => onDirty());
    this.graph.on('cell:added', () => onDirty());
    this.graph.on('cell:removed', () => onDirty());
    this.graph.on('node:moved', () => onDirty());
    this.graph.on('scale', () => onZoom?.(Math.round(this.graph.zoom() * 100)));

    const openMenu = (
      kind: 'blank' | 'edge' | 'node',
      e: { clientX: number; clientY: number; preventDefault?: () => void },
      cellId?: string,
    ) => {
      e.preventDefault?.();
      const local = this.graph.clientToLocal(e.clientX, e.clientY);
      onContextMenu({
        kind,
        x: e.clientX,
        y: e.clientY,
        cellId,
        graphPoint: { x: local.x, y: local.y },
      });
    };

    this.graph.on('node:contextmenu', ({ e, node }) => {
      onSelect({
        kind: 'node',
        data: { id: node.id, properties: node.getData() || {} },
      });
      openMenu('node', e, node.id);
    });
    this.graph.on('edge:contextmenu', ({ e, edge }) => {
      const data = normalizeBranchData(edge.getData() || {});
      onSelect({
        kind: 'edge',
        data: { id: edge.id, properties: data, text: data.label },
      });
      openMenu('edge', e, edge.id);
    });
    this.graph.on('blank:contextmenu', ({ e }) => {
      onSelect({ kind: '' });
      openMenu('blank', e);
    });

    this.graph.bindKey(['ctrl+z', 'meta+z'], () => {
      this.graph.undo();
      return false;
    });
    this.graph.bindKey(['ctrl+y', 'meta+shift+z'], () => {
      this.graph.redo();
      return false;
    });
    this.graph.bindKey(['delete', 'backspace'], () => {
      const cells = this.graph.getSelectedCells();
      if (cells.length > 0) this.graph.removeCells(cells);
      onSelect({ kind: '' });
      return false;
    });
    this.graph.bindKey(['ctrl+c', 'meta+c'], () => {
      const cells = this.graph.getSelectedCells();
      if (cells.length > 0) this.graph.copy(cells);
      return false;
    });
    this.graph.bindKey(['ctrl+v', 'meta+v'], () => {
      this.graph.paste({ offset: 32 });
      return false;
    });
  }

  addNode(kind: FlowNodeKind, x: number, y: number) {
    return this.graph.addNode(createNodeMetadata(kind, x, y) as any);
  }

  cloneSelected() {
    const cells = this.graph.getSelectedCells().filter((c) => c.isNode());
    if (cells.length === 0) return;
    this.graph.copy(cells);
    this.graph.paste({ offset: 40 });
  }

  deleteById(id: string) {
    const cell = this.graph.getCellById(id);
    if (cell) this.graph.removeCell(cell);
  }

  destroy() {
    this.dnd.dispose();
    this.graph.dispose();
  }

  exportPng(fileName: string) {
    this.graph.exportPNG(fileName, {
      padding: 24,
      backgroundColor: '#ffffff',
      quality: 1,
    });
  }

  fitView() {
    this.graph.zoomToFit({ padding: 48, maxScale: 1 });
  }

  getOutgoingEdges(nodeId: string) {
    const node = this.graph.getCellById(nodeId);
    if (!node || !node.isNode()) return [];
    return (
      this.graph.getOutgoingEdges(node)?.map((edge) => {
        const data = normalizeBranchData(edge.getData() || {});
        const target = edge.getTargetCellId();
        return {
          id: edge.id,
          targetId: target || '',
          combine: data.combine,
          isDefault: data.isDefault,
          label: data.label,
        };
      }) || []
    );
  }

  getZoom() {
    return this.graph.zoom();
  }

  redo() {
    this.graph.redo();
  }

  resetZoom() {
    this.graph.zoom(1, { absolute: true });
    this.graph.centerContent();
  }

  setEdgeBranch(
    id: string,
    patch: { when?: string; combine?: string; isDefault?: boolean },
  ) {
    setEdgeBranchData(this.graph, id, patch);
  }

  setEdgeWhen(id: string, when: string) {
    setEdgeLabel(this.graph, id, when);
  }

  setMiniMapVisible(visible: boolean) {
    const el = (this.minimap as any).container as HTMLElement | undefined;
    if (el) el.style.display = visible ? 'block' : 'none';
  }

  setRubberband(on: boolean) {
    if (on) {
      this.selection.enableRubberband();
      this.graph.togglePanning(false);
    } else {
      this.selection.disableRubberband();
      this.graph.togglePanning(true);
    }
  }

  startDrag(kind: FlowNodeKind, e: MouseEvent) {
    const node = this.graph.createNode(createNodeMetadata(kind, 0, 0) as any);
    this.dnd.start(node, e);
  }

  toData() {
    return graphToFlowData(this.graph);
  }

  undo() {
    this.graph.undo();
  }

  updateNodeData(id: string, data: Record<string, unknown>) {
    const cell = this.graph.getCellById(id);
    if (!cell || !cell.isNode()) return;
    cell.setData(data);
    applyNodeVisual(cell, data);
  }

  zoomBy(delta: number) {
    const next = Math.min(2.2, Math.max(0.35, this.graph.zoom() + delta));
    this.graph.zoom(next, { absolute: true });
  }
}
