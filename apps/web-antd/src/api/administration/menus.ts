import { requestClient } from '#/api/request';

export type MenuType = 0 | 1 | 2;

export interface MenuDto {
  affixTab?: boolean;
  children?: MenuDto[];
  component?: null | string;
  icon?: null | string;
  id: string;
  isEnabled?: boolean;
  isVisible?: boolean;
  keepAlive?: boolean;
  name: string;
  order?: number;
  parentId?: null | string;
  path?: null | string;
  permission?: null | string;
  redirect?: null | string;
  systemCode?: string;
  title: string;
  type: MenuType;
}

export interface CreateUpdateMenuDto {
  affixTab?: boolean;
  component?: null | string;
  icon?: null | string;
  isEnabled?: boolean;
  isVisible?: boolean;
  keepAlive?: boolean;
  name: string;
  order?: number;
  parentId?: null | string;
  path?: null | string;
  permission?: null | string;
  redirect?: null | string;
  systemCode?: string;
  title: string;
  type: MenuType;
}

export function getMenusApi(systemCode?: string) {
  return requestClient.get<MenuDto[]>('/api/administration/menus', {
    params: { systemCode },
  });
}

export function createMenuApi(data: CreateUpdateMenuDto) {
  return requestClient.post<MenuDto>('/api/administration/menus', data);
}

export function updateMenuApi(id: string, data: CreateUpdateMenuDto) {
  return requestClient.put<MenuDto>(`/api/administration/menus/${id}`, data);
}

export function deleteMenuApi(id: string) {
  return requestClient.delete(`/api/administration/menus/${id}`);
}
