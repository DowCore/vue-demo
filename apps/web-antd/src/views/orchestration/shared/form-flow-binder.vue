<script lang="ts" setup>
/**
 * 表单 × 逻辑编排统一绑定面板
 * 对标 Camunda formRef / NocoBase 变量契约：
 * FormDef 字段 → Invoker payload.record；提交走 flowKey（系统流可另存为自定义后改画布）
 */
import type { FormDef } from '#/api/saas/orchestration';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Input,
  message,
  Modal,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import {
  cloneFlowAsCustomApi,
  getFlowDefinitionByCodeApi,
  getReusableFlowLookupApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'FormFlowBinder' });

const props = defineProps<{
  modelValue: FormDef;
  /** 资源级 CRUD flowKey（可选，报表仅表单时可不传） */
  resourceFlows?: ResourceFlowBindings;
  resourceCode?: string;
  /** 建议的另存编码前缀，如 order → order.create */
  codePrefix?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: FormDef];
  'update:resourceFlows': [value: ResourceFlowBindings];
}>();

export type ResourceFlowBindings = {
  createFlowKey?: string;
  updateFlowKey?: string;
  getFlowKey?: string;
  deleteFlowKey?: string;
  queryFlowKey?: string;
};

const router = useRouter();
const flowOptions = ref<{ label: string; value: string }[]>([]);
const cloneOpen = ref(false);
const cloning = ref(false);
const cloneForm = reactive({
  sourceCode: 'sys.resource.create',
  newCode: '',
  newName: '',
  publish: true,
  bindTo: 'submit' as 'create' | 'submit' | 'update',
});

const fields = computed(() => props.modelValue?.fields || []);

const contractPreview = computed(() => {
  const record: Record<string, string> = {};
  for (const f of fields.value) {
    record[f.field] = `<${f.control || 'any'}>`;
  }
  return {
    resourceCode: props.resourceCode || '<resourceCode>',
    id: '<更新时>',
    concurrencyStamp: '<更新时>',
    record,
  };
});

const effectiveSubmit = computed(
  () =>
    props.modelValue.submitFlowKey?.trim() ||
    props.resourceFlows?.createFlowKey ||
    'sys.resource.create',
);

function emitForm(patch: Partial<FormDef>) {
  emit('update:modelValue', {
    ...props.modelValue,
    ...patch,
    fields: props.modelValue.fields || [],
  });
}

function emitResource(patch: Partial<ResourceFlowBindings>) {
  emit('update:resourceFlows', {
    ...props.resourceFlows,
    ...patch,
  });
}

function isSystemKey(key?: string) {
  return !!key?.trim().toLowerCase().startsWith('sys.');
}

async function openDesignerFor(flowKey?: string) {
  const key = flowKey?.trim();
  if (!key) {
    message.warning('请先绑定 flowKey');
    return;
  }
  try {
    const def = await getFlowDefinitionByCodeApi(key);
    if (def.isSystem) {
      message.info('系统逻辑只读，请先「另存为自定义」再编辑');
      openClone(key, 'submit');
      return;
    }
    router.push({
      path: '/orchestration/definitions/designer',
      query: { id: def.id },
    });
  } catch {
    message.error(`未找到逻辑「${key}」，请确认已创建或另存为自定义`);
  }
}

function openClone(sourceCode: string, bindTo: typeof cloneForm.bindTo) {
  const prefix =
    (props.codePrefix || props.resourceCode || 'custom').replaceAll(
      /[^a-zA-Z0-9_.-]/g,
      '',
    ) || 'custom';
  const suffix = sourceCode.replace(/^sys\.resource\./, '') || 'flow';
  cloneForm.sourceCode = sourceCode;
  cloneForm.bindTo = bindTo;
  cloneForm.newCode = `${prefix}.${suffix}`;
  cloneForm.newName = `${prefix} ${suffix}`;
  cloneForm.publish = true;
  cloneOpen.value = true;
}

