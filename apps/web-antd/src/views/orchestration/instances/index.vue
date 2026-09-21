<script lang="ts" setup>
import type { FlowInstance } from '#/api/saas/orchestration';

import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  message,
  Modal,
  Segmented,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  deleteFlowInstanceApi,
  deleteManyFlowInstancesApi,
  getFlowInstanceApi,
  getFlowInstancesApi,
} from '#/api/saas/orchestration';

import ExecutionTimeline from '../shared/execution-timeline.vue';
import { formatDateTime, instanceStatusMeta } from '../shared/flow-meta';

defineOptions({ name: 'OrchestrationInstances' });

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const deleting = ref(false);
const items = ref<FlowInstance[]>([]);
const total = ref(0);
const page = reactive({ current: 1, pageSize: 10 });
const status = ref<'all' | number>('all');
const definitionId = ref('');
const selectedRowKeys = ref<string[]>([]);

const detailOpen = ref(false);
const detail = ref<FlowInstance | null>(null);
const detailLoading = ref(false);

const isInstancesRoute = computed(() =>
  String(route.path || '').includes('/orchestration/instances'),
);

const successRate = computed(() => {
  if (items.value.length === 0) return 0;
  const ok = items.value.filter((x) => x.status === 1).length;
  return Math.round((ok / items.value.length) * 100);
});

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (number | string)[]) => {
    selectedRowKeys.value = keys.map(String);
  },
}));

async function load() {
  loading.value = true;
  try {
    const result = await getFlowInstancesApi({
      definitionId: definitionId.value || undefined,
      status: status.value === 'all' ? undefined : (status.value as any),
      maxResultCount: page.pageSize,
      skipCount: (page.current - 1) * page.pageSize,
    });
    items.value = result.items ?? [];
    total.value = result.totalCount ?? 0;
    // 翻页后去掉不在本页的勾选
    const pageIds = new Set(items.value.map((x) => x.id));
    selectedRowKeys.value = selectedRowKeys.value.filter((id) =>
      pageIds.has(id),
    );
  } finally {
    loading.value = false;
  }
}

async function openDetail(record: FlowInstance) {
  detail.value = record;
  detailOpen.value = true;
  if (record.nodes?.length) {
    return;
  }
  detailLoading.value = true;
  try {
    detail.value = await getFlowInstanceApi(record.id);
  } catch {
    // ABP 拦截器已提示
  } finally {
    detailLoading.value = false;
  }
}

async function openByQuery() {
  if (!isInstancesRoute.value) {
    return;
  }
  const id = String(route.query.instanceId || '');
  if (!id) {
    return;
  }
  detailLoading.value = true;
  detailOpen.value = true;
  try {
    detail.value = await getFlowInstanceApi(id);
  } catch {
    detailOpen.value = false;
    detail.value = null;
    const nextQuery = { ...route.query };
    delete nextQuery.instanceId;
    delete nextQuery.id;
    await router.replace({ path: route.path, query: nextQuery });
  } finally {
    detailLoading.value = false;
  }
}

function onSearch() {
  page.current = 1;
  selectedRowKeys.value = [];
  load();
}

function removeOne(record: FlowInstance) {
  Modal.confirm({
    title: '删除执行实例',
    content: `确认删除「${record.definitionName}」的这条执行记录？不可恢复。`,
    okType: 'danger',
    onOk: async () => {
      deleting.value = true;
      try {
        await deleteFlowInstanceApi(record.id);
        message.success('已删除');
        if (detail.value?.id === record.id) {
          detailOpen.value = false;
          detail.value = null;
        }
        selectedRowKeys.value = selectedRowKeys.value.filter(
          (id) => id !== record.id,
        );
        await load();
      } finally {
        deleting.value = false;
      }
    },
  });
}

function removeSelected() {
  const ids = [...selectedRowKeys.value];
  if (ids.length === 0) {
    message.warning('请先勾选要删除的实例');
    return;
  }
  Modal.confirm({
    title: '批量删除',
    content: `确认删除选中的 ${ids.length} 条执行记录？不可恢复。`,
    okType: 'danger',
    onOk: async () => {
      deleting.value = true;
      try {
        await deleteManyFlowInstancesApi(ids);
        message.success(`已删除 ${ids.length} 条`);
        selectedRowKeys.value = [];
        if (detail.value && ids.includes(detail.value.id)) {
          detailOpen.value = false;
          detail.value = null;
        }
        await load();
      } finally {
        deleting.value = false;
      }
    },
  });
}

const columns = [
  { title: '执行', key: 'flow', ellipsis: true },
  { title: '状态', key: 'status', width: 110 },
  { title: '版本', key: 'version', width: 80 },
  { title: '模式', key: 'mode', width: 100 },
  { title: '时间', key: 'time', width: 180 },
  { title: '操作', key: 'actions', width: 140, fixed: 'right' as const },
];

watch(
  () => [isInstancesRoute.value, route.query.instanceId] as const,
  ([active]) => {
    if (active) {
      openByQuery();
    }
  },
);

onMounted(async () => {
  await load();
  await openByQuery();
});

onActivated(async () => {
  if (isInstancesRoute.value) {
    await openByQuery();
  }
});
</script>

