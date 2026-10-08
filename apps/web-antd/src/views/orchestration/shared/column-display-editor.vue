<script lang="ts" setup>
import type {
  DictOption,
  ListColumnDef,
  NamedDict,
} from '#/api/saas/orchestration';

import { computed, reactive, ref } from 'vue';

import {
  Button,
  Drawer,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Switch,
  Table,
} from 'ant-design-vue';

import { applyColumnLayoutDefaults, columnOptions } from './format-cell';

defineOptions({ name: 'ColumnDisplayEditor' });

const props = defineProps<{
  dictionaries?: NamedDict[];
  emptyText?: string;
  hint?: string;
  modelValue: ListColumnDef[];
}>();

const emit = defineEmits<{
  'update:dictionaries': [value: NamedDict[]];
  'update:modelValue': [value: ListColumnDef[]];
}>();

const open = ref(false);
const editing = ref<ListColumnDef | null>(null);
const options = ref<DictOption[]>([]);
const rule = reactive({ op: 'eq', value: '', tone: 'danger' });
const saveDictOpen = ref(false);
const saveDraft = reactive({ code: '', name: '' });
const newField = ref('');
const newTitle = ref('');

const FORMAT_PLACEHOLDER = "return Number(raw) > 0 ? value + ' 元' : '—'";
const RENDER_PLACEHOLDER = `return \`<span class="font-medium">\${value}</span>\``;

const TONE_OPTIONS = [
  { label: '默认', value: '' },
  { label: '成功（绿）', value: 'success' },
  { label: '警告（橙）', value: 'warning' },
  { label: '危险（红）', value: 'danger' },
  { label: '信息（蓝）', value: 'info' },
];

const ALIGN_OPTIONS = [
  { label: '左', value: 'left' },
  { label: '中', value: 'center' },
  { label: '右', value: 'right' },
];

const FIXED_OPTIONS = [
  { label: '不冻结', value: '' },
  { label: '左冻结', value: 'left' },
  { label: '右冻结', value: 'right' },
];

const dictChoices = computed(() => [
  { label: '本列自定义', value: '' },
  ...(props.dictionaries || []).map((d) => ({
    label: `${d.name}（${d.code}）`,
    value: d.code,
  })),
]);

