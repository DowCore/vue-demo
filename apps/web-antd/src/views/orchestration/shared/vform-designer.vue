<script lang="ts" setup>
import type { OptionDataSource, OptionSourceKind } from './option-source';
import type { VFormDocument, VFormWidget } from './vform-model';

/**
 * VForm3 设计器（开源组件库 + 画布 + 组件设置 / 表单设置）
 * 点击组件放入当前选中的栅格列、单元格、标签页或根画布。
 */
import type { ListColumnDef } from '#/api/saas/orchestration';

import { computed, ref, watch } from 'vue';

import {
  Button,
  Drawer,
  Input,
  InputNumber,
  message,
  Modal,
  Segmented,
  Select,
  Switch,
} from 'ant-design-vue';

import { getReusableFlowLookupApi } from '#/api/saas/orchestration';

import {
  builtinProviderFor,
  countNodes,
  describeNodes,
  isOptionWidget,
  loadOptionNodes,
  normalizeOptionSource,
  resolveOptionSource,
} from './option-source';
import {
  appendSubFormColumn,
  cloneWidgetTree,
  createWidget,
  findInsertList,
  findWidget,
  layoutWidth,
  paletteGroups,
  parentList,
  parseVForm,
  removeWidgetSafe,
  stringifyVForm,
  subFormButtons,
  subFormColumns,
} from './vform-model';
import VFormNode from './vform-node.vue';
import { eventsFor, propGroups } from './vform-props';

defineOptions({ name: 'VFormDesigner' });

const props = defineProps<{
  json?: string;
  columns?: ListColumnDef[];
}>();

const emit = defineEmits<{
  change: [json: string];
  preview: [];
}>();

const doc = ref<VFormDocument>(parseVForm(props.json));
const selectedId = ref('');
const panel = ref<'form' | 'widget'>('widget');
const canvasModel = ref<Record<string, unknown>>({});
const rootOver = ref(false);
const importOpen = ref(false);
const importText = ref('');
const codeOpen = ref(false);
const codeKey = ref('');
const codeTarget = ref<'form' | 'widget'>('widget');
const codeDraft = ref('');

const formEvents = [
  { key: 'onFormCreated', label: 'onFormCreated' },
  { key: 'onFormMounted', label: 'onFormMounted' },
  { key: 'onFormDataChange', label: 'onFormDataChange' },
];

const selected = computed(() =>
  selectedId.value ? findWidget(doc.value.widgetList, selectedId.value) : null,
);

watch(
  () => props.json,
  (value) => {
    if (value && value !== stringifyVForm(doc.value)) {
      doc.value = parseVForm(value);
    }
  },
);

function commit() {
  emit('change', stringifyVForm(doc.value));
}

function placeWidget(widget: VFormWidget, targetId = '') {
  const list = targetId
    ? findInsertList(doc.value, targetId)
    : findInsertList(doc.value, selectedId.value);
  list.push(widget);
  selectedId.value = widget.id;
  panel.value = 'widget';
  commit();
}

function add(type: string, columns?: number) {
  placeWidget(createWidget(type, columns || 2));
}

function onPaletteDragStart(event: DragEvent, type: string, columns?: number) {
  const payload = JSON.stringify({ type, columns: columns || 0, moveId: '' });
  event.dataTransfer?.setData('text/plain', payload);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
}

function readDrop(event: DragEvent) {
  const plain = event.dataTransfer?.getData('text/plain') || '';
  if (plain.startsWith('{')) {
    try {
      const data = JSON.parse(plain) as {
        type?: string;
        columns?: number;
        moveId?: string;
      };
      return {
        type: data.type || '',
        columns: data.columns || undefined,
        moveId: data.moveId || '',
      };
    } catch {
      /* 继续用自定义类型 */
    }
  }
  return {
    type: event.dataTransfer?.getData('text/vform-type') || '',
    columns:
      Number(event.dataTransfer?.getData('text/vform-cols') || '') || undefined,
    moveId: event.dataTransfer?.getData('text/vform-move') || '',
  };
}

const columnControlOf = (type: string) => {
  if (type === 'number') return 'number' as const;
  if (type === 'date' || type === 'time' || type === 'date-range')
    return 'date' as const;
  if (type === 'select' || type === 'radio' || type === 'checkbox')
    return 'select' as const;
  if (type === 'switch') return 'switch' as const;
  if (type === 'input' || type === 'textarea') return 'input' as const;
  return null;
};

const columnLabelOf: Record<string, string> = {
  input: '文本',
  textarea: '文本',
  number: '数字',
  date: '日期',
  time: '日期',
  select: '下拉',
  switch: '开关',
};

function insertFromDrop(
  targetId: string,
  payload: { type: string; columns?: number; moveId: string },
) {
  const target = targetId ? findWidget(doc.value.widgetList, targetId) : null;
  if (target?.type === 'sub-form' && !payload.moveId) {
    const control = columnControlOf(payload.type);
    if (!control) {
      message.warning('子表按列设计，请拖入文本、数字、日期、下拉或开关');
      return;
    }
    appendSubFormColumn(target, control, columnLabelOf[payload.type] || '列');
    selectedId.value = target.id;
    panel.value = 'widget';
    commit();
    return;
  }
  if (payload.moveId) {
    const located = parentList(doc.value.widgetList, payload.moveId);
    if (!located) return;
    const [widget] = located.list.splice(located.index, 1);
    const list = targetId
      ? findInsertList(doc.value, targetId)
      : doc.value.widgetList;
    if (widget) list.push(widget);
    selectedId.value = payload.moveId;
  } else if (payload.type) {
    const widget = createWidget(payload.type, payload.columns || 2);
    const list = targetId
      ? findInsertList(doc.value, targetId)
      : doc.value.widgetList;
    list.push(widget);
    selectedId.value = widget.id;
  } else {
    return;
  }
  panel.value = 'widget';
  rootOver.value = false;
  commit();
}

