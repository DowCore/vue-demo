<script lang="ts" setup>
import type { InputParameter, InputRule } from './dsl-graph';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Select, Switch, Tooltip } from 'ant-design-vue';

defineOptions({ name: 'SchemaParamEditor' });

const props = withDefaults(
  defineProps<{
    modelValue: InputParameter[];
    depth?: number;
    allowSystem?: boolean;
  }>(),
  {
    depth: 0,
    allowSystem: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: InputParameter[]];
  change: [];
}>();

const TYPE_OPTIONS = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
  { label: 'datetime', value: 'datetime' },
  { label: 'guid', value: 'guid' },
  { label: 'object', value: 'object' },
  { label: 'array', value: 'array' },
];

const SOURCE_OPTIONS = [
  { label: '调用方传入', value: 'input' },
  { label: '系统参数', value: 'system' },
];

const RULE_OPTIONS = [
  { label: '表达式失败条件 expr', value: 'expr' },
  { label: '断言必须成立 assert', value: 'assert' },
  { label: '最小值 min', value: 'min' },
  { label: '最大值 max', value: 'max' },
  { label: '最小长度 minLength', value: 'minLength' },
  { label: '最大长度 maxLength', value: 'maxLength' },
  { label: '最少项 minItems', value: 'minItems' },
  { label: '最多项 maxItems', value: 'maxItems' },
  { label: '正则 pattern', value: 'pattern' },
  { label: '枚举 enum', value: 'enum' },
  { label: '邮箱 email', value: 'email' },
  { label: 'GUID', value: 'guid' },
  { label: 'URL', value: 'url' },
];

const RULES_NEED_VALUE = new Set([
  'assert',
  'enum',
  'expr',
  'max',
  'maxItems',
  'maxLength',
  'min',
  'minItems',
  'minLength',
  'pattern',
]);

const list = computed({
  get: () => props.modelValue || [],
  set: (value: InputParameter[]) => {
    emit('update:modelValue', value);
    emit('change');
  },
});

function createParam(partial?: Partial<InputParameter>): InputParameter {
  return {
    name: '',
    displayName: '',
    type: 'string',
    required: false,
    source: 'input',
    properties: [],
    rules: [],
    ...partial,
  };
}

function touch(next: InputParameter[]) {
  list.value = next;
}

function addRoot() {
  touch([
    ...list.value,
    createParam({ name: `field${list.value.length + 1}` }),
  ]);
}

function addSystemDate() {
  touch([
    ...list.value,
    createParam({
      name: 'queryFrom',
      displayName: '起始时间',
      type: 'datetime',
      source: 'system',
      systemExpr: 'sys.Now - 3d',
    }),
  ]);
}

function removeAt(index: number) {
  const next = [...list.value];
  next.splice(index, 1);
  touch(next);
}

function updateAt(index: number, patch: Partial<InputParameter>) {
  const next = [...list.value];
  const base = next[index];
  if (!base) return;
  const cur = { ...base, ...patch } as InputParameter;
  if (patch.type === 'object' && !cur.properties) {
    cur.properties = [];
  }
  if (patch.type === 'array' && !cur.items) {
    cur.items = createParam({ name: 'item', type: 'string' });
  }
  if (patch.source === 'input') {
    cur.systemKey = undefined;
    cur.systemExpr = undefined;
  }
  next[index] = cur;
  touch(next);
}

function updateChildren(index: number, children: InputParameter[]) {
  updateAt(index, { properties: children });
}

function updateArrayItem(index: number, item: InputParameter) {
  updateAt(index, { items: item });
}

function updateArrayItemProperties(index: number, children: InputParameter[]) {
  const cur = list.value[index];
  if (!cur) return;
  const items = {
    ...(cur.items || createParam({ name: 'item', type: 'object' })),
    type: 'object' as const,
    properties: children,
  };
  updateAt(index, { items });
}

function pathHint(name: string) {
  return name ? `input.${name}` : 'input.?';
}

function addRule(index: number) {
  const cur = list.value[index];
  if (!cur) return;
  const rules = [
    ...(cur.rules || []),
    {
      type: 'expr',
      value: 'input.age < 0 || input.age > 100',
      message: '年龄应该大于0，小于100',
    } as InputRule,
  ];
  updateAt(index, { rules });
}

function updateRule(
  paramIndex: number,
  ruleIndex: number,
  patch: Partial<InputRule>,
) {
  const cur = list.value[paramIndex];
  if (!cur) return;
  const rules = [...(cur.rules || [])];
  const existing = rules[ruleIndex];
  if (!existing) return;
  rules[ruleIndex] = { ...existing, ...patch } as InputRule;
  updateAt(paramIndex, { rules });
}

function removeRule(paramIndex: number, ruleIndex: number) {
  const cur = list.value[paramIndex];
  if (!cur) return;
  const rules = [...(cur.rules || [])];
  rules.splice(ruleIndex, 1);
  updateAt(paramIndex, { rules });
}

