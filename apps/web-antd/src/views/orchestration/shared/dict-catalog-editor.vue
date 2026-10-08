<script lang="ts" setup>
import type { DictOption, NamedDict } from '#/api/saas/orchestration';

import { computed, reactive, ref } from 'vue';

import { Button, Input, Modal, Select, Table } from 'ant-design-vue';

defineOptions({ name: 'DictCatalogEditor' });

const props = defineProps<{
  modelValue: NamedDict[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: NamedDict[]];
}>();

const TONE_OPTIONS = [
  { label: '默认', value: '' },
  { label: '成功（绿）', value: 'success' },
  { label: '警告（橙）', value: 'warning' },
  { label: '危险（红）', value: 'danger' },
  { label: '信息（蓝）', value: 'info' },
];

const editingCode = ref('');
const creating = ref(false);
const draft = reactive({ code: '', name: '' });

const current = computed(() =>
  props.modelValue.find((d) => d.code === editingCode.value),
);

function emitAll(next: NamedDict[]) {
  emit('update:modelValue', next);
}

function patchDict(code: string, next: Partial<NamedDict>) {
  emitAll(
    props.modelValue.map((d) => (d.code === code ? { ...d, ...next } : d)),
  );
}

function addDict() {
  draft.code = '';
  draft.name = '';
  creating.value = true;
}

function confirmCreate() {
  const code = draft.code.trim();
  const name = draft.name.trim() || code;
  if (!code) return;
  if (props.modelValue.some((d) => d.code === code)) return;
  emitAll([...props.modelValue, { code, name, options: [] }]);
  editingCode.value = code;
  creating.value = false;
}

function removeDict(code: string) {
  emitAll(props.modelValue.filter((d) => d.code !== code));
  if (editingCode.value === code) editingCode.value = '';
}

function setOption(index: number, next: Partial<DictOption>) {
  if (!current.value) return;
  const options = current.value.options.map((o, i) =>
    i === index ? { ...o, ...next } : o,
  );
  patchDict(current.value.code, { options });
}

function addOption() {
  if (!current.value) return;
  patchDict(current.value.code, {
    options: [...current.value.options, { value: '', label: '', tone: '' }],
  });
}

function removeOption(index: number) {
  if (!current.value) return;
  patchDict(current.value.code, {
    options: current.value.options.filter((_, i) => i !== index),
  });
}

const tableColumns = [
  { title: '编码', dataIndex: 'code', key: 'code', width: 140 },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '项数', key: 'count', width: 70 },
  { title: '', key: 'edit', width: 120 },
];
</script>

<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <div>
        <div class="text-sm font-medium">通用字典</div>
        <p class="mt-1 text-xs text-muted-foreground">
          定义一次，多列引用。例如「订单状态」给状态列、筛选下拉共用。
        </p>
      </div>
      <Button size="small" type="primary" ghost @click="addDict">
        新建字典
      </Button>
    </div>
    <Table
      :columns="tableColumns"
      :data-source="modelValue"
      :pagination="false"
      row-key="code"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'count'">
          {{ (record as NamedDict).options?.length || 0 }}
        </template>
        <template v-else-if="column.key === 'edit'">
          <Button
            size="small"
            type="link"
            @click="editingCode = (record as NamedDict).code"
          >
            编辑
          </Button>
          <Button
            danger
            size="small"
            type="link"
            @click="removeDict((record as NamedDict).code)"
          >
            删除
          </Button>
        </template>
      </template>
    </Table>

    <div v-if="current" class="mt-4 rounded-md border border-border p-3">
      <div class="mb-3 text-sm font-medium">
        {{ current.name }}
        <span class="ml-2 font-mono text-xs text-muted-foreground">{{
          current.code
        }}</span>
      </div>
      <div
        v-for="(opt, index) in current.options"
        :key="index"
        class="mb-2 grid grid-cols-7 items-center gap-2"
      >
        <Input
          class="col-span-2"
          :value="opt.value"
          placeholder="存储值"
          @update:value="(v) => setOption(index, { value: String(v || '') })"
        />
        <Input
          class="col-span-2"
          :value="opt.label"
          placeholder="显示文案"
          @update:value="(v) => setOption(index, { label: String(v || '') })"
        />
        <Select
          class="col-span-2 w-full"
          :options="TONE_OPTIONS"
          :value="opt.tone || ''"
          @update:value="(v) => setOption(index, { tone: String(v || '') })"
        />
        <Button danger size="small" type="text" @click="removeOption(index)">
          删
        </Button>
      </div>
      <Button size="small" @click="addOption">添加项</Button>
    </div>

    <Modal v-model:open="creating" title="新建通用字典" @ok="confirmCreate">
      <div class="mb-3">
        <div class="mb-1 text-xs text-muted-foreground">编码</div>
        <Input
          v-model:value="draft.code"
          class="font-mono"
          placeholder="order_status"
        />
      </div>
      <div>
        <div class="mb-1 text-xs text-muted-foreground">名称</div>
        <Input v-model:value="draft.name" placeholder="订单状态" />
      </div>
    </Modal>
  </div>
</template>
