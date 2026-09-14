<script lang="ts" setup>
import type { IdentityRole } from '#/api';

import { onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';

import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Space,
  Switch,
  Table,
} from 'ant-design-vue';

import {
  createRoleApi,
  deleteRoleApi,
  getRolesApi,
  updateRoleApi,
} from '#/api';
import RolePermissionModal from '#/components/permission/role-permission-modal.vue';

const loading = ref(false);
const items = ref<IdentityRole[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });
const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const form = reactive({
  isDefault: false,
  isPublic: true,
  name: '',
});

const permissionOpen = ref(false);
const permissionRoleName = ref('');

async function load() {
  loading.value = true;
  try {
    const result = await getRolesApi({
      filter: filter.value || undefined,
      maxResultCount: page.pageSize,
      skipCount: (page.current - 1) * page.pageSize,
    });
    items.value = result.items ?? [];
    total.value = result.totalCount ?? 0;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.name = '';
  form.isDefault = false;
  form.isPublic = true;
  modalOpen.value = true;
}

function openEdit(record: IdentityRole) {
  editingId.value = record.id;
  form.name = record.name;
  form.isDefault = record.isDefault ?? false;
  form.isPublic = record.isPublic ?? true;
  modalOpen.value = true;
}

function openPermissions(record: IdentityRole) {
  permissionRoleName.value = record.name;
  permissionOpen.value = true;
}

async function save() {
  const payload = {
    isDefault: form.isDefault,
    isPublic: form.isPublic,
    name: form.name,
  };
  await (editingId.value
    ? updateRoleApi(editingId.value, payload)
    : createRoleApi(payload));
  modalOpen.value = false;
  message.success('已保存');
  await load();
}

async function remove(record: IdentityRole) {
  await deleteRoleApi(record.id);
  message.success('已删除');
  await load();
}

onMounted(load);
</script>

<template>
  <div class="p-4">
    <Space class="mb-4">
      <Input
        v-model:value="filter"
        allow-clear
        placeholder="角色名"
        style="width: 240px"
        @press-enter="load"
      />
      <Button type="primary" @click="load">查询</Button>
      <AccessControl :codes="['AbpIdentity.Roles.Create']" type="code">
        <Button type="primary" @click="openCreate">新建</Button>
      </AccessControl>
    </Space>
    <Table
      :data-source="items"
      :loading="loading"
      :pagination="{ current: page.current, pageSize: page.pageSize, total }"
      row-key="id"
      @change="
        (pag) => {
          page.current = Number(pag.current);
          page.pageSize = Number(pag.pageSize);
          load();
        }
      "
    >
      <Table.Column data-index="name" title="名称" />
      <Table.Column title="默认">
        <template #default="{ record }">
          {{ record.isDefault ? '是' : '否' }}
        </template>
      </Table.Column>
      <Table.Column title="公开">
        <template #default="{ record }">
          {{ record.isPublic ? '是' : '否' }}
        </template>
      </Table.Column>
      <Table.Column title="操作" width="260">
        <template #default="{ record }">
          <Space>
            <AccessControl
              :codes="['AbpIdentity.Roles.ManagePermissions']"
              type="code"
            >
              <Button size="small" type="link" @click="openPermissions(record)">
                权限
              </Button>
            </AccessControl>
            <AccessControl :codes="['AbpIdentity.Roles.Update']" type="code">
              <Button size="small" type="link" @click="openEdit(record)">
                编辑
              </Button>
            </AccessControl>
            <AccessControl :codes="['AbpIdentity.Roles.Delete']" type="code">
              <Button
                :disabled="record.isStatic"
                danger
                size="small"
                type="link"
                @click="remove(record)"
              >
                删除
              </Button>
            </AccessControl>
          </Space>
        </template>
      </Table.Column>
    </Table>
    <Modal
      v-model:open="modalOpen"
      :title="editingId ? '编辑角色' : '新建角色'"
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item label="名称">
          <Input v-model:value="form.name" />
        </Form.Item>
        <Form.Item label="默认角色">
          <Switch v-model:checked="form.isDefault" />
        </Form.Item>
        <Form.Item label="公开">
          <Switch v-model:checked="form.isPublic" />
        </Form.Item>
      </Form>
    </Modal>

    <RolePermissionModal
      v-model:open="permissionOpen"
      :role-name="permissionRoleName"
    />
  </div>
</template>
