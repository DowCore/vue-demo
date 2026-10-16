<script lang="ts" setup>
import type {
  FlowScheduleFireItem,
  FlowScheduleItem,
} from '#/api/saas/orchestration';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createFlowScheduleApi,
  deleteFlowScheduleApi,
  getFlowScheduleFiresApi,
  getFlowSchedulesApi,
  retryFlowScheduleFireApi,
  runFlowScheduleNowApi,
  updateFlowScheduleApi,
} from '#/api/saas/orchestration';

import CronExpressionEditor from '../shared/cron-expression-editor.vue';
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
  maxAttempts: 1,
  retryDelays: '60, 300, 900',
});
const firesOpen = ref(false);
const firesLoading = ref(false);
const firesSchedule = ref<FlowScheduleItem | null>(null);
const fires = ref<FlowScheduleFireItem[]>([]);
const firesTotal = ref(0);
const firesPage = reactive({ current: 1, pageSize: 10 });
const firesStatus = ref<number | undefined>(undefined);

const fireStatusMeta: Record<number, { color: string; label: string }> = {
  0: { color: 'processing', label: '执行中' },
  1: { color: 'success', label: '成功' },
  2: { color: 'warning', label: '等待重试' },
  3: { color: 'error', label: '已放弃' },
  4: { color: 'default', label: '已跳过' },
};

const columns = [
  { title: '任务', key: 'name', ellipsis: true },
  { title: 'flowKey', dataIndex: 'flowKey', key: 'flowKey', width: 140 },
  { title: 'Cron', dataIndex: 'cron', key: 'cron', width: 140 },
  { title: '下次', key: 'next', width: 160 },
  { title: '最近结果', key: 'lastFire', width: 120 },
  { title: '状态', key: 'isEnabled', width: 80 },
  { title: '操作', key: 'actions', width: 280 },
];

const fireColumns = [
  { title: '名义时刻', key: 'nominal', width: 160 },
  { title: '来源', key: 'kind', width: 70 },
  { title: '状态', key: 'status', width: 100 },
  { title: '次数', key: 'attempt', width: 70 },
  { title: '下次重试', key: 'retryAt', width: 160 },
  { title: '错误', key: 'error', ellipsis: true },
  { title: '操作', key: 'actions', width: 140 },
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
  form.maxAttempts = 1;
  form.retryDelays = '60, 300, 900';
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
  form.maxAttempts = row.maxAttempts || 1;
  form.retryDelays = (row.retryDelaysSeconds ?? [60, 300, 900]).join(', ');
  modalOpen.value = true;
}

