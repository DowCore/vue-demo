<script lang="ts" setup>
import type { ResourceFlowBindings } from './form-flow-binder.vue';

/**
 * 表单设计器外壳：内嵌 VForm3 设计器（widgetList + formConfig）
 */
import type { FormDef, ListColumnDef } from '#/api/saas/orchestration';

import { computed, ref } from 'vue';

import { Collapse, CollapsePanel } from 'ant-design-vue';

import FormFlowBinder from './form-flow-binder.vue';
import FormPreviewModal from './form-preview-modal.vue';
import { normalizeFormDef } from './form-schema';
import VFormDesigner from './vform-designer.vue';

defineOptions({ name: 'FormLayoutDesigner' });

const props = defineProps<{
  columns: ListColumnDef[];
  modelValue: FormDef;
  title?: string;
  code?: string;
  status?: number;
  resourceCode?: string;
  codePrefix?: string;
  resourceFlows?: ResourceFlowBindings;
  allowEmptyColumns?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: FormDef];
  'update:resourceFlows': [value: ResourceFlowBindings];
}>();

const previewOpen = ref(false);

const schema = computed(() => normalizeFormDef(props.modelValue));

function onVformChange(json: string) {
  emit(
    'update:modelValue',
    normalizeFormDef({
      ...props.modelValue,
      vformJson: json,
    }),
  );
}
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <div class="text-sm font-medium">{{ title || '表单设计' }}</div>
        <p class="mt-0.5 text-xs text-muted-foreground">
          左侧同时列出容器和字段，拖到画布或栅格列中。
        </p>
      </div>
    </div>

    <Collapse v-if="resourceCode || resourceFlows" class="mb-3" ghost>
      <CollapsePanel key="flow" header="关联逻辑编排">
        <FormFlowBinder
          :model-value="modelValue"
          :resource-code="resourceCode"
          :code-prefix="codePrefix || resourceCode"
          :resource-flows="resourceFlows"
          @update:model-value="
            (v) =>
              emit(
                'update:modelValue',
                normalizeFormDef({ ...v, vformJson: modelValue.vformJson }),
              )
          "
          @update:resource-flows="(v) => emit('update:resourceFlows', v)"
        />
      </CollapsePanel>
    </Collapse>

    <VFormDesigner
      :columns="columns"
      :json="schema.vformJson"
      @change="onVformChange"
      @preview="previewOpen = true"
    />

    <FormPreviewModal
      v-model:open="previewOpen"
      :code="code"
      :schema="schema"
      :status="status"
      :title="title"
    />
  </div>
</template>