<template>
  <Page
    auto-content-height
    description="查看流程执行记录与节点级日志，支持按定义与状态筛选；可单条或批量清理历史实例"
    title="执行实例"
  >
    <div class="flex h-full flex-col gap-4 p-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <Card class="shadow-sm" :bordered="false">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"
            >
              <IconifyIcon class="size-5" icon="lucide:play-circle" />
            </div>
            <div>
              <div class="text-muted-foreground text-xs">实例总数</div>
              <div class="text-2xl font-semibold tabular-nums">{{ total }}</div>
            </div>
          </div>
        </Card>
        <Card class="shadow-sm" :bordered="false">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"
            >
              <IconifyIcon class="size-5" icon="lucide:activity" />
            </div>
            <div>
              <div class="text-muted-foreground text-xs">本页成功率</div>
              <div class="text-2xl font-semibold tabular-nums">
                {{ successRate }}%
              </div>
            </div>
          </div>
        </Card>
        <Card class="shadow-sm" :bordered="false">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"
            >
              <IconifyIcon class="size-5" icon="lucide:flask-conical" />
            </div>
            <div>
              <div class="text-muted-foreground text-xs">本页试运行</div>
              <div class="text-2xl font-semibold tabular-nums">
                {{ items.filter((x) => x.isDryRun).length }}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card class="min-h-0 flex-1 shadow-sm" :bordered="false">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <Input
            v-model:value="definitionId"
            allow-clear
            placeholder="按流程定义 Id 筛选"
            style="width: 280px"
            @press-enter="onSearch"
          >
            <template #prefix>
              <IconifyIcon class="text-muted-foreground" icon="lucide:filter" />
            </template>
          </Input>
          <Segmented
            v-model:value="status"
            :options="[
              { label: '全部', value: 'all' },
              { label: '成功', value: 1 },
              { label: '失败', value: 2 },
              { label: '运行中', value: 0 },
              { label: '取消', value: 3 },
            ]"
            @change="onSearch"
          />
          <Button type="primary" @click="onSearch">查询</Button>
          <AccessControl
            :codes="['Orchestration.Instances.Delete']"
            type="code"
          >
            <Button
              :disabled="selectedRowKeys.length === 0"
              :loading="deleting"
              danger
              @click="removeSelected"
            >
              删除所选
              <template v-if="selectedRowKeys.length">
                ({{ selectedRowKeys.length }})
              </template>
            </Button>
          </AccessControl>
        </div>

        <Table
          :columns="columns"
          :data-source="items"
          :loading="loading"
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
          :row-selection="rowSelection"
          :scroll="{ x: 900 }"
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'flow'">
              <div class="min-w-0">
                <div class="truncate font-medium">
                  {{ record.definitionName }}
                </div>
                <div class="text-muted-foreground mt-0.5 font-mono text-xs">
                  {{ record.id }}
                </div>
              </div>
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag :color="instanceStatusMeta[record.status]?.color">
                {{ instanceStatusMeta[record.status]?.text }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'version'">
              <span class="tabular-nums">v{{ record.version || 0 }}</span>
            </template>
            <template v-else-if="column.key === 'mode'">
              <Tag v-if="record.isDryRun" color="blue">试运行</Tag>
              <Tag v-else color="default">正式</Tag>
            </template>
            <template v-else-if="column.key === 'time'">
              <span class="text-muted-foreground text-sm">
                {{ formatDateTime(record.creationTime) }}
              </span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space>
                <Button
                  size="small"
                  type="link"
                  @click="openDetail(record as FlowInstance)"
                >
                  详情
                </Button>
                <AccessControl
                  :codes="['Orchestration.Instances.Delete']"
                  type="code"
                >
                  <Button
                    danger
                    size="small"
                    type="link"
                    @click="removeOne(record as FlowInstance)"
                  >
                    删除
                  </Button>
                </AccessControl>
              </Space>
            </template>
          </template>
        </Table>

        <div v-if="!loading && !items.length" class="py-10">
          <Empty description="暂无执行记录，先在流程定义中运行或试运行" />
        </div>
      </Card>
    </div>

    <Drawer
      v-model:open="detailOpen"
      :title="detail ? `实例 · ${detail.definitionName}` : '实例详情'"
      destroy-on-close
      width="640"
    >
      <div
        v-if="detailLoading"
        class="text-muted-foreground py-10 text-center text-sm"
      >
        加载中…
      </div>
      <template v-else-if="detail">
        <Descriptions :column="1" bordered size="small" class="mb-5">
          <Descriptions.Item label="状态">
            <Space>
              <Tag :color="instanceStatusMeta[detail.status]?.color">
                {{ instanceStatusMeta[detail.status]?.text }}
              </Tag>
              <Tag v-if="detail.isDryRun" color="blue">试运行</Tag>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="版本">
            v{{ detail.version }}
          </Descriptions.Item>
          <Descriptions.Item label="时间">
            {{ formatDateTime(detail.creationTime) }}
          </Descriptions.Item>
          <Descriptions.Item label="实例 Id">
            <span class="font-mono text-xs">{{ detail.id }}</span>
          </Descriptions.Item>
        </Descriptions>

        <div class="mb-2 text-sm font-medium">上下文变量</div>
        <pre
          class="mb-5 max-h-36 overflow-auto rounded-xl border bg-slate-50 p-3 font-mono text-xs"
          >{{ detail.variablesJson || '{}' }}</pre>

        <div class="mb-3 text-sm font-medium">节点执行轨迹</div>
        <ExecutionTimeline :error="detail.error" :nodes="detail.nodes" />

        <AccessControl :codes="['Orchestration.Instances.Delete']" type="code">
          <div class="mt-6">
            <Button danger :loading="deleting" @click="removeOne(detail)">
              删除此实例
            </Button>
          </div>
        </AccessControl>
      </template>
    </Drawer>
  </Page>
</template>
