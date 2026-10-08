<script lang="ts" setup>
import type { WfKind, WfSelection } from '../shared/workflow-canvas';
import type {
  WfConditionBlock,
  WfConditionItem,
  WfValueRef,
} from './workflow-condition-editor.vue';

/**
 * OA 审批流设计器。画布操作对齐逻辑编排：节点库拖入、连接点拉线、点中后在右侧改属性。
 * 保存的是 nodes/edges。旧的 childNode 链打开时会铺到这张画布上。
 */
import type {
  FormDefinitionLookup,
  WorkflowDefinition,
} from '#/api/saas/orchestration';

import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { usePreferences } from '@vben/preferences';

import {
  Button,
  Divider,
  Form,
  Input,
  message,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  getPublishedFormDefinitionApi,
  getPublishedFormLookupApi,
  getReusableFlowLookupApi,
  getWorkflowDefinitionApi,
  publishWorkflowDefinitionApi,
  updateWorkflowDefinitionApi,
} from '#/api/saas/orchestration';

import { processJsonToGraph, WorkflowCanvas } from '../shared/workflow-canvas';
import WorkflowConditionEditor from './workflow-condition-editor.vue';

defineOptions({ name: 'OrchestrationWorkflowDesigner' });

const palette: Array<{
  kind: WfKind;
  label: string;
  desc: string;
  icon: string;
  color: string;
  bg: string;
}> = [
  {
    kind: 'approver',
    label: '接收',
    desc: '办理人处理。意见、多人规则',
    icon: 'lucide:user-check',
    color: '#d46b08',
    bg: '#fff7e6',
  },
  {
    kind: 'cc',
    label: '抄送',
    desc: '通知相关人，不挡住流程',
    icon: 'lucide:send',
    color: '#08979c',
    bg: '#e6fffb',
  },
  {
    kind: 'condition',
    label: '条件',
    desc: '从这里拉出多条连线做分支',
    icon: 'lucide:git-branch',
    color: '#d48806',
    bg: '#fffbe6',
  },
  {
    kind: 'end',
    label: '结束',
    desc: '一条分支的终点',
    icon: 'lucide:circle-stop',
    color: '#595959',
    bg: '#f5f5f5',
  },
];

const route = useRoute();
const router = useRouter();
const { isDark } = usePreferences();
const canvasRef = ref<HTMLDivElement>();
const minimapRef = ref<HTMLDivElement>();
const loading = ref(false);
const saving = ref(false);
const dirty = ref(false);
const canvasReady = ref(false);
const panelCollapsed = ref(false);
const showMiniMap = ref(true);
const zoomPercent = ref(100);
const wf = ref<null | WorkflowDefinition>(null);
const formOptions = ref<FormDefinitionLookup[]>([]);
const flowOptions = ref<{ label: string; value: string }[]>([]);
const meta = reactive({
  name: '',
  description: '',
  formRef: undefined as string | undefined,
  beforeStartFlowKey: undefined as string | undefined,
  afterEndFlowKey: undefined as string | undefined,
});
const selected = reactive({
  kind: '' as '' | 'edge' | 'node',
  id: '',
  nodeType: '',
  name: '',
  beforeFlowKey: undefined as string | undefined,
  afterFlowKey: undefined as string | undefined,
  opinion: 'optional' as string | undefined,
  assigneeType: 'role' as string | undefined,
  assigneeValue: '',
  assigneeFlowKey: undefined as string | undefined,
  multi: 'single' as string | undefined,
  multiRatio: 100,
  emptyFallback: 'admin',
  fieldPermissions: {} as Record<string, string>,
  conditionText: '',
  leaveCondition: emptyBlock(),
  edgeCondition: emptyBlock(),
});

const canvas = shallowRef<null | WorkflowCanvas>(null);
let applying = false;

const boundFields = ref<{ field: string; title: string }[]>([]);

async function loadBoundFields(code?: string) {
  if (!code) {
    boundFields.value = [];
    return;
  }
  try {
    const form = await getPublishedFormDefinitionApi(code);
    boundFields.value = (form.schema?.fields || []).map((field) => ({
      field: field.field,
      title: field.title || field.field,
    }));
  } catch {
    boundFields.value = [];
  }
}

