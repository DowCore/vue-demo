<script lang="ts" setup>
import type { ConditionItem } from './dsl-graph';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Select, Tooltip } from 'ant-design-vue';

defineOptions({ name: 'ResourceFilterEditor' });

const props = withDefaults(
  defineProps<{
    fieldOptions: Array<{ label: string; value: string }>;
    hintText?: string;
    modelValue: ConditionItem[];
  }>(),
  {
    hintText: '编号条件，下方用 1 and (2 or 3) 组合',
  },
);

const emit = defineEmits<{
  change: [];
  'update:modelValue': [value: ConditionItem[]];
}>();

const OP_OPTIONS = [
  { label: '等于 eq', value: 'eq' },
  { label: '不等于 ne', value: 'ne' },
  { label: '大于 gt', value: 'gt' },
  { label: '大于等于 gte', value: 'gte' },
  { label: '小于 lt', value: 'lt' },
  { label: '小于等于 lte', value: 'lte' },
  { label: '包含 contains', value: 'contains' },
  { label: '不包含 notContains', value: 'notContains' },
  { label: '为空 isEmpty', value: 'isEmpty' },
  { label: '非空 isNotEmpty', value: 'isNotEmpty' },
];

const list = computed({
  get: () => props.modelValue || [],
  set: (value: ConditionItem[]) => {
    emit('update:modelValue', value);
    emit('change');
  },
});

function renumber(items: ConditionItem[]): ConditionItem[] {
  return items.map((item, i) => ({ ...item, no: i + 1 }));
}

function touch(next: ConditionItem[]) {
  list.value = renumber(next);
}

function addItem() {
  touch([
    ...list.value,
    {
      no: list.value.length + 1,
      left: props.fieldOptions[0]?.value || '',
      op: 'eq',
      right: '',
    },
  ]);
}

function removeAt(index: number) {
  const next = [...list.value];
  next.splice(index, 1);
  touch(next);
}

function updateAt(index: number, patch: Partial<ConditionItem>) {
  const next = [...list.value];
  const cur = next[index];
  if (!cur) return;
  next[index] = { ...cur, ...patch } as ConditionItem;
  touch(next);
}

function needsRight(op: string) {
  return op !== 'isEmpty' && op !== 'isNotEmpty';
}

function rightText(item: ConditionItem) {
  if (item.right === undefined || item.right === null) return '';
  return String(item.right);
}

function setRight(index: number, text: string) {
  const trimmed = text.trim();
  if (trimmed === '') {
    updateAt(index, { right: '' });
    return;
  }
  if (trimmed === 'true') {
    updateAt(index, { right: true });
    return;
  }
  if (trimmed === 'false') {
    updateAt(index, { right: false });
    return;
  }
  const n = Number(trimmed);
  if (!Number.isNaN(n) && trimmed !== '') {
    updateAt(index, { right: n });
    return;
  }
  updateAt(index, { right: trimmed });
}
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="text-xs text-muted-foreground">{{ hintText }}</span>
      <Button ghost size="small" type="primary" @click="addItem">
        <template #icon><IconifyIcon icon="lucide:plus" /></template>
        添加条件
      </Button>
    </div>
    <div
      v-if="!list.length"
      class="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground"
    >
      暂无条件，点击「添加条件」
    </div>
    <div class="space-y-2">
      <div
        v-for="(item, index) in list"
        :key="item.no"
        class="rounded-lg border border-border bg-card/60 p-2"
      >
        <div class="mb-1.5 flex items-center justify-between">
          <span
            class="inline-flex size-6 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-600"
          >
            {{ item.no }}
          </span>
          <Tooltip title="删除">
            <Button danger size="small" type="text" @click="removeAt(index)">
              <template #icon>
                <IconifyIcon class="size-3.5" icon="lucide:trash-2" />
              </template>
            </Button>
          </Tooltip>
        </div>
        <div class="grid gap-1.5 sm:grid-cols-3">
          <Select
            :options="fieldOptions"
            :value="item.left"
            class="w-full"
            placeholder="字段"
            size="small"
            show-search
            @update:value="(v) => updateAt(index, { left: String(v || '') })"
          />
          <Select
            :options="OP_OPTIONS"
            :value="item.op"
            class="w-full"
            size="small"
            @update:value="(v) => updateAt(index, { op: String(v) })"
          />
          <Input
            v-if="needsRight(item.op)"
            :value="rightText(item)"
            class="font-mono"
            placeholder="值"
            size="small"
            @update:value="(v) => setRight(index, String(v || ''))"
          />
        </div>
      </div>
    </div>
  </div>
</template>
