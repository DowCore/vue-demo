<script lang="ts" setup>
import type {
  DataSourceAccessMode,
  DataSourceItem,
  DataSourceProviderOption,
} from '#/api/saas/orchestration';

import { computed, onMounted, reactive, ref, watch } from 'vue';

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
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createDataSourceApi,
  deleteDataSourceApi,
  getDataSourceProvidersApi,
  getDataSourcesApi,
  testDataSourceApi,
  testSavedDataSourceApi,
  updateDataSourceApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'OrchestrationDataSources' });

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const items = ref<DataSourceItem[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });
const providers = ref<DataSourceProviderOption[]>([]);

const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const form = reactive({
  code: '',
  name: '',
  provider: 'postgres',
  connectionString: '',
  accessMode: 2 as DataSourceAccessMode,
  isEnabled: true,
  description: '',
});

const providerMeta = computed(() =>
  providers.value.find((p) => p.provider === form.provider),
);

const accessModeOptions = [
  { label: '只读 read', value: 0 },
  { label: '只写 write', value: 1 },
  { label: '读写 readWrite', value: 2 },
];

const familyColor: Record<string, string> = {
  sql: 'blue',
  redis: 'orange',
  mongo: 'green',
};

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '编码', dataIndex: 'code', key: 'code', width: 140 },
  { title: '类型', key: 'provider', width: 160 },
  { title: '权限', key: 'accessMode', width: 110 },
  { title: '状态', key: 'isEnabled', width: 90 },
  {
    title: '连接提示',
    dataIndex: 'connectionStringHint',
    key: 'hint',
    ellipsis: true,
  },
  { title: '操作', key: 'actions', width: 220 },
];

