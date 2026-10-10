<script lang="ts" setup>
import type {
  ActionDef,
  AppResource,
  ListColumnDef,
  NamedDict,
  ReportDefinition,
} from '#/api/saas/orchestration';
import type { FilterNode } from '#/views/orchestration/shared/filter-model';

import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Button, Drawer, message, Modal, Space, Table } from 'ant-design-vue';

import {
  createAppResourceRecordApi,
  deleteAppResourceRecordApi,
  getAppResourceRecordApi,
  getPublishedAppResourceApi,
  getPublishedReportApi,
  queryReportApi,
  updateAppResourceRecordApi,
} from '#/api/saas/orchestration';
import FilterGroupEditor from '#/views/orchestration/shared/filter-group-editor.vue';
import {
  emptyGroup,
  mergeAnd,
  pruneFilter,
  searchFormToFilter,
} from '#/views/orchestration/shared/filter-model';
import { validateFormFields } from '#/views/orchestration/shared/form-validation';
import {
  estimateTableScrollX,
  formatCellDisplay,
  pickRecordValue,
} from '#/views/orchestration/shared/format-cell';
import FormattedCell from '#/views/orchestration/shared/formatted-cell.vue';
import {
  actionFormKey,
  actionPlacement,
  actionSupportsMultiSelect,
  formOverlayHost,
  formPagePath,
  migrateActions,
  resolveActionOpen,
} from '#/views/orchestration/shared/open-action';
import {
  collectFilterFields,
  sanitizeFilterNode,
  sanitizeSorting,
} from '#/views/orchestration/shared/query-guard';
import RecordFormOverlay from '#/views/orchestration/shared/record-form-overlay.vue';
import {
  buildActionLogicPayload,
  invokeActionFlow,
  isDirectFlowAction,
} from '#/views/orchestration/shared/run-action-flow';
import SearchFormPanel from '#/views/orchestration/shared/search-form-panel.vue';

defineOptions({ name: 'AppReportRuntime' });

/**
 * 运行报表所需的权限码。
 * 与 `reports/index.vue`、`reports/editor.vue` 的「运行」按钮保持一致，
 * 避免"菜单/按钮隐藏了，但直接敲 /app/reports/:code 仍能进来"。
 */
const RUN_REPORT_CODE = 'Orchestration.Reports.Execute';

const route = useRoute();
const { hasAccessByCodes } = useAccess();

/**
 * 运行态入口鉴权（SEC-05）。
 *
 * 说明：前端校验只能收敛入口，**数据级权限必须由后端强制执行**；
 * 无权限时给出可见提示，而不是静默空白页。
 */
const canRun = computed(() => hasAccessByCodes([RUN_REPORT_CODE]));
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const report = ref<null | ReportDefinition>(null);
const resource = ref<AppResource | null>(null);
const rows = ref<Record<string, unknown>[]>([]);
const total = ref(0);
const summary = ref<Record<string, unknown>>({});
const page = reactive({ current: 1, pageSize: 20 });
const sorting = ref('');
const searchValues = ref<Record<string, unknown>>({});
const advancedOpen = ref(false);
const advancedGroup = ref<FilterNode>(emptyGroup());
const activePreset = ref('');
const drawerOpen = ref(false);
const formHost = ref<'drawer' | 'modal'>('drawer');
const formMode = ref<'create' | 'detail' | 'update'>('create');
const formRecord = ref<Record<string, unknown>>({});
const editingId = ref('');
const concurrencyStamp = ref('');
const whitelistFields = ref<null | string[]>(null);
const selectedIds = ref<string[]>([]);

const code = computed(() => String(route.params.code || ''));
const resourceCode = computed(
  () => report.value?.resourceCode || resource.value?.code || '',
);
const sourceLabel = computed(() => {
  const row = report.value;
  if (!row) return '';
  if (row.description) return row.description;
  if (row.kind === 'table') {
    return [row.dataSourceCode, row.tableName].filter(Boolean).join('.');
  }
  if (row.kind === 'flow') return row.queryFlowKey || '';
  return row.resourceCode || '';
});