function onRootDrop(event: DragEvent) {
  event.preventDefault();
  insertFromDrop('', readDrop(event));
}

function onNodeDrop(payload: {
  targetId: string;
  type: string;
  columns?: number;
  moveId: string;
}) {
  insertFromDrop(payload.targetId, payload);
}

function moveSelected(step: -1 | 1) {
  if (!selectedId.value) return;
  const located = parentList(doc.value.widgetList, selectedId.value);
  if (!located) return;
  const next = located.index + step;
  if (next < 0 || next >= located.list.length) return;
  const [widget] = located.list.splice(located.index, 1);
  if (widget) located.list.splice(next, 0, widget);
  commit();
}

function copySelected() {
  if (!selected.value || selected.value.internal) return;
  const located = parentList(doc.value.widgetList, selected.value.id);
  if (!located) return;
  const copy = cloneWidgetTree(selected.value);
  located.list.splice(located.index + 1, 0, copy);
  selectedId.value = copy.id;
  commit();
}

function widgetControl(preset: string | undefined) {
  if (preset === 'number' || preset === 'currency') return 'number';
  if (preset === 'date') return 'date';
  if (preset === 'datetime') return 'time';
  if (preset === 'boolean') return 'switch';
  return 'input';
}

function addColumn(col: ListColumnDef) {
  const widget = createWidget(widgetControl(col.formatPreset));
  widget.options.name = col.field;
  widget.options.label = col.title || col.field;
  findInsertList(doc.value, selectedId.value).push(widget);
  selectedId.value = widget.id;
  commit();
}

function patchOption(key: string, value: unknown) {
  if (!selected.value) return;
  selected.value.options = { ...selected.value.options, [key]: value };
  commit();
}

function removeSelected() {
  if (!selectedId.value) return;
  removeWidgetSafe(doc.value.widgetList, selectedId.value);
  selectedId.value = '';
  commit();
}

function clearAll() {
  doc.value.widgetList = [];
  selectedId.value = '';
  commit();
  message.success('已清空画布');
}

function openImport() {
  importText.value = stringifyVForm(doc.value);
  importOpen.value = true;
}

function applyImport() {
  doc.value = parseVForm(importText.value);
  selectedId.value = '';
  importOpen.value = false;
  commit();
  message.success('已导入');
}

function onCommand(cmd: 'copy' | 'delete' | 'down' | 'up') {
  if (cmd === 'up') moveSelected(-1);
  else if (cmd === 'down') moveSelected(1);
  else if (cmd === 'copy') copySelected();
  else removeSelected();
}

function addOption() {
  if (!selected.value) return;
  const items = [...(selected.value.options.optionItems || [])];
  items.push({ label: `选项${items.length + 1}`, value: items.length + 1 });
  patchOption('optionItems', items);
}

function dependencyList() {
  return [...(selected.value?.options.dependencies || [])];
}

function writeDependencies(items: Record<string, string>[]) {
  patchOption('dependencies', items);
}

function addDependency() {
  const items = dependencyList();
  items.push({
    sourceField: '',
    op: 'eq',
    value: '',
    action: 'show',
    setValue: '',
  });
  writeDependencies(items);
}

function patchDependency(index: number, key: string, value: string) {
  const items = dependencyList();
  const current = items[index];
  if (!current) return;
  items[index] = { ...current, [key]: value };
  writeDependencies(items);
}

function removeDependency(index: number) {
  const items = dependencyList();
  items.splice(index, 1);
  writeDependencies(items);
}

function formFieldNames() {
  const names: string[] = [];
  const walk = (widgets: VFormWidget[]) => {
    for (const widget of widgets) {
      if (widget.formItemFlag && widget.options?.name) {
        names.push(String(widget.options.name));
      }
      if (widget.widgetList) walk(widget.widgetList);
      for (const col of widget.cols || []) {
        if (col.widgetList) walk(col.widgetList);
      }
      for (const row of widget.rows || []) {
        for (const cell of row.cols || []) {
          if (cell.widgetList) walk(cell.widgetList);
        }
      }
      for (const tab of widget.tabs || []) {
        if (tab.widgetList) walk(tab.widgetList);
      }
    }
  };
  walk(doc.value.widgetList);
  return names;
}

function patchOptionItem(index: number, key: 'label' | 'value', value: string) {
  if (!selected.value) return;
  const items = (selected.value.options.optionItems || []).map(
    (item: any, i: number) =>
      i === index
        ? {
            ...item,
            [key]:
              key === 'value' && value !== '' && !Number.isNaN(Number(value))
                ? Number(value)
                : value,
          }
        : item,
  );
  patchOption('optionItems', items);
}

function removeOption(index: number) {
  if (!selected.value) return;
  const items = [...(selected.value.options.optionItems || [])];
  items.splice(index, 1);
  patchOption('optionItems', items);
}

/* ------------------------------ 选项数据源 ------------------------------ */

