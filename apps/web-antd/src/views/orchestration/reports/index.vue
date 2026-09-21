<script lang="ts" setup>
import type { AppResource, ReportDefinition } from '#/api/saas/orchestration';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createReportFromResourceApi,
  deleteReportApi,
  getAppResourcesApi,
  getReportsApi,
  publishReportApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'OrchestrationReports' });

const router = useRouter();
const loading = ref(false);
const items = ref<ReportDefinition[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });
const creating = ref(false);
const creatingBusy = ref(false);
const resources = ref<AppResource[]>([]);
const createForm = reactive({
  resourceCode: '',
  code: '',
  name: '',
});

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '编码', dataIndex: 'code', key: 'code', width: 160 },
  { title: '资源', dataIndex: 'resourceCode', key: 'resourceCode', width: 160 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'actions', width: 280 },
];

async function load() {
  loading.value = true;
  try {
    const res = await getReportsApi({
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

function openEditor(row: ReportDefinition) {
  router.push({ path: '/orchestration/reports/editor', query: { id: row.id } });
}

function openRuntime(row: ReportDefinition) {
  router.push(`/app/reports/${row.code}`);
}

async function openCreate() {
  const res = await getAppResourcesApi({ maxResultCount: 100 });
  resources.value = res.items ?? [];
  createForm.resourceCode = resources.value[0]?.code || '';
  createForm.name = resources.value[0] ? `${resources.value[0].name}报表` : '';
  createForm.code = createForm.resourceCode
    ? `${createForm.resourceCode}_rpt_${Date.now().toString(36)}`
    : '';
  creating.value = true;
}

function onPickResource(code: string) {
  const row = resources.value.find((r) => r.code === code);
  createForm.resourceCode = code;
  createForm.name = row ? `${row.name}报表` : createForm.name;
  createForm.code = code ? `${code}_rpt_${Date.now().toString(36)}` : '';
}

async function submitCreate() {
  if (!createForm.resourceCode || !createForm.code || !createForm.name) {
    message.warning('请填写资源、编码和名称');
    return;
  }
  creatingBusy.value = true;
  try {
    const report = await createReportFromResourceApi({
      resourceCode: createForm.resourceCode,
      code: createForm.code.trim(),
      name: createForm.name.trim(),
    });
    creating.value = false;
    message.success('已生成报表草稿');
    router.push({
      path: '/orchestration/reports/editor',
      query: { id: report.id },
    });
  } finally {
    creatingBusy.value = false;
  }
}

async function publish(row: ReportDefinition) {
  await publishReportApi(row.id);
  message.success('已发布');
  await load();
}

function confirmDelete(row: ReportDefinition) {
  Modal.confirm({
    title: `删除报表「${row.name}」？`,
    okType: 'danger',
    async onOk() {
      await deleteReportApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

onMounted(load);
</script>

<template>
  <Page description="查询表单 + 可视化条件组 + 列汇总/着色 + 按钮" title="报表">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Space>
        <Input
          v-model:value="filter"
          allow-clear
          placeholder="名称 / 编码"
          style="width: 220px"
          @press-enter="load"
        />
        <Button @click="load">查询</Button>
      </Space>
      <AccessControl :codes="['Orchestration.Reports.Create']" type="code">
        <Button type="primary" @click="openCreate">从资源生成</Button>
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
        onChange: (c: number, s: number) => {
          page.current = c;
          page.pageSize = s;
          load();
        },
      }"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <Tag :color="record.status === 1 ? 'success' : 'default'">
            {{ record.status === 1 ? '已发布' : '草稿' }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space>
            <AccessControl
              :codes="['Orchestration.Reports.Update']"
              type="code"
            >
              <Button
                size="small"
                type="link"
                @click="openEditor(record as ReportDefinition)"
              >
                配置
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.Reports.Publish']"
              type="code"
            >
              <Button
                size="small"
                type="link"
                @click="publish(record as ReportDefinition)"
              >
                发布
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.Reports.Execute']"
              type="code"
            >
              <Button
                :disabled="record.status !== 1"
                size="small"
                type="link"
                @click="openRuntime(record as ReportDefinition)"
              >
                打开
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.Reports.Delete']"
              type="code"
            >
              <Button
                danger
                size="small"
                type="link"
                @click="confirmDelete(record as ReportDefinition)"
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
      title="从资源生成报表"
      :confirm-loading="creatingBusy"
      @ok="submitCreate"
    >
      <Form layout="vertical">
        <Form.Item label="资源" required>
          <Select
            :options="
              resources.map((r) => ({
                label: `${r.name} (${r.code})`,
                value: r.code,
              }))
            "
            :value="createForm.resourceCode"
            class="w-full"
            placeholder="选择已有资源"
            show-search
            @update:value="(v) => onPickResource(String(v || ''))"
          />
        </Form.Item>
        <Form.Item label="报表编码" required>
          <Input v-model:value="createForm.code" class="font-mono" />
        </Form.Item>
        <Form.Item label="名称" required>
          <Input v-model:value="createForm.name" />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
