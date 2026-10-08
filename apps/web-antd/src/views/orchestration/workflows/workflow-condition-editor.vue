<script lang="ts" setup>
import { IconifyIcon } from '@vben/icons';

import { Button, Input, Select, Tooltip } from 'ant-design-vue';

defineOptions({ name: 'WorkflowConditionEditor' });

const props = withDefaults(
  defineProps<{
    modelValue: WfConditionBlock;
    flowOptions?: { label: string; value: string }[];
    hint?: string;
  }>(),
  {
    flowOptions: () => [],
    hint: '编号后用 1 and (2 or 3) 组合。留空表示全部并且。一条都不写则这条规则不生效。',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: WfConditionBlock];
}>();

export interface WfValueRef {
  source: 'const' | 'flow' | 'record' | 'system';
  path?: string;
  flowKey?: string;
  value?: string;
}

export interface WfConditionItem {
  no: number;
  left: WfValueRef;
  op: string;
  right: WfValueRef;
}

export interface WfConditionBlock {
  items: WfConditionItem[];
  combine: string;
}

const SOURCE_LEFT = [
  { label: '单据字段', value: 'record' },
  { label: '系统变量', value: 'system' },
  { label: '逻辑编排', value: 'flow' },
];

const SOURCE_RIGHT = [
  { label: '常量', value: 'const' },
  { label: '单据字段', value: 'record' },
  { label: '系统变量', value: 'system' },
  { label: '逻辑编排', value: 'flow' },
];

const SYSTEM_OPTIONS = [
  { label: '发起人', value: 'starter' },
  { label: '当前办理人', value: 'currentUser' },
  { label: '当前日期', value: 'now' },
  { label: '表单编码', value: 'formRef' },
  { label: '流程编码', value: 'workflowCode' },
];

const OP_OPTIONS = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'ne' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' },
  { label: '包含', value: 'contains' },
  { label: '不包含', value: 'notContains' },
  { label: '为空', value: 'isEmpty' },
  { label: '非空', value: 'isNotEmpty' },
];

function refOf(source: WfValueRef['source'] = 'record'): WfValueRef {
  return { source, path: '', flowKey: '', value: '' };
}

function needsRight(op: string) {
  return op !== 'isEmpty' && op !== 'isNotEmpty';
}

function emitBlock(
  items: WfConditionItem[],
  combine = props.modelValue?.combine || '',
) {
  emit('update:modelValue', {
    combine,
    items: items.map((item, index) => ({ ...item, no: index + 1 })),
  });
}

function addItem() {
  const items = [...(props.modelValue?.items || [])];
  items.push({
    no: items.length + 1,
    left: refOf('record'),
    op: 'eq',
    right: refOf('const'),
  });
  emitBlock(items);
}

function removeAt(index: number) {
  const items = [...(props.modelValue?.items || [])];
  items.splice(index, 1);
  emitBlock(items);
}

function patchItem(index: number, patch: Partial<WfConditionItem>) {
  const items = [...(props.modelValue?.items || [])];
  const current = items[index];
  if (!current) return;
  items[index] = { ...current, ...patch };
  emitBlock(items);
}