/** 选项类控件（含用户 / 部门）都可能绑定数据源 */
const hasOptionSource = computed(
  () => !!selected.value && isOptionWidget(selected.value.type),
);

/** 当前生效的数据源（未配置时给出控件默认值） */
const optionSource = computed(() =>
  selected.value
    ? resolveOptionSource(selected.value.type, selected.value.options)
    : null,
);

const sourceKinds: { label: string; value: OptionSourceKind }[] = [
  { label: '静态选项', value: 'static' },
  { label: '平台内置', value: 'builtin' },
  { label: '逻辑编排', value: 'flow' },
];

const providerOptions = [
  { label: '用户', value: 'user' },
  { label: '部门', value: 'dept' },
];

/** 切换来源时只保留该来源用得上的字段，避免落库里留一堆无关配置 */
function pruneSource(source: OptionDataSource): OptionDataSource {
  if (source.kind === 'static') return { kind: 'static' };
  if (source.kind === 'builtin') {
    return {
      kind: 'builtin',
      ...(source.provider ? { provider: source.provider } : {}),
    };
  }
  return {
    kind: 'flow',
    ...(source.flowKey ? { flowKey: source.flowKey } : {}),
    ...(source.params ? { params: source.params } : {}),
    ...(source.labelField ? { labelField: source.labelField } : {}),
    ...(source.valueField ? { valueField: source.valueField } : {}),
    ...(source.childrenField ? { childrenField: source.childrenField } : {}),
    ...(source.parentField ? { parentField: source.parentField } : {}),
    ...(source.rootValue ? { rootValue: source.rootValue } : {}),
  };
}

/** 合并式写入数据源；写前先规范化与剪枝，清掉空串等无效键 */
function patchOptionSource(patch: Record<string, unknown>) {
  if (!selected.value) return;
  const widget = selected.value;
  const current =
    normalizeOptionSource(widget.options.dataSource) ??
    resolveOptionSource(widget.type, widget.options);
  const merged = pruneSource(
    normalizeOptionSource({ ...current, ...patch }) ?? current,
  );
  // 内置来源缺提供者时回落到控件默认值（用户 / 部门）
  const fallbackProvider = builtinProviderFor(widget.type);
  if (merged.kind === 'builtin' && !merged.provider && fallbackProvider) {
    merged.provider = fallbackProvider;
  }
  patchOption('dataSource', merged);
}

/** 清掉数据源配置，回到控件默认行为 */
function resetOptionSource() {
  if (!selected.value) return;
  const next = { ...selected.value.options };
  delete next.dataSource;
  selected.value.options = next;
  commit();
}

/** 入参映射以「键值对列表」编辑，落库仍是对象 */
const paramRows = computed(() =>
  Object.entries(optionSource.value?.params ?? {}).map(([key, value]) => ({
    key,
    value,
  })),
);

function writeParamRows(rows: { key: string; value: string }[]) {
  const params: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    params[key] = row.value;
  }
  patchOptionSource({
    params: Object.keys(params).length > 0 ? params : undefined,
  });
}

function addParam() {
  writeParamRows([...paramRows.value, { key: '', value: '' }]);
}

function patchParam(index: number, key: 'key' | 'value', value: string) {
  writeParamRows(
    paramRows.value.map((row, i) =>
      i === index ? { ...row, [key]: value } : row,
    ),
  );
}

function removeParam(index: number) {
  writeParamRows(paramRows.value.filter((_item, i) => i !== index));
}

/** 入参模板提示串。写成常量：模板里直接写 `{{...}}` 会被 Vue 当作插值。 */
const paramTemplateHint = '{{字段名}}';

const testingSource = ref(false);

/** 试加载：直接调一次数据源，把条数与前几项回显，省得靠发布后才能验证 */
async function testOptionSource() {
  const widget = selected.value;
  if (!widget) return;
  testingSource.value = true;
  try {
    const result = await loadOptionNodes({
      optionItems: widget.options.optionItems,
      scope: {
        field: String(widget.options.name || widget.id),
        form: canvasModel.value,
      },
      source: resolveOptionSource(widget.type, widget.options),
    });
    if (!result.ok) {
      message.error(result.error);
      return;
    }
    if (result.nodes.length === 0) {
      message.warning('加载成功，但没有返回任何选项');
      return;
    }
    message.success(
      `共 ${countNodes(result.nodes)} 项：${describeNodes(result.nodes)}`,
    );
  } finally {
    testingSource.value = false;
  }
}

const flowOptions = ref<{ label: string; value: string }[]>([]);

const subColumns = computed(() => {
  if (selected.value?.type !== 'sub-form') return [];
  const raw = selected.value.options.columns;
  return Array.isArray(raw) ? raw : subFormColumns(selected.value);
});
const subButtons = computed(() =>
  selected.value?.type === 'sub-form' ? subFormButtons(selected.value) : [],
);

function materializeSubForm() {
  const widget = selected.value;
  if (!widget || widget.type !== 'sub-form') return;
  if (
    Array.isArray(widget.options.columns) &&
    Array.isArray(widget.options.buttons)
  )
    return;
  widget.options = {
    ...widget.options,
    columns: subFormColumns(widget),
    buttons: subFormButtons(widget),
  };
  widget.widgetList = [];
  commit();
}

