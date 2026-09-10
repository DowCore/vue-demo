<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';

import { Button, Form, Input, Modal, Space, Switch, Table, message } from 'ant-design-vue';

import {
  createRoleApi,
  deleteRoleApi,
  getRolesApi,
  type IdentityRole,
  updateRoleApi,
} from '#/api';

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

async function save() {
  const payload = {
    isDefault: form.isDefault,
    isPublic: form.isPublic,
    name: form.name,
  };
  if (editingId.value) {
    await updateRoleApi(editingId.value, payload);
  } else {
    await createRoleApi(payload);
  }
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
      <Table.Column title="默认">
        <template #default="{ record }">{{ record.isDefault ? '是' : '否' }}</template>
      </Table.Column>
      <Table.Column title="公开">
        <template #default="{ record }">{{ record.isPublic ? '是' : '否' }}</template>
      </Table.Column>
      <Table.Column title="操作" width="180">
        <template #default="{ record }">
          <Space>
            <Button size="small" type="link" @click="openEdit(record)">编辑</Button>
            <Button
              :disabled="record.isStatic"
              danger
              size="small"
              type="link"
              @click="remove(record)"
            >
              删除
            </Button>
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
  </div>
</template>
