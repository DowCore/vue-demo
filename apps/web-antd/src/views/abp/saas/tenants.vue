<script lang="ts" setup>
import type { Tenant } from '#/api';

import { computed, onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';

import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Space,
  Table,
} from 'ant-design-vue';

import {
  createTenantApi,
  deleteTenantApi,
  getTenantAdminEmail,
  getTenantApi,
  getTenantsApi,
  updateTenantApi,
} from '#/api';

const loading = ref(false);
const saving = ref(false);
const items = ref<Tenant[]>([]);
const total = ref(0);
const filter = ref('');
const page = reactive({ current: 1, pageSize: 10 });

const createOpen = ref(false);
const editOpen = ref(false);
const createForm = reactive({
  adminEmailAddress: '',
  adminPassword: '',
  name: '',
});
const editForm = reactive({
  concurrencyStamp: '',
  id: '',
  name: '',
});

const passwordRules = computed(() => {
  const pwd = createForm.adminPassword || '';
  return [
    { ok: pwd.length >= 6, label: '至少 6 位' },
    { ok: /[a-z]/.test(pwd), label: '包含小写字母' },
    { ok: /[A-Z]/.test(pwd), label: '包含大写字母' },
    { ok: /\d/.test(pwd), label: '包含数字' },
    { ok: /[^a-zA-Z0-9]/.test(pwd), label: '包含特殊字符（如 * ! @ #）' },
  ];
});

const passwordValid = computed(() => passwordRules.value.every((r) => r.ok));

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
  createForm.name = '';
  createForm.adminEmailAddress = '';
  createForm.adminPassword = '';
  createOpen.value = true;
}

async function openEdit(record: Tenant) {
  try {
    const detail = await getTenantApi(record.id);
    editForm.id = detail.id;
    editForm.name = detail.name;
    editForm.concurrencyStamp = detail.concurrencyStamp || '';
    editOpen.value = true;
  } catch (error: any) {
    const abpError = error?.response?.data?.error;
    message.error(
      (typeof abpError === 'string' ? abpError : abpError?.message) ||
        '加载租户失败',
    );
  }
}

async function saveCreate() {
  const email = createForm.adminEmailAddress.trim();
  const name = createForm.name.trim();
  if (!name) {
    message.error('请填写租户名');
    return;
  }
  if (!email) {
    message.error('请填写管理员邮箱');
    return;
  }
  if (!passwordValid.value) {
    message.error('管理员密码未满足规则，请按下方要求修改（示例：1q2w3E*）');
    return;
  }

  saving.value = true;
  try {
    await createTenantApi({
      adminEmailAddress: email,
      adminPassword: createForm.adminPassword,
      extraProperties: {
        AdminEmail: email,
      },
      name,
    });
    createOpen.value = false;
    message.success('已创建');
    await load();
  } catch (error: any) {
    const abpError = error?.response?.data?.error;
    const validation =
      abpError?.validationErrors
        ?.map((v: { message?: string }) => v.message)
        .filter(Boolean)
        .join('；') || '';
    const detail =
      validation ||
      (typeof abpError === 'string' ? abpError : abpError?.message) ||
      error?.message ||
      '创建失败';
    message.error(detail);
    if (abpError?.code === 'Volo.Abp.TenantManagement:DuplicateTenantName') {
      await load();
    }
  } finally {
    saving.value = false;
  }
}

async function saveEdit() {
  const name = editForm.name.trim();
  if (!name) {
    message.error('请填写租户名');
    return;
  }

  saving.value = true;
  try {
    await updateTenantApi(editForm.id, {
      concurrencyStamp: editForm.concurrencyStamp || undefined,
      name,
    });
    editOpen.value = false;
    message.success('已保存');
    await load();
  } catch (error: any) {
    const abpError = error?.response?.data?.error;
    const detail =
      (typeof abpError === 'string' ? abpError : abpError?.message) ||
      error?.message ||
      '保存失败';
    message.error(detail);
  } finally {
    saving.value = false;
  }
}

async function remove(record: Tenant) {
  try {
    await deleteTenantApi(record.id);
    message.success('已删除');
    await load();
  } catch (error: any) {
    const abpError = error?.response?.data?.error;
    const detail =
      (typeof abpError === 'string' ? abpError : abpError?.message) ||
      (error?.response?.status === 400
        ? '删除失败（400）。请重启后端后再试；若仍失败请查看 Network Response'
        : error?.message) ||
      '删除失败';
    message.error(detail);
  }
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
      <AccessControl
        :codes="['AbpTenantManagement.Tenants.Create']"
        type="code"
      >
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
      <Table.Column data-index="name" title="租户名" />
      <Table.Column title="管理员邮箱">
        <template #default="{ record }">
          {{ getTenantAdminEmail(record) || '—' }}
        </template>
      </Table.Column>
      <Table.Column title="操作" width="160">
        <template #default="{ record }">
          <AccessControl
            :codes="['AbpTenantManagement.Tenants.Update']"
            type="code"
          >
            <Button size="small" type="link" @click="openEdit(record)">
              编辑
            </Button>
          </AccessControl>
          <AccessControl
            :codes="['AbpTenantManagement.Tenants.Delete']"
            type="code"
          >
            <Button danger size="small" type="link" @click="remove(record)">
              删除
            </Button>
          </AccessControl>
        </template>
      </Table.Column>
    </Table>

    <Modal
      v-model:open="createOpen"
      :confirm-loading="saving"
      title="新建租户"
      @ok="saveCreate"
    >
      <Form layout="vertical">
        <Form.Item
          label="租户名"
          required
          extra="全局唯一；中文可用，勿重复创建"
        >
          <Input
            v-model:value="createForm.name"
            placeholder="例如：demo 或 厦门第一企业"
          />
        </Form.Item>
        <Form.Item label="管理员邮箱" required>
          <Input v-model:value="createForm.adminEmailAddress" />
        </Form.Item>
        <Form.Item label="管理员密码" required>
          <Input.Password
            v-model:value="createForm.adminPassword"
            placeholder="示例：1q2w3E*"
          />
          <ul class="mt-2 list-none space-y-1 p-0 text-xs">
            <li
              v-for="rule in passwordRules"
              :key="rule.label"
              :class="rule.ok ? 'text-green-600' : 'text-gray-400'"
            >
              {{ rule.ok ? '✓' : '○' }} {{ rule.label }}
            </li>
          </ul>
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="editOpen"
      :confirm-loading="saving"
      title="编辑租户"
      @ok="saveEdit"
    >
      <Form layout="vertical">
        <Form.Item
          label="租户名"
          required
          extra="ABP 标准 Update 主要修改名称；管理员账号请在对应用户管理中维护。"
        >
          <Input v-model:value="editForm.name" />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>
