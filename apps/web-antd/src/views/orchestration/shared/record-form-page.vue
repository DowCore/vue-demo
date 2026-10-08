<script lang="ts" setup>
import type { FormPageSource } from './open-action';

import type {
  AppResource,
  FormDef,
  FormFieldDef,
  ReportDefinition,
} from '#/api/saas/orchestration';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useTabs } from '@vben/hooks';

import { Button, message } from 'ant-design-vue';

import {
  createAppResourceRecordApi,
  getAppResourceRecordApi,
  getPublishedAppResourceApi,
  getPublishedReportApi,
  runLogicApi,
  updateAppResourceRecordApi,
} from '#/api/saas/orchestration';

import FormSchemaRenderer from './form-schema-renderer.vue';
import { validateFormFields } from './form-validation';
import { pickRecordValue } from './format-cell';
import { formModeLabel } from './open-action';

defineOptions({ name: 'RecordFormPage' });

const props = defineProps<{
  source: FormPageSource;
}>();

const route = useRoute();
const router = useRouter();
const { setTabTitle } = useTabs();

const loading = ref(false);
const saving = ref(false);
const report = ref<null | ReportDefinition>(null);
const resource = ref<AppResource | null>(null);
const formRecord = ref<Record<string, unknown>>({});
const concurrencyStamp = ref('');

const code = computed(() => String(route.params.code || ''));
const formKey = computed(() => String(route.params.formKey || 'detail'));
const recordId = computed(() => {
  const raw = route.params.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? String(value) : '';
});

const mode = computed<'create' | 'detail' | 'update'>(() => {
  if (formKey.value === 'create') return 'create';
  if (formKey.value === 'update') return 'update';
  return 'detail';
});

const listPath = computed(() =>
  props.source === 'report'
    ? `/app/reports/${code.value}`
    : `/app/${code.value}`,
);

const formDef = computed<FormDef>(() => {
  const reportForm = report.value?.form;
  if (reportForm?.fields?.length) return reportForm;
  return resource.value?.form || { fields: [] };
});

const visibleFields = computed(() =>
  (formDef.value.fields || []).filter((field) => {
    if (mode.value === 'create') return field.visibleOnCreate !== false;
    if (mode.value === 'update') return field.visibleOnUpdate !== false;
    return field.visibleOnDetail !== false;
  }),
);

const title = computed(() => {
  const name = report.value?.name || resource.value?.name || code.value;
  return `${formModeLabel(formKey.value)} · ${name}`;
});

function emptyRecord(fields: FormFieldDef[]) {
  const next: Record<string, unknown> = {};
  for (const field of fields) next[field.field] = undefined;
  return next;
}

function fillRecord(record: Record<string, unknown>, fields: FormFieldDef[]) {
  const next: Record<string, unknown> = {};
  for (const field of fields) {
    next[field.field] = pickRecordValue(record, field.field);
  }
  return next;
}

async function loadMeta() {
  if (props.source === 'report') {
    report.value = await getPublishedReportApi(code.value);
    resource.value = report.value.resourceCode
      ? await getPublishedAppResourceApi(report.value.resourceCode)
      : null;
  } else {
    resource.value = await getPublishedAppResourceApi(code.value);
    report.value = null;
  }
}

async function loadRecord() {
  const resourceCode = resource.value?.code;
  if (!resourceCode) {
    message.warning('未绑定资源，无法打开表单');
    return;
  }
  if (mode.value === 'create') {
    formRecord.value = emptyRecord(formDef.value.fields || []);
    concurrencyStamp.value = '';
    return;
  }
  if (!recordId.value) {
    message.warning('缺少记录 Id');
    return;
  }
  const res = await getAppResourceRecordApi(resourceCode, recordId.value);
  if (!res.success) {
    message.error(res.error || '读取失败');
    return;
  }
  const payload = (res.data || {}) as { record?: Record<string, unknown> };
  const record = payload.record || (res.data as Record<string, unknown>);
  formRecord.value = fillRecord(record, formDef.value.fields || []);
  concurrencyStamp.value = String(
    pickRecordValue(record, 'ConcurrencyStamp') ?? '',
  );
}

async function load() {
  if (!code.value) return;
  loading.value = true;
  try {
    await loadMeta();
    await loadRecord();
    await setTabTitle(title.value);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  const resourceCode = resource.value?.code;
  if (mode.value === 'detail') return;
  const err = validateFormFields(
    visibleFields.value,
    formRecord.value,
    mode.value,
  );
  if (err) {
    message.warning(err);
    return;
  }
  saving.value = true;
  try {
    const submitFlow = formDef.value.submitFlowKey?.trim();
    if (submitFlow) {
      const res = await runLogicApi(submitFlow, {
        reportCode: props.source === 'report' ? code.value : undefined,
        resourceCode,
        formKey: formKey.value,
        mode: mode.value,
        id: recordId.value || undefined,
        record: formRecord.value,
      });
      if (res && (res as { success?: boolean }).success === false) {
        message.error(String((res as { error?: string }).error || '提交失败'));
        return;
      }
      message.success('已提交');
      router.push(listPath.value);
      return;
    }
    if (!resourceCode) {
      message.warning('未绑定资源且未配置提交流，无法保存');
      return;
    }
    if (mode.value === 'create') {
      const res = await createAppResourceRecordApi(resourceCode, {
        record: formRecord.value,
      });
      if (!res.success) {
        message.error(res.error || '新增失败');
        return;
      }
      message.success('已新增');
    } else {
      const res = await updateAppResourceRecordApi(resourceCode, {
        id: recordId.value,
        concurrencyStamp: concurrencyStamp.value || undefined,
        record: formRecord.value,
      });
      if (!res.success) {
        message.error(res.error || '更新失败');
        return;
      }
      message.success('已更新');
    }
    router.push(listPath.value);
  } finally {
    saving.value = false;
  }
}

watch(
  () => [
    route.params.code,
    route.params.formKey,
    route.params.id,
    props.source,
  ],
  () => load(),
);

onMounted(load);
</script>

<template>
  <Page
    :description="resource?.tableName || report?.resourceCode || ''"
    :title="title"
  >
    <div v-if="loading" class="py-8 text-sm text-muted-foreground">加载中…</div>
    <template v-else>
      <FormSchemaRenderer
        v-model:model-value="formRecord"
        :mode="mode"
        :schema="formDef"
      />
      <div class="mt-6 flex justify-end gap-2">
        <Button @click="router.push(listPath)">返回列表</Button>
        <Button
          v-if="mode !== 'detail'"
          :loading="saving"
          type="primary"
          @click="submit"
        >
          提交
        </Button>
      </div>
    </template>
  </Page>
</template>
