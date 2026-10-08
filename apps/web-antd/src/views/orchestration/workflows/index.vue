<script lang="ts" setup>
/**
 * OA 审批流定义列表（钉钉式设计器入口）
 * 参考：https://stavinli.github.io/Workflow-Vue3/dist/index.html#/
 * 与逻辑编排 definitions 完全分离
 */
import type {
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
  getPublishedFormLookupApi,
  getWorkflowDefinitionsApi,
  publishWorkflowDefinitionApi,
  startWorkflowApi,
} from '#/api/saas/orchestration';

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

function openStart(row: WorkflowDefinition) {
  starting.value = row;
  startRecord.value = '{}';
}

async function confirmStart() {
  if (!starting.value) return;
  let recordJson = startRecord.value.trim() || '{}';
  try {
    const parsed = JSON.parse(recordJson);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      message.warning('提交数据需要是一个 JSON 对象');
      return;
    }
    recordJson = JSON.stringify(parsed);
  } catch {
    message.warning('提交数据不是合法 JSON');
    return;
  }
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

async function completeTask(task: WorkflowTask, pass: boolean) {
  const opinion = opinions[task.id]?.trim();
  try {
    const instance = await completeWorkflowTaskApi(task.id, {
      pass,
      opinion: opinion || undefined,
    });
    message.success(completeHint(instance.status, pass, instance.result));
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
      <Input.TextArea
        v-model:value="startRecord"
        :rows="8"
        class="font-mono"
        placeholder="{&quot;days&quot;:3}"
      />
      <p class="mt-1 text-xs text-muted-foreground">
        一份提交数据。子表是数组，树的下级在 children。
      </p>
    </Modal>

    <Drawer
      v-model:open="tasksOpen"
      title="我的待办"
      width="480"
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
          <Input.TextArea
            v-model:value="opinions[task.id]"
            :rows="2"
            class="mt-2"
            placeholder="处理意见"
          />
          <Space class="mt-2">
            <Button
              size="small"
              type="primary"
              @click="completeTask(task, true)"
            >
              同意
            </Button>
            <Button danger size="small" @click="completeTask(task, false)">
              驳回
            </Button>
          </Space>
        </div>
      </div>
    </Drawer>
  </Page>
</template>