/** 可复用的已发布流程：子表「数据调入」与选项数据源共用一份列表 */
async function loadReusableFlows() {
  if (flowOptions.value.length > 0) return;
  try {
    const res = await getReusableFlowLookupApi();
    flowOptions.value = (res.items || []).map((item) => ({
      label: `${item.name} (${item.code})`,
      value: item.code,
    }));
  } catch {
    flowOptions.value = [];
  }
}

watch(selected, (widget) => {
  if (!widget) return;
  if (widget.type === 'sub-form') {
    materializeSubForm();
    void loadReusableFlows();
    return;
  }
  if (isOptionWidget(widget.type)) void loadReusableFlows();
});

function writeSubColumns(columns: ReturnType<typeof subFormColumns>) {
  if (!selected.value) return;
  selected.value.options = { ...selected.value.options, columns };
  selected.value.widgetList = [];
  commit();
}

function writeSubButtons(buttons: ReturnType<typeof subFormButtons>) {
  if (!selected.value) return;
  selected.value.options = { ...selected.value.options, buttons };
  commit();
}

function addSubColumn() {
  if (!selected.value) return;
  appendSubFormColumn(selected.value, 'input', '新列');
  commit();
}

function patchSubColumn(index: number, key: string, value: unknown) {
  const columns = subColumns.value.map((col, i) =>
    i === index ? { ...col, [key]: value } : col,
  );
  writeSubColumns(columns);
}

function moveSubColumn(index: number, step: -1 | 1) {
  const columns = [...subColumns.value];
  const next = index + step;
  if (next < 0 || next >= columns.length) return;
  const [col] = columns.splice(index, 1);
  if (col) columns.splice(next, 0, col);
  writeSubColumns(columns);
}

function removeSubColumn(index: number) {
  writeSubColumns(subColumns.value.filter((_, i) => i !== index));
}

function addSubButton(action: 'add' | 'import') {
  const buttons = [...subButtons.value];
  buttons.push(
    action === 'import'
      ? {
          key: `import${buttons.length + 1}`,
          label: '数据调入',
          action: 'import',
          flowKey: '',
          mode: 'append',
        }
      : { key: `add${buttons.length + 1}`, label: '添加行', action: 'add' },
  );
  writeSubButtons(buttons);
}

function patchSubButton(index: number, key: string, value: unknown) {
  const buttons = subButtons.value.map((button, i) =>
    i === index ? { ...button, [key]: value } : button,
  );
  writeSubButtons(buttons);
}

function removeSubButton(index: number) {
  writeSubButtons(subButtons.value.filter((_, i) => i !== index));
}

const settingGroups = computed(() =>
  selected.value ? propGroups(selected.value.type) : [],
);
const widgetEvents = computed(() =>
  selected.value ? eventsFor(selected.value.type) : [],
);

function eventFilled(key: string, target: 'form' | 'widget' = 'widget') {
  const text =
    target === 'form'
      ? (doc.value.formConfig as Record<string, unknown>)[key]
      : selected.value?.options[key];
  return !!String(text || '').trim();
}

function openCode(key: string, target: 'form' | 'widget' = 'widget') {
  codeKey.value = key;
  codeTarget.value = target;
  codeDraft.value = String(
    target === 'form'
      ? (doc.value.formConfig as Record<string, unknown>)[key] || ''
      : selected.value?.options[key] || '',
  );
  codeOpen.value = true;
}

function saveCode() {
  if (codeTarget.value === 'form') {
    (doc.value.formConfig as Record<string, unknown>)[codeKey.value] =
      codeDraft.value;
    commit();
  } else {
    patchOption(codeKey.value, codeDraft.value);
  }
  codeOpen.value = false;
}
</script>

