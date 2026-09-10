import type { App } from 'vue';

import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

/** 系统管理页的 useMutation/useQuery 依赖 VueQueryPlugin，未注册会整页空白。 */
export function setupVueQuery(app: App) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
  app.use(VueQueryPlugin, { queryClient });
  return queryClient;
}
