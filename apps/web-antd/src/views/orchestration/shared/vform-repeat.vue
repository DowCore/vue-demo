<script lang="ts" setup>
/**
 * 子表按列渲染；树仍按节点递归。
 * 子表提交 record[唯一名称] = 行数组。数据调入调用已发布逻辑编排，不另写库。
 */
import type { SubTableButton, VFormWidget } from './vform-model';

import { computed, onMounted, ref } from 'vue';

import {
  Button,
  DatePicker,
  Input,
  InputNumber,
  message,
  Select,
  Switch,
  Table,
} from 'ant-design-vue';

import { runLogicApi } from '#/api/saas/orchestration';

import { subFormButtons, subFormColumns } from './vform-model';
import VFormNode from './vform-node.vue';

defineOptions({ name: 'VFormRepeat' });

const props = defineProps<{
  widget: VFormWidget;
  model: Record<string, unknown>;
  designer?: boolean;
  selectedId?: string;
  labelWidth?: number;
  labelPosition?: 'left' | 'top';
  rows?: Record<string, unknown>[];
  nested?: boolean;
}>();

const emit = defineEmits<{
  'update:model': [value: Record<string, unknown>];
  'update:rows': [value: Record<string, unknown>[]];
  select: [id: string];
  command: [cmd: 'copy' | 'delete' | 'down' | 'up'];
  dropWidget: [
    payload: {
      targetId: string;
      type: string;
      columns?: number;
      moveId: string;
    },
  ];
}>();

const opt = computed(() => props.widget.options || {});
const isTree = computed(() => props.widget.type === 'tree');
const fieldName = computed(() => String(opt.value.name || props.widget.id));
const childKey = 'children';
const importing = ref('');

const columns = computed(() =>
  isTree.value ? [] : subFormColumns(props.widget),
);
const buttons = computed(() =>
  isTree.value ? [] : subFormButtons(props.widget),
);

const storedRows = computed(() => {
  if (props.nested) return props.rows || [];
  const raw = props.model[fieldName.value];
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
});

const tableRows = computed(() => {
  const source = props.designer ? [emptyItem()] : storedRows.value;
  return source.map((row, index) => ({ ...row, __i: index }));
});

const tableColumns = computed(() => {
  const cols = columns.value.map((col) => ({
    title: col.label,
    dataIndex: col.key,
    key: col.key,
    width: col.width || 140,
    fixed: col.fixed || undefined,
  }));
  cols.push({
    title: '操作',
    dataIndex: '_op',
    key: '_op',
    width: 72,
    fixed: 'right',
  });
  return cols;
});

const scrollX = computed(() =>
  tableColumns.value.reduce((sum, col) => sum + Number(col.width || 140), 0),
);

function emptyCell(control: string) {
  if (control === 'switch') return false;
  if (control === 'number') return null;
  return '';
}

function emptyItem(): Record<string, unknown> {
  if (isTree.value) return { [childKey]: [] };
  const row: Record<string, unknown> = {};
  for (const col of columns.value) {
    row[col.key] = emptyCell(col.control);
  }
  return row;
}

function write(rows: Record<string, unknown>[]) {
  if (props.nested) {
    emit('update:rows', rows);
    return;
  }
  emit('update:model', { ...props.model, [fieldName.value]: rows });
}

function addRoot() {
  write([...storedRows.value, emptyItem()]);
}

function removeAt(index: number) {
  write(storedRows.value.filter((_, i) => i !== index));
}

function patchCell(index: number, key: string, value: unknown) {
  write(
    storedRows.value.map((row, i) =>
      i === index ? { ...row, [key]: value } : row,
    ),
  );
}

function columnTitle(key: string) {
  const control = columns.value.find((col) => col.key === key)?.control;
  if (control === 'number') return '数字';
  if (control === 'date') return '日期';
  if (control === 'select') return '下拉';
  if (control === 'switch') return '开关';
  return '文本';
}

