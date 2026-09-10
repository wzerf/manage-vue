export const SecurityResultCode = {
  SUCCESS: 0,
  INTERNAL_ERROR: 1003,
  REQUEST_EXPIRED: 1004,
  REQUEST_ERROR: 1005,
  REQUEST_KEY_FAILED: 1006,
  REQUEST_NONCE_CONFLICT: 1007,
  REQUEST_SIGN_FAILED: 1008,
} as const;

export function isRequestKeyFailedCode(code: unknown): boolean {
  return Number(code) === SecurityResultCode.REQUEST_KEY_FAILED;
}

export function shouldSkipReAuthForKeyFailure(url: string): boolean {
  return url.includes('/auth/login') || url.includes('/public/');
}
