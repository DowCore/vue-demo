export const TENANT_STORAGE_KEY = 'abp.tenantId';
export const TENANT_NAME_STORAGE_KEY = 'abp.tenantName';
export const RECENT_TENANTS_STORAGE_KEY = 'abp.recentTenants';

export interface RecentTenant {
  id: string;
  name: string;
}

export function getLocalTenantId() {
  return localStorage.getItem(TENANT_STORAGE_KEY);
}

export function getLocalTenantName() {
  return localStorage.getItem(TENANT_NAME_STORAGE_KEY);
}

export function setLocalTenant(id: null | string, name?: null | string) {
  if (id) {
    localStorage.setItem(TENANT_STORAGE_KEY, id);
    if (name) {
      localStorage.setItem(TENANT_NAME_STORAGE_KEY, name);
      rememberRecentTenant({ id, name });
    } else {
      localStorage.removeItem(TENANT_NAME_STORAGE_KEY);
    }
  } else {
    clearLocalTenant();
  }
}

export function clearLocalTenant() {
  localStorage.removeItem(TENANT_STORAGE_KEY);
  localStorage.removeItem(TENANT_NAME_STORAGE_KEY);
}

export function getRecentTenants(): RecentTenant[] {
  try {
    const raw = localStorage.getItem(RECENT_TENANTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const list = JSON.parse(raw) as RecentTenant[];
    return Array.isArray(list)
      ? list.filter((item) => item?.id && item?.name)
      : [];
  } catch {
    return [];
  }
}

export function rememberRecentTenant(tenant: RecentTenant) {
  const next = [
    tenant,
    ...getRecentTenants().filter((item) => item.id !== tenant.id),
  ].slice(0, 8);
  localStorage.setItem(RECENT_TENANTS_STORAGE_KEY, JSON.stringify(next));
}

export function removeRecentTenant(id: string) {
  const next = getRecentTenants().filter((item) => item.id !== id);
  localStorage.setItem(RECENT_TENANTS_STORAGE_KEY, JSON.stringify(next));
}

/** 从 JWT 同步本地租户上下文，避免 Visit/SSO 后 __tenant 与令牌不一致。 */
export function syncTenantFromAccessToken(accessToken: string) {
  try {
    const payloadPart = accessToken.split('.')[1];
    if (!payloadPart) {
      clearLocalTenant();
      return;
    }
    const json = atob(payloadPart.replaceAll('-', '+').replaceAll('_', '/'));
    const payload = JSON.parse(json) as Record<string, unknown>;
    const tenantId =
      payload.tenantid ?? payload.tenant_id ?? payload.tid ?? null;
    if (typeof tenantId === 'string' && tenantId) {
      const currentName = getLocalTenantName();
      setLocalTenant(tenantId, currentName);
    } else {
      clearLocalTenant();
    }
  } catch {
    clearLocalTenant();
  }
}

export function getTenantDisplayName() {
  return getLocalTenantName() || (getLocalTenantId() ? '已选择租户' : null);
}
