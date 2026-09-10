import { createApp, defineComponent, h } from 'vue';

import { useQueryClient } from '@tanstack/vue-query';
import { describe, expect, it } from 'vitest';

import { setupVueQuery } from './query';

describe('setupVueQuery', () => {
  it('未注册插件时 useQueryClient 抛错（系统管理页会因此整页空白）', () => {
    const Comp = defineComponent({
      setup() {
        useQueryClient();
        return () => h('div');
      },
    });
    const el = document.createElement('div');
    expect(() => createApp(Comp).mount(el)).toThrow(/queryClient/i);
  });

  it('注册后 useQueryClient 可用', () => {
    let client: unknown;
    const Comp = defineComponent({
      setup() {
        client = useQueryClient();
        return () => h('div');
      },
    });
    const app = createApp(Comp);
    setupVueQuery(app);
    app.mount(document.createElement('div'));
    expect(client).toBeTruthy();
  });
});
