<script lang="ts" setup>
import type {
  AppResource,
  DataSourceLookup,
  FormDef,
  ListColumnDef,
  NamedDict,
  ReportDefinition,
  ReusableFlowLookup,
  TableDefinition,
} from '#/api/saas/orchestration';
import type {
  FilterNode,
  SearchFormFieldDef,
} from '#/views/orchestration/shared/filter-model';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Tabs,
} from 'ant-design-vue';

import {
  getAppResourcesApi,
  getDataSourceLookupApi,
  getReportApi,
  getReusableFlowLookupApi,
  getTableDefinitionsApi,
  publishReportApi,
  updateReportApi,
} from '#/api/saas/orchestration';
import ActionListEditor from '#/views/orchestration/shared/action-list-editor.vue';
import ColumnDisplayEditor from '#/views/orchestration/shared/column-display-editor.vue';
import DictCatalogEditor from '#/views/orchestration/shared/dict-catalog-editor.vue';
import FilterGroupEditor from '#/views/orchestration/shared/filter-group-editor.vue';
import {
  applyQueryMode,
  ensureGroup,
  queryModeFromPreset,
} from '#/views/orchestration/shared/filter-model';
import FormLayoutDesigner from '#/views/orchestration/shared/form-layout-designer.vue';
import { applyColumnLayoutDefaults } from '#/views/orchestration/shared/format-cell';
import { migrateActions } from '#/views/orchestration/shared/open-action';
import SearchFieldList from '#/views/orchestration/shared/search-field-list.vue';

defineOptions({ name: 'OrchestrationReportEditor' });

const route = useRoute();
const router = useRouter();
const saving = ref(false);
const report = ref<null | ReportDefinition>(null);
const tab = ref('source');
const resources = ref<AppResource[]>([]);
const dataSources = ref<DataSourceLookup[]>([]);
const tables = ref<TableDefinition[]>([]);
const flows = ref<ReusableFlowLookup[]>([]);

const kindOptions = [
  { label: '资源表', value: 'resource' },
  { label: '数据源 + 表', value: 'table' },
  { label: '查询流', value: 'flow' },
];

const fieldOptions = computed(() =>
  (report.value?.columns || []).map((c) => ({
    label: c.title || c.field,
    value: c.field,
  })),
);

const sourceDescription = computed(() => {
  const row = report.value;
  if (!row) return '加载中';
  if (row.kind === 'table') {
    return (
      [row.dataSourceCode, row.tableName].filter(Boolean).join('.') || '物理表'
    );
  }
  if (row.kind === 'flow') return row.queryFlowKey || '查询流';
  return row.resourceCode || '资源';
});

const dataScope = computed({
  get: () => ensureGroup(report.value?.dataScope),
  set: (value: FilterNode) => {
    if (report.value) report.value.dataScope = value;
  },
});

const searchFields = computed({
  get: () => report.value?.searchForm?.fields || [],
  set: (value) => {
    if (!report.value) return;
    report.value.searchForm = {
      columns: report.value.searchForm?.columns || 3,
      fields: value,
    };
  },
});

const columnsModel = computed({
  get: () => report.value?.columns || [],
  set: (value) => {
    if (report.value) report.value.columns = value;
  },
});

const actionsModel = computed({
  get: () => report.value?.actions || [],
  set: (value) => {
    if (report.value) report.value.actions = value;
  },
});

const formModel = computed({
  get: (): FormDef => report.value?.form || { fields: [] },
  set: (value: FormDef) => {
    if (report.value) report.value.form = value;
  },
});

const dictionariesModel = computed({
  get: (): NamedDict[] => report.value?.dictionaries || [],
  set: (value: NamedDict[]) => {
    if (report.value) report.value.dictionaries = value;
  },
});

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function searchFieldsFromColumns(
  columns: ListColumnDef[],
): SearchFormFieldDef[] {
  return columns
    .filter((c) => c.visible !== false)
    .slice(0, 6)
    .map((c) => {
      const item: SearchFormFieldDef = {
        key: `f_${c.field}`,
        field: c.field,
        title: c.title || c.field,
        op: 'contains',
        control: 'input',
      };
      applyQueryMode(item, queryModeFromPreset(c.formatPreset));
      return item;
    });
}