function setFieldPermission(field: string, value: string) {
  const next: Record<string, string> = {};
  for (const [key, perm] of Object.entries(selected.fieldPermissions || {})) {
    if (key !== field) next[key] = perm;
  }
  if (value) next[field] = value;
  selected.fieldPermissions = next;
}

function typeLabel(type?: string) {
  if (type === 'start') return '开始';
  if (type === 'approver') return '接收';
  if (type === 'cc') return '抄送';
  if (type === 'condition') return '条件';
  if (type === 'end') return '结束';
  return type || '连线';
}

function assigneePlaceholder(type?: string) {
  if (type === 'user') return '用户名';
  if (type === 'formField') return '表单字段名';
  if (type === 'manager') return '角色码，留空则用 manager';
  return '角色码';
}

function emptyRef(source: WfValueRef['source'] = 'record'): WfValueRef {
  return { source, path: '', flowKey: '', value: '' };
}

function emptyBlock(): WfConditionBlock {
  return { items: [], combine: '' };
}

function blockFrom(
  raw: undefined | { items?: WfConditionItem[]; combine?: string },
  legacy?: { field?: string; op?: string; value?: string },
): WfConditionBlock {
  const items = Array.isArray(raw?.items)
    ? raw.items.map((item, index) => ({
        no: index + 1,
        left: { ...emptyRef('record'), ...item.left },
        op: item.op || 'eq',
        right: { ...emptyRef('const'), ...item.right },
      }))
    : [];
  if (items.length === 0 && legacy?.field) {
    items.push({
      no: 1,
      left: { ...emptyRef('record'), path: legacy.field },
      op: legacy.op || 'eq',
      right: { ...emptyRef('const'), value: legacy.value || '' },
    });
  }
  return { items, combine: String(raw?.combine || '') };
}

function fillSelected(payload: WfSelection) {
  applying = true;
  selected.kind = payload.kind;
  selected.id = payload.kind ? payload.id : '';
  const data = payload.kind ? payload.data : {};
  selected.nodeType = String(data.nodeType || '');
  selected.name = String(data.name || '');
  selected.beforeFlowKey = (data.beforeFlowKey as string) || undefined;
  selected.afterFlowKey = (data.afterFlowKey as string) || undefined;
  selected.opinion = (data.opinion as string) || 'optional';
  selected.assigneeType = (data.assigneeType as string) || 'role';
  selected.assigneeValue = String(data.assigneeValue || '');
  selected.assigneeFlowKey = (data.assigneeFlowKey as string) || undefined;
  selected.multi = (data.multi as string) || 'single';
  selected.multiRatio = Number(data.multiRatio || 100);
  selected.emptyFallback = (data.emptyFallback as string) || 'admin';
  selected.fieldPermissions =
    data.fieldPermissions && typeof data.fieldPermissions === 'object'
      ? { ...(data.fieldPermissions as Record<string, string>) }
      : {};
  selected.conditionText = String(data.conditionText || '');
  selected.leaveCondition = blockFrom(data.leaveCondition as WfConditionBlock, {
    field: String(data.conditionField || ''),
    op: String(data.conditionOp || 'gt'),
    value: String(data.conditionValue || ''),
  });
  selected.edgeCondition = blockFrom(
    {
      items: data.items as undefined | WfConditionItem[],
      combine: String(data.combine || ''),
    },
    {
      field: String(data.conditionField || ''),
      op: String(data.conditionOp || 'eq'),
      value: String(data.conditionValue || ''),
    },
  );
  if (payload.kind) panelCollapsed.value = false;
  nextTick(() => {
    applying = false;
  });
}

function pushSelection() {
  if (applying || !canvas.value || !selected.id) return;
  if (selected.kind === 'node') {
    canvas.value.updateNodeData(selected.id, {
      name: selected.name,
      beforeFlowKey: selected.beforeFlowKey || '',
      afterFlowKey: selected.afterFlowKey || '',
      opinion: selected.opinion,
      assigneeType: selected.assigneeType,
      assigneeValue: selected.assigneeValue,
      assigneeFlowKey: selected.assigneeFlowKey || '',
      multi: selected.multi,
      multiRatio: selected.multiRatio,
      emptyFallback: selected.emptyFallback || 'admin',
      fieldPermissions: { ...selected.fieldPermissions },
      conditionText: selected.conditionText,
      leaveCondition: selected.leaveCondition,
      conditionField: '',
      conditionOp: '',
      conditionValue: '',
    });
  } else if (selected.kind === 'edge') {
    canvas.value.updateEdgeData(selected.id, {
      items: selected.edgeCondition.items,
      combine: selected.edgeCondition.combine,
      conditionField: '',
      conditionOp: '',
      conditionValue: '',
    });
  }
  dirty.value = true;
}

