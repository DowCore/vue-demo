<script lang="ts" setup>
/**
 * Cronos 兼容的可视化 Cron 选择器（对标 vue-js-cron / react-js-cron）
 * 输出 6 段：秒 分 时 日 月 周；自定义模式可手填 5/6 段。
 */
import { computed, ref, watch } from 'vue';

import { Input, InputNumber, Select, Space, Tag } from 'ant-design-vue';

defineOptions({ name: 'CronExpressionEditor' });

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

type Period = 'custom' | 'day' | 'hour' | 'minute' | 'month' | 'week';

const period = ref<Period>('minute');
const everyN = ref(5);
const minute = ref(0);
const hour = ref(0);
const dayOfMonth = ref(1);
const daysOfWeek = ref<number[]>([1]);
const customText = ref('0 */5 * * * *');
const syncing = ref(false);

const periodOptions = [
  { label: '每分钟', value: 'minute' },
  { label: '每小时', value: 'hour' },
  { label: '每天', value: 'day' },
  { label: '每周', value: 'week' },
  { label: '每月', value: 'month' },
  { label: '自定义', value: 'custom' },
];

const minuteOptions = Array.from({ length: 60 }, (_, i) => ({
  label: `${String(i).padStart(2, '0')} 分`,
  value: i,
}));

const hourOptions = Array.from({ length: 24 }, (_, i) => ({
  label: `${String(i).padStart(2, '0')} 时`,
  value: i,
}));

const dayOfMonthOptions = Array.from({ length: 31 }, (_, i) => ({
  label: `${i + 1} 日`,
  value: i + 1,
}));

const weekOptions = [
  { label: '周日', value: 0 },
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
];

function buildCron(): string {
  switch (period.value) {
    case 'minute': {
      const n = Math.min(59, Math.max(1, everyN.value || 1));
      return n === 1 ? '0 * * * * *' : `0 */${n} * * * *`;
    }
    case 'hour': {
      return `0 ${minute.value} * * * *`;
    }
    case 'day': {
      return `0 ${minute.value} ${hour.value} * * *`;
    }
    case 'week': {
      const days =
        daysOfWeek.value.length > 0
          ? [...daysOfWeek.value].toSorted((a, b) => a - b).join(',')
          : '*';
      return `0 ${minute.value} ${hour.value} * * ${days}`;
    }
    case 'month': {
      return `0 ${minute.value} ${hour.value} ${dayOfMonth.value} * *`;
    }
    case 'custom': {
      return customText.value.trim();
    }
    default: {
      return '0 */5 * * * *';
    }
  }
}

const humanLabel = computed(() => {
  switch (period.value) {
    case 'minute': {
      return everyN.value <= 1
        ? '每分钟（整分）执行'
        : `每 ${everyN.value} 分钟执行一次`;
    }
    case 'hour': {
      return `每小时的第 ${minute.value} 分执行`;
    }
    case 'day': {
      return `每天 ${String(hour.value).padStart(2, '0')}:${String(minute.value).padStart(2, '0')} 执行`;
    }
    case 'week': {
      const names = [...daysOfWeek.value]
        .toSorted((a, b) => a - b)
        .map((d) => weekOptions.find((x) => x.value === d)?.label || d)
        .join('、');
      return `每周 ${names || '—'} ${String(hour.value).padStart(2, '0')}:${String(minute.value).padStart(2, '0')} 执行`;
    }
    case 'month': {
      return `每月 ${dayOfMonth.value} 日 ${String(hour.value).padStart(2, '0')}:${String(minute.value).padStart(2, '0')} 执行`;
    }
    case 'custom': {
      return '自定义 Cron 表达式（Cronos 5/6 段）';
    }
    default: {
      return '';
    }
  }
});

function emitBuilt() {
  if (syncing.value) return;
  const next = buildCron();
  if (next !== props.modelValue) {
    emit('update:modelValue', next);
  }
}

