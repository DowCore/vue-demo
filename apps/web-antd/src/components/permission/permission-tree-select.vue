<script lang="ts" setup>
import type { PermissionGrantInfo, PermissionGroup } from '#/api';

import { onMounted, ref } from 'vue';

import { message, TreeSelect } from 'ant-design-vue';

import { getPermissionDefinitionTreeApi } from '#/api';

defineOptions({ name: 'PermissionTreeSelect' });

interface TreeNode {
  children?: TreeNode[];
  disabled?: boolean;
  title: string;
  value: string;
}

const model = defineModel<string>({ default: '' });

const loading = ref(false);
const treeData = ref<TreeNode[]>([]);

function buildChildren(permissions: PermissionGrantInfo[]): TreeNode[] {
  const map = new Map<string, TreeNode>();

  for (const p of permissions) {
    map.set(p.name, {
      children: [],
      title: `${p.displayName} (${p.name})`,
      value: p.name,
    });
  }

  const roots: TreeNode[] = [];
  for (const p of permissions) {
    const node = map.get(p.name);
    if (!node) {
      continue;
    }
    const parent = p.parentName ? map.get(p.parentName) : undefined;
    if (parent?.children) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

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

function toTree(groups: PermissionGroup[]): TreeNode[] {
  return groups.map((g) => ({
    children: buildChildren(g.permissions ?? []),
    disabled: true,
    title: g.displayName,
    value: `__group__${g.name}`,
  }));
}

async function load() {
  loading.value = true;
  try {
    const groups = await getPermissionDefinitionTreeApi();
    treeData.value = toTree(groups);
  } catch {
    message.error('加载权限定义失败');
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <TreeSelect
    :value="model || undefined"
    :disabled="loading"
    :loading="loading"
    :tree-data="treeData"
    allow-clear
    placeholder="选择权限名（与 PermissionDefinition 一致）"
    show-search
    style="width: 100%"
    tree-default-expand-all
    tree-node-filter-prop="title"
    @update:value="(v: string | undefined) => (model = v ?? '')"
  />
</template>
