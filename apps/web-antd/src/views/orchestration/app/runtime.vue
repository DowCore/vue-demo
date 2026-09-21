<script lang="ts" setup>
import type {
  ActionDef,
  AppResource,
  FormFieldDef,
  ListColumnDef,
} from '#/api/saas/orchestration';
import type { FilterNode } from '#/views/orchestration/shared/filter-model';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createAppResourceRecordApi,
  deleteAppResourceRecordApi,
  getAppResourceRecordApi,
  getPublishedAppResourceApi,
  queryAppResourceApi,
  updateAppResourceRecordApi,
} from '#/api/saas/orchestration';
import FilterGroupEditor from '#/views/orchestration/shared/filter-group-editor.vue';
import {
  emptyGroup,
  mergeAnd,
  pruneFilter,
  searchFormToFilter,
} from '#/views/orchestration/shared/filter-model';
import {
  formatCellValue,
  pickRecordValue,
  resolveTone,
  toDatePickerValue,
  toneClass,
} from '#/views/orchestration/shared/format-cell';
import SearchFormPanel from '#/views/orchestration/shared/search-form-panel.vue';

defineOptions({ name: 'AppResourceRuntime' });

const route = useRoute();
const loading = ref(false);
const saving = ref(false);
const resource = ref<AppResource | null>(null);
const rows = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const summary = ref<Record<string, Record<string, unknown>>>({});
const page = reactive({ current: 1, pageSize: 20 });
const sorting = ref('');
const searchValues = ref<Record<string, unknown>>({});
const advancedOpen = ref(false);
const advancedGroup = ref<FilterNode>(emptyGroup());
const activePreset = ref('');
const drawerOpen = ref(false);
const formMode = ref<'create' | 'detail' | 'update'>('create');
const formRecord = ref<Record<string, unknown>>({});
const editingId = ref('');
const concurrencyStamp = ref('');
const whitelistFields = ref<null | string[]>(null);

const code = computed(() => String(route.params.code || ''));

const fieldOptions = computed(() => {
  const cols = resource.value?.listView.columns || [];
  return cols.map((c) => ({ label: c.title || c.field, value: c.field }));
});

const searchFields = computed(
  () => resource.value?.filter.searchForm?.fields || [],
);

const visibleColumns = computed(() =>
  (resource.value?.listView.columns || []).filter((c) => c.visible !== false),
);

const toolbarActions = computed(() =>
  (resource.value?.listView.actions || []).filter(
    (a) => (a.scene || a.position) === 'toolbar',
  ),
);

const rowActions = computed(() =>
  (resource.value?.listView.actions || []).filter(
    (a) => (a.scene || a.position) === 'row',
  ),
);

const batchActions = computed(() => {
  const listed = (resource.value?.listView.actions || []).filter(
    (a) => (a.scene || a.position) === 'batch',
  );
  if (listed.length > 0) return listed;
  if (rowActions.value.some((a) => a.kind === 'delete')) {
    return [
      {
        key: 'batchDelete',
        label: '批量删除',
        position: 'batch',
        scene: 'batch',
        kind: 'delete',
        confirmText: '删除选中的记录？',
        batchLimit: 100,
      } as ActionDef,
    ];
  }
  return [];
});

const selectedIds = ref<string[]>([]);

const tableColumns = computed(() => {
  const cols = visibleColumns.value.map((c) => ({
    title: c.title || c.field,
    dataIndex: c.field,
    key: c.field,
    width: c.width,
    align: (c.align as 'center' | 'left' | 'right') || 'left',
    sorter: !!c.sortable,
    customRender: ({ record }: { record: Record<string, unknown> }) =>
      formatCellValue(
        pickRecordValue(record, c.field),
        c.formatPreset,
        c.dictMap,
      ),
  }));
  cols.push({
    title: '操作',
    dataIndex: '_actions',
    key: 'actions',
    width: Math.min(80 + rowActions.value.length * 56, 280),
    align: 'left',
    sorter: false,
    customRender: (_args: { record: Record<string, unknown> }) => '',
  });
  return cols;
});

const visibleFields = computed(() => {
  const fields = resource.value?.form.fields || [];
  const allow = whitelistFields.value;
  return fields.filter((f) => {
    if (
      allow &&
      !allow.some((x) => x.toLowerCase() === f.field.toLowerCase())
    ) {
      return false;
    }
    if (formMode.value === 'create') return f.visibleOnCreate !== false;
    if (formMode.value === 'update') return f.visibleOnUpdate !== false;
    return f.visibleOnDetail !== false;
  });
});

function isReadonly(field: FormFieldDef) {
  if (formMode.value === 'detail') return true;
  if (formMode.value === 'create') return !!field.readonlyOnCreate;
  return !!field.readonlyOnUpdate;
}

