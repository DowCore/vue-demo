<script lang="ts" setup>
import type {
  DataSourceLookup,
  DbQueryObject,
  QueryObjectCatalogItem,
} from '#/api/saas/orchestration';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AccessControl } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Drawer,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createAppResourceFromQueryObjectApi,
  deleteQueryObjectApi,
  getDataSourceLookupApi,
  getDbQueryObjectApi,
  getDbQueryObjectsApi,
  getQueryObjectCatalogApi,
  importQueryObjectsApi,
  refreshQueryObjectApi,
} from '#/api/saas/orchestration';

defineOptions({ name: 'OrchestrationQueryObjects' });

const route = useRoute();
const router = useRouter();

const kind = computed(() =>
  String(route.path || '').includes('procedure') ? 'procedure' : 'view',
);
const isView = computed(() => kind.value === 'view');
const title = computed(() => (isView.value ? '视图' : '存储过程'));
const objectLabel = computed(() => (isView.value ? '视图' : '存储过程'));

const loading = ref(false);
const saving = ref(false);
const items = ref<DbQueryObject[]>([]);
const total = ref(0);
const filter = ref('');
const dataSourceCode = ref<string | undefined>();
const lookup = ref<DataSourceLookup[]>([]);
const page = reactive({ current: 1, pageSize: 10 });

const importOpen = ref(false);
const importDs = ref('');
const catalog = ref<QueryObjectCatalogItem[]>([]);
const catalogTotal = ref(0);
const catalogLoading = ref(false);
const catalogFilter = ref('');
const catalogPage = reactive({ current: 1, pageSize: 20 });
const selectedNames = ref<string[]>([]);
let catalogFilterTimer: ReturnType<typeof setTimeout> | undefined;

const detailOpen = ref(false);
const detail = ref<DbQueryObject | null>(null);

const resourceOpen = ref(false);
const resourceTarget = ref<DbQueryObject | null>(null);
const resourceForm = reactive({ code: '', name: '' });

const columns = computed(() => [
  { title: '显示名', dataIndex: 'displayName', key: 'displayName' },
  {
    title: isView.value ? '视图名' : '对象名',
    dataIndex: 'objectName',
    key: 'objectName',
    width: 200,
  },
  { title: '数据源', dataIndex: 'dataSourceCode', key: 'ds', width: 140 },
  { title: '类型', key: 'routine', width: 110 },
  { title: '列', key: 'cols', width: 70 },
  ...(isView.value ? [] : [{ title: '参数', key: 'params', width: 70 }]),
  { title: '操作', key: 'actions', width: 280 },
]);

async function loadLookup() {
  try {
    const res = await getDataSourceLookupApi();
    lookup.value = (res.items || []).filter((x) => x.family === 'sql');
  } catch {
    lookup.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const res = await getDbQueryObjectsApi({
      dataSourceCode: dataSourceCode.value,
      kind: kind.value,
      filter: filter.value || undefined,
      maxResultCount: page.pageSize,
      skipCount: (page.current - 1) * page.pageSize,
    });
    items.value = res.items ?? [];
    total.value = res.totalCount ?? 0;
  } finally {
    loading.value = false;
  }
}

async function openImport() {
  importDs.value = dataSourceCode.value || lookup.value[0]?.code || '';
  selectedNames.value = [];
  catalog.value = [];
  catalogTotal.value = 0;
  catalogFilter.value = '';
  catalogPage.current = 1;
  importOpen.value = true;
  await loadCatalog();
}

async function loadCatalog(forcedFilter?: string) {
  if (!importDs.value) {
    catalog.value = [];
    catalogTotal.value = 0;
    return;
  }
  const term = (forcedFilter ?? catalogFilter.value).trim();
  catalogLoading.value = true;
  try {
    const res = await getQueryObjectCatalogApi({
      dataSourceCode: importDs.value,
      kind: kind.value,
      filter: term || undefined,
      keyword: term || undefined,
      maxResultCount: catalogPage.pageSize,
      skipCount: (catalogPage.current - 1) * catalogPage.pageSize,
    });
    catalog.value = res.items ?? [];
    catalogTotal.value = res.totalCount ?? 0;
  } catch {
    catalog.value = [];
    catalogTotal.value = 0;
  } finally {
    catalogLoading.value = false;
  }
}

