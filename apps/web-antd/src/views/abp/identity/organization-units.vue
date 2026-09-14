<script lang="ts" setup>
import type {
  OrganizationUnit,
  OrganizationUnitMember,
  OrganizationUnitRole,
} from '#/api';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { AccessControl, useAccess } from '@vben/access';

import {
  Button,
  Card,
  Descriptions,
  Dropdown,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Space,
  Table,
  Tabs,
  Tree,
  TreeSelect,
} from 'ant-design-vue';

import {
  addOrganizationUnitMembersApi,
  addOrganizationUnitRolesApi,
  createOrganizationUnitApi,
  deleteOrganizationUnitApi,
  getAvailableOrganizationUnitRolesApi,
  getAvailableOrganizationUnitUsersApi,
  getOrganizationUnitMembersApi,
  getOrganizationUnitRolesApi,
  getOrganizationUnitsApi,
  getRolesApi,
  getUsersApi,
  moveOrganizationUnitApi,
  removeOrganizationUnitMemberApi,
  removeOrganizationUnitRoleApi,
  updateOrganizationUnitApi,
} from '#/api';

defineOptions({ name: 'AbpIdentityOrganizationUnits' });

interface TreeNode {
  children?: TreeNode[];
  disabled?: boolean;
  key: string;
  title: string;
  value?: string;
}

const { hasAccessByCodes } = useAccess();
const canManageOu = computed(() =>
  hasAccessByCodes(['AbpIdentity.OrganizationUnits.ManageOU']),
);

const loading = ref(false);
const units = ref<OrganizationUnit[]>([]);
const selectedKeys = ref<string[]>([]);
const expandedKeys = ref<string[]>([]);
const treeKeyword = ref('');
const selectedId = computed(() => selectedKeys.value[0] ?? null);

const modalOpen = ref(false);
const editingId = ref<null | string>(null);
const form = reactive({
  displayName: '',
  parentId: null as null | string,
});

const moveOpen = ref(false);
const moveTargetParentId = ref<null | string>(null);
const movingId = ref<null | string>(null);

const membersLoading = ref(false);
const members = ref<OrganizationUnitMember[]>([]);
const membersTotal = ref(0);
const memberPage = reactive({ current: 1, pageSize: 10 });
const memberFilter = ref('');

const rolesLoading = ref(false);
const roles = ref<OrganizationUnitRole[]>([]);
const rolesTotal = ref(0);
const rolePage = reactive({ current: 1, pageSize: 10 });
const roleFilter = ref('');

const addMemberOpen = ref(false);
const addRoleOpen = ref(false);
const availableUsers = ref<OrganizationUnitMember[]>([]);
const availableRoles = ref<OrganizationUnitRole[]>([]);
const pickedUserIds = ref<string[]>([]);
const pickedRoleIds = ref<string[]>([]);
const availableUserFilter = ref('');
const availableRoleFilter = ref('');

function onPickUsers(keys: (number | string)[]) {
  pickedUserIds.value = keys.map(String);
}

function onPickRoles(keys: (number | string)[]) {
  pickedRoleIds.value = keys.map(String);
}

function collectDescendantIds(id: string): Set<string> {
  const result = new Set<string>([id]);
  const walk = (parentId: string) => {
    units.value
      .filter((u) => u.parentId === parentId)
      .forEach((u) => {
        result.add(u.id);
        walk(u.id);
      });
  };
  walk(id);
  return result;
}

function buildTree(
  list: OrganizationUnit[],
  options?: { disableIds?: Set<string>; keyword?: string },
): TreeNode[] {
  const keyword = options?.keyword?.trim().toLowerCase();
  const disableIds = options?.disableIds;

  const matched = keyword
    ? list.filter(
        (u) =>
          u.displayName.toLowerCase().includes(keyword) ||
          (u.code ?? '').toLowerCase().includes(keyword),
      )
    : list;

  const keepIds = new Set<string>();
  if (keyword) {
    const byId = new Map(list.map((u) => [u.id, u]));
    matched.forEach((u) => {
      let cur: OrganizationUnit | undefined = u;
      while (cur) {
        keepIds.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
    });
  }

  const source = keyword ? list.filter((u) => keepIds.has(u.id)) : list;
  const map = new Map<string, TreeNode>();
  source.forEach((u) =>
    map.set(u.id, {
      children: [],
      disabled: disableIds?.has(u.id),
      key: u.id,
      title: u.code ? `${u.displayName}（${u.code}）` : u.displayName,
      value: u.id,
    }),
  );

  const roots: TreeNode[] = [];
  source.forEach((u) => {
    const node = map.get(u.id);
    if (!node) {
      return;
    }
    const parent = u.parentId ? map.get(u.parentId) : undefined;
    if (parent?.children) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const prune = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.children && n.children.length === 0) {
        delete n.children;
      } else if (n.children) {
        prune(n.children);
      }
    }
  };
  prune(roots);
  return roots;
}

