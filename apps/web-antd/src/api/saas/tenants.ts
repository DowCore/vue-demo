import { requestClient } from '#/api/request';

export interface Tenant {
  concurrencyStamp?: string;
  extraProperties?: Record<string, unknown>;
  id: string;
  name: string;
}

export interface PagedTenants {
  items: Tenant[];
  totalCount: number;
}

export function getTenantAdminEmail(tenant: Tenant): string {
  const props = tenant.extraProperties ?? {};
  const email = props.AdminEmail ?? props.adminEmail;
  return typeof email === 'string' && email ? email : '';
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

export function getTenantApi(id: string) {
  return requestClient.get<Tenant>(`/api/multi-tenancy/tenants/${id}`);
}

export function createTenantApi(data: Record<string, unknown>) {
  return requestClient.post('/api/multi-tenancy/tenants', data);
}

/** ABP 标准更新：主要改 Name（+ concurrencyStamp） */
export function updateTenantApi(
  id: string,
  data: { concurrencyStamp?: string; name: string },
) {
  return requestClient.put(`/api/multi-tenancy/tenants/${id}`, data);
}

export function deleteTenantApi(id: string) {
  return requestClient.delete(`/api/multi-tenancy/tenants/${id}`);
}
