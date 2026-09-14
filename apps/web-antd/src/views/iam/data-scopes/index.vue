<script lang="ts" setup>
import type { DataScope, IdentityRole, RoleDataScopeDto } from '#/api';

import { onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';

import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import { getRoleDataScopesApi, getRolesApi, setRoleDataScopeApi } from '#/api';

const loading = ref(false);
const roles = ref<IdentityRole[]>([]);
const selectedRoleId = ref<string>();
const scopes = ref<RoleDataScopeDto[]>([]);

const modalOpen = ref(false);
const form = reactive({
  organizationIds: '' as string,
  resource: '*',
  scope: 0 as DataScope,
});

const scopeOptions = [
  { label: '仅本人', value: 0 },
  { label: '本部门', value: 1 },
  { label: '本部门及下级', value: 2 },
  { label: '自定义组织', value: 3 },
  { label: '全部', value: 4 },
];

async function loadRoles() {
  const result = await getRolesApi({ maxResultCount: 200, skipCount: 0 });
  roles.value = result.items ?? [];
  if (!selectedRoleId.value && roles.value[0]) {
    selectedRoleId.value = roles.value[0].id;
    await loadScopes();
  }
}

async function loadScopes() {
  if (!selectedRoleId.value) {
    scopes.value = [];
    return;
  }
  loading.value = true;
  try {
    scopes.value = await getRoleDataScopesApi(selectedRoleId.value);
  } finally {
    loading.value = false;
  }
}

function openSet() {
  form.resource = '*';
  form.scope = 4;
  form.organizationIds = '';
  modalOpen.value = true;
}

async function save() {
  if (!selectedRoleId.value) {
    return;
  }
  await setRoleDataScopeApi({
    organizationIds:
      form.scope === 3
        ? form.organizationIds
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
    resource: form.resource || '*',
    roleId: selectedRoleId.value,
    scope: form.scope,
  });
  modalOpen.value = false;
  message.success('已保存');
  await loadScopes();
}

onMounted(loadRoles);

const columns = [
  { dataIndex: 'resource', key: 'resource', title: '资源' },
  { dataIndex: 'scope', key: 'scope', title: '范围' },
  { dataIndex: 'organizationIds', key: 'organizationIds', title: '组织' },
];
</script>

<template>
  <div class="p-4">
    <Space class="mb-4">
      <Select
        v-model:value="selectedRoleId"
        style="width: 240px"
        :options="roles.map((r) => ({ label: r.name, value: r.id }))"
        placeholder="选择角色"
        @change="loadScopes"
      />
      <AccessControl :codes="['Administration.DataScopes.Manage']" type="code">
        <Button type="primary" :disabled="!selectedRoleId" @click="openSet">
          设置数据范围
        </Button>
      </AccessControl>
      <Button @click="loadScopes">刷新</Button>
    </Space>

    <Table
      :columns="columns"
      :data-source="scopes"
      :loading="loading"
      :pagination="false"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'scope'">
          {{ scopeOptions.find((x) => x.value === record.scope)?.label }}
        </template>
        <template v-else-if="column.key === 'organizationIds'">
          {{ (record.organizationIds ?? []).join(', ') }}
        </template>
      </template>
    </Table>

    <Modal v-model:open="modalOpen" title="设置数据范围" @ok="save">
      <Form layout="vertical">
        <Form.Item label="资源键（* 为默认）">
          <Input v-model:value="form.resource" placeholder="Projects.Issues" />
        </Form.Item>
        <Form.Item label="范围">
          <Select v-model:value="form.scope" :options="scopeOptions" />
        </Form.Item>
        <Form.Item v-if="form.scope === 3" label="组织 ID（逗号分隔）">
          <Input v-model:value="form.organizationIds" />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>
