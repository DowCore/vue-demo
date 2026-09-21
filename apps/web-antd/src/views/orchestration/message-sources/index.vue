<script lang="ts" setup>
import type {
  MessageSourceItem,
  MessageSourceProviderOption,
} from '#/api/saas/orchestration';

import { computed, onMounted, reactive, ref } from 'vue';

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
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createMessageSourceApi,
  deleteMessageSourceApi,
  getMessageSourceProvidersApi,
  getMessageSourcesApi,
  updateMessageSourceApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'OrchestrationMessageSources' });

const loading = ref(false);
const saving = ref(false);
const items = ref<MessageSourceItem[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });
const providers = ref<MessageSourceProviderOption[]>([]);
const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const form = reactive({
  code: '',
  name: '',
  provider: 'rabbit',
  connectionString: '',
  isEnabled: true,
  description: '',
  clearConnectionString: false,
});

const connectionPlaceholder = computed(() => {
  switch (form.provider) {
    case 'kafka': {
      return 'localhost:9092  或  bootstrap.servers=localhost:9092';
    }
    case 'mqtt': {
      return 'tcp://admin:admin@localhost:1883  或  Host=localhost;Port=1883;Username=admin;Password=admin';
    }
    default: {
      return '留空 = 平台默认 ConnectionStrings:rabbitmq；或 amqp://guest:guest@localhost:5672';
    }
  }
});

const connectionLabel = computed(() =>
  form.provider === 'rabbit' ? '连接串（可选）' : '连接串（必填）',
);

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '编码', dataIndex: 'code', key: 'code', width: 140 },
  { title: '协议', key: 'provider', width: 120 },
  { title: '状态', key: 'isEnabled', width: 90 },
  {
    title: '连接',
    dataIndex: 'connectionStringHint',
    key: 'hint',
    ellipsis: true,
  },
  { title: '操作', key: 'actions', width: 160 },
];

async function loadProviders() {
  try {
    const res = await getMessageSourceProvidersApi();
    providers.value = res.items || [];
  } catch {
    providers.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const res = await getMessageSourcesApi({
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
  form.code = `msg_${Date.now().toString(36)}`;
  form.name = '';
  form.provider = 'rabbit';
  form.connectionString = '';
  form.isEnabled = true;
  form.description = '';
  form.clearConnectionString = false;
  modalOpen.value = true;
}

function openEdit(row: MessageSourceItem) {
  editingId.value = row.id;
  form.code = row.code;
  form.name = row.name;
  form.provider = row.provider;
  form.connectionString = '';
  form.isEnabled = row.isEnabled;
  form.description = row.description || '';
  form.clearConnectionString = false;
  modalOpen.value = true;
}

async function save() {
  if (!form.name.trim() || !form.code.trim()) {
    message.warning('请填写名称与编码');
    return;
  }
  if (
    form.provider !== 'rabbit' &&
    !form.connectionString.trim() &&
    !editingId.value
  ) {
    message.warning('Kafka / MQTT 必须填写连接串');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateMessageSourceApi(editingId.value, {
        name: form.name.trim(),
        provider: form.provider,
        connectionString: form.connectionString.trim() || undefined,
        clearConnectionString: form.clearConnectionString,
        isEnabled: form.isEnabled,
        description: form.description.trim() || undefined,
      });
      message.success('已更新');
    } else {
      await createMessageSourceApi({
        code: form.code.trim(),
        name: form.name.trim(),
        provider: form.provider,
        connectionString: form.connectionString.trim() || undefined,
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

function remove(row: MessageSourceItem) {
  Modal.confirm({
    title: '删除消息连接',
    content: `确认删除「${row.name}」？`,
    okType: 'danger',
    onOk: async () => {
      await deleteMessageSourceApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

onMounted(async () => {
  await loadProviders();
  await load();
});
</script>

<template>
  <Page
    auto-content-height
    description="登记外部消息 broker：Rabbit（可空=平台默认）、Kafka、MQTT（后两者必须填连接串）。"
    title="消息连接"
  >
    <template #extra>
      <AccessControl
        :codes="['Orchestration.MessageSources.Create']"
        type="code"
      >
        <Button type="primary" @click="openCreate">新建连接</Button>
      </AccessControl>
    </template>

    <div class="flex flex-col gap-3 p-4">
      <Space>
        <Input
          v-model:value="filter"
          allow-clear
          placeholder="搜索名称 / 编码"
          style="width: 240px"
          @press-enter="load"
        />
        <Button type="primary" @click="load">查询</Button>
      </Space>

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
          <template v-if="column.key === 'provider'">
            <Tag>{{ (record as MessageSourceItem).provider }}</Tag>
          </template>
          <template v-else-if="column.key === 'isEnabled'">
            <Tag
              :color="
                (record as MessageSourceItem).isEnabled ? 'success' : 'default'
              "
            >
              {{ (record as MessageSourceItem).isEnabled ? '启用' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space>
              <AccessControl
                :codes="['Orchestration.MessageSources.Update']"
                type="code"
              >
                <Button
                  size="small"
                  type="link"
                  @click="openEdit(record as MessageSourceItem)"
                >
                  编辑
                </Button>
              </AccessControl>
              <AccessControl
                :codes="['Orchestration.MessageSources.Delete']"
                type="code"
              >
                <Button
                  danger
                  size="small"
                  type="link"
                  @click="remove(record as MessageSourceItem)"
                >
                  删除
                </Button>
              </AccessControl>
            </Space>
          </template>
        </template>
      </Table>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editingId ? '编辑消息连接' : '新建消息连接'"
      destroy-on-close
      @ok="save"
    >
      <Form class="mt-2" layout="vertical">
        <Form.Item label="编码" required>
          <Input
            v-model:value="form.code"
            :disabled="!!editingId"
            class="font-mono"
          />
        </Form.Item>
        <Form.Item label="名称" required>
          <Input v-model:value="form.name" />
        </Form.Item>
        <Form.Item label="协议" required>
          <Select
            v-model:value="form.provider"
            class="w-full"
            :options="
              providers.map((p) => ({
                value: p.provider,
                label: p.displayName,
              }))
            "
            @change="form.connectionString = ''"
          />
        </Form.Item>
        <Form.Item
          :label="connectionLabel"
          :required="form.provider !== 'rabbit'"
        >
          <Input.TextArea
            v-model:value="form.connectionString"
            :rows="3"
            class="font-mono text-xs"
            :placeholder="connectionPlaceholder"
          />
          <div class="text-muted-foreground mt-1 text-[11px] leading-relaxed">
            <template v-if="form.provider === 'mqtt'">
              本地示例：
              <code>tcp://admin:admin@localhost:1883</code>
            </template>
            <template v-else-if="form.provider === 'kafka'">
              本地示例：
              <code>localhost:9092</code>
            </template>
            <template v-else> Rabbit 可留空使用 Aspire 平台连接。 </template>
          </div>
        </Form.Item>
        <Form.Item v-if="editingId" label="清除自定义连接串">
          <Switch v-model:checked="form.clearConnectionString" />
        </Form.Item>
        <Form.Item v-if="editingId" label="启用">
          <Switch v-model:checked="form.isEnabled" />
        </Form.Item>
        <Form.Item label="说明">
          <Input v-model:value="form.description" />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
