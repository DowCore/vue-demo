<script lang="ts" setup>
import type {
  AppResource,
  DataSourceLookup,
  ReportDefinition,
  ReusableFlowLookup,
  TableDefinition,
} from '#/api/saas/orchestration';

import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createReportApi,
  createReportFromResourceApi,
  createReportFromTableApi,
  deleteReportApi,
  getAppResourcesApi,
  getDataSourceLookupApi,
  getReportsApi,
  getReusableFlowLookupApi,
  getTableDefinitionsApi,
  publishReportApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'OrchestrationReports' });

type ReportKind = 'flow' | 'resource' | 'table';

const router = useRouter();
const loading = ref(false);
const items = ref<ReportDefinition[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });
const creating = ref(false);
const creatingBusy = ref(false);
const resources = ref<AppResource[]>([]);
const dataSources = ref<DataSourceLookup[]>([]);
const tables = ref<TableDefinition[]>([]);
const flows = ref<ReusableFlowLookup[]>([]);
const createForm = reactive({
  kind: 'resource' as ReportKind,
  resourceCode: '',
  dataSourceCode: '',
  tableName: '',
  queryFlowKey: 'sys.resource.query',
  code: '',
  name: '',
});

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '编码', dataIndex: 'code', key: 'code', width: 160 },
  { title: '查询源', key: 'source', width: 240 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'actions', width: 280 },
];

const kindOptions = [
  { label: '资源表', value: 'resource' },
  { label: '数据源 + 表', value: 'table' },
  { label: '查询流', value: 'flow' },
];

function querySourceLabel(row: ReportDefinition) {
  if (row.kind === 'table') {
    return (
      [row.dataSourceCode, row.tableName].filter(Boolean).join('.') || '物理表'
    );
  }
  if (row.kind === 'flow') {
    return row.queryFlowKey || '查询流';
  }
  return row.resourceCode || '资源';
}

function querySourceKind(row: ReportDefinition) {
  if (row.kind === 'table') return '物理表';
  if (row.kind === 'flow') return '查询流';
  return '资源';
}

function stampCode(prefix: string) {
  return `${prefix}_rpt_${Date.now().toString(36)}`;
}

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

async function loadTables(dataSourceCode: string) {
  if (!dataSourceCode) {
    tables.value = [];
    return;
  }
  const res = await getTableDefinitionsApi({
    dataSourceCode,
    maxResultCount: 200,
  });
  tables.value = res.items ?? [];
}

async function openCreate() {
  const [resourceRes, dsRes, flowRes] = await Promise.all([
    getAppResourcesApi({ maxResultCount: 200 }),
    getDataSourceLookupApi(),
    getReusableFlowLookupApi(),
  ]);
  resources.value = resourceRes.items ?? [];
  dataSources.value = dsRes.items ?? [];
  flows.value = flowRes.items ?? [];
  createForm.kind = 'resource';
  createForm.resourceCode = resources.value[0]?.code || '';
  createForm.dataSourceCode = dataSources.value[0]?.code || '';
  createForm.tableName = '';
  createForm.queryFlowKey = 'sys.resource.query';
  createForm.name = resources.value[0] ? `${resources.value[0].name}报表` : '';
  createForm.code = createForm.resourceCode
    ? stampCode(createForm.resourceCode)
    : stampCode('rpt');
  if (createForm.dataSourceCode) {
    await loadTables(createForm.dataSourceCode);
    createForm.tableName = tables.value[0]?.tableName || '';
  }
  creating.value = true;
}

function onPickResource(code: string) {
  const row = resources.value.find((r) => r.code === code);
  createForm.resourceCode = code;
  createForm.name = row ? `${row.name}报表` : createForm.name;
  createForm.code = code ? stampCode(code) : createForm.code;
  if (row?.queryFlowKey) {
    createForm.queryFlowKey = row.queryFlowKey;
  }
}

async function onPickDataSource(code: string) {
  createForm.dataSourceCode = code;
  createForm.tableName = '';
  await loadTables(code);
  const first = tables.value[0];
  if (first) {
    onPickTable(first.tableName);
  }
}

function onPickTable(tableName: string) {
  const row = tables.value.find((t) => t.tableName === tableName);
  createForm.tableName = tableName;
  createForm.name = row ? `${row.displayName}报表` : createForm.name;
  createForm.code = tableName ? stampCode(tableName) : createForm.code;
}

function onPickFlow(code: string) {
  const row = flows.value.find((f) => f.code === code);
  createForm.queryFlowKey = code;
  createForm.name = row ? `${row.name}报表` : createForm.name;
  createForm.code = stampCode(code.replaceAll('.', '_') || 'flow');
}

