<script lang="ts" setup>
import type {
  AppResource,
  DbQueryObject,
  FormDef,
  ListColumnDef,
  NamedDict,
  TableColumn,
} from '#/api/saas/orchestration';
import type { FilterNode } from '#/views/orchestration/shared/filter-model';

import { computed, onMounted, ref } from 'vue';
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
  Space,
  Switch,
  Tabs,
} from 'ant-design-vue';

import {
  getAppResourceApi,
  publishAppResourceApi,
  refreshQueryObjectApi,
  updateAppResourceApi,
} from '#/api/saas/orchestration';
import ActionListEditor from '#/views/orchestration/shared/action-list-editor.vue';
import ColumnDisplayEditor from '#/views/orchestration/shared/column-display-editor.vue';
import DictCatalogEditor from '#/views/orchestration/shared/dict-catalog-editor.vue';
import FilterGroupEditor from '#/views/orchestration/shared/filter-group-editor.vue';
import { ensureGroup } from '#/views/orchestration/shared/filter-model';
import FormLayoutDesigner from '#/views/orchestration/shared/form-layout-designer.vue';
import { applyColumnLayoutDefaults } from '#/views/orchestration/shared/format-cell';
import { migrateActions } from '#/views/orchestration/shared/open-action';
import SearchFieldList from '#/views/orchestration/shared/search-field-list.vue';

defineOptions({ name: 'OrchestrationResourceEditor' });

const route = useRoute();
const router = useRouter();
const saving = ref(false);
const syncing = ref(false);
const resource = ref<AppResource | null>(null);
const tab = ref('query');

const fieldOptions = computed(() =>
  (resource.value?.listView.columns || []).map((c) => ({
    label: c.title || c.field,
    value: c.field,
  })),
);

const dataScope = computed({
  get: () => ensureGroup(resource.value?.filter.dataScope),
  set: (value: FilterNode) => {
    if (resource.value) resource.value.filter.dataScope = value;
  },
});

const searchFields = computed({
  get: () => resource.value?.filter.searchForm?.fields || [],
  set: (value) => {
    if (!resource.value) return;
    resource.value.filter.searchForm = {
      columns: resource.value.filter.searchForm?.columns || 3,
      fields: value,
    };
  },
});

const columnsModel = computed({
  get: () => resource.value?.listView.columns || [],
  set: (value) => {
    if (resource.value) resource.value.listView.columns = value;
  },
});

const actionsModel = computed({
  get: () => resource.value?.listView.actions || [],
  set: (value) => {
    if (resource.value) resource.value.listView.actions = value;
  },
});

const formModel = computed({
  get: (): FormDef => resource.value?.form || { fields: [] },
  set: (value: FormDef) => {
    if (resource.value) resource.value.form = value;
  },
});

const resourceFlowsModel = computed({
  get: () =>
    resource.value
      ? {
          queryFlowKey: resource.value.queryFlowKey,
          getFlowKey: resource.value.getFlowKey,
          createFlowKey: resource.value.createFlowKey,
          updateFlowKey: resource.value.updateFlowKey,
          deleteFlowKey: resource.value.deleteFlowKey,
        }
      : undefined,
  set: (value) => {
    if (!resource.value || !value) return;
    if (value.queryFlowKey !== undefined && value.queryFlowKey !== null) {
      resource.value.queryFlowKey = value.queryFlowKey;
    }
    if (value.getFlowKey !== undefined && value.getFlowKey !== null) {
      resource.value.getFlowKey = value.getFlowKey;
    }
    if (value.createFlowKey !== undefined && value.createFlowKey !== null) {
      resource.value.createFlowKey = value.createFlowKey;
    }
    if (value.updateFlowKey !== undefined && value.updateFlowKey !== null) {
      resource.value.updateFlowKey = value.updateFlowKey;
    }
    if (value.deleteFlowKey !== undefined && value.deleteFlowKey !== null) {
      resource.value.deleteFlowKey = value.deleteFlowKey;
    }
  },
});

const dictionariesModel = computed({
  get: (): NamedDict[] => resource.value?.listView.dictionaries || [],
  set: (value: NamedDict[]) => {
    if (resource.value) resource.value.listView.dictionaries = value;
  },
});

