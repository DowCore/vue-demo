<script lang="ts" setup>
import type { CreateUpdateMenuDto, MenuDto, MenuType } from '#/api';

import { onMounted, reactive, ref } from 'vue';

import { AccessControl } from '@vben/access';

import {
  Button,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
} from 'ant-design-vue';

import {
  createMenuApi,
  deleteMenuApi,
  getMenusApi,
  updateMenuApi,
} from '#/api';
import PermissionTreeSelect from '#/components/permission/permission-tree-select.vue';

const loading = ref(false);
const tree = ref<MenuDto[]>([]);

const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const form = reactive({
  affixTab: false,
  component: '',
  icon: '',
  isEnabled: true,
  isVisible: true,
  keepAlive: true,
  name: '',
  order: 0,
  parentId: null as null | string,
  path: '',
  permission: '',
  redirect: '',
  systemCode: 'MetaDow',
  title: '',
  type: 1 as MenuType,
});

function flatten(nodes: MenuDto[], acc: MenuDto[] = []) {
  nodes.forEach((n) => {
    acc.push(n);
    if (n.children?.length) {
      flatten(n.children, acc);
    }
  });
  return acc;
}

async function load() {
  loading.value = true;
  try {
    tree.value = await getMenusApi('MetaDow');
  } finally {
    loading.value = false;
  }
}

function openCreate(parentId: null | string = null) {
  editingId.value = null;
  Object.assign(form, {
    affixTab: false,
    component: '',
    icon: '',
    isEnabled: true,
    isVisible: true,
    keepAlive: true,
    name: '',
    order: 0,
    parentId,
    path: '',
    permission: '',
    redirect: '',
    systemCode: 'MetaDow',
    title: '',
    type: parentId ? 1 : 0,
  });
  modalOpen.value = true;
}

function openEdit(record: MenuDto) {
  editingId.value = record.id;
  Object.assign(form, {
    affixTab: record.affixTab ?? false,
    component: record.component ?? '',
    icon: record.icon ?? '',
    isEnabled: record.isEnabled ?? true,
    isVisible: record.isVisible ?? true,
    keepAlive: record.keepAlive ?? true,
    name: record.name,
    order: record.order ?? 0,
    parentId: record.parentId ?? null,
    path: record.path ?? '',
    permission: record.permission ?? '',
    redirect: record.redirect ?? '',
    systemCode: record.systemCode ?? 'MetaDow',
    title: record.title,
    type: record.type,
  });
  modalOpen.value = true;
}

async function save() {
  if ((form.type === 1 || form.type === 2) && !form.permission) {
    message.warning('菜单/按钮类型请选择绑定权限');
    return;
  }
  const payload: CreateUpdateMenuDto = { ...form };
  await (editingId.value
    ? updateMenuApi(editingId.value, payload)
    : createMenuApi(payload));
  modalOpen.value = false;
  message.success('已保存');
  await load();
}

async function remove(record: MenuDto) {
  await deleteMenuApi(record.id);
  message.success('已删除');
  await load();
}

function onCreateChild(record: Record<string, unknown>) {
  openCreate((record as unknown as MenuDto).id);
}

function onEdit(record: Record<string, unknown>) {
  openEdit(record as unknown as MenuDto);
}

function onRemove(record: Record<string, unknown>) {
  void remove(record as unknown as MenuDto);
}

onMounted(load);

const columns = [
  { dataIndex: 'title', key: 'title', title: '标题' },
  { dataIndex: 'name', key: 'name', title: '名称' },
  { dataIndex: 'path', key: 'path', title: '路径' },
  { dataIndex: 'permission', key: 'permission', title: '权限' },
  { dataIndex: 'type', key: 'type', title: '类型' },
  { dataIndex: 'order', key: 'order', title: '排序', width: 80 },
  { key: 'action', title: '操作', width: 220 },
];

const parentOptions = () =>
  flatten(tree.value).map((m) => ({ label: m.title, value: m.id }));
</script>

<template>
  <div class="p-4">
    <Space class="mb-4">
      <AccessControl :codes="['Administration.Menus.Create']" type="code">
        <Button type="primary" @click="openCreate(null)">新建根菜单</Button>
      </AccessControl>
      <Button @click="load">刷新</Button>
    </Space>
    <Table
      :columns="columns"
      :data-source="tree"
      :loading="loading"
      :pagination="false"
      children-column-name="children"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          {{ ['目录', '菜单', '按钮'][record.type] ?? record.type }}
        </template>
        <template v-else-if="column.key === 'action'">
          <Space>
            <AccessControl :codes="['Administration.Menus.Create']" type="code">
              <Button size="small" @click="onCreateChild(record)">子级</Button>
            </AccessControl>
            <AccessControl :codes="['Administration.Menus.Update']" type="code">
              <Button size="small" @click="onEdit(record)">编辑</Button>
            </AccessControl>
            <AccessControl :codes="['Administration.Menus.Delete']" type="code">
              <Button danger size="small" @click="onRemove(record)">
                删除
              </Button>
            </AccessControl>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="modalOpen"
      :title="editingId ? '编辑菜单' : '新建菜单'"
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item label="标题" required>
          <Input v-model:value="form.title" />
        </Form.Item>
        <Form.Item label="名称" required>
          <Input v-model:value="form.name" />
        </Form.Item>
        <Form.Item label="类型">
          <Select
            v-model:value="form.type"
            :options="[
              { label: '目录', value: 0 },
              { label: '菜单', value: 1 },
              { label: '按钮', value: 2 },
            ]"
          />
        </Form.Item>
        <Form.Item label="父级">
          <Select
            :value="form.parentId ?? undefined"
            allow-clear
            :options="parentOptions()"
            @update:value="(v) => (form.parentId = (v as string) ?? null)"
          />
        </Form.Item>
        <Form.Item label="路径">
          <Input v-model:value="form.path" />
        </Form.Item>
        <Form.Item label="组件">
          <Input v-model:value="form.component" />
        </Form.Item>
        <Form.Item
          :required="form.type === 1 || form.type === 2"
          label="权限"
          tooltip="叶子菜单/按钮应绑定 PermissionDefinition 名称"
        >
          <PermissionTreeSelect
            :model-value="form.permission ?? ''"
            @update:model-value="(v) => (form.permission = v || '')"
          />
        </Form.Item>
        <Form.Item label="图标">
          <Input v-model:value="form.icon" />
        </Form.Item>
        <Form.Item label="排序">
          <InputNumber v-model:value="form.order" class="w-full" />
        </Form.Item>
        <Form.Item label="可见">
          <Switch v-model:checked="form.isVisible" />
        </Form.Item>
        <Form.Item label="启用">
          <Switch v-model:checked="form.isEnabled" />
        </Form.Item>
      </Form>
    </Modal>
  </div>
</template>
