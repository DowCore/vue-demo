import { baseRequestClient, requestClient } from '#/api/request';

export interface FindTenantResult {
  isActive?: boolean;
  name?: null | string;
  success: boolean;
  tenantId?: null | string;
}

/** 按名称解析租户（必须在 Host 上下文，不带 __tenant） */
export function findTenantByNameApi(name: string) {
  return baseRequestClient.get<FindTenantResult>(
    `/api/abp/multi-tenancy/tenants/by-name/${encodeURIComponent(name)}`,
    {
      headers: {
        'X-Ignore-Tenant': '1',
      },
    },
  );
}

export function getTenantsForSwitchApi(params?: {
  filter?: string;
  maxResultCount?: number;
}) {
  return requestClient.get<{
    items: { id: string; name: string }[];
    totalCount: number;
  }>('/api/multi-tenancy/tenants', {
    params: {
      filter: params?.filter,
      maxResultCount: params?.maxResultCount ?? 50,
      skipCount: 0,
    },
  });
}
