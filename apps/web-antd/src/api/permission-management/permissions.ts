import { requestClient } from '#/api/request';

export interface PermissionGrantInfo {
  allowedProviders?: string[];
  displayName: string;
  grantedProviders?: { providerKey?: string; providerName?: string }[];
  isGranted: boolean;
  name: string;
  parentName?: null | string;
}

export interface PermissionGroup {
  displayName: string;
  name: string;
  permissions: PermissionGrantInfo[];
}

export interface GetPermissionListResult {
  entityDisplayName?: string;
  groups: PermissionGroup[];
}

export interface UpdatePermissionDto {
  isGranted: boolean;
  name: string;
}

/** 角色权限：providerName=R，providerKey=角色名 */
export function getPermissionsApi(providerName: string, providerKey: string) {
  return requestClient.get<GetPermissionListResult>(
    '/api/permission-management/permissions',
    {
      params: { providerKey, providerName },
    },
  );
}

export function updatePermissionsApi(
  providerName: string,
  providerKey: string,
  permissions: UpdatePermissionDto[],
) {
  return requestClient.put(
    '/api/permission-management/permissions',
    {
      permissions,
    },
    {
      params: { providerKey, providerName },
    },
  );
}

/** 拉取权限定义树（用于菜单绑定），不关心具体角色的勾选状态 */
export async function getPermissionDefinitionTreeApi() {
  try {
    const result = await getPermissionsApi('R', 'admin');
    return result.groups ?? [];
  } catch {
    // 租户可能没有名为 admin 的角色；任意 key 仍返回完整定义列表
    const result = await getPermissionsApi('R', '_');
    return result.groups ?? [];
  }
}
