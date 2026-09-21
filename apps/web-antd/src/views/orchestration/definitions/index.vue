<script lang="ts" setup>
import type { FlowDefinition } from '#/api/saas/orchestration';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Card,
  Form,
  Input,
  message,
  Modal,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  createFlowDefinitionApi,
  DEFAULT_FLOW_DSL,
  deleteFlowDefinitionApi,
  getFlowDefinitionsApi,
  publishFlowDefinitionApi,
  startFlowInstanceApi,
} from '#/api/saas/orchestration';

import { createDefaultGraph, parseDsl } from '../shared/dsl-graph';
import { definitionStatusMeta, formatDateTime } from '../shared/flow-meta';
import { buildSampleInputJson } from '../shared/schema-utils';

defineOptions({ name: 'OrchestrationDefinitions' });

const router = useRouter();
const loading = ref(false);
const items = ref<FlowDefinition[]>([]);
const total = ref(0);
const filter = ref('');
const statusFilter = ref<'all' | number>('all');
const page = reactive({ current: 1, pageSize: 10 });

const createOpen = ref(false);
const runOpen = ref(false);
const saving = ref(false);
const createForm = reactive({
  name: '',
  code: '',
  category: '',
  isReusable: false,
});
const runForm = reactive({
  definitionId: '',
  definitionName: '',
  variablesJson: '{\n  "amount": 1500\n}',
});

const stats = computed(() => {
  const all = items.value;
  return {
    total: total.value,
    published: all.filter((x) => x.status === 1).length,
    draft: all.filter((x) => x.status === 0).length,
  };
});

