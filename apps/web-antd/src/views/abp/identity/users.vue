<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';

import { Button, Form, Input, Modal, Space, Switch, Table, message } from 'ant-design-vue';

import {
  createUserApi,
  deleteUserApi,
  getUsersApi,
  type IdentityUser,
  updateUserApi,
} from '#/api';

const loading = ref(false);
const items = ref<IdentityUser[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });

const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const form = reactive({
  email: '',
  isActive: true,
  password: '',
  userName: '',
});

async function load() {
  loading.value = true;
  try {
    const result = await getUsersApi({
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
  form.userName = '';
  form.email = '';
  form.password = '';
  form.isActive = true;
  modalOpen.value = true;
}

function openEdit(record: IdentityUser) {
  editingId.value = record.id;
  form.userName = record.userName;
  form.email = record.email ?? '';
  form.password = '';
  form.isActive = record.isActive ?? true;
  modalOpen.value = true;
}

async function save() {
  const payload: Record<string, unknown> = {
    email: form.email,
    isActive: form.isActive,
    userName: form.userName,
  };
  if (form.password) {
    payload.password = form.password;
  }
  if (editingId.value) {
    await updateUserApi(editingId.value, payload);
  } else {
    if (!form.password) {
      message.warning('新建用户需要密码');
      return;
    }
    await createUserApi(payload);
  }
  modalOpen.value = false;
  message.success('已保存');
  await load();
}

async function remove(record: IdentityUser) {
  await deleteUserApi(record.id);
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
        placeholder="用户名 / 邮箱"
        style="width: 240px"
        @press-enter="load"
      />
      <Button type="primary" @click="load">查询</Button>
      <Button type="primary" @click="openCreate">新建</Button>
    </Space>
    <Table
      :data-source="items"
      :loading="loading"
      :pagination="{
        current: page.current,
        pageSize: page.pageSize,
        total,
        showSizeChanger: true,
      }"
      row-key="id"
      @change="
        (pag) => {
          page.current = Number(pag.current);
          page.pageSize = Number(pag.pageSize);
          load();
        }
      "
    >
      <Table.Column data-index="userName" title="用户名" />
      <Table.Column data-index="email" title="邮箱" />
      <Table.Column data-index="phoneNumber" title="手机" />
      <Table.Column title="操作" width="180">
        <template #default="{ record }">
          <Space>
            <Button size="small" type="link" @click="openEdit(record)">编辑</Button>
            <Button danger size="small" type="link" @click="remove(record)">删除</Button>
          </Space>
        </template>
      </Table.Column>
    </Table>
    <Modal
      v-model:open="modalOpen"
      :title="editingId ? '编辑用户' : '新建用户'"
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item label="用户名">
          <Input v-model:value="form.userName" />
        </Form.Item>
        <Form.Item label="邮箱">
          <Input v-model:value="form.email" />
        </Form.Item>
        <Form.Item :label="editingId ? '新密码（可空）' : '密码'">
          <Input.Password v-model:value="form.password" />
        </Form.Item>
        <Form.Item label="启用">
          <Switch v-model:checked="form.isActive" />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>
