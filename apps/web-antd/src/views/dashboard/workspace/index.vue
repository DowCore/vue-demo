<script lang="ts" setup>
import { computed } from 'vue';

import { useUserStore } from '@vben/stores';

import { Card } from 'ant-design-vue';

defineOptions({ name: 'Workspace' });

const userStore = useUserStore();
const displayName = computed(
  () => userStore.userInfo?.realName || userStore.userInfo?.username || '用户',
);
</script>

<template>
  <div class="p-5">
    <Card>
      <div class="text-xl font-semibold">你好，{{ displayName }}</div>
      <div class="text-muted-foreground mt-2 text-sm">
        欢迎使用 Meta.Dow 管理后台。请从左侧菜单进入业务功能。
      </div>
    </Card>
  </div>
</template>