function isRequired(field: FormFieldDef) {
  if (formMode.value === 'create') return !!field.requiredOnCreate;
  if (formMode.value === 'update') return !!field.requiredOnUpdate;
  return false;
}

function rowId(row: Record<string, unknown>) {
  return String(pickRecordValue(row, 'Id') ?? pickRecordValue(row, 'id') ?? '');
}

function columnOf(key: string): ListColumnDef | undefined {
  return visibleColumns.value.find((c) => c.field === key);
}

function cellTone(
  column: ListColumnDef | undefined,
  record: Record<string, unknown>,
) {
  if (!column) return '';
  return resolveTone(
    pickRecordValue(record, column.field),
    column.styleRules,
    'cell',
  );
}

function summaryText(col: ListColumnDef | undefined) {
  if (!col) return '';
  const slot = summary.value[col.field];
  if (!slot) return '';
  const fn = col.summaryFn || 'sum';
  const raw = slot[fn] ?? slot.sum ?? slot.count;
  if (raw === undefined || raw === null) return '';
  return `${fn.toUpperCase()} ${formatCellValue(raw, col.formatPreset, col.dictMap)}`;
}

function currentFilter(): FilterNode | undefined {
  const formTree = searchFormToFilter(searchFields.value, searchValues.value);
  const advanced = pruneFilter(advancedGroup.value);
  const preset = resource.value?.filter.presets?.find(
    (p) => p.key === activePreset.value,
  );
  return mergeAnd([
    formTree,
    advanced,
    preset ? pruneFilter(preset.filter) : undefined,
  ]);
}

async function loadResource() {
  resource.value = await getPublishedAppResourceApi(code.value);
  page.pageSize = resource.value.listView.pageSize || 20;
  sorting.value = resource.value.listView.defaultSorting || '';
  searchValues.value = {};
  advancedGroup.value = emptyGroup();
  activePreset.value = '';
}

async function loadRows() {
  if (!resource.value) return;
  loading.value = true;
  try {
    const filter = currentFilter();
    const res = await queryAppResourceApi(resource.value.code, {
      page: page.current,
      pageSize: page.pageSize,
      sorting: sorting.value || undefined,
      filter,
      summaryFields: visibleColumns.value
        .filter((c) => c.summaryFn)
        .map((c) => ({ field: c.field, fn: c.summaryFn || 'sum' })),
    });
    if (!res.success) {
      message.error(res.error || '查询失败');
      return;
    }
    const data = (res.data || {}) as {
      items?: Record<string, unknown>[];
      total?: number;
      summary?: Record<string, Record<string, unknown>>;
    };
    rows.value = data.items || [];
    total.value = data.total || 0;
    summary.value = data.summary || {};
  } finally {
    loading.value = false;
  }
}

function runQuery() {
  page.current = 1;
  loadRows();
}

function resetQuery() {
  searchValues.value = {};
  advancedGroup.value = emptyGroup();
  activePreset.value = '';
  runQuery();
}

function openCreate() {
  formMode.value = 'create';
  editingId.value = '';
  concurrencyStamp.value = '';
  formRecord.value = {};
  whitelistFields.value = null;
  drawerOpen.value = true;
}

async function openEdit(
  row: Record<string, unknown>,
  mode: 'detail' | 'update',
  action?: ActionDef,
) {
  if (!resource.value) return;
  const id = rowId(row);
  const res = await getAppResourceRecordApi(resource.value.code, id);
  if (!res.success) {
    message.error(res.error || '读取失败');
    return;
  }
  const payload = (res.data || {}) as { record?: Record<string, unknown> };
  const record = payload.record || (res.data as Record<string, unknown>);
  const next: Record<string, unknown> = {};
  for (const field of resource.value.form.fields) {
    next[field.field] = pickRecordValue(record, field.field);
  }
  formMode.value = mode;
  editingId.value = id;
  formRecord.value = next;
  concurrencyStamp.value = String(
    pickRecordValue(record, 'ConcurrencyStamp') ?? '',
  );
  whitelistFields.value =
    action?.fieldsMode === 'whitelist' ? action.fields || [] : null;
  drawerOpen.value = true;
}

async function runRowAction(action: ActionDef, row: Record<string, unknown>) {
  const kind = action.kind;
  if (kind === 'create') {
    openCreate();
    return;
  }
  if (kind === 'update' || kind === 'detail') {
    await openEdit(row, kind === 'detail' ? 'detail' : 'update', action);
    return;
  }
  if (kind === 'delete') {
    confirmDelete(row, action);
    return;
  }
  if (action.open === 'drawer' || action.open === 'modal') {
    await openEdit(
      row,
      action.formMode === 'detail' ? 'detail' : 'update',
      action,
    );
    return;
  }
  message.info(`按钮「${action.label}」需绑定弹窗或删除/编辑类型`);
}