function selectOptions(text?: string) {
  return String(text || '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ label: item, value: item }));
}

function replaceAt(index: number, next: Record<string, unknown>) {
  const rows = storedRows.value.map((row, i) => {
    if (i !== index) return row;
    const children = Array.isArray(next[childKey])
      ? next[childKey]
      : row[childKey] || [];
    return { ...next, [childKey]: children };
  });
  write(rows);
}

function addChild(index: number) {
  const rows = storedRows.value.map((row, i) => {
    if (i !== index) return row;
    const children = Array.isArray(row[childKey])
      ? [...(row[childKey] as Record<string, unknown>[])]
      : [];
    children.push(emptyItem());
    return { ...row, [childKey]: children };
  });
  write(rows);
}

function replaceChildren(index: number, children: Record<string, unknown>[]) {
  write(
    storedRows.value.map((row, i) =>
      i === index ? { ...row, [childKey]: children } : row,
    ),
  );
}

function extractRows(data: unknown): null | Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return obj.rows as Record<string, unknown>[];
    if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
  }
  return null;
}

async function onToolbar(button: SubTableButton) {
  if (props.designer) {
    emit('select', props.widget.id);
    return;
  }
  if (button.action === 'add') {
    addRoot();
    return;
  }
  const flowKey = String(button.flowKey || '').trim();
  if (!flowKey) {
    message.warning(`请先为「${button.label}」绑定逻辑编排流程`);
    return;
  }
  importing.value = button.key;
  try {
    const res = await runLogicApi(flowKey, {
      record: props.model,
      subForm: fieldName.value,
      rows: storedRows.value,
    });
    if (res?.success === false) {
      message.error(res.error || '数据调入失败');
      return;
    }
    const incoming = extractRows(res?.data);
    if (!incoming) {
      message.warning('流程没有返回行数组。出参请为数组，或对象中的 rows');
      return;
    }
    write(
      button.mode === 'replace' ? incoming : [...storedRows.value, ...incoming],
    );
    message.success(`已调入 ${incoming.length} 行`);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '数据调入失败');
  } finally {
    importing.value = '';
  }
}

onMounted(() => {
  if (props.designer || props.nested || isTree.value) return;
  if (opt.value.showBlankRow === false) return;
  if (storedRows.value.length > 0) return;
  write([emptyItem()]);
});

function onContainerDrop(event: DragEvent) {
  if (!props.designer) return;
  event.preventDefault();
  event.stopPropagation();
  const plain = event.dataTransfer?.getData('text/plain') || '';
  let type = '';
  let columnsCount: number | undefined;
  let moveId = '';
  if (plain.startsWith('{')) {
    try {
      const data = JSON.parse(plain) as {
        type?: string;
        columns?: number;
        moveId?: string;
      };
      type = data.type || '';
      columnsCount = data.columns || undefined;
      moveId = data.moveId || '';
    } catch {
      /* ignore */
    }
  }
  emit('dropWidget', {
    targetId: props.widget.id,
    type,
    columns: columnsCount,
    moveId,
  });
}
</script>

