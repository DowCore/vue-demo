import { requestClient } from '#/api/request';

import type { PagedResult } from './users';

export interface IdentityRole {
  id: string;
  isDefault?: boolean;
  isPublic?: boolean;
  isStatic?: boolean;
  name: string;
}

export function getRolesApi(params?: {
  filter?: string;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<PagedResult<IdentityRole>>('/api/identity/roles', {
    params,
  });
}

export function createRoleApi(data: Record<string, unknown>) {
  return requestClient.post('/api/identity/roles', data);
}

export function updateRoleApi(id: string, data: Record<string, unknown>) {
  return requestClient.put(`/api/identity/roles/${id}`, data);
}

export function deleteRoleApi(id: string) {
  return requestClient.delete(`/api/identity/roles/${id}`);
}
