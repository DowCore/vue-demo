<script lang="ts" setup>
import type { NodeExecution } from '#/api/saas/orchestration';

import { computed } from 'vue';

import { Empty, Tag, Timeline } from 'ant-design-vue';

const props = defineProps<{
  nodes?: NodeExecution[];
  error?: string;
}>();

const items = computed(() => props.nodes || []);

function statusColor(status: string) {
  if (status === 'Succeeded') return 'green';
  if (status === 'Skipped') return 'gray';
  return 'red';
}
</script>

<template>
  <div>
    <div
      v-if="error"
      class="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
    >
      {{ error }}
    </div>
    <Empty v-if="!items.length" description="暂无节点执行记录" />
    <Timeline v-else class="px-1">
      <Timeline.Item
        v-for="(node, idx) in items"
        :key="`${node.nodeId}-${idx}`"
        :color="statusColor(node.status)"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{{ node.nodeId }}</span>
          <Tag>{{ node.nodeType }}</Tag>
          <Tag :color="statusColor(node.status)">{{ node.status }}</Tag>
          <span class="text-muted-foreground text-xs">{{ node.durationMs }} ms</span>
        </div>
        <div v-if="node.error" class="mt-1 text-sm text-rose-600">
          {{ node.error }}
        </div>
        <div
          v-if="node.outputJson"
          class="bg-muted/40 mt-2 max-h-28 overflow-auto rounded-md px-2 py-1 font-mono text-xs"
        >
          {{ node.outputJson }}
        </div>
      </Timeline.Item>
    </Timeline>
  </div>
</template>
