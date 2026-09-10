import { requestClient } from '#/api/request';

export interface Tenant {
  id: string;
  name: string;
}

export interface PagedTenants {
  items: Tenant[];
  totalCount: number;
}

export function getTenantsApi(params?: {
  filter?: string;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<PagedTenants>('/api/multi-tenancy/tenants', {
    params,
  });
}

export function createTenantApi(data: Record<string, unknown>) {
  return requestClient.post('/api/multi-tenancy/tenants', data);
}

export function deleteTenantApi(id: string) {
  return requestClient.delete(`/api/multi-tenancy/tenants/${id}`);
}
