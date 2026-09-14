<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { useAccessStore } from '@vben/stores';

import { useAuthStore } from '#/store';

import AuthLoading from './auth-loading.vue';

defineOptions({ name: 'AuthSso' });

const authStore = useAuthStore();
const accessStore = useAccessStore();
const route = useRoute();
const router = useRouter();
const message = ref('正在连接认证中心');
const description = ref('即将跳转到 AuthServer 完成单点登录');

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
    message.value = '无法启动单点登录';
    description.value =
      error instanceof Error ? error.message : '请返回登录页重试';
    await router.replace(LOGIN_PATH);
  }
});
</script>

<template>
  <AuthLoading :description="description" :title="message" />
</template>
