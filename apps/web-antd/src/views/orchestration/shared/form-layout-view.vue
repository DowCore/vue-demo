<script lang="ts" setup>
/**
 * 按 FormDef.layout 渲染：容器（栅格/卡片/数据表格/子表单）+ 基础字段
 * 无 layout 时回退扁平 fields
 */
import type { FormDef, FormWidgetDef } from '#/api/saas/orchestration';

import { computed } from 'vue';

import { flattenLayout, normalizeFormDef } from './form-schema';
import RecordFormFields from './record-form-fields.vue';

defineOptions({ name: 'FormLayoutView' });

const props = defineProps<{
  schema: FormDef;
  mode: 'create' | 'detail' | 'update';
  modelValue: Record<string, unknown>;
  fieldPermissions?: Record<string, string>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
}>();

const normalized = computed(() => normalizeFormDef(props.schema));
const layout = computed(() => normalized.value.layout || []);

function gridStyle(node: FormWidgetDef) {
  const n = Math.min(4, Math.max(1, node.columns || 1));
  return { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
}

function asFields(nodes: FormWidgetDef[]) {
  return flattenLayout(nodes);
}
</script>

<template>
  <div v-if="layout.length" class="space-y-4">
    <template v-for="node in layout" :key="node.id">
      <div
        v-if="
          node.kind === 'container' && node.container === 'grid' && !node.hidden
        "
        class="grid gap-3"
        :style="gridStyle(node)"
      >
        <div
          v-for="child in node.children || []"
          :key="child.id"
          class="min-w-0"
        >
          <RecordFormFields
            v-if="child.kind === 'field'"
            :field-permissions="fieldPermissions"
            :fields="asFields([child])"
            :mode="mode"
            :model-value="modelValue"
            @update:model-value="(v) => emit('update:modelValue', v)"
          />
        </div>
      </div>

      <div
        v-else-if="
          node.kind === 'container' && node.container === 'card' && !node.hidden
        "
        class="rounded-lg border border-border p-3"
      >
        <div class="mb-2 text-sm font-medium">{{ node.title || '卡片' }}</div>
        <div
          class="grid gap-3"
          :style="gridStyle({ ...node, columns: node.columns || 1 })"
        >
          <div v-for="child in node.children || []" :key="child.id">
            <RecordFormFields
              v-if="child.kind === 'field'"
              :field-permissions="fieldPermissions"
              :fields="asFields([child])"
              :mode="mode"
              :model-value="modelValue"
              @update:model-value="(v) => emit('update:modelValue', v)"
            />
          </div>
        </div>
      </div>

      <RecordFormFields
        v-else-if="
          node.kind === 'container' &&
          (node.container === 'data-table' || node.container === 'subform') &&
          !node.hidden
        "
        :field-permissions="fieldPermissions"
        :fields="asFields([node])"
        :mode="mode"
        :model-value="modelValue"
        @update:model-value="(v) => emit('update:modelValue', v)"
      />

      <RecordFormFields
        v-else-if="node.kind === 'field' && !node.hidden"
        :field-permissions="fieldPermissions"
        :fields="asFields([node])"
        :mode="mode"
        :model-value="modelValue"
        @update:model-value="(v) => emit('update:modelValue', v)"
      />
    </template>
  </div>
  <RecordFormFields
    v-else
    :field-permissions="fieldPermissions"
    :fields="normalized.fields"
    :mode="mode"
    :model-value="modelValue"
    @update:model-value="(v) => emit('update:modelValue', v)"
  />
</template>
