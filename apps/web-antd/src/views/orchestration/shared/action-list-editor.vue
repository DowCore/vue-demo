<script lang="ts" setup>
import type { ActionDef, ListColumnDef } from '#/api/saas/orchestration';

import { computed, onMounted, ref } from 'vue';

import { Button, Input, InputNumber, Select, Switch } from 'ant-design-vue';

import { getReusableFlowLookupApi } from '#/api/saas/orchestration';

import { actionPlacement, actionSupportsMultiSelect } from './open-action';

defineOptions({ name: 'ActionListEditor' });

const props = defineProps<{
  /** 列字段，用于行参 / 表白名单选择 */
  columns?: ListColumnDef[];
  modelValue: ActionDef[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: ActionDef[]];
}>();

const flowOptions = ref<{ label: string; value: string }[]>([]);

const fieldOptions = computed(() =>
  (props.columns || []).map((c) => ({
    label: `${c.title || c.field} (${c.field})`,
    value: c.field,
  })),
);

const KIND_PRESETS: Record<string, Partial<ActionDef>> = {
  create: {
    label: '新增',
    scene: 'toolbar',
    position: 'toolbar',
    scope: 'none',
    kind: 'create',
    open: 'page',
    formKey: 'create',
    formMode: 'create',
    flowKey: 'sys.resource.create',
    fieldsMode: 'full',
    after: 'refresh',
  },
  update: {
    label: '编辑',
    scene: 'row',
    position: 'row',
    scope: 'row',
    kind: 'update',
    open: 'page',
    formKey: 'update',
    formMode: 'update',
    fixed: 'right',
    flowKey: 'sys.resource.update',
    fieldsMode: 'full',
    after: 'refresh',
  },
  detail: {
    label: '详情',
    scene: 'row',
    position: 'row',
    scope: 'row',
    kind: 'detail',
    open: 'page',
    formKey: 'detail',
    formMode: 'detail',
    fixed: 'right',
    flowKey: 'sys.resource.get',
    fieldsMode: 'full',
    after: 'none',
  },
  delete: {
    label: '删除',
    scene: 'row',
    position: 'row',
    scope: 'row',
    kind: 'delete',
    open: 'none',
    confirm: true,
    confirmText: '确认删除？',
    fixed: 'right',
    flowKey: 'sys.resource.delete',
    fieldsMode: 'none',
    after: 'refresh',
  },
  custom: {
    label: '新按钮',
    scene: 'toolbar',
    position: 'toolbar',
    scope: 'none',
    kind: 'custom',
    open: 'none',
    fieldsMode: 'none',
    after: 'refresh',
    confirm: false,
  },
};

function uniqueKey(base: string) {
  const used = new Set(props.modelValue.map((a) => a.key));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function addAction(kind: string) {
  const preset = KIND_PRESETS[kind] || KIND_PRESETS.custom || {};
  const key = uniqueKey(
    kind === 'custom' ? `btn_${Date.now().toString(36)}` : kind,
  );
  emit('update:modelValue', [
    ...props.modelValue,
    {
      key,
      label: preset.label || '新按钮',
      position: preset.position || 'toolbar',
      scene: preset.scene || 'toolbar',
      scope: preset.scope || 'none',
      kind: preset.kind || 'custom',
      flowKey: preset.flowKey,
      open: preset.open || 'none',
      fixed: preset.fixed,
      formKey: preset.formKey,
      formMode: preset.formMode,
      fieldsMode: preset.fieldsMode || 'full',
      fields: [],
      payloadFields: [],
      after: preset.after || 'refresh',
      confirm: preset.confirm,
      confirmText: preset.confirmText,
      description: '',
      multiSelect: false,
      batchLimit: 100,
    },
  ]);
}

function patch(index: number, next: Partial<ActionDef>) {
  emit(
    'update:modelValue',
    props.modelValue.map((a, i) => (i === index ? { ...a, ...next } : a)),
  );
}

function removeAt(index: number) {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  );
}

function actionScope(row: boolean, multi: boolean) {
  if (multi) return 'selection';
  if (row) return 'row';
  return 'none';
}