function applyResourceUi(row: AppResource) {
  if (!report.value) return;
  const columns = cloneJson(row.listView?.columns || []);
  report.value.columns = columns;
  report.value.actions = migrateActions(cloneJson(row.listView?.actions || []));
  report.value.form = cloneJson(row.form || { fields: [] });
  report.value.dictionaries = cloneJson(row.listView?.dictionaries || []);
  report.value.defaultSorting = row.listView?.defaultSorting;
  report.value.pageSize = row.listView?.pageSize || report.value.pageSize || 20;
  const search = row.filter?.searchForm;
  report.value.searchForm = {
    columns: search?.columns || 3,
    fields: search?.fields?.length
      ? cloneJson(search.fields)
      : searchFieldsFromColumns(columns),
  };
}

function sourceIsEmpty() {
  const row = report.value;
  if (!row) return true;
  return (
    (row.columns || []).length === 0 &&
    (row.actions || []).length === 0 &&
    (row.searchForm?.fields || []).length === 0
  );
}

/** 表字段类型 → 列表格式化预设。 */
function formatPresetOf(type: string) {
  if (type === 'datetime') return 'datetime';
  if (type === 'date') return 'date';
  if (type === 'decimal') return 'currency';
  if (type === 'boolean') return 'boolean';
  if (type === 'int' || type === 'long') return 'number';
  return 'text';
}

function columnsFromTable(table: TableDefinition): ListColumnDef[] {
  return (table.columns || [])
    .filter((c) => c.origin !== 'convention' || c.name === 'CreationTime')
    .map((c) => {
      const type = (c.platformType || '').toLowerCase();
      return applyColumnLayoutDefaults({
        field: c.name,
        title: c.displayName,
        visible: true,
        sortable: [
          'date',
          'datetime',
          'decimal',
          'int',
          'long',
          'string',
        ].includes(type),
        formatPreset: formatPresetOf(type),
      });
    });
}

async function loadTables(dataSourceCode?: string) {
  if (!dataSourceCode) {
    tables.value = [];
    return;
  }
  const res = await getTableDefinitionsApi({
    dataSourceCode,
    maxResultCount: 200,
  });
  tables.value = res.items ?? [];
}

async function loadLookups() {
  const [resourceRes, dsRes, flowRes] = await Promise.all([
    getAppResourcesApi({ maxResultCount: 200 }),
    getDataSourceLookupApi(),
    getReusableFlowLookupApi(),
  ]);
  resources.value = resourceRes.items ?? [];
  dataSources.value = dsRes.items ?? [];
  flows.value = flowRes.items ?? [];
}

async function load() {
  const id = String(route.query.id || '');
  if (!id) {
    message.warning('缺少报表 Id');
    return;
  }
  await loadLookups();
  report.value = await getReportApi(id);
  report.value.dataScope = ensureGroup(report.value.dataScope);
  report.value.searchForm ??= { columns: 3, fields: [] };
  report.value.form ??= { fields: [] };
  report.value.dictionaries ??= [];
  report.value.presets ??= [];
  report.value.advancedFilter ??= true;
  report.value.queryFlowKey ||= 'sys.resource.query';
  report.value.actions = migrateActions(report.value.actions);
  await loadTables(report.value.dataSourceCode);
  if (report.value.resourceCode && sourceIsEmpty()) {
    const row = resources.value.find(
      (r) => r.code === report.value?.resourceCode,
    );
    if (row) applyResourceUi(row);
  }
}

watch(
  () => report.value?.dataSourceCode,
  async (code) => {
    if (!report.value || report.value.kind !== 'table') return;
    await loadTables(code);
  },
);

function onKindChange(kind: string) {
  if (!report.value) return;
  report.value.kind = kind;
  if (kind === 'table') {
    report.value.queryFlowKey ||= 'sys.resource.query';
  }
}

async function onPickResource(code: string) {
  if (!report.value) return;
  report.value.resourceCode = code || undefined;
  const row = resources.value.find((r) => r.code === code);
  if (!row || report.value.kind !== 'resource') return;
  report.value.dataSourceCode = row.dataSourceCode;
  report.value.tableName = row.tableName;
  report.value.queryFlowKey = row.queryFlowKey || report.value.queryFlowKey;
  if (sourceIsEmpty()) {
    applyResourceUi(row);
  }
}

function onPickWriteResource(code: string) {
  if (!report.value) return;
  report.value.resourceCode = code || undefined;
  const row = resources.value.find((r) => r.code === code);
  if (!row) return;
  const apply = () => {
    applyResourceUi(row);
    message.success('已带入该资源的列、查询条件和按钮');
    tab.value = 'query';
  };
  if (sourceIsEmpty()) {
    apply();
    return;
  }
  Modal.confirm({
    title: '用该资源的列、查询条件和按钮覆盖当前配置？',
    content:
      '查询源（查询流 / 物理表）保持不变，只带入页面上的列、筛选和按钮。',
    onOk: apply,
  });
}

