import { importRsaPublicKey } from '#/utils/crypto';

const STORAGE_KEY = 'encrypt-public-key';

let cachedPublicKeyBase64 = '';
let cachedPublicCryptoKey: CryptoKey | null = null;
let inflight: null | Promise<string> = null;

function readPersistedPublicKey(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return (
      window.localStorage.getItem(STORAGE_KEY) ||
      window.sessionStorage.getItem(STORAGE_KEY) ||
      ''
    );
  } catch {
    return '';
  }
}

function writePersistedPublicKey(publicKey: string) {
  if (typeof window === 'undefined' || !publicKey) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, publicKey);
    window.sessionStorage.setItem(STORAGE_KEY, publicKey);
  } catch {
    // quota / 隐私模式：仅内存缓存
  }
}

function removePersistedPublicKey() {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function hydrateFromStorage(): string {
  if (cachedPublicKeyBase64) {
    return cachedPublicKeyBase64;
  }
  const stored = readPersistedPublicKey();
  if (stored) {
    cachedPublicKeyBase64 = stored;
    cachedPublicCryptoKey = null;
  }
  return cachedPublicKeyBase64;
}

export function clearCachedPublicKey() {
  cachedPublicKeyBase64 = '';
  cachedPublicCryptoKey = null;
  inflight = null;
  removePersistedPublicKey();
}

export function getCachedPublicKey(): string {
  return hydrateFromStorage();
}

export function setCachedPublicKey(publicKey: string) {
  if (!publicKey) {
    return;
  }
  if (publicKey !== cachedPublicKeyBase64) {
    cachedPublicKeyBase64 = publicKey;
    cachedPublicCryptoKey = null;
  }
  writePersistedPublicKey(publicKey);
}

export async function fetchPublicKey(apiBase: string): Promise<string> {
  const base = (apiBase || '/api').replace(/\/$/, '');
  const url = `${base}/encrypt/public/key`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return '';
  }
  const res = (await response.json()) as {
    data?: { publicKey?: string };
  };
  return res?.data?.publicKey || '';
}

export interface EnsurePublicKeyOptions {
  force?: boolean;
}

export async function ensurePublicKey(
  apiBase: string,
  options?: EnsurePublicKeyOptions,
): Promise<string> {
  if (options?.force) {
    cachedPublicKeyBase64 = '';
    cachedPublicCryptoKey = null;
  } else {
    const local = hydrateFromStorage();
    if (local) {
      return local;
    }
  }

  if (inflight) {
    return inflight;
  }

  const base = apiBase || '/api';
  inflight = (async () => {
    try {
      const key = await fetchPublicKey(base);
      if (key) {
        setCachedPublicKey(key);
      }
      return key;
    } catch {
      return '';
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function prepareGlobalPublicKey(apiBase: string): Promise<string> {
  clearCachedPublicKey();
  return ensurePublicKey(apiBase || '/api', { force: true });
}

export async function getPublicCryptoKey(): Promise<CryptoKey | undefined> {
  hydrateFromStorage();
  if (cachedPublicCryptoKey) {
    return cachedPublicCryptoKey;
  }
  if (!cachedPublicKeyBase64) {
    return undefined;
  }
  try {
    cachedPublicCryptoKey = await importRsaPublicKey(cachedPublicKeyBase64);
    return cachedPublicCryptoKey;
  } catch {
    return undefined;
  }
}
