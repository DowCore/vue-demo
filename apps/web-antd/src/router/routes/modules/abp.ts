import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:shield',
      order: 10,
      title: 'ABP 管理',
    },
    name: 'AbpAdmin',
    path: '/abp',
    children: [
      {
        name: 'AbpIdentityUsers',
        path: 'identity/users',
        component: () => import('#/views/abp/identity/users.vue'),
        meta: {
          authority: ['AbpIdentity.Users'],
          icon: 'lucide:users',
          title: '用户',
        },
      },
      {
        name: 'AbpIdentityRoles',
        path: 'identity/roles',
        component: () => import('#/views/abp/identity/roles.vue'),
        meta: {
          authority: ['AbpIdentity.Roles'],
          icon: 'lucide:shield-check',
          title: '角色',
        },
      },
      {
        name: 'AbpSaasTenants',
        path: 'saas/tenants',
        component: () => import('#/views/abp/saas/tenants.vue'),
        meta: {
          authority: ['AbpTenantManagement.Tenants'],
          icon: 'lucide:building-2',
          title: '租户',
        },
      },
    ],
  },
];

export default routes;