function syncFromSource() {
  if (!report.value) return;
  if (report.value.kind === 'resource' || report.value.kind === 'flow') {
    const row = resources.value.find(
      (r) => r.code === report.value?.resourceCode,
    );
    if (!row) {
      message.warning(
        report.value.kind === 'flow'
          ? '查询流没有固定表结构。请绑定写入资源以带入列和按钮，或到「列表列 / 查询条件 / 按钮」手工添加。'
          : '请先选择资源',
      );
      return;
    }
    const apply = () => {
      applyResourceUi(row);
      message.success('已带入列、查询条件和按钮');
      tab.value = 'query';
    };
    if (sourceIsEmpty()) {
      apply();
      return;
    }
    Modal.confirm({
      title: '覆盖当前列、查询条件和按钮？',
      onOk: apply,
    });
    return;
  }

  const table = tables.value.find(
    (t) =>
      t.dataSourceCode === report.value?.dataSourceCode &&
      t.tableName === report.value?.tableName,
  );
  if (!table) {
    message.warning('请先选择数据源和物理表');
    return;
  }
  const write = resources.value.find(
    (r) => r.code === report.value?.resourceCode,
  );
  const apply = () => {
    if (!report.value) return;
    const columns = columnsFromTable(table);
    report.value.columns = columns;
    if ((report.value.searchForm?.fields || []).length === 0) {
      report.value.searchForm = {
        columns: report.value.searchForm?.columns || 3,
        fields: searchFieldsFromColumns(columns),
      };
    }
    if (write) {
      report.value.actions = migrateActions(
        cloneJson(write.listView?.actions || []),
      );
      report.value.form = cloneJson(write.form || { fields: [] });
    }
    message.success('已按物理表同步列和查询条件');
    tab.value = 'query';
  };
  if (sourceIsEmpty()) {
    apply();
    return;
  }
  Modal.confirm({
    title: '覆盖当前列配置？',
    onOk: apply,
  });
}

async function save() {
  if (!report.value) return;
  saving.value = true;
  try {
    report.value = await updateReportApi(report.value.id, {
      name: report.value.name,
      kind: report.value.kind,
      resourceCode: report.value.resourceCode,
      dataSourceCode: report.value.dataSourceCode,
      tableName: report.value.tableName,
      queryFlowKey: report.value.queryFlowKey,
      dataScope: report.value.dataScope,
      searchForm: report.value.searchForm,
      advancedFilter: report.value.advancedFilter,
      presets: report.value.presets,
      kpis: report.value.kpis,
      columns: report.value.columns,
      actions: report.value.actions,
      form: report.value.form,
      dictionaries: report.value.dictionaries,
      defaultSorting: report.value.defaultSorting,
      pageSize: report.value.pageSize,
      selectionEnabled: report.value.selectionEnabled,
      description: report.value.description,
    });
    message.success('已保存');
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!report.value) return;
  await save();
  report.value = await publishReportApi(report.value.id);
  message.success('已发布');
}

onMounted(load);
</script>

