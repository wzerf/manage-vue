import type { SecurityFlags } from './config';

import {
  aesDecrypt,
  aesEncrypt,
  generateAesKey,
  rsaEncrypt,
  uriSort,
} from '#/utils/crypto';

import { SECURITY_HEADERS, SIGN_DATA_AAD_KEY } from './headers';
import {
  isSecurityWhitelisted,
  resolveRequestPath,
  shouldSkipBodyCrypto,
} from './path-matcher';

export interface SecureRequestConfig {
  baseURL?: string;
  data?: unknown;
  headers?: Record<string, unknown>;
  method?: string;
  params?: Record<string, unknown> | string | URLSearchParams;
  meta?: { skipEncrypt?: boolean };
  url?: string;
  contentType?: null | string;
  language?: string;
}

export interface SecureRequestResult {
  headers: Record<string, unknown>;
  data?: unknown;
  aesKey?: CryptoKey;
  responseType?: 'text';
  rawBody?: boolean;
}

export interface RequestSecurityDeps {
  aesEncrypt: typeof aesEncrypt;
  aesDecrypt: typeof aesDecrypt;
  generateAesKey: typeof generateAesKey;
  rsaEncrypt: typeof rsaEncrypt;
  ensurePublicKey: () => Promise<string>;
  getPublicCryptoKey: () => Promise<CryptoKey | undefined>;
  now?: () => number;
  nonce?: () => string;
}

export function pickStringHeader(
  headers: Record<string, unknown> | undefined,
  names: string[],
): null | string {
  if (!headers) return null;
  for (const name of names) {
    const value = headers[name];
    if (typeof value === 'string') return value;
  }
  return null;
}

function normalizeParams(
  params: Record<string, unknown> | string | undefined | URLSearchParams,
): Record<string, string> {
  if (!params) return {};

  if (typeof params === 'string') {
    return Object.fromEntries(new URLSearchParams(params));
  }

  if (params instanceof URLSearchParams) {
    return Object.fromEntries(params.entries());
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      const first = v.find(
        (item) => item !== undefined && item !== null && item !== '',
      );
      if (first === undefined) continue;
      out[k] = String(first);
      continue;
    }
    out[k] = String(v);
  }
  return out;
}

function defaultNonce(): string {
  return Math.random().toString(36).slice(2, 18);
}

function isGetMethod(method?: string): boolean {
  return (method ?? 'get').toUpperCase() === 'GET';
}

function parseMaybeJsonData(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function bodyAsSignString(data: unknown): string {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') return data;
  return JSON.stringify(data);
}

export async function applyRequestSecurity(
  config: SecureRequestConfig,
  flags: SecurityFlags,
  deps: RequestSecurityDeps,
): Promise<SecureRequestResult> {
  const headers: Record<string, unknown> = { ...config.headers };
  const path = resolveRequestPath(config.url, config.baseURL);
  const whitelisted = isSecurityWhitelisted(path);
  const skipBody =
    config.meta?.skipEncrypt === true ||
    shouldSkipBodyCrypto({
      contentType:
        config.contentType ??
        pickStringHeader(headers, ['Content-Type', 'content-type']),
      data: config.data,
      path,
    });

  if (flags.languageEnabled && config.language) {
    headers[SECURITY_HEADERS.LANGUAGE] = config.language;
  }

  const needTimestamp =
    flags.timestampEnabled || flags.encryptEnabled || flags.signEnabled;
  const needNonce =
    flags.nonceEnabled || flags.encryptEnabled || flags.signEnabled;

  const timestamp = deps.now?.() ?? Date.now();
  const requestId = deps.nonce?.() ?? defaultNonce();

  if (needTimestamp) {
    headers[SECURITY_HEADERS.REQUEST_TIMESTAMP] = String(timestamp);
  }
  if (needNonce) {
    headers[SECURITY_HEADERS.REQUEST_ID] = requestId;
  }

  if (whitelisted || skipBody) {
    return { headers, data: config.data };
  }

  if (!flags.encryptEnabled && !flags.signEnabled) {
    return { headers, data: config.data };
  }

  const publicKey = await deps.ensurePublicKey();
  if (!publicKey) {
    throw new Error(
      '[request-security] 无法获取 RSA 公钥（/encrypt/public/key），加密/签名请求中止',
    );
  }
  const publicCryptoKey = await deps.getPublicCryptoKey();
  if (!publicCryptoKey) {
    throw new Error('[request-security] RSA 公钥导入失败，加密/签名请求中止');
  }

  const { key, keyBase64 } = await deps.generateAesKey();
  headers[SECURITY_HEADERS.REQUEST_ENCRYPTED_KEY] = await deps.rsaEncrypt(
    keyBase64,
    publicCryptoKey,
  );

  const params = normalizeParams(config.params);
  const aadBase: Record<string, unknown> = {
    ...params,
  };
  const requestIdHeader = headers[SECURITY_HEADERS.REQUEST_ID];
  if (requestIdHeader !== undefined && requestIdHeader !== null) {
    aadBase[SECURITY_HEADERS.REQUEST_ID] = requestIdHeader;
  }
  const timestampHeader = headers[SECURITY_HEADERS.REQUEST_TIMESTAMP];
  if (timestampHeader !== undefined && timestampHeader !== null) {
    aadBase[SECURITY_HEADERS.REQUEST_TIMESTAMP] = timestampHeader;
  }

  if (flags.encryptEnabled) {
    const aad = uriSort(aadBase);
    const isGet = isGetMethod(config.method);
    const payload = isGet ? undefined : parseMaybeJsonData(config.data);
    const aesData = await deps.aesEncrypt(key, aad, payload);
    headers[SECURITY_HEADERS.REQUEST_SIGNATURE] = aesData.TagIv;

    const encryptedBody =
      isGet || aesData.Ciphertext === '' ? config.data : aesData.Ciphertext;

    return {
      headers,
      data: encryptedBody,
      aesKey: key,
      responseType: 'text',
      rawBody: !isGet && typeof encryptedBody === 'string',
    };
  }

  const signAadParams: Record<string, unknown> = { ...aadBase };
  const signBody = bodyAsSignString(config.data);
  if (signBody.length > 0) {
    signAadParams[SIGN_DATA_AAD_KEY] = signBody;
  }
  const signAad = uriSort(signAadParams);
  const signData = await deps.aesEncrypt(key, signAad, undefined);
  headers[SECURITY_HEADERS.REQUEST_SIGNATURE] = signData.TagIv;

  return {
    headers,
    data: config.data,
    aesKey: key,
  };
}

function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (
    !(
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
  ) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export async function decryptResponseData(
  options: {
    aesKey?: CryptoKey | null;
    data: unknown;
    isEncrypted: boolean;
  },
  deps: Pick<RequestSecurityDeps, 'aesDecrypt'>,
): Promise<unknown> {
  if (!options.isEncrypted || !options.aesKey) {
    return tryParseJson(options.data);
  }
  const encryptedText =
    typeof options.data === 'string'
      ? options.data
      : JSON.stringify(options.data);
  const decryptedText = await deps.aesDecrypt(
    encryptedText,
    options.aesKey,
    '',
  );
  return tryParseJson(decryptedText);
}

export function isResponseEncrypted(
  headers: null | Record<string, unknown> | undefined,
): boolean {
  if (!headers) return false;
  const value =
    headers[SECURITY_HEADERS.RESPONSE_IS_ENCRYPT] ??
    headers['x-response-is-encrypt'] ??
    headers['X-Response-Is-Encrypt'];
  return String(value).toLowerCase() === 'true';
}
