/**
 * ABP API 不使用 { code, data } 包装，直接返回业务 JSON。
 */
import type { RequestClientOptions } from '@vben/request';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { message } from 'ant-design-vue';

import { useAuthStore } from '#/store';
import { clearLocalTenant, TENANT_STORAGE_KEY } from '#/utils/tenant';

import { refreshTokenApi } from './core';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

function applyTenantHeader(config: { headers: Record<string, any> }) {
  const ignore = config.headers?.['X-Ignore-Tenant'];
  if (ignore === '1' || ignore === 1 || ignore === true) {
    delete config.headers.__tenant;
    delete config.headers['X-Ignore-Tenant'];
    return;
  }
  const tenantId = localStorage.getItem(TENANT_STORAGE_KEY);
  if (tenantId) {
    config.headers.__tenant = tenantId;
  }
}

function isTenantNotFoundError(error: unknown) {
  const data = (error as { response?: { data?: any } })?.response?.data;
  const code = data?.error?.code ?? data?.code ?? '';
  const message = String(
    data?.error?.message ?? data?.error_description ?? data?.message ?? '',
  );
  return (
    String(code).includes('TenantNotFound') ||
    message.includes('未找到租户') ||
    message.includes('Tenant not found')
  );
}

function unwrapAbpResponse() {
  return {
    fulfilled: (response: any) => {
      if (response?.config?.responseReturn === 'raw') {
        return response;
      }
      return response?.data ?? response;
    },
  };
}

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({
    ...options,
    baseURL,
  });

  client.addResponseInterceptor(unwrapAbpResponse());

  async function doReAuthenticate() {
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    accessStore.setAccessToken(null);
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setLoginExpired(true);
    } else {
      await authStore.logout();
    }
  }

  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const resp = await refreshTokenApi();
    if (!resp.accessToken) {
      throw new Error('Refresh token did not return access_token');
    }
    accessStore.setAccessToken(resp.accessToken);
    if (resp.refreshToken) {
      accessStore.setRefreshToken(resp.refreshToken);
    }
    return resp.accessToken;
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();
      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      applyTenantHeader(config);
      // 浏览器 Cookie 场景下补充防伪头，避免 POST/DELETE 空 400
      const xsrf = document.cookie
        .split('; ')
        .find((row) => row.startsWith('XSRF-TOKEN='))
        ?.split('=')
        .slice(1)
        .join('=');
      if (xsrf) {
        const token = decodeURIComponent(xsrf);
        config.headers.RequestVerificationToken = token;
        config.headers['X-XSRF-TOKEN'] = token;
      }
      return config;
    },
  });

  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate,
      doRefreshToken,
      enableRefreshToken: preferences.app.enableRefreshToken,
      formatToken,
    }),
  );

  client.addResponseInterceptor({
    rejected: async (error) => {
      if (isTenantNotFoundError(error)) {
        clearLocalTenant();
      }
      throw error;
    },
  });

  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
      if (isTenantNotFoundError(error)) {
        message.error(
          '本地租户已失效（可能被删除），已切回宿主。请刷新后重试。',
        );
        return;
      }
      const responseData = error?.response?.data ?? {};
      const abpError = responseData?.error;
      const errorMessage =
        (typeof abpError === 'string' ? abpError : abpError?.message) ||
        responseData?.error_description ||
        responseData?.message ||
        '';
      message.error(errorMessage || msg);
    }),
  );

  return client;
}

export const requestClient = createRequestClient(apiURL, {
  responseReturn: 'body',
});

export const baseRequestClient = new RequestClient({
  baseURL: apiURL,
  responseReturn: 'body',
});

baseRequestClient.addResponseInterceptor(unwrapAbpResponse());
baseRequestClient.addRequestInterceptor({
  fulfilled: async (config) => {
    applyTenantHeader(config);
    return config;
  },
});
baseRequestClient.addResponseInterceptor({
  rejected: async (error) => {
    if (isTenantNotFoundError(error)) {
      clearLocalTenant();
    }
    throw error;
  },
});
baseRequestClient.addResponseInterceptor(
  errorMessageResponseInterceptor((msg: string, error) => {
    if (isTenantNotFoundError(error)) {
      message.error('本地租户已失效（可能被删除），已切回宿主。请刷新后重试。');
      return;
    }
    const responseData = error?.response?.data ?? {};
    const errorMessage =
      responseData?.error_description ||
      (typeof responseData?.error === 'string'
        ? responseData.error
        : responseData?.error?.message) ||
      responseData?.message ||
      '';
    message.error(errorMessage || msg);
  }),
);
