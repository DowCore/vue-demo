import { useAccessStore } from '@vben/stores';

import { baseRequestClient } from '#/api/request';
import {
  getOidcClientId,
  getOidcRedirectUri,
  resolvePkceVerifier,
} from '#/utils/oidc';

const CLIENT_ID = import.meta.env.VITE_OPENID_CLIENT_ID || 'MetaDow_Vue';
const SCOPE =
  import.meta.env.VITE_OPENID_SCOPE ||
  'openid offline_access profile email MetaDowIdentityService MetaDowAdministration MetaDowSaaS';

export namespace AuthApi {
  export interface LoginParams {
    password?: string;
    username?: string;
  }

  export interface LoginResult {
    accessToken?: string;
    refreshToken?: string;
  }
}

function toForm(data: Record<string, string>) {
  const body = new URLSearchParams();
  Object.entries(data).forEach(([key, value]) => body.set(key, value));
  return body.toString();
}

function pickToken(resp: unknown) {
  const payload = resp as {
    access_token?: string;
    data?: { access_token?: string; refresh_token?: string };
    refresh_token?: string;
  };
  const body = payload?.access_token ? payload : (payload?.data ?? payload);
  return {
    accessToken: body?.access_token,
    refreshToken: body?.refresh_token,
  };
}

const formHeaders = {
  'Content-Type': 'application/x-www-form-urlencoded',
};

export async function loginApi(data: AuthApi.LoginParams) {
  const resp = await baseRequestClient.post(
    '/connect/token',
    toForm({
      client_id: CLIENT_ID,
      grant_type: 'password',
      password: data.password ?? '',
      scope: SCOPE,
      username: data.username ?? '',
    }),
    {
      headers: formHeaders,
    },
  );

  return pickToken(resp);
}

/** 授权码 + PKCE 换 token（供 AuthServer Visit / SSO 使用） */
export async function loginByAuthorizationCodeApi(
  code: string,
  state: null | string,
) {
  const verifier = await resolvePkceVerifier(state);
  const resp = await baseRequestClient.post(
    '/connect/token',
    toForm({
      client_id: getOidcClientId(),
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: getOidcRedirectUri(),
    }),
    {
      headers: formHeaders,
    },
  );

  return pickToken(resp);
}

export async function refreshTokenApi() {
  const accessStore = useAccessStore();
  const refreshToken = accessStore.refreshToken;
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const resp = await baseRequestClient.post(
    '/connect/token',
    toForm({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    {
      headers: formHeaders,
    },
  );

  return pickToken(resp);
}

export async function logoutApi() {
  const accessStore = useAccessStore();
  const token = accessStore.accessToken;
  if (!token) {
    return;
  }

  try {
    await baseRequestClient.post(
      '/connect/revocat',
      toForm({
        client_id: CLIENT_ID,
        token,
        token_type_hint: 'access_token',
      }),
      {
        headers: formHeaders,
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
