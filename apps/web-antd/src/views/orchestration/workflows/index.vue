<script lang="ts" setup>
/**
 * OA 审批流定义列表（钉钉式设计器入口）
 * 参考：https://stavinli.github.io/Workflow-Vue3/dist/index.html#/
 * 与逻辑编排 definitions 完全分离
 */
import type {
  FormDef,
  FormDefinitionLookup,
  WorkflowDefinition,
  WorkflowTask,
} from '#/api/saas/orchestration';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  completeWorkflowTaskApi,
  createWorkflowDefinitionApi,
  deleteWorkflowDefinitionApi,
  getMyWorkflowTasksApi,
  getPublishedFormDefinitionApi,
  getPublishedFormLookupApi,
  getWorkflowDefinitionsApi,
  publishWorkflowDefinitionApi,
  startWorkflowApi,
} from '#/api/saas/orchestration';
import { normalizeFormDef } from '#/views/orchestration/shared/form-schema';
import FormSchemaRenderer from '#/views/orchestration/shared/form-schema-renderer.vue';

defineOptions({ name: 'OrchestrationWorkflows' });

const router = useRouter();
const loading = ref(false);
const items = ref<WorkflowDefinition[]>([]);
const total = ref(0);
const filter = ref('');
const statusFilter = ref<'all' | number>('all');
const page = reactive({ current: 1, pageSize: 10 });
const creating = ref(false);
const creatingBusy = ref(false);
const formOptions = ref<FormDefinitionLookup[]>([]);
const createForm = reactive({
  code: '',
  name: '',
  description: '',
  formRef: undefined as string | undefined,
});

const stats = computed(() => ({
  total: total.value,
  published: items.value.filter((x) => x.status === 1).length,
  draft: items.value.filter((x) => x.status === 0).length,
}));

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '编码', dataIndex: 'code', key: 'code', width: 140 },
  { title: '绑定表单', dataIndex: 'formRef', key: 'formRef', width: 140 },
  { title: '状态', key: 'status', width: 90 },
  { title: '操作', key: 'actions', width: 320 },
];

const starting = ref<null | WorkflowDefinition>(null);
const startRecord = ref('{}');
const startBusy = ref(false);
const tasksOpen = ref(false);
const tasksLoading = ref(false);
const tasks = ref<WorkflowTask[]>([]);
const opinions = reactive<Record<string, string>>({});

async function load() {
  loading.value = true;
  try {
    const res = await getWorkflowDefinitionsApi({
      filter: filter.value || undefined,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      maxResultCount: page.pageSize,
      skipCount: (page.current - 1) * page.pageSize,
    });
    items.value = res.items || [];
    total.value = res.totalCount || 0;
  } finally {
    loading.value = false;
  }
}

async function openCreate() {
  createForm.code = '';
  createForm.name = '';
  createForm.description = '';
  createForm.formRef = undefined;
  try {
    const res = await getPublishedFormLookupApi();
    formOptions.value = res.items || [];
  } catch {
    formOptions.value = [];
  }
  creating.value = true;
}

async function confirmCreate() {
  if (!createForm.code.trim() || !createForm.name.trim()) {
    message.warning('请填写编码与名称');
    return;
  }
  creatingBusy.value = true;
  try {
    const created = await createWorkflowDefinitionApi({
      code: createForm.code.trim(),
      name: createForm.name.trim(),
      description: createForm.description.trim() || undefined,
      formRef: createForm.formRef,
    });
    creating.value = false;
    message.success('已创建，进入设计器');
    router.push({
      path: '/orchestration/workflows/designer',
      query: { id: created.id },
    });
  } finally {
    creatingBusy.value = false;
  }
}

function openDesigner(row: WorkflowDefinition) {
  router.push({
    path: '/orchestration/workflows/designer',
    query: { id: row.id },
  });
}

async function publish(row: WorkflowDefinition) {
  await publishWorkflowDefinitionApi(row.id);
  message.success('已发布');
  await load();
}

const startSchema = ref<FormDef | null>(null);
const startDraft = ref<Record<string, unknown>>({});
const formSchemas = ref<Record<string, FormDef>>({});
const drafts = reactive<Record<string, Record<string, unknown>>>({});

