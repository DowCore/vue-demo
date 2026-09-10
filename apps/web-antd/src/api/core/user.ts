import type { UserInfo } from '@vben/types';

import { getApplicationConfigurationApi } from '#/api/abp';

export async function getUserInfoApi(): Promise<UserInfo> {
  const config = await getApplicationConfigurationApi(true);
  const user = config.currentUser;
  if (!user?.isAuthenticated) {
    throw new Error(
      '未能获取已登录用户，请确认网关与 AuthServer 已启动且 JWT 受众匹配。',
    );
  }
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
