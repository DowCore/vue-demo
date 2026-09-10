<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';

import { Button, Form, Input, Modal, Space, Table, message } from 'ant-design-vue';

import {
  createTenantApi,
  deleteTenantApi,
  getTenantsApi,
  type Tenant,
} from '#/api';

const loading = ref(false);
const items = ref<Tenant[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });
const modalOpen = ref(false);
const form = reactive({
  adminEmailAddress: '',
  adminPassword: '',
  name: '',
});

async function load() {
  loading.value = true;
  try {
    const result = await getTenantsApi({
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
  form.name = '';
  form.adminEmailAddress = '';
  form.adminPassword = '';
  modalOpen.value = true;
}

async function save() {
  await createTenantApi({
    adminEmailAddress: form.adminEmailAddress,
    adminPassword: form.adminPassword,
    name: form.name,
  });
  modalOpen.value = false;
  message.success('已创建');
  await load();
}

async function remove(record: Tenant) {
  await deleteTenantApi(record.id);
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
        placeholder="租户名"
        style="width: 240px"
        @press-enter="load"
      />
      <Button type="primary" @click="load">查询</Button>
      <Button type="primary" @click="openCreate">新建</Button>
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
      <Table.Column data-index="id" title="Id" />
      <Table.Column title="操作" width="120">
        <template #default="{ record }">
          <Button danger size="small" type="link" @click="remove(record)">删除</Button>
        </template>
      </Table.Column>
    </Table>
    <Modal v-model:open="modalOpen" title="新建租户" @ok="save">
      <Form layout="vertical">
        <Form.Item label="租户名">
          <Input v-model:value="form.name" />
        </Form.Item>
        <Form.Item label="管理员邮箱">
          <Input v-model:value="form.adminEmailAddress" />
        </Form.Item>
        <Form.Item label="管理员密码">
          <Input.Password v-model:value="form.adminPassword" />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>
