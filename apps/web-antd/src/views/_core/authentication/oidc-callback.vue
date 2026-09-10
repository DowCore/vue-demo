<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';

import { useAuthStore } from '#/store';

defineOptions({ name: 'OidcCallback' });

const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const message = ref('正在完成登录…');

onMounted(async () => {
  const error = route.query.error;
  if (typeof error === 'string' && error) {
    message.value =
      (route.query.error_description as string) || `授权失败: ${error}`;
    await router.replace(LOGIN_PATH);
    return;
  }

  const code = route.query.code;
  const state =
    typeof route.query.state === 'string' ? route.query.state : null;
  if (typeof code !== 'string' || !code) {
    message.value = '缺少授权码，请重新从 AuthServer Visit 进入';
    await router.replace(LOGIN_PATH);
    return;
  }

  try {
    await authStore.authLoginByCode(code, state);
  } catch (error) {
    message.value = error instanceof Error ? error.message : '登录失败';
    await router.replace(LOGIN_PATH);
  }
});
</script>

<template>
  <div class="text-muted-foreground p-8 text-center text-sm">
    {{ message }}
  </div>
</template>