function onImportDsChange() {
  selectedNames.value = [];
  catalogPage.current = 1;
  loadCatalog();
}

function scheduleCatalogSearch(next?: string) {
  if (typeof next === 'string') {
    catalogFilter.value = next;
  }
  const snapshot = catalogFilter.value;
  if (catalogFilterTimer) clearTimeout(catalogFilterTimer);
  catalogFilterTimer = setTimeout(() => {
    catalogPage.current = 1;
    loadCatalog(snapshot);
  }, 400);
}

function searchCatalogNow() {
  if (catalogFilterTimer) clearTimeout(catalogFilterTimer);
  catalogPage.current = 1;
  loadCatalog(catalogFilter.value);
}

async function doImport() {
  if (!importDs.value || selectedNames.value.length === 0) {
    message.warning(`请选择数据源和要导入的${objectLabel.value}`);
    return;
  }
  saving.value = true;
  try {
    const res = await importQueryObjectsApi({
      dataSourceCode: importDs.value,
      kind: kind.value,
      names: selectedNames.value,
    });
    const ok = res.items?.length || 0;
    if (res.errors?.length) {
      message.warning(
        `导入 ${ok} 个，失败 ${res.errors.length}：${res.errors[0]}`,
      );
    } else {
      message.success(`已导入 ${ok} 个${objectLabel.value}`);
    }
    importOpen.value = false;
    await load();
  } catch {
    // toast 已由 request 拦截器处理
  } finally {
    saving.value = false;
  }
}

async function refreshRow(row: DbQueryObject) {
  await refreshQueryObjectApi(row.id);
  message.success('已从数据库刷新元数据');
  await load();
}

async function openDetail(row: DbQueryObject) {
  detail.value = await getDbQueryObjectApi(row.id);
  detailOpen.value = true;
}

function openResource(row: DbQueryObject) {
  if (row.boundResourceId) {
    router.push({
      path: '/orchestration/resources/editor',
      query: { id: row.boundResourceId },
    });
    return;
  }
  resourceTarget.value = row;
  resourceForm.code = row.objectName;
  resourceForm.name = row.displayName;
  resourceOpen.value = true;
}

async function createResource() {
  if (!resourceTarget.value) return;
  if (!resourceForm.code.trim() || !resourceForm.name.trim()) {
    message.warning('请填写资源编码与名称');
    return;
  }
  saving.value = true;
  try {
    const created = await createAppResourceFromQueryObjectApi(
      resourceTarget.value.id,
      {
        code: resourceForm.code.trim(),
        name: resourceForm.name.trim(),
      },
    );
    resourceOpen.value = false;
    message.success('已创建查询资源，发布后即可像应用资源一样查询');
    router.push({
      path: '/orchestration/resources/editor',
      query: { id: created.id },
    });
  } catch {
    // 业务错误（如编码被其它资源占用）已 toast；保留弹窗便于改编码重试
  } finally {
    saving.value = false;
  }
}

function confirmDelete(row: DbQueryObject) {
  Modal.confirm({
    title: `删除${objectLabel.value}「${row.displayName}」？`,
    content: '仅删除登记元数据，不会 DROP 数据库对象。',
    okType: 'danger',
    async onOk() {
      await deleteQueryObjectApi(row.id);
      message.success('已删除');
      await load();
    },
  });
}

function routineText(row: DbQueryObject) {
  if (row.kind === 'view') return '视图';
  if (row.routineKind === 'function') {
    return row.canSelectFrom ? '表值函数' : '函数';
  }
  return '存储过程';
}

watch(kind, () => {
  page.current = 1;
  filter.value = '';
  load();
});

onMounted(async () => {
  await loadLookup();
  await load();
});
</script>