function parseDelays(text: string) {
  const parts = text
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map(Number);
  if (
    parts.length > 4 ||
    parts.some((item) => !Number.isInteger(item) || item < 1 || item > 3600)
  ) {
    return null;
  }
  return parts;
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
  const retryDelaysSeconds = parseDelays(form.retryDelays);
  if (!retryDelaysSeconds) {
    message.warning('重试等待最多 4 档，每档为 1 到 3600 的整数秒');
    return;
  }
  if (form.maxAttempts < 1 || form.maxAttempts > 5) {
    message.warning('重试次数须在 1 到 5 之间');
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
        maxAttempts: form.maxAttempts,
        retryDelaysSeconds,
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
        maxAttempts: form.maxAttempts,
        retryDelaysSeconds,
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

function latestInstanceId(row: FlowScheduleFireItem) {
  const attempts = row.attempts ?? [];
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const id = attempts[index]?.instanceId;
    if (id) {
      return id;
    }
  }
  return undefined;
}

async function loadFires() {
  if (!firesSchedule.value) {
    return;
  }
  firesLoading.value = true;
  try {
    const res = await getFlowScheduleFiresApi(firesSchedule.value.id, {
      maxResultCount: firesPage.pageSize,
      skipCount: (firesPage.current - 1) * firesPage.pageSize,
      status: firesStatus.value,
    });
    fires.value = res.items ?? [];
    firesTotal.value = res.totalCount ?? 0;
  } finally {
    firesLoading.value = false;
  }
}

function openFires(row: FlowScheduleItem) {
  firesSchedule.value = row;
  firesPage.current = 1;
  firesStatus.value = undefined;
  firesOpen.value = true;
  loadFires();
}

async function retryFire(row: FlowScheduleFireItem) {
  if (!firesSchedule.value) {
    return;
  }
  await retryFlowScheduleFireApi(firesSchedule.value.id, row.id);
  message.success('已排队，大约 15 秒内会再执行一次');
  await loadFires();
  await load();
}

onMounted(load);
</script>

<template>
  <Page
    auto-content-height
    description="Cron 到点后按固定 JSON 调用已发布逻辑。失败可按次数重试，每次触发单独留记录。"
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
          <template v-else-if="column.key === 'lastFire'">
            <Tag
              v-if="
                fireStatusMeta[
                  (record as FlowScheduleItem).lastFireStatus ?? -1
                ]
              "
              :color="
                fireStatusMeta[
                  (record as FlowScheduleItem).lastFireStatus ?? -1
                ]?.color
              "
            >
              {{
                fireStatusMeta[
                  (record as FlowScheduleItem).lastFireStatus ?? -1
                ]?.label
              }}
            </Tag>
            <span v-else class="text-muted-foreground text-sm">—</span>
            <div
              v-if="(record as FlowScheduleItem).consecutiveFailures"
              class="text-muted-foreground text-xs"
            >
              连续放弃 {{ (record as FlowScheduleItem).consecutiveFailures }}
            </div>
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
              <Button
                size="small"
                type="link"
                @click="openFires(record as FlowScheduleItem)"
              >
                记录
              </Button>
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
      width="640px"
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
        <Form.Item label="执行计划（Cron）" required>
          <CronExpressionEditor v-model="form.cron" />
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
          <div class="text-muted-foreground mt-1 text-xs">
            停用后不再到点触发，已经排队的重试也会停下。重新启用后，到期的重试会继续。
          </div>
        </Form.Item>
        <Form.Item label="最多调用次数（含第一次）">
          <InputNumber
            v-model:value="form.maxAttempts"
            :max="5"
            :min="1"
            :precision="0"
          />
          <div class="text-muted-foreground mt-1 text-xs">
            大于 1
            时，失败会按等待秒数再次调用同一流程。流程里如果有写操作，可能重复写入。
          </div>
        </Form.Item>
        <Form.Item label="重试等待（秒）">
          <Input
            v-model:value="form.retryDelays"
            class="font-mono"
            placeholder="60, 300, 900"
          />
          <div class="text-muted-foreground mt-1 text-xs">
            第 2 次及以后之前的等待，逗号分隔，最多 4
            档。档数不够时沿用最后一档。
          </div>
        </Form.Item>
        <Form.Item label="说明">
          <Input v-model:value="form.description" />
        </Form.Item>
      </Form>
    </Modal>

    <Drawer
      v-model:open="firesOpen"
      :title="firesSchedule ? `${firesSchedule.name} 的触发记录` : '触发记录'"
      width="920"
    >
      <Space class="mb-3">
        <Select
          v-model:value="firesStatus"
          allow-clear
          placeholder="全部状态"
          style="width: 140px"
          :options="[
            { value: 0, label: '执行中' },
            { value: 1, label: '成功' },
            { value: 2, label: '等待重试' },
            { value: 3, label: '已放弃' },
            { value: 4, label: '已跳过' },
          ]"
          @change="
            () => {
              firesPage.current = 1;
              loadFires();
            }
          "
        />
        <Button @click="loadFires">刷新</Button>
      </Space>
      <Table
        :columns="fireColumns"
        :data-source="fires"
        :loading="firesLoading"
        :pagination="{
          current: firesPage.current,
          pageSize: firesPage.pageSize,
          total: firesTotal,
          onChange: (c: number, s: number) => {
            firesPage.current = c;
            firesPage.pageSize = s;
            loadFires();
          },
        }"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'nominal'">
            {{
              formatUtcDateTime((record as FlowScheduleFireItem).nominalTimeUtc)
            }}
          </template>
          <template v-else-if="column.key === 'kind'">
            {{
              (record as FlowScheduleFireItem).triggerKind === 1
                ? '手工'
                : '正点'
            }}
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag
              :color="
                fireStatusMeta[(record as FlowScheduleFireItem).status]?.color
              "
            >
              {{
                fireStatusMeta[(record as FlowScheduleFireItem).status]
                  ?.label ?? (record as FlowScheduleFireItem).status
              }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'attempt'">
            {{ (record as FlowScheduleFireItem).attempt }}/{{
              (record as FlowScheduleFireItem).maxAttempts
            }}
          </template>
          <template v-else-if="column.key === 'retryAt'">
            {{
              formatUtcDateTime((record as FlowScheduleFireItem).nextRetryAt) ||
              '—'
            }}
          </template>
          <template v-else-if="column.key === 'error'">
            {{ (record as FlowScheduleFireItem).error || '—' }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space>
              <Button
                v-if="latestInstanceId(record as FlowScheduleFireItem)"
                size="small"
                type="link"
                @click="
                  router.push({
                    path: '/orchestration/instances',
                    query: {
                      instanceId: latestInstanceId(
                        record as FlowScheduleFireItem,
                      ),
                    },
                  })
                "
              >
                实例
              </Button>
              <AccessControl
                :codes="['Orchestration.Schedules.Run']"
                type="code"
              >
                <Button
                  v-if="(record as FlowScheduleFireItem).status === 3"
                  size="small"
                  type="link"
                  @click="retryFire(record as FlowScheduleFireItem)"
                >
                  再试一次
                </Button>
              </AccessControl>
            </Space>
          </template>
        </template>
      </Table>
    </Drawer>
  </Page>
</template>
