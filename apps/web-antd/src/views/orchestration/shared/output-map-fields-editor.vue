<script lang="ts" setup>
import type { OutputMapItem } from './dsl-graph';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Select } from 'ant-design-vue';

defineOptions({ name: 'OutputMapFieldsEditor' });

const props = withDefaults(
  defineProps<{
    modelValue: OutputMapItem[];
    /** 嵌套深度，用于缩进与安全上限提示 */
    depth?: number;
    /** 相对当前层的 from 占位提示 */
    fromPlaceholder?: string;
  }>(),
  {
    depth: 0,
    fromPlaceholder: '相对当前行：id / qty / user.name',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: OutputMapItem[]];
}>();

const MaxDepth = 12;

const list = computed({
  get: () => props.modelValue || [],
  set: (v: OutputMapItem[]) => emit('update:modelValue', v),
});

const typeOptions = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
  { label: 'object', value: 'object' },
  { label: 'array', value: 'array' },
];

const mapFromModes = [
  { label: '路径', value: 'path' },
  { label: '模板', value: 'template' },
  { label: '字面量', value: 'literal' },
];

function touch(next: OutputMapItem[]) {
  list.value = next;
}

function addRow() {
  touch([
    ...list.value,
    { name: `col${list.value.length + 1}`, type: 'string', from: '' },
  ]);
}

function removeRow(index: number) {
  const next = [...list.value];
  next.splice(index, 1);
  touch(next);
}

function patchRow(index: number, patch: Partial<OutputMapItem>) {
  const next = [...list.value];
  const cur = next[index];
  if (!cur) return;
  next[index] = { ...cur, ...patch };
  touch(next);
}

function onTypeChange(index: number, type: string) {
  const cur = list.value[index];
  if (!cur) return;
  if (type === 'array' || type === 'object') {
    const nested = cur.map?.item?.length
      ? cur.map
      : {
          item: [
            { name: 'id', type: 'string', from: 'id' },
            { name: 'name', type: 'string', from: 'name' },
          ],
        };
    patchRow(index, { type, map: nested });
    return;
  }
  patchRow(index, { type, map: undefined });
}

function nestedItems(row: OutputMapItem): OutputMapItem[] {
  return row.map?.item || [];
}

function setNestedItems(index: number, items: OutputMapItem[]) {
  patchRow(index, {
    map: items.length > 0 ? { item: items } : undefined,
  });
}

function mapFromMode(row: OutputMapItem): 'literal' | 'path' | 'template' {
  if (row.from && typeof row.from === 'object') {
    if ('template' in row.from) return 'template';
    if ('literal' in row.from) return 'literal';
  }
  return 'path';
}

function mapFromText(row: OutputMapItem): string {
  if (row.from && typeof row.from === 'object') {
    if ('template' in row.from) {
      return String((row.from as { template: string }).template || '');
    }
    if ('literal' in row.from) {
      const lit = (row.from as { literal: unknown }).literal;
      if (lit === null || lit === undefined) return '';
      if (typeof lit === 'object') return JSON.stringify(lit);
      return String(lit);
    }
  }
  return row.from === null || row.from === undefined ? '' : String(row.from);
}

function setMapFromText(index: number, text: string) {
  const row = list.value[index];
  if (!row) return;
  const mode = mapFromMode(row);
  if (mode === 'template') {
    patchRow(index, { from: { template: text } });
  } else if (mode === 'literal') {
    const trimmed = text.trim();
    try {
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        patchRow(index, { from: { literal: JSON.parse(trimmed) } });
        return;
      }
    } catch {
      /* keep string */
    }
    patchRow(index, { from: { literal: text } });
  } else {
    patchRow(index, { from: text });
  }
}

function setMapFromMode(index: number, mode: 'literal' | 'path' | 'template') {
  const row = list.value[index];
  if (!row) return;
  const text = mapFromText(row);
  if (mode === 'template') {
    patchRow(index, { from: { template: text || '{{id}}' } });
  } else if (mode === 'literal') {
    patchRow(index, { from: { literal: text } });
  } else {
    patchRow(index, { from: text });
  }
}

