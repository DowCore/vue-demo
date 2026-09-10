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

import { refreshTokenApi } from './core';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

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
      const tenantId = localStorage.getItem('abp.tenantId');
      if (tenantId) {
        config.headers.__tenant = tenantId;
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

  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
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
baseRequestClient.addResponseInterceptor(
  errorMessageResponseInterceptor((msg: string, error) => {
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
