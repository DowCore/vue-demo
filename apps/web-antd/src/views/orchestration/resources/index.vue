<script lang="ts" setup>
import type { AppResource } from '#/api/saas/orchestration';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Input,
  message,
  Modal,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createReportFromResourceApi,
  deleteAppResourceApi,
  getAppResourcesApi,
  publishAppResourceApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'OrchestrationResources' });

const router = useRouter();
const loading = ref(false);
const items = ref<AppResource[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '编码', dataIndex: 'code', key: 'code', width: 160 },
  { title: '表', key: 'table', width: 220 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'actions', width: 360 },
];

async function load() {
  loading.value = true;
  try {
    const res = await getAppResourcesApi({
      filter: filter.value || undefined,
      maxResultCount: page.pageSize,
      skipCount: (page.current - 1) * page.pageSize,
    });
    items.value = res.items ?? [];
    total.value = res.totalCount ?? 0;
  } finally {
    loading.value = false;
  }
}

function openEditor(row: AppResource) {
  router.push({
    path: '/orchestration/resources/editor',
    query: { id: row.id },
  });
}

function openRuntime(row: AppResource) {
  router.push(`/app/${row.code}`);
}

function generateReport(row: AppResource) {
  const code = `${row.code}_rpt_${Date.now().toString(36)}`;
  Modal.confirm({
    title: `从资源「${row.name}」生成报表？`,
    content: `将创建编码 ${code} 的报表草稿，可再配置查询表单与列。`,
    async onOk() {
      const report = await createReportFromResourceApi({
        resourceCode: row.code,
        code,
        name: `${row.name}报表`,
      });
      message.success('已生成报表草稿');
      router.push({
        path: '/orchestration/reports/editor',
        query: { id: report.id },
      });
    },
  });
}

async function publish(row: AppResource) {
  await publishAppResourceApi(row.id);
  message.success('已发布');
  await load();
}

function confirmDelete(row: AppResource) {
  Modal.confirm({
    title: `删除资源「${row.name}」？`,
    okType: 'danger',
    async onOk() {
      await deleteAppResourceApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

onMounted(load);
</script>

<template>
  <Page
    description="资源绑定托管表与五个 flowKey。发布后可在运行时列表中组合查询、新增/编辑。"
    title="应用资源"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Space wrap>
        <Input
          v-model:value="filter"
          allow-clear
          placeholder="搜索名称/编码"
          style="width: 220px"
          @press-enter="
            () => {
              page.current = 1;
              load();
            }
          "
        />
        <Button
          @click="
            () => {
              page.current = 1;
              load();
            }
          "
        >
          查询
        </Button>
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
        showSizeChanger: true,
        onChange: (c: number, s: number) => {
          page.current = c;
          page.pageSize = s;
          load();
        },
      }"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'code'">
          <span class="font-mono">{{ (record as AppResource).code }}</span>
        </template>
        <template v-else-if="column.key === 'table'">
          <span class="font-mono text-xs">
            {{ (record as AppResource).dataSourceCode }}.{{
              (record as AppResource).tableName
            }}
          </span>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag
            :color="
              (record as AppResource).status === 1 ? 'success' : 'default'
            "
          >
            {{ (record as AppResource).status === 1 ? '已发布' : '草稿' }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space>
            <AccessControl
              :codes="['Orchestration.Resources.Update']"
              type="code"
            >
              <Button
                size="small"
                type="link"
                @click="openEditor(record as AppResource)"
              >
                配置
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.Resources.Publish']"
              type="code"
            >
              <Button
                size="small"
                type="link"
                @click="publish(record as AppResource)"
              >
                发布
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.Resources.Execute']"
              type="code"
            >
              <Button
                :disabled="(record as AppResource).status !== 1"
                size="small"
                type="link"
                @click="openRuntime(record as AppResource)"
              >
                打开
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.Reports.Create']"
              type="code"
            >
              <Button
                size="small"
                type="link"
                @click="generateReport(record as AppResource)"
              >
                生成报表
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.Resources.Delete']"
              type="code"
            >
              <Button
                danger
                size="small"
                type="link"
                @click="confirmDelete(record as AppResource)"
              >
                删除
              </Button>
            </AccessControl>
          </Space>
        </template>
      </template>
    </Table>
  </Page>
</template>