function canNest(row: OutputMapItem) {
  const t = row.type || 'string';
  return (t === 'array' || t === 'object') && props.depth < MaxDepth;
}

function nestedLabel(row: OutputMapItem) {
  return row.type === 'array'
    ? '元素字段 map.item（可继续嵌套）'
    : '对象字段 map.item（可继续嵌套）';
}
</script>

<template>
  <div
    class="output-map-fields-editor space-y-1.5"
    :style="{ marginLeft: depth ? '8px' : undefined }"
  >
    <div
      v-if="!list.length"
      class="rounded border border-dashed px-2 py-2 text-center text-[10px] text-muted-foreground"
    >
      无映射则原样透传。点下方添加字段开始投影。
    </div>

    <div
      v-for="(row, rowIndex) in list"
      :key="rowIndex"
      class="rounded border border-border bg-background/80 p-1.5 space-y-1"
      :class="depth ? 'border-violet-300/40' : ''"
    >
      <div class="flex gap-1">
        <Input
          :value="row.name"
          size="small"
          class="flex-1 font-mono"
          placeholder="目标字段"
          @update:value="(v) => patchRow(rowIndex, { name: String(v || '') })"
        />
        <Select
          :value="row.type || 'string'"
          size="small"
          class="!w-24"
          :options="typeOptions"
          @update:value="(v) => onTypeChange(rowIndex, String(v))"
        />
        <Button size="small" type="text" danger @click="removeRow(rowIndex)">
          <IconifyIcon icon="lucide:trash-2" />
        </Button>
      </div>
      <div class="flex gap-1">
        <Select
          :value="mapFromMode(row)"
          size="small"
          class="!w-24 shrink-0"
          :options="mapFromModes"
          @update:value="
            (v) =>
              setMapFromMode(rowIndex, v as 'path' | 'template' | 'literal')
          "
        />
        <Input
          :value="mapFromText(row)"
          size="small"
          class="min-w-0 flex-1 font-mono"
          :placeholder="
            mapFromMode(row) === 'template'
              ? 'Line {{id}}'
              : mapFromMode(row) === 'literal'
                ? '字面量 / JSON'
                : fromPlaceholder
          "
          @update:value="(v) => setMapFromText(rowIndex, String(v || ''))"
        />
      </div>

      <div
        v-if="canNest(row)"
        class="mt-1 rounded-md border border-dashed border-violet-400/50 bg-violet-50/30 p-1.5 dark:bg-violet-950/20"
      >
        <div class="mb-1 flex items-center justify-between gap-2">
          <span
            class="text-[10px] font-medium text-violet-700 dark:text-violet-300"
          >
            {{ nestedLabel(row) }} · L{{ depth + 1 }}
          </span>
          <Button
            v-if="nestedItems(row).length"
            size="small"
            type="link"
            danger
            class="!h-auto !px-0 text-[10px]"
            @click="setNestedItems(rowIndex, [])"
          >
            清除嵌套
          </Button>
        </div>
        <OutputMapFieldsEditor
          :model-value="nestedItems(row)"
          :depth="depth + 1"
          :from-placeholder="
            row.type === 'array'
              ? '相对子元素：sku / qty'
              : '相对对象：color / size'
          "
          @update:model-value="(v) => setNestedItems(rowIndex, v)"
        />
      </div>
      <div
        v-else-if="
          (row.type === 'array' || row.type === 'object') && depth >= MaxDepth
        "
        class="text-[10px] text-amber-600"
      >
        已达嵌套上限 {{ MaxDepth }} 层，请简化结构。
      </div>
    </div>

    <Button size="small" block @click="addRow">
      <template #icon><IconifyIcon icon="lucide:plus" /></template>
      添加映射字段
    </Button>
  </div>
</template>