async function load() {
  const id = String(route.query.id || '');
  if (!id) {
    message.warning('缺少资源 Id');
    return;
  }
  resource.value = await getAppResourceApi(id);
  resource.value.filter.searchForm ??= { columns: 3, fields: [] };
  resource.value.filter.dataScope = ensureGroup(
    resource.value.filter.dataScope,
  );
  resource.value.filter.advancedFilter ??= true;
  resource.value.listView.dictionaries ??= [];
  resource.value.listView.actions = migrateActions(
    resource.value.listView.actions,
  );
}

function controlOf(type?: string, procedure = false) {
  switch (type) {
    case 'boolean': {
      return { op: 'eq', control: 'switch' };
    }
    case 'int':
    case 'long':
    case 'decimal': {
      return procedure
        ? { op: 'eq', control: 'number' }
        : { op: 'between', control: 'numberRange' };
    }
    case 'date':
    case 'datetime': {
      return procedure
        ? { op: 'eq', control: 'date' }
        : { op: 'between', control: 'dateRange' };
    }
    default: {
      return procedure
        ? { op: 'eq', control: 'input' }
        : { op: 'contains', control: 'input' };
    }
  }
}

function listFormat(type: string | undefined) {
  if (type === 'datetime') return 'datetime';
  if (type === 'date') return 'date';
  if (type === 'decimal') return 'currency';
  if (type === 'boolean') return 'boolean';
  if (type === 'int' || type === 'long') return 'number';
  return 'text';
}

function formControl(type: string | undefined) {
  if (type === 'boolean') return 'switch';
  if (type === 'int' || type === 'long' || type === 'decimal') return 'number';
  if (type === 'date') return 'date';
  if (type === 'datetime') return 'datetime';
  if (type === 'text') return 'textarea';
  return 'input';
}

function toListColumn(column: TableColumn): ListColumnDef {
  return applyColumnLayoutDefaults({
    field: column.name,
    title: column.displayName || column.name,
    visible: true,
    sortable: true,
    formatPreset: listFormat(column.platformType),
  });
}

async function syncColumns() {
  if (!resource.value?.queryObjectId) {
    message.warning('当前资源没有关联视图或存储过程，无法同步列');
    return;
  }
  syncing.value = true;
  try {
    const queryObject: DbQueryObject = await refreshQueryObjectApi(
      resource.value.queryObjectId,
    );
    const columns = queryObject.columns || [];
    if (columns.length === 0) {
      message.warning(
        queryObject.importWarning ||
          '数据库没有返回可用列。请确认账号能查看该视图的列，然后重试。',
      );
      return;
    }
    resource.value.listView.columns = columns.map((item) => toListColumn(item));
    const procedure = resource.value.sourceKind === 'procedure';
    const searchSource = procedure
      ? (queryObject.parameters || [])
          .filter((item) => item.direction !== 'out')
          .slice(0, 8)
          .map((item) => ({
            name: item.name,
            title: item.displayName || item.name,
            platformType: item.platformType,
          }))
      : columns.slice(0, 5).map((item) => ({
          name: item.name,
          title: item.displayName || item.name,
          platformType: item.platformType,
        }));
    resource.value.filter.searchForm = {
      columns: 3,
      fields: searchSource.map((item, index) => {
        const control = controlOf(item.platformType, procedure);
        return {
          key: `f${index + 1}`,
          field: item.name,
          title: item.title,
          op: control.op,
          control: control.control,
          span: 1,
        };
      }),
    };
    resource.value.form.fields = columns.map((item) => ({
      field: item.name,
      title: item.displayName || item.name,
      control: formControl(item.platformType),
      visibleOnCreate: false,
      visibleOnUpdate: false,
      visibleOnDetail: true,
      readonlyOnCreate: true,
      readonlyOnUpdate: true,
    }));
    message.success(`已从数据库同步 ${columns.length} 列，请保存`);
  } finally {
    syncing.value = false;
  }
}

async function save() {
  if (!resource.value) return;
  saving.value = true;
  try {
    resource.value = await updateAppResourceApi(resource.value.id, {
      name: resource.value.name,
      titleField: resource.value.titleField,
      filter: resource.value.filter,
      listView: resource.value.listView,
      form: resource.value.form,
      queryFlowKey: resource.value.queryFlowKey,
      getFlowKey: resource.value.getFlowKey,
      createFlowKey: resource.value.createFlowKey,
      updateFlowKey: resource.value.updateFlowKey,
      deleteFlowKey: resource.value.deleteFlowKey,
    });
    message.success('已保存');
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!resource.value) return;
  await save();
  resource.value = await publishAppResourceApi(resource.value.id);
  message.success('已发布');
}

