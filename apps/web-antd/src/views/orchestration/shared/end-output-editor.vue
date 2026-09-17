<script lang="ts" setup>
import type { OutputMapItem, OutputParameter, VisibleTo } from './dsl-graph';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { AutoComplete, Button, Checkbox, Input, Select } from 'ant-design-vue';

import OutputMapFieldsEditor from './output-map-fields-editor.vue';

defineOptions({ name: 'EndOutputEditor' });

const props = withDefaults(
  defineProps<{
    modelValue: OutputParameter[];
    pathHints?: string[];
  }>(),
  { pathHints: () => [] },
);

const emit = defineEmits<{
  'update:modelValue': [value: OutputParameter[]];
  change: [];
}>();

const list = computed({
  get: () => props.modelValue || [],
  set: (value: OutputParameter[]) => {
    emit('update:modelValue', value);
    emit('change');
  },
});

const hintOptions = computed(() =>
  (props.pathHints || []).map((p) => ({ label: p, value: p })),
);

const typeOptions = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
  { label: 'object', value: 'object' },
  { label: 'array', value: 'array' },
];

const visibleModes = [
  { label: '全部可见', value: 'all' },
  { label: '按角色', value: 'roles' },
  { label: '按权限', value: 'permissions' },
  { label: '永不返回', value: 'none' },
];

const headerModeOptions = [
  { label: '取首行 first', value: 'first' },
  { label: '取末行 last', value: 'last' },
  { label: '组内 count', value: 'count' },
  { label: '组内 sum', value: 'sum' },
  { label: '组内 avg', value: 'avg' },
  { label: '组内 min', value: 'min' },
  { label: '组内 max', value: 'max' },
];

const aggregateOps = [
  { label: '无聚合', value: '' },
  { label: 'count', value: 'count' },
  { label: 'sum', value: 'sum' },
  { label: 'avg', value: 'avg' },
  { label: 'min', value: 'min' },
  { label: 'max', value: 'max' },
  { label: 'first', value: 'first' },
  { label: 'last', value: 'last' },
];

type GroupHeader = NonNullable<
  NonNullable<OutputParameter['group']>['header']
>[number];

function touch(next: OutputParameter[]) {
  list.value = next;
}

function addItem() {
  touch([
    ...list.value,
    {
      name: `field${list.value.length + 1}`,
      type: 'string',
      from: '',
      visibleTo: { mode: 'all' },
      sensitive: false,
    },
  ]);
}

function addArraySample() {
  touch([
    ...list.value,
    {
      name: 'lineItems',
      type: 'array',
      from: 'lineItems',
      visibleTo: { mode: 'all' },
      map: {
        item: [
          { name: 'sku', type: 'string', from: 'id' },
          { name: 'quantity', type: 'number', from: 'qty' },
          { name: 'label', type: 'string', from: { template: 'Line {{id}}' } },
        ],
      },
    },
    {
      name: 'lineCount',
      type: 'number',
      from: 'lineItems.count',
      visibleTo: { mode: 'all' },
    },
  ]);
}

function addGroupSample() {
  touch([
    ...list.value,
    {
      name: 'orders',
      type: 'array',
      from: 'rows',
      visibleTo: { mode: 'all' },
      group: {
        by: ['orderId'],
        header: [
          { name: 'orderId', from: 'orderId', take: 'first' },
          { name: 'customerName', from: 'customerName', take: 'first' },
          { name: 'orderDate', from: 'orderDate', take: 'first' },
          {
            name: 'totalAmount',
            from: 'amount',
            aggregate: { op: 'sum', path: 'amount' },
          },
        ],
        children: {
          name: 'items',
          map: {
            item: [
              { name: 'code', type: 'string', from: 'item' },
              { name: 'qty', type: 'number', from: 'qty' },
            ],
          },
        },
      },
    },
  ]);
}

function enableGroup(index: number) {
  const cur = list.value[index];
  if (!cur) return;
  const existingMap = cur.map?.item?.length
    ? { item: [...cur.map.item] }
    : {
        item: [{ name: 'code', type: 'string', from: 'item' }],
      };
  updateAt(index, {
    type: 'array',
    map: undefined,
    aggregate: undefined,
    group: {
      by: ['orderId'],
      header: [
        { name: 'orderId', from: 'orderId', take: 'first' },
        { name: 'customerName', from: 'customerName', take: 'first' },
      ],
      children: {
        name: 'items',
        map: existingMap,
      },
    },
  });
}

