<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, markRaw, onMounted, ref } from 'vue';

import { AuthenticationLogin, z } from '@vben/common-ui';
import { useAppConfig } from '@vben/hooks';
import { $t } from '@vben/locales';

import { prepareGlobalPublicKey } from '#/api/security';
import AltchaWidget from '#/components/AltchaWidget.vue';
import { useAuthStore } from '#/store';

defineOptions({ name: 'Login' });

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
const authStore = useAuthStore();

onMounted(() => {
  void prepareGlobalPublicKey(apiURL || '/api');
});
const loginRef = ref<null | {
  getFormApi: () => {
    getFieldComponentRef?: (
      field: string,
    ) => undefined | { reset?: () => void };
    setFieldValue?: (field: string, value: unknown) => void;
  };
}>(null);

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        autocomplete: 'username',
        placeholder: $t('authentication.usernameTip'),
      },
      fieldName: 'username',
      label: $t('authentication.username'),
      rules: z.string().min(1, { message: $t('authentication.usernameTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        autocomplete: 'current-password',
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
    {
      component: markRaw(AltchaWidget),
      componentProps: {
        language: 'zh',
      },
      fieldName: 'altcha',
      rules: z.string().min(1, {
        message: $t('authentication.verifyRequiredTip'),
      }),
    },
  ];
});

function resetAltcha() {
  const formApi = loginRef.value?.getFormApi?.();
  if (!formApi) return;
  formApi.setFieldValue?.('altcha', '');
  const altchaComp = formApi.getFieldComponentRef?.('altcha') as
    | undefined
    | { reset?: () => void };
  altchaComp?.reset?.();
}

async function handleLogin(values: Recordable<any>) {
  try {
    await authStore.authLogin(values);
  } catch {
    resetAltcha();
  }
}
</script>

<template>
  <AuthenticationLogin
    ref="loginRef"
    :form-schema="formSchema"
    :loading="authStore.loginLoading"
    @submit="handleLogin"
  />
</template>