async function load() {
  loading.value = true;
  try {
    const result = await getFlowDefinitionsApi({
      filter: filter.value || undefined,
      status:
        statusFilter.value === 'all' ? undefined : (statusFilter.value as any),
      maxResultCount: page.pageSize,
      skipCount: (page.current - 1) * page.pageSize,
    });
    items.value = result.items ?? [];
    total.value = result.totalCount ?? 0;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  createForm.name = '';
  createForm.code = `flow_${Date.now().toString(36)}`;
  createForm.category = '默认';
  createForm.isReusable = false;
  createOpen.value = true;
}

async function saveCreate() {
  if (!createForm.name.trim() || !createForm.code.trim()) {
    message.warning('请填写名称与编码');
    return;
  }
  saving.value = true;
  try {
    const graph = createDefaultGraph();
    const dsl = parseDsl(DEFAULT_FLOW_DSL);
    dsl.key = createForm.code.trim();
    const created = await createFlowDefinitionApi({
      name: createForm.name.trim(),
      code: createForm.code.trim(),
      category: createForm.category.trim() || undefined,
      isReusable: createForm.isReusable,
      dslJson: JSON.stringify(dsl, null, 2),
      graphJson: JSON.stringify(graph),
    });
    createOpen.value = false;
    message.success('流程已创建，进入设计器');
    router.push({
      path: '/orchestration/definitions/designer',
      query: { id: created.id },
    });
  } finally {
    saving.value = false;
  }
}

function openDesigner(record: FlowDefinition) {
  router.push({
    path: '/orchestration/definitions/designer',
    query: { id: record.id },
  });
}

async function publish(record: FlowDefinition) {
  await publishFlowDefinitionApi(record.id);
  message.success(`已发布为 v${(record.publishedVersion ?? 0) + 1}`);
  await load();
}

function openRun(record: FlowDefinition) {
  runForm.definitionId = record.id;
  runForm.definitionName = record.name;
  try {
    const dsl = parseDsl(record.dslJson);
    const sample = buildSampleInputJson(dsl.inputs || []);
    // 演示流常用样例：amount 给一个触发高风险分支的值
    if (sample.amount === 0 || sample.amount === undefined) {
      sample.amount = 1500;
    }
    runForm.variablesJson = JSON.stringify(
      Object.keys(sample).length > 0 ? sample : { amount: 1500 },
      null,
      2,
    );
  } catch {
    runForm.variablesJson = '{\n  "amount": 1500\n}';
  }
  runOpen.value = true;
}

async function saveRun() {
  saving.value = true;
  try {
    const instance = await startFlowInstanceApi({
      definitionId: runForm.definitionId,
      variablesJson: runForm.variablesJson,
    });
    runOpen.value = false;
    message.success(instance.status === 1 ? '运行成功' : '运行结束');
    router.push({
      path: '/orchestration/instances',
      query: { instanceId: instance.id },
    });
  } finally {
    saving.value = false;
  }
}

function remove(record: FlowDefinition) {
  Modal.confirm({
    title: '删除流程',
    content: `确认删除「${record.name}」？此操作不可恢复。`,
    okType: 'danger',
    onOk: async () => {
      await deleteFlowDefinitionApi(record.id);
      message.success('已删除');
      await load();
    },
  });
}

function onSearch() {
  page.current = 1;
  load();
}

const columns = [
  { title: '流程', key: 'flow', ellipsis: true },
  { title: '状态', key: 'status', width: 110 },
  { title: '组件', key: 'reusable', width: 80 },
  { title: '版本', key: 'version', width: 90 },
  { title: '更新时间', key: 'time', width: 180 },
  { title: '操作', key: 'actions', width: 220, fixed: 'right' as const },
];

onMounted(load);
</script>

<template>
  <Page
    auto-content-height
    description="可视化编排业务逻辑：设计 → 发布 → 手动运行 / 试运行"
    title="流程定义"
  >
    <template #extra>
      <AccessControl :codes="['Orchestration.Definitions.Create']" type="code">
        <Button type="primary" @click="openCreate">
          <template #icon>
            <IconifyIcon icon="lucide:plus" />
          </template>
          新建流程
        </Button>
      </AccessControl>
    </template>

    <div class="flex h-full flex-col gap-4 p-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <Card class="shadow-sm" :bordered="false">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"
            >
              <IconifyIcon class="size-5" icon="lucide:workflow" />
            </div>
            <div>
              <div class="text-muted-foreground text-xs">全部流程</div>
              <div class="text-2xl font-semibold tabular-nums">
                {{ stats.total }}
              </div>
            </div>
          </div>
        </Card>
        <Card class="shadow-sm" :bordered="false">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"
            >
              <IconifyIcon class="size-5" icon="lucide:check-circle-2" />
            </div>
            <div>
              <div class="text-muted-foreground text-xs">本页已发布</div>
              <div class="text-2xl font-semibold tabular-nums">
                {{ stats.published }}
              </div>
            </div>
          </div>
        </Card>
        <Card class="shadow-sm" :bordered="false">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"
            >
              <IconifyIcon class="size-5" icon="lucide:file-pen-line" />
            </div>
            <div>
              <div class="text-muted-foreground text-xs">本页草稿</div>
              <div class="text-2xl font-semibold tabular-nums">
                {{ stats.draft }}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card class="min-h-0 flex-1 shadow-sm" :bordered="false">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Space wrap>
            <Input
              v-model:value="filter"
              allow-clear
              placeholder="搜索名称 / 编码"
              style="width: 240px"
              @press-enter="onSearch"
            >
              <template #prefix>
                <IconifyIcon
                  class="text-muted-foreground"
                  icon="lucide:search"
                />
              </template>
            </Input>
            <Segmented
              v-model:value="statusFilter"
              :options="[
                { label: '全部', value: 'all' },
                { label: '草稿', value: 0 },
                { label: '已发布', value: 1 },
                { label: '已禁用', value: 2 },
              ]"
              @change="onSearch"
            />
            <Button @click="onSearch">查询</Button>
          </Space>
        </div>

        <Table
          :columns="columns"
          :data-source="items"
          :loading="loading"
          :locale="{ emptyText: '暂无流程，点击右上角新建' }"
          :pagination="{
            current: page.current,
            pageSize: page.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (c: number, s: number) => {
              page.current = c;
              page.pageSize = s;
              load();
            },
          }"
          :scroll="{ x: 900 }"
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'flow'">
              <div class="flex min-w-0 items-start gap-3">
                <div
                  class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"
                >
                  <IconifyIcon class="size-4" icon="lucide:git-branch" />
                </div>
                <div class="min-w-0">
                  <div class="truncate font-medium">
                    {{ (record as FlowDefinition).name }}
                  </div>
                  <div
                    class="text-muted-foreground mt-0.5 flex flex-wrap gap-2 text-xs"
                  >
                    <span class="font-mono">{{
                      (record as FlowDefinition).code
                    }}</span>
                    <span v-if="(record as FlowDefinition).category">
                      · {{ (record as FlowDefinition).category }}
                    </span>
                  </div>
                </div>
              </div>
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag
                :color="
                  definitionStatusMeta[(record as FlowDefinition).status]?.color
                "
              >
                {{
                  definitionStatusMeta[(record as FlowDefinition).status]?.text
                }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'reusable'">
              <Tag v-if="(record as FlowDefinition).isReusable" color="cyan">
                组件
              </Tag>
              <span v-else class="text-muted-foreground">—</span>
            </template>
            <template v-else-if="column.key === 'version'">
              <span
                v-if="(record as FlowDefinition).publishedVersion"
                class="tabular-nums"
              >
                v{{ (record as FlowDefinition).publishedVersion }}
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </template>
            <template v-else-if="column.key === 'time'">
              <span class="text-muted-foreground text-sm">
                {{
                  formatDateTime(
                    (record as FlowDefinition).lastModificationTime ||
                      (record as FlowDefinition).creationTime,
                  )
                }}
              </span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space>
                <AccessControl
                  :codes="['Orchestration.Definitions.Update']"
                  type="code"
                >
                  <Button
                    size="small"
                    type="link"
                    @click="openDesigner(record as FlowDefinition)"
                  >
                    设计
                  </Button>
                </AccessControl>
                <AccessControl
                  :codes="['Orchestration.Instances.Run']"
                  type="code"
                >
                  <Tooltip
                    :title="
                      (record as FlowDefinition).publishedVersion
                        ? ''
                        : '请先发布后再运行'
                    "
                  >
                    <Button
                      :disabled="!(record as FlowDefinition).publishedVersion"
                      size="small"
                      type="link"
                      @click="openRun(record as FlowDefinition)"
                    >
                      运行
                    </Button>
                  </Tooltip>
                </AccessControl>
                <AccessControl
                  :codes="['Orchestration.Definitions.Publish']"
                  type="code"
                >
                  <Button
                    size="small"
                    type="link"
                    @click="publish(record as FlowDefinition)"
                  >
                    发布
                  </Button>
                </AccessControl>
                <AccessControl
                  :codes="['Orchestration.Definitions.Delete']"
                  type="code"
                >
                  <Button
                    danger
                    size="small"
                    type="link"
                    @click="remove(record as FlowDefinition)"
                  >
                    删除
                  </Button>
                </AccessControl>
              </Space>
            </template>
          </template>
        </Table>
      </Card>
    </div>

    <Modal
      v-model:open="createOpen"
      :confirm-loading="saving"
      destroy-on-close
      ok-text="创建并设计"
      title="新建流程"
      @ok="saveCreate"
    >
      <Form class="mt-2" layout="vertical">
        <Form.Item label="名称" required>
          <Input
            v-model:value="createForm.name"
            placeholder="例如：超额订单通知"
          />
        </Form.Item>
        <Form.Item label="编码" required>
          <Input
            v-model:value="createForm.code"
            class="font-mono"
            placeholder="唯一编码，如 order-notify"
          />
        </Form.Item>
        <Form.Item label="分类">
          <Input v-model:value="createForm.category" placeholder="可选" />
        </Form.Item>
        <Form.Item label="可复用逻辑组件">
          <Switch v-model:checked="createForm.isReusable" />
          <div class="text-muted-foreground mt-1 text-xs">
            开启后可被其它流程以 SubFlow 节点调用（需发布）。
          </div>
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="runOpen"
      :confirm-loading="saving"
      :title="`运行 · ${runForm.definitionName}`"
      destroy-on-close
      ok-text="开始执行"
      width="560px"
      @ok="saveRun"
    >
      <div class="text-muted-foreground mb-3 text-sm">
        填写初始变量 JSON，将按已发布版本同步执行。须包含流程「请求参数」里所有
        <code>required</code>
        字段（已按当前草稿 DSL 预填样例，可改）。
      </div>
      <Input.TextArea
        v-model:value="runForm.variablesJson"
        :rows="10"
        class="font-mono text-sm"
      />
    </Modal>
  </Page>
</template>