const fieldOptions = computed(() =>
  (report.value?.columns || []).map((c) => ({
    label: c.title || c.field,
    value: c.field,
  })),
);

const searchFields = computed(() => report.value?.searchForm?.fields || []);

const visibleColumns = computed(() =>
  (report.value?.columns || []).filter((c) => c.visible !== false),
);

const toolbarActions = computed(() =>
  (report.value?.actions || []).filter(
    (a) => actionPlacement(a) === 'toolbar' && !actionSupportsMultiSelect(a),
  ),
);

const rowActions = computed(() =>
  (report.value?.actions || []).filter((a) => actionPlacement(a) === 'row'),
);

const batchActions = computed(() =>
  (report.value?.actions || []).filter((a) => actionSupportsMultiSelect(a)),
);

const showRowSelection = computed(
  () => !!(report.value?.selectionEnabled || batchActions.value.length > 0),
);

const tableColumns = computed(() => {
  const cols = visibleColumns.value.map((c) => ({
    title: c.title || c.field,
    dataIndex: c.field,
    key: c.field,
    width: c.width,
    align: (c.align as 'center' | 'left' | 'right') || 'left',
    sorter: !!c.sortable,
    ellipsis: !!c.ellipsis,
    fixed:
      c.fixed === 'left' || c.fixed === 'right'
        ? (c.fixed as 'left' | 'right')
        : undefined,
    customRender: ({ record }: { record: Record<string, unknown> }) =>
      formatCellDisplay(
        pickRecordValue(record, c.field),
        c,
        record,
        dictionaries.value,
      ),
  }));
  if (rowActions.value.length > 0) {
    cols.push({
      title: '操作',
      dataIndex: '_actions',
      key: 'actions',
      width: Math.min(88 + rowActions.value.length * 52, 280),
      align: 'left' as const,
      sorter: false,
      ellipsis: false,
      fixed: 'right' as const,
      customRender: (_args: { record: Record<string, unknown> }) => '',
    });
  }
  return cols;
});

const tableScrollX = computed(() =>
  estimateTableScrollX(
    visibleColumns.value,
    rowActions.value.length > 0
      ? Math.min(88 + rowActions.value.length * 52, 280)
      : 0,
  ),
);

const dictionaries = computed<NamedDict[]>(() => {
  const local = report.value?.dictionaries || [];
  if (local.length > 0) return local;
  return resource.value?.listView?.dictionaries || [];
});

const kpis = computed(() => {
  const cards = report.value?.kpis || [];
  if (cards.length > 0) return cards;
  return visibleColumns.value
    .filter((c) => c.summaryFn)
    .map((c) => ({ title: c.title, field: c.field, fn: c.summaryFn || 'sum' }));
});

const formTitle = computed(() => modeTitle(formMode.value));

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

function rowId(row: Record<string, unknown>) {
  return String(pickRecordValue(row, 'Id') ?? pickRecordValue(row, 'id') ?? '');
}

function modeTitle(mode: string) {
  if (mode === 'create') return '新增';
  if (mode === 'update') return '编辑';
  return '详情';
}

function formRecordId(formKey: string, row?: Record<string, unknown>) {
  if (formKey === 'create' || !row) return undefined;
  return rowId(row);
}

function columnOf(key: string): ListColumnDef | undefined {
  return visibleColumns.value.find((c) => c.field === key);
}

function summaryText(col: ListColumnDef | undefined) {
  if (!col) return '';
  const slot = summary.value[col.field] as Record<string, unknown> | undefined;
  if (!slot) return '';
  const fn = col.summaryFn || 'sum';
  const raw = slot[fn] ?? slot.sum ?? slot.count;
  if (raw === undefined || raw === null) return '';
  return `${fn.toUpperCase()} ${formatCellDisplay(raw, col, {}, dictionaries.value)}`;
}

function kpiText(item: { field: string; fn: string }) {
  if (item.fn === 'count') {
    const count = summary.value._count;
    return count === undefined || count === null ? '—' : String(count);
  }
  const slot = summary.value[item.field] as Record<string, unknown> | undefined;
  const raw = slot?.[item.fn] ?? slot?.sum;
  return raw === undefined || raw === null ? '—' : String(raw);
}

