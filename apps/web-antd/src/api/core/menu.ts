import type { RouteRecordStringComponent } from '@vben/types';

import { requestClient } from '#/api/request';

/**
 * 当前用户动态菜单（Vben backend / mixed）
 */
export async function getAllMenusApi(): Promise<RouteRecordStringComponent[]> {
  return requestClient.get<RouteRecordStringComponent[]>('/api/menu/all');
}
