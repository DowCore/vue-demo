<script lang="ts" setup>
import type {
  DdlPreviewItem,
  TableColumn,
  TableDefinition,
  TableIndex,
  TableIndexColumn,
} from '#/api/saas/orchestration';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  applyTableDdlApi,
  createAppResourceFromTableApi,
  getTableDefinitionApi,
  previewTableDdlApi,
  updateTableDefinitionApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'OrchestrationTableDesigner' });

const PLATFORM_TYPES = [
  { label: 'GUID', value: 'guid' },
  { label: '字符串 string', value: 'string' },
  { label: '长文本 text', value: 'text' },
  { label: '整数 int', value: 'int' },
  { label: '长整数 long', value: 'long' },
  { label: '小数 decimal', value: 'decimal' },
  { label: '布尔 boolean', value: 'boolean' },
  { label: '日期 date（仅年月日）', value: 'date' },
  { label: '日期时间 datetime（含时分秒）', value: 'datetime' },
  { label: 'JSON', value: 'json' },
  { label: '枚举 enum', value: 'enum' },
];

const SYNC_META: Record<string, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  inSync: { color: 'success', text: '已同步' },
  localAhead: { color: 'processing', text: '待应用' },
  remoteAhead: { color: 'warning', text: '库领先' },
  conflict: { color: 'error', text: '冲突' },
};

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const applying = ref(false);
const activeTab = ref('columns');
const table = ref<null | TableDefinition>(null);
const previewOpen = ref(false);
const previewItems = ref<DdlPreviewItem[]>([]);
const resourceOpen = ref(false);
const resourceForm = reactive({ code: '', name: '' });

const columnOpen = ref(false);
const editingColumnName = ref<null | string>(null);
const columnForm = reactive({
  name: '',
  displayName: '',
  platformType: 'string',
  length: 256 as number | undefined,
  precision: 18 as number | undefined,
  scale: 2 as number | undefined,
  nullable: true,
  default: '',
  comment: '',
});

const indexOpen = ref(false);
const editingIndexName = ref<null | string>(null);
const indexForm = reactive({
  name: '',
  unique: false,
  columns: [] as TableIndexColumn[],
});

const userColumns = computed(
  () => table.value?.columns.filter((c) => c.origin !== 'convention') || [],
);
const conventionColumns = computed(
  () => table.value?.columns.filter((c) => c.origin === 'convention') || [],
);
const userIndexes = computed(
  () =>
    table.value?.indexes.filter(
      (x) => x.origin !== 'convention' && !x.isPrimary,
    ) || [],
);
const systemIndexes = computed(
  () =>
    table.value?.indexes.filter(
      (x) => x.origin === 'convention' || x.isPrimary,
    ) || [],
);
const columnNameOptions = computed(() =>
  (table.value?.columns || []).map((c) => ({
    label: `${c.displayName || c.name}（${c.name}）`,
    value: c.name,
  })),
);

const userColumnTableCols = [
  { title: '列名', dataIndex: 'name', key: 'name', width: 160 },
  { title: '显示名', dataIndex: 'displayName', key: 'displayName' },
  { title: '类型', key: 'type', width: 150 },
  { title: '可空', key: 'nullable', width: 80 },
  { title: '默认值', dataIndex: 'default', key: 'default', width: 120 },
  { title: '操作', key: 'actions', width: 140 },
];

const conventionColumnTableCols = [
  { title: '列名', dataIndex: 'name', key: 'name', width: 180 },
  { title: '显示名', dataIndex: 'displayName', key: 'displayName' },
  { title: '类型', dataIndex: 'platformType', key: 'type', width: 120 },
  { title: '可空', key: 'nullable', width: 80 },
];

function typeLabel(type: string) {
  if (type === 'date') return '日期（不含时间）';
  if (type === 'datetime') return '日期时间';
  return PLATFORM_TYPES.find((x) => x.value === type)?.label || type;
}

function columnTypeHint(type: string) {
  if (type === 'date') {
    return '只存年月日，适合订单日期、生日。表单用日期选择器，不含时刻。';
  }
  if (type === 'datetime') {
    return '存到时分秒，适合预约、截止时间。创建/修改时间等系统列也是这种。';
  }
  return '';
}

function indexTypeLabel(ix: TableIndex) {
  if (ix.isPrimary) return '主键';
  if (ix.unique) return '唯一';
  return '普通';
}

