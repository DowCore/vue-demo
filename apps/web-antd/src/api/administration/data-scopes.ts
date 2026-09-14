import { requestClient } from '#/api/request';

/** Self=0, Department=1, DepartmentAndChildren=2, Custom=3, All=4 */
export type DataScope = 0 | 1 | 2 | 3 | 4;

export interface RoleDataScopeDto {
  id: string;
  organizationIds: string[];
  resource: string;
  roleId: string;
  scope: DataScope;
}

export interface SetRoleDataScopeDto {
  organizationIds?: string[];
  resource: string;
  roleId: string;
  scope: DataScope;
}

export interface MyDataScopeDto {
  organizationIds: string[];
  scope: DataScope;
  userId?: null | string;
}

export function getRoleDataScopesApi(roleId: string) {
  return requestClient.get<RoleDataScopeDto[]>(
    `/api/administration/role-data-scopes/by-role/${roleId}`,
  );
}

export function setRoleDataScopeApi(data: SetRoleDataScopeDto) {
  return requestClient.put<RoleDataScopeDto>(
    '/api/administration/role-data-scopes',
    data,
  );
}

export function deleteRoleDataScopeApi(id: string) {
  return requestClient.delete(`/api/administration/role-data-scopes/${id}`);
}

export function getMyDataScopeApi(resource?: string) {
  return requestClient.get<MyDataScopeDto>(
    '/api/administration/role-data-scopes/my',
    { params: { resource } },
  );
}
