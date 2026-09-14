import { requestClient } from '#/api/request';

export interface EmailSettings {
  defaultFromAddress?: string;
  defaultFromDisplayName?: string;
  smtpDomain?: string;
  smtpEnableSsl?: boolean;
  smtpHost?: string;
  smtpPassword?: string;
  smtpPort?: number;
  smtpUseDefaultCredentials?: boolean;
  smtpUserName?: string;
}

export interface UpdateEmailSettingsInput {
  defaultFromAddress: string;
  defaultFromDisplayName: string;
  smtpDomain?: string;
  smtpEnableSsl: boolean;
  smtpHost?: string;
  smtpPassword?: string;
  smtpPort: number;
  smtpUseDefaultCredentials: boolean;
  smtpUserName?: string;
}

export interface SendTestEmailInput {
  body?: string;
  senderEmailAddress: string;
  subject: string;
  targetEmailAddress: string;
}

export function getEmailSettingsApi() {
  return requestClient.get<EmailSettings>('/api/setting-management/emailing');
}

export function updateEmailSettingsApi(data: UpdateEmailSettingsInput) {
  return requestClient.post('/api/setting-management/emailing', data);
}

export function sendTestEmailApi(data: SendTestEmailInput) {
  // SMTP 连接/认证可能较慢；默认 axios 10s 会被取消（Network 显示 canceled）
  return requestClient.post(
    '/api/setting-management/emailing/send-test-email',
    data,
    { timeout: 60_000 },
  );
}