function onKind(index: number, kind: string) {
  const current = props.modelValue[index];
  if (!current) return;
  const preset = KIND_PRESETS[kind] || {};
  patch(index, {
    kind,
    formKey: preset.formKey,
    formMode: preset.formMode,
    open: preset.open,
    confirm: preset.confirm,
    confirmText: preset.confirmText,
    fieldsMode: preset.fieldsMode,
    after: preset.after,
    flowKey: preset.flowKey || current.flowKey,
    fixed: actionPlacement(current) === 'row' ? 'right' : current.fixed,
  });
}

function onPlacement(index: number, value: string) {
  const current = props.modelValue[index];
  if (!current) return;
  const row = value === 'row';
  patch(index, {
    scene: value,
    position: value,
    fixed: row ? 'right' : '',
    scope: actionScope(row, actionSupportsMultiSelect(current)),
  });
}

function onMultiSelect(index: number, enabled: boolean) {
  const current = props.modelValue[index];
  if (!current) return;
  const row = actionPlacement(current) === 'row';
  patch(index, {
    multiSelect: enabled,
    scope: actionScope(row, enabled),
  });
}

function showFormBind(action: ActionDef) {
  return (
    action.open === 'page' ||
    action.open === 'drawer' ||
    action.open === 'modal'
  );
}

function showFlowBind(action: ActionDef) {
  // 自定义 / 直接执行 / 打开表单后走提交流均可绑 flowKey
  return (
    action.kind === 'custom' ||
    action.open === 'none' ||
    action.kind === 'create' ||
    action.kind === 'update' ||
    action.kind === 'delete'
  );
}

