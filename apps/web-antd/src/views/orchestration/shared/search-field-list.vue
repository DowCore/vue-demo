<script lang="ts" setup>
import type { SearchFormFieldDef } from './filter-model';

import type { ListColumnDef } from '#/api/saas/orchestration';

import { computed, ref } from 'vue';

import { Button, Checkbox, Input, Modal, Select } from 'ant-design-vue';

import {
  applyQueryMode,
  QUERY_MODES,
  queryModeFromPreset,
  queryModeOf,
} from './filter-model';

defineOptions({ name: 'SearchFieldList' });

const props = defineProps<{
  columns: ListColumnDef[];
  modelValue: SearchFormFieldDef[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: SearchFormFieldDef[]];
}>();

const pickerOpen = ref(false);
const picked = ref<string[]>([]);
const manualField = ref('');
const manualTitle = ref('');

const used = computed(() => new Set(props.modelValue.map((f) => f.field)));

const unusedColumns = computed(() =>
  props.columns.filter((c) => c.visible !== false && !used.value.has(c.field)),
);

function patch(next: SearchFormFieldDef[]) {
  emit('update:modelValue', next);
}

function setMode(index: number, mode: string) {
  const next = props.modelValue.map((f) => ({ ...f }));
  const field = next[index];
  if (!field) return;
  applyQueryMode(field, String(mode));
  patch(next);
}

function setField(index: number, key: keyof SearchFormFieldDef, value: string) {
  const next = props.modelValue.map((f) => ({ ...f }));
  const field = next[index];
  if (!field) return;
  (field as Record<string, unknown>)[key] = value;
  patch(next);
}

function removeAt(index: number) {
  patch(props.modelValue.filter((_, i) => i !== index));
}

function openPicker() {
  picked.value = [];
  pickerOpen.value = true;
}

function addManual() {
  const field = manualField.value.trim();
  if (!field || used.value.has(field)) return;
  const col = props.columns.find((c) => c.field === field);
  const item: SearchFormFieldDef = {
    key: `f_${field}_${Date.now().toString(36)}`,
    field,
    title: manualTitle.value.trim() || col?.title || field,
    op: 'contains',
    control: 'input',
  };
  applyQueryMode(item, queryModeFromPreset(col?.formatPreset));
  patch([...props.modelValue, item]);
  manualField.value = '';
  manualTitle.value = '';
}

function confirmPicker() {
  const extra: SearchFormFieldDef[] = [];
  for (const field of picked.value) {
    const col = props.columns.find((c) => c.field === field);
    if (!col) continue;
    const mode = queryModeFromPreset(col.formatPreset);
    const item: SearchFormFieldDef = {
      key: `f_${col.field}`,
      field: col.field,
      title: col.title || col.field,
      op: 'contains',
      control: 'input',
    };
    applyQueryMode(item, mode);
    extra.push(item);
  }
  patch([...props.modelValue, ...extra]);
  pickerOpen.value = false;
}
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <div>
        <div class="text-sm font-medium">查询条件</div>
        <p class="mt-1 text-xs text-muted-foreground">
          与查询源无关。可从列勾选，也可直接填字段名。日期/时间默认「范围」，空着不参与查询。
        </p>
      </div>
      <Button size="small" type="primary" ghost @click="openPicker">
        从列添加
      </Button>
    </div>

    <div class="mb-3 grid items-center gap-2 md:grid-cols-12">
      <Input
        v-model:value="manualField"
        class="font-mono md:col-span-4"
        placeholder="字段名，如 OrderNo"
        @press-enter="addManual"
      />
      <Input
        v-model:value="manualTitle"
        class="md:col-span-5"
        placeholder="显示名称（选填）"
        @press-enter="addManual"
      />
      <Button class="md:col-span-3" @click="addManual">添加条件</Button>
    </div>

    <div
      v-if="!modelValue.length"
      class="mb-3 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground"
    >
      尚未配置查询字段。填写字段名添加，或先同步列表列再从列勾选。
    </div>

    <div class="space-y-2">
      <div
        v-for="(field, index) in modelValue"
        :key="field.key"
        class="grid items-center gap-2 rounded-md border border-border p-3 md:grid-cols-12"
      >
        <Input
          class="md:col-span-3"
          :value="field.title"
          placeholder="显示名称"
          @update:value="(v) => setField(index, 'title', String(v || ''))"
        />
        <div class="font-mono text-xs text-muted-foreground md:col-span-2">
          {{ field.field }}
        </div>
        <Select
          class="md:col-span-3 w-full"
          :options="[...QUERY_MODES]"
          :value="queryModeOf(field)"
          @update:value="(v) => setMode(index, String(v))"
        />
        <Input
          class="md:col-span-3"
          :value="field.placeholder"
          placeholder="占位提示（选填）"
          @update:value="(v) => setField(index, 'placeholder', String(v || ''))"
        />
        <Button danger size="small" type="text" @click="removeAt(index)">
          删除
        </Button>
      </div>
    </div>

    <Modal
      v-model:open="pickerOpen"
      title="从列添加查询条件"
      @ok="confirmPicker"
    >
      <p class="mb-3 text-xs text-muted-foreground">
        日期列会自动使用「日期范围」，不必再选等于。
      </p>
      <div v-if="!columns.length" class="text-xs text-muted-foreground">
        还没有列表列。请先到「列表列」添加，或关闭后手动填写字段名。
      </div>
      <Checkbox.Group v-else v-model:value="picked" class="flex flex-col gap-2">
        <Checkbox
          v-for="col in unusedColumns"
          :key="col.field"
          :value="col.field"
        >
          {{ col.title || col.field }}
          <span class="ml-2 text-xs text-muted-foreground">
            {{
              queryModeFromPreset(col.formatPreset) === 'dateRange'
                ? '日期范围'
                : queryModeFromPreset(col.formatPreset) === 'datetimeRange'
                  ? '时间范围'
                  : queryModeFromPreset(col.formatPreset) === 'numberRange'
                    ? '数值范围'
                    : '模糊搜索'
            }}
          </span>
        </Checkbox>
      </Checkbox.Group>
      <div
        v-if="columns.length && !unusedColumns.length"
        class="text-xs text-muted-foreground"
      >
        所有列都已加入查询。
      </div>
    </Modal>
  </div>
</template>
