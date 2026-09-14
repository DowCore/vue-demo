<script lang="ts" setup>
import type { PermissionGrantInfo, PermissionGroup } from '#/api';

import { ref, watch } from 'vue';

import {
  Checkbox,
  Collapse,
  Empty,
  message,
  Modal,
  Spin,
} from 'ant-design-vue';

import { getPermissionsApi, updatePermissionsApi } from '#/api';
import { useAuthStore } from '#/store';

defineOptions({ name: 'RolePermissionModal' });

const props = defineProps<{
  roleName: string;
}>();

const emit = defineEmits<{
  saved: [];
}>();

const open = defineModel<boolean>('open', { default: false });

const authStore = useAuthStore();
const loading = ref(false);
const saving = ref(false);
const groups = ref<PermissionGroup[]>([]);
const activeKeys = ref<string[]>([]);
/** name -> isGranted */
const grantedMap = ref<Record<string, boolean>>({});

function allNames(group: PermissionGroup) {
  return (group.permissions ?? []).map((p) => p.name);
}

function groupCheckedCount(group: PermissionGroup) {
  return allNames(group).filter((n) => grantedMap.value[n]).length;
}

function isGroupAllChecked(group: PermissionGroup) {
  const names = allNames(group);
  return names.length > 0 && names.every((n) => grantedMap.value[n]);
}

function isGroupIndeterminate(group: PermissionGroup) {
  const c = groupCheckedCount(group);
  return c > 0 && c < allNames(group).length;
}

function toggleGroup(group: PermissionGroup, checked: boolean) {
  for (const name of allNames(group)) {
    grantedMap.value[name] = checked;
  }
}

function childrenOf(
  group: PermissionGroup,
  parentName: null | string | undefined,
) {
  return (group.permissions ?? []).filter((p) =>
    parentName
      ? p.parentName === parentName
      : !p.parentName ||
        !(group.permissions ?? []).some((x) => x.name === p.parentName),
  );
}

function togglePermission(
  p: PermissionGrantInfo,
  group: PermissionGroup,
  checked: boolean,
) {
  grantedMap.value[p.name] = checked;
  // 勾选子节点时补上父级
  if (checked && p.parentName) {
    let parent: null | string | undefined = p.parentName;
    while (parent) {
      grantedMap.value[parent] = true;
      parent = (group.permissions ?? []).find(
        (x) => x.name === parent,
      )?.parentName;
    }
  }
  // 取消父节点时取消全部子级
  if (!checked) {
    const revoke = new Set<string>([p.name]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of group.permissions ?? []) {
        if (
          item.parentName &&
          revoke.has(item.parentName) &&
          !revoke.has(item.name)
        ) {
          revoke.add(item.name);
          changed = true;
        }
      }
    }
    for (const name of revoke) {
      grantedMap.value[name] = false;
    }
  }
}

async function load() {
  if (!props.roleName) {
    return;
  }
  loading.value = true;
  try {
    const result = await getPermissionsApi('R', props.roleName);
    groups.value = result.groups ?? [];
    activeKeys.value = groups.value.map((g) => g.name);
    const map: Record<string, boolean> = {};
    for (const g of groups.value) {
      for (const p of g.permissions ?? []) {
        map[p.name] = !!p.isGranted;
      }
    }
    grantedMap.value = map;
  } catch {
    message.error('加载角色权限失败');
    open.value = false;
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const permissions = Object.entries(grantedMap.value).map(
      ([name, isGranted]) => ({
        isGranted,
        name,
      }),
    );
    if (
      props.roleName.toLowerCase() === 'admin' &&
      permissions.length > 0 &&
      permissions.every((p) => !p.isGranted)
    ) {
      message.error('不能清空 admin 的全部权限');
      return;
    }
    await updatePermissionsApi('R', props.roleName, permissions);
    message.success('权限已保存');
    open.value = false;
    emit('saved');
    await authStore.refreshAccessConfiguration();
  } catch {
    message.error('保存权限失败');
  } finally {
    saving.value = false;
  }
}

watch(
  () => open.value,
  (v) => {
    if (v) {
      void load();
    }
  },
);
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="saving"
    :title="`权限 — ${roleName}`"
    ok-text="保存"
    width="720px"
    @ok="save"
  >
    <Spin :spinning="loading">
      <Empty v-if="!loading && groups.length === 0" description="无权限定义" />
      <Collapse v-else v-model:active-key="activeKeys" :bordered="false">
        <Collapse.Panel v-for="group in groups" :key="group.name">
          <template #header>
            <div class="flex items-center gap-2" @click.stop>
              <Checkbox
                :checked="isGroupAllChecked(group)"
                :indeterminate="isGroupIndeterminate(group)"
                @change="(e: any) => toggleGroup(group, !!e?.target?.checked)"
              />
              <span>{{ group.displayName }}</span>
              <span class="text-xs text-gray-400">
                {{ groupCheckedCount(group) }}/{{ allNames(group).length }}
              </span>
            </div>
          </template>
          <div class="pl-2">
            <template v-for="p in childrenOf(group, null)" :key="p.name">
              <div class="py-1">
                <Checkbox
                  :checked="!!grantedMap[p.name]"
                  @change="
                    (e: any) => togglePermission(p, group, !!e?.target?.checked)
                  "
                >
                  {{ p.displayName }}
                  <span class="ml-1 text-xs text-gray-400">{{ p.name }}</span>
                </Checkbox>
              </div>
              <div
                v-for="child in childrenOf(group, p.name)"
                :key="child.name"
                class="py-1 pl-6"
              >
                <Checkbox
                  :checked="!!grantedMap[child.name]"
                  @change="
                    (e: any) =>
                      togglePermission(child, group, !!e?.target?.checked)
                  "
                >
                  {{ child.displayName }}
                  <span class="ml-1 text-xs text-gray-400">{{
                    child.name
                  }}</span>
                </Checkbox>
                <div
                  v-for="grand in childrenOf(group, child.name)"
                  :key="grand.name"
                  class="py-1 pl-6"
                >
                  <Checkbox
                    :checked="!!grantedMap[grand.name]"
                    @change="
                      (e: any) =>
                        togglePermission(grand, group, !!e?.target?.checked)
                    "
                  >
                    {{ grand.displayName }}
                    <span class="ml-1 text-xs text-gray-400">{{
                      grand.name
                    }}</span>
                  </Checkbox>
                </div>
              </div>
            </template>
          </div>
        </Collapse.Panel>
      </Collapse>
    </Spin>
  </Modal>
</template>
