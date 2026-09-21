<script lang="ts" setup>
import type { FlowScheduleItem } from '#/api/saas/orchestration';

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
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createFlowScheduleApi,
  deleteFlowScheduleApi,
  getFlowSchedulesApi,
  runFlowScheduleNowApi,
  updateFlowScheduleApi,
} from '#/api/saas/orchestration';

import { formatUtcDateTime } from '../shared/flow-meta';

defineOptions({ name: 'OrchestrationSchedules' });

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const items = ref<FlowScheduleItem[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });
const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const form = reactive({
  code: '',
  name: '',
  flowKey: '',
  cron: '0 */5 * * * *',
  timeZone: 'Asia/Shanghai',
  variablesJson: '{\n  "amount": 1500\n}',
  isEnabled: true,
  description: '',
});

const columns = [
  { title: '任务', key: 'name', ellipsis: true },
  { title: 'flowKey', dataIndex: 'flowKey', key: 'flowKey', width: 150 },
  { title: 'Cron', dataIndex: 'cron', key: 'cron', width: 150 },
  { title: '下次', key: 'next', width: 170 },
  { title: '状态', key: 'isEnabled', width: 80 },
  { title: '操作', key: 'actions', width: 220 },
];

async function load() {
  loading.value = true;
  try {
    const res = await getFlowSchedulesApi({
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
  form.code = `sch_${Date.now().toString(36)}`;
  form.name = '';
  form.flowKey = '';
  form.cron = '0 */5 * * * *';
  form.timeZone = 'Asia/Shanghai';
  form.variablesJson = '{\n  "amount": 1500\n}';
  form.isEnabled = true;
  form.description = '';
  modalOpen.value = true;
}

function openEdit(row: FlowScheduleItem) {
  editingId.value = row.id;
  form.code = row.code;
  form.name = row.name;
  form.flowKey = row.flowKey;
  form.cron = row.cron;
  form.timeZone = row.timeZone || 'UTC';
  form.variablesJson = row.variablesJson || '{}';
  form.isEnabled = row.isEnabled;
  form.description = row.description || '';
  modalOpen.value = true;
}

async function save() {
  if (
    !form.name.trim() ||
    !form.code.trim() ||
    !form.flowKey.trim() ||
    !form.cron.trim()
  ) {
    message.warning('请填写必填项');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateFlowScheduleApi(editingId.value, {
        name: form.name.trim(),
        flowKey: form.flowKey.trim(),
        cron: form.cron.trim(),
        timeZone: form.timeZone.trim() || 'UTC',
        variablesJson: form.variablesJson.trim() || '{}',
        isEnabled: form.isEnabled,
        description: form.description.trim() || undefined,
      });
      message.success('已更新');
    } else {
      await createFlowScheduleApi({
        code: form.code.trim(),
        name: form.name.trim(),
        flowKey: form.flowKey.trim(),
        cron: form.cron.trim(),
        timeZone: form.timeZone.trim() || 'UTC',
        variablesJson: form.variablesJson.trim() || '{}',
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

function remove(row: FlowScheduleItem) {
  Modal.confirm({
    title: '删除定时任务',
    content: `确认删除「${row.name}」？`,
    okType: 'danger',
    onOk: async () => {
      await deleteFlowScheduleApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

async function runNow(row: FlowScheduleItem) {
  saving.value = true;
  try {
    const res = await runFlowScheduleNowApi(row.id);
    if (res.success) {
      message.success('已触发执行');
      router.push({
        path: '/orchestration/instances',
        query: { instanceId: res.instanceId },
      });
    } else {
      message.error(res.error || '执行失败');
    }
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page
    auto-content-height
    description="Cron 到点后按固定 JSON 调用已发布逻辑（flowKey）。产品表自建，进程内 Cronos 轮询。"
    title="定时任务"
  >
    <template #extra>
      <AccessControl :codes="['Orchestration.Schedules.Create']" type="code">
        <Button type="primary" @click="openCreate">新建任务</Button>
      </AccessControl>
    </template>

    <div class="flex flex-col gap-3 p-4">
      <Space>
        <Input
          v-model:value="filter"
          allow-clear
          placeholder="搜索名称 / flowKey"
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
          <template v-if="column.key === 'name'">
            <div>
              <div class="font-medium">
                {{ (record as FlowScheduleItem).name }}
              </div>
              <div class="text-muted-foreground font-mono text-xs">
                {{ (record as FlowScheduleItem).code }}
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'next'">
            <span class="text-muted-foreground text-sm">
              {{ formatUtcDateTime((record as FlowScheduleItem).nextFireAt) }}
            </span>
          </template>
          <template v-else-if="column.key === 'isEnabled'">
            <Tag
              :color="
                (record as FlowScheduleItem).isEnabled ? 'success' : 'default'
              "
            >
              {{ (record as FlowScheduleItem).isEnabled ? '启用' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space>
              <AccessControl
                :codes="['Orchestration.Schedules.Run']"
                type="code"
              >
                <Button
                  size="small"
                  type="link"
                  @click="runNow(record as FlowScheduleItem)"
                >
                  立即执行
                </Button>
              </AccessControl>
              <AccessControl
                :codes="['Orchestration.Schedules.Update']"
                type="code"
              >
                <Button
                  size="small"
                  type="link"
                  @click="openEdit(record as FlowScheduleItem)"
                >
                  编辑
                </Button>
              </AccessControl>
              <AccessControl
                :codes="['Orchestration.Schedules.Delete']"
                type="code"
              >
                <Button
                  danger
                  size="small"
                  type="link"
                  @click="remove(record as FlowScheduleItem)"
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
      :title="editingId ? '编辑定时任务' : '新建定时任务'"
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
            placeholder="order-http-demo"
          />
        </Form.Item>
        <Form.Item label="Cron（支持 5/6 段）" required>
          <Input
            v-model:value="form.cron"
            class="font-mono"
            placeholder="0 */5 * * * * = 每 5 分钟"
          />
        </Form.Item>
        <Form.Item label="时区">
          <Input
            v-model:value="form.timeZone"
            class="font-mono"
            placeholder="Asia/Shanghai"
          />
        </Form.Item>
        <Form.Item label="请求体 JSON">
          <Input.TextArea
            v-model:value="form.variablesJson"
            :rows="8"
            class="font-mono text-xs"
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
