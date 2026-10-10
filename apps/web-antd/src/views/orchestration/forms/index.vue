<script lang="ts" setup>
import type { AppResource, FormDefinition } from '#/api/saas/orchestration';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createFormDefinitionApi,
  deleteFormDefinitionApi,
  getAppResourcesApi,
  getFormDefinitionApi,
  getFormDefinitionsApi,
  publishFormDefinitionApi,
  resyncCatalogFromResourceApi,
} from '#/api/saas/orchestration';
import FormPreviewModal from '#/views/orchestration/shared/form-preview-modal.vue';

defineOptions({ name: 'OrchestrationForms' });

const router = useRouter();
const loading = ref(false);
const items = ref<FormDefinition[]>([]);
const total = ref(0);
const filter = ref('');
const statusFilter = ref<'all' | number>('all');
const page = reactive({ current: 1, pageSize: 10 });
const creating = ref(false);
const creatingBusy = ref(false);
const resources = ref<AppResource[]>([]);
const createForm = reactive({
  code: '',
  name: '',
  description: '',
  sourceResourceCode: '',
});
const previewOpen = ref(false);
const previewBusy = ref(false);
const previewTarget = ref<FormDefinition | null>(null);

const stats = computed(() => ({
  total: total.value,
  published: items.value.filter((x) => x.status === 1).length,
  draft: items.value.filter((x) => x.status === 0).length,
}));

const columns = [
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '编码', dataIndex: 'code', key: 'code', width: 160 },
  { title: '字段数', key: 'fields', width: 90 },
  { title: '版本', key: 'version', width: 80 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'actions', width: 340 },
];

async function load() {
  loading.value = true;
  try {
    const res = await getFormDefinitionsApi({
      filter: filter.value || undefined,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      maxResultCount: page.pageSize,
      skipCount: (page.current - 1) * page.pageSize,
    });
    items.value = res.items || [];
    total.value = res.totalCount || 0;
  } finally {
    loading.value = false;
  }
}

async function openCreate() {
  createForm.code = '';
  createForm.name = '';
  createForm.description = '';
  createForm.sourceResourceCode = '';
  try {
    const res = await getAppResourcesApi({ maxResultCount: 200 });
    resources.value = res.items || [];
  } catch {
    resources.value = [];
  }
  creating.value = true;
}

async function confirmCreate() {
  if (!createForm.code.trim() || !createForm.name.trim()) {
    message.warning('请填写编码与名称');
    return;
  }
  creatingBusy.value = true;
  try {
    const created = await createFormDefinitionApi({
      code: createForm.code.trim(),
      name: createForm.name.trim(),
      description: createForm.description.trim() || undefined,
      sourceResourceCode: createForm.sourceResourceCode || undefined,
    });
    creating.value = false;
    message.success('已创建，进入设计器');
    router.push({
      path: '/orchestration/forms/designer',
      query: { id: created.id },
    });
  } finally {
    creatingBusy.value = false;
  }
}

function openDesigner(row: FormDefinition) {
  router.push({
    path: '/orchestration/forms/designer',
    query: { id: row.id },
  });
}

async function openPreview(row: FormDefinition) {
  previewBusy.value = true;
  try {
    const detail = await getFormDefinitionApi(row.id);
    if (!detail.schema?.fields?.length) {
      message.warning('尚无字段，请先设计表单');
      return;
    }
    previewTarget.value = detail;
    previewOpen.value = true;
  } finally {
    previewBusy.value = false;
  }
}

async function publish(row: FormDefinition) {
  await publishFormDefinitionApi(row.id);
  message.success('已发布，可在 OA / 报表中通过 formRef 选用');
  await load();
}

async function resync(row: FormDefinition) {
  Modal.confirm({
    title: `从资源「${row.sourceResourceCode}」重新同步字段目录？`,
    content:
      '会把字段目录与资源表的列重新对齐，并按列表单的拍平字段；布局树不受影响。',
    async onOk() {
      const updated = await resyncCatalogFromResourceApi(row.id);
      message.success(
        `已同步，共 ${updated?.fieldCatalog?.length ?? 0} 个字段`,
      );
      await load();
    },
  });
}

