<script lang="ts" setup>
import type { FlowTriggerItem } from '#/api/saas/orchestration';

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
  createFlowTriggerApi,
  deleteFlowTriggerApi,
  getFlowTriggersApi,
  getMessageSourceLookupApi,
  updateFlowTriggerApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'OrchestrationTriggers' });

const loading = ref(false);
const saving = ref(false);
const items = ref<FlowTriggerItem[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });
const sourceOptions = ref<
  Array<{ label: string; value: string; provider: string }>
>([]);
const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const form = reactive({
  code: '',
  name: '',
  flowKey: '',
  messageSourceCode: '',
  queue: '',
  exchange: 'Meta.Dow.Orchestration.Broadcast',
  exchangeType: 'fanout',
  routingKey: '',
  isEnabled: true,
  description: '',
});

const selectedProvider = computed(() => {
  const hit = sourceOptions.value.find(
    (x) => x.value === form.messageSourceCode,
  );
  return (hit?.provider || 'rabbit').toLowerCase();
});

const queueLabel = computed(() => {
  if (selectedProvider.value === 'kafka') return 'Topic';
  if (selectedProvider.value === 'mqtt') return 'Topic';
  return '队列 Queue';
});

const routingLabel = computed(() => {
  if (selectedProvider.value === 'kafka') return 'Consumer Group（可选）';
  if (selectedProvider.value === 'mqtt') return 'QoS（0/1/2，默认 1）';
  return '路由键';
});

const columns = [
  { title: '触发器', key: 'name', ellipsis: true },
  { title: 'flowKey', dataIndex: 'flowKey', key: 'flowKey', width: 160 },
  { title: '连接', dataIndex: 'messageSourceCode', key: 'ms', width: 120 },
  { title: '订阅', dataIndex: 'queue', key: 'queue', width: 160 },
  { title: '状态', key: 'isEnabled', width: 80 },
  { title: '操作', key: 'actions', width: 160 },
];

async function loadSources() {
  try {
    const res = await getMessageSourceLookupApi();
    sourceOptions.value = (res.items || []).map((x) => ({
      value: x.code,
      label: `${x.name} (${x.code} · ${x.provider})`,
      provider: x.provider,
    }));
  } catch {
    sourceOptions.value = [];
    message.error('加载消息连接失败，请确认已创建并启用「消息连接」');
  }
}

