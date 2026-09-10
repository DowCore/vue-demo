import { useAccessStore } from '@vben/stores';

import { baseRequestClient } from '#/api/request';

const CLIENT_ID = import.meta.env.VITE_OPENID_CLIENT_ID || 'MetaDow_Vue';
const SCOPE =
  import.meta.env.VITE_OPENID_SCOPE ||
  'openid profile email offline_access MetaDowIdentityService MetaDowAdministration MetaDowSaaS';

export namespace AuthApi {
  export interface LoginParams {
    password?: string;
    username?: string;
  }

  export interface LoginResult {
    accessToken: string;
    refreshToken?: string;
  }
}

function toForm(data: Record<string, string>) {
  const body = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => body.set(key, value));
  return body;
}

export async function loginApi(data: AuthApi.LoginParams) {
  const resp = await baseRequestClient.post<{
    access_token: string;
    refresh_token?: string;
  }>(
    '/connect/token',
    toForm({
      client_id: CLIENT_ID,
      grant_type: 'password',
      password: data.password ?? '',
      scope: SCOPE,
      username: data.username ?? '',
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );

  return {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token,
  };
}

export async function refreshTokenApi() {
  const accessStore = useAccessStore();
  const refreshToken = accessStore.refreshToken;
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const resp = await baseRequestClient.post<{
    access_token: string;
    refresh_token?: string;
  }>(
    '/connect/token',
    toForm({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );

  return {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token,
  };
}

export async function logoutApi() {
  const accessStore = useAccessStore();
  const token = accessStore.accessToken;
  if (!token) {
    return;
  }

  try {
    await baseRequestClient.post(
      '/connect/revocation',
      toForm({
        client_id: CLIENT_ID,
        token,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );
  } catch {
    // 本地退出即可
  }
}

export async function getAccessCodesApi() {
  const { getApplicationConfigurationApi } = await import('#/api/abp');
  const config = await getApplicationConfigurationApi();
  const policies = config.auth?.grantedPolicies ?? {};
  return Object.keys(policies).filter((key) => policies[key]);
}
