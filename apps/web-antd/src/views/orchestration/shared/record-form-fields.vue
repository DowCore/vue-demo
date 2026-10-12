<script lang="ts" setup>
/**
 * 表单字段基础控件库（被 FormSchemaRenderer 调用）
 * 设计态 designer=true；运行/预览 designer=false，仅按 FormFieldDef JSON 渲染
 */
import type { FormFieldDef } from '#/api/saas/orchestration';

import { onMounted, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Cascader,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Rate,
  Select,
  Slider,
  Switch,
  Table,
  TimePicker,
  TreeSelect,
  Upload,
} from 'ant-design-vue';

import {
  appliedSetValue,
  isDisabledByDependencies,
  isEnabledByDependencies,
  isHiddenByDependencies,
  isOptionalByDependencies,
  isRequiredByDependencies,
} from './form-dependencies';
import { isFieldRequired } from './form-validation';
import { toDatePickerValue } from './format-cell';
import {
  isOptionWidget,
  resolveOptionSource,
  templateFields,
} from './option-source';
import { safeJsonStringify } from './safe-json';
import { useOptionSources } from './use-option-sources';

defineOptions({ name: 'RecordFormFields' });

const props = withDefaults(
  defineProps<{
    fields: FormFieldDef[];
    mode: 'create' | 'detail' | 'update';
    modelValue: Record<string, unknown>;
    designer?: boolean;
    selectedField?: string;
    fieldPermissions?: Record<string, string>;
  }>(),
  {
    designer: false,
    selectedField: '',
    fieldPermissions: () => ({}),
  },
);

const emit = defineEmits<{
  select: [field: string];
  'update:modelValue': [value: Record<string, unknown>];
}>();

/**
 * 选项数据源：字段级统一取数（静态 / 内置用户、部门 / 逻辑编排）。
 * 原先用户与部门在这里各自硬编码调身份接口，现在和其它选项控件走同一条链路。
 */
const {
  errors: optionErrors,
  nodes: optionNodes,
  refresh: refreshOptions,
} = useOptionSources(() =>
  props.fields
    .filter((field) => isOptionWidget(field.control))
    .map((field) => ({
      key: field.field,
      optionItems: field.controlProps?.options,
      scope: { field: field.field, form: props.modelValue },
      source: resolveOptionSource(field.control, field.controlProps),
    })),
);

function fieldNodes(key: string): any[] {
  return optionNodes.value[key] || [];
}

/**
 * 字段实际渲染用的选项。
 *
 * 只有「静态来源且没配过选项」才退化为演示项（沿用旧行为，避免设计态空白下拉）；
 * 动态来源（内置 / 流程）未就绪或失败时**不塞演示数据**，否则会把故障伪装成正常。
 */
function fieldOptions(field: FormFieldDef): any[] {
  const nodes = fieldNodes(field.field);
  if (nodes.length > 0) return nodes;
  if (
    resolveOptionSource(field.control, field.controlProps).kind !== 'static'
  ) {
    return [];
  }
  if (field.control === 'radio') {
    return [
      { label: '是 / 选项 A', value: 'A' },
      { label: '否 / 选项 B', value: 'B' },
    ];
  }
  if (field.control === 'select') {
    return [
      { label: '选项 1', value: 'opt1' },
      { label: '选项 2', value: 'opt2' },
    ];
  }
  if (field.control === 'checkbox') {
    return [
      { label: '选项 A', value: 'A' },
      { label: '选项 B', value: 'B' },
    ];
  }
  return [];
}

/** 被 `{{字段}}` 引用的字段值拼接，用于判断是否需要重新取数 */
function watchedValues(): string {
  const watched = new Set<string>();
  for (const field of props.fields) {
    if (!isOptionWidget(field.control)) continue;
    for (const name of templateFields(
      resolveOptionSource(field.control, field.controlProps).params,
    )) {
      watched.add(name);
    }
  }
  return [...watched]
    .map((name) => safeJsonStringify(props.modelValue[name]))
    .join('|');
}

onMounted(() => {
  void refreshOptions();
});

watch(watchedValues, () => {
  void refreshOptions();
});

watch(
  () => props.modelValue,
  (model) => {
    if (props.designer) return;
    const next = { ...model };
    let changed = false;
    for (const field of props.fields) {
      const value = appliedSetValue(field.dependencies, model);
      if (value === undefined || next[field.field] === value) continue;
      next[field.field] = value;
      changed = true;
    }
    if (changed) emit('update:modelValue', next);
  },
  { deep: true },
);