async function load() {
  loading.value = true;
  try {
    const res = await getFlowTriggersApi({
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

async function openCreate() {
  await loadSources();
  editingId.value = null;
  form.code = `trg_${Date.now().toString(36)}`;
  form.name = '';
  form.flowKey = '';
  form.messageSourceCode = sourceOptions.value[0]?.value || '';
  form.queue = `orch.trigger.${Date.now().toString(36)}`;
  form.exchange = 'Meta.Dow.Orchestration.Broadcast';
  form.exchangeType = 'fanout';
  form.routingKey = '';
  form.isEnabled = true;
  form.description = '';
  if (sourceOptions.value.length === 0) {
    message.warning('暂无可用消息连接，请先在「消息连接」中创建并启用');
  }
  modalOpen.value = true;
}

async function openEdit(row: FlowTriggerItem) {
  await loadSources();
  editingId.value = row.id;
  form.code = row.code;
  form.name = row.name;
  form.flowKey = row.flowKey;
  form.messageSourceCode = row.messageSourceCode;
  form.queue = row.queue;
  form.exchange = row.exchange || 'Meta.Dow.Orchestration.Broadcast';
  form.exchangeType = row.exchangeType || 'fanout';
  form.routingKey = row.routingKey || '';
  form.isEnabled = row.isEnabled;
  form.description = row.description || '';
  modalOpen.value = true;
}

async function save() {
  if (
    !form.name.trim() ||
    !form.code.trim() ||
    !form.flowKey.trim() ||
    !form.queue.trim()
  ) {
    message.warning('请填写必填项');
    return;
  }
  if (!form.messageSourceCode) {
    message.warning('请选择消息连接');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateFlowTriggerApi(editingId.value, {
        name: form.name.trim(),
        flowKey: form.flowKey.trim(),
        messageSourceCode: form.messageSourceCode,
        queue: form.queue.trim(),
        exchange: form.exchange.trim() || undefined,
        exchangeType: form.exchangeType,
        routingKey: form.routingKey.trim() || undefined,
        isEnabled: form.isEnabled,
        description: form.description.trim() || undefined,
      });
      message.success('已更新（约 20 秒内生效）');
    } else {
      await createFlowTriggerApi({
        code: form.code.trim(),
        name: form.name.trim(),
        flowKey: form.flowKey.trim(),
        messageSourceCode: form.messageSourceCode,
        queue: form.queue.trim(),
        exchange: form.exchange.trim() || undefined,
        exchangeType: form.exchangeType,
        routingKey: form.routingKey.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      message.success('已创建（约 20 秒内开始监听）');
    }
    modalOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

function remove(row: FlowTriggerItem) {
  Modal.confirm({
    title: '删除消息触发',
    content: `确认删除「${row.name}」？`,
    okType: 'danger',
    onOk: async () => {
      await deleteFlowTriggerApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

onMounted(async () => {
  await loadSources();
  await load();
});
</script>

<template>
  <Page
    auto-content-height
    description="订阅 Rabbit / Kafka / MQTT 消息后，按消息 JSON 调用已发布逻辑（填写 flowKey）。不改动编排画布。"
    title="消息触发"
  >
    <template #extra>
      <AccessControl :codes="['Orchestration.Triggers.Create']" type="code">
        <Button type="primary" @click="openCreate">新建触发</Button>
      </AccessControl>
    </template>

    <div class="flex flex-col gap-3 p-4">
      <Space>
        <Input
          v-model:value="filter"
          allow-clear
          placeholder="搜索名称 / flowKey / 队列"
          style="width: 280px"
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
          <template v-if="column.key === 'name'">
            <div>
              <div class="font-medium">
                {{ (record as FlowTriggerItem).name }}
              </div>
              <div class="text-muted-foreground font-mono text-xs">
                {{ (record as FlowTriggerItem).code }}
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'isEnabled'">
            <Tag
              :color="
                (record as FlowTriggerItem).isEnabled ? 'success' : 'default'
              "
            >
              {{ (record as FlowTriggerItem).isEnabled ? '启用' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space>
              <AccessControl
                :codes="['Orchestration.Triggers.Update']"
                type="code"
              >
                <Button
                  size="small"
                  type="link"
                  @click="openEdit(record as FlowTriggerItem)"
                >
                  编辑
                </Button>
              </AccessControl>
              <AccessControl
                :codes="['Orchestration.Triggers.Delete']"
                type="code"
              >
                <Button
                  danger
                  size="small"
                  type="link"
                  @click="remove(record as FlowTriggerItem)"
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
      :title="editingId ? '编辑消息触发' : '新建消息触发'"
      destroy-on-close
      width="560px"
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
        <Form.Item label="已发布逻辑 flowKey" required>
          <Input
            v-model:value="form.flowKey"
            class="font-mono"
            placeholder="例如 order-http-demo"
          />
        </Form.Item>
        <Form.Item label="消息连接" required>
          <Select
            v-model:value="form.messageSourceCode"
            class="w-full"
            :options="sourceOptions"
            placeholder="先在「消息连接」创建 Rabbit / Kafka / MQTT"
          />
        </Form.Item>
        <Form.Item :label="queueLabel" required>
          <Input
            v-model:value="form.queue"
            class="font-mono"
            :placeholder="
              selectedProvider === 'rabbit'
                ? '消费队列名'
                : selectedProvider === 'kafka'
                  ? 'Kafka topic'
                  : 'MQTT topic，可用 +/#'
            "
          />
        </Form.Item>
        <template v-if="selectedProvider === 'rabbit'">
          <Form.Item label="交换机">
            <Input v-model:value="form.exchange" class="font-mono" />
          </Form.Item>
          <Form.Item label="交换机类型">
            <Select
              v-model:value="form.exchangeType"
              class="w-full"
              :options="[
                { value: 'fanout', label: 'fanout' },
                { value: 'topic', label: 'topic' },
                { value: 'direct', label: 'direct' },
              ]"
            />
          </Form.Item>
          <Form.Item v-if="form.exchangeType !== 'fanout'" label="路由键">
            <Input v-model:value="form.routingKey" class="font-mono" />
          </Form.Item>
        </template>
        <Form.Item v-else :label="routingLabel">
          <Input
            v-model:value="form.routingKey"
            class="font-mono"
            :placeholder="
              selectedProvider === 'kafka' ? '默认 orch-{触发编码}' : '1'
            "
          />
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