async function load() {
  const id = String(route.query.id || '');
  if (!id) {
    message.warning('缺少审批流 Id');
    return;
  }
  loading.value = true;
  canvasReady.value = false;
  try {
    wf.value = await getWorkflowDefinitionApi(id);
    meta.name = wf.value.name;
    meta.description = wf.value.description || '';
    meta.formRef = wf.value.formRef;
    await loadBoundFields(wf.value.formRef);
    meta.beforeStartFlowKey = wf.value.beforeStartFlowKey;
    meta.afterEndFlowKey = wf.value.afterEndFlowKey;
    const [forms, flows] = await Promise.all([
      getPublishedFormLookupApi().catch(() => ({ items: [] })),
      getReusableFlowLookupApi().catch(() => ({ items: [] })),
    ]);
    formOptions.value = forms.items || [];
    flowOptions.value = (flows.items || []).map((x) => ({
      label: `${x.name} (${x.code})`,
      value: x.code,
    }));
    await nextTick();
    mountCanvas(wf.value.processJson);
  } finally {
    loading.value = false;
  }
}

function mountCanvas(processJson: string) {
  if (!canvasRef.value || !minimapRef.value) return;
  canvas.value?.destroy();
  canvasReady.value = false;
  canvas.value = new WorkflowCanvas({
    container: canvasRef.value,
    minimap: minimapRef.value,
    data: processJsonToGraph(processJson),
    dark: isDark.value,
    onSelect: fillSelected,
    onDirty: () => {
      if (canvasReady.value) dirty.value = true;
    },
    onZoom: (percent) => {
      zoomPercent.value = percent;
    },
  });
  canvas.value.setMiniMapVisible(showMiniMap.value);
  zoomPercent.value = Math.round(canvas.value.graph.zoom() * 100);
  dirty.value = false;
  canvasReady.value = true;
}

function onPaletteMouseDown(kind: WfKind, event: MouseEvent) {
  canvas.value?.startDrag(kind, event);
}

async function save() {
  if (!wf.value || !canvas.value) return;
  saving.value = true;
  try {
    wf.value = await updateWorkflowDefinitionApi(wf.value.id, {
      name: meta.name,
      description: meta.description || undefined,
      formRef: meta.formRef,
      processJson: JSON.stringify(canvas.value.toData()),
      beforeStartFlowKey: meta.beforeStartFlowKey,
      afterEndFlowKey: meta.afterEndFlowKey,
    });
    dirty.value = false;
    message.success('已保存');
  } finally {
    saving.value = false;
  }
}

async function publish() {
  await save();
  if (!wf.value) return;
  wf.value = await publishWorkflowDefinitionApi(wf.value.id);
  message.success('已发布');
}

watch(
  () => meta.formRef,
  (code) => {
    loadBoundFields(code);
  },
);
watch(showMiniMap, (visible) => canvas.value?.setMiniMapVisible(visible));
watch(selected, pushSelection, { deep: true });
watch(
  meta,
  () => {
    if (canvasReady.value) dirty.value = true;
  },
  { deep: true },
);

onMounted(load);
onBeforeUnmount(() => {
  canvas.value?.destroy();
  canvas.value = null;
});
</script>