function runToolbarAction(action: ActionDef) {
  if (action.kind === 'create' || action.key === 'create') {
    openCreate();
    return;
  }
  message.info(`工具栏按钮「${action.label}」暂未配置功能`);
}

function runBatchAction(action: ActionDef) {
  const code = resource.value?.code;
  if (!code) return;
  if (selectedIds.value.length === 0) {
    message.warning('请先勾选行');
    return;
  }
  if (action.kind === 'delete') {
    Modal.confirm({
      title:
        action.confirmText || `删除选中的 ${selectedIds.value.length} 条？`,
      okType: 'danger',
      async onOk() {
        for (const id of selectedIds.value.slice(0, action.batchLimit || 100)) {
          await deleteAppResourceRecordApi(code, id);
        }
        selectedIds.value = [];
        await loadRows();
      },
    });
    return;
  }
  message.info('自定义批量操作请绑定 flowKey 后在后续版本执行');
}

async function submitForm() {
  if (!resource.value) return;
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      const res = await createAppResourceRecordApi(resource.value.code, {
        record: formRecord.value,
      });
      if (!res.success) {
        message.error(res.error || '新增失败');
        return;
      }
      message.success('已新增');
    } else if (formMode.value === 'update') {
      const res = await updateAppResourceRecordApi(resource.value.code, {
        id: editingId.value,
        concurrencyStamp: concurrencyStamp.value || undefined,
        record: formRecord.value,
      });
      if (!res.success) {
        message.error(res.error || '更新失败');
        return;
      }
      message.success('已更新');
    }
    drawerOpen.value = false;
    await loadRows();
  } finally {
    saving.value = false;
  }
}

function confirmDelete(row: Record<string, unknown>, action?: ActionDef) {
  const code = resource.value?.code;
  if (!code) return;
  const id = rowId(row);
  Modal.confirm({
    title: action?.confirmText || '确认删除该记录？',
    okType: 'danger',
    async onOk() {
      const res = await deleteAppResourceRecordApi(code, id);
      if (!res.success) {
        message.error(res.error || '删除失败');
        return;
      }
      message.success('已删除');
      await loadRows();
    },
  });
}

function onTableChange(_p: unknown, _f: unknown, sorter: unknown) {
  const raw = Array.isArray(sorter) ? sorter[0] : sorter;
  const s = raw as undefined | { field?: unknown; order?: string };
  const field = Array.isArray(s?.field) ? s.field[0] : s?.field;
  if (field && s?.order) {
    sorting.value = `${String(field)} ${s.order === 'descend' ? 'desc' : 'asc'}`;
  }
  loadRows();
}

watch(
  () => route.params.code,
  async () => {
    if (!code.value) return;
    await loadResource();
    page.current = 1;
    await loadRows();
  },
);

onMounted(async () => {
  if (!code.value) return;
  await loadResource();
  await loadRows();
});
</script>

