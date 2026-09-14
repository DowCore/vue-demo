<script lang="ts" setup>
/**
 * 对齐 ABP Account TenantBox：登录区上方展示当前租户 +「切换」链接。
 */
import { onMounted, ref } from 'vue';

import TenantSwitchModal from '#/components/tenant-switch-modal.vue';
import { getTenantDisplayName } from '#/utils/tenant';

defineOptions({ name: 'TenantBox' });

const open = ref(false);
const label = ref('未选择');

function refresh() {
  label.value = getTenantDisplayName() || '未选择';
}

function openSwitch() {
  open.value = true;
}

onMounted(refresh);
</script>

<template>
  <div
    class="border-border bg-accent/40 mb-5 rounded-md border px-4 py-3 text-sm"
  >
    <div class="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
      租户
    </div>
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0 truncate font-medium">
        {{ label }}
      </div>
      <button
        class="text-primary shrink-0 text-sm font-normal hover:underline"
        type="button"
        @click="openSwitch"
      >
        切换
      </button>
    </div>
  </div>

  <TenantSwitchModal
    v-model:open="open"
    :require-relogin="false"
    @changed="refresh"
  />
</template>
