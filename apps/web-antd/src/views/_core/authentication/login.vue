<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';

import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import TenantBox from '#/components/tenant-box.vue';
import { useAuthStore } from '#/store';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();
const route = useRoute();

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
  ];
});

async function handleSso() {
  const redirect =
    typeof route.query.redirect === 'string'
      ? decodeURIComponent(route.query.redirect)
      : undefined;
  await authStore.startSsoLogin(redirect);
}
</script>

<template>
  <AuthenticationLogin
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    :show-code-login="false"
    :show-forget-password="true"
    :show-qrcode-login="false"
    :show-register="false"
    :show-third-party-login="false"
    @submit="authStore.authLogin"
  >
    <template #title>
      <div>
        <div class="mb-2 text-2xl font-bold lg:text-3xl">
          {{ $t('authentication.welcomeBack') }} 👋🏻
        </div>
        <div class="text-muted-foreground mb-4">
          {{ $t('authentication.loginSubtitle') }}
        </div>
        <TenantBox />
      </div>
    </template>
    <template #to-register>
      <div class="mt-4 text-center text-sm">
        <button
          class="vben-link text-sm font-normal"
          type="button"
          @click="handleSso"
        >
          使用 AuthServer 单点登录
        </button>
      </div>
    </template>
  </AuthenticationLogin>
</template>