function ruleValueText(rule: InputRule): string {
  if (rule.type === 'enum' && Array.isArray(rule.value)) {
    return rule.value.join(',');
  }
  return rule.value === null || rule.value === undefined
    ? ''
    : String(rule.value);
}

function setRuleValueText(
  paramIndex: number,
  ruleIndex: number,
  text: string,
  ruleType: string,
) {
  if (ruleType === 'enum') {
    const arr = text
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    updateRule(paramIndex, ruleIndex, { value: arr });
    return;
  }
  if (
    ['max', 'maxItems', 'maxLength', 'min', 'minItems', 'minLength'].includes(
      ruleType,
    )
  ) {
    const n = Number(text);
    updateRule(paramIndex, ruleIndex, {
      value: text === '' || Number.isNaN(n) ? text : n,
    });
    return;
  }
  updateRule(paramIndex, ruleIndex, { value: text });
}

function ruleNeedsValue(type: string) {
  return RULES_NEED_VALUE.has(type);
}
</script>

<template>
  <div class="schema-param-editor" :class="{ 'is-nested': depth > 0 }">
    <div v-if="depth === 0" class="mb-2 flex flex-wrap items-center gap-2">
      <Button size="small" type="primary" ghost @click="addRoot">
        <template #icon><IconifyIcon icon="lucide:plus" /></template>
        添加参数
      </Button>
      <Button v-if="allowSystem" size="small" @click="addSystemDate">
        + sys.Now - 3d
      </Button>
      <span class="text-muted-foreground text-xs">
        声明式 rules 校验；object / array 可嵌套
      </span>
    </div>

    <div
      v-if="!list.length"
      class="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
    >
      暂无请求参数，点击「添加参数」开始构建
    </div>

    <div class="space-y-2">
      <div
        v-for="(item, index) in list"
        :key="`${depth}-${index}-${item.name}`"
        class="param-card rounded-lg border border-border bg-card/60 p-2.5"
      >
        <div class="flex items-start gap-1.5">
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="grid grid-cols-2 gap-1.5">
              <Input
                :value="item.name"
                size="small"
                placeholder="字段名 name"
                class="font-mono"
                @update:value="
                  (v) => updateAt(index, { name: String(v || '') })
                "
              />
              <Input
                :value="item.displayName"
                size="small"
                placeholder="显示名"
                @update:value="
                  (v) => updateAt(index, { displayName: String(v || '') })
                "
              />
            </div>
            <div class="grid grid-cols-2 gap-1.5">
              <Select
                :value="item.type"
                size="small"
                :options="TYPE_OPTIONS"
                @update:value="(v) => updateAt(index, { type: String(v) })"
              />
              <Select
                v-if="allowSystem && depth === 0"
                :value="item.source || 'input'"
                size="small"
                :options="SOURCE_OPTIONS"
                @update:value="
                  (v) => updateAt(index, { source: v as 'input' | 'system' })
                "
              />
              <div
                v-else
                class="flex items-center gap-2 px-1 text-xs text-muted-foreground"
              >
                <span>必填</span>
                <Switch
                  size="small"
                  :checked="!!item.required"
                  @update:checked="(v) => updateAt(index, { required: !!v })"
                />
              </div>
            </div>
            <div
              v-if="allowSystem && depth === 0"
              class="flex items-center gap-2"
            >
              <span class="text-xs text-muted-foreground">必填</span>
              <Switch
                size="small"
                :checked="!!item.required"
                :disabled="item.source === 'system'"
                @update:checked="(v) => updateAt(index, { required: !!v })"
              />
              <code class="text-muted-foreground ml-auto truncate text-[10px]">
                {{ pathHint(item.name) }}
              </code>
            </div>
            <template v-if="item.source === 'system' && depth === 0">
              <Input
                :value="item.systemKey"
                size="small"
                class="font-mono"
                placeholder="systemKey 如 sys.userId"
                @update:value="
                  (v) =>
                    updateAt(index, { systemKey: String(v || '') || undefined })
                "
              />
              <Input
                :value="item.systemExpr"
                size="small"
                class="font-mono"
                placeholder="systemExpr 如 sys.Now - 3d"
                @update:value="
                  (v) =>
                    updateAt(index, {
                      systemExpr: String(v || '') || undefined,
                    })
                "
              />
            </template>
            <Input
              v-if="item.source !== 'system'"
              :value="item.default == null ? '' : String(item.default)"
              size="small"
              placeholder="默认值（可选）"
              @update:value="
                (v) => updateAt(index, { default: v === '' ? undefined : v })
              "
            />

            <div
              v-if="item.source !== 'system'"
              class="rounded-md border border-dashed border-amber-500/30 bg-amber-500/5 p-2"
            >
              <div class="mb-1.5 flex items-center justify-between">
                <span
                  class="text-[11px] font-medium text-amber-700 dark:text-amber-400"
                >
                  校验规则 rules
                </span>
                <Button
                  size="small"
                  type="link"
                  class="!h-6 !px-1 text-xs"
                  @click="addRule(index)"
                >
                  + 规则
                </Button>
              </div>
              <div
                v-if="!(item.rules || []).length"
                class="text-[10px] text-muted-foreground"
              >
                通用规则 + 表达式：如 input.age &lt; 0 || input.age &gt; 100
              </div>
              <div class="space-y-1.5">
                <div
                  v-for="(rule, ri) in item.rules || []"
                  :key="ri"
                  class="rounded border border-border/60 bg-background/50 p-1.5"
                >
                  <div class="flex items-center gap-1">
                    <Select
                      :value="rule.type"
                      size="small"
                      class="!min-w-0 flex-1"
                      :options="RULE_OPTIONS"
                      @update:value="
                        (v) => updateRule(index, ri, { type: String(v) })
                      "
                    />
                    <Button
                      danger
                      size="small"
                      type="text"
                      @click="removeRule(index, ri)"
                    >
                      <template #icon>
                        <IconifyIcon icon="lucide:x" class="size-3.5" />
                      </template>
                    </Button>
                  </div>
                  <Input
                    v-if="ruleNeedsValue(rule.type)"
                    class="mt-1 font-mono"
                    size="small"
                    :placeholder="
                      rule.type === 'expr' || rule.type === 'assert'
                        ? 'input.age < 0 || input.age > 100'
                        : rule.type === 'enum'
                          ? '枚举值，逗号分隔：a,b,c'
                          : rule.type === 'pattern'
                            ? '正则如 ^[A-Z]+$'
                            : '规则值'
                    "
                    :value="ruleValueText(rule)"
                    @update:value="
                      (v) =>
                        setRuleValueText(index, ri, String(v || ''), rule.type)
                    "
                  />
                  <Input
                    class="mt-1"
                    size="small"
                    placeholder="错误提示 message（可选）"
                    :value="rule.message || ''"
                    @update:value="
                      (v) =>
                        updateRule(index, ri, {
                          message: String(v || '') || undefined,
                        })
                    "
                  />
                </div>
              </div>
            </div>
          </div>
          <Tooltip title="删除">
            <Button danger size="small" type="text" @click="removeAt(index)">
              <template #icon>
                <IconifyIcon icon="lucide:trash-2" class="size-3.5" />
              </template>
            </Button>
          </Tooltip>
        </div>

        <div
          v-if="item.type === 'object'"
          class="mt-2 border-l-2 border-sky-500/40 pl-2"
        >
          <div class="mb-1.5 flex items-center justify-between">
            <span
              class="text-[11px] font-medium text-sky-600 dark:text-sky-400"
            >
              下行字段 properties
            </span>
            <Button
              size="small"
              type="link"
              class="!h-6 !px-1 text-xs"
              @click="
                updateChildren(index, [
                  ...(item.properties || []),
                  createParam({
                    name: `child${(item.properties || []).length + 1}`,
                  }),
                ])
              "
            >
              + 子字段
            </Button>
          </div>
          <SchemaParamEditor
            :model-value="item.properties || []"
            :depth="depth + 1"
            :allow-system="false"
            @update:model-value="(v) => updateChildren(index, v)"
            @change="emit('change')"
          />
        </div>

        <div
          v-if="item.type === 'array'"
          class="mt-2 border-l-2 border-violet-500/40 pl-2"
        >
          <div class="mb-1.5 flex flex-wrap items-center gap-2">
            <span
              class="text-[11px] font-medium text-violet-600 dark:text-violet-400"
            >
              数组元素
            </span>
            <Select
              :value="item.items?.type || 'string'"
              size="small"
              class="!w-[110px]"
              :options="TYPE_OPTIONS.filter((x) => x.value !== 'array')"
              @update:value="
                (v) =>
                  updateArrayItem(index, {
                    ...(item.items || createParam({ name: 'item' })),
                    type: String(v),
                    name: 'item',
                    source: 'input',
                  })
              "
            />
          </div>
          <div v-if="(item.items?.type || 'string') === 'object'">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-[11px] text-muted-foreground">元素下行字段</span>
              <Button
                size="small"
                type="link"
                class="!h-6 !px-1 text-xs"
                @click="
                  updateArrayItemProperties(index, [
                    ...(item.items?.properties || []),
                    createParam({
                      name: `field${(item.items?.properties || []).length + 1}`,
                    }),
                  ])
                "
              >
                + 子字段
              </Button>
            </div>
            <SchemaParamEditor
              :model-value="item.items?.properties || []"
              :depth="depth + 1"
              :allow-system="false"
              @update:model-value="(v) => updateArrayItemProperties(index, v)"
              @change="emit('change')"
            />
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="depth > 0 && list.length === 0"
      class="py-2 text-center text-[11px] text-muted-foreground"
    >
      暂无子字段
    </div>
  </div>
</template>

<style scoped>
.schema-param-editor.is-nested {
  margin-top: 0.25rem;
}

.param-card:hover {
  border-color: color-mix(in srgb, hsl(var(--primary)) 35%, transparent);
}
</style>