onMounted(load);
</script>

<template>
  <Page
    :description="
      resource ? `${resource.dataSourceCode}.${resource.tableName}` : '加载中'
    "
    :title="resource ? `资源配置 · ${resource.name}` : '资源配置'"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Button type="text" @click="router.push('/orchestration/resources')">
        <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
        返回
      </Button>
      <Space>
        <AccessControl :codes="['Orchestration.Resources.Update']" type="code">
          <Button :loading="saving" @click="save">保存</Button>
        </AccessControl>
        <AccessControl :codes="['Orchestration.Resources.Publish']" type="code">
          <Button type="primary" @click="publish">发布</Button>
        </AccessControl>
        <AccessControl :codes="['Orchestration.Resources.Execute']" type="code">
          <Button
            :disabled="resource?.status !== 1"
            @click="resource && router.push(`/app/${resource.code}`)"
          >
            打开列表
          </Button>
        </AccessControl>
      </Space>
    </div>

    <Tabs v-if="resource" v-model:active-key="tab">
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
          :columns="resource.listView.columns"
        />
        <div class="mt-4 flex items-center gap-2 text-sm">
          允许「更多条件」
          <Switch v-model:checked="resource.filter.advancedFilter" />
        </div>
      </Tabs.TabPane>
      <Tabs.TabPane key="columns" tab="列表列">
        <div v-if="resource.queryObjectId" class="mb-3">
          <Button :loading="syncing" type="primary" @click="syncColumns">
            从数据库同步列
          </Button>
        </div>
        <ColumnDisplayEditor
          v-model:model-value="columnsModel"
          v-model:dictionaries="dictionariesModel"
          :empty-text="
            resource.queryObjectId
              ? '还没有列。点「从数据库同步列」读取视图或存储过程的列，或填写字段名后添加。'
              : undefined
          "
          :hint="
            resource.queryObjectId
              ? '视图和存储过程的列以数据库为准。同步后记得保存。手工添加时必须先填字段名。'
              : undefined
          "
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="dicts" tab="通用字典">
        <DictCatalogEditor v-model:model-value="dictionariesModel" />
      </Tabs.TabPane>
      <Tabs.TabPane key="actions" tab="按钮">
        <ActionListEditor
          v-model:model-value="actionsModel"
          :columns="resource.listView.columns"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="form" tab="表单（可迁表单库）">
        <FormLayoutDesigner
          v-model:model-value="formModel"
          v-model:resource-flows="resourceFlowsModel"
          :columns="resource.listView.columns"
          :resource-code="resource.code"
          :code-prefix="resource.code"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="basic" tab="基本信息">
        <Form class="max-w-xl" layout="vertical">
          <Form.Item label="名称">
            <Input v-model:value="resource.name" />
          </Form.Item>
          <Form.Item label="标题字段">
            <Input v-model:value="resource.titleField" class="font-mono" />
          </Form.Item>
          <Form.Item label="默认排序">
            <Input
              v-model:value="resource.listView.defaultSorting"
              class="font-mono"
            />
          </Form.Item>
          <Form.Item label="分页大小">
            <InputNumber
              v-model:value="resource.listView.pageSize"
              :max="200"
              :min="1"
            />
          </Form.Item>
          <Form.Item label="queryFlowKey">
            <Input v-model:value="resource.queryFlowKey" class="font-mono" />
          </Form.Item>
          <Form.Item label="getFlowKey">
            <Input v-model:value="resource.getFlowKey" class="font-mono" />
          </Form.Item>
          <Form.Item label="createFlowKey">
            <Input v-model:value="resource.createFlowKey" class="font-mono" />
          </Form.Item>
          <Form.Item label="updateFlowKey">
            <Input v-model:value="resource.updateFlowKey" class="font-mono" />
          </Form.Item>
          <Form.Item label="deleteFlowKey">
            <Input v-model:value="resource.deleteFlowKey" class="font-mono" />
          </Form.Item>
        </Form>
      </Tabs.TabPane>
    </Tabs>
  </Page>
</template>