watch(
  () => createForm.kind,
  (kind) => {
    if (kind === 'resource' && createForm.resourceCode) {
      onPickResource(createForm.resourceCode);
      return;
    }
    if (kind === 'table' && createForm.tableName) {
      onPickTable(createForm.tableName);
      return;
    }
    if (kind === 'flow' && createForm.queryFlowKey) {
      onPickFlow(createForm.queryFlowKey);
    }
  },
);

async function submitCreate() {
  if (!createForm.code || !createForm.name) {
    message.warning('请填写编码和名称');
    return;
  }
  if (createForm.kind === 'resource' && !createForm.resourceCode) {
    message.warning('请选择资源');
    return;
  }
  if (
    createForm.kind === 'table' &&
    (!createForm.dataSourceCode || !createForm.tableName)
  ) {
    message.warning('请选择数据源和物理表');
    return;
  }
  if (createForm.kind === 'flow' && !createForm.queryFlowKey) {
    message.warning('请选择已发布的查询流');
    return;
  }
  creatingBusy.value = true;
  try {
    let report: ReportDefinition;
    if (createForm.kind === 'resource') {
      report = await createReportFromResourceApi({
        resourceCode: createForm.resourceCode,
        code: createForm.code.trim(),
        name: createForm.name.trim(),
      });
    } else if (createForm.kind === 'table') {
      report = await createReportFromTableApi({
        dataSourceCode: createForm.dataSourceCode,
        tableName: createForm.tableName,
        code: createForm.code.trim(),
        name: createForm.name.trim(),
      });
    } else {
      report = await createReportApi({
        kind: 'flow',
        code: createForm.code.trim(),
        name: createForm.name.trim(),
        queryFlowKey: createForm.queryFlowKey,
        resourceCode: createForm.resourceCode || undefined,
      });
    }
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
  <Page
    description="查询源可选资源、物理表或查询流；SQL 写在编排节点里"
    title="报表"
  >
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
        <Button type="primary" @click="openCreate">新建报表</Button>
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
        <template v-if="column.key === 'source'">
          <div class="flex flex-col">
            <span class="font-mono text-xs">{{
              querySourceLabel(record as ReportDefinition)
            }}</span>
            <span class="text-xs text-muted-foreground">{{
              querySourceKind(record as ReportDefinition)
            }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'status'">
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
      title="新建报表"
      :confirm-loading="creatingBusy"
      @ok="submitCreate"
    >
      <Form layout="vertical">
        <Form.Item label="查询源" required>
          <Radio.Group
            v-model:value="createForm.kind"
            :options="kindOptions"
            option-type="button"
          />
          <div class="mt-2 text-xs text-muted-foreground">
            不在报表上贴 SQL。单表走系统查询流，跨表请选已发布的查询流。
          </div>
        </Form.Item>
        <Form.Item v-if="createForm.kind === 'resource'" label="资源" required>
          <Select
            :options="
              resources.map((r) => ({
                label: `${r.name} (${r.code})`,
                value: r.code,
              }))
            "
            :value="createForm.resourceCode"
            class="w-full"
            placeholder="选择已发布或草稿资源"
            show-search
            @update:value="(v) => onPickResource(String(v || ''))"
          />
        </Form.Item>
        <template v-if="createForm.kind === 'table'">
          <Form.Item label="数据源" required>
            <Select
              :options="
                dataSources.map((d) => ({
                  label: `${d.name} (${d.code})`,
                  value: d.code,
                }))
              "
              :value="createForm.dataSourceCode"
              class="w-full"
              placeholder="选择数据源"
              show-search
              @update:value="(v) => onPickDataSource(String(v || ''))"
            />
          </Form.Item>
          <Form.Item label="物理表" required>
            <Select
              :options="
                tables.map((t) => ({
                  label: `${t.displayName} (${t.tableName})`,
                  value: t.tableName,
                }))
              "
              :value="createForm.tableName"
              class="w-full"
              placeholder="选择已托管的表"
              show-search
              @update:value="(v) => onPickTable(String(v || ''))"
            />
          </Form.Item>
        </template>
        <Form.Item v-if="createForm.kind === 'flow'" label="查询流" required>
          <Select
            :options="
              flows.map((f) => ({
                label: `${f.name} (${f.code})`,
                value: f.code,
              }))
            "
            :value="createForm.queryFlowKey"
            class="w-full"
            placeholder="选择已发布、可复用的查询逻辑"
            show-search
            @update:value="(v) => onPickFlow(String(v || ''))"
          />
        </Form.Item>
        <Form.Item v-if="createForm.kind === 'flow'" label="写入资源（可选）">
          <Select
            allow-clear
            :options="
              resources.map((r) => ({
                label: `${r.name} (${r.code})`,
                value: r.code,
              }))
            "
            :value="createForm.resourceCode || undefined"
            class="w-full"
            placeholder="行按钮增删改时才需要"
            show-search
            @update:value="(v) => (createForm.resourceCode = String(v || ''))"
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