/** 从 group 切回 map.item */
function switchToMap(index: number) {
  const cur = list.value[index];
  if (!cur) return;
  const fromChildren = cur.group?.children?.map?.item;
  let restoredMap: OutputParameter['map'];
  if (cur.map?.item?.length) {
    restoredMap = cur.map;
  } else if (fromChildren?.length) {
    restoredMap = { item: [...fromChildren] };
  } else {
    restoredMap = {
      item: [
        { name: 'id', type: 'string', from: 'id' },
        { name: 'name', type: 'string', from: 'name' },
      ],
    };
  }
  const next = [...list.value];
  next[index] = {
    name: cur.name,
    type: 'array',
    from: cur.from,
    visibleTo: cur.visibleTo,
    sensitive: cur.sensitive,
    description: cur.description,
    wrap: cur.wrap,
    map: restoredMap,
  };
  touch(next);
}

function groupByText(item: OutputParameter) {
  const by = item.group?.by;
  if (Array.isArray(by)) return by.join(',');
  return by ? String(by) : '';
}

function setGroupBy(index: number, text: string) {
  const cur = list.value[index]?.group;
  if (!cur) return;
  const keys = text
    .split(/[,，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  updateAt(index, {
    group: { ...cur, by: keys.length <= 1 ? keys[0] || '' : keys },
  });
}

function patchGroup(
  index: number,
  patch: Partial<NonNullable<OutputParameter['group']>>,
) {
  const cur = list.value[index]?.group;
  if (!cur) return;
  updateAt(index, { group: { ...cur, ...patch } });
}

function headerRows(item?: OutputParameter): GroupHeader[] {
  return item?.group?.header || [];
}

function setHeaderRows(index: number, rows: GroupHeader[]) {
  patchGroup(index, { header: rows });
}

function addHeaderRow(index: number) {
  const rows = [...headerRows(list.value[index])];
  rows.push({
    name: `field${rows.length + 1}`,
    from: '',
    take: 'first',
  });
  setHeaderRows(index, rows);
}

function removeHeaderRow(outIndex: number, rowIndex: number) {
  const rows = [...headerRows(list.value[outIndex])];
  rows.splice(rowIndex, 1);
  setHeaderRows(outIndex, rows);
}

function patchHeaderRow(
  outIndex: number,
  rowIndex: number,
  patch: Partial<GroupHeader>,
) {
  const rows = [...headerRows(list.value[outIndex])];
  const cur = rows[rowIndex];
  if (!cur) return;
  rows[rowIndex] = { ...cur, ...patch };
  setHeaderRows(outIndex, rows);
}

function headerMode(row: GroupHeader): string {
  if (row.aggregate?.op) return row.aggregate.op;
  return row.take === 'last' ? 'last' : 'first';
}

function setHeaderMode(outIndex: number, rowIndex: number, mode: string) {
  const rows = headerRows(list.value[outIndex]);
  const row = rows[rowIndex];
  if (!row) return;
  if (mode === 'first' || mode === 'last') {
    patchHeaderRow(outIndex, rowIndex, {
      take: mode,
      aggregate: undefined,
      from: row.from || row.name,
    });
    return;
  }
  patchHeaderRow(outIndex, rowIndex, {
    take: undefined,
    aggregate: {
      op: mode,
      path: row.aggregate?.path || row.from || row.name || '',
    },
  });
}

function headerFromText(row: GroupHeader): string {
  if (row.aggregate?.op) return row.aggregate.path || row.from || '';
  return row.from || '';
}

function setHeaderFromText(outIndex: number, rowIndex: number, text: string) {
  const rows = headerRows(list.value[outIndex]);
  const row = rows[rowIndex];
  if (!row) return;
  if (row.aggregate?.op) {
    patchHeaderRow(outIndex, rowIndex, {
      from: text,
      aggregate: { op: row.aggregate.op, path: text },
    });
    return;
  }
  patchHeaderRow(outIndex, rowIndex, { from: text });
}

function childrenName(item?: OutputParameter): string {
  return item?.group?.children?.name || 'items';
}

function setChildrenName(index: number, name: string) {
  const cur = list.value[index]?.group;
  if (!cur) return;
  patchGroup(index, {
    children: {
      ...cur.children,
      name: name || 'items',
      map: cur.children?.map || { item: [] },
    },
  });
}

function childrenMapItems(item?: OutputParameter): OutputMapItem[] {
  return item?.group?.children?.map?.item || [];
}

function setChildrenMapItems(index: number, items: OutputMapItem[]) {
  const cur = list.value[index]?.group;
  if (!cur) return;
  patchGroup(index, {
    children: {
      name: cur.children?.name || 'items',
      map: items.length > 0 ? { item: items } : undefined,
      visibleTo: cur.children?.visibleTo,
    },
  });
}

function removeAt(index: number) {
  const next = [...list.value];
  next.splice(index, 1);
  touch(next);
}

function updateAt(index: number, patch: Partial<OutputParameter>) {
  const cur = list.value[index];
  if (!cur) return;
  const next = [...list.value];
  next[index] = { ...cur, ...patch };
  touch(next);
}

function setVisibleMode(index: number, mode: VisibleTo['mode']) {
  const cur = list.value[index]?.visibleTo || { mode: 'all' };
  updateAt(index, { visibleTo: { ...cur, mode } });
}

function setRoles(index: number, text: string) {
  const cur = list.value[index]?.visibleTo || { mode: 'roles' };
  updateAt(index, {
    visibleTo: {
      ...cur,
      mode: 'roles',
      roleNames: text
        .split(/[,，\s]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    },
  });
}

function setPermissions(index: number, text: string) {
  const cur = list.value[index]?.visibleTo || { mode: 'permissions' };
  updateAt(index, {
    visibleTo: {
      ...cur,
      mode: 'permissions',
      permissions: text
        .split(/[,，\s]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    },
  });
}

function setAggregate(index: number, op: string) {
  if (!op) {
    updateAt(index, { aggregate: undefined });
    return;
  }
  const cur = list.value[index]?.aggregate;
  updateAt(index, { aggregate: { op, path: cur?.path || '' } });
}

function onTypeChange(index: number, type: string) {
  const cur = list.value[index];
  if (!cur) return;
  if ((type === 'array' || type === 'object') && !cur.map?.item?.length) {
    updateAt(index, {
      type,
      map: {
        item: [
          { name: 'id', type: 'string', from: 'id' },
          { name: 'name', type: 'string', from: 'name' },
        ],
      },
      aggregate: undefined,
    });
    return;
  }
  if (type !== 'array' && type !== 'object') {
    updateAt(index, {
      type,
      map: undefined,
      aggregate: undefined,
      promote: undefined,
    });
    return;
  }
  updateAt(index, { type });
}

function setPromote(index: number, promote: boolean) {
  if (!promote) {
    updateAt(index, { promote: undefined });
    return;
  }
  // 开启根级返回时清掉同列表其它项的 promote，并提示只留一项
  const next = list.value.map((row, i) => ({
    ...row,
    promote: i === index ? true : undefined,
  }));
  list.value = next;
}

function mapItems(item?: OutputParameter): OutputMapItem[] {
  return item?.map?.item || [];
}

function setMapItems(index: number, items: OutputMapItem[]) {
  updateAt(index, {
    map: items.length > 0 ? { item: items } : undefined,
  });
}
</script>

<template>
  <div class="end-output-editor">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span class="text-xs text-muted-foreground">
        最终 API data（默认对象；勾选「data 直接为此值」可得到 data=[]）
      </span>
      <div class="flex gap-1">
        <Button size="small" @click="addArraySample">+ list 示例</Button>
        <Button size="small" @click="addGroupSample">+ group 示例</Button>
        <Button size="small" type="primary" ghost @click="addItem">
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          添加字段
        </Button>
      </div>
    </div>

    <div
      v-if="!list.length"
      class="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
    >
      暂无最终出参。可点「list 示例」或「group 示例」。
    </div>

    <div class="space-y-2">
      <div
        v-for="(item, index) in list"
        :key="`${item.name}-${index}`"
        class="space-y-1.5 rounded-lg border border-border bg-card/60 p-2"
      >
        <div class="flex items-center gap-1">
          <Input
            :value="item.name"
            size="small"
            class="flex-1 font-mono"
            placeholder="字段名"
            @update:value="(v) => updateAt(index, { name: String(v || '') })"
          />
          <Select
            :value="item.type || 'string'"
            size="small"
            class="!w-24"
            :options="typeOptions"
            @update:value="(v) => onTypeChange(index, String(v))"
          />
          <Button size="small" type="text" danger @click="removeAt(index)">
            <IconifyIcon icon="lucide:trash-2" />
          </Button>
        </div>

        <div class="space-y-1">
          <div class="text-[10px] text-muted-foreground">
            来源路径（可下拉也可手写，如 <code>rows.0.order</code> /
            <code>lineItems</code>）
          </div>
          <AutoComplete
            :value="item.from"
            size="small"
            class="w-full"
            :options="hintOptions"
            allow-clear
            :placeholder="
              item.type === 'array'
                ? '整表：lineItems / rows'
                : '短名或路径：level / rows.0.order'
            "
            @update:value="(v) => updateAt(index, { from: String(v || '') })"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <Select
            :value="item.visibleTo?.mode || 'all'"
            size="small"
            class="!w-28"
            :options="visibleModes"
            @update:value="(v) => setVisibleMode(index, v as VisibleTo['mode'])"
          />
          <Checkbox
            :checked="!!item.sensitive"
            @update:checked="(v) => updateAt(index, { sensitive: !!v })"
          >
            敏感
          </Checkbox>
          <Checkbox
            v-if="item.type === 'array' || item.type === 'object'"
            :checked="!!item.promote"
            @update:checked="(v) => setPromote(index, !!v)"
          >
            data 直接为此值
          </Checkbox>
          <Select
            :value="item.aggregate?.op || ''"
            size="small"
            class="!w-28"
            :options="aggregateOps"
            @update:value="(v) => setAggregate(index, String(v || ''))"
          />
          <Input
            v-if="item.aggregate?.op && item.aggregate.op !== 'count'"
            :value="item.aggregate?.path || ''"
            size="small"
            class="!w-28 font-mono"
            placeholder="sum 字段 path"
            @update:value="
              (v) =>
                updateAt(index, {
                  aggregate: { op: item.aggregate!.op, path: String(v || '') },
                })
            "
          />
        </div>

        <Input
          v-if="item.visibleTo?.mode === 'roles'"
          size="small"
          :value="(item.visibleTo.roleNames || []).join(',')"
          placeholder="角色名，逗号分隔"
          @update:value="(v) => setRoles(index, String(v || ''))"
        />
        <Input
          v-if="item.visibleTo?.mode === 'permissions'"
          size="small"
          :value="(item.visibleTo.permissions || []).join(',')"
          placeholder="权限码，逗号分隔"
          @update:value="(v) => setPermissions(index, String(v || ''))"
        />

        <!-- list / object 字段转换：递归 map.item（可无限嵌套） -->
        <div
          v-if="
            item.promote && (item.type === 'array' || item.type === 'object')
          "
          class="rounded border border-dashed border-emerald-400/60 bg-emerald-50/40 px-2 py-1.5 text-[10px] leading-relaxed text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200"
        >
          勾选后 API 为
          <code>{ "success": true, "data":
            {{ item.type === 'array' ? '[...]' : '{...}' }} }</code>
          ，不再包成
          <code>data.{{ item.name || 'field' }}</code>。 <strong>finalOutputs 只能保留这一项</strong>。
        </div>

        <div
          v-if="
            (item.type === 'array' || item.type === 'object') &&
            !item.aggregate?.op &&
            !item.group
          "
          class="mt-1 rounded-md border border-dashed border-violet-300/60 bg-violet-50/40 p-2 dark:bg-violet-950/20"
        >
          <div class="mb-1.5 flex items-center justify-between gap-2">
            <div
              class="text-[11px] font-medium text-violet-700 dark:text-violet-300"
            >
              {{
                item.type === 'object'
                  ? '对象字段映射 map.item'
                  : '元素字段映射 map.item'
              }}
              （可嵌套）
            </div>
            <Button
              v-if="item.type === 'array'"
              size="small"
              type="link"
              class="!px-0"
              @click="enableGroup(index)"
            >
              改为分组
            </Button>
          </div>
          <div class="mb-1.5 text-[10px] leading-relaxed text-muted-foreground">
            字段类型选
            <code>object</code> /
            <code>array</code>
            后可继续展开子 map，支持多层。路径相对当前层；模板
            <code>&#123;&#123;id&#125;&#125;</code>；全局 <code>input.x</code>。
          </div>
          <OutputMapFieldsEditor
            :model-value="mapItems(item)"
            :from-placeholder="
              item.type === 'object'
                ? '相对对象：id / name'
                : '相对行：id / qty'
            "
            @update:model-value="(v) => setMapItems(index, v)"
          />
        </div>

        <!-- 分组 group：多主字段 + 子表（可视化配置，无需手写 JSON） -->
        <div
          v-if="item.group"
          class="mt-1 space-y-2 rounded-md border border-dashed border-amber-400/50 bg-amber-50/30 p-2 dark:bg-amber-950/20"
        >
          <div class="flex items-center justify-between gap-2">
            <div
              class="text-[11px] font-medium text-amber-800 dark:text-amber-200"
            >
              分组 group（主表多字段 + 子表明细）
            </div>
            <Button
              size="small"
              type="link"
              class="!px-0"
              @click="switchToMap(index)"
            >
              改回 map
            </Button>
          </div>

          <div class="space-y-1">
            <div class="text-[10px] text-muted-foreground">
              分组键 by（多键用逗号：orderId,warehouseId）
            </div>
            <Input
              size="small"
              class="font-mono"
              :value="groupByText(item)"
              placeholder="orderId"
              @update:value="(v) => setGroupBy(index, String(v || ''))"
            />
            <Checkbox
              :checked="!!item.group?.promote"
              @update:checked="(v) => patchGroup(index, { promote: !!v })"
            >
              提升为顶层
            </Checkbox>
            <div class="text-[10px] leading-relaxed text-muted-foreground">
              默认：
              <code>data.orders = [&#123; orderId, items &#125;]</code>。勾选后（须恰好 1 组）： <code>data.orderId</code> /
              <code>data.items</code> 直接出现在根级，不再包一层字段名。
            </div>
          </div>

          <!-- header：主属性 -->
          <div
            class="space-y-1.5 rounded border border-border/70 bg-background/70 p-1.5"
          >
            <div class="text-[11px] font-medium">主属性 header</div>
            <div class="text-[10px] text-muted-foreground">
              同组取 first/last，或组内 sum/count。金额类选「组内 sum」。
            </div>
            <div
              v-if="!headerRows(item).length"
              class="rounded border border-dashed px-2 py-2 text-center text-[10px] text-muted-foreground"
            >
              暂无主字段。点下方「添加主字段」添加 orderId、customerName 等。
            </div>
            <div class="space-y-1.5">
              <div
                v-for="(row, rowIndex) in headerRows(item)"
                :key="`h-${rowIndex}`"
                class="rounded border border-border bg-card/80 p-1.5 space-y-1"
              >
                <div class="flex gap-1">
                  <Input
                    :value="row.name"
                    size="small"
                    class="flex-1 font-mono"
                    placeholder="输出名"
                    @update:value="
                      (v) =>
                        patchHeaderRow(index, rowIndex, {
                          name: String(v || ''),
                        })
                    "
                  />
                  <Select
                    :value="headerMode(row)"
                    size="small"
                    class="!w-32 shrink-0"
                    :options="headerModeOptions"
                    @update:value="
                      (v) => setHeaderMode(index, rowIndex, String(v))
                    "
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    @click="removeHeaderRow(index, rowIndex)"
                  >
                    <IconifyIcon icon="lucide:trash-2" />
                  </Button>
                </div>
                <Input
                  :value="headerFromText(row)"
                  size="small"
                  class="font-mono"
                  :placeholder="
                    row.aggregate?.op
                      ? '聚合字段：amount'
                      : '行内路径：customerName'
                  "
                  @update:value="
                    (v) => setHeaderFromText(index, rowIndex, String(v || ''))
                  "
                />
              </div>
            </div>
            <Button size="small" block @click="addHeaderRow(index)">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              添加主字段
            </Button>
          </div>

          <!-- children：明细（递归 map） -->
          <div
            class="space-y-1.5 rounded border border-border/70 bg-background/70 p-1.5"
          >
            <div class="text-[11px] font-medium">子表 children</div>
            <div class="flex items-center gap-2">
              <span class="shrink-0 text-[10px] text-muted-foreground">子表名</span>
              <Input
                size="small"
                class="font-mono"
                :value="childrenName(item)"
                placeholder="items"
                @update:value="(v) => setChildrenName(index, String(v || ''))"
              />
            </div>
            <div class="text-[10px] text-muted-foreground">
              明细列可嵌套 object/array 继续展开 map。
            </div>
            <OutputMapFieldsEditor
              :model-value="childrenMapItems(item)"
              from-placeholder="相对明细行：sku / qty"
              @update:model-value="(v) => setChildrenMapItems(index, v)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
