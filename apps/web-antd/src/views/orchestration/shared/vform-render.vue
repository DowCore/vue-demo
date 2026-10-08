<script lang="ts" setup>
/** 按 VForm3 JSON 渲染整张表单 */
import { computed, onMounted, ref, watch } from 'vue';

import { runWidgetEvent } from './vform-events';
import { layoutWidth, parseVForm } from './vform-model';
import VFormNode from './vform-node.vue';

defineOptions({ name: 'VFormRender' });

const props = defineProps<{
  json?: string;
  modelValue?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
}>();

const doc = computed(() => parseVForm(props.json));
const model = ref<Record<string, unknown>>({ ...props.modelValue });

watch(
  () => props.modelValue,
  (value) => {
    model.value = { ...value };
  },
);

onMounted(() => {
  runWidgetEvent(doc.value.formConfig.onFormCreated, {
    formModel: model.value,
  });
  runWidgetEvent(doc.value.formConfig.onFormMounted, {
    formModel: model.value,
  });
});
</script>

<template>
  <div
    class="mx-auto"
    :style="{ maxWidth: layoutWidth(doc.formConfig.layoutType) }"
  >
    <VFormNode
      v-for="widget in doc.widgetList"
      :key="widget.id"
      :label-position="doc.formConfig.labelPosition"
      :label-width="doc.formConfig.labelWidth"
      :model="model"
      :widget="widget"
      @update:model="
        (v) => {
          model = v;
          emit('update:modelValue', v);
          runWidgetEvent(doc.formConfig.onFormDataChange, { formModel: v });
        }
      "
    />
  </div>
</template>
