import type { Recordable, UserInfo } from '@vben/types';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import { resetAllStores, useAccessStore, useUserStore } from '@vben/stores';

import { notification } from 'antdv-next';
import { defineStore } from 'pinia';

import { getAccessCodesApi, getUserInfoApi, loginApi, logoutApi } from '#/api';
import {
  clearCachedPublicKey,
  prepareGlobalPublicKey,
  setCachedPublicKey,
} from '#/api/security';
import { $t } from '#/locales';
import { clearAccessMenusCache } from '#/utils/menu-cache';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);

  async function authLogin(
    params: Recordable<any>,
    onSuccess?: () => Promise<void> | void,
  ) {
    let userInfo: null | UserInfo = null;
    try {
      loginLoading.value = true;
      await prepareGlobalPublicKey(apiURL || '/api');
      const { accessToken, publicKey } = await loginApi(params);

      if (accessToken) {
        accessStore.setAccessToken(accessToken);
        if (publicKey) {
          setCachedPublicKey(publicKey);
        }

        const [fetchUserInfoResult, accessCodes] = await Promise.all([
          fetchUserInfo(),
          getAccessCodesApi(),
        ]);

        userInfo = fetchUserInfoResult;

        userStore.setUserInfo(userInfo);
        accessStore.setAccessCodes(accessCodes);

        if (accessStore.loginExpired) {
          accessStore.setLoginExpired(false);
        } else {
          onSuccess
            ? await onSuccess?.()
            : await router.push(
                userInfo.homePath || preferences.app.defaultHomePath,
              );
        }

        if (userInfo?.realName) {
          notification.success({
            description: `${$t('authentication.loginSuccessDesc')}:${userInfo?.realName}`,
            duration: 3,
            title: $t('authentication.loginSuccess'),
          });
        }
      }
    } finally {
      loginLoading.value = false;
    }

    return {
      userInfo,
    };
  }

  async function logout(
    redirect: boolean = true,
    options: { skipApi?: boolean } = {},
  ) {
    if (!options.skipApi) {
      try {
        await logoutApi();
      } catch {
        // 服务端登出失败不影响本地清理
      }
    }
    resetAllStores();
    accessStore.setLoginExpired(false);
    clearAccessMenusCache();
    clearCachedPublicKey();

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
    fetchUserInfo,
    loginLoading,
    logout,
  };
});
