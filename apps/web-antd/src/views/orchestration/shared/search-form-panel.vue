<script lang="ts" setup>
import type { SearchFormFieldDef } from './filter-model';

import { computed } from 'vue';

import { DatePicker, Input, InputNumber, Switch } from 'ant-design-vue';

defineOptions({ name: 'SearchFormPanel' });

const props = defineProps<{
  fields: SearchFormFieldDef[];
  modelValue: Record<string, unknown>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
}>();

const values = computed({
  get: () => props.modelValue,
  set: (value: Record<string, unknown>) => emit('update:modelValue', value),
});

function setField(key: string, value: unknown) {
  values.value = { ...values.value, [key]: value };
}

function rangeTuple(key: string): [string, string] | undefined {
  const raw = values.value[key];
  if (!Array.isArray(raw) || (!raw[0] && !raw[1])) return undefined;
  return [String(raw[0] || ''), String(raw[1] || '')];
}

function rangeNumber(key: string, index: 0 | 1): number | undefined {
  const raw = values.value[key];
  const item = Array.isArray(raw) ? raw[index] : undefined;
  return typeof item === 'number' ? item : undefined;
}

function setRange(key: string, index: 0 | 1, value: unknown) {
  const raw = values.value[key];
  const next: [unknown, unknown] = Array.isArray(raw)
    ? [raw[0], raw[1]]
    : [undefined, undefined];
  next[index] = value;
  setField(key, next);
}
</script>

<template>
  <div class="grid gap-3 md:grid-cols-3">
    <div
      v-for="field in fields"
      :key="field.key"
      :class="field.span && field.span > 1 ? 'md:col-span-2' : ''"
    >
      <div class="mb-1 text-xs text-muted-foreground">
        {{ field.title || field.field }}
        <span v-if="field.orGroup" class="ml-1 text-[11px] text-amber-600">
          任一满足 · {{ field.orGroup }}
        </span>
      </div>
      <Switch
        v-if="field.control === 'switch'"
        :checked="!!values[field.key]"
        @update:checked="(v) => setField(field.key, v)"
      />
      <div
        v-else-if="field.control === 'numberRange'"
        class="flex items-center gap-1"
      >
        <InputNumber
          :value="rangeNumber(field.key, 0)"
          class="w-full"
          placeholder="最小"
          @update:value="(v) => setRange(field.key, 0, v)"
        />
        <span class="text-muted-foreground">~</span>
        <InputNumber
          :value="rangeNumber(field.key, 1)"
          class="w-full"
          placeholder="最大"
          @update:value="(v) => setRange(field.key, 1, v)"
        />
      </div>
      <DatePicker.RangePicker
        v-else-if="field.control === 'dateRange'"
        :value="rangeTuple(field.key)"
        class="w-full"
        value-format="YYYY-MM-DD"
        @update:value="(v) => setField(field.key, v || [])"
      />
      <DatePicker.RangePicker
        v-else-if="field.control === 'datetimeRange'"
        :value="rangeTuple(field.key)"
        class="w-full"
        show-time
        value-format="YYYY-MM-DD HH:mm:ss"
        @update:value="(v) => setField(field.key, v || [])"
      />
      <InputNumber
        v-else-if="field.control === 'number'"
        :placeholder="field.placeholder"
        :value="Number(values[field.key] ?? '') || undefined"
        class="w-full"
        @update:value="(v) => setField(field.key, v)"
      />
      <DatePicker
        v-else-if="field.control === 'date'"
        :value="(values[field.key] as string) || undefined"
        class="w-full"
        value-format="YYYY-MM-DD"
        @update:value="(v) => setField(field.key, v || '')"
      />
      <Input
        v-else
        :placeholder="field.placeholder || '空着不参与查询'"
        :value="String(values[field.key] ?? '')"
        @update:value="(v) => setField(field.key, v)"
      />
    </div>
  </div>
</template>
