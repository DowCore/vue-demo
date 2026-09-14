import { requestClient } from '#/api/request';

/** ABP Account：发送重置密码邮件 */
export function sendPasswordResetCodeApi(data: {
  appName: string;
  email: string;
  returnUrl?: string;
  returnUrlHash?: string;
}) {
  return requestClient.post('/api/account/send-password-reset-code', data);
}

export function verifyPasswordResetTokenApi(data: {
  resetToken: string;
  userId: string;
}) {
  return requestClient.post<boolean>(
    '/api/account/verify-password-reset-token',
    data,
  );
}

export function resetPasswordApi(data: {
  password: string;
  resetToken: string;
  userId: string;
}) {
  return requestClient.post('/api/account/reset-password', data);
}
