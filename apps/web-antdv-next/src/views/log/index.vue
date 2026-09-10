<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Spin, TabPane, Tabs } from 'antdv-next';

import { $t } from '#/locales';
import Forbidden from '#/views/_core/fallback/forbidden.vue';
import ApiLogPanel from '#/views/log/api-log/index.vue';
import LoginLogPanel from '#/views/log/login-log/index.vue';

defineOptions({ name: 'LogAudit' });

type LogTabKey = 'api' | 'login';

const LOG_TAB_DEFS: Array<{
  key: LogTabKey;
  label: string;
  permissionCode: string;
}> = [
  {
    key: 'login',
    label: $t('log.loginLog.title'),
    permissionCode: 'log:login-log:list',
  },
  {
    key: 'api',
    label: $t('log.apiLog.title'),
    permissionCode: 'log:api-log:list',
  },
];

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const allowedTabs = computed(() =>
  LOG_TAB_DEFS.filter((t) => hasAccessByCodes([t.permissionCode])),
);

const allowedKeys = computed(() => allowedTabs.value.map((t) => t.key));

function isLogTabKey(value: unknown): value is LogTabKey {
  return value === 'login' || value === 'api';
}

const activeKey = computed<LogTabKey | undefined>(() => {
  const keys = allowedKeys.value;
  if (keys.length === 0) return undefined;
  const requested = route.query.tab;
  if (isLogTabKey(requested) && keys.includes(requested)) {
    return requested;
  }
  if (keys.includes('login')) return 'login';
  return keys[0];
});

/** 已访问 Tab 缓存挂载，二次切换不重挂载 */
const visitedTabs = ref<Set<LogTabKey>>(new Set());
const panelLoading = ref(false);
let loadingTimer: null | ReturnType<typeof setTimeout> = null;

const effectiveVisited = computed(() => {
  const next = new Set(visitedTabs.value);
  if (activeKey.value) next.add(activeKey.value);
  return next;
});

function markVisited(key: LogTabKey) {
  if (visitedTabs.value.has(key)) return;
  const next = new Set(visitedTabs.value);
  next.add(key);
  visitedTabs.value = next;
}

function clearLoadingTimer() {
  if (loadingTimer) {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }
}

/** 切换时展示 Spin，等下一帧布局后再关闭，掩盖表格首屏抖动 */
function flashPanelLoading() {
  clearLoadingTimer();
  panelLoading.value = true;
  void nextTick(() => {
    loadingTimer = setTimeout(() => {
      panelLoading.value = false;
      loadingTimer = null;
    }, 120);
  });
}

// 校正非法 / 无权限的 tab 参数
watch(
  activeKey,
  (key) => {
    if (!key) return;
    markVisited(key);
    if (route.query.tab === key) return;
    router.replace({
      path: route.path,
      query: { ...route.query, tab: key },
    });
  },
  { immediate: true },
);

// activeKey 变化时统一闪一次 loading（含 URL 直达与点击 Tab）
watch(activeKey, (key, prev) => {
  if (!key || key === prev) return;
  flashPanelLoading();
});

function onTabChange(key: number | string) {
  const next = String(key);
  if (!isLogTabKey(next) || next === activeKey.value) return;
  markVisited(next);
  // loading 由 activeKey watch 统一触发，避免点 Tab 时闪两次
  router.replace({
    path: route.path,
    query: { ...route.query, tab: next },
  });
}

onBeforeUnmount(() => {
  clearLoadingTimer();
});
</script>

<template>
  <Forbidden v-if="!activeKey || allowedTabs.length === 0" />
  <Page v-else auto-content-height>
    <Tabs :active-key="activeKey" @change="onTabChange">
      <TabPane
        v-for="tab in allowedTabs"
        :key="tab.key"
        :tab="tab.label"
        :force-render="effectiveVisited.has(tab.key)"
      >
        <div v-if="effectiveVisited.has(tab.key)" class="log-tab-panel">
          <div
            v-if="activeKey === tab.key && panelLoading"
            class="log-tab-panel__loading"
          >
            <Spin tip="加载中..." />
          </div>
          <div
            :class="{
              'log-tab-panel__body--dim': panelLoading && activeKey === tab.key,
            }"
          >
            <LoginLogPanel v-if="tab.key === 'login'" />
            <ApiLogPanel v-else-if="tab.key === 'api'" />
          </div>
        </div>
      </TabPane>
    </Tabs>
  </Page>
</template>

<style scoped>
.log-tab-panel {
  position: relative;
  min-height: 240px;
}

.log-tab-panel__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(
    in srgb,
    var(--ant-color-bg-container, #fff) 55%,
    transparent
  );
}

.log-tab-panel__body--dim {
  visibility: hidden;
}
</style>
