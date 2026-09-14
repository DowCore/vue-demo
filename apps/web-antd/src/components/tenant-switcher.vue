<script lang="ts" setup>
/**
 * 顶栏租户切换（登录后），交互与 ABP TenantBox 弹窗一致。
 */
import { onMounted, ref } from 'vue';

import { message, Tag } from 'ant-design-vue';

import TenantSwitchModal from '#/components/tenant-switch-modal.vue';
import { useAuthStore } from '#/store';
import { getTenantDisplayName } from '#/utils/tenant';

defineOptions({ name: 'TenantSwitcher' });

const authStore = useAuthStore();
const open = ref(false);
const label = ref('宿主 Host');

function refresh() {
  label.value = getTenantDisplayName() || '宿主 Host';
}

async function handleRelogin() {
  message.info('切换租户后需要重新登录');
  await authStore.logout(false);
}

onMounted(refresh);
</script>

<template>
  <div class="mr-1 flex items-center">
    <Tag
      class="cursor-pointer select-none"
      color="processing"
      @click="open = true"
    >
      {{ label }}
    </Tag>
    <TenantSwitchModal
      v-model:open="open"
      require-relogin
      @changed="refresh"
      @relogin="handleRelogin"
    />
  </div>
</template>
