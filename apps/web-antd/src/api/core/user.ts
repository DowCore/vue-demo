import type { UserInfo } from '@vben/types';

import { getApplicationConfigurationApi } from '#/api/abp';

export async function getUserInfoApi(): Promise<UserInfo> {
  const config = await getApplicationConfigurationApi();
  const user = config.currentUser;
  return {
    avatar: '',
    desc: user?.email ?? '',
    homePath: '/dashboard/workspace',
    realName: user?.name || user?.userName || 'User',
    roles: Object.keys(config.auth?.grantedPolicies ?? {}).filter(
      (key) => config.auth?.grantedPolicies?.[key],
    ),
    token: '',
    userId: user?.id ?? '',
    username: user?.userName ?? '',
  };
}