function indexColumnsText(ix: TableIndex) {
  return ix.columns
    .map((c) => `${c.name} ${c.descending ? 'DESC' : 'ASC'}`)
    .join(', ');
}

function suggestIndexName(columns: TableIndexColumn[]) {
  const tableName = table.value?.tableName || 'Table';
  const parts = columns
    .map((c) => c.name)
    .filter(Boolean)
    .slice(0, 3);
  return `IX_${tableName}${parts.length > 0 ? `_${parts.join('_')}` : ''}`;
}

async function load() {
  const id = String(route.query.id || '');
  if (!id) {
    message.warning('缺少表 Id');
    return;
  }
  loading.value = true;
  try {
    table.value = await getTableDefinitionApi(id);
  } finally {
    loading.value = false;
  }
}

function openAddColumn() {
  editingColumnName.value = null;
  columnForm.name = '';
  columnForm.displayName = '';
  columnForm.platformType = 'string';
  columnForm.length = 256;
  columnForm.precision = 18;
  columnForm.scale = 2;
  columnForm.nullable = true;
  columnForm.default = '';
  columnForm.comment = '';
  columnOpen.value = true;
}

function openEditColumn(col: TableColumn) {
  if (col.origin === 'convention') return;
  editingColumnName.value = col.name;
  columnForm.name = col.name;
  columnForm.displayName = col.displayName;
  columnForm.platformType = col.platformType;
  columnForm.length = col.length ?? 256;
  columnForm.precision = col.precision ?? 18;
  columnForm.scale = col.scale ?? 2;
  columnForm.nullable = col.nullable;
  columnForm.default = col.default || '';
  columnForm.comment = col.comment || '';
  columnOpen.value = true;
}

function applyColumnForm() {
  if (!table.value) return;
  const name = columnForm.name.trim();
  if (!name) {
    message.warning('请填写列名');
    return;
  }
  const duplicate = table.value.columns.some(
    (c) =>
      c.name.toLowerCase() === name.toLowerCase() &&
      c.name !== editingColumnName.value,
  );
  if (duplicate) {
    message.warning(`列名 ${name} 已存在`);
    return;
  }

  const prev = editingColumnName.value
    ? table.value.columns.find((c) => c.name === editingColumnName.value)
    : undefined;
  const next: TableColumn = {
    name,
    displayName: columnForm.displayName.trim() || name,
    platformType: columnForm.platformType,
    length:
      columnForm.platformType === 'string' ? columnForm.length : undefined,
    precision:
      columnForm.platformType === 'decimal' ? columnForm.precision : undefined,
    scale: columnForm.platformType === 'decimal' ? columnForm.scale : undefined,
    nullable: columnForm.nullable,
    unique: false,
    default: columnForm.default || undefined,
    comment: columnForm.comment || undefined,
    origin: prev?.origin || 'user',
    appliedName:
      prev?.appliedName ||
      (table.value.lastAppliedAt && prev ? prev.name : undefined),
  };

  let cols = [...table.value.columns];
  if (editingColumnName.value) {
    cols = cols.map((c) => (c.name === editingColumnName.value ? next : c));
    table.value = {
      ...table.value,
      columns: cols,
      indexes: renameIndexColumn(
        table.value.indexes,
        editingColumnName.value,
        name,
      ),
    };
  } else {
    table.value = { ...table.value, columns: [...cols, next] };
  }
  columnOpen.value = false;
}

function renameIndexColumn(indexes: TableIndex[], from: string, to: string) {
  if (from === to) return indexes;
  return indexes.map((ix) => ({
    ...ix,
    columns: ix.columns.map((c) => (c.name === from ? { ...c, name: to } : c)),
  }));
}

function removeColumn(name: string) {
  if (!table.value) return;
  Modal.confirm({
    title: `删除列「${name}」？`,
    content: '同时会从引用该列的业务索引中移除。系统约定列无法删除。',
    okType: 'danger',
    onOk() {
      if (!table.value) return;
      const nextIndexes = table.value.indexes
        .map((ix) => ({
          ...ix,
          columns: ix.columns.filter((c) => c.name !== name),
        }))
        .filter(
          (ix) =>
            ix.origin === 'convention' || ix.isPrimary || ix.columns.length > 0,
        );
      table.value = {
        ...table.value,
        columns: table.value.columns.filter((c) => c.name !== name),
        indexes: nextIndexes,
      };
    },
  });
}