<template>
  <Page
    :description="sourceDescription"
    :title="report ? `报表配置 · ${report.name}` : '报表配置'"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Button type="text" @click="router.push('/orchestration/reports')">
        <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
        返回
      </Button>
      <Space>
        <AccessControl :codes="['Orchestration.Reports.Update']" type="code">
          <Button :loading="saving" @click="save">保存</Button>
        </AccessControl>
        <AccessControl :codes="['Orchestration.Reports.Publish']" type="code">
          <Button type="primary" @click="publish">发布</Button>
        </AccessControl>
        <AccessControl :codes="['Orchestration.Reports.Execute']" type="code">
          <Button
            :disabled="report?.status !== 1"
            @click="report && router.push(`/app/reports/${report.code}`)"
          >
            打开列表
          </Button>
        </AccessControl>
      </Space>
    </div>

    <Tabs v-if="report" v-model:active-key="tab">
      <Tabs.TabPane key="source" tab="查询源">
        <Form class="max-w-xl" layout="vertical">
          <Form.Item label="查询源类型">
            <Radio.Group
              :options="kindOptions"
              :value="report.kind"
              option-type="button"
              @update:value="(v) => onKindChange(String(v || 'resource'))"
            />
            <div class="mt-2 text-xs text-muted-foreground">
              查询源只决定数据从哪来，不替代查询条件和按钮。后面几个页签始终可以配置；也可以从资源带入一版再改。
            </div>
          </Form.Item>
          <Form.Item v-if="report.kind === 'resource'" label="资源" required>
            <Select
              :options="
                resources.map((r) => ({
                  label: `${r.name} (${r.code})`,
                  value: r.code,
                }))
              "
              :value="report.resourceCode"
              class="w-full"
              placeholder="选择资源"
              show-search
              @update:value="(v) => onPickResource(String(v || ''))"
            />
          </Form.Item>
          <template v-if="report.kind === 'table'">
            <Form.Item label="数据源" required>
              <Select
                v-model:value="report.dataSourceCode"
                :options="
                  dataSources.map((d) => ({
                    label: `${d.name} (${d.code})`,
                    value: d.code,
                  }))
                "
                class="w-full"
                placeholder="选择数据源"
                show-search
              />
            </Form.Item>
            <Form.Item label="物理表" required>
              <Select
                v-model:value="report.tableName"
                :options="
                  tables.map((t) => ({
                    label: `${t.displayName} (${t.tableName})`,
                    value: t.tableName,
                  }))
                "
                class="w-full"
                placeholder="选择已托管的表"
                show-search
              />
            </Form.Item>
          </template>
          <Form.Item
            :label="report.kind === 'flow' ? '查询流' : '查询流（可覆盖默认）'"
            :required="report.kind === 'flow'"
          >
            <Select
              v-model:value="report.queryFlowKey"
              :options="
                flows.map((f) => ({
                  label: `${f.name} (${f.code})`,
                  value: f.code,
                }))
              "
              class="w-full"
              placeholder="默认 sys.resource.query"
              show-search
            />
          </Form.Item>
          <Form.Item v-if="report.kind !== 'resource'" label="写入资源（可选）">
            <Select
              allow-clear
              :options="
                resources.map((r) => ({
                  label: `${r.name} (${r.code})`,
                  value: r.code,
                }))
              "
              :value="report.resourceCode || undefined"
              class="w-full"
              placeholder="行内增删改才需要绑定资源"
              show-search
              @update:value="(v) => onPickWriteResource(String(v || ''))"
            />
          </Form.Item>
          <Button type="primary" ghost @click="syncFromSource">
            带入列、查询条件和按钮
          </Button>
        </Form>
      </Tabs.TabPane>
      <Tabs.TabPane key="query" tab="查询条件">
        <div class="mb-4 rounded-md border border-border p-3">
          <div class="mb-2 text-sm font-medium">数据范围（用户不可见）</div>
          <FilterGroupEditor
            v-model:model-value="dataScope"
            :field-options="fieldOptions"
          />
        </div>
        <SearchFieldList
          v-model:model-value="searchFields"
          :columns="report.columns"
        />
        <div class="mt-4 flex items-center gap-2 text-sm">
          允许「更多条件」
          <Switch v-model:checked="report.advancedFilter" />
        </div>
      </Tabs.TabPane>
      <Tabs.TabPane key="columns" tab="列表列">
        <ColumnDisplayEditor
          v-model:model-value="columnsModel"
          v-model:dictionaries="dictionariesModel"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="dicts" tab="通用字典">
        <DictCatalogEditor v-model:model-value="dictionariesModel" />
      </Tabs.TabPane>
      <Tabs.TabPane key="actions" tab="按钮">
        <div class="mb-4 flex items-center gap-2 text-sm">
          列表显示勾选框
          <Switch v-model:checked="report.selectionEnabled" />
          <span class="text-xs text-muted-foreground">
            控制表格左侧是否出现多选框；与单个按钮是否支持多选无关。
          </span>
        </div>
        <ActionListEditor
          v-model:model-value="actionsModel"
          :columns="report.columns"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="form" tab="表单（可迁表单库）">
        <FormLayoutDesigner
          v-model:model-value="formModel"
          :columns="report.columns"
          :resource-code="report.resourceCode"
          :code-prefix="report.code || report.resourceCode"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="basic" tab="基本信息">
        <Form class="max-w-xl" layout="vertical">
          <Form.Item label="名称">
            <Input v-model:value="report.name" />
          </Form.Item>
          <Form.Item label="说明">
            <Input v-model:value="report.description" />
          </Form.Item>
          <Form.Item label="默认排序">
            <Input v-model:value="report.defaultSorting" class="font-mono" />
          </Form.Item>
          <Form.Item label="分页大小">
            <InputNumber v-model:value="report.pageSize" :max="200" :min="1" />
          </Form.Item>
        </Form>
      </Tabs.TabPane>
    </Tabs>
  </Page>
</template>