<template>
  <div class="vf-shell">
    <aside class="vf-palette">
      <div class="vf-palette-title">组件库</div>
      <div class="vf-palette-scroll">
        <section v-for="g in paletteGroups" :key="g.key">
          <div class="vf-group-title">{{ g.label }}</div>
          <div class="vf-palette-grid">
            <button
              v-for="item in g.items"
              :key="item.label"
              class="vf-palette-item"
              draggable="true"
              type="button"
              @click="add(item.type, (item as any).columns)"
              @dragstart="
                onPaletteDragStart($event, item.type, (item as any).columns)
              "
            >
              {{ item.label }}
            </button>
          </div>
        </section>
        <section v-if="columns?.length">
          <div class="vf-group-title">字段库</div>
          <div class="vf-palette-grid">
            <button
              v-for="col in columns"
              :key="col.field"
              class="vf-palette-item"
              type="button"
              @click="addColumn(col)"
            >
              {{ col.title || col.field }}
            </button>
          </div>
        </section>
      </div>
    </aside>

    <main class="vf-stage">
      <div class="vf-toolbar">
        <Segmented
          size="small"
          :value="doc.formConfig.layoutType"
          :options="[
            { label: 'PC', value: 'PC' },
            { label: 'Pad', value: 'Pad' },
            { label: 'H5', value: 'H5' },
          ]"
          @update:value="
            (v) => {
              doc.formConfig.layoutType = v as any;
              commit();
            }
          "
        />
        <span class="vf-toolbar-gap"></span>
        <Button size="small" @click="clearAll">清空</Button>
        <Button size="small" @click="emit('preview')">预览</Button>
        <Button size="small" @click="openImport">导入 JSON</Button>
        <Button size="small" @click="openImport">导出 JSON</Button>
      </div>
      <div class="vf-canvas-scroll">
        <div
          class="vf-canvas"
          :class="{ 'is-over': rootOver }"
          :style="{ maxWidth: layoutWidth(doc.formConfig.layoutType) }"
          @click="selectedId = ''"
          @dragover.prevent="rootOver = true"
          @dragleave="rootOver = false"
          @drop="onRootDrop"
        >
          <div v-if="!doc.widgetList.length" class="vf-empty">
            请从左侧列表中选择一个组件，然后用鼠标拖动组件放置于此处。
          </div>
          <VFormNode
            v-for="widget in doc.widgetList"
            :key="widget.id"
            designer
            :label-position="doc.formConfig.labelPosition"
            :label-width="doc.formConfig.labelWidth"
            :model="canvasModel"
            :selected-id="selectedId"
            :widget="widget"
            @command="onCommand"
            @drop-widget="onNodeDrop"
            @select="
              (id) => {
                selectedId = id;
                panel = 'widget';
              }
            "
            @update:model="(v) => (canvasModel = v)"
          />
        </div>
      </div>
    </main>

    <aside class="vf-setting">
      <div class="sticky top-0 flex border-b border-border bg-card">
        <button
          class="flex-1 py-2 text-sm"
          :class="panel === 'widget' ? 'text-primary' : ''"
          type="button"
          @click="panel = 'widget'"
        >
          组件设置
        </button>
        <button
          class="flex-1 py-2 text-sm"
          :class="panel === 'form' ? 'text-primary' : ''"
          type="button"
          @click="panel = 'form'"
        >
          全局设置
        </button>
      </div>

      <div v-if="panel === 'form'" class="space-y-3 p-3 text-xs">
        <div>
          <div class="mb-1 text-muted-foreground">标签位置</div>
          <Segmented
            size="small"
            :value="doc.formConfig.labelPosition"
            :options="[
              { label: '左边', value: 'left' },
              { label: '顶部', value: 'top' },
            ]"
            @update:value="
              (v) => {
                doc.formConfig.labelPosition = v as any;
                commit();
              }
            "
          />
        </div>
        <div>
          <div class="mb-1 text-muted-foreground">标签对齐</div>
          <Select
            class="w-full"
            size="small"
            :value="doc.formConfig.labelAlign"
            :options="[
              { label: '居左', value: 'label-left-align' },
              { label: '居中', value: 'label-center-align' },
              { label: '居右', value: 'label-right-align' },
            ]"
            @update:value="
              (v) => {
                doc.formConfig.labelAlign = String(v || '');
                commit();
              }
            "
          />
        </div>
        <div>
          <div class="mb-1 text-muted-foreground">标签宽度</div>
          <InputNumber
            class="w-full"
            :min="40"
            :value="doc.formConfig.labelWidth"
            @update:value="
              (v) => {
                doc.formConfig.labelWidth = Number(v) || 80;
                commit();
              }
            "
          />
        </div>
        <div>
          <div class="mb-1 text-muted-foreground">全局组件大小</div>
          <Select
            class="w-full"
            size="small"
            :value="doc.formConfig.size"
            :options="[
              { label: '默认', value: '' },
              { label: '大', value: 'large' },
              { label: '中', value: 'default' },
              { label: '小', value: 'small' },
            ]"
            @update:value="
              (v) => {
                doc.formConfig.size = String(v ?? '');
                commit();
              }
            "
          />
        </div>
        <div>
          <div class="mb-1 text-muted-foreground">数据对象名称</div>
          <Input
            :value="doc.formConfig.modelName"
            @update:value="
              (v) => {
                doc.formConfig.modelName = String(v || 'formData');
                commit();
              }
            "
          />
        </div>
        <div class="font-medium">事件属性</div>
        <div
          v-for="ev in formEvents"
          :key="ev.key"
          class="flex items-center justify-between gap-2"
        >
          <span>{{ ev.label }}</span>
          <Button
            size="small"
            :type="eventFilled(ev.key, 'form') ? 'primary' : 'default'"
            @click="openCode(ev.key, 'form')"
          >
            编写代码
          </Button>
        </div>
      </div>

      <div v-else-if="selected" class="space-y-3 p-3 text-xs">
        <div class="text-muted-foreground">
          {{ selected.type }} · {{ selected.id }}
        </div>
        <section
          v-for="group in settingGroups"
          :key="group.name"
          class="space-y-2"
        >
          <div class="font-medium">{{ group.name }}</div>
          <div
            v-for="field in group.fields"
            :key="field.key"
            :class="
              field.kind === 'switch'
                ? 'flex items-center justify-between gap-2'
                : ''
            "
          >
            <div
              class="mb-1 text-muted-foreground"
              :class="field.kind === 'switch' ? '!mb-0' : ''"
            >
              {{ field.label }}
            </div>
            <InputNumber
              v-if="field.kind === 'number'"
              class="w-full"
              :value="selected.options[field.key]"
              @update:value="(v) => patchOption(field.key, v)"
            />
            <Switch
              v-else-if="field.kind === 'switch'"
              size="small"
              :checked="!!selected.options[field.key]"
              @update:checked="(v) => patchOption(field.key, !!v)"
            />
            <Segmented
              v-else-if="field.kind === 'segment'"
              block
              size="small"
              :options="
                (field.options || []).map((item) => ({
                  label: item.label,
                  value: item.value,
                }))
              "
              :value="
                selected.options[field.key] || field.options?.[0]?.value || ''
              "
              @update:value="(v) => patchOption(field.key, v)"
            />
            <Select
              v-else-if="field.kind === 'select'"
              class="w-full"
              size="small"
              :options="field.options"
              :value="selected.options[field.key] ?? ''"
              @update:value="(v) => patchOption(field.key, v)"
            />
            <Input.TextArea
              v-else-if="field.kind === 'textarea'"
              :rows="3"
              :value="selected.options[field.key]"
              @update:value="(v) => patchOption(field.key, String(v || ''))"
            />
            <Input
              v-else
              :value="selected.options[field.key]"
              @update:value="(v) => patchOption(field.key, String(v || ''))"
            />
          </div>
        </section>
        <template v-if="selected.type === 'sub-form'">
          <div class="flex items-center justify-between font-medium">
            表格列
            <Button size="small" type="link" @click="addSubColumn">
              添加列
            </Button>
          </div>
          <p class="text-muted-foreground">
            点中子表后在这里定列。固定在左的列会钉在表格左侧，固定在右的钉在右侧。
          </p>
          <div
            v-for="(col, index) in subColumns"
            :key="`${col.key}-${index}`"
            class="space-y-1 rounded border border-border p-2"
          >
            <div class="flex gap-1">
              <Input
                size="small"
                :value="col.label"
                placeholder="列标题"
                @update:value="
                  (v) => patchSubColumn(index, 'label', String(v || ''))
                "
              />
              <Input
                size="small"
                class="font-mono"
                :value="col.key"
                placeholder="字段名"
                @update:value="
                  (v) => patchSubColumn(index, 'key', String(v || '').trim())
                "
              />
            </div>
            <div class="flex gap-1">
              <Select
                class="flex-1"
                size="small"
                :options="[
                  { label: '文本', value: 'input' },
                  { label: '数字', value: 'number' },
                  { label: '日期', value: 'date' },
                  { label: '下拉', value: 'select' },
                  { label: '开关', value: 'switch' },
                ]"
                :value="col.control"
                @update:value="(v) => patchSubColumn(index, 'control', v)"
              />
              <Select
                class="w-24"
                size="small"
                :options="[
                  { label: '不固定', value: '' },
                  { label: '固定左', value: 'left' },
                  { label: '固定右', value: 'right' },
                ]"
                :value="col.fixed || ''"
                @update:value="(v) => patchSubColumn(index, 'fixed', v || '')"
              />
            </div>
            <div class="flex items-center gap-1">
              <InputNumber
                class="w-20"
                size="small"
                :min="60"
                :value="col.width"
                @update:value="
                  (v) => patchSubColumn(index, 'width', Number(v) || 140)
                "
              />
              <Input
                v-if="col.control === 'select'"
                size="small"
                class="flex-1"
                placeholder="选项，逗号分隔"
                :value="col.options"
                @update:value="
                  (v) => patchSubColumn(index, 'options', String(v || ''))
                "
              />
              <Button
                size="small"
                type="text"
                @click="moveSubColumn(index, -1)"
              >
                上
              </Button>
              <Button size="small" type="text" @click="moveSubColumn(index, 1)">
                下
              </Button>
              <Button
                danger
                size="small"
                type="text"
                @click="removeSubColumn(index)"
              >
                删
              </Button>
            </div>
          </div>

          <div class="flex items-center justify-between font-medium">
            按钮
            <span>
              <Button size="small" type="link" @click="addSubButton('add')">添加行</Button>
              <Button size="small" type="link" @click="addSubButton('import')">数据调入</Button>
            </span>
          </div>
          <p class="text-muted-foreground">
            数据调入调用已发布流程。入参是 record、subForm、rows；出参为数组或
            rows。调入的行并进子表，整单提交仍走提交流。
          </p>
          <div
            v-for="(button, index) in subButtons"
            :key="button.key"
            class="space-y-1 rounded border border-border p-2"
          >
            <div class="flex gap-1">
              <Input
                size="small"
                :value="button.label"
                @update:value="
                  (v) => patchSubButton(index, 'label', String(v || ''))
                "
              />
              <Select
                class="w-28"
                size="small"
                :options="[
                  { label: '添加行', value: 'add' },
                  { label: '数据调入', value: 'import' },
                ]"
                :value="button.action"
                @update:value="(v) => patchSubButton(index, 'action', v)"
              />
              <Button
                danger
                size="small"
                type="text"
                @click="removeSubButton(index)"
              >
                删
              </Button>
            </div>
            <template v-if="button.action === 'import'">
              <Select
                v-if="flowOptions.length"
                class="w-full"
                size="small"
                allow-clear
                show-search
                placeholder="选择逻辑编排"
                :options="flowOptions"
                :value="button.flowKey || undefined"
                @update:value="
                  (v) => patchSubButton(index, 'flowKey', v ? String(v) : '')
                "
              />
              <Input
                v-else
                size="small"
                placeholder="流程编码，如 order.importLines"
                :value="button.flowKey"
                @update:value="
                  (v) => patchSubButton(index, 'flowKey', String(v || ''))
                "
              />
              <Select
                class="w-full"
                size="small"
                :options="[
                  { label: '追加到子表', value: 'append' },
                  { label: '覆盖子表', value: 'replace' },
                ]"
                :value="button.mode || 'append'"
                @update:value="(v) => patchSubButton(index, 'mode', v)"
              />
            </template>
          </div>
        </template>
        <div v-if="widgetEvents.length" class="space-y-2">
          <div class="font-medium">事件属性</div>
          <div
            v-for="ev in widgetEvents"
            :key="ev.key"
            class="flex items-center justify-between gap-2"
          >
            <span>{{ ev.label }}</span>
            <Button
              size="small"
              :type="eventFilled(ev.key) ? 'primary' : 'default'"
              @click="openCode(ev.key)"
            >
              编写代码
            </Button>
          </div>
        </div>
        <template v-if="selected.type === 'grid'">
          <div class="font-medium">栅格列</div>
          <div
            v-for="(col, i) in selected.cols || []"
            :key="col.id"
            class="flex items-center gap-2"
          >
            <span>列{{ i + 1 }} span</span>
            <InputNumber
              class="flex-1"
              :max="24"
              :min="1"
              :value="col.options.span"
              @update:value="
                (v) => {
                  col.options.span = Number(v) || 12;
                  commit();
                }
              "
            />
          </div>
        </template>
        <template v-if="hasOptionSource && optionSource">
          <div class="space-y-2">
            <div class="flex items-center justify-between font-medium">
              数据源
              <div class="flex items-center">
                <Button
                  size="small"
                  type="link"
                  :loading="testingSource"
                  @click="testOptionSource"
                >
                  试加载
                </Button>
                <Button size="small" type="link" @click="resetOptionSource">
                  重置
                </Button>
              </div>
            </div>
            <p class="text-muted-foreground">
              级联、下拉与用户/部门共用同一套数据源。绑定逻辑编排后前端会调用它，
              请确保该流程是只读查询。
            </p>
            <Segmented
              block
              size="small"
              :options="sourceKinds"
              :value="optionSource.kind"
              @change="(value: any) => patchOptionSource({ kind: value })"
            />

            <template v-if="optionSource.kind === 'builtin'">
              <div class="flex items-center gap-2">
                <span class="text-muted-foreground">提供者</span>
                <Select
                  class="flex-1"
                  size="small"
                  :options="providerOptions"
                  :value="optionSource.provider || undefined"
                  @update:value="
                    (value) => patchOptionSource({ provider: value })
                  "
                />
              </div>
            </template>

            <template v-else-if="optionSource.kind === 'flow'">
              <Select
                v-if="flowOptions.length"
                class="w-full"
                size="small"
                show-search
                placeholder="选择已发布流程"
                :options="flowOptions"
                :value="optionSource.flowKey || undefined"
                @update:value="(value) => patchOptionSource({ flowKey: value })"
              />
              <Input
                v-else
                size="small"
                placeholder="已发布流程的 flowKey"
                :value="optionSource.flowKey || ''"
                @update:value="(value) => patchOptionSource({ flowKey: value })"
              />

              <div class="text-muted-foreground">出参字段映射</div>
              <div class="grid grid-cols-2 gap-1">
                <Input
                  size="small"
                  placeholder="label 字段"
                  :value="optionSource.labelField || ''"
                  @update:value="
                    (value) => patchOptionSource({ labelField: value })
                  "
                />
                <Input
                  size="small"
                  placeholder="value 字段"
                  :value="optionSource.valueField || ''"
                  @update:value="
                    (value) => patchOptionSource({ valueField: value })
                  "
                />
                <Input
                  size="small"
                  placeholder="children 字段"
                  :value="optionSource.childrenField || ''"
                  @update:value="
                    (value) => patchOptionSource({ childrenField: value })
                  "
                />
                <Input
                  size="small"
                  placeholder="父级字段（扁平列表组树）"
                  :value="optionSource.parentField || ''"
                  @update:value="
                    (value) => patchOptionSource({ parentField: value })
                  "
                />
              </div>

              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">
                  入参（值支持
                  {{ paramTemplateHint }}
                  取当前表单字段，被引用字段变化时会自动重新取数）
                </span>
                <Button size="small" type="link" @click="addParam">添加</Button>
              </div>
              <div
                v-for="(row, index) in paramRows"
                :key="index"
                class="flex gap-1"
              >
                <Input
                  size="small"
                  placeholder="参数名"
                  :value="row.key"
                  @update:value="
                    (value) =>
                      patchParam(Number(index), 'key', String(value || ''))
                  "
                />
                <Input
                  size="small"
                  class="font-mono"
                  :placeholder="paramTemplateHint"
                  :value="row.value"
                  @update:value="
                    (value) =>
                      patchParam(Number(index), 'value', String(value || ''))
                  "
                />
                <Button
                  danger
                  size="small"
                  type="text"
                  @click="removeParam(Number(index))"
                >
                  ×
                </Button>
              </div>
            </template>

            <template v-else>
              <div class="mb-1 flex items-center justify-between font-medium">
                选项设置
                <Button size="small" type="link" @click="addOption">
                  添加
                </Button>
              </div>
              <div
                v-for="(item, i) in selected.options.optionItems || []"
                :key="i"
                class="mb-1 flex gap-1"
              >
                <Input
                  size="small"
                  :value="item.label"
                  @update:value="
                    (v) => patchOptionItem(Number(i), 'label', String(v || ''))
                  "
                />
                <Input
                  size="small"
                  class="font-mono"
                  :value="String(item.value)"
                  @update:value="
                    (v) => patchOptionItem(Number(i), 'value', String(v || ''))
                  "
                />
                <Button
                  danger
                  size="small"
                  type="text"
                  @click="removeOption(Number(i))"
                >
                  ×
                </Button>
              </div>
            </template>
          </div>
        </template>
        <div v-if="selected.formItemFlag" class="space-y-2">
          <div class="flex items-center justify-between font-medium">
            字段联动
            <Button size="small" type="link" @click="addDependency">
              添加
            </Button>
          </div>
          <p class="text-muted-foreground">
            条件成立后显隐、禁用、改必填，或把当前字段写成指定值。
          </p>
          <div
            v-for="(dep, index) in selected.options.dependencies || []"
            :key="index"
            class="space-y-1 rounded border border-border p-2"
          >
            <Select
              class="w-full"
              size="small"
              show-search
              placeholder="触发字段"
              :options="
                formFieldNames().map((name) => ({ label: name, value: name }))
              "
              :value="dep.sourceField || undefined"
              @update:value="
                (v) =>
                  patchDependency(Number(index), 'sourceField', String(v || ''))
              "
            />
            <div class="flex gap-1">
              <Select
                class="w-28"
                size="small"
                :options="[
                  { label: '等于', value: 'eq' },
                  { label: '不等于', value: 'ne' },
                  { label: '包含', value: 'contains' },
                  { label: '属于', value: 'in' },
                  { label: '不属于', value: 'notin' },
                  { label: '为空', value: 'isEmpty' },
                  { label: '不为空', value: 'isNotEmpty' },
                ]"
                :value="dep.op || 'eq'"
                @update:value="
                  (v) => patchDependency(Number(index), 'op', String(v || 'eq'))
                "
              />
              <Input
                size="small"
                placeholder="比较值，多个用逗号"
                :value="dep.value"
                @update:value="
                  (v) =>
                    patchDependency(Number(index), 'value', String(v || ''))
                "
              />
            </div>
            <div class="flex gap-1">
              <Select
                class="flex-1"
                size="small"
                :options="[
                  { label: '显示', value: 'show' },
                  { label: '隐藏', value: 'hide' },
                  { label: '启用', value: 'enable' },
                  { label: '禁用', value: 'disable' },
                  { label: '必填', value: 'require' },
                  { label: '选填', value: 'optional' },
                  { label: '赋值', value: 'setValue' },
                ]"
                :value="dep.action || 'show'"
                @update:value="
                  (v) =>
                    patchDependency(
                      Number(index),
                      'action',
                      String(v || 'show'),
                    )
                "
              />
              <Button
                danger
                size="small"
                type="text"
                @click="removeDependency(Number(index))"
              >
                删
              </Button>
            </div>
            <Input
              v-if="dep.action === 'setValue'"
              size="small"
              placeholder="写入当前字段的值"
              :value="dep.setValue"
              @update:value="
                (v) =>
                  patchDependency(Number(index), 'setValue', String(v || ''))
              "
            />
          </div>
        </div>
        <Button danger block size="small" @click="removeSelected">
          移除组件
        </Button>
      </div>
      <p v-else class="p-6 text-center text-xs text-muted-foreground">
        当前没有选中设置的组件
      </p>
    </aside>

    <Modal
      v-model:open="codeOpen"
      :title="`编写代码 · ${codeKey}`"
      ok-text="确定"
      @ok="saveCode"
    >
      <p class="mb-2 text-xs text-muted-foreground">
        可用参数 value、oldValue、formModel。源码保存在组件 JSON
        里，只在预览和运行时执行。
      </p>
      <Input.TextArea
        v-model:value="codeDraft"
        class="font-mono text-xs"
        :rows="14"
      />
    </Modal>

    <Drawer v-model:open="importOpen" title="表单 JSON" :width="560">
      <Input.TextArea
        v-model:value="importText"
        class="font-mono text-xs"
        :rows="24"
      />
      <div class="mt-3 flex justify-end">
        <Button type="primary" @click="applyImport">应用到画布</Button>
      </div>
    </Drawer>
  </div>