function openAddIndex() {
  if (!table.value) return;
  if (table.value.columns.length === 0) {
    message.warning('请先添加字段');
    return;
  }
  editingIndexName.value = null;
  indexForm.unique = false;
  indexForm.columns = [
    {
      name: userColumns.value[0]?.name || table.value.columns[0]?.name || '',
      descending: false,
    },
  ];
  indexForm.name = suggestIndexName(indexForm.columns);
  indexOpen.value = true;
}

function openEditIndex(ix: TableIndex) {
  if (ix.origin === 'convention' || ix.isPrimary) return;
  editingIndexName.value = ix.name;
  indexForm.name = ix.name;
  indexForm.unique = ix.unique;
  indexForm.columns = ix.columns.map((c) => ({
    name: c.name,
    descending: c.descending,
  }));
  indexOpen.value = true;
}

function addIndexColumn() {
  const used = new Set(indexForm.columns.map((c) => c.name));
  const next = (table.value?.columns || []).find((c) => !used.has(c.name));
  if (!next) {
    message.warning('所有字段都已加入该索引');
    return;
  }
  indexForm.columns.push({ name: next.name, descending: false });
  if (!editingIndexName.value) {
    indexForm.name = suggestIndexName(indexForm.columns);
  }
}

function removeIndexColumn(i: number) {
  indexForm.columns.splice(i, 1);
  if (!editingIndexName.value) {
    indexForm.name = suggestIndexName(indexForm.columns);
  }
}

function moveIndexColumn(i: number, delta: number) {
  const j = i + delta;
  const a = indexForm.columns[i];
  const b = indexForm.columns[j];
  if (!a || !b) return;
  indexForm.columns[i] = b;
  indexForm.columns[j] = a;
}

function onIndexColumnChange() {
  if (!editingIndexName.value) {
    indexForm.name = suggestIndexName(indexForm.columns);
  }
}

function applyIndexForm() {
  if (!table.value) return;
  const name = indexForm.name.trim();
  if (!name) {
    message.warning('请填写索引名');
    return;
  }
  const cols = indexForm.columns.filter((c) => c.name);
  if (cols.length === 0) {
    message.warning('请至少选择一个字段');
    return;
  }
  const names = cols.map((c) => c.name);
  if (new Set(names).size !== names.length) {
    message.warning('同一索引中不能重复选择字段');
    return;
  }
  const duplicate = table.value.indexes.some(
    (x) =>
      x.name.toLowerCase() === name.toLowerCase() &&
      x.name !== editingIndexName.value,
  );
  if (duplicate) {
    message.warning(`索引名 ${name} 已存在`);
    return;
  }

  const next: TableIndex = {
    name,
    unique: indexForm.unique,
    isPrimary: false,
    origin: 'user',
    columns: cols.map((c) => ({ name: c.name, descending: !!c.descending })),
  };

  let indexes = [...table.value.indexes];
  if (editingIndexName.value) {
    indexes = indexes.map((x) =>
      x.name === editingIndexName.value ? next : x,
    );
  } else {
    indexes.push(next);
  }
  table.value = { ...table.value, indexes };
  indexOpen.value = false;
}

function removeIndex(name: string) {
  if (!table.value) return;
  table.value = {
    ...table.value,
    indexes: table.value.indexes.filter((x) => x.name !== name),
  };
}

async function saveDraft() {
  if (!table.value) return;
  saving.value = true;
  try {
    table.value = await updateTableDefinitionApi(table.value.id, {
      displayName: table.value.displayName,
      comment: table.value.comment,
      columns: table.value.columns,
      indexes: table.value.indexes,
    });
    message.success('草稿已保存');
  } finally {
    saving.value = false;
  }
}

async function preview() {
  if (!table.value) return;
  await saveDraft();
  const res = await previewTableDdlApi(table.value.id);
  previewItems.value = res.items || [];
  previewOpen.value = true;
}

function ddlKindLabel(kind: string) {
  const map: Record<string, string> = {
    createTable: '建表',
    addColumn: '新增字段',
    renameColumn: '重命名字段',
    alterColumn: '修改字段',
    dropColumn: '删除字段',
    createIndex: '新增索引',
    dropIndex: '删除索引',
  };
  return map[kind] || kind;
}

