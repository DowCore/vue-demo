<script lang="ts" setup>
import type { FilterNode } from './filter-model';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Input,
  Radio,
  RadioGroup,
  Select,
  Tooltip,
} from 'ant-design-vue';

import { emptyGroup, emptyRule, FILTER_OP_OPTIONS } from './filter-model';

defineOptions({ name: 'FilterGroupEditor' });

const props = withDefaults(
  defineProps<{
    depth?: number;
    fieldOptions: Array<{ label: string; value: string }>;
    modelValue: FilterNode;
  }>(),
  { depth: 0 },
);

const emit = defineEmits<{
  'update:modelValue': [value: FilterNode];
}>();

const group = computed({
  get: () => ({
    kind: 'group' as const,
    op: props.modelValue?.op === 'or' ? 'or' : 'and',
    children: [...(props.modelValue?.children || [])],
  }),
  set: (value: FilterNode) => emit('update:modelValue', value),
});

function patch(next: FilterNode) {
  group.value = next;
}

function setOp(op: string) {
  patch({ ...group.value, op });
}

function addRule() {
  patch({
    ...group.value,
    children: [
      ...group.value.children,
      emptyRule(props.fieldOptions[0]?.value || ''),
    ],
  });
}

function addGroup() {
  if ((props.depth || 0) >= 2) return;
  patch({
    ...group.value,
    children: [...group.value.children, emptyGroup('or')],
  });
}

function removeAt(index: number) {
  const children = [...group.value.children];
  children.splice(index, 1);
  patch({ ...group.value, children });
}

function updateAt(index: number, child: FilterNode) {
  const children = [...group.value.children];
  children[index] = child;
  patch({ ...group.value, children });
}

function needsRight(op?: string) {
  const o = (op || '').toLowerCase();
  return o !== 'isempty' && o !== 'isnotempty';
}

function isGroup(node: FilterNode) {
  return node.kind === 'group' || !!node.children;
}
</script>

<template>
  <div
    class="rounded-lg border border-border p-3"
    :class="depth ? 'bg-muted/20' : 'bg-card/40'"
  >
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <RadioGroup
        :value="group.op"
        size="small"
        @update:value="(v) => setOp(String(v))"
      >
        <Radio value="and">全部满足</Radio>
        <Radio value="or">任一满足</Radio>
      </RadioGroup>
      <div class="flex gap-1">
        <Button size="small" type="primary" ghost @click="addRule">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          添加条件
        </Button>
        <Button v-if="(depth || 0) < 2" size="small" @click="addGroup">
          添加条件组
        </Button>
      </div>
    </div>

    <div
      v-if="!group.children.length"
      class="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
    >
      暂无条件。空着的条件不会参与查询。
    </div>

    <div class="space-y-2">
      <div v-for="(child, index) in group.children" :key="index">
        <FilterGroupEditor
          v-if="isGroup(child)"
          :depth="(depth || 0) + 1"
          :field-options="fieldOptions"
          :model-value="child"
          @update:model-value="(v) => updateAt(index, v)"
        />
        <div
          v-else
          class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-2"
        >
          <Select
            :options="fieldOptions"
            :value="child.left"
            class="min-w-36 flex-1"
            placeholder="字段"
            size="small"
            show-search
            @update:value="
              (v) => updateAt(index, { ...child, left: String(v || '') })
            "
          />
          <Select
            :options="FILTER_OP_OPTIONS"
            :value="child.op || 'eq'"
            class="w-28"
            size="small"
            @update:value="(v) => updateAt(index, { ...child, op: String(v) })"
          />
          <Input
            v-if="needsRight(child.op)"
            :value="child.right == null ? '' : String(child.right)"
            class="min-w-28 flex-1"
            placeholder="值"
            size="small"
            @update:value="(v) => updateAt(index, { ...child, right: v })"
          />
          <Tooltip title="删除">
            <Button danger size="small" type="text" @click="removeAt(index)">
              <template #icon>
                <IconifyIcon class="size-3.5" icon="lucide:trash-2" />
              </template>
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  </div>
</template>