async function remove(row: FormDefinition) {
  Modal.confirm({
    title: `删除表单「${row.name}」？`,
    okType: 'danger',
    async onOk() {
      await deleteFormDefinitionApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

onMounted(load);
</script>

<template>
  <Page
    description="设计器产出 FormDef JSON，运行时按 JSON 渲染。支持明细表格 / 列表 / 树。发布后可供 OA、报表 formRef 引用。"
    title="表单库"
  >
    <div class="mb-4 grid gap-3 sm:grid-cols-3">
      <div class="rounded-lg border border-border p-3">
        <div class="text-xs text-muted-foreground">全部</div>
        <div class="text-xl font-semibold">{{ stats.total }}</div>
      </div>
      <div class="rounded-lg border border-border p-3">
        <div class="text-xs text-muted-foreground">已发布（可查询引用）</div>
        <div class="text-xl font-semibold text-green-600">
          {{ stats.published }}
        </div>
      </div>
      <div class="rounded-lg border border-border p-3">
        <div class="text-xs text-muted-foreground">草稿</div>
        <div class="text-xl font-semibold">{{ stats.draft }}</div>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Space wrap>
        <Input
          v-model:value="filter"
          allow-clear
          placeholder="搜索名称 / 编码"
          style="width: 220px"
          @press-enter="load"
        />
        <Segmented
          v-model:value="statusFilter"
          :options="[
            { label: '全部', value: 'all' },
            { label: '草稿', value: 0 },
            { label: '已发布', value: 1 },
          ]"
          @change="
            () => {
              page.current = 1;
              load();
            }
          "
        />
        <Button type="primary" ghost @click="load">查询</Button>
      </Space>
      <Space>
        <Button @click="router.push('/orchestration/workflows')">
          OA审批流
        </Button>
        <AccessControl :codes="['Orchestration.Forms.Create']" type="code">
          <Button type="primary" @click="openCreate">新建表单</Button>
        </AccessControl>
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
        <template v-if="column.key === 'fields'">
          {{ (record as FormDefinition).schema?.fields?.length || 0 }}
        </template>
        <template v-else-if="column.key === 'version'">
          <Tag color="blue">
            v{{ (record as FormDefinition).schemaVersion ?? 0 }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag
            :color="
              (record as FormDefinition).status === 1 ? 'success' : 'default'
            "
          >
            {{ (record as FormDefinition).status === 1 ? '已发布' : '草稿' }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space>
            <Button
              size="small"
              type="link"
              :loading="previewBusy"
              @click="openPreview(record as FormDefinition)"
            >
              预览
            </Button>
            <Button
              size="small"
              type="link"
              @click="openDesigner(record as FormDefinition)"
            >
              设计
            </Button>
            <AccessControl :codes="['Orchestration.Forms.Publish']" type="code">
              <Button
                size="small"
                type="link"
                @click="publish(record as FormDefinition)"
              >
                发布
              </Button>
            </AccessControl>
            <Button
              v-if="(record as FormDefinition).sourceResourceCode"
              size="small"
              type="link"
              @click="resync(record as FormDefinition)"
            >
              同步字段
            </Button>
            <AccessControl :codes="['Orchestration.Forms.Delete']" type="code">
              <Button
                danger
                size="small"
                type="link"
                @click="remove(record as FormDefinition)"
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
      title="新建表单"
      :confirm-loading="creatingBusy"
      ok-text="创建并设计"
      @ok="confirmCreate"
    >
      <Form layout="vertical">
        <Form.Item label="编码" required>
          <Input v-model:value="createForm.code" class="font-mono" />
        </Form.Item>
        <Form.Item label="名称" required>
          <Input v-model:value="createForm.name" />
        </Form.Item>
        <Form.Item label="说明">
          <Input v-model:value="createForm.description" />
        </Form.Item>
        <Form.Item label="字段库来源（选填）">
          <Select
            v-model:value="createForm.sourceResourceCode"
            allow-clear
            class="w-full"
            :options="
              resources.map((r) => ({
                label: `${r.name} (${r.code})`,
                value: r.code,
              }))
            "
            placeholder="从资源同步列目录，也可之后手工加字段"
            show-search
          />
        </Form.Item>
      </Form>
    </Modal>

    <FormPreviewModal
      v-model:open="previewOpen"
      :schema="previewTarget?.schema"
      :title="previewTarget?.name"
      :code="previewTarget?.code"
      :status="previewTarget?.status"
    />
  </Page>
</template>
