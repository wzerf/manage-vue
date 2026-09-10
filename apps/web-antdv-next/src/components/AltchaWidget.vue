<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { useAppConfig } from '@vben/hooks';

interface Props {
  challenge?: string;
  language?: string;
  modelValue?: string;
}

const props = withDefaults(defineProps<Props>(), {
  challenge: '',
  language: 'zh',
  modelValue: '',
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();
const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
function resolveChallengeUrl() {
  if (props.challenge) return props.challenge;
  return `${String(apiURL || '/api').replace(/\/$/, '')}/altcha/challenge`;
}
const host = ref<HTMLDivElement>();
let widget:
  | (HTMLElement & {
      reset?: (newState?: string, err?: null | string) => void;
    })
  | null = null;

type AltchaState =
  | 'code'
  | 'error'
  | 'expired'
  | 'unverified'
  | 'verified'
  | 'verifying';

function onStateChange(ev: Event) {
  const detail = (ev as CustomEvent<{ payload?: string; state: AltchaState }>)
    .detail;
  const payload =
    detail?.payload ??
    (widget?.querySelector('input[type="hidden"]') as HTMLInputElement | null)
      ?.value ??
    '';
  if (detail?.state === 'verified' && payload) {
    emit('update:modelValue', payload);
  } else if (detail?.state !== 'verified' && props.modelValue !== '') {
    emit('update:modelValue', '');
  }
}

function reset() {
  emit('update:modelValue', '');
  widget?.reset?.('unverified');
}

defineExpose({ reset });

onMounted(() => {
  const el = host.value;
  if (!el) return;
  widget = document.createElement('altcha-widget') as NonNullable<
    typeof widget
  >;
  widget.setAttribute('language', props.language);
  widget.setAttribute('challenge', resolveChallengeUrl());
  widget.setAttribute(
    'configuration',
    JSON.stringify({ hideLogo: true, hideFooter: true }),
  );
  widget.addEventListener('statechange', onStateChange);
  el.append(widget);
});

onBeforeUnmount(() => {
  if (widget) {
    widget.removeEventListener('statechange', onStateChange);
    widget.remove();
    widget = null;
  }
});
</script>

<template>
  <div ref="host" class="altcha-widget-host"></div>
</template>

<style scoped>
.altcha-widget-host {
  --altcha-max-width: 100%;

  display: block;
  width: 100%;
}

.altcha-widget-host :deep(altcha-widget) {
  display: block;
  width: 100%;
}

.altcha-widget-host :deep(.altcha),
.altcha-widget-host :deep(.altcha-main) {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
}
</style>