function patch(field: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [field]: value });
}

function keepUploadName(field: string, file: { name: string }) {
  patch(field, file.name);
  return false;
}

function isDependencyHidden(field: FormFieldDef): boolean {
  return isHiddenByDependencies(field.dependencies, props.modelValue);
}

function isDependencyReadonly(field: FormFieldDef): boolean {
  return isDisabledByDependencies(field.dependencies, props.modelValue);
}

function isDependencyRequired(field: FormFieldDef): boolean {
  return isRequiredByDependencies(field.dependencies, props.modelValue);
}

function isReadonly(field: FormFieldDef) {
  const perm = props.fieldPermissions?.[field.field];
  if (perm === 'read') return true;
  if (perm === 'write' || perm === 'required') return false;
  if (isEnabledByDependencies(field.dependencies, props.modelValue)) {
    return false;
  }
  if (isDependencyReadonly(field)) return true;
  if (props.mode === 'detail') return true;
  if (props.mode === 'create') return !!field.readonlyOnCreate;
  return !!field.readonlyOnUpdate;
}

function isVisible(field: FormFieldDef) {
  const perm = props.fieldPermissions?.[field.field];
  if (perm === 'hide') return false;
  if (isDependencyHidden(field)) return false;
  if (props.mode === 'create') return field.visibleOnCreate !== false;
  if (props.mode === 'update') return field.visibleOnUpdate !== false;
  return field.visibleOnDetail !== false;
}

function isFieldMandatory(field: FormFieldDef) {
  const perm = props.fieldPermissions?.[field.field];
  if (perm === 'required') return true;
  if (isOptionalByDependencies(field.dependencies, props.modelValue)) {
    return false;
  }
  if (isDependencyRequired(field)) return true;
  return isFieldRequired(field, props.mode);
}

function spanClass(field: FormFieldDef) {
  const span =
    field.span ||
    (field.control === 'textarea' || isCollection(field) ? 24 : 12);
  if (span >= 24) return 'col-span-24';
  if (span >= 16) return 'col-span-16';
  if (span >= 12) return 'col-span-12';
  if (span >= 8) return 'col-span-8';
  return 'col-span-12';
}

function isCollection(field: FormFieldDef) {
  return ['list', 'table', 'tree'].includes(field.control);
}

function onCellClick(field: string, e: MouseEvent) {
  if (!props.designer) return;
  e.stopPropagation();
  emit('select', field);
}

function asRows(field: FormFieldDef): Record<string, unknown>[] {
  const raw = props.modelValue[field.field];
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

function emptyRow(field: FormFieldDef): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const c of field.children || []) {
    row[c.field] = c.control === 'switch' ? false : '';
  }
  if (field.control === 'tree') {
    const key = field.treeChildrenField || 'children';
    row[key] = [];
  }
  return row;
}

function addRow(field: FormFieldDef) {
  if (isReadonly(field) || props.designer) return;
  const rows = [...asRows(field)];
  if (
    field.maxItems !== undefined &&
    field.maxItems !== null &&
    rows.length >= field.maxItems
  ) {
    return;
  }
  rows.push(emptyRow(field));
  patch(field.field, rows);
}

function removeRow(field: FormFieldDef, index: number) {
  if (isReadonly(field) || props.designer) return;
  const rows = [...asRows(field)];
  if (
    field.minItems !== undefined &&
    field.minItems !== null &&
    rows.length <= field.minItems
  ) {
    return;
  }
  rows.splice(index, 1);
  patch(field.field, rows);
}

function patchRow(
  field: FormFieldDef,
  index: number,
  col: string,
  value: unknown,
) {
  const rows = asRows(field).map((r, i) =>
    i === index ? { ...r, [col]: value } : { ...r },
  );
  patch(field.field, rows);
}

function tableColumns(field: FormFieldDef) {
  const cols = (field.children || []).map((c) => ({
    title: c.title || c.field,
    dataIndex: c.field,
    key: c.field,
  }));
  if (!isReadonly(field) && !props.designer) {
    cols.push({ title: '操作', dataIndex: '_op', key: '_op' });
  }
  return cols;
}
</script>

