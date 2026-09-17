<script lang="ts" setup>
import type {
  ConditionItem,
  FlowGraphData,
  InputParameter,
  MaskRule,
  NodeBinding,
  OutputParameter,
} from '../shared/dsl-graph';
import type { FlowNodeKind } from '../shared/flow-meta';

import type { DataSourceLookup, FlowInstance } from '#/api/saas/orchestration';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';

import {
  AutoComplete,
  Button,
  Divider,
  Drawer,
  Form,
  Input,
  message,
  Popover,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  dryRunFlowInstanceApi,
  getDataSourceLookupApi,
  getFlowDefinitionApi,
  publishFlowDefinitionApi,
  updateFlowDefinitionApi,
} from '#/api/saas/orchestration';

import CodeScriptHelp from '../shared/code-script-help.vue';
import ConditionItemsEditor from '../shared/condition-items-editor.vue';
import { FlowCanvas } from '../shared/create-flow-x6';
import {
  collectResultPathHints,
  createDefaultGraph,
  dslToGraph,
  graphToDsl,
  listAssignSampleBindings,
  parseBindings,
  parseDsl,
  parseGraph,
  parseItems,
  serializeBindings,
  serializeItems,
} from '../shared/dsl-graph';
import EndOutputEditor from '../shared/end-output-editor.vue';
import ExecutionTimeline from '../shared/execution-timeline.vue';
import {
  definitionStatusMeta,
  isExecutableKind,
  NODE_PALETTE,
  nodeSize,
  normalizeNodeKind,
} from '../shared/flow-meta';
import MaskRulesEditor from '../shared/mask-rules-editor.vue';
import NodeIoEditor from '../shared/node-io-editor.vue';
import SchemaParamEditor from '../shared/schema-param-editor.vue';
import {
  buildSampleInputJson,
  ensureParamTree,
  flattenInputPaths,
} from '../shared/schema-utils';

defineOptions({ name: 'OrchestrationDesigner' });

const route = useRoute();
const router = useRouter();
const { isDark } = usePreferences();

const canvasRef = ref<HTMLDivElement>();
const minimapRef = ref<HTMLDivElement>();
const loading = ref(false);
const saving = ref(false);
const dirty = ref(false);
const panelCollapsed = ref(false);
const selectionMode = ref(false);
const showMiniMap = ref(true);
const helpOpen = ref(false);
const status = ref(0);
const publishedVersion = ref<number | undefined>();
const zoomPercent = ref(100);
const definitionId = computed(() => String(route.query.id || ''));

const meta = reactive({
  name: '',
  code: '',
  category: '',
});

const selected = reactive({
  kind: '' as '' | 'edge' | 'node',
  id: '',
  nodeType: '' as '' | FlowNodeKind,
  expression: '',
  message: '',
  name: '',
  value: '',
  method: 'GET',
  url: '',
  body: '',
  responseVariable: '',
  strategy: 'firstMatch',
  itemsJson: '[]',
  inputsJson: '[]',
  outputsJson: '[]',
  script: '',
  dataSourceId: '',
  refName: '',
  bodyMode: 'auto',
  headersJson: '[]',
  asyncMode: false,
  resultRoot: '',
  failWhen: '',
  failMessage: '',
  failCode: '',
  failItemsJson: '[]',
  failCombine: '',
  maskStrategy: 'rules',
  itemField: 'rows',
  maskRulesJson: '[]',
  finalOutputsJson: '[]',
  when: '',
  combine: '',
  isDefault: false,
});

const contract = reactive({
  inputs: [] as InputParameter[],
  outputs: [] as OutputParameter[],
});

const showInputsJson = ref(false);
const inputsJsonText = ref('[]');
const outputsJsonText = ref('[]');
const dataSourceOptions = ref<Array<{ label: string; value: string }>>([]);
const codeHelpOpen = ref(false);

let canvas: FlowCanvas | null = null;

async function loadDataSourceLookup() {
  try {
    const res = await getDataSourceLookupApi();
    dataSourceOptions.value = (res.items || []).map((x: DataSourceLookup) => ({
      value: x.code,
      label: `${x.name} (${x.code} · ${x.provider}/${x.family || '?'})`,
    }));
  } catch {
    dataSourceOptions.value = [];
  }
}

function getGraphData(): FlowGraphData {
  return canvas?.toData() || { engine: 'x6', nodes: [], edges: [] };
}

const inputPathHints = computed(() => flattenInputPaths(contract.inputs));

/** 画布非 Vue 响应式；变更时 bump，驱动路径提示重算 */
const graphEpoch = ref(0);
function bumpGraphEpoch() {
  graphEpoch.value += 1;
}

const resultPathHints = computed(() => {
  void graphEpoch.value;
  try {
    return collectResultPathHints(getGraphData());
  } catch {
    return [];
  }
});

const contextPathHints = computed(() => [
  ...inputPathHints.value.map((h) => h.path),
  ...resultPathHints.value,
  'sys.userName',
  'sys.Now',
  'sys.tenantId',
]);

const logTemplateChips = computed(() => {
  const fromInputs = inputPathHints.value.slice(0, 8).map((h) => h.path);
  const fromResults = resultPathHints.value.slice(0, 8);
  return [...fromInputs, ...fromResults, 'sys.userName', 'sys.Now'].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );
});

const httpAsyncSegment = computed({
  get: () => (selected.asyncMode ? 'async' : 'sync'),
  set: (v: string) => {
    selected.asyncMode = v === 'async';
  },
});

const resultRootHints = computed(() => {
  const t = selected.nodeType;
  if (t === 'Code') {
    return [
      { label: 'return — Code 脚本返回值（推荐）', value: 'return' },
      { label: '（空）用 raw 顶层展开字段', value: '' },
    ];
  }
  // Http / 默认：仅 HTTP 信封提示（不含 Code 的 return）
  return [
    { label: 'body — 响应 JSON 根', value: 'body' },
    { label: 'body.data — 常见业务包装', value: 'body.data' },
    { label: 'body.result', value: 'body.result' },
    { label: 'body.payload', value: 'body.payload' },
    { label: 'body.content', value: 'body.content' },
    { label: '（空）整包 raw：statusCode + body', value: '' },
  ];
});

const resultRootHelp = computed(() => {
  const root = String(selected.resultRoot || '').trim();
  const t = selected.nodeType;

  if (t === 'Code') {
    if (!root) {
      return '当前：整包 raw。Code 会把返回对象字段展开到顶层，from 可直接写 score；推荐改填 return 更清晰。';
    }
    if (root === 'return' || root.startsWith('return.')) {
      return '当前：相对脚本返回值 return。出参 from 写返回对象内字段（如 approved、score）；整段返回用 from=. 或 from=return。';
    }
    return `当前：相对路径「${root}」。出参 from 再相对该路径；不确定时建议 resultRoot=return。`;
  }

  // Http
  if (!root) {
    return '当前：整包 raw（{ statusCode, body }）。出参 from 需写完整路径，如 body.data.level 或 statusCode。';
  }
  if (root === 'body') {
    return '当前：相对响应 JSON 根 body。若业务在 body.data 下，from 写 data.xxx，或把根改成 body.data 后 from 只写 xxx。list 用 type=array + map.item。';
  }
  if (root === 'body.data') {
    return '当前：相对常见业务包装 body.data。出参 from 写 data 内字段（如 orderId、lines）；list 选 type=array 并配 map.item。信封仍可用 statusCode / body.status。';
  }
  if (root === 'body.result') {
    return '当前：相对 body.result。出参 from 写 result 内字段；若 result 本身是数组，from 填 . 并 type=array + map.item。';
  }
  if (root === 'body.payload') {
    return '当前：相对 body.payload。出参 from 写 payload 内字段；list 同样用 type=array + map.item。';
  }
  if (root === 'body.content') {
    return '当前：相对 body.content。出参 from 写 content 内字段。';
  }
  if (root.startsWith('body.')) {
    return `当前：相对「${root}」（HTTP body 下自定义路径）。出参 from 再相对该节点；list 用 type=array + map.item；信封字段仍可用 statusCode / body.xxx。`;
  }
  return `当前：相对「${root}」。出参 from 再相对该根；可手写任意嵌套。list 用 type=array + map.item。`;
});

