import type {
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
  RouteRecordStringComponent,
} from '@vben/types';

import { generateAccessible } from '@vben/access';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import { message } from 'antdv-next';

import { getAllMenusApi } from '#/api';
import { BasicLayout, IFrameView } from '#/layouts';
import { $t } from '#/locales';
import { loadAccessMenusCache, saveAccessMenusCache } from '#/utils/menu-cache';

const forbiddenComponent = () => import('#/views/_core/fallback/forbidden.vue');

async function generateAccess(options: GenerateMenuAndRoutesOptions) {
  const pageMap: ComponentRecordType = import.meta.glob('../views/**/*.vue');

  const layoutMap: ComponentRecordType = {
    BasicLayout,
    IFrameView,
  };

  return await generateAccessible(preferences.app.accessMode, {
    ...options,
    fetchMenuListAsync: async () => {
      message.loading({
        content: `${$t('common.loadingMenu')}...`,
        duration: 1.5,
      });

      const token = useAccessStore().accessToken;
      try {
        const menus = await getAllMenusApi();
        const list = (menus ?? []) as RouteRecordStringComponent[];
        if (token) {
          saveAccessMenusCache(token, list);
        }
        return list;
      } catch (error) {
        if (token) {
          const cached =
            loadAccessMenusCache<RouteRecordStringComponent>(token);
          if (cached) {
            message.warning('菜单加载失败，已使用本地缓存');
            return cached;
          }
        }
        throw error;
      }
    },
    forbiddenComponent,
    layoutMap,
    pageMap,
  });
}

export { generateAccess };
