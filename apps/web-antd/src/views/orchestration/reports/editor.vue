<script lang="ts" setup>
import type { ReportDefinition } from '#/api/saas/orchestration';
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
  getReportApi,
  publishReportApi,
  updateReportApi,
} from '#/api/saas/orchestration';
import FilterGroupEditor from '#/views/orchestration/shared/filter-group-editor.vue';
import { ensureGroup } from '#/views/orchestration/shared/filter-model';
import {
  formatDictMap,
  parseDictMap,
} from '#/views/orchestration/shared/format-cell';

defineOptions({ name: 'OrchestrationReportEditor' });

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const report = ref<null | ReportDefinition>(null);

const fieldOptions = computed(() =>
  (report.value?.columns || []).map((c) => ({
    label: c.title || c.field,
    value: c.field,
  })),
);

const dataScope = computed({
  get: () => ensureGroup(report.value?.dataScope),
  set: (value: FilterNode) => {
    if (report.value) report.value.dataScope = value;
  },
});

async function load() {
  const id = String(route.query.id || '');
  if (!id) {
    message.warning('缺少报表 Id');
    return;
  }
  loading.value = true;
  try {
    report.value = await getReportApi(id);
    report.value.dataScope = ensureGroup(report.value.dataScope);
    report.value.searchForm ??= { columns: 3, fields: [] };
    report.value.presets ??= [];
    report.value.advancedFilter ??= true;
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!report.value) return;
  saving.value = true;
  try {
    report.value = await updateReportApi(report.value.id, {
      name: report.value.name,
      kind: report.value.kind,
      resourceCode: report.value.resourceCode,
      queryFlowKey: report.value.queryFlowKey,
      dataScope: report.value.dataScope,
      searchForm: report.value.searchForm,
      advancedFilter: report.value.advancedFilter,
      presets: report.value.presets,
      kpis: report.value.kpis,
      columns: report.value.columns,
      actions: report.value.actions,
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
  message.success('已发布，可挂到菜单「报表运行时」路由 /app/reports/{编码}');
}

function addSearchField() {
  if (!report.value) return;
  report.value.searchForm ??= { columns: 3, fields: [] };
  const i = report.value.searchForm.fields.length + 1;
  report.value.searchForm.fields.push({
    key: `f${i}`,
    field: fieldOptions.value[0]?.value || '',
    title: '条件',
    op: 'eq',
    control: 'input',
  });
}

function removeSearchField(index: number) {
  report.value?.searchForm?.fields.splice(index, 1);
}

onMounted(load);
</script>

<template>
  <Page
    :description="report ? report.resourceCode || report.kind : '加载中'"
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
            打开运行时
          </Button>
        </AccessControl>
      </Space>
    </div>

    <Form v-if="report" class="max-w-5xl" layout="vertical">
      <Form.Item label="名称">
        <Input v-model:value="report.name" />
      </Form.Item>
      <Form.Item label="说明">
        <Input v-model:value="report.description" />
      </Form.Item>
      <div class="grid gap-3 md:grid-cols-2">
        <Form.Item label="queryFlowKey">
          <Input v-model:value="report.queryFlowKey" class="font-mono" />
        </Form.Item>
        <Form.Item label="默认排序">
          <Input v-model:value="report.defaultSorting" class="font-mono" />
        </Form.Item>
      </div>
      <Form.Item label="分页大小">
        <InputNumber v-model:value="report.pageSize" :max="200" :min="1" />
      </Form.Item>
      <div class="mb-2 flex items-center gap-2 text-sm">
        允许更多条件
        <Switch v-model:checked="report.advancedFilter" />
        多选行
        <Switch v-model:checked="report.selectionEnabled" />
      </div>

      <div class="mb-2 mt-4 text-sm font-medium">
        数据范围（用户不可见，隐藏条件）
      </div>
      <FilterGroupEditor
        v-model:model-value="dataScope"
        :field-options="fieldOptions"
      />

      <div class="mb-2 mt-6 flex items-center justify-between">
        <div class="text-sm font-medium">
          查询表单（普通人填表即筛，空着不算）
        </div>
        <Button size="small" @click="addSearchField">添加字段</Button>
      </div>
      <div class="space-y-2">
        <div
          v-for="(field, index) in report.searchForm?.fields || []"
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

      <div class="mb-2 mt-6 text-sm font-medium">列（转换 / 着色 / 汇总）</div>
      <div class="space-y-2">
        <div
          v-for="col in report.columns"
          :key="col.field"
          class="grid items-center gap-2 rounded-md border border-border p-2 md:grid-cols-8"
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
            class="w-full"
            allow-clear
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
              { label: '无汇总', value: '' },
              { label: '合计', value: 'sum' },
              { label: '平均', value: 'avg' },
              { label: '计数', value: 'count' },
              { label: '最小', value: 'min' },
              { label: '最大', value: 'max' },
            ]"
            allow-clear
            class="w-full"
            placeholder="汇总"
          />
          <div class="flex items-center gap-1 text-xs">
            可见 <Switch v-model:checked="col.visible" size="small" />
          </div>
          <Input
            :value="formatDictMap(col.dictMap)"
            placeholder="字典 Approved:已审"
            size="small"
            @update:value="(v) => (col.dictMap = parseDictMap(String(v || '')))"
          />
          <Input
            :value="col.styleRules?.[0]?.value || ''"
            placeholder="着色值，如 Approved"
            size="small"
            @update:value="
              (v) => {
                col.styleRules = v
                  ? [
                      {
                        op: 'eq',
                        value: String(v),
                        tone: 'success',
                        target: 'cell',
                      },
                    ]
                  : [];
              }
            "
          />
        </div>
      </div>

      <div class="mb-2 mt-6 text-sm font-medium">按钮</div>
      <div class="space-y-2">
        <div
          v-for="action in report.actions"
          :key="action.key"
          class="grid items-center gap-2 rounded-md border border-border p-2 md:grid-cols-6"
        >
          <Input v-model:value="action.label" placeholder="标题" />
          <Select
            v-model:value="action.scene"
            :options="[
              { label: '工具栏', value: 'toolbar' },
              { label: '行', value: 'row' },
              { label: '批量', value: 'batch' },
            ]"
            class="w-full"
          />
          <Select
            v-model:value="action.kind"
            :options="[
              { label: '新增', value: 'create' },
              { label: '编辑', value: 'update' },
              { label: '详情', value: 'detail' },
              { label: '删除', value: 'delete' },
              { label: '自定义', value: 'custom' },
            ]"
            class="w-full"
          />
          <Select
            v-model:value="action.open"
            :options="[
              { label: '抽屉', value: 'drawer' },
              { label: '弹窗', value: 'modal' },
              { label: '无表单', value: 'none' },
            ]"
            class="w-full"
          />
          <Select
            v-model:value="action.fieldsMode"
            :options="[
              { label: '多字段表单', value: 'full' },
              { label: '指定字段', value: 'whitelist' },
            ]"
            class="w-full"
          />
          <Input
            :value="(action.fields || []).join(',')"
            placeholder="单列字段，逗号分隔"
            @update:value="
              (v) => {
                action.fields = String(v || '')
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean);
              }
            "
          />
        </div>
      </div>
    </Form>
  </Page>
</template>