function parseRecord(text?: string) {
  try {
    const value = JSON.parse(text || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    /* 空单据 */
  }
  return {};
}

interface HistoryItem {
  nodeId?: string;
  nodeName?: string;
  operatorUserName?: string;
  action?: string;
  opinion?: string;
  time?: string;
}

function historyItems(task: WorkflowTask): HistoryItem[] {
  try {
    const list = JSON.parse(task.historyJson || '[]');
    return Array.isArray(list) ? (list as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

function actionLabel(action: string) {
  if (action === 'start') return '发起';
  if (action === 'approve') return '同意';
  if (action === 'reject_to_prev') return '驳回上一步';
  if (action === 'reject_to_starter') return '退回发起人';
  if (action === 'reject_terminate') return '终止作废';
  if (action === 'transfer') return '转办';
  return action || '办理';
}

function recordPatch(task: WorkflowTask) {
  const original = parseRecord(task.recordJson);
  const draft = drafts[task.id] || original;
  const perms = task.fieldPermissions || {};
  const patch: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(original), ...Object.keys(draft)]);
  for (const key of keys) {
    const perm = perms[key];
    if (perm === 'read' || perm === 'hide') continue;
    if (JSON.stringify(original[key]) !== JSON.stringify(draft[key])) {
      patch[key] = draft[key];
    }
  }
  return patch;
}

async function ensureForm(code?: string) {
  if (!code || formSchemas.value[code]) return formSchemas.value[code || ''];
  const form = await getPublishedFormDefinitionApi(code);
  formSchemas.value = {
    ...formSchemas.value,
    [code]: normalizeFormDef(form.schema),
  };
  return formSchemas.value[code];
}

function openStart(row: WorkflowDefinition) {
  starting.value = row;
  startRecord.value = '{}';
  startSchema.value = null;
  startDraft.value = {};
  if (!row.formRef) return;
  ensureForm(row.formRef).then((schema) => {
    startSchema.value = schema || null;
  });
}

function startRecordJson() {
  if (startSchema.value) return JSON.stringify(startDraft.value);
  const raw = startRecord.value.trim() || '{}';
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      message.warning('提交数据需要是一个 JSON 对象');
      return undefined;
    }
    return JSON.stringify(parsed);
  } catch {
    message.warning('提交数据不是合法 JSON');
    return undefined;
  }
}

async function confirmStart() {
  if (!starting.value) return;
  const recordJson = startRecordJson();
  if (recordJson === undefined) return;
  startBusy.value = true;
  try {
    const instance = await startWorkflowApi({
      code: starting.value.code,
      recordJson,
    });
    starting.value = null;
    message.success(
      instance.status === 'running'
        ? '已发起，待办在「我的待办」'
        : `流程已结束（${instance.result || instance.status}）`,
    );
  } finally {
    startBusy.value = false;
  }
}

async function openTasks() {
  tasksOpen.value = true;
  tasksLoading.value = true;
  try {
    const res = await getMyWorkflowTasksApi();
    tasks.value = res.items || [];
    for (const task of tasks.value) {
      drafts[task.id] = parseRecord(task.recordJson);
      if (task.formRef) await ensureForm(task.formRef);
    }
  } finally {
    tasksLoading.value = false;
  }
}

function completeHint(
  status: string,
  pass: boolean,
  result: string | undefined,
) {
  if (status !== 'running') return `流程已结束（${result || status}）`;
  if (pass) return '已同意，流程继续';
  return '已记录，等待其他人';
}

const transferUsers = reactive<Record<string, string>>({});
const showTransfer = reactive<Record<string, boolean>>({});

async function executeTaskAction(
  task: WorkflowTask,
  action:
    | 'approve'
    | 'reject_terminate'
    | 'reject_to_prev'
    | 'reject_to_starter'
    | 'transfer',
) {
  const opinion = opinions[task.id]?.trim();
  const transferUser = transferUsers[task.id]?.trim();

  if (action === 'transfer' && !transferUser) {
    message.warning('请输入转办目标用户名');
    return;
  }

  try {
    const patch = recordPatch(task);
    const instance = await completeWorkflowTaskApi(task.id, {
      action,
      pass: action === 'approve',
      opinion: opinion || undefined,
      transferUserName: action === 'transfer' ? transferUser : undefined,
      recordPatch:
        (action === 'approve' || action === 'reject_to_starter') &&
        Object.keys(patch).length > 0
          ? patch
          : undefined,
    });
    if (action === 'approve') {
      message.success(completeHint(instance.status, true, instance.result));
    } else if (action === 'transfer') {
      message.success(`已转办给 ${transferUser}`);
    } else if (action === 'reject_to_starter') {
      message.success('已退回给发起人修改');
    } else if (action === 'reject_to_prev') {
      message.success('已驳回至上一审批节点');
    } else {
      message.warning('已彻底终止作废该流程');
    }
    showTransfer[task.id] = false;
    await openTasks();
  } catch {
    /* 拦截器已提示 */
  }
}