<template>
  <div
    class="bg-background text-foreground flex h-[calc(100vh-108px)] min-h-[680px] flex-col overflow-hidden"
  >
    <header
      class="border-border flex shrink-0 items-center gap-3 border-b px-3 py-2"
    >
      <Button type="text" @click="router.push('/orchestration/workflows')">
        <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
      </Button>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <Input
            v-model:value="meta.name"
            class="max-w-[240px] border-0 bg-transparent px-0 text-base font-semibold shadow-none"
          />
          <Tag :color="wf?.status === 1 ? 'success' : 'default'">
            {{ wf?.status === 1 ? '已发布' : '草稿' }}
          </Tag>
          <Tag v-if="dirty" color="orange">未保存</Tag>
          <span class="text-muted-foreground font-mono text-xs">{{
            wf?.code
          }}</span>
        </div>
      </div>
      <Space :size="4">
        <Button :loading="saving" type="primary" @click="save">
          <template #icon><IconifyIcon icon="lucide:save" /></template>
          保存
        </Button>
        <Button ghost type="primary" @click="publish">
          <template #icon><IconifyIcon icon="lucide:rocket" /></template>
          发布
        </Button>
      </Space>
    </header>

    <div
      class="border-border flex shrink-0 items-center gap-1 border-b px-2 py-1"
    >
      <Tooltip title="撤销">
        <Button size="small" type="text" @click="canvas?.undo()">
          <template #icon><IconifyIcon icon="lucide:undo-2" /></template>
        </Button>
      </Tooltip>
      <Tooltip title="重做">
        <Button size="small" type="text" @click="canvas?.redo()">
          <template #icon><IconifyIcon icon="lucide:redo-2" /></template>
        </Button>
      </Tooltip>
      <Divider type="vertical" class="mx-1 h-5" />
      <Tooltip title="缩小">
        <Button size="small" type="text" @click="canvas?.zoomBy(-0.1)">
          <template #icon><IconifyIcon icon="lucide:zoom-out" /></template>
        </Button>
      </Tooltip>
      <button
        class="text-muted-foreground px-1 text-xs tabular-nums"
        type="button"
        @click="canvas?.resetZoom()"
      >
        {{ zoomPercent }}%
      </button>
      <Tooltip title="放大">
        <Button size="small" type="text" @click="canvas?.zoomBy(0.1)">
          <template #icon><IconifyIcon icon="lucide:zoom-in" /></template>
        </Button>
      </Tooltip>
      <Tooltip title="适应画布">
        <Button size="small" type="text" @click="canvas?.fitView()">
          <template #icon><IconifyIcon icon="lucide:scan" /></template>
        </Button>
      </Tooltip>
      <Divider type="vertical" class="mx-1 h-5" />
      <Tooltip title="删除选中">
        <Button
          danger
          size="small"
          type="text"
          :disabled="!selected.id || selected.nodeType === 'start'"
          @click="
            () => {
              canvas?.deleteSelected();
              fillSelected({ kind: '' });
            }
          "
        >
          <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
        </Button>
      </Tooltip>
      <div class="ml-2 flex items-center gap-2 text-xs">
        <span class="text-muted-foreground">小地图</span>
        <Switch v-model:checked="showMiniMap" size="small" />
      </div>
      <div class="flex-1"></div>
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

    <div v-if="wf" class="flex min-h-0 flex-1">
      <aside
        class="border-border bg-card w-[232px] shrink-0 overflow-y-auto border-r"
      >
        <div
          class="border-border sticky top-0 z-[1] border-b bg-card/95 px-3 py-2.5 backdrop-blur"
        >
          <div class="text-sm font-semibold">节点库</div>
          <div class="text-muted-foreground mt-0.5 text-xs">
            按住拖到画布，再从连接点拉出连线
          </div>
        </div>
        <div class="space-y-2 p-3">
          <div
            v-for="item in palette"
            :key="item.kind"
            class="wf-palette-item cursor-grab active:cursor-grabbing"
            :style="{ '--accent': item.color, '--accent-soft': item.bg }"
            @mousedown="onPaletteMouseDown(item.kind, $event)"
          >
            <div
              class="flex size-8 items-center justify-center rounded-lg"
              :style="{ background: item.bg, color: item.color }"
            >
              <IconifyIcon class="size-4" :icon="item.icon" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium">{{ item.label }}</div>
              <div class="text-muted-foreground line-clamp-2 text-xs">
                {{ item.desc }}
              </div>
            </div>
          </div>
          <p
            class="text-muted-foreground px-1 pt-2 text-[11px] leading-relaxed"
          >
            开始节点固定。一条出线直接往下走。多条出线时，在连线上写条件并组合；没写条件的那条是默认分支。
          </p>
        </div>
      </aside>

      <main class="relative min-w-0 flex-1">
        <div
          v-if="loading"
          class="absolute inset-0 z-20 flex items-center justify-center bg-background/70 text-sm"
        >
          正在加载设计器…
        </div>
        <div
          class="pointer-events-none absolute left-3 top-3 z-10 rounded-lg border border-border/80 bg-card/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur"
        >
          <span class="text-muted-foreground">提示：</span>
          拖节点，从圆点拉出连线。点节点或连线后在右侧设置。
        </div>
        <div ref="canvasRef" class="h-full w-full"></div>
        <div
          ref="minimapRef"
          class="absolute bottom-3 right-3 z-10 overflow-hidden rounded-xl border border-border bg-card shadow-md"
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
            <Tag v-if="selected.kind">{{ typeLabel(selected.nodeType) }}</Tag>
          </div>

          <Form v-if="!selected.kind" layout="vertical" size="small">
            <Form.Item label="说明">
              <Input v-model:value="meta.description" />
            </Form.Item>
            <Form.Item label="绑定表单（一个审批流一张）">
              <Select
                v-model:value="meta.formRef"
                allow-clear
                class="w-full"
                show-search
                placeholder="已发布表单"
                :options="
                  formOptions.map((f) => ({
                    label: `${f.name} (${f.code})`,
                    value: f.code,
                  }))
                "
              />
            </Form.Item>
            <Form.Item label="启动前逻辑">
              <Select
                v-model:value="meta.beforeStartFlowKey"
                allow-clear
                class="w-full"
                show-search
                placeholder="已发布逻辑编排，可空"
                :options="flowOptions"
              />
            </Form.Item>
            <Form.Item label="结束后逻辑">
              <Select
                v-model:value="meta.afterEndFlowKey"
                allow-clear
                class="w-full"
                show-search
                placeholder="已发布逻辑编排，可空"
                :options="flowOptions"
              />
            </Form.Item>
            <p class="text-muted-foreground text-xs leading-relaxed">
              点画布上的节点或连线再写这一步。逻辑编排本身仍在「流程定义」里画。
            </p>
          </Form>

          <Form
            v-else-if="selected.kind === 'edge'"
            layout="vertical"
            size="small"
          >
            <WorkflowConditionEditor
              :model-value="selected.edgeCondition"
              :flow-options="flowOptions"
              hint="多条出线时按这里选择。不添加条件就是默认分支。组合式留空表示全部并且。"
              @update:model-value="(v) => (selected.edgeCondition = v)"
            />
          </Form>

          <Form v-else layout="vertical" size="small">
            <Form.Item label="节点名称">
              <Input v-model:value="selected.name" />
            </Form.Item>
            <template
              v-if="
                selected.nodeType !== 'end' && selected.nodeType !== 'condition'
              "
            >
              <Form.Item label="节点前执行">
                <Select
                  v-model:value="selected.beforeFlowKey"
                  allow-clear
                  class="w-full"
                  show-search
                  placeholder="逻辑编排，可空"
                  :options="flowOptions"
                />
              </Form.Item>
              <Form.Item label="节点后执行">
                <Select
                  v-model:value="selected.afterFlowKey"
                  allow-clear
                  class="w-full"
                  show-search
                  placeholder="逻辑编排，可空"
                  :options="flowOptions"
                />
              </Form.Item>
            </template>
            <template
              v-if="
                selected.nodeType === 'approver' || selected.nodeType === 'cc'
              "
            >
              <Form.Item label="处理人规则">
                <Select
                  v-model:value="selected.assigneeType"
                  class="w-full"
                  :options="[
                    { label: '指定角色', value: 'role' },
                    { label: '指定用户', value: 'user' },
                    { label: '发起人', value: 'starter' },
                    { label: '发起人部门主管', value: 'manager' },
                    { label: '表单字段里的人', value: 'formField' },
                    { label: '逻辑编排返回候选人', value: 'flow' },
                  ]"
                />
              </Form.Item>
              <Form.Item
                v-if="selected.assigneeType === 'flow'"
                label="选人流程"
              >
                <Select
                  v-model:value="selected.assigneeFlowKey"
                  allow-clear
                  class="w-full"
                  show-search
                  placeholder="返回用户名数组，或 { users: [] }"
                  :options="flowOptions"
                />
              </Form.Item>
              <Form.Item
                v-else-if="selected.assigneeType !== 'starter'"
                :label="
                  selected.assigneeType === 'manager' ? '主管角色码' : '处理人'
                "
              >
                <Input
                  v-model:value="selected.assigneeValue"
                  class="font-mono"
                  :placeholder="assigneePlaceholder(selected.assigneeType)"
                />
              </Form.Item>
            </template>
            <template v-if="selected.nodeType === 'approver'">
              <Form.Item label="处理意见">
                <Select
                  v-model:value="selected.opinion"
                  class="w-full"
                  :options="[
                    { label: '不填写', value: 'none' },
                    { label: '选填', value: 'optional' },
                    { label: '必填', value: 'required' },
                  ]"
                />
              </Form.Item>
              <Form.Item label="多人处理">
                <Select
                  v-model:value="selected.multi"
                  class="w-full"
                  :options="[
                    { label: '单人处理', value: 'single' },
                    { label: '会签：全部通过才进入下一节点', value: 'all' },
                    { label: '或签：一人通过即进入下一节点', value: 'any' },
                    { label: '依次审批', value: 'sequential' },
                    { label: '按比例通过后进入下一节点', value: 'ratio' },
                  ]"
                />
              </Form.Item>
              <Form.Item v-if="selected.multi === 'ratio'" label="通过比例">
                <Input
                  :value="String(selected.multiRatio ?? 100)"
                  suffix="%"
                  @update:value="
                    (v) => (selected.multiRatio = Number(v) || 100)
                  "
                />
              </Form.Item>
              <Form.Item label="候选人为空时">
                <Select
                  v-model:value="selected.emptyFallback"
                  class="w-full"
                  :options="[
                    { label: '自动转交管理员 (admin)', value: 'admin' },
                    { label: '自动跳过该节点', value: 'skip' },
                    { label: '提示报错并阻断', value: 'error' },
                  ]"
                />
              </Form.Item>
              <Form.Item label="表单字段权限">
                <p
                  v-if="boundFields.length === 0"
                  class="text-xs text-muted-foreground"
                >
                  先在左侧绑定一张已发布表单，这里会列出它的字段。
                </p>
                <div v-else class="flex flex-col gap-2">
                  <div
                    v-for="field in boundFields"
                    :key="field.field"
                    class="flex items-center gap-2"
                  >
                    <span class="w-28 truncate text-xs" :title="field.field">
                      {{ field.title }}
                    </span>
                    <Select
                      class="flex-1"
                      size="small"
                      :options="[
                        { label: '按表单本身', value: '' },
                        { label: '只读', value: 'read' },
                        { label: '可编辑', value: 'write' },
                        { label: '隐藏', value: 'hide' },
                        { label: '必填', value: 'required' },
                      ]"
                      :value="selected.fieldPermissions[field.field] || ''"
                      @update:value="
                        (v) => setFieldPermission(field.field, String(v || ''))
                      "
                    />
                  </div>
                </div>
              </Form.Item>
              <Form.Item label="离开本节点的条件">
                <WorkflowConditionEditor
                  :model-value="selected.leaveCondition"
                  :flow-options="flowOptions"
                  hint="成立才沿连线离开。可以对照单据、系统变量，或一条已发布逻辑编排的返回值。组合式留空表示全部并且。"
                  @update:model-value="(v) => (selected.leaveCondition = v)"
                />
              </Form.Item>
            </template>
            <template v-if="selected.nodeType === 'condition'">
              <Form.Item label="说明">
                <Input.TextArea
                  v-model:value="selected.conditionText"
                  :rows="3"
                  placeholder="写给配置的人看"
                />
              </Form.Item>
              <p class="text-muted-foreground text-xs leading-relaxed">
                分支写在从这里拉出的连线上。字段留空的连线是其他条件都不成立时走的默认分支。
              </p>
            </template>
            <template v-if="selected.nodeType === 'end'">
              <p class="text-muted-foreground text-xs leading-relaxed">
                走到这里这条分支结束。结束后要调用的逻辑编排，在未选中时的「流程信息」里设置。
              </p>
            </template>
          </Form>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.wf-palette-item {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.625rem 0.75rem;
  user-select: none;
  background: color-mix(in srgb, var(--accent-soft) 70%, transparent);
  border: 1px solid transparent;
  border-radius: 0.75rem;
}

.wf-palette-item:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
</style>
