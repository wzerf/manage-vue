<script lang="ts" setup>
import type { LoginLogListItem, LoginLogSource } from '#/api/system/login-log';

import { ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';

import { Segmented, Tag } from 'antdv-next';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { fetchLoginLogListApi } from '#/api/system/login-log';
import {
  useLoginLogColumns,
  useLoginLogSearchSchema,
} from '#/views/log/login-log/data';
import LoginLogDetail from '#/views/log/login-log/modules/detail.vue';

defineOptions({ name: 'LogLoginLog' });

const source = ref<LoginLogSource>('hot');

const [DetailDrawer, detailDrawerApi] = useVbenDrawer({
  connectedComponent: LoginLogDetail,
  destroyOnClose: true,
});

function openDetail(row: LoginLogListItem) {
  detailDrawerApi.setData({ row }).open();
}

const [Grid, gridApi] = useVbenVxeGrid<LoginLogListItem>({
  formOptions: {
    collapsed: false,
    schema: useLoginLogSearchSchema(),
    showCollapseButton: false,
  },
  gridEvents: {
    cellClick: ({ row }: { row: LoginLogListItem }) => {
      openDetail(row);
    },
  },
  gridOptions: {
    columns: useLoginLogColumns(),
    keepSource: true,
    rowConfig: { isHover: true },
    size: 'small',
    stripe: true,
    toolbarConfig: {
      custom: true,
      refresh: true,
      zoom: true,
    },
    proxyConfig: {
      ajax: {
        query: async (
          { page }: { page: { currentPage: number; pageSize: number } },
          formValues: Record<string, any>,
        ) => {
          const range = formValues.loginTimeRange as
            | [string, string]
            | undefined;
          const from = range?.[0];
          const to = range?.[1];
          return await fetchLoginLogListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
            source: source.value,
            username: formValues.username || undefined,
            success: formValues.success ?? undefined,
            loginMethod: formValues.loginMethod || undefined,
            loginIp: formValues.loginIp || undefined,
            loginTimeFrom: from,
            loginTimeTo: to,
          });
        },
      },
    },
  } as never,
});

function onSourceChange(val: number | string) {
  source.value = (val as LoginLogSource) || 'hot';
  gridApi.query();
}
</script>

<template>
  <div>
    <div class="mb-3">
      <Segmented
        :value="source"
        :options="[
          { label: '热表', value: 'hot' },
          { label: '归档', value: 'archive' },
        ]"
        @change="onSourceChange"
      />
    </div>
    <Grid>
      <template #success="{ row }">
        <Tag :color="row.success === 1 ? 'success' : 'error'">
          {{ row.success === 1 ? '成功' : '失败' }}
        </Tag>
      </template>
      <template #browser="{ row }">
        {{
          [row.browserName, row.browserVersion].filter(Boolean).join(' ') || '-'
        }}
      </template>
      <template #os="{ row }">
        {{ [row.osName, row.osVersion].filter(Boolean).join(' ') || '-' }}
      </template>
    </Grid>
    <DetailDrawer />
  </div>
</template>
