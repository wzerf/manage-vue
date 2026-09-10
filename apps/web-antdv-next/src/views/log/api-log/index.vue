<script lang="ts" setup>
import type { ApiLogListItem, ApiLogSource } from '#/api/system/api-log';

import { ref } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';

import { Segmented, Tag } from 'antdv-next';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { fetchApiLogListApi } from '#/api/system/api-log';
import {
  useApiLogColumns,
  useApiLogSearchSchema,
} from '#/views/log/api-log/data';
import ApiLogDetail from '#/views/log/api-log/modules/detail.vue';

defineOptions({ name: 'LogApiLog' });

const source = ref<ApiLogSource>('hot');

const [DetailDrawer, detailDrawerApi] = useVbenDrawer({
  connectedComponent: ApiLogDetail,
  destroyOnClose: true,
});

function openDetail(row: ApiLogListItem) {
  detailDrawerApi.setData({ row }).open();
}

function methodColor(method: string) {
  const m = (method || '').toUpperCase();
  if (m === 'GET') return 'blue';
  if (m === 'POST') return 'green';
  if (m === 'PUT' || m === 'PATCH') return 'orange';
  if (m === 'DELETE') return 'red';
  return 'default';
}

const [Grid, gridApi] = useVbenVxeGrid<ApiLogListItem>({
  formOptions: {
    collapsed: false,
    schema: useApiLogSearchSchema(),
    showCollapseButton: false,
  },
  gridEvents: {
    cellClick: ({ row }: { row: ApiLogListItem }) => {
      openDetail(row);
    },
  },
  gridOptions: {
    columns: useApiLogColumns(),
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
          const range = formValues.createdAtRange as
            | [string, string]
            | undefined;
          const from = range?.[0];
          const to = range?.[1];
          return await fetchApiLogListApi({
            page: page.currentPage,
            pageSize: page.pageSize,
            source: source.value,
            method: formValues.method || undefined,
            module: formValues.module || undefined,
            path: formValues.path || undefined,
            success: formValues.success ?? undefined,
            username: formValues.username || undefined,
            clientIp: formValues.clientIp || undefined,
            requestId: formValues.requestId || undefined,
            createdAtFrom: from,
            createdAtTo: to,
          });
        },
      },
    },
  } as never,
});

function onSourceChange(val: number | string) {
  source.value = (val as ApiLogSource) || 'hot';
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
      <template #method="{ row }">
        <Tag :color="methodColor(row.method)">{{ row.method }}</Tag>
      </template>
      <template #success="{ row }">
        <Tag :color="row.success === 1 ? 'success' : 'error'">
          {{ row.success === 1 ? '成功' : '失败' }}
        </Tag>
      </template>
    </Grid>
    <DetailDrawer />
  </div>
</template>
