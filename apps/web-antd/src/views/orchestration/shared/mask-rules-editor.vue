<script lang="ts" setup>
import type { MaskRule, NodeBinding } from './dsl-graph';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, InputNumber, Select } from 'ant-design-vue';

import NodeIoEditor from './node-io-editor.vue';

defineOptions({ name: 'MaskRulesEditor' });

const props = withDefaults(
  defineProps<{
    rules: MaskRule[];
    inputs: NodeBinding[];
    outputs: NodeBinding[];
    strategy?: string;
    itemField?: string;
    pathHints?: string[];
    nodeRef?: string;
  }>(),
  {
    pathHints: () => [],
    nodeRef: '',
    strategy: 'rules',
    itemField: 'rows',
  },
);

const emit = defineEmits<{
  'update:rules': [value: MaskRule[]];
  'update:inputs': [value: NodeBinding[]];
  'update:outputs': [value: NodeBinding[]];
  'update:strategy': [value: string];
  'update:itemField': [value: string];
  change: [];
}>();

const opOptions = [
  { label: '固定值 fixed', value: 'fixed' },
  { label: '非空打码 keepEmpty', value: 'keepEmpty' },
  { label: '手机号 phone', value: 'phone' },
  { label: '身份证 idCard', value: 'idCard' },
  { label: '邮箱 email', value: 'email' },
  { label: '银行卡 bankCard', value: 'bankCard' },
  { label: '姓名 name', value: 'name' },
  { label: '自定义 mask', value: 'mask' },
  { label: '哈希 hash', value: 'hash' },
  { label: '置空 redact', value: 'redact' },
  { label: '删除键 drop', value: 'drop' },
];

const ruleList = computed({
  get: () => props.rules || [],
  set: (v: MaskRule[]) => {
    emit('update:rules', v);
    emit('change');
  },
});

function touchRules(next: MaskRule[]) {
  ruleList.value = next;
}

function addRule() {
  touchRules([...ruleList.value, { field: 'mobile', op: 'phone' }]);
}

function removeRule(index: number) {
  const next = [...ruleList.value];
  next.splice(index, 1);
  touchRules(next);
}

function patchRule(index: number, patch: Partial<MaskRule>) {
  const cur = ruleList.value[index];
  if (!cur) return;
  const next = [...ruleList.value];
  next[index] = { ...cur, ...patch };
  touchRules(next);
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <span class="text-xs text-muted-foreground shrink-0">策略</span>
      <Select
        :value="strategy"
        size="small"
        class="!w-36"
        :options="[
          { label: '对象字段 rules', value: 'rules' },
          { label: '列表元素 items', value: 'items' },
        ]"
        @update:value="
          (v) => {
            emit('update:strategy', String(v));
            emit('change');
          }
        "
      />
      <Input
        v-if="strategy === 'items'"
        :value="itemField"
        size="small"
        class="!w-28 font-mono"
        placeholder="itemField"
        @update:value="
          (v) => {
            emit('update:itemField', String(v || 'rows'));
            emit('change');
          }
        "
      />
    </div>

    <div>
      <div class="mb-1 text-xs font-medium">输入映射</div>
      <NodeIoEditor
        :model-value="inputs"
        mode="inputs"
        :path-hints="pathHints"
        :node-ref="nodeRef"
        @update:model-value="
          (v) => {
            emit('update:inputs', v);
            emit('change');
          }
        "
      />
    </div>

    <div>
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium">脱敏规则</span>
        <Button size="small" type="primary" ghost @click="addRule">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          添加
        </Button>
      </div>
      <div
        v-if="!ruleList.length"
        class="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground"
      >
        暂无规则
      </div>
      <div class="space-y-2">
        <div
          v-for="(rule, index) in ruleList"
          :key="index"
          class="rounded-lg border p-2 space-y-1"
        >
          <div class="flex gap-1">
            <Input
              :value="rule.field"
              size="small"
              class="flex-1 font-mono"
              placeholder="字段"
              @update:value="
                (v) => patchRule(index, { field: String(v || '') })
              "
            />
            <Select
              :value="rule.op"
              size="small"
              class="!w-40"
              :options="opOptions"
              @update:value="(v) => patchRule(index, { op: String(v) })"
            />
            <Button size="small" type="text" danger @click="removeRule(index)">
              <IconifyIcon icon="lucide:trash-2" />
            </Button>
          </div>
          <Input
            v-if="rule.op === 'fixed' || rule.op === 'keepEmpty'"
            :value="rule.value || ''"
            size="small"
            placeholder="替换值，如 ******"
            @update:value="(v) => patchRule(index, { value: String(v || '') })"
          />
          <div v-if="rule.op === 'mask'" class="flex gap-1">
            <InputNumber
              :value="rule.keepStart ?? 0"
              size="small"
              class="!w-24"
              placeholder="keepStart"
              @update:value="
                (v) => patchRule(index, { keepStart: Number(v || 0) })
              "
            />
            <InputNumber
              :value="rule.keepEnd ?? 0"
              size="small"
              class="!w-24"
              placeholder="keepEnd"
              @update:value="
                (v) => patchRule(index, { keepEnd: Number(v || 0) })
              "
            />
            <Input
              :value="rule.maskChar || '*'"
              size="small"
              class="!w-16"
              @update:value="
                (v) => patchRule(index, { maskChar: String(v || '*') })
              "
            />
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="mb-1 text-xs font-medium">输出映射</div>
      <NodeIoEditor
        :model-value="outputs"
        mode="outputs"
        :path-hints="pathHints"
        :node-ref="nodeRef"
        @update:model-value="
          (v) => {
            emit('update:outputs', v);
            emit('change');
          }
        "
      />
    </div>
  </div>
</template>