/** 查询入参白名单：报表列 + 表单字段 + 配置中声明的筛选字段（不含用户临时输入）。 */
const allowedQueryFields = computed(() => {
  const fields = new Set<string>();
  const current = report.value;
  if (current) {
    for (const column of current.columns || []) {
      if (column.field) fields.add(column.field);
    }
    for (const field of current.form?.fields || []) {
      if (field.field) fields.add(field.field);
    }
    for (const field of current.searchForm?.fields || []) {
      if (field.field) fields.add(field.field);
    }
    for (const preset of current.presets || []) {
      collectFilterFields(preset.filter, fields);
    }
    collectFilterFields(current.dataScope, fields);
  }
  const bound = resource.value;
  if (bound) {
    for (const column of bound.listView.columns || []) {
      if (column.field) fields.add(column.field);
    }
    for (const field of bound.form.fields || []) {
      if (field.field) fields.add(field.field);
    }
    if (bound.titleField) fields.add(bound.titleField);
  }
  return fields;
});

function currentFilter(): FilterNode | undefined {
  const formTree = searchFormToFilter(searchFields.value, searchValues.value);
  const advanced = pruneFilter(advancedGroup.value);
  const preset = report.value?.presets?.find(
    (p) => p.key === activePreset.value,
  );
  return mergeAnd([
    formTree,
    advanced,
    preset ? pruneFilter(preset.filter) : undefined,
  ]);
}

async function loadReport() {
  report.value = await getPublishedReportApi(code.value);
  report.value.actions = migrateActions(report.value.actions);
  report.value.dictionaries ??= [];
  page.pageSize = report.value.pageSize || 20;
  sorting.value = report.value.defaultSorting || '';
  searchValues.value = {};
  advancedGroup.value = emptyGroup();
  activePreset.value = '';
  if (report.value.resourceCode) {
    try {
      resource.value = await getPublishedAppResourceApi(
        report.value.resourceCode,
      );
    } catch {
      resource.value = null;
    }
  } else {
    resource.value = null;
  }
}

