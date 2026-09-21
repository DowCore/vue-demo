<script lang="ts" setup>
import type { AppResource } from '#/api/saas/orchestration';
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
  Select,
  Space,
  Switch,
} from 'ant-design-vue';

import {
  getAppResourceApi,
  publishAppResourceApi,
  updateAppResourceApi,
} from '#/api/saas/orchestration';
import FilterGroupEditor from '#/views/orchestration/shared/filter-group-editor.vue';
import { ensureGroup } from '#/views/orchestration/shared/filter-model';

defineOptions({ name: 'OrchestrationResourceEditor' });

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const resource = ref<AppResource | null>(null);

const fieldOptions = computed(() =>
  (resource.value?.listView.columns || []).map((c) => ({
    label: c.title || c.field,
    value: c.field,
  })),
);

const dataScope = computed({
  get: () => ensureGroup(resource.value?.filter.dataScope),
  set: (value: FilterNode) => {
    if (resource.value) {
      resource.value.filter.dataScope = value;
    }
  },
});

async function load() {
  const id = String(route.query.id || '');
  if (!id) {
    message.warning('缺少资源 Id');
    return;
  }
  loading.value = true;
  try {
    resource.value = await getAppResourceApi(id);
    resource.value.filter.searchForm ??= { columns: 3, fields: [] };
    resource.value.filter.dataScope = ensureGroup(
      resource.value.filter.dataScope,
    );
    resource.value.filter.advancedFilter ??= true;
  } finally {
    loading.value = false;
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

function addSearchField() {
  if (!resource.value) return;
  resource.value.filter.searchForm ??= { columns: 3, fields: [] };
  const i = resource.value.filter.searchForm.fields.length + 1;
  resource.value.filter.searchForm.fields.push({
    key: `f${i}`,
    field: fieldOptions.value[0]?.value || '',
    title: '条件',
    op: 'eq',
    control: 'input',
  });
}

function removeSearchField(index: number) {
  resource.value?.filter.searchForm?.fields.splice(index, 1);
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
            打开运行时
          </Button>
        </AccessControl>
      </Space>
    </div>

    <Form v-if="resource" class="max-w-5xl" layout="vertical">
      <Form.Item label="名称">
        <Input v-model:value="resource.name" />
      </Form.Item>
      <Form.Item label="标题字段">
        <Input v-model:value="resource.titleField" class="font-mono" />
      </Form.Item>
      <div class="mb-2 text-sm font-medium">五个 flowKey</div>
      <div class="grid gap-3 md:grid-cols-2">
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
      </div>

      <Form.Item label="列表分页大小">
        <InputNumber
          v-model:value="resource.listView.pageSize"
          :max="200"
          :min="1"
        />
      </Form.Item>
      <Form.Item label="默认排序">
        <Input
          v-model:value="resource.listView.defaultSorting"
          class="font-mono"
          placeholder="CreationTime desc"
        />
      </Form.Item>

      <div class="mb-2 mt-4 text-sm font-medium">
        数据范围（隐藏条件，用户不可改）
      </div>
      <FilterGroupEditor
        v-model:model-value="dataScope"
        :field-options="fieldOptions"
      />

      <div class="mb-2 mt-4 flex items-center justify-between">
        <div class="text-sm font-medium">查询表单</div>
        <Button size="small" @click="addSearchField">添加字段</Button>
      </div>
      <p class="mb-2 text-xs text-muted-foreground">
        运行时以表单查询为主。空控件不参与条件；同一「任一满足组名」的字段会按
        OR 组合。
      </p>
      <div class="mb-2 flex items-center gap-2 text-sm">
        允许更多条件
        <Switch v-model:checked="resource.filter.advancedFilter" />
      </div>
      <div class="space-y-2">
        <div
          v-for="(field, index) in resource.filter.searchForm?.fields || []"
          :key="field.key"
          class="grid items-center gap-2 rounded-md border border-border p-2 md:grid-cols-6"
        >
          <Input v-model:value="field.title" placeholder="标题" />
          <Select
            v-model:value="field.field"
            :options="fieldOptions"
            class="w-full"
            placeholder="字段"
          />
          <Select
            v-model:value="field.control"
            :options="[
              { label: '文本', value: 'input' },
              { label: '数字', value: 'number' },
              { label: '数字区间', value: 'numberRange' },
              { label: '日期', value: 'date' },
              { label: '日期区间', value: 'dateRange' },
              { label: '开关', value: 'switch' },
            ]"
            class="w-full"
          />
          <Select
            v-model:value="field.op"
            :options="[
              { label: '等于', value: 'eq' },
              { label: '包含', value: 'contains' },
              { label: '介于', value: 'between' },
              { label: '大于等于', value: 'gte' },
            ]"
            class="w-full"
          />
          <Input v-model:value="field.orGroup" placeholder="任一满足组名" />
          <Button
            danger
            size="small"
            type="text"
            @click="removeSearchField(index)"
          >
            删除
          </Button>
        </div>
      </div>

      <div class="mb-2 mt-4 text-sm font-medium">列表列</div>
      <div class="space-y-2">
        <div
          v-for="col in resource.listView.columns"
          :key="col.field"
          class="grid items-center gap-2 rounded-md border border-border p-2 md:grid-cols-6"
        >
          <Input v-model:value="col.title" placeholder="标题" />
          <Input :value="col.field" class="font-mono" disabled />
          <Select
            v-model:value="col.formatPreset"
            :options="[
              { label: '文本', value: 'text' },
              { label: '日期', value: 'date' },
              { label: '时间', value: 'datetime' },
              { label: '金额', value: 'currency' },
              { label: '数字', value: 'number' },
              { label: '是否', value: 'boolean' },
            ]"
            allow-clear
            class="w-full"
          />
          <Select
            v-model:value="col.render"
            :options="[
              { label: '文本', value: 'text' },
              { label: '标签', value: 'tag' },
            ]"
            class="w-full"
          />
          <Select
            v-model:value="col.summaryFn"
            :options="[
              { label: '无汇总', value: undefined },
              { label: '合计', value: 'sum' },
              { label: '平均', value: 'avg' },
              { label: '计数', value: 'count' },
            ]"
            allow-clear
            class="w-full"
            placeholder="汇总"
            size="small"
          />
          <div class="flex items-center gap-2 text-sm">
            可见 <Switch v-model:checked="col.visible" /> 排序
            <Switch v-model:checked="col.sortable" />
          </div>
        </div>
      </div>

      <div class="mb-2 mt-4 text-sm font-medium">表单字段</div>
      <div class="space-y-2">
        <div
          v-for="field in resource.form.fields"
          :key="field.field"
          class="grid items-center gap-2 rounded-md border border-border p-2 sm:grid-cols-4"
        >
          <div>
            <div class="font-mono text-xs">{{ field.field }}</div>
            <Input v-model:value="field.title" size="small" />
          </div>
          <div class="text-xs">
            新增可见
            <Switch v-model:checked="field.visibleOnCreate" size="small" />
          </div>
          <div class="text-xs">
            编辑可见
            <Switch v-model:checked="field.visibleOnUpdate" size="small" />
          </div>
          <div class="text-xs">
            编辑只读
            <Switch v-model:checked="field.readonlyOnUpdate" size="small" />
          </div>
        </div>
      </div>
    </Form>
  </Page>
</template>