function parseFromValue(raw: string) {
  const text = (raw || '').trim();
  if (!text) return;

  const parts = text.split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    period.value = 'custom';
    customText.value = text;
    return;
  }

  // 5 段视为缺省秒位，统一补 '0' 后按 6 段解析
  const [
    sec = '0',
    min = '*',
    hourPart = '*',
    day = '*',
    month = '*',
    week = '*',
  ] = parts.length === 6 ? parts : ['0', ...parts];

  // 选择器统一用秒=0；其它秒写法走自定义
  if (sec !== '0' && sec !== '*') {
    period.value = 'custom';
    customText.value = text;
    return;
  }

  // 每 N 分钟：0 */N * * * *
  const stepMin = /^\*\/(\d+)$/.exec(min);
  if (
    (min === '*' || stepMin) &&
    hourPart === '*' &&
    day === '*' &&
    month === '*' &&
    week === '*'
  ) {
    period.value = 'minute';
    everyN.value = stepMin ? Number(stepMin[1]) : 1;
    return;
  }

  // 每小时：0 M * * * *
  if (
    /^\d+$/.test(min) &&
    hourPart === '*' &&
    day === '*' &&
    month === '*' &&
    week === '*'
  ) {
    period.value = 'hour';
    minute.value = Number(min);
    return;
  }

  // 每天：0 M H * * *
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hourPart) &&
    day === '*' &&
    month === '*' &&
    week === '*'
  ) {
    period.value = 'day';
    minute.value = Number(min);
    hour.value = Number(hourPart);
    return;
  }

  // 每周：0 M H * * D[,D]
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hourPart) &&
    day === '*' &&
    month === '*' &&
    /^[\d,]+$/.test(week)
  ) {
    period.value = 'week';
    minute.value = Number(min);
    hour.value = Number(hourPart);
    const parsedDays: number[] = [];
    for (const part of week.split(',')) parsedDays.push(Number(part));
    daysOfWeek.value = parsedDays;
    return;
  }

  // 每月：0 M H D * *
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hourPart) &&
    /^\d+$/.test(day) &&
    month === '*' &&
    week === '*'
  ) {
    period.value = 'month';
    minute.value = Number(min);
    hour.value = Number(hourPart);
    dayOfMonth.value = Number(day);
    return;
  }

  period.value = 'custom';
  customText.value = text;
}

watch(
  () => props.modelValue,
  (v) => {
    syncing.value = true;
    try {
      parseFromValue(v || '');
      if (period.value === 'custom') {
        customText.value = (v || '').trim();
      }
    } finally {
      syncing.value = false;
    }
  },
  { immediate: true },
);

watch(period, (p, prev) => {
  if (syncing.value) return;
  if (p === 'custom' && prev !== 'custom') {
    customText.value = props.modelValue?.trim() || buildCron();
  }
});

watch(
  [period, everyN, minute, hour, dayOfMonth, daysOfWeek, customText],
  () => emitBuilt(),
  { deep: true },
);
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted-foreground">周期</span>
      <Select
        v-model:value="period"
        :options="periodOptions"
        style="width: 120px"
      />

      <template v-if="period === 'minute'">
        <span class="text-sm text-muted-foreground">每隔</span>
        <InputNumber
          v-model:value="everyN"
          :max="59"
          :min="1"
          style="width: 88px"
        />
        <span class="text-sm text-muted-foreground">分钟</span>
      </template>

      <template v-else-if="period === 'hour'">
        <span class="text-sm text-muted-foreground">在第</span>
        <Select
          v-model:value="minute"
          :options="minuteOptions"
          style="width: 100px"
        />
      </template>

      <template v-else-if="period === 'day'">
        <span class="text-sm text-muted-foreground">在</span>
        <Select
          v-model:value="hour"
          :options="hourOptions"
          style="width: 96px"
        />
        <Select
          v-model:value="minute"
          :options="minuteOptions"
          style="width: 96px"
        />
      </template>

      <template v-else-if="period === 'week'">
        <Select
          v-model:value="daysOfWeek"
          :options="weekOptions"
          mode="multiple"
          placeholder="选择星期"
          style="min-width: 180px"
        />
        <Select
          v-model:value="hour"
          :options="hourOptions"
          style="width: 96px"
        />
        <Select
          v-model:value="minute"
          :options="minuteOptions"
          style="width: 96px"
        />
      </template>

      <template v-else-if="period === 'month'">
        <Select
          v-model:value="dayOfMonth"
          :options="dayOfMonthOptions"
          style="width: 96px"
        />
        <Select
          v-model:value="hour"
          :options="hourOptions"
          style="width: 96px"
        />
        <Select
          v-model:value="minute"
          :options="minuteOptions"
          style="width: 96px"
        />
      </template>
    </div>

    <template v-if="period === 'custom'">
      <Input
        v-model:value="customText"
        class="font-mono"
        placeholder="0 */5 * * * * 或 */5 * * * *"
      />
      <p class="text-[11px] text-muted-foreground">
        Cronos：秒 分 时 日 月 周（6 段）或标准 5 段；勿使用 Quartz 的 ?
      </p>
    </template>

    <Space wrap>
      <Tag color="blue">{{ modelValue || '—' }}</Tag>
      <span class="text-xs text-muted-foreground">{{ humanLabel }}</span>
    </Space>
  </div>
</template>