async function remove(row: WorkflowDefinition) {
  Modal.confirm({
    title: `删除审批流「${row.name}」？`,
    okType: 'danger',
    async onOk() {
      await deleteWorkflowDefinitionApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

onMounted(load);
</script>

<template>
  <Page
    description="OA 人审工作流（钉钉式节点树）。与「流程定义」逻辑编排分离；须绑定已发布表单库 formRef。"
    title="OA审批流"
  >
    <div class="mb-4 grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border border-border p-3">
        <div class="text-xs text-muted-foreground">全部</div>
        <div class="text-xl font-semibold">{{ stats.total }}</div>
      </div>
      <div class="rounded-lg border border-border p-3">
        <div class="text-xs text-muted-foreground">已发布</div>
        <div class="text-xl font-semibold text-green-600">
          {{ stats.published }}
        </div>
      </div>
      <div class="rounded-lg border border-border p-3">
        <div class="text-xs text-muted-foreground">草稿</div>
        <div class="text-xl font-semibold">{{ stats.draft }}</div>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Space wrap>
        <Input
          v-model:value="filter"
          allow-clear
          placeholder="搜索名称 / 编码"
          style="width: 200px"
          @press-enter="load"
        />
        <Segmented
          v-model:value="statusFilter"
          :options="[
            { label: '全部', value: 'all' },
            { label: '草稿', value: 0 },
            { label: '已发布', value: 1 },
          ]"
          @change="
            () => {
              page.current = 1;
              load();
            }
          "
        />
        <Button @click="load">查询</Button>
      </Space>
      <Space>
        <Button @click="openTasks">我的待办</Button>
        <AccessControl :codes="['Orchestration.Workflows.Create']" type="code">
          <Button type="primary" @click="openCreate">新建审批流</Button>
        </AccessControl>
      </Space>
    </div>

    <Table
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="{
        current: page.current,
        pageSize: page.pageSize,
        total,
        onChange: (c: number, s: number) => {
          page.current = c;
          page.pageSize = s;
          load();
        },
      }"
      row-key="id"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'formRef'">
          <code class="text-xs">{{
            (record as WorkflowDefinition).formRef || '—'
          }}</code>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag
            :color="
              (record as WorkflowDefinition).status === 1
                ? 'success'
                : 'default'
            "
          >
            {{
              (record as WorkflowDefinition).status === 1 ? '已发布' : '草稿'
            }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space>
            <Button
              v-if="(record as WorkflowDefinition).status === 1"
              size="small"
              type="link"
              @click="openStart(record as WorkflowDefinition)"
            >
              发起
            </Button>
            <Button
              size="small"
              type="link"
              @click="openDesigner(record as WorkflowDefinition)"
            >
              设计
            </Button>
            <AccessControl
              :codes="['Orchestration.Workflows.Publish']"
              type="code"
            >
              <Button
                size="small"
                type="link"
                @click="publish(record as WorkflowDefinition)"
              >
                发布
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.Workflows.Delete']"
              type="code"
            >
              <Button
                danger
                size="small"
                type="link"
                @click="remove(record as WorkflowDefinition)"
              >
                删除
              </Button>
            </AccessControl>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="creating"
      title="新建 OA 审批流"
      :confirm-loading="creatingBusy"
      ok-text="创建并设计"
      @ok="confirmCreate"
    >
      <Form layout="vertical">
        <Form.Item label="编码" required>
          <Input v-model:value="createForm.code" class="font-mono" />
        </Form.Item>
        <Form.Item label="名称" required>
          <Input v-model:value="createForm.name" />
        </Form.Item>
        <Form.Item label="说明">
          <Input v-model:value="createForm.description" />
        </Form.Item>
        <Form.Item label="绑定表单（已发布）">
          <Select
            v-model:value="createForm.formRef"
            allow-clear
            class="w-full"
            :options="
              formOptions.map((f) => ({
                label: `${f.name} (${f.code}) · ${f.fieldCount} 字段`,
                value: f.code,
              }))
            "
            placeholder="从「表单库」已发布项选择"
            show-search
          />
          <p class="mt-1 text-xs text-muted-foreground">
            无选项时请先到「表单库」发布表单。
            <a class="text-primary" @click="router.push('/orchestration/forms')">去表单库</a>
          </p>
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      :open="!!starting"
      title="发起审批"
      :confirm-loading="startBusy"
      ok-text="发起"
      @cancel="starting = null"
      @ok="confirmStart"
    >
      <p class="mb-2 text-sm text-muted-foreground">
        {{ starting?.name }} · 表单
        <code>{{ starting?.formRef || '未绑定' }}</code>
      </p>
      <FormSchemaRenderer
        v-if="startSchema"
        mode="create"
        :model-value="startDraft"
        :schema="startSchema"
        @update:model-value="(v) => (startDraft = v)"
      />
      <template v-else>
        <Input.TextArea
          v-model:value="startRecord"
          :rows="8"
          class="font-mono"
          placeholder="{&quot;days&quot;:3}"
        />
        <p class="mt-1 text-xs text-muted-foreground">
          未绑定表单时直接填写一份 JSON。子表是数组。
        </p>
      </template>
    </Modal>

    <Drawer
      v-model:open="tasksOpen"
      title="我的待办"
      width="760"
      :body-style="{ paddingTop: '12px' }"
    >
      <div v-if="tasksLoading" class="text-sm text-muted-foreground">
        加载中…
      </div>
      <div v-else-if="tasks.length === 0" class="text-sm text-muted-foreground">
        没有待办
      </div>
      <div v-else class="flex flex-col gap-3">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="rounded-lg border border-border p-3"
        >
          <div class="font-medium">{{ task.nodeName }}</div>
          <div class="mt-1 text-xs text-muted-foreground">
            {{ task.workflowCode }}
            <span v-if="task.formRef"> · {{ task.formRef }}</span>
            <span v-if="task.candidateRole">
              · 角色 {{ task.candidateRole }}</span>
          </div>
          <ol
            v-if="historyItems(task).length"
            class="mt-3 space-y-2 border-l border-border pl-3"
          >
            <li v-for="(item, index) in historyItems(task)" :key="index">
              <div class="text-sm">
                {{ actionLabel(String(item.action || '')) }} ·
                {{ item.nodeName || item.nodeId }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ item.operatorUserName }}
                <span v-if="item.time"> · {{ item.time }}</span>
              </div>
              <div v-if="item.opinion" class="text-xs">{{ item.opinion }}</div>
            </li>
          </ol>
          <FormSchemaRenderer
            v-if="task.formRef && formSchemas[task.formRef]"
            class="mt-3"
            mode="update"
            :field-permissions="task.fieldPermissions"
            :model-value="drafts[task.id] || {}"
            :schema="formSchemas[task.formRef]"
            @update:model-value="(v) => (drafts[task.id] = v)"
          />
          <Input.TextArea
            v-model:value="opinions[task.id]"
            :rows="2"
            class="mt-2"
            placeholder="处理意见"
          />
          <div
            v-if="showTransfer[task.id]"
            class="mt-2 flex items-center gap-2"
          >
            <Input
              v-model:value="transferUsers[task.id]"
              size="small"
              placeholder="请输入接手人用户名"
              class="flex-1"
            />
            <Button
              size="small"
              type="primary"
              @click="executeTaskAction(task, 'transfer')"
            >
              确认转办
            </Button>
            <Button size="small" @click="showTransfer[task.id] = false">
              取消
            </Button>
          </div>
          <Space wrap class="mt-2">
            <Button
              size="small"
              type="primary"
              @click="executeTaskAction(task, 'approve')"
            >
              同意
            </Button>
            <Button
              size="small"
              @click="executeTaskAction(task, 'reject_to_prev')"
            >
              驳回上一步
            </Button>
            <Button
              size="small"
              @click="executeTaskAction(task, 'reject_to_starter')"
            >
              退回发起人
            </Button>
            <Button
              size="small"
              @click="showTransfer[task.id] = !showTransfer[task.id]"
            >
              转办
            </Button>
            <Button
              danger
              size="small"
              @click="executeTaskAction(task, 'reject_terminate')"
            >
              终止作废
            </Button>
          </Space>
        </div>
      </div>
    </Drawer>
  </Page>
</template>