const treeData = computed(() =>
  buildTree(units.value, { keyword: treeKeyword.value }),
);

const parentSelectTree = computed(() =>
  buildTree(units.value, {
    disableIds: editingId.value
      ? collectDescendantIds(editingId.value)
      : undefined,
  }),
);

const moveSelectTree = computed(() => {
  if (!movingId.value) {
    return buildTree(units.value);
  }
  return buildTree(units.value, {
    disableIds: collectDescendantIds(movingId.value),
  });
});

const selectedUnit = computed(() =>
  units.value.find((u) => u.id === selectedId.value),
);

const parentName = computed(() => {
  const parentId = selectedUnit.value?.parentId;
  if (!parentId) {
    return '（根级）';
  }
  return units.value.find((u) => u.id === parentId)?.displayName ?? parentId;
});

const pathLabel = computed(() => {
  if (!selectedUnit.value) {
    return '';
  }
  const byId = new Map(units.value.map((u) => [u.id, u]));
  const names: string[] = [];
  let cur: OrganizationUnit | undefined = selectedUnit.value;
  while (cur) {
    names.unshift(cur.displayName);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return names.join(' / ');
});

async function loadTree(preferSelectId?: null | string) {
  loading.value = true;
  try {
    units.value = await getOrganizationUnitsApi();
    expandedKeys.value = units.value.map((u) => u.id);

    const prefer =
      preferSelectId ||
      (selectedId.value && units.value.some((u) => u.id === selectedId.value)
        ? selectedId.value
        : units.value[0]?.id);

    selectedKeys.value = prefer ? [prefer] : [];
  } finally {
    loading.value = false;
  }
}

async function loadMembers() {
  if (!selectedId.value) {
    members.value = [];
    membersTotal.value = 0;
    return;
  }
  membersLoading.value = true;
  try {
    const result = await getOrganizationUnitMembersApi(selectedId.value, {
      filter: memberFilter.value || undefined,
      maxResultCount: memberPage.pageSize,
      skipCount: (memberPage.current - 1) * memberPage.pageSize,
    });
    members.value = result.items ?? [];
    membersTotal.value = result.totalCount ?? 0;
  } finally {
    membersLoading.value = false;
  }
}

async function loadRoles() {
  if (!selectedId.value) {
    roles.value = [];
    rolesTotal.value = 0;
    return;
  }
  rolesLoading.value = true;
  try {
    const result = await getOrganizationUnitRolesApi(selectedId.value, {
      maxResultCount: rolePage.pageSize,
      skipCount: (rolePage.current - 1) * rolePage.pageSize,
    });
    const all = result.items ?? [];
    const keyword = roleFilter.value.trim().toLowerCase();
    roles.value = keyword
      ? all.filter((r) => r.name.toLowerCase().includes(keyword))
      : all;
    rolesTotal.value = keyword ? roles.value.length : (result.totalCount ?? 0);
  } finally {
    rolesLoading.value = false;
  }
}

watch(selectedId, () => {
  memberPage.current = 1;
  rolePage.current = 1;
  memberFilter.value = '';
  roleFilter.value = '';
  void loadMembers();
  void loadRoles();
});

function openCreate(parentId: null | string = null) {
  editingId.value = null;
  form.displayName = '';
  form.parentId = parentId;
  modalOpen.value = true;
}

function openEdit(id?: null | string) {
  const targetId = id ?? selectedId.value;
  const unit = units.value.find((u) => u.id === targetId);
  if (!unit) {
    return;
  }
  selectedKeys.value = [unit.id];
  editingId.value = unit.id;
  form.displayName = unit.displayName;
  form.parentId = unit.parentId ?? null;
  modalOpen.value = true;
}

async function save() {
  if (!form.displayName.trim()) {
    message.warning('请填写显示名称');
    return;
  }
  if (editingId.value) {
    await updateOrganizationUnitApi(editingId.value, {
      displayName: form.displayName.trim(),
    });
    // 编辑时若父级变化则执行转移
    const current = units.value.find((u) => u.id === editingId.value);
    const nextParent = form.parentId ?? null;
    const prevParent = current?.parentId ?? null;
    if (nextParent !== prevParent) {
      await moveOrganizationUnitApi(editingId.value, nextParent);
    }
    message.success('已保存');
    modalOpen.value = false;
    await loadTree(editingId.value);
  } else {
    const created = await createOrganizationUnitApi({
      displayName: form.displayName.trim(),
      parentId: form.parentId,
    });
    message.success('已创建');
    modalOpen.value = false;
    await loadTree(created?.id);
  }
}

function openMove(id?: null | string) {
  const targetId = id ?? selectedId.value;
  if (!targetId) {
    return;
  }
  const unit = units.value.find((u) => u.id === targetId);
  if (!unit) {
    return;
  }
  selectedKeys.value = [unit.id];
  movingId.value = unit.id;
  moveTargetParentId.value = unit.parentId ?? null;
  moveOpen.value = true;
}

async function saveMove() {
  if (!movingId.value) {
    return;
  }
  const current = units.value.find((u) => u.id === movingId.value);
  const nextParent = moveTargetParentId.value ?? null;
  if ((current?.parentId ?? null) === nextParent) {
    moveOpen.value = false;
    return;
  }
  await moveOrganizationUnitApi(movingId.value, nextParent);
  message.success('已转移');
  moveOpen.value = false;
  await loadTree(movingId.value);
}

async function removeUnit(id?: null | string) {
  const targetId = id ?? selectedId.value;
  if (!targetId) {
    return;
  }
  const unit = units.value.find((u) => u.id === targetId);
  Modal.confirm({
    content: `将删除「${unit?.displayName ?? ''}」及其全部子组织，并解除成员/角色关联，是否继续？`,
    okType: 'danger',
    onOk: async () => {
      await deleteOrganizationUnitApi(targetId);
      message.success('已删除');
      if (selectedId.value === targetId) {
        selectedKeys.value = [];
      }
      await loadTree();
    },
    title: '删除组织机构',
  });
}

async function onDrop(info: {
  dragNode: { key: number | string };
  dropPosition: number;
  dropToGap: boolean;
  node: { key: number | string; pos?: string };
}) {
  if (!canManageOu.value) {
    return;
  }
  const dragKey = String(info.dragNode.key);
  const dropKey = String(info.node.key);
  if (dragKey === dropKey) {
    return;
  }

  // dropToGap：同级（父级=目标父级）；否则放入目标内部
  const newParentId: null | string = info.dropToGap
    ? (units.value.find((u) => u.id === dropKey)?.parentId ?? null)
    : dropKey;

  const forbidden = collectDescendantIds(dragKey);
  if (newParentId && forbidden.has(newParentId)) {
    message.warning('不能移动到自身或其子节点下');
    return;
  }

  const currentParent =
    units.value.find((u) => u.id === dragKey)?.parentId ?? null;
  if (currentParent === newParentId) {
    return;
  }

  await moveOrganizationUnitApi(dragKey, newParentId);
  message.success('已移动');
  await loadTree(dragKey);
}

function onTreeAction(key: number | string, unitId: string) {
  switch (String(key)) {
    case 'child': {
      openCreate(unitId);
      break;
    }
    case 'delete': {
      void removeUnit(unitId);
      break;
    }
    case 'edit': {
      openEdit(unitId);
      break;
    }
    case 'move': {
      openMove(unitId);
      break;
    }
  }
}

async function openAddMembers() {
  if (!selectedId.value) {
    return;
  }
  pickedUserIds.value = [];
  availableUserFilter.value = '';
  const result = await getAvailableOrganizationUnitUsersApi({
    id: selectedId.value,
    maxResultCount: 100,
    skipCount: 0,
  });
  availableUsers.value = result.items ?? [];
  if (availableUsers.value.length === 0) {
    const users = await getUsersApi({ maxResultCount: 100, skipCount: 0 });
    availableUsers.value = (users.items ?? []).map((u) => ({
      email: u.email,
      id: u.id,
      name: u.name,
      surname: u.surname,
      userName: u.userName,
    }));
  }
  addMemberOpen.value = true;
}

const filteredAvailableUsers = computed(() => {
  const keyword = availableUserFilter.value.trim().toLowerCase();
  if (!keyword) {
    return availableUsers.value;
  }
  return availableUsers.value.filter(
    (u) =>
      u.userName.toLowerCase().includes(keyword) ||
      (u.email ?? '').toLowerCase().includes(keyword),
  );
});

async function saveAddMembers() {
  if (!selectedId.value || pickedUserIds.value.length === 0) {
    addMemberOpen.value = false;
    return;
  }
  await addOrganizationUnitMembersApi(selectedId.value, pickedUserIds.value);
  message.success('已添加成员');
  addMemberOpen.value = false;
  await loadMembers();
}

async function removeMember(record: OrganizationUnitMember) {
  if (!selectedId.value) {
    return;
  }
  await removeOrganizationUnitMemberApi(selectedId.value, record.id);
  message.success('已移除');
  await loadMembers();
}

async function openAddRoles() {
  if (!selectedId.value) {
    return;
  }
  pickedRoleIds.value = [];
  availableRoleFilter.value = '';
  const result = await getAvailableOrganizationUnitRolesApi({
    id: selectedId.value,
    maxResultCount: 200,
    skipCount: 0,
  });
  availableRoles.value = result.items ?? [];
  if (availableRoles.value.length === 0) {
    const rolesResult = await getRolesApi({
      maxResultCount: 200,
      skipCount: 0,
    });
    availableRoles.value = (rolesResult.items ?? []).map((r) => ({
      id: r.id,
      isDefault: r.isDefault,
      isPublic: r.isPublic,
      isStatic: r.isStatic,
      name: r.name,
    }));
  }
  addRoleOpen.value = true;
}

const filteredAvailableRoles = computed(() => {
  const keyword = availableRoleFilter.value.trim().toLowerCase();
  if (!keyword) {
    return availableRoles.value;
  }
  return availableRoles.value.filter((r) =>
    r.name.toLowerCase().includes(keyword),
  );
});

async function saveAddRoles() {
  if (!selectedId.value || pickedRoleIds.value.length === 0) {
    addRoleOpen.value = false;
    return;
  }
  await addOrganizationUnitRolesApi(selectedId.value, pickedRoleIds.value);
  message.success('已添加角色');
  addRoleOpen.value = false;
  await loadRoles();
}

async function removeRole(record: OrganizationUnitRole) {
  if (!selectedId.value) {
    return;
  }
  await removeOrganizationUnitRoleApi(selectedId.value, record.id);
  message.success('已移除');
  await loadRoles();
}

onMounted(async () => {
  await loadTree();
});
</script>

<template>
  <div class="flex gap-4 p-4" style="min-height: 620px">
    <Card
      class="flex w-[360px] shrink-0 flex-col"
      size="small"
      title="组织机构"
    >
      <template #extra>
        <Space>
          <AccessControl
            :codes="['AbpIdentity.OrganizationUnits.ManageOU']"
            type="code"
          >
            <Button size="small" type="primary" @click="openCreate(null)">
              新建根组织
            </Button>
          </AccessControl>
          <Button size="small" @click="loadTree()">刷新</Button>
        </Space>
      </template>

      <Input
        v-model:value="treeKeyword"
        allow-clear
        class="mb-3"
        placeholder="搜索组织名称 / 编码"
      />

      <div class="mb-2 text-xs text-gray-400">
        支持拖拽调整层级；也可通过节点菜单「转移」
      </div>

      <Tree
        v-if="treeData.length"
        v-model:expanded-keys="expandedKeys"
        v-model:selected-keys="selectedKeys"
        :draggable="canManageOu"
        :loading="loading"
        :tree-data="treeData"
        block-node
        @drop="onDrop"
      >
        <template #title="{ title, key }">
          <div class="flex w-full items-center justify-between gap-2 pr-1">
            <span class="truncate">{{ title }}</span>
            <AccessControl
              :codes="['AbpIdentity.OrganizationUnits.ManageOU']"
              type="code"
            >
              <Dropdown
                :menu="{
                  items: [
                    { key: 'child', label: '添加子级' },
                    { key: 'edit', label: '编辑' },
                    { key: 'move', label: '转移' },
                    { type: 'divider' },
                    { danger: true, key: 'delete', label: '删除' },
                  ],
                  onClick: ({ key: action }: { key: string | number }) =>
                    onTreeAction(action, String(key)),
                }"
                :trigger="['click']"
              >
                <Button size="small" type="text" @click.stop>···</Button>
              </Dropdown>
            </AccessControl>
          </div>
        </template>
      </Tree>
      <Empty v-else description="暂无组织，请新建根节点" />
    </Card>

    <Card class="min-w-0 flex-1" size="small">
      <template #title>
        {{ selectedUnit?.displayName || '请选择组织机构' }}
      </template>
      <template v-if="selectedId" #extra>
        <Space wrap>
          <AccessControl
            :codes="['AbpIdentity.OrganizationUnits.ManageOU']"
            type="code"
          >
            <Button size="small" @click="openCreate(selectedId)">
              添加子级
            </Button>
            <Button size="small" @click="openEdit()">编辑</Button>
            <Button size="small" @click="openMove()">转移</Button>
            <Button danger size="small" @click="removeUnit()">删除</Button>
          </AccessControl>
        </Space>
      </template>

      <Empty v-if="!selectedId" description="从左侧选择组织节点" />
      <template v-else>
        <Descriptions :column="2" bordered class="mb-4" size="small">
          <Descriptions.Item label="名称">
            {{ selectedUnit?.displayName }}
          </Descriptions.Item>
          <Descriptions.Item label="编码">
            {{ selectedUnit?.code || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="上级">
            {{ parentName }}
          </Descriptions.Item>
          <Descriptions.Item label="路径">
            {{ pathLabel }}
          </Descriptions.Item>
        </Descriptions>

        <Tabs>
          <Tabs.TabPane key="members" tab="成员">
            <div class="mb-4">
              <Space wrap>
                <Input
                  v-model:value="memberFilter"
                  allow-clear
                  placeholder="筛选用户名 / 邮箱"
                  style="width: 220px"
                  @press-enter="
                    () => {
                      memberPage.current = 1;
                      loadMembers();
                    }
                  "
                />
                <Button
                  @click="
                    () => {
                      memberPage.current = 1;
                      loadMembers();
                    }
                  "
                >
                  查询
                </Button>
                <AccessControl
                  :codes="['AbpIdentity.OrganizationUnits.ManageMembers']"
                  type="code"
                >
                  <Button type="primary" @click="openAddMembers">
                    添加成员
                  </Button>
                </AccessControl>
                <Button @click="loadMembers">刷新</Button>
              </Space>
            </div>
            <Table
              :data-source="members"
              :loading="membersLoading"
              :pagination="{
                current: memberPage.current,
                pageSize: memberPage.pageSize,
                total: membersTotal,
              }"
              row-key="id"
              size="small"
              @change="
                (pag) => {
                  memberPage.current = Number(pag.current);
                  memberPage.pageSize = Number(pag.pageSize);
                  loadMembers();
                }
              "
            >
              <Table.Column data-index="userName" title="用户名" />
              <Table.Column data-index="email" title="邮箱" />
              <Table.Column title="姓名">
                <template #default="{ record }">
                  {{
                    [record.name, record.surname].filter(Boolean).join(' ') ||
                    '—'
                  }}
                </template>
              </Table.Column>
              <Table.Column title="操作" width="100">
                <template #default="{ record }">
                  <AccessControl
                    :codes="['AbpIdentity.OrganizationUnits.ManageMembers']"
                    type="code"
                  >
                    <Button
                      danger
                      size="small"
                      type="link"
                      @click="removeMember(record)"
                    >
                      移除
                    </Button>
                  </AccessControl>
                </template>
              </Table.Column>
            </Table>
          </Tabs.TabPane>

          <Tabs.TabPane key="roles" tab="角色">
            <div class="mb-4">
              <Space wrap>
                <Input
                  v-model:value="roleFilter"
                  allow-clear
                  placeholder="筛选角色名"
                  style="width: 220px"
                  @press-enter="loadRoles"
                />
                <Button @click="loadRoles">查询</Button>
                <AccessControl
                  :codes="['AbpIdentity.OrganizationUnits.ManageRoles']"
                  type="code"
                >
                  <Button type="primary" @click="openAddRoles">添加角色</Button>
                </AccessControl>
                <Button @click="loadRoles">刷新</Button>
              </Space>
            </div>
            <Table
              :data-source="roles"
              :loading="rolesLoading"
              :pagination="{
                current: rolePage.current,
                pageSize: rolePage.pageSize,
                total: rolesTotal,
              }"
              row-key="id"
              size="small"
              @change="
                (pag) => {
                  rolePage.current = Number(pag.current);
                  rolePage.pageSize = Number(pag.pageSize);
                  loadRoles();
                }
              "
            >
              <Table.Column data-index="name" title="角色" />
              <Table.Column title="默认" width="80">
                <template #default="{ record }">
                  {{ record.isDefault ? '是' : '否' }}
                </template>
              </Table.Column>
              <Table.Column title="操作" width="100">
                <template #default="{ record }">
                  <AccessControl
                    :codes="['AbpIdentity.OrganizationUnits.ManageRoles']"
                    type="code"
                  >
                    <Button
                      danger
                      size="small"
                      type="link"
                      @click="removeRole(record)"
                    >
                      移除
                    </Button>
                  </AccessControl>
                </template>
              </Table.Column>
            </Table>
          </Tabs.TabPane>
        </Tabs>
      </template>
    </Card>

    <Modal
      v-model:open="modalOpen"
      :title="editingId ? '编辑组织' : '新建组织'"
      @ok="save"
    >
      <Form layout="vertical">
        <Form.Item label="显示名称" required>
          <Input
            v-model:value="form.displayName"
            placeholder="例如：研发中心"
          />
        </Form.Item>
        <Form.Item
          :label="editingId ? '上级组织（可调整）' : '上级组织'"
          :extra="
            editingId
              ? '修改上级等同于转移；不能选自身或子节点'
              : '为空则创建为根组织'
          "
        >
          <TreeSelect
            v-model:value="form.parentId"
            :tree-data="parentSelectTree"
            allow-clear
            placeholder="选择上级（可空）"
            style="width: 100%"
            tree-default-expand-all
          />
        </Form.Item>
      </Form>
    </Modal>

    <Modal v-model:open="moveOpen" title="转移组织" @ok="saveMove">
      <Form layout="vertical">
        <Form.Item label="当前组织">
          <Input :value="selectedUnit?.displayName" disabled />
        </Form.Item>
        <Form.Item
          extra="留空表示转移到根级；不能选择自身或其子节点"
          label="新的上级组织"
        >
          <TreeSelect
            v-model:value="moveTargetParentId"
            :tree-data="moveSelectTree"
            allow-clear
            placeholder="选择新上级（可空=根级）"
            style="width: 100%"
            tree-default-expand-all
          />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="addMemberOpen"
      title="添加成员"
      width="720px"
      @ok="saveAddMembers"
    >
      <Input
        v-model:value="availableUserFilter"
        allow-clear
        class="mb-3"
        placeholder="筛选可选用户"
      />
      <Table
        :data-source="filteredAvailableUsers"
        :pagination="{ pageSize: 8 }"
        :row-selection="{
          selectedRowKeys: pickedUserIds,
          onChange: onPickUsers,
        }"
        row-key="id"
        size="small"
      >
        <Table.Column data-index="userName" title="用户名" />
        <Table.Column data-index="email" title="邮箱" />
      </Table>
    </Modal>

    <Modal
      v-model:open="addRoleOpen"
      title="添加角色"
      width="560px"
      @ok="saveAddRoles"
    >
      <Input
        v-model:value="availableRoleFilter"
        allow-clear
        class="mb-3"
        placeholder="筛选可选角色"
      />
      <Table
        :data-source="filteredAvailableRoles"
        :pagination="{ pageSize: 8 }"
        :row-selection="{
          selectedRowKeys: pickedRoleIds,
          onChange: onPickRoles,
        }"
        row-key="id"
        size="small"
      >
        <Table.Column data-index="name" title="角色" />
      </Table>
    </Modal>
  </div>
</template>