</template>

<style scoped>
.vf-shell {
  display: flex;
  height: calc(100vh - 168px);
  min-height: 640px;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
}

.vf-palette {
  display: flex;
  flex-direction: column;
  width: 260px;
  border-right: 1px solid hsl(var(--border));
}

.vf-palette-title,
.vf-group-title {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
}

.vf-group-title {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

.vf-palette-scroll {
  flex: 1;
  padding-bottom: 12px;
  overflow: auto;
}

.vf-palette-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 0 10px 8px;
}

.vf-palette-item {
  height: 32px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 30px;
  color: inherit;
  white-space: nowrap;
  cursor: grab;
  background: transparent;
  border: 1px solid hsl(var(--border));
  border-radius: 3px;
}

.vf-palette-item:hover {
  color: #409eff;
  border-color: #409eff;
}

.vf-stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  background: hsl(var(--background));
}

.vf-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  height: 46px;
  padding: 0 12px;
  border-bottom: 1px solid hsl(var(--border));
}

.vf-toolbar-gap {
  flex: 1;
}

.vf-canvas-scroll {
  flex: 1;
  padding: 16px;
  overflow: auto;
}

.vf-canvas {
  min-height: 100%;
  padding: 16px;
  margin: 0 auto;
  background: hsl(var(--card));
  border: 1px dashed transparent;
}

.vf-canvas.is-over {
  background: rgb(64 158 255 / 8%);
  border-color: #409eff;
}

.vf-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 240px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.vf-setting {
  width: 360px;
  overflow: auto;
  border-left: 1px solid hsl(var(--border));
}
</style>