async function loadRows() {
  if (!report.value) return;
  loading.value = true;
  try {
    const res = await queryReportApi(report.value.code, {
      page: page.current,
      pageSize: page.pageSize,
      sorting: sanitizeSorting(sorting.value, allowedQueryFields.value),
      filter: sanitizeFilterNode(currentFilter(), allowedQueryFields.value),
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
    summary.value = (data.summary || {}) as Record<string, unknown>;
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

function openFormPage(action: ActionDef, row?: Record<string, unknown>) {
  const formKey = actionFormKey(action);
  router.push(
    formPagePath({
      source: 'report',
      code: code.value,
      formKey,
      id: formRecordId(formKey, row),
    }),
  );
}

function openCreate(action?: ActionDef) {
  if (action && resolveActionOpen(action) === 'page') {
    openFormPage(action);
    return;
  }
  formMode.value = 'create';
  editingId.value = '';
  formRecord.value = {};
  whitelistFields.value = null;
  formHost.value = formOverlayHost(action);
  drawerOpen.value = true;
}

/** 把服务端记录映射进表单，并刷新乐观锁 stamp。 */
function applyRecordToForm(record: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const field of resource.value?.form.fields || []) {
    next[field.field] = pickRecordValue(record, field.field);
  }
  formRecord.value = next;
  concurrencyStamp.value = String(
    pickRecordValue(record, 'ConcurrencyStamp') ?? '',
  );
}

/** 并发冲突判定（各后端文案不一，这里做宽松匹配）。 */
function isConcurrencyConflict(error?: string): boolean {
  const text = String(error || '').toLowerCase();
  return (
    text.includes('concurrency') ||
    text.includes('conflict') ||
    text.includes('并发') ||
    text.includes('已被修改')
  );
}

/** 冲突后重新拉取最新记录，使用户下一次提交携带最新 stamp。 */
async function refreshEditingRecord() {
  if (!resourceCode.value || !editingId.value) return;
  const res = await getAppResourceRecordApi(
    resourceCode.value,
    editingId.value,
  );
  if (!res.success) return;
  const payload = (res.data || {}) as { record?: Record<string, unknown> };
  const record = payload.record || (res.data as Record<string, unknown>);
  applyRecordToForm(record);
}

async function openEdit(
  row: Record<string, unknown>,
  mode: 'detail' | 'update',
  action?: ActionDef,
) {
  if (!resourceCode.value) {
    message.warning('该报表未绑定资源，不能打开表单');
    return;
  }
  const id = rowId(row);
  const res = await getAppResourceRecordApi(resourceCode.value, id);
  if (!res.success) {
    message.error(res.error || '读取失败');
    return;
  }
  const payload = (res.data || {}) as { record?: Record<string, unknown> };
  const record = payload.record || (res.data as Record<string, unknown>);
  formMode.value = mode;
  editingId.value = id;
  applyRecordToForm(record);
  whitelistFields.value =
    action?.fieldsMode === 'whitelist' ? action.fields || [] : null;
  formHost.value = formOverlayHost(action);
  drawerOpen.value = true;
}

async function runRowAction(action: ActionDef, row: Record<string, unknown>) {
  if (action.kind === 'delete') {
    confirmDelete(row, action);
    return;
  }
  if (isDirectFlowAction(action)) {
    const id = rowId(row);
    await invokeActionFlow(
      action,
      buildActionLogicPayload({
        action,
        resourceCode: resourceCode.value,
        reportCode: code.value,
        row,
        ids: id ? [id] : undefined,
      }),
      { onRefresh: loadRows },
    );
    return;
  }
  const open = resolveActionOpen(action);
  if (open === 'page') {
    openFormPage(action, row);
    return;
  }
  if (action.kind === 'update' || action.kind === 'detail') {
    await openEdit(row, action.kind === 'detail' ? 'detail' : 'update', action);
    return;
  }
  if (open === 'drawer' || open === 'modal') {
    await openEdit(
      row,
      action.formMode === 'detail' ? 'detail' : 'update',
      action,
    );
    return;
  }
  message.info(`按钮「${action.label}」请绑定新标签页、抽屉或增删改类型`);
}

async function runToolbarAction(action: ActionDef) {
  if (action.kind === 'create') {
    openCreate(action);
    return;
  }
  if (isDirectFlowAction(action)) {
    await invokeActionFlow(
      action,
      buildActionLogicPayload({
        action,
        resourceCode: resourceCode.value,
        reportCode: code.value,
      }),
      { onRefresh: loadRows },
    );
    return;
  }
  if (resolveActionOpen(action) === 'page') {
    openFormPage(action);
    return;
  }
  message.info(`工具栏按钮「${action.label}」暂未配置`);
}

async function runBatchAction(action: ActionDef) {
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
          await deleteAppResourceRecordApi(resourceCode.value, id);
        }
        selectedIds.value = [];
        await loadRows();
      },
    });
    return;
  }
  if (isDirectFlowAction(action) || action.kind === 'custom') {
    const limit = action.batchLimit || 100;
    const ids = selectedIds.value.slice(0, limit);
    const selectedRows = rows.value.filter((r) => ids.includes(rowId(r)));
    const ok = await invokeActionFlow(
      action,
      buildActionLogicPayload({
        action,
        resourceCode: resourceCode.value,
        reportCode: code.value,
        ids,
        rows: selectedRows,
      }),
      { onRefresh: loadRows },
    );
    if (ok) selectedIds.value = [];
    return;
  }
  message.info(`批量按钮「${action.label}」请绑定 flowKey`);
}

