<script lang="ts" setup>
/**
 * 表单预览弹窗（对标 FcDesigner / VForm3 previewForm）
 * 只走 FormSchemaRenderer，不进入设计态；试填数据不回写 Schema。
 */
import type { FormDef } from '#/api/saas/orchestration';

import { computed, ref, watch } from 'vue';

import { Button, message, Modal, Segmented, Space, Tag } from 'ant-design-vue';

import {
  buildSampleRecord,
  emptyRecord,
  normalizeFormDef,
} from './form-schema';
import FormSchemaRenderer from './form-schema-renderer.vue';
import { validateFormFields } from './form-validation';

defineOptions({ name: 'FormPreviewModal' });

const props = defineProps<{
  open: boolean;
  schema: FormDef | null | undefined;
  title?: string;
  code?: string;
  /** 0 草稿 1 已发布 */
  status?: number;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const mode = ref<'create' | 'detail' | 'update'>('create');
const device = ref<'mobile' | 'pc'>('pc');
const record = ref<Record<string, unknown>>({});
const showData = ref(false);

const submitText = computed(() => JSON.stringify(record.value, null, 2));

const normalized = computed(() =>
  normalizeFormDef(props.schema || { fields: [] }),
);

const contentWidth = computed(() =>
  device.value === 'mobile' ? '375px' : '100%',
);

function resetEmpty() {
  record.value = emptyRecord(normalized.value.fields);
}

function fillSample() {
  record.value = buildSampleRecord(normalized.value.fields);
}

function validate() {
  if (mode.value === 'detail') {
    message.info('阅读态无需校验');
    return;
  }
  const err = validateFormFields(
    normalized.value.fields,
    record.value,
    mode.value,
  );
  if (err) {
    message.warning(err);
    return;
  }
  message.success('校验通过（预览不落库）');
  showData.value = true;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    mode.value = 'create';
    device.value = 'pc';
    showData.value = false;
    resetEmpty();
  },
);
</script>

<template>
  <Modal
    :open="open"
    :footer="null"
    :width="device === 'mobile' ? 440 : 760"
    destroy-on-close
    @update:open="(v) => emit('update:open', v)"
  >
    <template #title>
      <div class="flex flex-wrap items-center gap-2 pr-6">
        <span>预览 · {{ title || '表单' }}</span>
        <span v-if="code" class="font-mono text-xs text-muted-foreground">
          {{ code }}
        </span>
        <Tag v-if="status === 1" color="success">已发布</Tag>
        <Tag v-else-if="status === 0" color="default">草稿</Tag>
      </div>
    </template>

    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <Segmented
        v-model:value="mode"
        size="small"
        :options="[
          { label: '填写·新增', value: 'create' },
          { label: '填写·编辑', value: 'update' },
          { label: '阅读·详情', value: 'detail' },
        ]"
      />
      <Segmented
        v-model:value="device"
        size="small"
        :options="[
          { label: '电脑端', value: 'pc' },
          { label: '移动端', value: 'mobile' },
        ]"
      />
    </div>

    <div
      class="mx-auto rounded-lg border border-border bg-card p-4 transition-all"
      :style="{ maxWidth: contentWidth, width: '100%' }"
    >
      <FormSchemaRenderer
        v-model:model-value="record"
        :mode="mode"
        :schema="normalized"
      />
    </div>

    <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
      <Space wrap>
        <Button size="small" @click="resetEmpty">重置空值</Button>
        <Button size="small" @click="fillSample">填充示例</Button>
        <Button
          v-if="mode !== 'detail'"
          size="small"
          type="primary"
          @click="validate"
        >
          校验
        </Button>
        <Button size="small" type="link" @click="showData = !showData">
          {{ showData ? '收起' : '查看' }}提交数据
        </Button>
      </Space>
      <span class="text-[11px] text-muted-foreground"> 预览不落库 </span>
    </div>

    <div v-if="showData" class="mt-3">
      <div class="mb-1 text-xs text-muted-foreground">
        提交数据结构（提交流入参 record。子表单是数组，树的下级在 children）
      </div>
      <pre
        class="max-h-56 overflow-auto rounded border border-border bg-muted/30 p-3 font-mono text-[11px]"
        >{{ submitText }}</pre>
    </div>
  </Modal>
</template>
