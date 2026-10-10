<script lang="ts" setup>
import type { ListColumnDef, NamedDict } from '#/api/saas/orchestration';

import { computed } from 'vue';

import { Tag } from 'ant-design-vue';

import {
  columnOptions,
  formatCellDisplay,
  formatCellHtml,
  pickRecordValue,
  resolveTone,
  toneClass,
} from './format-cell';

defineOptions({ name: 'FormattedCell' });

const props = defineProps<{
  column: ListColumnDef;
  dictionaries?: NamedDict[];
  record: Record<string, unknown>;
}>();

const raw = computed(() => pickRecordValue(props.record, props.column.field));

const display = computed(() =>
  formatCellDisplay(raw.value, props.column, props.record, props.dictionaries),
);

const html = computed(() =>
  formatCellHtml(raw.value, props.column, props.record, props.dictionaries),
);

const tone = computed(() =>
  resolveTone(
    raw.value,
    props.column.styleRules,
    'cell',
    columnOptions(props.column, props.dictionaries),
  ),
);

const tagColor = computed(() => {
  if (tone.value === 'danger') return 'error';
  if (tone.value === 'success') return 'success';
  if (tone.value === 'warning') return 'warning';
  if (tone.value === 'info') return 'processing';
  return 'default';
});
</script>

<template>
  <!-- html 来自 formatCellHtml()，内部已用 sanitizeHtml()（DOMPurify 白名单）净化 -->
  <!-- eslint-disable vue/no-v-html -->
  <span v-if="html" :class="toneClass(tone)" v-html="html"></span>
  <!-- eslint-enable vue/no-v-html -->
  <Tag v-else-if="column.render === 'tag'" :color="tagColor">
    {{ display }}
  </Tag>
  <span v-else :class="toneClass(tone)">{{ display }}</span>
</template>