async function confirmClone() {
  if (!cloneForm.newCode.trim() || !cloneForm.newName.trim()) {
    message.warning('请填写新编码与名称');
    return;
  }
  cloning.value = true;
  try {
    const created = await cloneFlowAsCustomApi({
      sourceCode: cloneForm.sourceCode,
      newCode: cloneForm.newCode.trim(),
      newName: cloneForm.newName.trim(),
      category: '表单联动',
      isReusable: true,
      publish: cloneForm.publish,
    });
    const key = created.code;
    if (cloneForm.bindTo === 'submit') {
      emitForm({ submitFlowKey: key });
    } else if (cloneForm.bindTo === 'create') {
      emitResource({ createFlowKey: key });
      emitForm({ submitFlowKey: key });
    } else if (cloneForm.bindTo === 'update') {
      emitResource({ updateFlowKey: key });
    }
    // 刷新可选列表
    await loadFlows();
    cloneOpen.value = false;
    message.success(
      cloneForm.publish
        ? `已另存并发布「${key}」，可改画布后重新发布`
        : `已另存为草稿「${key}」`,
    );
    router.push({
      path: '/orchestration/definitions/designer',
      query: { id: created.id },
    });
  } catch (error) {
    message.error(error instanceof Error ? error.message : '另存失败');
  } finally {
    cloning.value = false;
  }
}

async function loadFlows() {
  try {
    const res = await getReusableFlowLookupApi();
    const items = res.items || [];
    // 系统 CRUD 始终可选（即使未标 reusable）
    const system = [
      'sys.resource.query',
      'sys.resource.get',
      'sys.resource.create',
      'sys.resource.update',
      'sys.resource.delete',
    ];
    const map = new Map<string, string>();
    for (const s of system) {
      map.set(s, `系统 · ${s}`);
    }
    for (const x of items) {
      map.set(x.code, `${x.name} (${x.code})`);
    }
    flowOptions.value = [...map.entries()].map(([value, label]) => ({
      value,
      label,
    }));
  } catch {
    flowOptions.value = [];
  }
}

watch(
  () => props.resourceCode,
  () => {
    if (!cloneForm.newCode && props.resourceCode) {
      cloneForm.newCode = `${props.resourceCode}.create`;
    }
  },
);

onMounted(loadFlows);
</script>

