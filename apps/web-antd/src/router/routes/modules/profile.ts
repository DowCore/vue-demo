import type { RouteRecordRaw } from 'vue-router';

import { $t } from '#/locales';

/** 个人中心等隐藏路由（原 vben 演示模块已移除） */
const routes: RouteRecordRaw[] = [
  {
    name: 'Profile',
    path: '/profile',
    component: () => import('#/views/_core/profile/index.vue'),
    meta: {
      hideInMenu: true,
      icon: 'lucide:user',
      title: $t('page.auth.profile'),
    },
  },
];

export default routes;