const tableColumns = [
  { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
  {
    title: '字段',
    dataIndex: 'field',
    key: 'field',
    width: 120,
    ellipsis: true,
  },
  { title: '列宽', key: 'width', width: 100 },
  { title: '对齐', key: 'align', width: 88 },
  { title: '展示', key: 'display', width: 140, ellipsis: true },
  { title: '汇总', dataIndex: 'summaryFn', key: 'summaryFn', width: 72 },
  { title: '可见', key: 'visible', width: 64 },
  { title: '', key: 'edit', width: 72 },
];

function displayHint(col: ListColumnDef) {
  const bits: string[] = [];
  if (col.dictCode) bits.push(`字典 ${col.dictCode}`);
  else if (columnOptions(col, props.dictionaries).length > 0)
    bits.push('本列映射');
  if (col.formatFn?.trim()) bits.push('JS 格式化');
  if (col.renderFn?.trim()) bits.push('HTML');
  if (col.styleRules?.length) bits.push('条件着色');
  if (col.ellipsis) bits.push('省略');
  if (col.fixed === 'left' || col.fixed === 'right')
    bits.push(`冻${col.fixed === 'left' ? '左' : '右'}`);
  if (bits.length > 0) return bits.join(' · ');
  return col.formatPreset || '文本';
}

function patchColumn(field: string, next: Partial<ListColumnDef>) {
  emit(
    'update:modelValue',
    props.modelValue.map((c) => (c.field === field ? { ...c, ...next } : c)),
  );
}

function addColumn() {
  const field = newField.value.trim();
  const current = props.modelValue || [];
  if (!field) {
    message.warning('请先填写字段名，再添加列');
    return;
  }
  if (current.some((c) => c.field === field)) {
    message.warning(`列「${field}」已存在`);
    return;
  }
  const created = applyColumnLayoutDefaults({
    field,
    title: newTitle.value.trim() || field,
    visible: true,
    sortable: true,
    formatPreset: 'text',
  });
  emit('update:modelValue', [...current, created]);
  newField.value = '';
  newTitle.value = '';
}

function openEdit(col: ListColumnDef) {
  editing.value = {
    ...col,
    formatFn: col.formatFn || '',
    renderFn: col.renderFn || '',
    dictCode: col.dictCode || '',
    render: col.render || 'text',
    align: col.align || 'left',
    fixed: col.fixed || '',
    width: col.width,
    ellipsis: !!col.ellipsis,
    sortable: col.sortable !== false,
  };
  options.value = columnOptions(col, props.dictionaries).map((o) => ({ ...o }));
  const first = col.styleRules?.[0];
  rule.op = first?.op || 'eq';
  rule.value = first?.value || '';
  rule.tone = first?.tone || 'danger';
  open.value = true;
}

function onDictCode(code: string) {
  if (!editing.value) return;
  editing.value.dictCode = code;
  const shared = (props.dictionaries || []).find((d) => d.code === code);
  options.value = (shared?.options || []).map((o) => ({ ...o }));
}

function onFormatPreset(preset: string) {
  if (!editing.value) return;
  editing.value.formatPreset = preset;
  const laid = applyColumnLayoutDefaults({
    ...editing.value,
    formatPreset: preset,
    width: undefined,
    align: undefined,
    ellipsis: undefined,
  });
  editing.value.align = laid.align;
  editing.value.width = laid.width;
  editing.value.ellipsis = !!laid.ellipsis;
}

function addOption() {
  options.value = [...options.value, { value: '', label: '', tone: '' }];
}

function removeOption(index: number) {
  options.value = options.value.filter((_, i) => i !== index);
}

function openSaveAsDict() {
  saveDraft.code = editing.value?.field || '';
  saveDraft.name = editing.value?.title || '';
  saveDictOpen.value = true;
}

function confirmSaveAsDict() {
  const code = saveDraft.code.trim();
  const name = saveDraft.name.trim() || code;
  if (!code || !editing.value) return;
  const nextOptions = options.value.filter((o) => o.value);
  const existing = props.dictionaries || [];
  const hit = existing.find((d) => d.code === code);
  const dictionaries = hit
    ? existing.map((d) =>
        d.code === code ? { ...d, name, options: nextOptions } : d,
      )
    : [...existing, { code, name, options: nextOptions }];
  emit('update:dictionaries', dictionaries);
  editing.value.dictCode = code;
  saveDictOpen.value = false;
}

function columnRenderMode() {
  if (!editing.value) return 'text';
  if (editing.value.renderFn?.trim()) return 'html';
  if (options.value.length > 0 || editing.value.dictCode) return 'tag';
  return editing.value.render || 'text';
}

function saveDrawer() {
  if (!editing.value) return;
  const dictMap: Record<string, string> = {};
  for (const o of options.value) {
    if (o.value) dictMap[o.value] = o.label || o.value;
  }
  const usingShared = !!editing.value.dictCode;
  const width =
    editing.value.width !== undefined &&
    editing.value.width !== null &&
    Number(editing.value.width) > 0
      ? Math.round(Number(editing.value.width))
      : undefined;
  patchColumn(editing.value.field, {
    title: editing.value.title,
    formatPreset: editing.value.formatPreset,
    summaryFn: editing.value.summaryFn,
    width,
    align: editing.value.align || 'left',
    ellipsis: !!editing.value.ellipsis,
    fixed: editing.value.fixed || '',
    sortable: editing.value.sortable !== false,
    dictCode: editing.value.dictCode || '',
    options: usingShared ? [] : options.value.filter((o) => o.value),
    dictMap: usingShared ? {} : dictMap,
    formatFn: editing.value.formatFn?.trim() || '',
    renderFn: editing.value.renderFn?.trim() || '',
    render: columnRenderMode(),
    styleRules: rule.value
      ? [{ op: rule.op, value: rule.value, tone: rule.tone, target: 'cell' }]
      : [],
  });
  open.value = false;
}
</script>

<template>
  <div>
    <div class="mb-2">
      <div class="text-sm font-medium">列表列</div>
      <p class="mt-1 text-xs text-muted-foreground">
        {{
          hint ||
          '列宽留空自适应；金额/数字默认右对齐，长文本建议开启省略。点「展示」配字典、布局与格式化。'
        }}
      </p>
    </div>
    <div class="mb-3 grid items-center gap-2 md:grid-cols-12">
      <Input
        v-model:value="newField"
        class="font-mono md:col-span-4"
        placeholder="字段名，如 Amount"
        @press-enter="addColumn"
      />
      <Input
        v-model:value="newTitle"
        class="md:col-span-5"
        placeholder="列标题（选填）"
        @press-enter="addColumn"
      />
      <Button class="md:col-span-3" @click="addColumn">添加列</Button>
    </div>
    <div
      v-if="!modelValue.length"
      class="mb-3 rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground"
    >
      {{
        emptyText ||
        '还没有列。填写左侧字段名后点「添加列」，或从查询源同步列。'
      }}
    </div>
    <Table
      :columns="tableColumns"
      :data-source="modelValue"
      :pagination="false"
      :scroll="{ x: 900 }"
      row-key="field"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'width'">
          <InputNumber
            class="w-full"
            :min="40"
            :max="800"
            placeholder="自适应"
            size="small"
            :value="(record as ListColumnDef).width"
            @update:value="
              (v) =>
                patchColumn((record as ListColumnDef).field, {
                  width: v == null || v === '' ? undefined : Number(v),
                })
            "
          />
        </template>
        <template v-else-if="column.key === 'align'">
          <Select
            class="w-full"
            size="small"
            :options="ALIGN_OPTIONS"
            :value="(record as ListColumnDef).align || 'left'"
            @update:value="
              (v) =>
                patchColumn((record as ListColumnDef).field, {
                  align: String(v || 'left'),
                })
            "
          />
        </template>
        <template v-else-if="column.key === 'display'">
          <span class="text-xs">{{
            displayHint(record as ListColumnDef)
          }}</span>
        </template>
        <template v-else-if="column.key === 'visible'">
          <Switch
            :checked="(record as ListColumnDef).visible !== false"
            size="small"
            @update:checked="
              (v) =>
                patchColumn((record as ListColumnDef).field, { visible: !!v })
            "
          />
        </template>
        <template v-else-if="column.key === 'edit'">
          <Button
            size="small"
            type="link"
            @click="openEdit(record as ListColumnDef)"
          >
            展示
          </Button>
        </template>
      </template>
    </Table>

    <Drawer
      v-model:open="open"
      title="列展示"
      width="640"
      @close="open = false"
    >
      <template v-if="editing">
        <div class="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div class="mb-1 text-xs text-muted-foreground">标题</div>
            <Input
              :value="editing.title"
              @update:value="(v) => (editing!.title = String(v || ''))"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-muted-foreground">格式预设</div>
            <Select
              class="w-full"
              :value="editing.formatPreset"
              :options="[
                { label: '文本', value: 'text' },
                { label: '日期', value: 'date' },
                { label: '时间', value: 'datetime' },
                { label: '金额', value: 'currency' },
                { label: '数字', value: 'number' },
                { label: '是否', value: 'boolean' },
              ]"
              @update:value="(v) => onFormatPreset(String(v || 'text'))"
            />
          </div>
        </div>

        <div class="mb-1 text-sm font-medium">布局</div>
        <p class="mb-2 text-xs text-muted-foreground">
          列宽单位 px，留空由表格自适应；冻结列在横向滚动时保持可见（同 Ant
          Design Table）。
        </p>
        <div class="mb-6 grid gap-3 sm:grid-cols-2">
          <div>
            <div class="mb-1 text-xs text-muted-foreground">列宽（px）</div>
            <InputNumber
              class="w-full"
              :min="40"
              :max="800"
              placeholder="自适应"
              :value="editing.width"
              @update:value="
                (v) =>
                  (editing!.width =
                    v == null || v === '' ? undefined : Number(v))
              "
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-muted-foreground">对齐</div>
            <Select
              class="w-full"
              :options="ALIGN_OPTIONS"
              :value="editing.align || 'left'"
              @update:value="(v) => (editing!.align = String(v || 'left'))"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-muted-foreground">冻结</div>
            <Select
              class="w-full"
              :options="FIXED_OPTIONS"
              :value="editing.fixed || ''"
              @update:value="(v) => (editing!.fixed = String(v || ''))"
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-muted-foreground">汇总</div>
            <Select
              allow-clear
              class="w-full"
              :value="editing.summaryFn"
              :options="[
                { label: '无', value: '' },
                { label: '合计', value: 'sum' },
                { label: '平均', value: 'avg' },
                { label: '计数', value: 'count' },
              ]"
              @update:value="(v) => (editing!.summaryFn = String(v || ''))"
            />
          </div>
          <div class="flex items-center gap-6 sm:col-span-2">
            <label class="flex items-center gap-2 text-sm">
              <Switch
                :checked="!!editing.ellipsis"
                size="small"
                @update:checked="(v) => (editing!.ellipsis = !!v)"
              />
              超长省略
            </label>
            <label class="flex items-center gap-2 text-sm">
              <Switch
                :checked="editing.sortable !== false"
                size="small"
                @update:checked="(v) => (editing!.sortable = !!v)"
              />
              可排序
            </label>
          </div>
          <div>
            <div class="mb-1 text-xs text-muted-foreground">渲染</div>
            <Select
              class="w-full"
              :value="editing.render"
              :options="[
                { label: '文本', value: 'text' },
                { label: '标签', value: 'tag' },
              ]"
              @update:value="(v) => (editing!.render = String(v || 'text'))"
            />
          </div>
        </div>

        <div class="mb-1 text-sm font-medium">值映射（字典）</div>
        <p class="mb-2 text-xs text-muted-foreground">
          通用字典多列共用；本列自定义只作用于当前列。
        </p>
        <div class="mb-3 flex items-center gap-2">
          <Select
            class="min-w-52"
            :options="dictChoices"
            :value="editing.dictCode || ''"
            @update:value="(v) => onDictCode(String(v || ''))"
          />
          <Button v-if="!editing.dictCode" size="small" @click="openSaveAsDict">
            存为通用字典
          </Button>
        </div>
        <div
          v-for="(opt, index) in options"
          :key="index"
          class="mb-2 grid grid-cols-7 items-center gap-2"
        >
          <Input
            class="col-span-2"
            :disabled="!!editing.dictCode"
            :value="opt.value"
            placeholder="存储值"
            @update:value="(v) => (opt.value = String(v || ''))"
          />
          <Input
            class="col-span-2"
            :disabled="!!editing.dictCode"
            :value="opt.label"
            placeholder="显示文案"
            @update:value="(v) => (opt.label = String(v || ''))"
          />
          <Select
            class="col-span-2 w-full"
            :disabled="!!editing.dictCode"
            :options="TONE_OPTIONS"
            :value="opt.tone || ''"
            @update:value="(v) => (opt.tone = String(v || ''))"
          />
          <Button
            v-if="!editing.dictCode"
            danger
            size="small"
            type="text"
            @click="removeOption(index)"
          >
            删
          </Button>
        </div>
        <Button
          v-if="!editing.dictCode"
          class="mb-6"
          size="small"
          @click="addOption"
        >
          添加映射
        </Button>
        <p v-else class="mb-6 text-xs text-muted-foreground">
          项在「通用字典」页修改，保存后各列一起生效。
        </p>

        <div class="mb-1 text-sm font-medium">格式化函数</div>
        <p class="mb-2 text-xs text-muted-foreground">
          参数
          <code>value</code>（映射后文案）、<code>row</code>（当前行）、<code>raw</code>（原值）。可写
          <code>return …</code> 或直接表达式。
        </p>
        <Input.TextArea
          v-model:value="editing.formatFn"
          :placeholder="FORMAT_PLACEHOLDER"
          :rows="4"
          class="mb-6 font-mono text-xs"
        />

        <div class="mb-1 text-sm font-medium">Render（HTML）</div>
        <p class="mb-2 text-xs text-muted-foreground">
          返回 HTML 字符串。同样是 value / row / raw。脚本标签会被去掉。
        </p>
        <Input.TextArea
          v-model:value="editing.renderFn"
          :placeholder="RENDER_PLACEHOLDER"
          :rows="4"
          class="mb-6 font-mono text-xs"
        />

        <div class="mb-1 text-sm font-medium">条件着色</div>
        <p class="mb-2 text-xs text-muted-foreground">
          给金额、天数等连续值用。枚举请用字典颜色。
        </p>
        <div class="grid grid-cols-3 gap-2">
          <Select
            :options="[
              { label: '等于', value: 'eq' },
              { label: '大于', value: 'gt' },
              { label: '小于', value: 'lt' },
            ]"
            :value="rule.op"
            @update:value="(v) => (rule.op = String(v))"
          />
          <Input v-model:value="rule.value" placeholder="比较值" />
          <Select
            :options="TONE_OPTIONS.filter((t) => t.value)"
            :value="rule.tone"
            @update:value="(v) => (rule.tone = String(v))"
          />
        </div>
        <div class="mt-6 flex justify-end">
          <Button type="primary" @click="saveDrawer">确定</Button>
        </div>
      </template>
    </Drawer>

    <Modal
      v-model:open="saveDictOpen"
      title="存为通用字典"
      @ok="confirmSaveAsDict"
    >
      <div class="mb-3">
        <div class="mb-1 text-xs text-muted-foreground">编码</div>
        <Input v-model:value="saveDraft.code" class="font-mono" />
      </div>
      <div>
        <div class="mb-1 text-xs text-muted-foreground">名称</div>
        <Input v-model:value="saveDraft.name" />
      </div>
    </Modal>
  </div>
</template>