<template>
  <Page
    :description="
      resource ? `${resource.dataSourceCode}.${resource.tableName}` : ''
    "
    :title="resource?.name || '资源运行时'"
  >
    <div class="mb-4 space-y-3 rounded-lg border border-border p-3">
      <SearchFormPanel
        v-if="searchFields.length"
        v-model:model-value="searchValues"
        :fields="searchFields"
      />
      <div class="flex flex-wrap items-center gap-2">
        <Button type="primary" @click="runQuery">查询</Button>
        <Button @click="resetQuery">重置</Button>
        <Button
          v-if="resource?.filter.advancedFilter !== false"
          @click="advancedOpen = true"
        >
          更多条件
        </Button>
        <Button
          v-for="chip in resource?.filter.presets || []"
          :key="chip.key"
          :type="activePreset === chip.key ? 'primary' : 'default'"
          size="small"
          @click="
            () => {
              activePreset = activePreset === chip.key ? '' : chip.key;
              runQuery();
            }
          "
        >
          {{ chip.label }}
        </Button>
        <Button
          v-for="action in toolbarActions"
          :key="action.key"
          @click="runToolbarAction(action)"
        >
          {{ action.label }}
        </Button>
        <Button
          v-for="action in batchActions"
          :key="action.key"
          :disabled="!selectedIds.length"
          @click="runBatchAction(action)"
        >
          {{ action.label }}
        </Button>
      </div>
    </div>

    <Table
      :columns="tableColumns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: page.current,
        pageSize: page.pageSize,
        total,
        showSizeChanger: true,
        onChange: (c: number, s: number) => {
          page.current = c;
          page.pageSize = s;
          loadRows();
        },
      }"
      :row-key="rowId"
      :row-selection="
        batchActions.length
          ? {
              selectedRowKeys: selectedIds,
              onChange: (keys: (string | number)[]) => {
                selectedIds = keys.map(String);
              },
            }
          : undefined
      "
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record, text }">
        <template v-if="column.key === 'actions'">
          <Space>
            <Button
              v-for="action in rowActions"
              :key="action.key"
              :danger="action.kind === 'delete'"
              size="small"
              type="link"
              @click="runRowAction(action, record as Record<string, unknown>)"
            >
              {{ action.label }}
            </Button>
          </Space>
        </template>
        <template v-else>
          <Tag
            v-if="columnOf(String(column.key))?.render === 'tag'"
            :color="
              cellTone(
                columnOf(String(column.key)),
                record as Record<string, unknown>,
              ) === 'danger'
                ? 'error'
                : cellTone(
                      columnOf(String(column.key)),
                      record as Record<string, unknown>,
                    ) === 'success'
                  ? 'success'
                  : 'default'
            "
          >
            {{ text }}
          </Tag>
          <span
            v-else
            :class="
              toneClass(
                cellTone(
                  columnOf(String(column.key)),
                  record as Record<string, unknown>,
                ),
              )
            "
          >
            {{ text }}
          </span>
        </template>
      </template>
      <template v-if="Object.keys(summary).length" #summary>
        <Table.Summary.Row>
          <Table.Summary.Cell
            v-for="(col, index) in tableColumns"
            :key="col.key"
            :index="index"
          >
            <span
              v-if="col.key === tableColumns[0]?.key"
              class="text-xs text-muted-foreground"
            >
              筛选合计
            </span>
            <span
              v-else-if="
                col.key !== 'actions' && columnOf(String(col.key))?.summaryFn
              "
            >
              {{ summaryText(columnOf(String(col.key))) }}
            </span>
          </Table.Summary.Cell>
        </Table.Summary.Row>
      </template>
    </Table>

    <Drawer v-model:open="advancedOpen" title="更多条件" width="560">
      <p class="mb-3 text-xs text-muted-foreground">
        用「全部满足 / 任一满足」组合条件，不必填写编号公式。空值会被忽略。
      </p>
      <FilterGroupEditor
        v-model:model-value="advancedGroup"
        :field-options="fieldOptions"
      />
      <div class="mt-4 flex justify-end gap-2">
        <Button
          @click="
            () => {
              advancedGroup = emptyGroup();
            }
          "
        >
          清空
        </Button>
        <Button
          type="primary"
          @click="
            () => {
              advancedOpen = false;
              runQuery();
            }
          "
        >
          应用
        </Button>
      </div>
    </Drawer>

    <Drawer
      v-model:open="drawerOpen"
      :title="
        formMode === 'create' ? '新增' : formMode === 'update' ? '编辑' : '详情'
      "
      width="520"
    >
      <Form layout="vertical">
        <Form.Item
          v-for="field in visibleFields"
          :key="field.field"
          :label="field.title || field.field"
          :required="isRequired(field)"
        >
          <Switch
            v-if="field.control === 'switch'"
            :checked="!!formRecord[field.field]"
            :disabled="isReadonly(field)"
            @update:checked="(v) => (formRecord[field.field] = v)"
          />
          <InputNumber
            v-else-if="field.control === 'number'"
            :disabled="isReadonly(field)"
            :value="Number(formRecord[field.field] ?? 0)"
            class="w-full"
            @update:value="(v) => (formRecord[field.field] = v)"
          />
          <DatePicker
            v-else-if="field.control === 'date'"
            :disabled="isReadonly(field)"
            :value="toDatePickerValue(formRecord[field.field], 'date')"
            class="w-full"
            value-format="YYYY-MM-DD"
            @update:value="(v) => (formRecord[field.field] = v || '')"
          />
          <DatePicker
            v-else-if="field.control === 'datetime'"
            :disabled="isReadonly(field)"
            :value="toDatePickerValue(formRecord[field.field], 'datetime')"
            class="w-full"
            show-time
            value-format="YYYY-MM-DD HH:mm:ss"
            @update:value="(v) => (formRecord[field.field] = v || '')"
          />
          <Input.TextArea
            v-else-if="field.control === 'textarea'"
            :disabled="isReadonly(field)"
            :value="String(formRecord[field.field] ?? '')"
            :rows="3"
            @update:value="(v) => (formRecord[field.field] = v)"
          />
          <Input
            v-else
            :disabled="isReadonly(field)"
            :value="String(formRecord[field.field] ?? '')"
            @update:value="(v) => (formRecord[field.field] = v)"
          />
        </Form.Item>
      </Form>
      <div v-if="formMode !== 'detail'" class="mt-4 flex justify-end">
        <Button :loading="saving" type="primary" @click="submitForm">
          提交
        </Button>
      </div>
    </Drawer>
  </Page>
</template>
