<script lang="ts" setup>
import type {
  DataSourceLookup,
  TableDefinition,
} from '#/api/saas/orchestration';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

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
  createTableDefinitionApi,
  deleteTableDefinitionApi,
  getDataSourceLookupApi,
  getTableDefinitionsApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'OrchestrationTables' });

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const items = ref<TableDefinition[]>([]);
const total = ref(0);
const filter = ref('');
const dataSourceCode = ref<string | undefined>();
const lookup = ref<DataSourceLookup[]>([]);
const page = reactive({ current: 1, pageSize: 10 });
const modalOpen = ref(false);
const form = reactive({
  dataSourceCode: '',
  tableName: '',
  displayName: '',
});

const syncMeta: Record<string, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  inSync: { color: 'success', text: '已同步' },
  localAhead: { color: 'processing', text: '待应用' },
  remoteAhead: { color: 'warning', text: '库领先' },
  conflict: { color: 'error', text: '冲突' },
};

const columns = [
  { title: '显示名', dataIndex: 'displayName', key: 'displayName' },
  { title: '表名', dataIndex: 'tableName', key: 'tableName', width: 180 },
  { title: '数据源', dataIndex: 'dataSourceCode', key: 'ds', width: 140 },
  { title: '同步', key: 'sync', width: 110 },
  { title: '列数', key: 'cols', width: 80 },
  { title: '操作', key: 'actions', width: 220 },
];

async function loadLookup() {
  try {
    const res = await getDataSourceLookupApi();
    lookup.value = res.items || [];
  } catch {
    lookup.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const res = await getTableDefinitionsApi({
      dataSourceCode: dataSourceCode.value,
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

function openCreate() {
  form.dataSourceCode = lookup.value[0]?.code || '';
  form.tableName = '';
  form.displayName = '';
  modalOpen.value = true;
}

async function save() {
  if (
    !form.dataSourceCode ||
    !form.tableName.trim() ||
    !form.displayName.trim()
  ) {
    message.warning('请填写数据源、表名与显示名');
    return;
  }
  saving.value = true;
  try {
    const created = await createTableDefinitionApi({
      dataSourceCode: form.dataSourceCode,
      tableName: form.tableName.trim(),
      displayName: form.displayName.trim(),
    });
    modalOpen.value = false;
    message.success('已创建，请设计列并应用到库');
    router.push({
      path: '/orchestration/tables/designer',
      query: { id: created.id },
    });
  } finally {
    saving.value = false;
  }
}

function openDesigner(row: TableDefinition) {
  router.push({
    path: '/orchestration/tables/designer',
    query: { id: row.id },
  });
}

function confirmDelete(row: TableDefinition) {
  Modal.confirm({
    title: `删除托管表「${row.displayName}」？`,
    content: '仅删除设计元数据，不会 DROP 物理表。',
    okType: 'danger',
    async onOk() {
      await deleteTableDefinitionApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

onMounted(async () => {
  await loadLookup();
  await load();
});
</script>

<template>
  <Page
    description="在白名单 SQL 数据源上新建托管表，默认带 ABP 约定列。预览 DDL 后应用到库，再一键创建资源。"
    title="托管表"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Space wrap>
        <Select
          v-model:value="dataSourceCode"
          allow-clear
          placeholder="数据源"
          style="width: 180px"
          :options="
            lookup.map((x) => ({
              label: `${x.name} (${x.code})`,
              value: x.code,
            }))
          "
          @change="
            () => {
              page.current = 1;
              load();
            }
          "
        />
        <Input
          v-model:value="filter"
          allow-clear
          placeholder="搜索表名/显示名"
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
      <AccessControl :codes="['Orchestration.Tables.Create']" type="code">
        <Button type="primary" @click="openCreate">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新建托管表
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
        onChange: (c: number, s: number) => {
          page.current = c;
          page.pageSize = s;
          load();
        },
      }"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'tableName'">
          <span class="font-mono text-sm">{{
            (record as TableDefinition).tableName
          }}</span>
        </template>
        <template v-else-if="column.key === 'sync'">
          <Tag
            :color="
              syncMeta[(record as TableDefinition).syncState]?.color ||
              'default'
            "
          >
            {{
              syncMeta[(record as TableDefinition).syncState]?.text ||
              (record as TableDefinition).syncState
            }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'cols'">
          {{ (record as TableDefinition).columns?.length || 0 }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space>
            <AccessControl :codes="['Orchestration.Tables.Update']" type="code">
              <Button
                size="small"
                type="link"
                @click="openDesigner(record as TableDefinition)"
              >
                设计
              </Button>
            </AccessControl>
            <AccessControl :codes="['Orchestration.Tables.Delete']" type="code">
              <Button
                danger
                size="small"
                type="link"
                @click="confirmDelete(record as TableDefinition)"
              >
                删除
              </Button>
            </AccessControl>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      destroy-on-close
      ok-text="创建并设计"
      title="新建托管表"
      @ok="save"
    >
      <Form class="mt-2" layout="vertical">
        <Form.Item label="数据源" required>
          <Select
            v-model:value="form.dataSourceCode"
            :options="
              lookup.map((x) => ({
                label: `${x.name} (${x.code})`,
                value: x.code,
              }))
            "
            placeholder="仅 SQL 数据源"
          />
        </Form.Item>
        <Form.Item label="表名" required>
          <Input
            v-model:value="form.tableName"
            class="font-mono"
            placeholder="如 BizOrder"
          />
        </Form.Item>
        <Form.Item label="显示名" required>
          <Input v-model:value="form.displayName" placeholder="订单" />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