function patchRef(
  index: number,
  side: 'left' | 'right',
  patch: Partial<WfValueRef>,
) {
  const items = [...(props.modelValue?.items || [])];
  const current = items[index];
  if (!current) return;
  items[index] = {
    ...current,
    [side]: { ...current[side], ...patch },
  };
  emitBlock(items);
}
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="text-xs text-muted-foreground">{{ hint }}</span>
      <Button size="small" type="primary" ghost @click="addItem">
        <template #icon><IconifyIcon icon="lucide:plus" /></template>
        添加
      </Button>
    </div>
    <div
      v-if="!(modelValue?.items || []).length"
      class="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
    >
      还没有条件
    </div>
    <div class="space-y-2">
      <div
        v-for="(item, index) in modelValue?.items || []"
        :key="item.no"
        class="rounded-lg border border-border p-2"
      >
        <div class="mb-1.5 flex items-center justify-between">
          <span
            class="inline-flex size-6 items-center justify-center rounded-full bg-amber-500/15 text-xs font-semibold text-amber-600"
          >
            {{ item.no }}
          </span>
          <Tooltip title="删除">
            <Button danger size="small" type="text" @click="removeAt(index)">
              <template #icon>
                <IconifyIcon icon="lucide:trash-2" class="size-3.5" />
              </template>
            </Button>
          </Tooltip>
        </div>
        <div class="space-y-1.5">
          <Select
            :value="item.left.source"
            size="small"
            class="w-full"
            :options="SOURCE_LEFT"
            @update:value="
              (v) =>
                patchRef(index, 'left', { source: v as WfValueRef['source'] })
            "
          />
          <Select
            v-if="item.left.source === 'system'"
            :value="item.left.path"
            size="small"
            class="w-full"
            :options="SYSTEM_OPTIONS"
            placeholder="系统变量"
            @update:value="
              (v) => patchRef(index, 'left', { path: String(v || '') })
            "
          />
          <Select
            v-else-if="item.left.source === 'flow'"
            :value="item.left.flowKey"
            size="small"
            allow-clear
            show-search
            class="w-full"
            :options="flowOptions"
            placeholder="已发布逻辑编排"
            @update:value="
              (v) => patchRef(index, 'left', { flowKey: String(v || '') })
            "
          />
          <Input
            v-if="item.left.source === 'record' || item.left.source === 'flow'"
            :value="item.left.path"
            size="small"
            class="font-mono"
            :placeholder="
              item.left.source === 'record'
                ? '单据路径，如 days 或 items.0.qty'
                : '返回值路径，留空取整个结果'
            "
            @update:value="
              (v) => patchRef(index, 'left', { path: String(v || '') })
            "
          />
          <Select
            :value="item.op"
            size="small"
            class="w-full"
            :options="OP_OPTIONS"
            @update:value="(v) => patchItem(index, { op: String(v || 'eq') })"
          />
          <template v-if="needsRight(item.op)">
            <Select
              :value="item.right.source"
              size="small"
              class="w-full"
              :options="SOURCE_RIGHT"
              @update:value="
                (v) =>
                  patchRef(index, 'right', {
                    source: v as WfValueRef['source'],
                  })
              "
            />
            <Input
              v-if="item.right.source === 'const'"
              :value="item.right.value"
              size="small"
              placeholder="常量"
              @update:value="
                (v) => patchRef(index, 'right', { value: String(v || '') })
              "
            />
            <Select
              v-else-if="item.right.source === 'system'"
              :value="item.right.path"
              size="small"
              class="w-full"
              :options="SYSTEM_OPTIONS"
              placeholder="系统变量"
              @update:value="
                (v) => patchRef(index, 'right', { path: String(v || '') })
              "
            />
            <Select
              v-else-if="item.right.source === 'flow'"
              :value="item.right.flowKey"
              size="small"
              allow-clear
              show-search
              class="w-full"
              :options="flowOptions"
              placeholder="已发布逻辑编排"
              @update:value="
                (v) => patchRef(index, 'right', { flowKey: String(v || '') })
              "
            />
            <Input
              v-if="
                item.right.source === 'record' || item.right.source === 'flow'
              "
              :value="item.right.path"
              size="small"
              class="font-mono"
              :placeholder="
                item.right.source === 'record'
                  ? '单据路径'
                  : '返回值路径，留空取整个结果'
              "
              @update:value="
                (v) => patchRef(index, 'right', { path: String(v || '') })
              "
            />
          </template>
        </div>
      </div>
    </div>
    <div v-if="(modelValue?.items || []).length > 1" class="mt-2">
      <div class="mb-1 text-xs text-muted-foreground">组合式</div>
      <Input
        :value="modelValue.combine"
        size="small"
        class="font-mono"
        placeholder="1 and (2 or 3)，留空则全部并且"
        @update:value="(v) => emitBlock(modelValue.items, String(v || ''))"
      />
    </div>
  </div>
</template>