<template>
  <Page
    :description="
      isView
        ? '从 SQL 数据源登记已有视图，创建只读查询资源，运行时与应用资源相同。'
        : '从 SQL 数据源登记已有存储过程或表值函数，用查询表单绑定参数后查询结果。'
    "
    :title="title"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Space wrap>
        <Select
          v-model:value="dataSourceCode"
          allow-clear
          placeholder="数据源"
          style="width: 180px"
          :options="
            lookup.map((x) => ({
              label: `${x.name} (${x.code})`,
              value: x.code,
            }))
          "
          @change="
            () => {
              page.current = 1;
              load();
            }
          "
        />
        <Input
          v-model:value="filter"
          allow-clear
          :placeholder="`搜索${objectLabel}名/显示名`"
          style="width: 220px"
          @press-enter="
            () => {
              page.current = 1;
              load();
            }
          "
        />
        <Button
          @click="
            () => {
              page.current = 1;
              load();
            }
          "
        >
          查询
        </Button>
      </Space>
      <AccessControl :codes="['Orchestration.QueryObjects.Create']" type="code">
        <Button type="primary" @click="openImport">
          <template #icon><IconifyIcon icon="lucide:download" /></template>
          从库导入
        </Button>
      </AccessControl>
    </div>

    <Table
      :columns="columns"
      :data-source="items"
      :loading="loading"
      :pagination="{
        current: page.current,
        pageSize: page.pageSize,
        total,
        showSizeChanger: true,
        onChange: (c: number, s: number) => {
          page.current = c;
          page.pageSize = s;
          load();
        },
      }"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'objectName'">
          <span class="font-mono text-sm">{{
            (record as DbQueryObject).objectName
          }}</span>
        </template>
        <template v-else-if="column.key === 'routine'">
          <Tag>{{ routineText(record as DbQueryObject) }}</Tag>
        </template>
        <template v-else-if="column.key === 'cols'">
          {{ (record as DbQueryObject).columns?.length || 0 }}
        </template>
        <template v-else-if="column.key === 'params'">
          {{ (record as DbQueryObject).parameters?.length || 0 }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space>
            <Button
              size="small"
              type="link"
              @click="openDetail(record as DbQueryObject)"
            >
              详情
            </Button>
            <AccessControl
              :codes="['Orchestration.QueryObjects.Update']"
              type="code"
            >
              <Button
                size="small"
                type="link"
                @click="refreshRow(record as DbQueryObject)"
              >
                刷新
              </Button>
            </AccessControl>
            <AccessControl
              :codes="[
                'Orchestration.Resources',
                'Orchestration.Resources.Create',
              ]"
              type="code"
            >
              <Button
                size="small"
                type="link"
                @click="openResource(record as DbQueryObject)"
              >
                {{
                  (record as DbQueryObject).boundResourceId
                    ? '打开设计'
                    : '创建查询资源'
                }}
              </Button>
            </AccessControl>
            <AccessControl
              :codes="['Orchestration.QueryObjects.Delete']"
              type="code"
            >
              <Button
                danger
                size="small"
                type="link"
                @click="confirmDelete(record as DbQueryObject)"
              >
                删除
              </Button>
            </AccessControl>
          </Space>
        </template>
      </template>
    </Table>

    <Modal
      v-model:open="importOpen"
      :confirm-loading="saving"
      destroy-on-close
      ok-text="导入选中"
      :title="`从库导入${objectLabel}`"
      width="720px"
      @ok="doImport"
    >
      <Form class="mt-2" layout="vertical">
        <Form.Item label="数据源" required>
          <Select
            v-model:value="importDs"
            :options="
              lookup.map((x) => ({
                label: `${x.name} (${x.code})`,
                value: x.code,
              }))
            "
            placeholder="仅 SQL 数据源"
            @change="onImportDsChange"
          />
        </Form.Item>
        <Form.Item :label="`${objectLabel}名`">
          <Input
            :value="catalogFilter"
            allow-clear
            placeholder="输入后回车搜索，或停顿后自动查询"
            @press-enter="searchCatalogNow"
            @update:value="(v) => scheduleCatalogSearch(String(v ?? ''))"
          />
        </Form.Item>
      </Form>
      <div
        v-if="selectedNames.length"
        class="mb-2 text-xs text-muted-foreground"
      >
        已选 {{ selectedNames.length }} 个（可跨页勾选）
      </div>
      <Table
        :columns="[
          { title: '对象名', dataIndex: 'objectName', key: 'objectName' },
          { title: '类型', key: 'rk', width: 120 },
          { title: '状态', key: 'st', width: 100 },
        ]"
        :data-source="catalog"
        :loading="catalogLoading"
        :pagination="{
          current: catalogPage.current,
          pageSize: catalogPage.pageSize,
          total: catalogTotal,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (t: number) => `共 ${t} 个`,
          onChange: (c: number, s: number) => {
            catalogPage.current = c;
            catalogPage.pageSize = s;
            loadCatalog(catalogFilter);
          },
        }"
        :row-selection="{
          selectedRowKeys: selectedNames,
          preserveSelectedRowKeys: true,
          onChange: (keys: (number | string)[]) => {
            selectedNames = keys.map(String);
          },
          getCheckboxProps: (row: QueryObjectCatalogItem) => ({
            disabled: row.imported,
          }),
        }"
        :scroll="{ y: 360 }"
        row-key="objectName"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'objectName'">
            <span class="font-mono text-xs">{{
              (record as QueryObjectCatalogItem).objectName
            }}</span>
          </template>
          <template v-else-if="column.key === 'rk'">
            {{
              (record as QueryObjectCatalogItem).routineKind === 'function'
                ? '函数'
                : (record as QueryObjectCatalogItem).kind === 'view'
                  ? '视图'
                  : '存储过程'
            }}
          </template>
          <template v-else-if="column.key === 'st'">
            <Tag
              :color="
                (record as QueryObjectCatalogItem).imported
                  ? 'success'
                  : 'default'
              "
            >
              {{
                (record as QueryObjectCatalogItem).imported
                  ? '已导入'
                  : '未导入'
              }}
            </Tag>
          </template>
        </template>
      </Table>
    </Modal>

    <Drawer
      v-model:open="detailOpen"
      :title="detail ? `${objectLabel} · ${detail.displayName}` : title"
      width="560"
    >
      <template v-if="detail">
        <p v-if="detail.importWarning" class="mb-3 text-amber-600">
          {{ detail.importWarning }}
        </p>
        <div class="mb-4 font-mono text-sm">
          {{ detail.dataSourceCode }}.{{ detail.objectName }}
        </div>
        <h4 v-if="detail.parameters?.length" class="mb-2 font-medium">参数</h4>
        <Table
          v-if="detail.parameters?.length"
          :columns="[
            { title: '参数', dataIndex: 'name', key: 'name' },
            { title: '方向', dataIndex: 'direction', width: 80 },
            { title: '类型', dataIndex: 'platformType', width: 100 },
          ]"
          :data-source="detail.parameters"
          :pagination="false"
          class="mb-4"
          row-key="name"
          size="small"
        />
        <h4 class="mb-2 font-medium">结果列</h4>
        <Table
          :columns="[
            { title: '列', dataIndex: 'name', key: 'name' },
            { title: '显示名', dataIndex: 'displayName' },
            { title: '类型', dataIndex: 'platformType', width: 100 },
          ]"
          :data-source="detail.columns"
          :pagination="false"
          row-key="name"
          size="small"
        />
      </template>
    </Drawer>

    <Modal
      v-model:open="resourceOpen"
      :confirm-loading="saving"
      destroy-on-close
      ok-text="创建"
      title="创建查询资源"
      @ok="createResource"
    >
      <p class="mb-3 text-sm">
        将生成只读应用资源。发布后通过 /app/编码
        查询，运行时与现有应用资源相同。
      </p>
      <Form layout="vertical">
        <Form.Item label="资源编码" required>
          <Input v-model:value="resourceForm.code" class="font-mono" />
        </Form.Item>
        <Form.Item label="名称" required>
          <Input v-model:value="resourceForm.name" />
        </Form.Item>
      </Form>
    </Modal>
  </Page>
</template>