async function apply() {
  if (!table.value) return;
  applying.value = true;
  try {
    await saveDraft();
    const res = await previewTableDdlApi(table.value.id);
    previewItems.value = res.items || [];
    const destructive = previewItems.value.some((x) => x.destructive);
    if (destructive && !previewOpen.value) {
      previewOpen.value = true;
      message.warning('包含删除、重命名或收缩类型，请确认预览后再应用到库');
      return;
    }
    table.value = await applyTableDdlApi(table.value.id);
    previewOpen.value = false;
    message.success('已应用到数据库');
  } finally {
    applying.value = false;
  }
}

function openResource() {
  if (!table.value) return;
  resourceForm.code = table.value.tableName;
  resourceForm.name = table.value.displayName;
  resourceOpen.value = true;
}

async function createResource() {
  if (!table.value) return;
  if (!resourceForm.code.trim() || !resourceForm.name.trim()) {
    message.warning('请填写资源编码与名称');
    return;
  }
  saving.value = true;
  try {
    const created = await createAppResourceFromTableApi(table.value.id, {
      code: resourceForm.code.trim(),
      name: resourceForm.name.trim(),
    });
    resourceOpen.value = false;
    message.success('已创建资源');
    router.push({
      path: '/orchestration/resources/editor',
      query: { id: created.id },
    });
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page :title="table ? `表设计 · ${table.displayName}` : '表设计器'">
    <template v-if="table">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <Button type="text" @click="router.push('/orchestration/tables')">
            <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
            返回
          </Button>
          <span class="font-mono text-sm text-muted-foreground">
            {{ table.dataSourceCode }}.{{ table.tableName }}
          </span>
          <Tag :color="SYNC_META[table.syncState]?.color || 'default'">
            {{ SYNC_META[table.syncState]?.text || table.syncState }}
          </Tag>
        </div>
        <Space wrap>
          <AccessControl :codes="['Orchestration.Tables.Update']" type="code">
            <Button :loading="saving" @click="saveDraft">保存草稿</Button>
          </AccessControl>
          <AccessControl :codes="['Orchestration.Tables.Default']" type="code">
            <Button @click="preview">预览 DDL</Button>
          </AccessControl>
          <AccessControl :codes="['Orchestration.Tables.Ddl']" type="code">
            <Button :loading="applying" type="primary" @click="apply">
              应用到库
            </Button>
          </AccessControl>
          <AccessControl
            :codes="['Orchestration.Resources.Create']"
            type="code"
          >
            <Button
              :disabled="table.syncState !== 'inSync'"
              @click="openResource"
            >
              一键创建资源
            </Button>
          </AccessControl>
        </Space>
      </div>

      <div class="mb-4 grid gap-3 md:grid-cols-2">
        <div>
          <div class="mb-1 text-xs text-muted-foreground">显示名</div>
          <Input v-model:value="table.displayName" />
        </div>
        <div>
          <div class="mb-1 text-xs text-muted-foreground">备注</div>
          <Input v-model:value="table.comment" placeholder="可选" />
        </div>
      </div>

      <Tabs v-model:active-key="activeTab">
        <Tabs.TabPane key="columns" :tab="`字段（${userColumns.length}）`">
          <div class="mb-3 flex items-center justify-between">
            <div class="text-xs text-muted-foreground">
              只设计业务字段。应用到库时会对照数据库实际结构，生成改名、改长度/类型、删除字段和索引等
              DDL。系统约定列锁定。
            </div>
            <Button type="primary" @click="openAddColumn">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              添加字段
            </Button>
          </div>
          <Table
            :columns="userColumnTableCols"
            :data-source="userColumns"
            :locale="{ emptyText: '还没有业务字段，点击右上角添加' }"
            :pagination="false"
            row-key="name"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <span class="font-mono">{{
                  (record as TableColumn).name
                }}</span>
                <Tag
                  v-if="
                    (record as TableColumn).appliedName &&
                    (record as TableColumn).appliedName !==
                      (record as TableColumn).name
                  "
                  class="ml-2"
                  color="warning"
                >
                  重命名自 {{ (record as TableColumn).appliedName }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'type'">
                <span class="text-sm">
                  {{ typeLabel((record as TableColumn).platformType) }}
                  <span
                    v-if="(record as TableColumn).platformType === 'string'"
                    class="text-muted-foreground"
                  >
                    ({{ (record as TableColumn).length || 256 }})
                  </span>
                </span>
              </template>
              <template v-else-if="column.key === 'nullable'">
                {{ (record as TableColumn).nullable ? '是' : '否' }}
              </template>
              <template v-else-if="column.key === 'actions'">
                <Space>
                  <Button
                    size="small"
                    type="link"
                    @click="openEditColumn(record as TableColumn)"
                  >
                    编辑
                  </Button>
                  <Button
                    danger
                    size="small"
                    type="link"
                    @click="removeColumn((record as TableColumn).name)"
                  >
                    删除
                  </Button>
                </Space>
              </template>
            </template>
          </Table>

          <Collapse class="mt-4" ghost>
            <Collapse.Panel key="sys" header="系统约定列（ABP，已锁定）">
              <Table
                :columns="conventionColumnTableCols"
                :data-source="conventionColumns"
                :pagination="false"
                row-key="name"
                size="small"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'name'">
                    <span class="font-mono">{{
                      (record as TableColumn).name
                    }}</span>
                  </template>
                  <template v-else-if="column.key === 'nullable'">
                    {{ (record as TableColumn).nullable ? '是' : '否' }}
                  </template>
                </template>
              </Table>
            </Collapse.Panel>
          </Collapse>
        </Tabs.TabPane>

        <Tabs.TabPane key="indexes" :tab="`索引（${table.indexes.length}）`">
          <div class="mb-3 flex items-center justify-between">
            <div class="text-xs text-muted-foreground">
              选择字段、排序方向和是否唯一，再生成索引。主键与租户索引由约定列自动带出。
            </div>
            <Button type="primary" @click="openAddIndex">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              添加索引
            </Button>
          </div>

          <Table
            :columns="[
              { title: '索引名', dataIndex: 'name', key: 'name' },
              { title: '类型', key: 'kind', width: 100 },
              { title: '字段', key: 'cols' },
              { title: '操作', key: 'actions', width: 140 },
            ]"
            :data-source="[...systemIndexes, ...userIndexes]"
            :pagination="false"
            row-key="name"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <span class="font-mono text-sm">{{
                  (record as TableIndex).name
                }}</span>
              </template>
              <template v-else-if="column.key === 'kind'">
                <Tag
                  :color="
                    (record as TableIndex).isPrimary
                      ? 'gold'
                      : (record as TableIndex).unique
                        ? 'blue'
                        : 'default'
                  "
                >
                  {{ indexTypeLabel(record as TableIndex) }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'cols'">
                <span class="font-mono text-xs text-muted-foreground">
                  {{ indexColumnsText(record as TableIndex) }}
                </span>
              </template>
              <template v-else-if="column.key === 'actions'">
                <Space
                  v-if="
                    (record as TableIndex).origin !== 'convention' &&
                    !(record as TableIndex).isPrimary
                  "
                >
                  <Button
                    size="small"
                    type="link"
                    @click="openEditIndex(record as TableIndex)"
                  >
                    编辑
                  </Button>
                  <Button
                    danger
                    size="small"
                    type="link"
                    @click="removeIndex((record as TableIndex).name)"
                  >
                    删除
                  </Button>
                </Space>
                <span v-else class="text-xs text-muted-foreground">锁定</span>
              </template>
            </template>
          </Table>
        </Tabs.TabPane>
      </Tabs>
    </template>

    <Modal
      v-model:open="columnOpen"
      :title="editingColumnName ? '编辑字段' : '添加字段'"
      destroy-on-close
      ok-text="确定"
      @ok="applyColumnForm"
    >
      <Form class="mt-2" layout="vertical">
        <Form.Item label="列名" required>
          <Input
            v-model:value="columnForm.name"
            class="font-mono"
            placeholder="如 OrderNo"
          />
        </Form.Item>
        <Form.Item label="显示名">
          <Input
            v-model:value="columnForm.displayName"
            placeholder="订单编号"
          />
        </Form.Item>
        <Form.Item
          :extra="columnTypeHint(columnForm.platformType)"
          label="类型"
        >
          <Select
            v-model:value="columnForm.platformType"
            :options="PLATFORM_TYPES"
          />
        </Form.Item>
        <Form.Item v-if="columnForm.platformType === 'string'" label="长度">
          <InputNumber
            v-model:value="columnForm.length"
            :max="4000"
            :min="1"
            class="w-full"
          />
        </Form.Item>
        <div
          v-if="columnForm.platformType === 'decimal'"
          class="grid grid-cols-2 gap-3"
        >
          <Form.Item label="精度 precision">
            <InputNumber
              v-model:value="columnForm.precision"
              :max="38"
              :min="1"
              class="w-full"
            />
          </Form.Item>
          <Form.Item label="小数位 scale">
            <InputNumber
              v-model:value="columnForm.scale"
              :max="18"
              :min="0"
              class="w-full"
            />
          </Form.Item>
        </div>
        <Form.Item label="允许空值">
          <Switch v-model:checked="columnForm.nullable" />
        </Form.Item>
        <Form.Item label="默认值">
          <Input v-model:value="columnForm.default" class="font-mono" />
        </Form.Item>
        <Form.Item label="注释">
          <Input v-model:value="columnForm.comment" />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="indexOpen"
      :title="editingIndexName ? '编辑索引' : '添加索引'"
      destroy-on-close
      ok-text="确定"
      width="640px"
      @ok="applyIndexForm"
    >
      <Form class="mt-2" layout="vertical">
        <Form.Item label="索引名" required>
          <Input v-model:value="indexForm.name" class="font-mono" />
        </Form.Item>
        <Form.Item label="类型">
          <Select
            :value="indexForm.unique ? 'unique' : 'normal'"
            :options="[
              { label: '普通索引', value: 'normal' },
              { label: '唯一索引', value: 'unique' },
            ]"
            @update:value="(v) => (indexForm.unique = v === 'unique')"
          />
        </Form.Item>
        <Form.Item label="字段（按顺序组成复合索引）" required>
          <div class="space-y-2">
            <div
              v-for="(col, i) in indexForm.columns"
              :key="i"
              class="flex items-center gap-2"
            >
              <Select
                v-model:value="col.name"
                :options="columnNameOptions"
                class="min-w-0 flex-1"
                placeholder="选择字段"
                show-search
                @change="onIndexColumnChange"
              />
              <Select
                :value="col.descending ? 'desc' : 'asc'"
                :options="[
                  { label: '升序 ASC', value: 'asc' },
                  { label: '降序 DESC', value: 'desc' },
                ]"
                style="width: 128px"
                @update:value="(v) => (col.descending = v === 'desc')"
              />
              <Button
                :disabled="i === 0"
                size="small"
                type="text"
                @click="moveIndexColumn(i, -1)"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:arrow-up" />
                </template>
              </Button>
              <Button
                :disabled="i === indexForm.columns.length - 1"
                size="small"
                type="text"
                @click="moveIndexColumn(i, 1)"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:arrow-down" />
                </template>
              </Button>
              <Button
                danger
                size="small"
                type="text"
                @click="removeIndexColumn(i)"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:trash-2" />
                </template>
              </Button>
            </div>
            <Button block type="dashed" @click="addIndexColumn">
              添加字段
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="previewOpen"
      :confirm-loading="applying"
      ok-text="应用到库"
      title="DDL 预览"
      width="720px"
      @ok="apply"
    >
      <div v-if="!previewItems.length" class="text-sm text-muted-foreground">
        没有待执行的变更。
      </div>
      <div
        v-for="(item, i) in previewItems"
        :key="i"
        class="mb-2 rounded-md p-2"
        :class="item.destructive ? 'bg-red-500/10' : 'bg-muted'"
      >
        <div
          class="mb-1 text-xs"
          :class="item.destructive ? 'text-red-500' : 'text-muted-foreground'"
        >
          {{ ddlKindLabel(item.kind) }}
          <span v-if="item.destructive">（破坏性）</span>
        </div>
        <pre class="overflow-auto font-mono text-xs">{{ item.sql }}</pre>
      </div>
    </Modal>

    <Modal
      v-model:open="resourceOpen"
      :confirm-loading="saving"
      ok-text="创建资源"
      title="一键创建资源"
      @ok="createResource"
    >
      <Form class="mt-2" layout="vertical">
        <Form.Item label="资源编码" required>
          <Input v-model:value="resourceForm.code" class="font-mono" />
        </Form.Item>
        <Form.Item label="名称" required>
          <Input v-model:value="resourceForm.name" />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
