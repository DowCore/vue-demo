import { requestClient } from '#/api/request';

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
}

export interface IdentityUser {
  email?: string;
  id: string;
  isActive?: boolean;
  name?: string;
  phoneNumber?: string;
  surname?: string;
  userName: string;
}

export interface GetUsersInput {
  filter?: string;
  maxResultCount?: number;
  skipCount?: number;
}

export function getUsersApi(params: GetUsersInput) {
  return requestClient.get<PagedResult<IdentityUser>>('/api/identity/users', {
    params,
  });
}

export function createUserApi(data: Record<string, unknown>) {
  return requestClient.post('/api/identity/users', data);
}

export function updateUserApi(id: string, data: Record<string, unknown>) {
  return requestClient.put(`/api/identity/users/${id}`, data);
}

export function deleteUserApi(id: string) {
  return requestClient.delete(`/api/identity/users/${id}`);
}

export function getUserRolesApi(id: string) {
  return requestClient.get<{ items: { name: string }[] }>(
    `/api/identity/users/${id}/roles`,
  );
}
