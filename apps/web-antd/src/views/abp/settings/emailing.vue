<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';

import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Space,
  Switch,
} from 'ant-design-vue';

import {
  getEmailSettingsApi,
  sendTestEmailApi,
  updateEmailSettingsApi,
} from '#/api/setting-management/emailing';

defineOptions({ name: 'AbpEmailSettings' });

const loading = ref(false);
const saving = ref(false);
const testOpen = ref(false);
const testing = ref(false);
/** 后端从不回传明文密码；有用户名时提示“已保存，留空不改” */
const passwordConfiguredHint = ref(false);

const form = reactive({
  defaultFromAddress: '',
  defaultFromDisplayName: '',
  smtpDomain: '',
  smtpEnableSsl: false,
  smtpHost: '',
  smtpPassword: '',
  smtpPort: 25,
  smtpUseDefaultCredentials: false,
  smtpUserName: '',
});

const testForm = reactive({
  body: 'This is a test email.',
  senderEmailAddress: '',
  subject: '',
  targetEmailAddress: '',
});

const passwordPlaceholder = computed(() =>
  passwordConfiguredHint.value ? '已保存（留空则不修改）' : '请输入 SMTP 密码',
);

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
    '操作失败'
  );
}

async function load() {
  loading.value = true;
  try {
    const data = await getEmailSettingsApi();
    form.smtpHost = data.smtpHost || '';
    form.smtpPort = data.smtpPort || 25;
    form.smtpUserName = data.smtpUserName || '';
    // ABP 标准：Get 不返回密码；禁止回填，避免浏览器/占位被当成“默认密码”
    form.smtpPassword = '';
    passwordConfiguredHint.value = !!(data.smtpUserName || data.smtpHost);
    form.smtpDomain = data.smtpDomain || '';
    form.smtpEnableSsl = !!data.smtpEnableSsl;
    form.smtpUseDefaultCredentials = !!data.smtpUseDefaultCredentials;
    form.defaultFromAddress = data.defaultFromAddress || '';
    form.defaultFromDisplayName = data.defaultFromDisplayName || '';
  } catch (error: any) {
    message.error(formatAbpError(error));
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.defaultFromAddress.trim() || !form.defaultFromDisplayName.trim()) {
    message.error('请填写默认发件人邮箱与显示名');
    return;
  }

  // 填了用户名/密码时，不应再用“默认凭据”，否则密码不会生效
  const useDefault =
    form.smtpUseDefaultCredentials &&
    !form.smtpUserName.trim() &&
    !form.smtpPassword.trim();

  saving.value = true;
  try {
    await updateEmailSettingsApi({
      defaultFromAddress: form.defaultFromAddress.trim(),
      defaultFromDisplayName: form.defaultFromDisplayName.trim(),
      smtpDomain: form.smtpDomain || undefined,
      smtpEnableSsl: form.smtpEnableSsl,
      smtpHost: form.smtpHost || undefined,
      // 空字符串不传，避免覆盖已加密保存的密码
      smtpPassword: form.smtpPassword.trim() || undefined,
      smtpPort: form.smtpPort || 25,
      smtpUseDefaultCredentials: useDefault,
      smtpUserName: form.smtpUserName || undefined,
    });
    form.smtpPassword = '';
    form.smtpUseDefaultCredentials = useDefault;
    passwordConfiguredHint.value = true;
    message.success('已保存');
  } catch (error: any) {
    message.error(formatAbpError(error));
  } finally {
    saving.value = false;
  }
}

function openTest() {
  testForm.senderEmailAddress = form.defaultFromAddress;
  testForm.targetEmailAddress = '';
  testForm.subject = `Test email ${Math.floor(Math.random() * 9000 + 1000)}`;
  testForm.body = 'This is a test email.';
  testOpen.value = true;
}

