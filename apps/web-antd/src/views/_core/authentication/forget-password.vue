<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationForgetPassword, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { sendPasswordResetCodeApi } from '#/api';
import TenantBox from '#/components/tenant-box.vue';

defineOptions({ name: 'ForgetPassword' });

const router = useRouter();
const loading = ref(false);

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: 'example@example.com',
      },
      fieldName: 'email',
      label: $t('authentication.email'),
      rules: z
        .string()
        .min(1, { message: $t('authentication.emailTip') })
        .email($t('authentication.emailValidErrorTip')),
    },
  ];
});

function formatAbpError(error: any) {
  const abpError = error?.response?.data?.error;
  const validation =
    abpError?.validationErrors
      ?.map((v: { message?: string }) => v.message)
      .filter(Boolean)
      .join('；') || '';
  return (
    validation ||
    (typeof abpError === 'string' ? abpError : abpError?.message) ||
    error?.message ||
    '发送失败'
  );
}

async function handleSubmit(value: Recordable<any>) {
  loading.value = true;
  try {
    await sendPasswordResetCodeApi({
      appName: 'Vue',
      email: String(value.email || '').trim(),
      returnUrl: `${window.location.origin}/auth/login`,
    });
    message.success(
      '若该邮箱已注册，重置链接已发送。开发环境请查看 Identity 服务日志中的邮件内容。',
    );
    await router.push('/auth/login');
  } catch (error: any) {
    message.error(formatAbpError(error));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthenticationForgetPassword
    :form-schema="formSchema"
    :loading="loading"
    @submit="handleSubmit"
  >
    <template #title>
      <div>
        <div class="mb-2 text-2xl font-bold lg:text-3xl">
          {{ $t('authentication.forgetPassword') }}
        </div>
        <div class="text-muted-foreground mb-4">
          {{ $t('authentication.forgetPasswordSubtitle') }}
        </div>
        <TenantBox />
      </div>
    </template>
  </AuthenticationForgetPassword>
</template>