<template>
  <div class="form-grid grid grid-cols-24 gap-x-4 gap-y-3">
    <div
      v-for="field in fields.filter(isVisible)"
      :key="field.field"
      class="form-cell relative min-w-0"
      :class="[
        spanClass(field),
        designer ? 'designer-cell' : '',
        designer && selectedField === field.field ? 'is-selected' : '',
      ]"
      :data-field-key="field.field"
      @click="onCellClick(field.field, $event)"
    >
      <button
        v-if="designer"
        class="drag-handle absolute -left-1 top-6 z-10 cursor-grab rounded border border-border bg-background p-0.5 text-muted-foreground opacity-70 hover:opacity-100 active:cursor-grabbing"
        type="button"
        title="拖动排序"
        @click.stop
      >
        <IconifyIcon class="size-3.5" icon="lucide:grip-vertical" />
      </button>
      <div
        class="mb-1 flex items-center gap-1 text-xs"
        :class="designer ? 'text-foreground' : 'text-muted-foreground'"
      >
        <span>{{ field.title || field.field }}</span>
        <span v-if="isFieldMandatory(field)" class="text-red-500">*</span>
        <span
          v-if="designer && isCollection(field)"
          class="rounded bg-primary/10 px-1 text-[10px] text-primary"
        >
          {{ field.control }}
        </span>
        <span
          v-if="designer"
          class="ml-auto font-mono text-[10px] text-muted-foreground"
        >
          {{ field.span || (isCollection(field) ? 24 : 12) }}/24
        </span>
      </div>

      <div
        v-if="optionErrors[field.field]"
        class="mb-1 text-[11px] text-red-500"
      >
        选项数据源：{{ optionErrors[field.field] }}
      </div>

      <!-- 明细表格 -->
      <div
        v-if="field.control === 'table'"
        class="rounded border border-border"
      >
        <Table
          :columns="tableColumns(field)"
          :data-source="
            designer
              ? [emptyRow(field)]
              : asRows(field).length
                ? asRows(field)
                : []
          "
          :pagination="false"
          row-key="__i"
          size="small"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === '_op'">
              <Button
                danger
                size="small"
                type="link"
                @click="removeRow(field, index)"
              >
                删
              </Button>
            </template>
            <template v-else-if="!designer">
              <Input
                size="small"
                :disabled="isReadonly(field)"
                :value="
                  String(
                    (record as Record<string, unknown>)[column.key as string] ??
                      '',
                  )
                "
                @update:value="
                  (v) => patchRow(field, index, String(column.key), v)
                "
              />
            </template>
            <template v-else>
              <span class="text-[11px] text-muted-foreground">列预览</span>
            </template>
          </template>
        </Table>
        <div
          v-if="!designer && !isReadonly(field)"
          class="border-t border-border p-2"
        >
          <Button size="small" type="dashed" block @click="addRow(field)">
            添加行
          </Button>
        </div>
        <div
          v-else-if="designer"
          class="border-t border-border p-2 text-[11px] text-muted-foreground"
        >
          明细列 {{ (field.children || []).length }} 个 · 在右侧配置列
        </div>
      </div>

      <!-- 可重复列表块 -->
      <div v-else-if="field.control === 'list'" class="space-y-2">
        <div
          v-for="(row, index) in designer ? [emptyRow(field)] : asRows(field)"
          :key="index"
          class="rounded border border-dashed border-border p-3"
        >
          <div class="mb-2 flex items-center justify-between text-xs">
            <span>第 {{ index + 1 }} 项</span>
            <Button
              v-if="!designer && !isReadonly(field)"
              danger
              size="small"
              type="text"
              @click="removeRow(field, index)"
            >
              删除
            </Button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div
              v-for="col in field.children || []"
              :key="col.field"
              class="min-w-0"
            >
              <div class="mb-0.5 text-[11px] text-muted-foreground">
                {{ col.title || col.field }}
              </div>
              <Input
                size="small"
                :disabled="designer || isReadonly(field)"
                :placeholder="col.placeholder"
                :value="
                  designer
                    ? ''
                    : String((row as Record<string, unknown>)[col.field] ?? '')
                "
                @update:value="(v) => patchRow(field, index, col.field, v)"
              />
            </div>
          </div>
        </div>
        <Button
          v-if="!designer && !isReadonly(field)"
          size="small"
          type="dashed"
          block
          @click="addRow(field)"
        >
          添加一项
        </Button>
        <p v-if="designer" class="text-[11px] text-muted-foreground">
          重复块 · 子字段 {{ (field.children || []).length }} 个
        </p>
      </div>

      <!-- 树形明细 -->
      <div
        v-else-if="field.control === 'tree'"
        class="rounded border border-dashed border-border p-3"
      >
        <p class="text-xs text-muted-foreground">
          树形明细（子节点字段：{{ field.treeChildrenField || 'children' }}）·
          列 {{ (field.children || []).length }} 个
        </p>
        <div
          v-if="designer"
          class="mt-2 space-y-1 text-[11px] text-muted-foreground"
        >
          <div
            v-for="col in field.children || []"
            :key="col.field"
            class="font-mono"
          >
            {{ col.field }} · {{ col.control }}
          </div>
        </div>
        <div v-else class="mt-2 space-y-2">
          <div
            v-for="(row, index) in asRows(field)"
            :key="index"
            class="rounded bg-muted/30 p-2"
          >
            <div
              v-for="col in field.children || []"
              :key="col.field"
              class="mb-1"
            >
              <span class="text-[11px] text-muted-foreground">{{ col.title }}：</span>
              <Input
                size="small"
                class="mt-0.5"
                :disabled="isReadonly(field)"
                :value="String(row[col.field] ?? '')"
                @update:value="(v) => patchRow(field, index, col.field, v)"
              />
            </div>
            <Button
              v-if="!isReadonly(field)"
              danger
              size="small"
              type="link"
              @click="removeRow(field, index)"
            >
              删除节点
            </Button>
          </div>
          <Button
            v-if="!isReadonly(field)"
            size="small"
            type="dashed"
            block
            @click="addRow(field)"
          >
            添加根节点
          </Button>
        </div>
      </div>

      <Switch
        v-else-if="field.control === 'switch'"
        :checked="!!modelValue[field.field]"
        :disabled="isReadonly(field) || designer"
        @update:checked="(v) => patch(field.field, v)"
      />
      <InputNumber
        v-else-if="field.control === 'number'"
        :disabled="isReadonly(field) || designer"
        :placeholder="field.placeholder || (designer ? field.title : undefined)"
        :value="
          modelValue[field.field] == null || modelValue[field.field] === ''
            ? undefined
            : Number(modelValue[field.field])
        "
        class="w-full"
        @update:value="(v) => patch(field.field, v)"
      />
      <DatePicker
        v-else-if="field.control === 'date'"
        :disabled="isReadonly(field) || designer"
        :placeholder="field.placeholder"
        :value="toDatePickerValue(modelValue[field.field], 'date')"
        class="w-full"
        value-format="YYYY-MM-DD"
        @update:value="(v) => patch(field.field, v || '')"
      />
      <DatePicker
        v-else-if="field.control === 'datetime'"
        :disabled="isReadonly(field) || designer"
        :placeholder="field.placeholder"
        :value="toDatePickerValue(modelValue[field.field], 'datetime')"
        class="w-full"
        show-time
        value-format="YYYY-MM-DD HH:mm:ss"
        @update:value="(v) => patch(field.field, v || '')"
      />
      <Input.TextArea
        v-else-if="field.control === 'textarea'"
        :disabled="isReadonly(field) || designer"
        :placeholder="field.placeholder"
        :rows="3"
        :value="String(modelValue[field.field] ?? '')"
        @update:value="(v) => patch(field.field, v)"
      />
      <Select
        v-else-if="field.control === 'userPicker'"
        :disabled="isReadonly(field) || designer"
        :mode="field.controlProps?.multiple ? 'multiple' : undefined"
        :options="fieldNodes(field.field)"
        :placeholder="field.placeholder || '选择用户'"
        :value="modelValue[field.field] as any"
        show-search
        class="w-full"
        @update:value="(v) => patch(field.field, v)"
      />
      <TreeSelect
        v-else-if="field.control === 'deptPicker'"
        :disabled="isReadonly(field) || designer"
        :field-names="{ children: 'children', label: 'label', value: 'value' }"
        :multiple="!!field.controlProps?.multiple"
        :placeholder="field.placeholder || '选择部门'"
        :tree-data="fieldNodes(field.field)"
        :value="modelValue[field.field] as any"
        allow-clear
        class="w-full"
        show-search
        tree-default-expand-all
        @update:value="(v) => patch(field.field, v)"
      />
      <Select
        v-else-if="field.control === 'select'"
        :disabled="isReadonly(field) || designer"
        :placeholder="field.placeholder || '请选择'"
        :value="modelValue[field.field] as any"
        :options="fieldOptions(field)"
        class="w-full"
        @update:value="(v) => patch(field.field, v)"
      />
      <Radio.Group
        v-else-if="field.control === 'radio'"
        :disabled="isReadonly(field) || designer"
        :value="modelValue[field.field] as any"
        :options="fieldOptions(field)"
        @update:value="
          (v) =>
            patch(field.field, (v as any)?.target ? (v as any).target.value : v)
        "
      />
      <Checkbox.Group
        v-else-if="field.control === 'checkbox'"
        :disabled="isReadonly(field) || designer"
        :value="(modelValue[field.field] as any) || []"
        :options="fieldOptions(field)"
        @update:value="(v) => patch(field.field, v)"
      />
      <Cascader
        v-else-if="field.control === 'cascader'"
        :disabled="isReadonly(field) || designer"
        :field-names="{ children: 'children', label: 'label', value: 'value' }"
        :options="fieldNodes(field.field)"
        :placeholder="field.placeholder || '请选择'"
        :value="(modelValue[field.field] as any) || []"
        class="w-full"
        @update:value="(v) => patch(field.field, v)"
      />
      <Rate
        v-else-if="field.control === 'rate'"
        :disabled="isReadonly(field) || designer"
        :value="Number(modelValue[field.field] || 0)"
        @update:value="(v) => patch(field.field, v)"
      />
      <Input
        v-else-if="field.control === 'password'"
        type="password"
        :disabled="isReadonly(field) || designer"
        :placeholder="field.placeholder"
        :value="String(modelValue[field.field] ?? '')"
        @update:value="(v) => patch(field.field, v)"
      />
      <TimePicker
        v-else-if="field.control === 'time'"
        class="w-full"
        value-format="HH:mm:ss"
        :disabled="isReadonly(field) || designer"
        :placeholder="field.placeholder || '选择时间'"
        :value="(modelValue[field.field] as string) || undefined"
        @update:value="(v) => patch(field.field, v || '')"
      />
      <DatePicker.RangePicker
        v-else-if="field.control === 'dateRange'"
        class="w-full"
        value-format="YYYY-MM-DD"
        :disabled="isReadonly(field) || designer"
        :value="
          Array.isArray(modelValue[field.field])
            ? (modelValue[field.field] as [string, string])
            : undefined
        "
        @update:value="(v) => patch(field.field, v || [])"
      />
      <Slider
        v-else-if="field.control === 'slider'"
        :disabled="isReadonly(field) || designer"
        :value="Number(modelValue[field.field] || 0)"
        @update:value="(v) => patch(field.field, v)"
      />
      <div
        v-else-if="field.control === 'upload'"
        class="flex items-center gap-2"
      >
        <Input
          :disabled="isReadonly(field) || designer"
          :placeholder="field.placeholder || '附件名称'"
          :value="String(modelValue[field.field] ?? '')"
          class="flex-1"
          @update:value="(v) => patch(field.field, v)"
        />
        <Upload
          :before-upload="
            (file: { name: string }) => keepUploadName(field.field, file)
          "
          :disabled="isReadonly(field) || designer"
          :show-upload-list="false"
        >
          <Button size="small" :disabled="isReadonly(field) || designer">
            选择文件
          </Button>
        </Upload>
      </div>
      <Input
        v-else
        :disabled="isReadonly(field) || designer"
        :placeholder="field.placeholder"
        :value="String(modelValue[field.field] ?? '')"
        @update:value="(v) => patch(field.field, v)"
      />
    </div>
  </div>
</template>

<style scoped>
.grid-cols-24 {
  grid-template-columns: repeat(24, minmax(0, 1fr));
}

.col-span-8 {
  grid-column: span 8 / span 8;
}

.col-span-12 {
  grid-column: span 12 / span 12;
}

.col-span-16 {
  grid-column: span 16 / span 16;
}

.col-span-24 {
  grid-column: span 24 / span 24;
}

.designer-cell {
  padding: 8px 8px 8px 14px;
  border: 1px dashed transparent;
  border-radius: 6px;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}

.designer-cell:hover {
  background: hsl(var(--muted) / 35%);
  border-color: hsl(var(--border));
}

.designer-cell.is-selected {
  background: hsl(var(--primary) / 6%);
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsl(var(--primary) / 35%);
}

@media (max-width: 768px) {
  .col-span-8,
  .col-span-12,
  .col-span-16,
  .col-span-24 {
    grid-column: span 24 / span 24;
  }
}
</style>
