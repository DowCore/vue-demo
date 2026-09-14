import { findTenantByNameApi } from '#/api/saas/tenant-resolve';
import { clearLocalTenant, setLocalTenant } from '#/utils/tenant';

/**
 * 按租户名切换本地上下文。空名称 = Host。
 */
export async function resolveAndSetTenantByName(tenantName?: null | string) {
  const name = tenantName?.trim() ?? '';
  if (!name) {
    clearLocalTenant();
    return null;
  }

  const result = await findTenantByNameApi(name);
  if (!result?.success || !result.tenantId) {
    throw new Error(`未找到租户「${name}」`);
  }
  if (result.isActive === false) {
    throw new Error(`租户「${name}」未启用`);
  }

  setLocalTenant(result.tenantId, result.name || name);
  return result.name || name;
}