async function sendTest() {
  if (
    !testForm.senderEmailAddress.trim() ||
    !testForm.targetEmailAddress.trim()
  ) {
    message.error('请填写发件人与收件人');
    return;
  }
  if (!testForm.subject.trim()) {
    message.error('请填写主题');
    return;
  }

  testing.value = true;
  try {
    await sendTestEmailApi({
      body: testForm.body,
      senderEmailAddress: testForm.senderEmailAddress.trim(),
      subject: testForm.subject.trim(),
      targetEmailAddress: testForm.targetEmailAddress.trim(),
    });
    testOpen.value = false;
    message.success('测试邮件已发送，请查收件箱（含垃圾箱）');
  } catch (error: any) {
    message.error(formatAbpError(error));
  } finally {
    testing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="p-4">
    <Card :loading="loading" title="邮件设置（SMTP）">
      <p class="text-muted-foreground mb-4 text-sm">
        对齐 ABP Setting
        Management。密码因安全策略不会回显，留空表示保留已保存密码。 QQ
        邮箱建议：Host=<code>smtp.qq.com</code>，Port=<code>465</code> 或
        <code>587</code>，开启 SSL，关闭「使用默认凭据」，密码填
        <b>授权码</b>（非登录密码）。
      </p>
      <Form layout="vertical" style="max-width: 640px" autocomplete="off">
        <Form.Item label="默认发件显示名" required>
          <Input
            v-model:value="form.defaultFromDisplayName"
            autocomplete="off"
          />
        </Form.Item>
        <Form.Item label="默认发件邮箱" required>
          <Input
            v-model:value="form.defaultFromAddress"
            autocomplete="off"
            type="email"
          />
        </Form.Item>
        <Form.Item label="SMTP Host">
          <Input
            v-model:value="form.smtpHost"
            autocomplete="off"
            placeholder="smtp.example.com"
          />
        </Form.Item>
        <Form.Item label="SMTP Port">
          <InputNumber
            v-model:value="form.smtpPort"
            :max="65535"
            :min="1"
            class="w-full"
          />
        </Form.Item>
        <Form.Item label="SMTP 用户名">
          <Input
            v-model:value="form.smtpUserName"
            autocomplete="off"
            name="smtp-username"
          />
        </Form.Item>
        <Form.Item label="SMTP 密码">
          <Input.Password
            v-model:value="form.smtpPassword"
            :placeholder="passwordPlaceholder"
            autocomplete="new-password"
            name="smtp-password"
          />
        </Form.Item>
        <Form.Item label="SMTP Domain">
          <Input v-model:value="form.smtpDomain" autocomplete="off" />
        </Form.Item>
        <Form.Item label="启用 SSL">
          <Switch v-model:checked="form.smtpEnableSsl" />
        </Form.Item>
        <Form.Item label="使用默认凭据">
          <Switch v-model:checked="form.smtpUseDefaultCredentials" />
        </Form.Item>
        <Space>
          <AccessControl :codes="['SettingManagement.Emailing']" type="code">
            <Button :loading="saving" type="primary" @click="save">保存</Button>
          </AccessControl>
          <AccessControl
            :codes="['SettingManagement.Emailing.Test']"
            type="code"
          >
            <Button @click="openTest">发送测试邮件</Button>
          </AccessControl>
          <Button @click="load">刷新</Button>
        </Space>
      </Form>
    </Card>

    <Modal
      v-model:open="testOpen"
      :confirm-loading="testing"
      title="发送测试邮件"
      @ok="sendTest"
    >
      <Form layout="vertical">
        <Form.Item label="发件人" required>
          <Input v-model:value="testForm.senderEmailAddress" />
        </Form.Item>
        <Form.Item label="收件人" required>
          <Input v-model:value="testForm.targetEmailAddress" />
        </Form.Item>
        <Form.Item label="主题" required>
          <Input v-model:value="testForm.subject" />
        </Form.Item>
        <Form.Item label="正文">
          <Input.TextArea v-model:value="testForm.body" :rows="4" />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>
