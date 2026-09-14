<script lang="ts" setup>
import type { RecentTenant } from '#/utils/tenant';

import { computed, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  Button,
  Divider,
  Input,
  message,
  Modal,
  Select,
  Space,
  Tag,
} from 'ant-design-vue';

import { getTenantsForSwitchApi } from '#/api/saas/tenant-resolve';
import { resolveAndSetTenantByName } from '#/utils/resolve-tenant';
import {
  clearLocalTenant,
  getLocalTenantName,
  getRecentTenants,
  removeRecentTenant,
  setLocalTenant,
} from '#/utils/tenant';

const props = withDefaults(
  defineProps<{
    /** 登录页切换不需要重新登录；顶栏切换需要 */
    requireRelogin?: boolean;
  }>(),
  {
    requireRelogin: false,
  },
);

const emit = defineEmits<{
  changed: [tenantName: null | string];
  relogin: [];
}>();

const open = defineModel<boolean>('open', { default: false });

const accessStore = useAccessStore();
const loading = ref(false);
const nameInput = ref('');
const managedOptions = ref<{ label: string; value: string }[]>([]);
const recent = ref<RecentTenant[]>([]);

const canLoadManagedList = computed(() => Boolean(accessStore.accessToken));

function refreshRecent() {
  recent.value = getRecentTenants();
}

async function loadManagedTenants() {
  if (!canLoadManagedList.value) {
    managedOptions.value = [];
    return;
  }
  try {
    const result = await getTenantsForSwitchApi({ maxResultCount: 100 });
    managedOptions.value = (result.items ?? []).map((item) => ({
      label: item.name,
      value: item.name,
    }));
  } catch {
    managedOptions.value = [];
  }
}

watch(open, async (visible) => {
  if (!visible) {
    return;
  }
  nameInput.value = getLocalTenantName() || '';
  refreshRecent();
  await loadManagedTenants();
});

async function applyByName(name: string) {
  loading.value = true;
  try {
    const trimmed = name.trim();
    if (trimmed) {
      const resolved = await resolveAndSetTenantByName(trimmed);
      message.success(`当前租户：${resolved}`);
      emit('changed', resolved);
    } else {
      clearLocalTenant();
      message.success('已切换到宿主（未选择租户）');
      emit('changed', null);
    }
    open.value = false;
    if (props.requireRelogin) {
      emit('relogin');
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '切换租户失败');
  } finally {
    loading.value = false;
  }
}

async function selectHost() {
  nameInput.value = '';
  await applyByName('');
}

async function selectRecent(item: RecentTenant) {
  setLocalTenant(item.id, item.name);
  message.success(`当前租户：${item.name}`);
  emit('changed', item.name);
  open.value = false;
  if (props.requireRelogin) {
    emit('relogin');
  }
}

function forgetRecent(item: RecentTenant, event: Event) {
  event.stopPropagation();
  removeRecentTenant(item.id);
  refreshRecent();
}

async function handleOk() {
  await applyByName(nameInput.value);
}
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="loading"
    title="切换租户"
    ok-text="切换"
    @ok="handleOk"
  >
    <p class="text-muted-foreground mb-4 text-sm">
      与 ABP 账户模块一致：先选择租户（或宿主），再使用该租户下的账号登录。
    </p>

    <div class="mb-4">
      <Button block type="default" @click="selectHost">
        使用宿主（Host）· 不选择租户
      </Button>
    </div>

    <div v-if="recent.length" class="mb-4">
      <div class="mb-2 text-sm font-medium">最近使用</div>
      <Space wrap>
        <Tag
          v-for="item in recent"
          :key="item.id"
          class="cursor-pointer"
          color="blue"
          closable
          @click="selectRecent(item)"
          @close="(e: Event) => forgetRecent(item, e)"
        >
          {{ item.name }}
        </Tag>
      </Space>
    </div>

    <div v-if="managedOptions.length" class="mb-4">
      <div class="mb-2 text-sm font-medium">从租户列表选择</div>
      <Select
        v-model:value="nameInput"
        allow-clear
        class="w-full"
        :options="managedOptions"
        placeholder="搜索并选择租户"
        show-search
        option-filter-prop="label"
      />
    </div>

    <Divider class="!my-3" />

    <div>
      <div class="mb-2 text-sm font-medium">按名称切换</div>
      <Input
        v-model:value="nameInput"
        allow-clear
        placeholder="输入租户名称"
        @press-enter="handleOk"
      />
      <div class="text-muted-foreground mt-1 text-xs">
        公开登录页不会枚举全部租户；知道名称时可在此切换（与 ABP TenantBox
        相同）。
      </div>
    </div>
  </Modal>
</template>
