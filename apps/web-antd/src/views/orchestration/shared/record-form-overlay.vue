<script lang="ts" setup>
import type { FormFieldDef } from '#/api/saas/orchestration';

import { computed } from 'vue';

import { Button, Drawer, Modal } from 'ant-design-vue';

import FormSchemaRenderer from './form-schema-renderer.vue';

defineOptions({ name: 'RecordFormOverlay' });

const props = defineProps<{
  fields: FormFieldDef[];
  host: 'drawer' | 'modal';
  mode: 'create' | 'detail' | 'update';
  modelValue: Record<string, unknown>;
  open: boolean;
  saving?: boolean;
  title: string;
}>();

const emit = defineEmits<{
  submit: [];
  'update:modelValue': [value: Record<string, unknown>];
  'update:open': [value: boolean];
}>();

const schema = computed(() => ({ fields: props.fields || [] }));

function setOpen(value: boolean) {
  emit('update:open', value);
}
</script>

<template>
  <Modal
    v-if="host === 'modal'"
    :footer="null"
    :open="open"
    :title="title"
    destroy-on-close
    width="640"
    @cancel="setOpen(false)"
    @update:open="setOpen"
  >
    <FormSchemaRenderer
      :mode="mode"
      :model-value="modelValue"
      :schema="schema"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
    <div v-if="mode !== 'detail'" class="mt-4 flex justify-end">
      <Button :loading="saving" type="primary" @click="emit('submit')">
        提交
      </Button>
    </div>
  </Modal>
  <Drawer
    v-else
    :open="open"
    :title="title"
    destroy-on-close
    width="560"
    @update:open="setOpen"
  >
    <FormSchemaRenderer
      :mode="mode"
      :model-value="modelValue"
      :schema="schema"
      @update:model-value="(v) => emit('update:modelValue', v)"
    />
    <div v-if="mode !== 'detail'" class="mt-4 flex justify-end">
      <Button :loading="saving" type="primary" @click="emit('submit')">
        提交
      </Button>
    </div>
  </Drawer>
</template>
