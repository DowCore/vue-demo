<script lang="ts" setup>
import type { NodeBinding, OutputMapItem } from './dsl-graph';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Select, Tooltip } from 'ant-design-vue';

import OutputMapFieldsEditor from './output-map-fields-editor.vue';

defineOptions({ name: 'NodeIoEditor' });

const props = withDefaults(
  defineProps<{
    modelValue: NodeBinding[];
    mode: 'inputs' | 'outputs';
    /** 可选路径提示：input.x / setLevel.level / level */
    pathHints?: string[];
    /** 当前节点引用名，用于展示出参提示 */
    nodeRef?: string;
    emptyText?: string;
  }>(),
  {
    pathHints: () => [],
    nodeRef: '',
    emptyText: '暂无参数，点击添加',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: NodeBinding[]];
  change: [];
}>();

const list = computed({
  get: () => props.modelValue || [],
  set: (value: NodeBinding[]) => {
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

function touch(next: NodeBinding[]) {
  list.value = next;
}

function addItem() {
  if (props.mode === 'inputs') {
    touch([
      ...list.value,
      {
        name: `arg${list.value.length + 1}`,
        type: 'string',
        from: { literal: '' },
        required: false,
      },
    ]);
    return;
  }
  touch([
    ...list.value,
    { name: `out${list.value.length + 1}`, type: 'string', from: 'return' },
  ]);
}

function removeAt(index: number) {
  const next = [...list.value];
  next.splice(index, 1);
  touch(next);
}

function updateAt(index: number, patch: Partial<NodeBinding>) {
  const cur = list.value[index];
  if (!cur) return;
  const next = [...list.value];
  next[index] = { ...cur, ...patch };
  touch(next);
}

function isLiteral(item: NodeBinding) {
  return !!(
    item.from &&
    typeof item.from === 'object' &&
    'literal' in item.from
  );
}

function literalValue(item: NodeBinding): unknown {
  if (!isLiteral(item)) return undefined;
  return (item.from as { literal: unknown }).literal;
}

/** 对象/数组字面量用 JSON 展示，避免 [object Object] */
function fromText(item: NodeBinding) {
  if (isLiteral(item)) {
    const lit = literalValue(item);
    if (lit === null || lit === undefined) return '';
    if (typeof lit === 'object') {
      try {
        return JSON.stringify(lit, null, 2);
      } catch {
        return '';
      }
    }
    return String(lit);
  }
  return item.from === null || item.from === undefined ? '' : String(item.from);
}

function isComplexLiteral(item: NodeBinding) {
  if (!isLiteral(item)) return false;
  const lit = literalValue(item);
  return lit !== null && typeof lit === 'object';
}

function needsJsonEditor(item: NodeBinding) {
  if (item.type === 'array' || item.type === 'object') return true;
  if (isComplexLiteral(item)) return true;
  const text = fromText(item).trim();
  return (
    (text.startsWith('[') && text.endsWith(']')) ||
    (text.startsWith('{') && text.endsWith('}'))
  );
}

function setFromMode(index: number, mode: 'literal' | 'path') {
  const item = list.value[index];
  if (!item) return;
  if (mode === 'literal') {
    const text = fromText(item);
    const parsed = tryParseJson(text);
    let emptyLiteral: unknown = '';
    if (item.type === 'array') emptyLiteral = [];
    else if (item.type === 'object') emptyLiteral = {};
    updateAt(index, {
      from: {
        literal: parsed === undefined ? text || emptyLiteral : parsed,
      },
    });
  } else {
    updateAt(index, { from: fromText(item) || 'input.amount' });
  }
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (
    !(
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
  ) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function setFromValue(index: number, text: string) {
  const item = list.value[index];
  if (!item) return;
  if (isLiteral(item)) {
    const trimmed = text.trim();
    const asJson = tryParseJson(trimmed);
    if (asJson !== undefined) {
      updateAt(index, {
        from: { literal: asJson },
        type: Array.isArray(asJson) ? 'array' : 'object',
      });
      return;
    }
    if (trimmed === 'true') {
      updateAt(index, { from: { literal: true }, type: 'boolean' });
      return;
    }
    if (trimmed === 'false') {
      updateAt(index, { from: { literal: false }, type: 'boolean' });
      return;
    }
    const n = Number(trimmed);
    if (trimmed !== '' && !Number.isNaN(n) && !trimmed.includes(' ')) {
      updateAt(index, { from: { literal: n }, type: 'number' });
      return;
    }
    updateAt(index, { from: { literal: text } });
    return;
  }
  updateAt(index, { from: text });
}

function onTypeChange(index: number, type: string) {
  const item = list.value[index];
  if (!item) return;
  const patch: Partial<NodeBinding> = { type };
  if (
    isLiteral(item) &&
    type === 'array' &&
    !Array.isArray(literalValue(item))
  ) {
    patch.from = {
      literal: [
        { id: 'A-1', qty: 1 },
        { id: 'A-2', qty: 2 },
      ],
    };
  }
  if (
    isLiteral(item) &&
    type === 'object' &&
    (typeof literalValue(item) !== 'object' ||
      Array.isArray(literalValue(item)))
  ) {
    patch.from = { literal: { id: 'demo', qty: 1 } };
  }
  if (
    props.mode === 'outputs' &&
    (type === 'array' || type === 'object') &&
    !item.map?.item?.length
  ) {
    patch.map = {
      item: [
        { name: 'id', type: 'string', from: 'id' },
        { name: 'name', type: 'string', from: 'name' },
      ],
    };
  }
  if (type !== 'array' && type !== 'object') {
    patch.map = undefined;
  }
  updateAt(index, patch);
}

function mapRows(item?: NodeBinding): OutputMapItem[] {
  return item?.map?.item || [];
}

function setMapRows(outIndex: number, rows: OutputMapItem[]) {
  updateAt(outIndex, {
    map: rows.length > 0 ? { item: rows } : undefined,
  });
}

function enableMap(outIndex: number) {
  updateAt(outIndex, {
    type: 'array',
    map: {
      item: [
        { name: 'id', type: 'string', from: 'id' },
        { name: 'name', type: 'string', from: 'name' },
      ],
    },
  });
}

function clearMap(outIndex: number) {
  updateAt(outIndex, { map: undefined });
}
</script>

<template>
  <div class="node-io-editor">
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="text-xs text-muted-foreground">
        <template v-if="mode === 'inputs'">入参映射 → nodeInput（list 用 JSON 字面量或路径）</template>
        <template v-else>
          出参 from 优先相对 resultRoot；信封可用 statusCode /
          body.xxx；短名供下游引用
        </template>
      </span>
      <Button size="small" type="primary" ghost @click="addItem">
        <template #icon><IconifyIcon icon="lucide:plus" /></template>
        添加
      </Button>
    </div>

    <div
      v-if="!list.length"
      class="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground"
    >
      {{ emptyText }}
    </div>

    <div class="space-y-2">
      <div
        v-for="(item, index) in list"
        :key="`${item.name}-${index}`"
        class="rounded-lg border border-border bg-card/60 p-2"
      >
        <div class="mb-1.5 flex items-center justify-between gap-1">
          <Input
            :value="item.name"
            size="small"
            class="min-w-0 flex-1 font-mono"
            placeholder="参数名"
            @update:value="(v) => updateAt(index, { name: String(v || '') })"
          />
          <Select
            size="small"
            class="!w-24 shrink-0"
            :value="item.type || 'string'"
            :options="typeOptions"
            @update:value="(v) => onTypeChange(index, String(v))"
          />
          <Tooltip title="删除">
            <Button danger size="small" type="text" @click="removeAt(index)">
              <template #icon>
                <IconifyIcon icon="lucide:trash-2" class="size-3.5" />
              </template>
            </Button>
          </Tooltip>
        </div>

        <template v-if="mode === 'inputs'">
          <div class="mb-1 flex gap-1">
            <Select
              size="small"
              class="w-24 shrink-0"
              :value="isLiteral(item) ? 'literal' : 'path'"
              :options="[
                { label: '路径', value: 'path' },
                { label: '字面量', value: 'literal' },
              ]"
              @update:value="
                (v) => setFromMode(index, v === 'literal' ? 'literal' : 'path')
              "
            />
            <Input
              v-if="!needsJsonEditor(item) || !isLiteral(item)"
              :value="fromText(item)"
              size="small"
              class="min-w-0 flex-1 font-mono"
              :placeholder="
                isLiteral(item) ? '字面量' : 'level / setLevel.level / input.x'
              "
              @update:value="(v) => setFromValue(index, String(v || ''))"
            />
          </div>
          <Input.TextArea
            v-if="isLiteral(item) && needsJsonEditor(item)"
            :value="fromText(item)"
            :rows="6"
            class="mb-1 font-mono text-xs"
            placeholder="JSON 数组/对象，例如 [{&quot;id&quot;:&quot;A-1&quot;,&quot;qty&quot;:1}]"
            @update:value="(v) => setFromValue(index, String(v || ''))"
          />
          <div
            v-if="
              isLiteral(item) &&
              (item.type === 'array' || isComplexLiteral(item))
            "
            class="mb-1 text-[10px] leading-relaxed text-muted-foreground"
          >
            list/object 请填合法 JSON。出参声明 type=array
            后，下游用短名引用整表；在
            <strong>End</strong> 用 map.item 做字段转换。
          </div>
          <Select
            v-if="!isLiteral(item) && hintOptions.length"
            size="small"
            class="w-full"
            allow-clear
            placeholder="从提示插入路径"
            :options="hintOptions"
            @update:value="(v) => v && updateAt(index, { from: String(v) })"
          />
        </template>

        <template v-else>
          <Input
            :value="fromText(item)"
            size="small"
            class="mb-1 font-mono"
            :placeholder="
              item.type === 'array'
                ? '相对 resultRoot 的 list 路径：lines / items / 0'
                : '相对 resultRoot：level / orderId；或信封 statusCode'
            "
            @update:value="(v) => updateAt(index, { from: String(v || '') })"
          />
          <div class="mb-1 text-[10px] leading-relaxed text-muted-foreground">
            下游：
            <code>{{ item.name || '?' }}</code>
            /
            <code>{{ nodeRef || 'ref' }}.{{ item.name || '?' }}</code>
          </div>

          <!-- array/object 出参：递归 map.item -->
          <div
            v-if="item.type === 'array' || item.type === 'object'"
            class="mt-1 space-y-1.5 rounded-md border border-dashed border-violet-300/50 bg-violet-50/30 p-1.5 dark:bg-violet-950/20"
          >
            <div class="flex items-center justify-between gap-2">
              <span
                class="text-[11px] font-medium text-violet-700 dark:text-violet-300"
              >
                {{ item.type === 'object' ? '对象' : 'list' }} 字段映射
                map.item（可嵌套）
              </span>
              <div class="flex gap-1">
                <Button
                  v-if="!mapRows(item).length"
                  size="small"
                  type="link"
                  class="!px-0"
                  @click="enableMap(index)"
                >
                  启用映射
                </Button>
                <Button
                  v-else
                  size="small"
                  type="link"
                  danger
                  class="!px-0"
                  @click="clearMap(index)"
                >
                  清除映射
                </Button>
              </div>
            </div>
            <div class="text-[10px] text-muted-foreground">
              列类型选 object/array 可继续展开子映射；也可不映射原样透传。
            </div>
            <OutputMapFieldsEditor
              v-if="mapRows(item).length"
              :model-value="mapRows(item)"
              @update:model-value="(v) => setMapRows(index, v)"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
