<script lang="ts" setup>
/**
 * 表单 Schema 渲染器（运行时基础文件）
 * 输入：FormDef 描述 JSON；输出：按 control 映射到基础控件（RecordFormFields）
 * 对标 VFormRender / form-create 解析 rule 渲染 —— 设计器只改 JSON，此处只读 JSON。
 */
import type { FormDef } from '#/api/saas/orchestration';

import { computed } from 'vue';

import FormLayoutView from './form-layout-view.vue';
import { normalizeFormDef } from './form-schema';
import VFormRender from './vform-render.vue';

defineOptions({ name: 'FormSchemaRenderer' });

const props = withDefaults(
  defineProps<{
    /** 表单描述 JSON（FormDef） */
    schema: FormDef | null | undefined;
    mode: 'create' | 'detail' | 'update';
    modelValue: Record<string, unknown>;
  }>(),
  {},
);

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
}>();

const schema = computed(() => normalizeFormDef(props.schema || { fields: [] }));
</script>

<template>
  <div class="form-schema-renderer">
    <div
      v-if="
        !schema.vformJson && !schema.layout?.length && !schema.fields.length
      "
      class="py-12 text-center text-sm text-muted-foreground"
    >
      当前 Schema 无字段
    </div>
    <VFormRender
      v-if="schema.vformJson"
      :json="schema.vformJson"
      :model-value="modelValue"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
    <FormLayoutView
      v-else
      :mode="mode"
      :model-value="modelValue"
      :schema="schema"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
  </div>
</template>
