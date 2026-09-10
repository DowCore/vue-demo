import type { Recordable, UserInfo } from '@vben/types';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';

import { notification } from 'ant-design-vue';
import { defineStore } from 'pinia';

import {
  clearApplicationConfiguration,
  getAccessCodesApi,
  getUserInfoApi,
  loginApi,
  loginByAuthorizationCodeApi,
  logoutApi,
} from '#/api';
import { $t } from '#/locales';
import { beginAuthorizationCodeLogin, takeOidcReturnUrl } from '#/utils/oidc';

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);

  function resolveRedirectPath(fallback: string) {
    const redirect = router.currentRoute.value.query.redirect;
    if (typeof redirect !== 'string' || !redirect) {
      return fallback;
    }
    const path = decodeURIComponent(redirect);
    return path.startsWith('/') && !path.startsWith('//') ? path : fallback;
  }

  async function completeLoginWithTokens(
    accessToken: string,
    refreshToken?: string,
    onSuccess?: () => Promise<void> | void,
    preferReturnUrl?: string,
  ) {
    accessStore.setAccessToken(accessToken);
    if (refreshToken) {
      accessStore.setRefreshToken(refreshToken);
    }

    clearApplicationConfiguration();
    const fetchUserInfoResult = await fetchUserInfo();
    const accessCodes = await getAccessCodesApi();

    userStore.setUserInfo(fetchUserInfoResult);
    accessStore.setAccessCodes(accessCodes);

    if (accessStore.loginExpired) {
      accessStore.setLoginExpired(false);
    } else {
      const target =
        preferReturnUrl ||
        resolveRedirectPath(
          fetchUserInfoResult.homePath || preferences.app.defaultHomePath,
        );
      onSuccess ? await onSuccess?.() : await router.push(target);
    }

    if (fetchUserInfoResult?.realName) {
      notification.success({
        description: `${$t('authentication.loginSuccessDesc')}:${fetchUserInfoResult?.realName}`,
        duration: 3,
        message: $t('authentication.loginSuccess'),
      });
    }

    return fetchUserInfoResult;
  }

  async function authLogin(
    params: Recordable<any>,
    onSuccess?: () => Promise<void> | void,
  ) {
    let userInfo: null | UserInfo = null;
    try {
      loginLoading.value = true;
      const { accessToken, refreshToken } = await loginApi(params);

      if (!accessToken) {
        notification.error({
          description:
            'AuthServer 未返回 access_token，请检查 /connect/token 与 MetaDow_Vue 客户端。',
          message: '登录失败',
        });
        return { userInfo };
      }

      userInfo = await completeLoginWithTokens(
        accessToken,
        refreshToken,
        onSuccess,
      );
    } catch (error) {
      accessStore.setAccessToken(null);
      accessStore.setRefreshToken(null);
      const isHttpError = Boolean(
        (error as { isAxiosError?: boolean; response?: unknown })
          ?.isAxiosError || (error as { response?: unknown })?.response,
      );
      if (!isHttpError && error instanceof Error && error.message) {
        notification.error({
          description: error.message,
          message: '登录失败',
        });
      }
      return { userInfo };
    } finally {
      loginLoading.value = false;
    }

    return { userInfo };
  }

  /** AuthServer Visit / SSO：授权码换 token 后进首页 */
  async function authLoginByCode(code: string, state: null | string) {
    try {
      loginLoading.value = true;
      const { accessToken, refreshToken } = await loginByAuthorizationCodeApi(
        code,
        state,
      );
      if (!accessToken) {
        throw new Error('授权码换取 access_token 失败');
      }
      const returnUrl = takeOidcReturnUrl();
      const userInfo = await completeLoginWithTokens(
        accessToken,
        refreshToken,
        undefined,
        returnUrl && returnUrl.startsWith('/') ? returnUrl : undefined,
      );
      return { userInfo };
    } catch (error) {
      accessStore.setAccessToken(null);
      accessStore.setRefreshToken(null);
      throw error;
    } finally {
      loginLoading.value = false;
    }
  }

  async function startSsoLogin(returnUrl?: string) {
    await beginAuthorizationCodeLogin(returnUrl);
  }

  async function logout(redirect: boolean = true) {
    try {
      await logoutApi();
    } catch {
      // ignore
    }
    clearApplicationConfiguration();
    resetAllStores();
    accessStore.setLoginExpired(false);

    await router.replace({
      path: LOGIN_PATH,
      query: redirect
        ? {
            redirect: encodeURIComponent(router.currentRoute.value.fullPath),
          }
        : {},
    });
  }

  async function fetchUserInfo() {
    const userInfo = await getUserInfoApi();
    userStore.setUserInfo(userInfo);
    return userInfo;
  }

  function $reset() {
    loginLoading.value = false;
  }

  return {
    $reset,
    authLogin,
    authLoginByCode,
    fetchUserInfo,
    loginLoading,
    logout,
    startSsoLogin,
  };
});