const nodeInputs = computed<NodeBinding[]>({
  get: () => parseBindings(selected.inputsJson || '[]'),
  set: (value) => {
    selected.inputsJson = serializeBindings(value);
  },
});

const nodeOutputs = computed<NodeBinding[]>({
  get: () => parseBindings(selected.outputsJson || '[]'),
  set: (value) => {
    selected.outputsJson = serializeBindings(value);
  },
});

const nodeHeaders = computed<NodeBinding[]>({
  get: () => parseBindings(selected.headersJson || '[]'),
  set: (value) => {
    selected.headersJson = serializeBindings(value);
  },
});

const failItems = computed<ConditionItem[]>({
  get: () => parseItems(selected.failItemsJson || '[]'),
  set: (value) => {
    selected.failItemsJson = serializeItems(value);
  },
});

/** 异常条件可引用：入参、上游出参、本节点已声明出参短名 */
const failPathHints = computed(() => {
  const outs = parseBindings(selected.outputsJson || '[]')
    .map((o) => o.name)
    .filter(Boolean) as string[];
  const nested = outs.flatMap((n) => [n, `${n}.success`, `${n}.code`]);
  return [...outs, ...nested, ...contextPathHints.value].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );
});

function insertLogPath(path: string) {
  const token = `{{${path}}}`;
  const cur = selected.message || '';
  selected.message = cur
    ? `${cur}${cur.endsWith(' ') || cur.endsWith(':') ? '' : ' '}${token}`
    : token;
}

const conditionItems = computed<ConditionItem[]>({
  get: () => parseItems(selected.itemsJson || '[]'),
  set: (value) => {
    selected.itemsJson = serializeItems(value);
  },
});

const outgoingBranches = ref<
  Array<{
    id: string;
    targetId: string;
    combine: string;
    isDefault: boolean;
    label: string;
  }>
>([]);

function refreshOutgoingBranches() {
  if (
    !canvas ||
    selected.kind !== 'node' ||
    selected.nodeType !== 'Condition'
  ) {
    outgoingBranches.value = [];
    return;
  }
  outgoingBranches.value = canvas.getOutgoingEdges(selected.id);
}

function updateBranch(
  edgeId: string,
  patch: { combine?: string; isDefault?: boolean },
) {
  if (!canvas) return;
  const next = {
    when: '',
    combine: patch.combine ?? '',
    isDefault: !!patch.isDefault,
  };
  if (patch.isDefault) {
    next.combine = '';
  }
  canvas.setEdgeBranch(edgeId, next);
  if (selected.kind === 'edge' && selected.id === edgeId) {
    selected.when = '';
    selected.combine = next.combine;
    selected.isDefault = next.isDefault;
  }
  dirty.value = true;
  refreshOutgoingBranches();
}

function addDefaultBranchTemplates() {
  const flow = canvas;
  if (!flow || selected.nodeType !== 'Condition') return;
  const edges = flow.getOutgoingEdges(selected.id);
  if (edges.length === 0) {
    message.warning('请先从条件节点拉出到下游的连线');
    return;
  }
  edges.forEach((edge, i) => {
    if (i === edges.length - 1) {
      flow.setEdgeBranch(edge.id, {
        when: '',
        combine: '',
        isDefault: true,
      });
    } else {
      flow.setEdgeBranch(edge.id, {
        when: '',
        combine: String(i + 1),
        isDefault: false,
      });
    }
  });
  dirty.value = true;
  refreshOutgoingBranches();
  message.success('已按出边顺序设置 combine / else');
}

const ctxMenu = reactive({
  visible: false,
  kind: 'blank' as 'blank' | 'edge' | 'node',
  x: 0,
  y: 0,
  cellId: '',
  graphX: 0,
  graphY: 0,
});

const dryRunOpen = ref(false);
const resultOpen = ref(false);
const variablesJson = ref('{\n  "amount": 1500\n}');
const lastResult = ref<FlowInstance | null>(null);
const syncing = ref(false);

const paletteGroups = computed(() => [
  {
    title: '流程控制',
    items: NODE_PALETTE.filter((x) =>
      ['Condition', 'End', 'Start'].includes(x.kind),
    ),
  },
  {
    title: '动作节点（方法调用）',
    items: NODE_PALETTE.filter((x) =>
      ['Assign', 'Code', 'HttpCall', 'Log', 'Mask', 'Throw'].includes(x.kind),
    ),
  },
]);

