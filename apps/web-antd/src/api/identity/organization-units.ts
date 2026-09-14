import type { PagedResult } from './users';

import { requestClient } from '#/api/request';

export interface OrganizationUnit {
  code?: string;
  displayName: string;
  id: string;
  parentId?: null | string;
}

export interface CreateOrganizationUnitDto {
  displayName: string;
  parentId?: null | string;
}

export interface OrganizationUnitMember {
  email?: string;
  id: string;
  name?: string;
  surname?: string;
  userName: string;
}

export interface OrganizationUnitRole {
  id: string;
  isDefault?: boolean;
  isPublic?: boolean;
  isStatic?: boolean;
  name: string;
}

export function getOrganizationUnitsApi() {
  return requestClient
    .get<{ items: OrganizationUnit[] }>('/api/identity/organization-units/all')
    .then((res) => res.items ?? []);
}

export function createOrganizationUnitApi(data: CreateOrganizationUnitDto) {
  return requestClient.post<OrganizationUnit>(
    '/api/identity/organization-units',
    data,
  );
}

export function updateOrganizationUnitApi(
  id: string,
  data: { displayName: string },
) {
  return requestClient.put<OrganizationUnit>(
    `/api/identity/organization-units/${id}`,
    data,
  );
}

export function deleteOrganizationUnitApi(id: string) {
  return requestClient.delete(`/api/identity/organization-units/${id}`);
}

export function moveOrganizationUnitApi(
  id: string,
  newParentId: null | string,
) {
  return requestClient.put(`/api/identity/organization-units/${id}/move`, {
    newParentId,
  });
}

export function getOrganizationUnitMembersApi(
  id: string,
  params?: { filter?: string; maxResultCount?: number; skipCount?: number },
) {
  return requestClient.get<PagedResult<OrganizationUnitMember>>(
    `/api/identity/organization-units/${id}/members`,
    { params },
  );
}

export function addOrganizationUnitMembersApi(id: string, userIds: string[]) {
  return requestClient.put(`/api/identity/organization-units/${id}/members`, {
    userIds,
  });
}

export function removeOrganizationUnitMemberApi(id: string, memberId: string) {
  return requestClient.delete(
    `/api/identity/organization-units/${id}/members/${memberId}`,
  );
}

export function getOrganizationUnitRolesApi(
  id: string,
  params?: { maxResultCount?: number; skipCount?: number },
) {
  return requestClient.get<PagedResult<OrganizationUnitRole>>(
    `/api/identity/organization-units/${id}/roles`,
    { params },
  );
}

export function addOrganizationUnitRolesApi(id: string, roleIds: string[]) {
  return requestClient.put(`/api/identity/organization-units/${id}/roles`, {
    roleIds,
  });
}

export function removeOrganizationUnitRoleApi(id: string, roleId: string) {
  return requestClient.delete(
    `/api/identity/organization-units/${id}/roles/${roleId}`,
  );
}

export function getAvailableOrganizationUnitUsersApi(params: {
  filter?: string;
  id: string;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<PagedResult<OrganizationUnitMember>>(
    '/api/identity/organization-units/available-users',
    { params },
  );
}

export function getAvailableOrganizationUnitRolesApi(params: {
  filter?: string;
  id: string;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<PagedResult<OrganizationUnitRole>>(
    '/api/identity/organization-units/available-roles',
    { params },
  );
}

export function getUserOrganizationUnitsApi(userId: string) {
  return requestClient.get<OrganizationUnit[]>(
    `/api/identity/users/${userId}/organization-units`,
  );
}

export function setUserOrganizationUnitsApi(
  userId: string,
  organizationUnitIds: string[],
) {
  return requestClient.put(`/api/identity/users/${userId}/organization-units`, {
    organizationUnitIds,
  });
}
