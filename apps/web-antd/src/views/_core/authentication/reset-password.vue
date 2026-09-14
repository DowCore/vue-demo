<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { resetPasswordApi, verifyPasswordResetTokenApi } from '#/api';
import { setLocalTenant } from '#/utils/tenant';

defineOptions({ name: 'ResetPassword' });

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const tokenValid = ref(true);
const checking = ref(true);

const userId = computed(() => String(route.query.userId || ''));
const resetToken = computed(() => {
  const raw = route.query.resetToken;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : '';
});

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      renderComponentContent() {
        return {
          strengthText: () => $t('authentication.passwordStrength'),
        };
      },
      rules: z.string().min(6, { message: $t('authentication.passwordTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.confirmPassword'),
      },
      dependencies: {
        rules(values) {
          const { password } = values;
          return z
            .string({ error: $t('authentication.passwordTip') })
            .min(1, { message: $t('authentication.passwordTip') })
            .refine((value) => value === password, {
              message: $t('authentication.confirmPasswordTip'),
            });
        },
        triggerFields: ['password'],
      },
      fieldName: 'confirmPassword',
      label: $t('authentication.confirmPassword'),
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
    '重置失败'
  );
}

onMounted(async () => {
  const tenant = route.query.__tenant;
  if (typeof tenant === 'string' && tenant) {
    setLocalTenant(tenant);
  }

  if (!userId.value || !resetToken.value) {
    tokenValid.value = false;
    checking.value = false;
    message.error('重置链接无效或已过期');
    return;
  }

  try {
    const ok = await verifyPasswordResetTokenApi({
      resetToken: resetToken.value,
      userId: userId.value,
    });
    tokenValid.value = !!ok;
    if (!ok) {
      message.error('重置链接无效或已过期');
    }
  } catch (error: any) {
    tokenValid.value = false;
    message.error(formatAbpError(error));
  } finally {
    checking.value = false;
  }
});

async function handleSubmit(value: Recordable<any>) {
  if (!tokenValid.value) {
    message.error('重置链接无效或已过期');
    return;
  }

  loading.value = true;
  try {
    await resetPasswordApi({
      password: String(value.password || ''),
      resetToken: resetToken.value,
      userId: userId.value,
    });
    message.success('密码已重置，请登录');
    await router.push('/auth/login');
  } catch (error: any) {
    message.error(formatAbpError(error));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div v-if="checking" class="text-muted-foreground text-center text-sm">
    正在校验重置链接…
  </div>
  <AuthenticationLogin
    v-else-if="tokenValid"
    :form-schema="formSchema"
    :loading="loading"
    :show-code-login="false"
    :show-forget-password="false"
    :show-qrcode-login="false"
    :show-remember-me="false"
    :show-register="false"
    :show-third-party-login="false"
    :submit-button-text="$t('authentication.resetPassword')"
    @submit="handleSubmit"
  >
    <template #title>
      <div>
        <div class="mb-2 text-2xl font-bold lg:text-3xl">
          {{ $t('authentication.resetPassword') }}
        </div>
        <div class="text-muted-foreground mb-4">
          {{ $t('authentication.resetPasswordSubtitle') }}
        </div>
      </div>
    </template>
  </AuthenticationLogin>
  <div v-else class="space-y-4 text-center">
    <div class="text-destructive text-sm">重置链接无效或已过期</div>
    <a class="vben-link text-sm" href="/auth/forget-password">重新发送重置邮件</a>
  </div>
</template>