const nodeFinalOutputs = computed<OutputParameter[]>({
  get: () => {
    try {
      const parsed = JSON.parse(selected.finalOutputsJson || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  set: (value) => {
    selected.finalOutputsJson = JSON.stringify(value || [], null, 0);
    contract.outputs = value || [];
    outputsJsonText.value = JSON.stringify(contract.outputs, null, 2);
  },
});

const nodeMaskRules = computed<MaskRule[]>({
  get: () => {
    try {
      const parsed = JSON.parse(selected.maskRulesJson || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  set: (value) => {
    selected.maskRulesJson = JSON.stringify(value || [], null, 0);
  },
});

function onInputsChange(next: InputParameter[]) {
  contract.inputs = ensureParamTree(next);
  inputsJsonText.value = JSON.stringify(contract.inputs, null, 2);
  dirty.value = true;
}

function syncContractToText() {
  inputsJsonText.value = JSON.stringify(contract.inputs || [], null, 2);
  outputsJsonText.value = JSON.stringify(contract.outputs || [], null, 2);
}

function applyInputsFromJson() {
  try {
    contract.inputs = ensureParamTree(JSON.parse(inputsJsonText.value || '[]'));
    dirty.value = true;
    message.success('已从 JSON 同步参数列表');
  } catch {
    message.error('请求参数 JSON 无效');
  }
}

function refreshDryRunSample() {
  const sample = buildSampleInputJson(contract.inputs);
  variablesJson.value = JSON.stringify(sample, null, 2);
}

function applyListAssignSample() {
  if (selected.nodeType !== 'Assign') return;
  const sample = listAssignSampleBindings();
  selected.refName = sample.refName;
  selected.inputsJson = serializeBindings(sample.inputs);
  selected.outputsJson = serializeBindings(sample.outputs);
  syncSelectionToCanvas();
  message.success('已填入 list 示例：lineItems 字面量 + type=array 出参');
}
const shortcuts = [
  { keys: 'Ctrl + Z', desc: '撤销' },
  { keys: 'Ctrl + Y', desc: '重做' },
  { keys: 'Ctrl + C / V', desc: '复制粘贴（节点）' },
  { keys: 'Delete / Backspace', desc: '删除选中' },
  { keys: '框选模式', desc: '工具栏开启后拖拽框选' },
  { keys: '右键', desc: '节点 / 连线 / 画布菜单' },
  { keys: '双击节点', desc: '打开属性面板' },
  { keys: 'Ctrl + 滚轮', desc: '缩放画布' },
];

function hideContextMenu() {
  ctxMenu.visible = false;
}

function clearSelection() {
  selected.kind = '';
  selected.id = '';
  selected.nodeType = '';
}

function applySelection(kind: '' | 'edge' | 'node', data?: any) {
  if (!kind || !data) {
    clearSelection();
    return;
  }
  selected.kind = kind;
  selected.id = String(data.id);
  if (kind === 'node') {
    const p = data.properties || {};
    selected.nodeType = normalizeNodeKind(p.nodeType || 'Log') as FlowNodeKind;
    selected.expression = String(p.expression || '');
    selected.message = String(p.message || '');
    selected.name = String(p.name || '');
    selected.value = String(p.value || '');
    selected.method = String(p.method || 'GET');
    selected.url = String(p.url || '');
    selected.body = String(p.body || '');
    selected.responseVariable = String(p.responseVariable || '');
    selected.script = String(p.script || '');
    selected.dataSourceId = String(p.dataSourceId || '');
    selected.refName = String(p.refName || selected.id || '');
    selected.bodyMode = String(p.bodyMode || 'auto');
    selected.headersJson = String(p.headersJson || '[]');
    selected.asyncMode = !!p.asyncMode;
    selected.resultRoot = String(p.resultRoot || '');
    selected.failWhen = String(p.failWhen || '');
    selected.failMessage = String(p.failMessage || '');
    selected.failCode = String(p.failCode || '');
    selected.failItemsJson = String(p.failItemsJson || '[]');
    selected.failCombine = String(p.failCombine || '');
    selected.strategy = 'firstMatch';
    selected.itemsJson = String(p.itemsJson || '[]');
    selected.inputsJson = String(p.inputsJson || '[]');
    selected.outputsJson = String(p.outputsJson || '[]');
    selected.maskStrategy = String(p.maskStrategy || 'rules');
    selected.itemField = String(p.itemField || 'rows');
    selected.maskRulesJson = String(p.maskRulesJson || '[]');
    selected.finalOutputsJson = String(
      p.finalOutputsJson ||
        (selected.nodeType === 'End'
          ? JSON.stringify(contract.outputs || [], null, 0)
          : '[]'),
    );
  } else {
    selected.when = '';
    selected.combine = String(data.properties?.combine || '');
    selected.isDefault = !!data.properties?.isDefault;
    // 旧 true/false 边迁移提示：选中时清空 when，改用 combine
    if (data.properties?.when === 'true' && !selected.combine) {
      selected.combine = '1';
    }
    if (
      data.properties?.when === 'false' &&
      !selected.combine &&
      !selected.isDefault
    ) {
      selected.isDefault = true;
    }
  }
  nextTick(() => refreshOutgoingBranches());
  bumpGraphEpoch();
}

function syncSelectionToCanvas() {
  if (!canvas || !selected.id || syncing.value) return;
  if (selected.kind === 'node') {
    canvas.updateNodeData(selected.id, {
      nodeType: normalizeNodeKind(selected.nodeType || 'Log'),
      expression: selected.expression,
      message: selected.message,
      name: selected.name,
      value: selected.value,
      method: selected.method,
      url: selected.url,
      body: selected.body,
      responseVariable: selected.responseVariable,
      script: selected.script,
      dataSourceId: selected.dataSourceId || '',
      refName: selected.refName || selected.id,
      bodyMode: selected.bodyMode || 'auto',
      headersJson: selected.headersJson || '[]',
      asyncMode: !!selected.asyncMode,
      resultRoot: selected.resultRoot || '',
      failWhen: selected.failWhen || '',
      failMessage: selected.failMessage || '',
      failCode: selected.failCode || '',
      failItemsJson: selected.failItemsJson || '[]',
      failCombine: selected.failCombine || '',
      strategy: selected.strategy,
      itemsJson: selected.itemsJson,
      inputsJson: selected.inputsJson,
      outputsJson: selected.outputsJson,
      maskStrategy: selected.maskStrategy || 'rules',
      itemField: selected.itemField || 'rows',
      maskRulesJson: selected.maskRulesJson || '[]',
      finalOutputsJson: selected.finalOutputsJson || '[]',
    });
  } else if (selected.kind === 'edge') {
    canvas.setEdgeBranch(selected.id, {
      when: '',
      combine: selected.combine || '',
      isDefault: selected.isDefault,
    });
  }
  dirty.value = true;
  if (selected.nodeType === 'Condition') {
    refreshOutgoingBranches();
  }
  bumpGraphEpoch();
}

function refreshZoom() {
  if (!canvas) return;
  zoomPercent.value = Math.round(canvas.getZoom() * 100);
}

function initCanvas(data: FlowGraphData) {
  if (!canvasRef.value || !minimapRef.value) return;
  canvas?.destroy();
  canvas = new FlowCanvas({
    container: canvasRef.value,
    minimap: minimapRef.value,
    data,
    dark: isDark.value,
    onSelect: ({ kind, data: el }) => {
      syncing.value = true;
      applySelection(kind, el);
      nextTick(() => {
        syncing.value = false;
      });
    },
    onDirty: () => {
      dirty.value = true;
      refreshZoom();
    },
    onZoom: (percent) => {
      zoomPercent.value = percent;
    },
    onRequestPanel: () => {
      panelCollapsed.value = false;
    },
    onContextMenu: (payload) => {
      ctxMenu.visible = true;
      ctxMenu.kind = payload.kind;
      ctxMenu.x = payload.x;
      ctxMenu.y = payload.y;
      ctxMenu.cellId = payload.cellId || '';
      ctxMenu.graphX = payload.graphPoint.x;
      ctxMenu.graphY = payload.graphPoint.y;
      nextTick(() => {
        const close = (e: MouseEvent) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest?.('.orch-ctx-menu')) return;
          hideContextMenu();
          window.removeEventListener('mousedown', close);
        };
        window.addEventListener('mousedown', close);
      });
    },
  });
  refreshZoom();
  applyMiniMap();
  applySelectionMode();
}

function applyMiniMap() {
  canvas?.setMiniMapVisible(showMiniMap.value);
}

function applySelectionMode() {
  canvas?.setRubberband(selectionMode.value);
}

async function load() {
  if (!definitionId.value) {
    message.warning('缺少流程 Id');
    router.push('/orchestration/definitions');
    return;
  }
  loading.value = true;
  try {
    const detail = await getFlowDefinitionApi(definitionId.value);
    meta.name = detail.name;
    meta.code = detail.code;
    meta.category = detail.category || '';
    status.value = detail.status;
    publishedVersion.value = detail.publishedVersion;

    const existing = parseGraph(detail.graphJson);
    const dsl = parseDsl(detail.dslJson);
    contract.inputs = ensureParamTree(
      dsl.inputs?.length
        ? dsl.inputs
        : [
            { name: 'amount', type: 'number', required: true, source: 'input' },
            {
              name: 'queryFrom',
              type: 'datetime',
              source: 'system',
              systemExpr: 'sys.Now - 3d',
            },
          ],
    );
    contract.outputs = (() => {
      const end = dsl.nodes?.find((n) => n.type === 'End');
      if (end?.finalOutputs?.length) return end.finalOutputs;
      if (dsl.outputs?.length) return dsl.outputs;
      return [
        {
          name: 'message',
          type: 'string',
          from: 'message',
          visibleTo: { mode: 'all' as const },
        },
      ];
    })();
    syncContractToText();
    refreshDryRunSample();
    const graph =
      existing ||
      (dsl.nodes.length > 0 ? dslToGraph(dsl) : createDefaultGraph());

    await nextTick();
    initCanvas(graph);
    dirty.value = false;
    bumpGraphEpoch();
  } finally {
    loading.value = false;
  }
}

function onPaletteMouseDown(kind: FlowNodeKind, e: MouseEvent) {
  if (!canvas) return;
  canvas.startDrag(kind, e);
}

function addNodeAtMenu(kind: FlowNodeKind) {
  if (!canvas) return;
  const size = nodeSize(kind);
  canvas.addNode(
    kind,
    ctxMenu.graphX - size.width / 2,
    ctxMenu.graphY - size.height / 2,
  );
  hideContextMenu();
  dirty.value = true;
  bumpGraphEpoch();
}

function menuEdit() {
  hideContextMenu();
  panelCollapsed.value = false;
}

function menuClone() {
  hideContextMenu();
  cloneSelected();
}

function menuDelete() {
  hideContextMenu();
  deleteSelected();
}

function menuSetCombine(combine: string) {
  if (!canvas || !ctxMenu.cellId) return;
  canvas.setEdgeBranch(ctxMenu.cellId, {
    when: '',
    combine,
    isDefault: false,
  });
  selected.when = '';
  selected.combine = combine;
  selected.isDefault = false;
  hideContextMenu();
  dirty.value = true;
}

function menuSetDefault() {
  if (!canvas || !ctxMenu.cellId) return;
  canvas.setEdgeBranch(ctxMenu.cellId, {
    when: '',
    combine: '',
    isDefault: true,
  });
  selected.when = '';
  selected.combine = '';
  selected.isDefault = true;
  hideContextMenu();
  dirty.value = true;
}

async function save() {
  if (!canvas) return;
  saving.value = true;
  try {
    contract.inputs = ensureParamTree(contract.inputs);
    syncContractToText();
    const graph = getGraphData();
    const dsl = graphToDsl(graph, {
      inputs: contract.inputs,
      outputs: contract.outputs,
      key: meta.code,
    });
    await updateFlowDefinitionApi(definitionId.value, {
      name: meta.name,
      category: meta.category || undefined,
      graphJson: JSON.stringify(graph),
      dslJson: JSON.stringify(dsl, null, 2),
    });
    dirty.value = false;
    message.success('草稿已保存');
  } finally {
    saving.value = false;
  }
}

async function publish() {
  await save();
  await publishFlowDefinitionApi(definitionId.value);
  publishedVersion.value = (publishedVersion.value ?? 0) + 1;
  status.value = 1;
  message.success(`已发布 v${publishedVersion.value}`);
}

async function dryRun() {
  if (!canvas) return;
  saving.value = true;
  try {
    contract.inputs = ensureParamTree(contract.inputs);
    try {
      contract.outputs = JSON.parse(outputsJsonText.value || '[]');
    } catch {
      /* keep */
    }
    const graph = getGraphData();
    const dsl = graphToDsl(graph, {
      inputs: contract.inputs,
      outputs: contract.outputs,
      key: meta.code,
    });
    const result = await dryRunFlowInstanceApi({
      definitionId: definitionId.value,
      dslJson: JSON.stringify(dsl),
      graphJson: JSON.stringify(graph),
      variablesJson: variablesJson.value,
    });
    lastResult.value = result;
    dryRunOpen.value = false;
    resultOpen.value = true;
    if (result.status === 1) {
      message.success('试运行成功');
    } else {
      message.error(result.error || '试运行失败（业务异常或节点错误）');
    }
  } finally {
    saving.value = false;
  }
}

function undo() {
  canvas?.undo();
}
function redo() {
  canvas?.redo();
}
function fitView() {
  canvas?.fitView();
  refreshZoom();
}
function zoomBy(delta: number) {
  canvas?.zoomBy(delta);
  refreshZoom();
}
function resetZoom() {
  canvas?.resetZoom();
  refreshZoom();
}
function exportPng() {
  if (!canvas) return;
  canvas.exportPng(`${meta.code || 'flow'}.png`);
  message.success('已导出 PNG');
}
function deleteSelected() {
  if (!canvas || !selected.id) return;
  canvas.deleteById(selected.id);
  clearSelection();
  dirty.value = true;
  bumpGraphEpoch();
}
function cloneSelected() {
  if (!canvas || selected.kind !== 'node' || !selected.id) return;
  canvas.cloneSelected();
  dirty.value = true;
  bumpGraphEpoch();
}

watch(selectionMode, applySelectionMode);
watch(showMiniMap, applyMiniMap);

watch(
  () => [
    selected.expression,
    selected.message,
    selected.name,
    selected.value,
    selected.method,
    selected.url,
    selected.body,
    selected.responseVariable,
    selected.script,
    selected.dataSourceId,
    selected.refName,
    selected.bodyMode,
    selected.headersJson,
    selected.asyncMode,
    selected.resultRoot,
    selected.failWhen,
    selected.failMessage,
    selected.failCode,
    selected.failItemsJson,
    selected.failCombine,
    selected.strategy,
    selected.itemsJson,
    selected.inputsJson,
    selected.outputsJson,
    selected.maskStrategy,
    selected.itemField,
    selected.maskRulesJson,
    selected.finalOutputsJson,
    selected.when,
    selected.combine,
    selected.isDefault,
  ],
  () => {
    if (selected.kind) syncSelectionToCanvas();
  },
);

onMounted(() => {
  void loadDataSourceLookup();
  void load();
});
onBeforeUnmount(() => {
  canvas?.destroy();
  canvas = null;
});
</script>

<template>
  <div
    class="orch-designer bg-background text-foreground flex h-[calc(100vh-108px)] min-h-[680px] flex-col overflow-hidden"
  >
    <header
      class="border-border flex shrink-0 items-center gap-3 border-b px-3 py-2"
    >
      <Button type="text" @click="router.push('/orchestration/definitions')">
        <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
      </Button>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <Input
            v-model:value="meta.name"
            class="max-w-[220px] border-0 bg-transparent px-0 text-base font-semibold shadow-none"
            @change="dirty = true"
          />
          <Tag :color="definitionStatusMeta[status]?.color">
            {{ definitionStatusMeta[status]?.text }}
          </Tag>
          <Tag v-if="publishedVersion" color="blue">
            v{{ publishedVersion }}
          </Tag>
          <Tag v-if="dirty" color="orange">未保存</Tag>
          <span class="text-muted-foreground font-mono text-xs">{{
            meta.code
          }}</span>
        </div>
      </div>

      <Space :size="4" wrap>
        <AccessControl
          :codes="['Orchestration.Definitions.Update']"
          type="code"
        >
          <Button :loading="saving" type="primary" @click="save">
            <template #icon><IconifyIcon icon="lucide:save" /></template>
            保存
          </Button>
        </AccessControl>
        <AccessControl :codes="['Orchestration.Instances.Run']" type="code">
          <Button @click="dryRunOpen = true">
            <template #icon>
              <IconifyIcon icon="lucide:flask-conical" />
            </template>
            试运行
          </Button>
        </AccessControl>
        <AccessControl
          :codes="['Orchestration.Definitions.Publish']"
          type="code"
        >
          <Button ghost type="primary" @click="publish">
            <template #icon><IconifyIcon icon="lucide:rocket" /></template>
            发布为 API
          </Button>
        </AccessControl>
      </Space>
    </header>

    <div
      class="border-border bg-card/80 flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-1.5 backdrop-blur"
    >
      <Tooltip title="撤销 Ctrl+Z">
        <Button size="small" type="text" @click="undo">
          <template #icon><IconifyIcon icon="lucide:undo-2" /></template>
        </Button>
      </Tooltip>
      <Tooltip title="重做 Ctrl+Y">
        <Button size="small" type="text" @click="redo">
          <template #icon><IconifyIcon icon="lucide:redo-2" /></template>
        </Button>
      </Tooltip>
      <Divider type="vertical" class="mx-1 h-5" />
      <Tooltip title="缩小">
        <Button size="small" type="text" @click="zoomBy(-0.1)">
          <template #icon><IconifyIcon icon="lucide:zoom-out" /></template>
        </Button>
      </Tooltip>
      <button
        class="text-muted-foreground hover:text-foreground px-1 text-xs tabular-nums"
        @click="resetZoom"
      >
        {{ zoomPercent }}%
      </button>
      <Tooltip title="放大">
        <Button size="small" type="text" @click="zoomBy(0.1)">
          <template #icon><IconifyIcon icon="lucide:zoom-in" /></template>
        </Button>
      </Tooltip>
      <Tooltip title="适应画布">
        <Button size="small" type="text" @click="fitView">
          <template #icon><IconifyIcon icon="lucide:scan" /></template>
        </Button>
      </Tooltip>
      <Divider type="vertical" class="mx-1 h-5" />
      <Tooltip title="框选模式">
        <Button
          :type="selectionMode ? 'primary' : 'text'"
          size="small"
          @click="selectionMode = !selectionMode"
        >
          <template #icon><IconifyIcon icon="lucide:box-select" /></template>
        </Button>
      </Tooltip>
      <Tooltip title="复制选中节点">
        <Button
          :disabled="selected.kind !== 'node'"
          size="small"
          type="text"
          @click="cloneSelected"
        >
          <template #icon><IconifyIcon icon="lucide:copy" /></template>
        </Button>
      </Tooltip>
      <Tooltip title="删除选中">
        <Button
          :disabled="!selected.id"
          danger
          size="small"
          type="text"
          @click="deleteSelected"
        >
          <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
        </Button>
      </Tooltip>
      <Divider type="vertical" class="mx-1 h-5" />
      <Tooltip title="导出 PNG">
        <Button size="small" type="text" @click="exportPng">
          <template #icon><IconifyIcon icon="lucide:image-down" /></template>
        </Button>
      </Tooltip>
      <div class="ml-2 flex items-center gap-2 text-xs">
        <span class="text-muted-foreground">小地图</span>
        <Switch v-model:checked="showMiniMap" size="small" />
      </div>
      <div class="flex-1"></div>
      <Popover v-model:open="helpOpen" placement="bottomRight" trigger="click">
        <template #content>
          <div class="w-[280px]">
            <div class="mb-2 font-medium">快捷操作</div>
            <div
              v-for="item in shortcuts"
              :key="item.keys"
              class="mb-1.5 flex justify-between gap-3 text-xs"
            >
              <span class="text-muted-foreground">{{ item.desc }}</span>
              <kbd class="rounded border px-1.5 py-0.5 font-mono text-[11px]">{{
                item.keys
              }}</kbd>
            </div>
            <Divider class="my-2" />
            <div class="text-muted-foreground text-xs leading-relaxed">
              在节点、连线或空白处<strong>单击右键</strong>可打开上下文菜单。
            </div>
          </div>
        </template>
        <Button size="small" type="text">
          <template #icon><IconifyIcon icon="lucide:keyboard" /></template>
          快捷键
        </Button>
      </Popover>
      <Tooltip :title="panelCollapsed ? '展开属性' : '收起属性'">
        <Button
          size="small"
          type="text"
          @click="panelCollapsed = !panelCollapsed"
        >
          <template #icon>
            <IconifyIcon
              :icon="
                panelCollapsed
                  ? 'lucide:panel-right-open'
                  : 'lucide:panel-right-close'
              "
            />
          </template>
        </Button>
      </Tooltip>
    </div>

    <div class="flex min-h-0 flex-1">
      <aside
        class="border-border bg-card w-[232px] shrink-0 overflow-y-auto border-r"
      >
        <div
          class="border-border sticky top-0 z-[1] border-b bg-card/95 px-3 py-2.5 backdrop-blur"
        >
          <div class="text-sm font-semibold">节点库</div>
          <div class="text-muted-foreground mt-0.5 text-xs">
            按住拖到画布，右键可继续操作
          </div>
        </div>
        <div class="space-y-4 p-3">
          <div v-for="group in paletteGroups" :key="group.title">
            <div
              class="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase"
            >
              {{ group.title }}
            </div>
            <div class="space-y-2">
              <div
                v-for="item in group.items"
                :key="item.kind"
                class="orch-palette-item cursor-grab active:cursor-grabbing"
                :style="{
                  '--accent': item.color,
                  '--accent-soft': item.bg,
                }"
                @mousedown="onPaletteMouseDown(item.kind, $event)"
              >
                <div
                  class="flex size-8 items-center justify-center rounded-lg"
                  :style="{ background: item.bg, color: item.color }"
                >
                  <IconifyIcon
                    class="size-4"
                    :icon="
                      item.kind === 'Start'
                        ? 'lucide:circle-play'
                        : item.kind === 'End'
                          ? 'lucide:circle-stop'
                          : item.kind === 'Condition'
                            ? 'lucide:git-branch'
                            : item.kind === 'HttpCall'
                              ? 'lucide:globe'
                              : item.kind === 'Assign'
                                ? 'lucide:variable'
                                : item.kind === 'Code'
                                  ? 'lucide:braces'
                                  : item.kind === 'Throw'
                                    ? 'lucide:octagon-alert'
                                    : item.kind === 'Mask'
                                      ? 'lucide:eye-off'
                                      : 'lucide:scroll-text'
                    "
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium">{{ item.label }}</div>
                  <div class="text-muted-foreground truncate text-xs">
                    {{ item.desc }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main class="relative min-w-0 flex-1" @contextmenu.prevent>
        <div
          v-if="loading"
          class="absolute inset-0 z-20 flex items-center justify-center bg-background/70 text-sm backdrop-blur-sm"
        >
          正在加载设计器…
        </div>
        <div
          class="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-border/80 bg-card/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur"
        >
          <span class="text-muted-foreground">提示：</span>
          右键节点 / 连线 / 空白处打开菜单
        </div>
        <div ref="canvasRef" class="orch-canvas h-full w-full"></div>
        <div
          ref="minimapRef"
          class="orch-minimap absolute bottom-3 right-3 z-10 overflow-hidden rounded-xl border border-border bg-card shadow-md"
          :class="showMiniMap ? '' : 'hidden'"
        ></div>
      </main>

      <aside
        class="border-border bg-card shrink-0 overflow-y-auto border-l transition-[width] duration-200"
        :class="panelCollapsed ? 'w-0 border-0' : 'w-[360px]'"
      >
        <div v-if="!panelCollapsed" class="p-4">
          <div class="mb-3 flex items-center justify-between">
            <div class="text-sm font-semibold">
              {{
                selected.kind === 'node'
                  ? '节点属性'
                  : selected.kind === 'edge'
                    ? '连线属性'
                    : '流程信息'
              }}
            </div>
            <Tag v-if="selected.kind === 'node'">{{ selected.nodeType }}</Tag>
          </div>

          <template v-if="selected.kind === 'node'">
            <Form layout="vertical" size="small">
              <template v-if="selected.nodeType === 'Condition'">
                <div class="mb-1 text-sm font-medium">条件列表</div>
                <ConditionItemsEditor
                  v-model:model-value="conditionItems"
                  @change="dirty = true"
                />
                <Divider class="my-3" />
                <div class="mb-1.5 flex items-center justify-between">
                  <div class="text-sm font-medium">出边分支</div>
                  <Button
                    size="small"
                    type="link"
                    class="!h-6 !px-1"
                    @click="addDefaultBranchTemplates"
                  >
                    一键编号
                  </Button>
                </div>
                <div class="text-muted-foreground mb-2 text-xs leading-relaxed">
                  按出边顺序匹配：第一条组合式成立即走该分支，都不成立走 else。
                </div>
                <div
                  v-if="!outgoingBranches.length"
                  class="rounded-lg border border-dashed p-3 text-xs text-muted-foreground"
                >
                  请从本节点拖出连线到下游节点
                </div>
                <div class="space-y-2">
                  <div
                    v-for="(br, bi) in outgoingBranches"
                    :key="br.id"
                    class="rounded-lg border border-border p-2"
                  >
                    <div class="mb-1 text-[11px] text-muted-foreground">
                      分支 {{ bi + 1 }} → {{ br.targetId }}
                    </div>
                    <Input
                      :value="br.combine"
                      size="small"
                      class="mb-1.5 font-mono"
                      :disabled="br.isDefault"
                      placeholder="组合式：1 或 1 and (2 or 3)"
                      @update:value="
                        (v) =>
                          updateBranch(br.id, {
                            combine: String(v || ''),
                            isDefault: false,
                          })
                      "
                    />
                    <div class="flex items-center gap-2 text-xs">
                      <span class="text-muted-foreground">默认 else</span>
                      <Switch
                        size="small"
                        :checked="br.isDefault"
                        @update:checked="
                          (v) =>
                            updateBranch(br.id, { isDefault: !!v, combine: '' })
                        "
                      />
                    </div>
                  </div>
                </div>
              </template>
              <template v-if="selected.nodeType === 'Log'">
                <Form.Item label="日志模板">
                  <Input.TextArea
                    v-model:value="selected.message"
                    :rows="4"
                    class="font-mono text-xs"
                    placeholder="High amount: {{input.amount}}, level={{level}}"
                  />
                </Form.Item>
                <div
                  class="mb-2 rounded-lg bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground"
                >
                  插值优先用短名 <code>&#123;&#123;level&#125;&#125;</code>；
                  冲突时用 <code>&#123;&#123;setLevel.level&#125;&#125;</code>。
                  也支持 <code>input.*</code> / <code>sys.*</code>。
                </div>
                <div class="mb-1 text-[11px] font-medium text-muted-foreground">
                  插入路径
                </div>
                <div class="mb-3 flex flex-wrap gap-1">
                  <Button
                    v-for="chip in logTemplateChips"
                    :key="chip"
                    size="small"
                    class="!h-6 !px-1.5 font-mono text-[10px]"
                    @click="insertLogPath(chip)"
                  >
                    {{ chip }}
                  </Button>
                </div>
              </template>

              <template v-if="selected.nodeType === 'Assign'">
                <div
                  class="mb-2 rounded-lg bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground"
                >
                  赋值出参可用短名（如 <code>level</code> /
                  <code>lineItems</code>）被下游引用。产出 list 时：入参选
                  <strong>字面量 + type=array</strong>，JSON 填写数组；出参
                  <code>type=array</code>；字段改名在
                  <strong>End → map.item</strong>。
                </div>
                <Button
                  size="small"
                  class="mb-3"
                  block
                  @click="applyListAssignSample"
                >
                  填入 list 示例（lineItems）
                </Button>
              </template>

              <template v-if="selected.nodeType === 'Code'">
                <Form.Item label="数据源 dataSourceId">
                  <Select
                    v-model:value="selected.dataSourceId"
                    allow-clear
                    show-search
                    option-filter-prop="label"
                    :options="dataSourceOptions"
                    placeholder="可选：绑库后才能调用 db.*"
                  />
                </Form.Item>
                <div
                  class="mb-2 text-[11px] leading-relaxed text-muted-foreground"
                >
                  未选库：纯计算。选库后按类型调用：SQL 用
                  query/execute/batch；Redis 用 get/set/mget/mset；Mongo 用
                  find/insertMany 等。写操作需
                  Orchestration.Sql.Write；试运行不落库。
                </div>
                <div class="mb-1 flex items-center justify-between gap-2">
                  <span class="text-sm">脚本（JS 沙箱）</span>
                  <Button
                    type="link"
                    size="small"
                    class="h-auto px-0 text-xs"
                    @click="codeHelpOpen = true"
                  >
                    <template #icon>
                      <IconifyIcon icon="lucide:book-open" />
                    </template>
                    说明与示例
                  </Button>
                </div>
                <Form.Item class="mb-3">
                  <Input.TextArea
                    v-model:value="selected.script"
                    :rows="10"
                    class="font-mono text-xs"
                    placeholder="return { level: nodeInput.amount > 1000 ? 'high' : 'normal' };"
                  />
                </Form.Item>
                <Form.Item label="结果根 resultRoot">
                  <AutoComplete
                    v-model:value="selected.resultRoot"
                    allow-clear
                    :options="resultRootHints"
                    placeholder="推荐 return"
                  />
                </Form.Item>
                <div
                  class="mb-2 text-[11px] leading-relaxed text-muted-foreground"
                >
                  {{ resultRootHelp }}
                </div>
              </template>

              <template v-if="selected.nodeType === 'HttpCall'">
                <Form.Item label="执行方式">
                  <Segmented
                    v-model:value="httpAsyncSegment"
                    block
                    :options="[
                      { label: '同步', value: 'sync' },
                      { label: '异步', value: 'async' },
                    ]"
                  />
                </Form.Item>
                <div
                  v-if="selected.asyncMode"
                  class="mb-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200"
                >
                  异步：主链不等待结果，下游不可引用本节点出参（需
                  Wait，规划中）。后台仍会发请求。
                </div>
                <Form.Item label="Method">
                  <Segmented
                    v-model:value="selected.method"
                    block
                    :options="['GET', 'POST', 'PUT', 'DELETE', 'PATCH']"
                  />
                </Form.Item>
                <Form.Item label="URL">
                  <Input
                    v-model:value="selected.url"
                    placeholder="mock://echo 或 https://api.example.com/orders"
                  />
                </Form.Item>
                <Form.Item label="参数拼装">
                  <Select
                    v-model:value="selected.bodyMode"
                    :options="[
                      {
                        label: 'auto（GET/DELETE→Query，其余→JSON Body）',
                        value: 'auto',
                      },
                      { label: 'query（?a=1&b=2）', value: 'query' },
                      { label: 'json（application/json）', value: 'json' },
                      { label: 'form（x-www-form-urlencoded）', value: 'form' },
                      { label: 'raw（使用下方 Body 原文）', value: 'raw' },
                    ]"
                  />
                </Form.Item>
                <Form.Item v-if="selected.bodyMode === 'raw'" label="Body 原文">
                  <Input.TextArea
                    v-model:value="selected.body"
                    :rows="3"
                    class="font-mono text-xs"
                  />
                </Form.Item>
                <div class="mb-1 text-sm font-medium">请求头 Headers</div>
                <NodeIoEditor
                  v-model:model-value="nodeHeaders"
                  mode="inputs"
                  :path-hints="contextPathHints"
                  empty-text="添加 Header，如 Authorization"
                  @change="dirty = true"
                />
                <Divider class="my-3" />
                <Form.Item label="响应数据根 resultRoot">
                  <AutoComplete
                    v-model:value="selected.resultRoot"
                    allow-clear
                    :options="resultRootHints"
                    placeholder="任意路径，可手写"
                  />
                </Form.Item>
                <div
                  class="mb-2 text-[11px] leading-relaxed text-muted-foreground"
                >
                  {{ resultRootHelp }}
                </div>
                <Divider class="my-3" />
                <div class="mb-1 text-sm font-medium">
                  调用参数（Query / Body）
                </div>
                <div class="mb-2 text-[11px] text-muted-foreground">
                  不会覆盖 Method/URL。GET 默认拼成 ?a=1&amp;b=2，POST 默认 JSON
                  Body。
                </div>
              </template>

              <template v-if="selected.nodeType === 'Throw'">
                <div class="mb-1 text-sm font-medium">异常条件</div>
                <ConditionItemsEditor
                  v-model:model-value="failItems"
                  :path-hints="failPathHints"
                  hint-text="可引用 input / 上游出参；组合式用 and / or / ()"
                  @change="dirty = true"
                />
                <Form.Item label="组合式" class="mt-2">
                  <Input
                    v-model:value="selected.failCombine"
                    class="font-mono"
                    placeholder="1 或 1 and (2 or 3)；空=全部 and"
                  />
                </Form.Item>
                <Form.Item label="异常编码（可选）">
                  <Input
                    v-model:value="selected.failCode"
                    placeholder="Biz:InvalidAmount"
                  />
                </Form.Item>
                <Form.Item label="异常消息">
                  <Input.TextArea
                    v-model:value="selected.failMessage"
                    :rows="3"
                    placeholder="金额非法：{{input.amount}}"
                  />
                </Form.Item>
              </template>

              <template
                v-if="
                  isExecutableKind(selected.nodeType) &&
                  selected.nodeType !== 'Mask'
                "
              >
                <Form.Item
                  v-if="
                    selected.nodeType !== 'HttpCall' &&
                    selected.nodeType !== 'Throw'
                  "
                  label="执行方式"
                >
                  <Segmented
                    v-model:value="httpAsyncSegment"
                    block
                    :options="[
                      { label: '同步', value: 'sync' },
                      { label: '异步', value: 'async' },
                    ]"
                  />
                </Form.Item>
                <Form.Item label="引用名">
                  <Input
                    v-model:value="selected.refName"
                    class="font-mono"
                    placeholder="setLevel"
                  />
                </Form.Item>
                <div
                  class="mb-2 text-[11px] leading-relaxed text-muted-foreground"
                >
                  下游可写 <code>{{ selected.refName || 'ref' }}.出参名</code>；
                  出参名全局不冲突时可直接写短名。
                </div>
                <Divider class="my-3" />
                <template v-if="selected.nodeType !== 'Throw'">
                  <div class="mb-1 text-sm font-medium">
                    {{
                      selected.nodeType === 'HttpCall' ? '调用参数' : '输入参数'
                    }}
                  </div>
                  <NodeIoEditor
                    v-model:model-value="nodeInputs"
                    mode="inputs"
                    :path-hints="contextPathHints"
                    empty-text="添加入参映射（路径或字面量）"
                    @change="dirty = true"
                  />
                  <div class="mb-1 mt-3 text-sm font-medium">输出参数</div>
                  <NodeIoEditor
                    v-model:model-value="nodeOutputs"
                    mode="outputs"
                    :node-ref="selected.refName || selected.id"
                    empty-text="声明出参名；下游优先用短名"
                    @change="dirty = true"
                  />
                  <Divider class="my-3" />
                  <div class="mb-1 text-sm font-medium">异常处理</div>
                  <div class="mb-2 text-[11px] text-muted-foreground">
                    节点执行并写出参后求值。可引用本节点出参短名（如
                    <code>statusCode</code>）、上游出参、input。组合式支持
                    <code>and</code> / <code>or</code> / <code>()</code>。
                  </div>
                  <ConditionItemsEditor
                    v-model:model-value="failItems"
                    :path-hints="failPathHints"
                    hint-text="编号条件，下方写 1 and (2 or 3)"
                    @change="dirty = true"
                  />
                  <Form.Item label="组合式" class="mt-2">
                    <Input
                      v-model:value="selected.failCombine"
                      class="font-mono"
                      placeholder="1 and (2 or 3)；空=全部 and"
                    />
                  </Form.Item>
                  <Form.Item label="异常编码">
                    <Input
                      v-model:value="selected.failCode"
                      placeholder="可选"
                    />
                  </Form.Item>
                  <Form.Item label="异常消息">
                    <Input
                      v-model:value="selected.failMessage"
                      placeholder="业务失败：{{statusCode}}"
                    />
                  </Form.Item>
                </template>
              </template>

              <template v-if="selected.nodeType === 'Mask'">
                <Form.Item label="引用名">
                  <Input
                    v-model:value="selected.refName"
                    class="font-mono"
                    placeholder="maskToken"
                  />
                </Form.Item>
                <MaskRulesEditor
                  v-model:rules="nodeMaskRules"
                  v-model:inputs="nodeInputs"
                  v-model:outputs="nodeOutputs"
                  v-model:strategy="selected.maskStrategy"
                  v-model:item-field="selected.itemField"
                  :path-hints="contextPathHints"
                  :node-ref="selected.refName"
                  @change="syncSelectionToCanvas"
                />
              </template>

              <template v-if="selected.nodeType === 'Start'">
                <div class="mb-2 text-xs leading-relaxed text-muted-foreground">
                  定义本逻辑的请求参数（可嵌套 object / array）。下游用
                  <code class="mx-0.5">input.字段</code> 引用。
                </div>
                <SchemaParamEditor
                  :model-value="contract.inputs"
                  @update:model-value="onInputsChange"
                />
                <div
                  v-if="inputPathHints.length"
                  class="mt-3 rounded-lg bg-muted/40 p-2"
                >
                  <div
                    class="mb-1 text-[11px] font-medium text-muted-foreground"
                  >
                    可引用路径
                  </div>
                  <div
                    class="flex max-h-28 flex-col gap-0.5 overflow-y-auto font-mono text-[10px]"
                  >
                    <div
                      v-for="h in inputPathHints"
                      :key="h.path"
                      class="truncate"
                    >
                      <span class="text-sky-500">{{ h.path }}</span>
                      <span class="text-muted-foreground"> · {{ h.type }}</span>
                    </div>
                  </div>
                </div>
                <Divider class="my-3" />
                <Button
                  size="small"
                  type="link"
                  class="!px-0"
                  @click="showInputsJson = !showInputsJson"
                >
                  {{ showInputsJson ? '收起 JSON' : '高级：编辑 JSON' }}
                </Button>
                <template v-if="showInputsJson">
                  <Input.TextArea
                    v-model:value="inputsJsonText"
                    :rows="8"
                    class="mt-1 font-mono text-xs"
                  />
                  <Button
                    size="small"
                    class="mt-2"
                    @click="applyInputsFromJson"
                  >
                    从 JSON 同步
                  </Button>
                </template>
              </template>
              <template v-else-if="selected.nodeType === 'End'">
                <div
                  class="mb-2 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground"
                >
                  最终 API 响应 <code>data</code> 在此配置；节点 outputs
                  仅供下游引用。支持 map / aggregate / visibleTo / sensitive。
                </div>
                <EndOutputEditor
                  v-model="nodeFinalOutputs"
                  :path-hints="contextPathHints"
                  @change="syncSelectionToCanvas"
                />
                <Divider class="my-3" />
                <Button
                  size="small"
                  type="link"
                  class="!px-0"
                  @click="showInputsJson = !showInputsJson"
                >
                  {{ showInputsJson ? '收起 JSON' : '高级：编辑 JSON' }}
                </Button>
                <template v-if="showInputsJson">
                  <Input.TextArea
                    v-model:value="selected.finalOutputsJson"
                    :rows="8"
                    class="mt-1 font-mono text-xs"
                    @change="
                      () => {
                        try {
                          nodeFinalOutputs = JSON.parse(
                            selected.finalOutputsJson || '[]',
                          );
                        } catch {
                          /* typing */
                        }
                      }
                    "
                  />
                </template>
              </template>
            </Form>
            <Divider />
            <Space>
              <Button size="small" @click="cloneSelected">复制</Button>
              <Button danger size="small" @click="deleteSelected">删除</Button>
            </Space>
          </template>

          <template v-else-if="selected.kind === 'edge'">
            <Form layout="vertical" size="small">
              <Form.Item label="组合式（条件编号）">
                <Input
                  v-model:value="selected.combine"
                  :disabled="selected.isDefault"
                  placeholder="1 或 1 and (2 or 3)"
                />
              </Form.Item>
              <Form.Item label="默认分支（else）">
                <Switch v-model:checked="selected.isDefault" />
              </Form.Item>
            </Form>
            <div class="text-muted-foreground mb-3 text-xs leading-relaxed">
              条件成立走对应 combine 的边；都不成立则走默认分支。不再使用
              true/false。
            </div>
            <Button danger size="small" @click="deleteSelected">
              删除连线
            </Button>
          </template>

          <template v-else>
            <Form layout="vertical" size="small">
              <Form.Item label="分类">
                <Input v-model:value="meta.category" @change="dirty = true" />
              </Form.Item>
              <Form.Item label="编码 / flowKey">
                <Input :value="meta.code" class="font-mono" disabled />
              </Form.Item>
              <Form.Item label="请求参数">
                <SchemaParamEditor
                  :model-value="contract.inputs"
                  @update:model-value="onInputsChange"
                />
              </Form.Item>
              <Button
                size="small"
                type="link"
                class="!mb-2 !px-0"
                @click="showInputsJson = !showInputsJson"
              >
                {{ showInputsJson ? '收起 JSON' : '高级：编辑 JSON' }}
              </Button>
              <template v-if="showInputsJson">
                <Input.TextArea
                  v-model:value="inputsJsonText"
                  :rows="6"
                  class="mb-2 font-mono text-xs"
                />
                <Button size="small" class="mb-3" @click="applyInputsFromJson">
                  从 JSON 同步
                </Button>
              </template>
              <Form.Item label="最终出参（只读摘要，请在 End 节点编辑）">
                <Input.TextArea
                  v-model:value="outputsJsonText"
                  :rows="6"
                  class="font-mono text-xs"
                  disabled
                />
              </Form.Item>
            </Form>
            <div
              class="mt-2 space-y-2 rounded-xl border border-dashed p-3 text-xs leading-relaxed text-muted-foreground"
            >
              <div class="font-medium text-foreground">编排要点</div>
              <div>1. Start 定义入参；动作节点配置 inputs / outputs</div>
              <div>
                2. <strong>End</strong> 配置最终 API data（visibleTo / map /
                aggregate）
              </div>
              <div>3. <strong>Mask</strong> 脱敏后再给 End 映射</div>
              <div>4. 短名 level；冲突用 引用名.出参</div>
              <div>5. HTTP：Method/URL 固定；可配 Headers 与失败条件</div>
            </div>
          </template>
        </div>
      </aside>
    </div>

    <Teleport to="body">
      <div
        v-if="ctxMenu.visible"
        class="orch-ctx-menu"
        :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
        @click.stop
        @mousedown.stop
        @contextmenu.prevent
      >
        <template v-if="ctxMenu.kind === 'node'">
          <button class="orch-ctx-item orch-ctx-primary" @click="menuEdit">
            编辑属性
          </button>
          <button class="orch-ctx-item" @click="menuClone">复制节点</button>
          <button class="orch-ctx-item orch-ctx-danger" @click="menuDelete">
            删除节点
          </button>
        </template>
        <template v-else-if="ctxMenu.kind === 'edge'">
          <button class="orch-ctx-item" @click="menuSetCombine('1')">
            组合：1
          </button>
          <button class="orch-ctx-item" @click="menuSetCombine('1 and 2')">
            组合：1 and 2
          </button>
          <button class="orch-ctx-item" @click="menuSetDefault">
            设为默认 else
          </button>
          <button class="orch-ctx-item" @click="menuSetCombine('')">
            清除组合
          </button>
          <button class="orch-ctx-item orch-ctx-danger" @click="menuDelete">
            删除连线
          </button>
        </template>
        <template v-else>
          <div class="orch-ctx-title">添加节点</div>
          <button
            v-for="item in NODE_PALETTE"
            :key="item.kind"
            class="orch-ctx-item"
            @click="addNodeAtMenu(item.kind)"
          >
            {{ item.label }}
          </button>
        </template>
      </div>
    </Teleport>

    <CodeScriptHelp
      v-model:open="codeHelpOpen"
      :has-data-source="!!selected.dataSourceId"
      @apply="
        (script) => {
          selected.script = script;
        }
      "
    />

    <Drawer
      v-model:open="dryRunOpen"
      destroy-on-close
      title="试运行"
      :width="440"
    >
      <div class="text-muted-foreground mb-3 text-sm">
        请求体按 InputSchema 传入；system 型参数不可覆盖。Http
        在试运行中会跳过。
      </div>
      <div class="mb-2 flex justify-end">
        <Button size="small" @click="refreshDryRunSample">
          按参数表生成示例
        </Button>
      </div>
      <Input.TextArea
        v-model:value="variablesJson"
        :rows="12"
        class="font-mono text-sm"
      />
      <div class="mt-4 flex justify-end gap-2">
        <Button @click="dryRunOpen = false">取消</Button>
        <Button :loading="saving" type="primary" @click="dryRun">
          开始试运行
        </Button>
      </div>
    </Drawer>

    <Drawer
      v-model:open="resultOpen"
      destroy-on-close
      title="试运行结果"
      :width="520"
    >
      <div v-if="lastResult" class="mb-4 flex items-center gap-2">
        <Tag :color="lastResult.status === 1 ? 'success' : 'error'">
          {{ lastResult.status === 1 ? 'Succeeded' : 'Failed' }}
        </Tag>
        <Tag>DryRun</Tag>
      </div>
      <ExecutionTimeline
        :error="lastResult?.error"
        :nodes="lastResult?.nodes"
      />
    </Drawer>
  </div>
</template>

<style scoped>
.orch-palette-item {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.625rem 0.75rem;
  background: color-mix(in srgb, var(--accent-soft) 70%, transparent);
  border: 1px solid transparent;
  border-radius: 0.75rem;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.orch-palette-item:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  box-shadow: 0 6px 16px rgb(15 23 42 / 6%);
  transform: translateY(-1px);
}

.orch-minimap {
  width: 180px;
  height: 110px;
}

.orch-ctx-menu {
  position: fixed;
  z-index: 1100;
  min-width: 168px;
  padding: 6px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  box-shadow:
    0 10px 30px rgb(15 23 42 / 12%),
    0 0 0 1px rgb(15 23 42 / 3%);
}

.orch-ctx-title {
  padding: 6px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}

.orch-ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  color: hsl(var(--foreground));
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 8px;
}

.orch-ctx-item:hover {
  background: hsl(var(--accent) / 12%);
}

.orch-ctx-item.orch-ctx-danger {
  color: #e11d48;
}

.orch-ctx-item.orch-ctx-danger:hover {
  background: rgb(225 29 72 / 10%);
}

.orch-ctx-item.orch-ctx-primary {
  font-weight: 600;
}
</style>