onMounted(async () => {
  try {
    const res = await getReusableFlowLookupApi();
    flowOptions.value = (res.items || []).map((x) => ({
      label: `${x.name} (${x.code})`,
      value: x.code,
    }));
  } catch {
    flowOptions.value = [];
  }
});
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <div class="text-sm font-medium">按钮</div>
        <p class="mt-1 text-xs text-muted-foreground">
          通用增删改走系统流；自定义按钮绑定已发布
          flowKey，可传整行或指定行字段。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button size="small" @click="addAction('create')">新增</Button>
        <Button size="small" @click="addAction('update')">编辑</Button>
        <Button size="small" @click="addAction('detail')">详情</Button>
        <Button size="small" @click="addAction('delete')">删除</Button>
        <Button size="small" type="primary" ghost @click="addAction('custom')">
          添加按钮
        </Button>
      </div>
    </div>

    <div
      v-if="!modelValue.length"
      class="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground"
    >
      还没有按钮。点右上角添加，或到「查询源」绑定写入资源后同步带入。
    </div>

    <div class="space-y-3">
      <div
        v-for="(action, index) in modelValue"
        :key="action.key"
        class="rounded-md border border-border p-3"
      >
        <div class="grid gap-2 md:grid-cols-4">
          <Input
            :value="action.label"
            placeholder="按钮文字"
            @update:value="(v) => patch(index, { label: String(v || '') })"
          />
          <Select
            class="w-full"
            :value="actionPlacement(action)"
            :options="[
              { label: '工具栏', value: 'toolbar' },
              { label: '行内（右侧固定）', value: 'row' },
            ]"
            @update:value="(v) => onPlacement(index, String(v || 'toolbar'))"
          />
          <Select
            class="w-full"
            :value="action.kind"
            :options="[
              { label: '新增', value: 'create' },
              { label: '编辑', value: 'update' },
              { label: '详情', value: 'detail' },
              { label: '删除', value: 'delete' },
              { label: '自定义', value: 'custom' },
            ]"
            @update:value="(v) => onKind(index, String(v))"
          />
          <Select
            class="w-full"
            :value="action.open || 'drawer'"
            :options="[
              { label: '新标签页', value: 'page' },
              { label: '抽屉', value: 'drawer' },
              { label: '弹窗', value: 'modal' },
              { label: '不打开（直接执行）', value: 'none' },
            ]"
            @update:value="(v) => patch(index, { open: String(v) })"
          />
        </div>

        <div class="mt-2 grid gap-2 md:grid-cols-3">
          <Input
            :value="action.description"
            placeholder="按钮说明（选填）"
            @update:value="
              (v) => patch(index, { description: String(v || '') })
            "
          />
          <Select
            v-if="showFormBind(action)"
            class="w-full"
            :value="action.formKey || action.formMode || action.kind"
            :options="[
              { label: '新增表单', value: 'create' },
              { label: '编辑表单', value: 'update' },
              { label: '详情表单', value: 'detail' },
            ]"
            @update:value="
              (v) => patch(index, { formKey: String(v), formMode: String(v) })
            "
          />
          <Select
            v-if="showFormBind(action)"
            class="w-full"
            :value="action.fieldsMode || 'full'"
            :options="[
              { label: '完整表单', value: 'full' },
              { label: '白名单字段', value: 'whitelist' },
              { label: '无表单', value: 'none' },
            ]"
            @update:value="(v) => patch(index, { fieldsMode: String(v) })"
          />
        </div>

        <div
          v-if="showFormBind(action) && action.fieldsMode === 'whitelist'"
          class="mt-2"
        >
          <div class="mb-1 text-xs text-muted-foreground">
            弹窗白名单字段（少字段改值）
          </div>
          <Select
            allow-clear
            class="w-full"
            mode="multiple"
            :options="fieldOptions"
            placeholder="选择字段"
            show-search
            :value="action.fields || []"
            @update:value="
              (v) => patch(index, { fields: (v as string[]) || [] })
            "
          />
        </div>

        <div v-if="showFlowBind(action)" class="mt-2 grid gap-2 md:grid-cols-2">
          <div>
            <div class="mb-1 text-xs text-muted-foreground">
              逻辑编排 flowKey
              <span v-if="action.kind === 'custom' && action.open === 'none'">
                （必填）
              </span>
            </div>
            <Select
              allow-clear
              class="w-full"
              :options="flowOptions"
              placeholder="选择已发布逻辑，或手工输入"
              show-search
              :filter-option="
                (input, opt) =>
                  String(opt?.label || '')
                    .toLowerCase()
                    .includes(String(input || '').toLowerCase())
              "
              :value="action.flowKey || undefined"
              @update:value="
                (v) => patch(index, { flowKey: v ? String(v) : undefined })
              "
            />
            <Input
              class="mt-1 font-mono"
              placeholder="或直接填 flowKey"
              :value="action.flowKey"
              @update:value="
                (v) => patch(index, { flowKey: String(v || '') || undefined })
              "
            />
          </div>
          <div>
            <div class="mb-1 text-xs text-muted-foreground">
              行参字段（空=整行）
            </div>
            <Select
              allow-clear
              class="w-full"
              mode="multiple"
              :options="fieldOptions"
              placeholder="执行时从当前行/勾选行抽取"
              show-search
              :value="action.payloadFields || []"
              @update:value="
                (v) => patch(index, { payloadFields: (v as string[]) || [] })
              "
            />
            <div class="mt-2">
              <div class="mb-1 text-xs text-muted-foreground">执行后</div>
              <Select
                class="w-full"
                :value="action.after || 'refresh'"
                :options="[
                  { label: '刷新列表', value: 'refresh' },
                  { label: '关闭并刷新', value: 'close' },
                  { label: '无动作', value: 'none' },
                ]"
                @update:value="(v) => patch(index, { after: String(v) })"
              />
            </div>
          </div>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-4">
          <div
            v-if="action.kind !== 'create'"
            class="flex items-center gap-2 text-sm"
          >
            支持多选
            <Switch
              :checked="actionSupportsMultiSelect(action)"
              @update:checked="(v) => onMultiSelect(index, !!v)"
            />
          </div>
          <div
            v-if="actionSupportsMultiSelect(action)"
            class="flex items-center gap-2 text-sm"
          >
            批上限
            <InputNumber
              :max="500"
              :min="1"
              size="small"
              :value="action.batchLimit || 100"
              @update:value="
                (v) => patch(index, { batchLimit: Number(v) || 100 })
              "
            />
          </div>
          <div
            v-if="actionPlacement(action) === 'row'"
            class="flex items-center gap-2 text-sm"
          >
            钉在最右侧
            <Switch
              :checked="action.fixed !== 'none'"
              @update:checked="
                (v) => patch(index, { fixed: v ? 'right' : 'none' })
              "
            />
          </div>
          <div class="flex items-center gap-2 text-sm">
            二次确认
            <Switch
              :checked="!!action.confirm"
              @update:checked="(v) => patch(index, { confirm: !!v })"
            />
          </div>
          <Input
            v-if="action.confirm"
            class="max-w-xs"
            placeholder="确认文案"
            :value="action.confirmText"
            @update:value="
              (v) => patch(index, { confirmText: String(v || '') })
            "
          />
          <div class="ml-auto">
            <Button danger size="small" type="text" @click="removeAt(index)">
              删除
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