async function submitForm() {
  if (!resourceCode.value) return;
  if (formMode.value !== 'detail') {
    const err = validateFormFields(
      visibleFields.value,
      formRecord.value,
      formMode.value,
    );
    if (err) {
      message.warning(err);
      return;
    }
  }
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      const res = await createAppResourceRecordApi(resourceCode.value, {
        record: formRecord.value,
      });
      if (!res.success) {
        message.error(res.error || '新增失败');
        return;
      }
      message.success('已新增');
    } else if (formMode.value === 'update') {
      const res = await updateAppResourceRecordApi(resourceCode.value, {
        id: editingId.value,
        concurrencyStamp: concurrencyStamp.value || undefined,
        record: formRecord.value,
      });
      if (!res.success) {
        if (isConcurrencyConflict(res.error)) {
          message.warning(
            '该记录已被他人修改，已加载最新数据，请确认后重新提交',
          );
          await refreshEditingRecord();
          return;
        }
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
  Modal.confirm({
    title: action?.confirmText || '确认删除该记录？',
    okType: 'danger',
    async onOk() {
      const res = await deleteAppResourceRecordApi(
        resourceCode.value,
        rowId(row),
      );
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
    if (!code.value || !canRun.value) return;
    await loadReport();
    page.current = 1;
    await loadRows();
  },
);

onMounted(async () => {
  if (!code.value || !canRun.value) return;
  await loadReport();
  await loadRows();
});

onActivated(() => {
  if (report.value && canRun.value) loadRows();
});
</script>

<template>
  <Page :description="sourceLabel" :title="report?.name || '报表'">
    <!-- SEC-05：入口鉴权。下面所有根级内容都必须带 v-if="canRun"，否则等于绕过菜单直达运行时。 -->
    <div
      v-if="!canRun"
      class="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground"
    >
      你没有运行该报表的权限（需要 {{ RUN_REPORT_CODE }}），请联系管理员分配。
    </div>
    <div v-if="canRun && kpis.length" class="mb-4 grid gap-3 sm:grid-cols-4">
      <div
        v-for="item in kpis"
        :key="item.title + item.field"
        class="rounded-lg border border-border p-3"
      >
        <div class="text-xs text-muted-foreground">{{ item.title }}</div>
        <div class="mt-1 text-lg font-medium">{{ kpiText(item) }}</div>
      </div>
    </div>

    <div
      v-if="canRun"
      class="mb-4 space-y-3 rounded-lg border border-border p-3"
    >
      <SearchFormPanel
        v-if="searchFields.length"
        v-model:model-value="searchValues"
        :fields="searchFields"
      />
      <div class="flex flex-wrap items-center gap-2">
        <Button type="primary" @click="runQuery">查询</Button>
        <Button @click="resetQuery">重置</Button>
        <Button
          v-if="report?.advancedFilter !== false"
          @click="advancedOpen = true"
        >
          更多条件
        </Button>
        <Button
          v-for="chip in report?.presets || []"
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
      v-if="canRun"
      :columns="tableColumns"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: tableScrollX }"
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
        showRowSelection
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
      <template #bodyCell="{ column, record }">
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
        <FormattedCell
          v-else-if="columnOf(String(column.key))"
          :column="columnOf(String(column.key))!"
          :dictionaries="dictionaries"
          :record="record as Record<string, unknown>"
        />
      </template>
      <template v-if="Object.keys(summary).length" #summary>
        <Table.Summary.Row>
          <Table.Summary.Cell
            v-for="(col, index) in tableColumns"
            :key="col.key"
            :index="index + (showRowSelection ? 1 : 0)"
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

    <Drawer
      v-if="canRun"
      v-model:open="advancedOpen"
      title="更多条件"
      width="560"
    >
      <p class="mb-3 text-xs text-muted-foreground">
        「全部满足 / 任一满足」组合条件，无需填写 1 and (2 or 3)。
      </p>
      <FilterGroupEditor
        v-model:model-value="advancedGroup"
        :field-options="fieldOptions"
      />
      <div class="mt-4 flex justify-end gap-2">
        <Button @click="advancedGroup = emptyGroup()">清空</Button>
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

    <RecordFormOverlay
      v-if="canRun"
      v-model:model-value="formRecord"
      v-model:open="drawerOpen"
      :fields="visibleFields"
      :host="formHost"
      :mode="formMode"
      :saving="saving"
      :title="formTitle"
      @submit="submitForm"
    />
  </Page>
</template>
