<script lang="ts" setup>
/**
 * 独立表单库 · 设计页
 * 设计器产出 FormDef JSON → 保存/发布；预览与运行走 FormSchemaRenderer
 */
import type { FormDef, FormDefinition } from '#/api/saas/orchestration';

import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Button, message, Space } from 'ant-design-vue';

import {
  getFormDefinitionApi,
  publishFormDefinitionApi,
  updateFormDefinitionApi,
} from '#/api/saas/orchestration';
import FormLayoutDesigner from '#/views/orchestration/shared/form-layout-designer.vue';
import { normalizeFormDef } from '#/views/orchestration/shared/form-schema';

defineOptions({ name: 'OrchestrationFormDesigner' });

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const form = ref<FormDefinition | null>(null);

const schemaModel = computed({
  get: (): FormDef => form.value?.schema || { fields: [] },
  set: (value: FormDef) => {
    if (form.value) form.value.schema = normalizeFormDef(value);
  },
});

async function load() {
  const id = String(route.query.id || '');
  if (!id) {
    message.warning('缺少表单 Id');
    return;
  }
  loading.value = true;
  try {
    form.value = await getFormDefinitionApi(id);
    form.value.schema = normalizeFormDef(form.value.schema || { fields: [] });
    form.value.fieldCatalog ??= [];
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.value) return;
  saving.value = true;
  try {
    form.value = await updateFormDefinitionApi(form.value.id, {
      name: form.value.name,
      description: form.value.description,
      sourceResourceCode: form.value.sourceResourceCode,
      schema: normalizeFormDef(form.value.schema),
      fieldCatalog: form.value.fieldCatalog || [],
    });
    message.success('已保存 Schema JSON');
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!form.value) return;
  await save();
  form.value = await publishFormDefinitionApi(form.value.id);
  message.success('已发布，可被资源/报表/OA 通过 formRef 引用');
}

onMounted(load);
</script>

<template>
  <Page :loading="loading" title="表单设计">
    <template #extra>
      <Space>
        <Button type="text" @click="router.push('/orchestration/forms')">
          返回列表
        </Button>
        <Button :loading="saving" @click="save">保存</Button>
        <Button type="primary" @click="publish">发布</Button>
      </Space>
    </template>

    <FormLayoutDesigner
      v-if="form"
      v-model:model-value="schemaModel"
      allow-empty-columns
      :code="form.code"
      :code-prefix="form.code"
      :columns="form.fieldCatalog || []"
      :status="form.status"
      :title="`${form.name} (${form.code})`"
    />
  </Page>
</template>