async function loadProviders() {
  try {
    const res = await getDataSourceProvidersApi();
    providers.value = res.items || [];
  } catch {
    providers.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const res = await getDataSourcesApi({
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
  editingId.value = null;
  form.code = `ds_${Date.now().toString(36)}`;
  form.name = '';
  form.provider = 'postgres';
  form.connectionString = '';
  form.accessMode = 2;
  form.isEnabled = true;
  form.description = '';
  applyConnectionHint();
  modalOpen.value = true;
}

function openEdit(row: DataSourceItem) {
  editingId.value = row.id;
  form.code = row.code;
  form.name = row.name;
  form.provider = row.provider;
  form.connectionString = '';
  form.accessMode = row.accessMode;
  form.isEnabled = row.isEnabled;
  form.description = row.description || '';
  modalOpen.value = true;
}

function applyConnectionHint() {
  if (!form.connectionString.trim() && providerMeta.value?.connectionHint) {
    form.connectionString = providerMeta.value.connectionHint;
  }
}

watch(
  () => form.provider,
  () => {
    if (!editingId.value) {
      form.connectionString = providerMeta.value?.connectionHint || '';
    }
  },
);

async function save() {
  if (!form.name.trim() || !form.code.trim()) {
    message.warning('请填写名称与编码');
    return;
  }
  if (!editingId.value && !form.connectionString.trim()) {
    message.warning('请填写连接串');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateDataSourceApi(editingId.value, {
        name: form.name.trim(),
        provider: form.provider,
        connectionString: form.connectionString.trim() || undefined,
        accessMode: form.accessMode,
        isEnabled: form.isEnabled,
        description: form.description.trim() || undefined,
      });
      message.success('已更新');
    } else {
      await createDataSourceApi({
        code: form.code.trim(),
        name: form.name.trim(),
        provider: form.provider,
        connectionString: form.connectionString.trim(),
        accessMode: form.accessMode,
        description: form.description.trim() || undefined,
      });
      message.success('已创建');
    }
    modalOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

function confirmDelete(row: DataSourceItem) {
  Modal.confirm({
    title: `删除数据源「${row.name}」？`,
    content: '绑定该连接的 Code/Sql 节点将无法执行。',
    okType: 'danger',
    async onOk() {
      await deleteDataSourceApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

function showTestResult(res: {
  elapsedMs: number;
  message?: string;
  success: boolean;
}) {
  const detail = res.message
    ? `${res.message}（${res.elapsedMs} ms）`
    : `${res.elapsedMs} ms`;
  if (res.success) {
    message.success(detail);
  } else {
    message.error(detail || '连接失败');
  }
}

async function testFromModal() {
  if (!form.provider) {
    message.warning('请选择数据库类型');
    return;
  }
  if (!form.connectionString.trim() && !editingId.value) {
    message.warning('请填写连接串后再测试');
    return;
  }
  testing.value = true;
  try {
    const res = await testDataSourceApi({
      id: editingId.value || undefined,
      provider: form.provider,
      connectionString: form.connectionString.trim() || undefined,
    });
    showTestResult(res);
  } finally {
    testing.value = false;
  }
}

async function testSaved(row: DataSourceItem) {
  testing.value = true;
  try {
    const res = await testSavedDataSourceApi(row.id);
    showTestResult(res);
  } finally {
    testing.value = false;
  }
}

function accessLabel(mode: DataSourceAccessMode) {
  return accessModeOptions.find((x) => x.value === mode)?.label || String(mode);
}

onMounted(async () => {
  await loadProviders();
  await load();
});
</script>

<template>
  <Page
    title="数据连接"
    description="登记外部库白名单：PostgreSQL / MySQL / SQL Server / Oracle / Redis / MongoDB。Code 节点通过编码引用。"
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
      <AccessControl :codes="['Orchestration.DataSources.Create']" type="code">
        <Button type="primary" @click="openCreate">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新建连接
        </Button>
      </AccessControl>
    </div>

    <Table
      :loading="loading"
      :columns="columns"
      :data-source="items"
      row-key="id"
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
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'provider'">
          <Tag
            :color="familyColor[(record as DataSourceItem).family] || 'default'"
          >
            {{ (record as DataSourceItem).provider }}
          </Tag>
          <span class="ml-1 text-xs text-muted-foreground">
            {{ (record as DataSourceItem).family }}
          </span>
        </template>
        <template v-else-if="column.key === 'accessMode'">
          {{ accessLabel((record as DataSourceItem).accessMode) }}
        </template>
        <template v-else-if="column.key === 'isEnabled'">
          <Tag
            :color="
              (record as DataSourceItem).isEnabled ? 'success' : 'default'
            "
          >
            {{ (record as DataSourceItem).isEnabled ? '启用' : '停用' }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space>
            <AccessControl
              :codes="['Orchestration.DataSources.Default']"
              type="code"
            >
              <Button
                :loading="testing"
                size="small"
                type="link"
                @click="testSaved(record as DataSourceItem)"
              >
                测试
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.DataSources.Update']"
              type="code"
            >
              <Button
                type="link"
                size="small"
                @click="openEdit(record as DataSourceItem)"
              >
                编辑
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.DataSources.Delete']"
              type="code"
            >
              <Button
                type="link"
                size="small"
                danger
                @click="confirmDelete(record as DataSourceItem)"
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
      :title="editingId ? '编辑数据连接' : '新建数据连接'"
      :width="640"
      destroy-on-close
      @ok="save"
    >
      <template #footer>
        <div class="flex items-center justify-between">
          <Button :loading="testing" @click="testFromModal">
            <template #icon><IconifyIcon icon="lucide:unplug" /></template>
            测试连接
          </Button>
          <Space>
            <Button @click="modalOpen = false">取消</Button>
            <Button :loading="saving" type="primary" @click="save">确定</Button>
          </Space>
        </div>
      </template>
      <Form layout="vertical" class="mt-2">
        <Form.Item label="编码 code" required>
          <Input
            v-model:value="form.code"
            :disabled="!!editingId"
            placeholder="稳定标识，节点引用此编码"
          />
        </Form.Item>
        <Form.Item label="显示名" required>
          <Input
            v-model:value="form.name"
            placeholder="订单库 / 缓存 / 文档库"
          />
        </Form.Item>
        <Form.Item label="数据库类型" required>
          <Select
            v-model:value="form.provider"
            :options="
              providers.map((p) => ({
                value: p.provider,
                label: `${p.displayName}（${p.family}）`,
              }))
            "
          />
        </Form.Item>
        <Form.Item
          :label="editingId ? '连接串（留空则不改）' : '连接串'"
          :required="!editingId"
        >
          <Input.TextArea
            v-model:value="form.connectionString"
            :rows="3"
            class="font-mono text-xs"
            :placeholder="providerMeta?.connectionHint"
          />
          <div class="mt-1 text-xs text-muted-foreground">
            <template v-if="providerMeta?.family === 'sql'">
              Code 使用 <code>db.query / execute / batch</code>（参数化 SQL）
              <div
                v-if="form.provider === 'sqlserver'"
                class="mt-1 rounded bg-amber-500/10 px-2 py-1 text-amber-800 dark:text-amber-200"
              >
                SQL Server 若报「证书链不受信任」，请在连接串加
                <code>TrustServerCertificate=True</code>
                （仅建议内网/开发）；或安装正规 CA 证书。示例：
                <code class="break-all">Server=host,1433;Database=db;User
                  Id=u;Password=p;Encrypt=True;TrustServerCertificate=True</code>
              </div>
            </template>
            <template v-else-if="providerMeta?.family === 'redis'">
              Code 使用 <code>db.get / set / mget / mset / del</code>
            </template>
            <template v-else-if="providerMeta?.family === 'mongo'">
              Code 使用
              <code>db.find / findOne / insertOne / insertMany / updateOne /
                deleteMany</code>
            </template>
          </div>
        </Form.Item>
        <Form.Item label="访问模式">
          <Select
            v-model:value="form.accessMode"
            :options="accessModeOptions"
          />
        </Form.Item>
        <Form.Item v-if="editingId" label="启用">
          <Switch v-model:checked="form.isEnabled" />
        </Form.Item>
        <Form.Item label="说明">
          <Input.TextArea v-model:value="form.description" :rows="2" />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
