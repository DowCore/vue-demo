<script lang="ts" setup>
import type { FlowDefinition, FlowUsage } from '#/api/saas/orchestration';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Card,
  Input,
  message,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  getFlowDefinitionsApi,
  getFlowUsagesByCalleeApi,
} from '#/api/saas/orchestration';

import { definitionStatusMeta, formatDateTime } from '../shared/flow-meta';

defineOptions({ name: 'OrchestrationComponents' });

const router = useRouter();
const loading = ref(false);
const usagesLoading = ref(false);
const filter = ref('');
const items = ref<FlowDefinition[]>([]);
const total = ref(0);
const page = reactive({ current: 1, pageSize: 10 });

const selected = ref<FlowDefinition | null>(null);
const usages = ref<FlowUsage[]>([]);

const columns = [
  { title: '组件', key: 'flow', ellipsis: true },
  { title: '状态', key: 'status', width: 100 },
  { title: '版本', key: 'version', width: 80 },
  { title: '分类', dataIndex: 'category', key: 'category', width: 120 },
  { title: '操作', key: 'actions', width: 160 },
];

const usageColumns = [
  { title: '调用方', key: 'caller', ellipsis: true },
  { title: '节点', key: 'node', width: 160 },
  { title: '索引时间', key: 'time', width: 180 },
];

async function load() {
  loading.value = true;
  try {
    const result = await getFlowDefinitionsApi({
      filter: filter.value || undefined,
      isReusable: true,
      maxResultCount: page.pageSize,
      skipCount: (page.current - 1) * page.pageSize,
    });
    items.value = result.items ?? [];
    total.value = result.totalCount ?? 0;
  } finally {
    loading.value = false;
  }
}

async function loadUsages(record: FlowDefinition) {
  selected.value = record;
  usagesLoading.value = true;
  try {
    const res = await getFlowUsagesByCalleeApi(record.code);
    usages.value = res.items ?? [];
  } catch {
    usages.value = [];
    message.error('加载引用失败');
  } finally {
    usagesLoading.value = false;
  }
}

function openDesigner(record: FlowDefinition) {
  router.push({
    path: '/orchestration/definitions/designer',
    query: { id: record.id },
  });
}

function onSearch() {
  page.current = 1;
  load();
}

onMounted(load);
</script>

<template>
  <Page
    auto-content-height
    description="标记为「可复用」的已发布流程可作为 SubFlow 被其它流程调用；此处查看组件目录与反向引用。"
    title="逻辑组件"
  >
    <div class="flex h-full flex-col gap-4 p-4">
      <Card class="shadow-sm" :bordered="false">
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <Input
            v-model:value="filter"
            allow-clear
            placeholder="搜索名称 / flowKey"
            style="width: 260px"
            @press-enter="onSearch"
          >
            <template #prefix>
              <IconifyIcon class="text-muted-foreground" icon="lucide:search" />
            </template>
          </Input>
          <Button type="primary" @click="onSearch">查询</Button>
        </div>

        <Table
          :columns="columns"
          :data-source="items"
          :loading="loading"
          :locale="{
            emptyText:
              '暂无逻辑组件。在设计器右侧开启「可复用逻辑组件」并发布即可出现。',
          }"
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
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'flow'">
              <div>
                <div class="font-medium">
                  {{ (record as FlowDefinition).name }}
                </div>
                <div class="text-muted-foreground font-mono text-xs">
                  {{ (record as FlowDefinition).code }}
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
            <template v-else-if="column.key === 'version'">
              <span v-if="(record as FlowDefinition).publishedVersion">
                v{{ (record as FlowDefinition).publishedVersion }}
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space>
                <Button
                  size="small"
                  type="link"
                  @click="loadUsages(record as FlowDefinition)"
                >
                  谁在用
                </Button>
                <Button
                  size="small"
                  type="link"
                  @click="openDesigner(record as FlowDefinition)"
                >
                  设计
                </Button>
              </Space>
            </template>
          </template>
        </Table>
      </Card>

      <Card
        v-if="selected"
        class="shadow-sm"
        :bordered="false"
        :title="`引用：${selected.name} (${selected.code})`"
      >
        <Table
          :columns="usageColumns"
          :data-source="usages"
          :loading="usagesLoading"
          :locale="{ emptyText: '当前没有其它流程通过 SubFlow 引用该组件' }"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'caller'">
              <div>
                <div class="font-medium">
                  {{ (record as FlowUsage).callerName }}
                </div>
                <div class="text-muted-foreground font-mono text-xs">
                  {{ (record as FlowUsage).callerCode }}
                </div>
              </div>
            </template>
            <template v-else-if="column.key === 'node'">
              <span class="font-mono text-xs">
                {{
                  (record as FlowUsage).nodeRef ||
                  (record as FlowUsage).nodeId ||
                  '—'
                }}
              </span>
            </template>
            <template v-else-if="column.key === 'time'">
              <span class="text-muted-foreground text-sm">
                {{ formatDateTime((record as FlowUsage).creationTime) }}
              </span>
            </template>
          </template>
        </Table>
      </Card>
    </div>
  </Page>
</template>
