<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { useAccessStore } from '@vben/stores';

import { useAuthStore } from '#/store';

defineOptions({ name: 'AuthSso' });

const authStore = useAuthStore();
const accessStore = useAccessStore();
const route = useRoute();
const router = useRouter();
const message = ref('正在跳转 AuthServer 单点登录…');

onMounted(async () => {
  if (accessStore.accessToken) {
    await router.replace(
      (route.query.redirect as string) || '/dashboard/workspace',
    );
    return;
  }

  try {
    const redirect =
      typeof route.query.redirect === 'string'
        ? decodeURIComponent(route.query.redirect)
        : '/dashboard/workspace';
    await authStore.startSsoLogin(redirect);
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : '无法启动 SSO，请手动登录';
    await router.replace(LOGIN_PATH);
  }
});
</script>

<template>
  <div class="text-muted-foreground p-8 text-center text-sm">
    {{ message }}
  </div>
</template>
