import { requestClient } from '#/api/request';

export interface AbpCurrentUser {
  email?: string;
  id?: string;
  isAuthenticated?: boolean;
  name?: string;
  roles?: string[];
  surName?: string;
  tenantId?: null | string;
  userName?: string;
}

export interface ApplicationConfiguration {
  auth?: {
    grantedPolicies?: Record<string, boolean>;
  };
  currentTenant?: {
    id?: null | string;
    isAvailable?: boolean;
    name?: null | string;
  };
  currentUser?: AbpCurrentUser;
}

let cachedConfig: ApplicationConfiguration | null = null;

export async function getApplicationConfigurationApi(force = false) {
  if (cachedConfig && !force) {
    return cachedConfig;
  }

  cachedConfig = await requestClient.get<ApplicationConfiguration>(
    '/api/abp/application-configuration',
  );
  return cachedConfig;
}

export function clearApplicationConfiguration() {
  cachedConfig = null;
}
