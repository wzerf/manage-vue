import type { RequestClientOptions } from '@vben/request';

import type { RequestSecurityDeps } from '#/api/security';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  defaultResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { message } from 'antdv-next';

import {
  applyRequestSecurity,
  clearCachedPublicKey,
  decryptResponseData,
  ensurePublicKey,
  getPublicCryptoKey,
  getSecurityFlags,
  isRequestKeyFailedCode,
  isResponseEncrypted,
  pickStringHeader,
  shouldSkipReAuthForKeyFailure,
} from '#/api/security';
import { useAuthStore } from '#/store';
import {
  aesDecrypt,
  aesEncrypt,
  generateAesKey,
  rsaEncrypt,
} from '#/utils/crypto';
import { clearAccessMenusCache } from '#/utils/menu-cache';

import { refreshTokenApi } from './core';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
const resolvedApiURL = apiURL || '/api';

type AxiosConfigLike = {
  _aesKey?: CryptoKey | null;
  baseURL?: string;
  data?: unknown;
  headers?: Record<string, unknown>;
  meta?: { skipEncrypt?: boolean };
  method?: string;
  params?: Record<string, unknown> | string | URLSearchParams;
  responseType?: string;
  transformRequest?: unknown;
  url?: string;
};

function createSecurityDeps(): RequestSecurityDeps {
  return {
    aesEncrypt,
    aesDecrypt,
    generateAesKey,
    rsaEncrypt,
    ensurePublicKey: () => ensurePublicKey(resolvedApiURL),
    getPublicCryptoKey,
  };
}

function attachSecurityInterceptors(client: RequestClient) {
  const deps = createSecurityDeps();

  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const cfg = config as AxiosConfigLike;
      const flags = getSecurityFlags();
      const contentType = pickStringHeader(cfg.headers, [
        'Content-Type',
        'content-type',
      ]);

      const secured = await applyRequestSecurity(
        {
          baseURL: cfg.baseURL ?? resolvedApiURL,
          data: cfg.data,
          headers: cfg.headers as Record<string, unknown> | undefined,
          method: cfg.method,
          params: cfg.params,
          meta: cfg.meta,
          url: cfg.url,
          contentType,
          language: preferences.app.locale,
        },
        flags,
        deps,
      );

      cfg.headers = secured.headers as typeof cfg.headers;
      cfg.data = secured.data;
      cfg._aesKey = secured.aesKey ?? null;

      if (secured.responseType) {
        cfg.responseType = secured.responseType;
      }
      if (secured.rawBody) {
        cfg.transformRequest = [(data: unknown) => data];
        if (cfg.headers) {
          cfg.headers['Content-Type'] = 'application/json';
        }
      }

      return config;
    },
  });

  client.addResponseInterceptor({
    fulfilled: async (response) => {
      const cfg = response.config as AxiosConfigLike;
      const decrypted = await decryptResponseData(
        {
          data: response.data,
          isEncrypted: isResponseEncrypted(
            response.headers as Record<string, unknown>,
          ),
          aesKey: cfg._aesKey,
        },
        deps,
      );
      response.data = decrypted;
      return response;
    },
    rejected: async (error: unknown) => {
      const err = error as {
        response?: {
          config?: AxiosConfigLike;
          data?: unknown;
          headers?: Record<string, unknown>;
        };
      };
      if (err?.response) {
        const cfg = err.response.config;
        err.response.data = await decryptResponseData(
          {
            data: err.response.data,
            isEncrypted: isResponseEncrypted(err.response.headers),
            aesKey: cfg?._aesKey,
          },
          deps,
        );
      }
      throw error;
    },
  });
}

function createRequestClient(baseURL: string, options?: RequestClientOptions) {
  const client = new RequestClient({
    ...options,
    baseURL,
    paramsSerializer: options?.paramsSerializer ?? 'repeat',
  });

  let reAuthPromise: null | Promise<void> = null;
  async function doReAuthenticate(
    reason = 'Access token is invalid or expired.',
  ) {
    if (reAuthPromise) {
      return reAuthPromise;
    }
    reAuthPromise = (async () => {
      console.warn(reason);
      const accessStore = useAccessStore();
      const authStore = useAuthStore();
      accessStore.setAccessToken(null);
      clearAccessMenusCache();
      clearCachedPublicKey();
      if (
        preferences.app.loginExpiredMode === 'modal' &&
        accessStore.isAccessChecked
      ) {
        accessStore.setLoginExpired(true);
      } else {
        await authStore.logout(true, { skipApi: true });
      }
    })().finally(() => {
      reAuthPromise = null;
    });
    return reAuthPromise;
  }

  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const resp = await refreshTokenApi();
    const newToken = resp.data;
    accessStore.setAccessToken(newToken);
    return newToken;
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  client.addRequestInterceptor({
    fulfilled: async (config) => {
      if (!config.url?.startsWith('/public/')) {
        const accessStore = useAccessStore();
        config.headers.Authorization = formatToken(accessStore.accessToken);
      }
      config.headers['Accept-Language'] = preferences.app.locale;
      return config;
    },
  });

  attachSecurityInterceptors(client);

  client.addResponseInterceptor(
    defaultResponseInterceptor({
      codeField: 'code',
      dataField: 'data',
      successCode: 0,
    }),
  );

  client.addResponseInterceptor({
    rejected: async (error: unknown) => {
      const err = error as {
        __handledByAuthInterceptor?: boolean;
        config?: { url?: string };
        data?: { code?: unknown; message?: string; msg?: string };
        response?: {
          config?: { url?: string };
          data?: { code?: unknown; message?: string; msg?: string };
        };
      };
      const payload = err?.response?.data ?? err?.data ?? {};
      const requestUrl = String(
        err?.config?.url ?? err?.response?.config?.url ?? '',
      );
      if (
        isRequestKeyFailedCode(payload?.code) &&
        !shouldSkipReAuthForKeyFailure(requestUrl)
      ) {
        const errMsg =
          (typeof payload?.msg === 'string' && payload.msg) ||
          (typeof payload?.message === 'string' && payload.message) ||
          '密钥错误';
        message.error(errMsg);
        await doReAuthenticate(
          'Request key failed (1006), redirecting to login...',
        );
        throw Object.assign(error as object, {
          __handledByAuthInterceptor: true,
        });
      }
      throw error;
    },
  });

  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate: () => doReAuthenticate(),
      doRefreshToken,
      enableRefreshToken: preferences.app.enableRefreshToken,
      formatToken,
    }),
  );

  client.addResponseInterceptor(
    errorMessageResponseInterceptor((msg: string, error) => {
      if (
        error &&
        typeof error === 'object' &&
        '__handledByAuthInterceptor' in error
      ) {
        return;
      }
      const responseData = error?.response?.data ?? error ?? {};
      const errorMessage =
        responseData?.msg ?? responseData?.message ?? responseData?.error ?? '';
      message.error(errorMessage || msg);
    }),
  );

  return client;
}

export const requestClient = createRequestClient(resolvedApiURL, {
  responseReturn: 'data',
});

export const baseRequestClient = new RequestClient({
  baseURL: resolvedApiURL,
  paramsSerializer: 'repeat',
});
attachSecurityInterceptors(baseRequestClient);

export interface PageFetchParams {
  [key: string]: any;
  pageNo?: number;
  pageSize?: number;
}