<template>
  <div class="space-y-4">
    <Alert
      show-icon
      type="info"
      message="表单与流程如何统一"
      description="表单只负责字段与校验；提交一律 PublishedFlowInvoker(flowKey)。默认 sys.resource.* 开箱即用；需要发号/写子表/发消息时，另存为自定义逻辑改画布，再把按钮/提交流改绑到新 flowKey。不引入第二套 BPMN 审批画布（人审工作流属后续能力）。"
    />

    <div class="rounded-md border border-border p-3">
      <div class="mb-2 text-sm font-medium">Invoker 入参契约（表单 → 流）</div>
      <p class="mb-2 text-xs text-muted-foreground">
        与 Camunda formRef、NocoBase「表单字段写入节点变量」同构：字段进
        <code class="mx-1">record</code>；流内用 ResourceCreate / Code / HTTP
        消费。
      </p>
      <pre
        class="max-h-40 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed"
        >{{ JSON.stringify(contractPreview, null, 2) }}</pre>
      <div class="mt-2 flex flex-wrap gap-1">
        <Tag v-for="f in fields" :key="f.field" class="font-mono text-[10px]">
          {{ f.field }}
        </Tag>
        <span v-if="!fields.length" class="text-xs text-muted-foreground">请先在画布添加字段</span>
      </div>
    </div>

    <div class="rounded-md border border-border p-3">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm font-medium">提交流（FormDef.submitFlowKey）</div>
        <Space>
          <Button size="small" @click="openClone(effectiveSubmit, 'submit')">
            另存为自定义
          </Button>
          <Button
            size="small"
            type="primary"
            ghost
            @click="openDesignerFor(effectiveSubmit)"
          >
            打开流程设计
          </Button>
        </Space>
      </div>
      <Select
        allow-clear
        class="w-full"
        :options="flowOptions"
        placeholder="空则走资源 create/update 系统流"
        show-search
        :filter-option="
          (input, opt) =>
            String(opt?.label || '')
              .toLowerCase()
              .includes(String(input || '').toLowerCase())
        "
        :value="modelValue.submitFlowKey || undefined"
        @update:value="
          (v) => emitForm({ submitFlowKey: v ? String(v) : undefined })
        "
      />
      <p class="mt-1 text-xs text-muted-foreground">
        当前生效：
        <code class="font-mono">{{ effectiveSubmit }}</code>
        <Tag v-if="isSystemKey(effectiveSubmit)" class="ml-1" color="blue">
          系统
        </Tag>
        <Tag v-else class="ml-1" color="green">自定义</Tag>
      </p>
    </div>

    <div v-if="resourceFlows" class="rounded-md border border-border p-3">
      <div class="mb-2 text-sm font-medium">资源 CRUD 流（一键创建默认）</div>
      <div class="grid gap-3 md:grid-cols-2">
        <div
          v-for="slot in [
            { key: 'queryFlowKey', label: '查询', def: 'sys.resource.query' },
            { key: 'getFlowKey', label: '详情', def: 'sys.resource.get' },
            { key: 'createFlowKey', label: '新增', def: 'sys.resource.create' },
            { key: 'updateFlowKey', label: '更新', def: 'sys.resource.update' },
            { key: 'deleteFlowKey', label: '删除', def: 'sys.resource.delete' },
          ] as const"
          :key="slot.key"
        >
          <div
            class="mb-1 flex items-center justify-between text-xs text-muted-foreground"
          >
            <span>{{ slot.label }}</span>
            <Button
              size="small"
              type="link"
              class="!h-auto !p-0 text-xs"
              @click="
                openClone(
                  resourceFlows?.[slot.key] || slot.def,
                  slot.key === 'createFlowKey'
                    ? 'create'
                    : slot.key === 'updateFlowKey'
                      ? 'update'
                      : 'submit',
                )
              "
            >
              另存
            </Button>
          </div>
          <Select
            allow-clear
            class="w-full"
            :options="flowOptions"
            :placeholder="slot.def"
            show-search
            :filter-option="
              (input, opt) =>
                String(opt?.label || '')
                  .toLowerCase()
                  .includes(String(input || '').toLowerCase())
            "
            :value="resourceFlows?.[slot.key] || undefined"
            @update:value="
              (v) =>
                emitResource({
                  [slot.key]: v ? String(v) : slot.def,
                } as Partial<ResourceFlowBindings>)
            "
          />
        </div>
      </div>
    </div>

    <Modal
      v-model:open="cloneOpen"
      title="另存为自定义逻辑"
      :confirm-loading="cloning"
      ok-text="另存并打开设计器"
      @ok="confirmClone"
    >
      <p class="mb-3 text-xs text-muted-foreground">
        复制源 DSL 为可编辑草稿（系统流本身仍只读）。发布后把表单/按钮改绑到新
        flowKey 即可升级，无需旁路写库。
      </p>
      <div class="mb-2 text-xs text-muted-foreground">源 flowKey</div>
      <Input class="mb-3 font-mono" disabled :value="cloneForm.sourceCode" />
      <div class="mb-2 text-xs text-muted-foreground">新编码</div>
      <Input
        v-model:value="cloneForm.newCode"
        class="mb-3 font-mono"
        placeholder="如 order.create"
      />
      <div class="mb-2 text-xs text-muted-foreground">名称</div>
      <Input v-model:value="cloneForm.newName" class="mb-3" />
    </Modal>
  </div>
</template>
