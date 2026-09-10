export const SECURITY_HEADERS = {
  REQUEST_TIMESTAMP: 'X-Request-Timestamp',
  REQUEST_ID: 'X-Request-ID',
  REQUEST_ENCRYPTED_KEY: 'X-Request-Encrypted-Key',
  REQUEST_SIGNATURE: 'X-Request-Signature',
  RESPONSE_IS_ENCRYPT: 'X-Response-Is-Encrypt',
  LANGUAGE: 'X-Language',
} as const;

export const SIGN_DATA_AAD_KEY = 'signData';