<template>
  <div
    v-if="!isTree"
    class="vf-subtable"
    @click.stop="emit('select', widget.id)"
    @dragover.prevent
    @drop="onContainerDrop"
  >
    <div class="vf-subtable-head">
      <span>{{ opt.label || '子表' }}</span>
      <span class="vf-subtable-tools">
        <Button
          v-for="button in buttons"
          :key="button.key"
          size="small"
          :loading="importing === button.key"
          :type="button.action === 'import' ? 'default' : 'primary'"
          @click.stop="onToolbar(button)"
        >
          {{ button.label }}
        </Button>
      </span>
    </div>
    <Table
      :columns="tableColumns"
      :data-source="tableRows"
      :pagination="false"
      :scroll="{ x: scrollX }"
      row-key="__i"
      size="small"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === '_op'">
          <Button
            v-if="!designer"
            danger
            size="small"
            type="link"
            @click.stop="removeAt(index)"
          >
            删除
          </Button>
        </template>
        <template v-else-if="designer">
          <span class="vf-col-placeholder">{{
            columnTitle(String(column.key))
          }}</span>
        </template>
        <Input
          v-else-if="
            columns.find((col) => col.key === column.key)?.control === 'input'
          "
          size="small"
          :value="String(record[column.key as string] ?? '')"
          @update:value="(v) => patchCell(index, String(column.key), v)"
        />
        <InputNumber
          v-else-if="
            columns.find((col) => col.key === column.key)?.control === 'number'
          "
          class="w-full"
          size="small"
          :value="
            record[column.key as string] == null ||
            record[column.key as string] === ''
              ? undefined
              : Number(record[column.key as string])
          "
          @update:value="(v) => patchCell(index, String(column.key), v)"
        />
        <DatePicker
          v-else-if="
            columns.find((col) => col.key === column.key)?.control === 'date'
          "
          class="w-full"
          size="small"
          value-format="YYYY-MM-DD"
          :value="record[column.key as string] || undefined"
          @update:value="(v) => patchCell(index, String(column.key), v)"
        />
        <Select
          v-else-if="
            columns.find((col) => col.key === column.key)?.control === 'select'
          "
          class="w-full"
          size="small"
          allow-clear
          :options="
            selectOptions(
              columns.find((col) => col.key === column.key)?.options,
            )
          "
          :value="record[column.key as string] || undefined"
          @update:value="(v) => patchCell(index, String(column.key), v)"
        />
        <Switch
          v-else-if="
            columns.find((col) => col.key === column.key)?.control === 'switch'
          "
          size="small"
          :checked="!!record[column.key as string]"
          @update:checked="(v) => patchCell(index, String(column.key), !!v)"
        />
      </template>
    </Table>
  </div>

  <div
    v-else
    class="vf-repeat"
    :class="{ 'is-nested': nested, 'is-designer': designer }"
    @dragover.prevent
    @drop="onContainerDrop"
  >
    <div v-if="!nested" class="vf-repeat-head">
      <span>{{ opt.label || '树形' }}</span>
    </div>

    <template v-if="designer && !nested">
      <VFormNode
        v-for="child in widget.widgetList || []"
        :key="child.id"
        designer
        :label-position="labelPosition"
        :label-width="labelWidth"
        :model="model"
        :selected-id="selectedId"
        :widget="child"
        @command="(cmd) => emit('command', cmd)"
        @drop-widget="(payload) => emit('dropWidget', payload)"
        @select="(id) => emit('select', id)"
        @update:model="(v) => emit('update:model', v)"
      />
      <div v-if="!(widget.widgetList || []).length" class="vf-repeat-hint">
        拖入字段，作为每个节点的模板
      </div>
      <p class="vf-repeat-hint">
        预览时可添加根节点和子节点。提交后每项含 children。
      </p>
    </template>

    <template v-else>
      <div v-if="!storedRows.length" class="vf-repeat-hint">暂无数据</div>
      <div
        v-for="(row, index) in storedRows"
        :key="index"
        class="vf-repeat-row"
      >
        <div class="vf-repeat-tools">
          <span>节点 {{ index + 1 }}</span>
          <span>
            <Button size="small" type="link" @click="addChild(index)">添加子节点</Button>
            <Button danger size="small" type="link" @click="removeAt(index)">删除</Button>
          </span>
        </div>
        <VFormNode
          v-for="child in widget.widgetList || []"
          :key="`${index}-${child.id}`"
          :label-position="labelPosition"
          :label-width="labelWidth"
          :model="row"
          :widget="child"
          @update:model="(v) => replaceAt(index, v)"
        />
        <VFormRepeat
          v-if="
            Array.isArray(row[childKey]) &&
            (row[childKey] as Record<string, unknown>[]).length
          "
          nested
          :label-position="labelPosition"
          :label-width="labelWidth"
          :model="row"
          :rows="(row[childKey] as Record<string, unknown>[]) || []"
          :widget="widget"
          @update:rows="(rows) => replaceChildren(index, rows)"
        />
      </div>
      <Button block size="small" @click="addRoot">
        {{ nested ? '添加子节点' : '添加根节点' }}
      </Button>
    </template>
  </div>
</template>

<style scoped>
.vf-subtable {
  width: 100%;
  padding: 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}

.vf-subtable-head {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.vf-subtable-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.vf-col-placeholder {
  font-size: 12px;
  color: #909399;
}

.vf-repeat {
  width: 100%;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}

.vf-repeat.is-nested {
  padding: 4px 0 4px 12px;
  margin-top: 8px;
  border: 0;
  border-left: 2px solid #ebeef5;
  border-radius: 0;
}

.vf-repeat.is-designer {
  border-style: dashed;
}

.vf-repeat-head {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.vf-repeat-row + .vf-repeat-row {
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid #ebeef5;
}

.vf-repeat-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
}

.vf-repeat-hint {
  margin: 6px 0;
  font-size: 12px;
  color: #909399;
}
</style>
