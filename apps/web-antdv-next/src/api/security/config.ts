export interface SecurityFlags {
  timestampEnabled: boolean;
  encryptEnabled: boolean;
  nonceEnabled: boolean;
  signEnabled: boolean;
  languageEnabled: boolean;
}

export function envFlagEnabled(
  raw: boolean | null | string | undefined,
  defaultValue = true,
): boolean {
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  const normalized = String(raw).trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(normalized);
}

export function loadSecurityFlags(
  env: Record<string, boolean | null | string | undefined> = {},
): SecurityFlags {
  return {
    timestampEnabled: envFlagEnabled(env.VITE_SECURITY_TIMESTAMP_ENABLED),
    encryptEnabled: envFlagEnabled(env.VITE_SECURITY_ENCRYPT_ENABLED),
    nonceEnabled: envFlagEnabled(env.VITE_SECURITY_NONCE_ENABLED),
    signEnabled: envFlagEnabled(env.VITE_SECURITY_SIGN_ENABLED),
    languageEnabled: envFlagEnabled(env.VITE_SECURITY_LANGUAGE_ENABLED),
  };
}

export function getSecurityFlags(): SecurityFlags {
  return loadSecurityFlags(
    import.meta.env as Record<string, boolean | string | undefined>,
  );
}
