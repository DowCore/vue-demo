import type { OrganizationUnit } from '#/api/identity/organization-units';

import { getOrganizationUnitsApi } from '#/api/identity/organization-units';
import { getUsersApi } from '#/api/identity/users';

export interface SelectOption {
  label: string;
  value: string;
}

export interface DeptTreeNode {
  title: string;
  value: string;
  children?: DeptTreeNode[];
}

let userCache: null | Promise<SelectOption[]> = null;
let deptCache: null | Promise<DeptTreeNode[]> = null;

export function loadUserOptions() {
  userCache ??= getUsersApi({ maxResultCount: 200 }).then((res) =>
    (res.items || []).map((user) => ({
      label: user.name ? `${user.name} (${user.userName})` : user.userName,
      value: user.userName,
    })),
  );
  return userCache;
}

export function loadDeptTree() {
  deptCache ??= getOrganizationUnitsApi().then((items) =>
    buildDeptTree(items || []),
  );
  return deptCache;
}

function buildDeptTree(items: OrganizationUnit[]): DeptTreeNode[] {
  const nodes = new Map<string, DeptTreeNode & { parentId?: null | string }>();
  for (const item of items) {
    nodes.set(item.id, {
      title: item.displayName,
      value: item.displayName,
      parentId: item.parentId,
      children: [],
    });
  }
  const roots: DeptTreeNode[] = [];
  for (const item of items) {
    const node = nodes.get(item.id);
    if (!node) continue;
    const parent = item.parentId ? nodes.get(item.parentId) : undefined;
    if (parent) {
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
