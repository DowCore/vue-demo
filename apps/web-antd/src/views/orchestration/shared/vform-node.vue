<script lang="ts" setup>
/**
 * VForm3 节点渲染（设计态 / 运行态共用）
 * 容器：grid-col、table-cell、tab、card、sub-form
 * 字段：开源 basicFields + advancedFields
 */
import type { VFormWidget } from './vform-model';

import { computed, defineAsyncComponent, onMounted, ref } from 'vue';

import {
  Button,
  Cascader,
  Checkbox,
  DatePicker,
  Divider,
  Input,
  InputNumber,
  Radio,
  Rate,
  Select,
  Slider,
  Switch,
  Tabs,
  TimePicker,
  Upload,
} from 'ant-design-vue';

import { runWidgetEvent, validationPattern } from './vform-events';

defineOptions({ name: 'VFormNode' });

const props = defineProps<{
  widget: VFormWidget;
  model: Record<string, unknown>;
  designer?: boolean;
  selectedId?: string;
  labelWidth?: number;
  labelPosition?: 'left' | 'top';
}>();

const emit = defineEmits<{
  select: [id: string];
  'update:model': [value: Record<string, unknown>];
  command: [cmd: 'copy' | 'delete' | 'down' | 'up'];
  dropWidget: [
    payload: {
      targetId: string;
      type: string;
      columns?: number;
      moveId: string;
    },
  ];
}>();

const VFormRepeat = defineAsyncComponent(() => import('./vform-repeat.vue'));

const overId = ref('');
const errorText = ref('');
const opt = computed(() => props.widget.options || {});
const name = computed(() => String(opt.value.name || props.widget.id));

function eventCtx(value?: unknown, oldValue?: unknown) {
  return { value, oldValue, formModel: props.model };
}

function checkValidation(value: unknown) {
  const pattern = validationPattern(opt.value.validation);
  if (!pattern || value === '' || value === undefined || value === null) {
    errorText.value = '';
    return;
  }
  errorText.value = new RegExp(pattern).test(String(value))
    ? ''
    : String(opt.value.validationHint || '格式不正确');
  if (!props.designer) runWidgetEvent(opt.value.onValidate, eventCtx(value));
}

function patch(value: unknown) {
  const oldValue = props.model[name.value];
  emit('update:model', { ...props.model, [name.value]: value });
  checkValidation(value);
  if (!props.designer)
    runWidgetEvent(opt.value.onChange, eventCtx(value, oldValue));
}

function onFieldFocus() {
  if (!props.designer)
    runWidgetEvent(opt.value.onFocus, eventCtx(props.model[name.value]));
}

function onFieldBlur() {
  checkValidation(props.model[name.value]);
  if (!props.designer)
    runWidgetEvent(opt.value.onBlur, eventCtx(props.model[name.value]));
}

function onButtonClick(event: MouseEvent) {
  if (props.designer) return;
  event.stopPropagation();
  runWidgetEvent(opt.value.onClick, eventCtx());
}

onMounted(() => {
  if (props.designer) return;
  runWidgetEvent(opt.value.onCreated, eventCtx(props.model[name.value]));
  runWidgetEvent(opt.value.onMounted, eventCtx(props.model[name.value]));
});

function onSelect(e: MouseEvent) {
  if (!props.designer) return;
  e.stopPropagation();
  emit('select', props.widget.id);
}

function onMoveStart(event: DragEvent) {
  event.stopPropagation();
  event.dataTransfer?.setData(
    'text/plain',
    JSON.stringify({ type: '', columns: 0, moveId: props.widget.id }),
  );
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function readDragPayload(event: DragEvent) {
  const plain = event.dataTransfer?.getData('text/plain') || '';
  if (plain.startsWith('{')) {
    try {
      const data = JSON.parse(plain) as {
        type?: string;
        columns?: number;
        moveId?: string;
      };
      return {
        type: data.type || '',
        columns: data.columns || undefined,
        moveId: data.moveId || '',
      };
    } catch {
      /* ignore */
    }
  }
  return {
    type: event.dataTransfer?.getData('text/vform-type') || '',
    columns:
      Number(event.dataTransfer?.getData('text/vform-cols') || '') || undefined,
    moveId: event.dataTransfer?.getData('text/vform-move') || '',
  };
}

function onContainerDrop(event: DragEvent, targetId: string) {
  if (!props.designer) return;
  event.preventDefault();
  event.stopPropagation();
  const data = readDragPayload(event);
  emit('dropWidget', { targetId, ...data });
}

const selected = computed(
  () => props.designer && props.selectedId === props.widget.id,
);
const labelAlignClass = computed(() => {
  if (opt.value.labelAlign === 'label-center-align') return 'text-center';
  if (opt.value.labelAlign === 'label-right-align') return 'text-right';
  return 'text-left';
});
const hidden = computed(() => !!opt.value.hidden && !props.designer);

function labelStyle() {
  const wrap = opt.value.labelWrap ? 'normal' : 'nowrap';
  if (props.labelPosition === 'top') return { whiteSpace: wrap };
  return {
    width: `${opt.value.labelWidth || props.labelWidth || 80}px`,
    whiteSpace: wrap,
  };
}
</script>

<template>
  <div
    v-if="!hidden"
    class="vf-node"
    :class="[
      { 'is-selected': selected, 'is-designer': designer },
      opt.customClass,
    ]"
    @click="onSelect"
  >
    <div v-if="selected && !widget.internal" class="vf-actions" @click.stop>
      <span
        class="vf-drag"
        draggable="true"
        title="拖动"
        @dragstart="onMoveStart"
        >⠿</span>
      <button type="button" @click="emit('command', 'up')">上移</button>
      <button type="button" @click="emit('command', 'down')">下移</button>
      <button type="button" @click="emit('command', 'copy')">复制</button>
      <button type="button" @click="emit('command', 'delete')">删除</button>
    </div>
    <!-- 栅格 -->
    <div
      v-if="widget.type === 'grid'"
      class="vf-grid flex flex-wrap"
      :style="{ gap: `${opt.gutter || 12}px` }"
      @dragover.prevent
      @drop="
        onContainerDrop($event, overId || widget.cols?.[0]?.id || widget.id)
      "
    >
      <div
        v-for="col in widget.cols || []"
        :key="col.id"
        class="vf-col"
        :class="{
          'is-selected': designer && selectedId === col.id,
          'is-over': overId === col.id,
        }"
        :style="{
          width: `calc(${((col.options?.span || 12) / 24) * 100}% - ${opt.gutter || 12}px)`,
        }"
        @click="
          designer
            ? ($event.stopPropagation(), emit('select', col.id))
            : undefined
        "
        @dragover.prevent.stop="overId = col.id"
        @dragleave="overId = ''"
        @drop="onContainerDrop($event, col.id)"
      >
        <VFormNode
          v-for="child in col.widgetList || []"
          :key="child.id"
          :designer="designer"
          :label-position="labelPosition"
          :label-width="labelWidth"
          :model="model"
          :selected-id="selectedId"
          :widget="child"
          @command="(cmd) => emit('command', cmd)"
          @drop-widget="(payload) => emit('dropWidget', payload)"
          @select="(id) => emit('select', id)"
          @update:model="(v) => emit('update:model', v)"
        />
        <div
          v-if="designer && !(col.widgetList || []).length"
          class="vf-drop-hint"
        >
          栅格列
        </div>
      </div>
    </div>

    <!-- 表格布局 -->
    <table v-else-if="widget.type === 'table'" class="vf-table">
      <tr v-for="row in widget.rows || []" :key="row.id">
        <td
          v-for="cell in row.cols"
          :key="cell.id"
          class="vf-cell"
          :class="{
            'is-selected': designer && selectedId === cell.id,
            'is-over': overId === cell.id,
          }"
          @click="
            designer
              ? ($event.stopPropagation(), emit('select', cell.id))
              : undefined
          "
          @dragover.prevent.stop="overId = cell.id"
          @dragleave="overId = ''"
          @drop="onContainerDrop($event, cell.id)"
        >
          <VFormNode
            v-for="child in cell.widgetList || []"
            :key="child.id"
            :designer="designer"
            :label-position="labelPosition"
            :label-width="labelWidth"
            :model="model"
            :selected-id="selectedId"
            :widget="child"
            @command="(cmd) => emit('command', cmd)"
            @drop-widget="(payload) => emit('dropWidget', payload)"
            @select="(id) => emit('select', id)"
            @update:model="(v) => emit('update:model', v)"
          />
        </td>
      </tr>
    </table>

    <!-- 标签页 -->
    <Tabs v-else-if="widget.type === 'tab'" size="small" @click.stop>
      <Tabs.TabPane
        v-for="pane in widget.tabs || []"
        :key="pane.id"
        :tab="pane.options?.label || '标签'"
      >
        <div
          :class="{
            'is-selected': designer && selectedId === pane.id,
            'is-over': overId === pane.id,
          }"
          @click="
            designer
              ? ($event.stopPropagation(), emit('select', pane.id))
              : undefined
          "
          @dragover.prevent.stop="overId = pane.id"
          @dragleave="overId = ''"
          @drop="onContainerDrop($event, pane.id)"
        >
          <VFormNode
            v-for="child in pane.widgetList || []"
            :key="child.id"
            :designer="designer"
            :label-position="labelPosition"
            :label-width="labelWidth"
            :model="model"
            :selected-id="selectedId"
            :widget="child"
            @command="(cmd) => emit('command', cmd)"
            @drop-widget="(payload) => emit('dropWidget', payload)"
            @select="(id) => emit('select', id)"
            @update:model="(v) => emit('update:model', v)"
          />
          <div
            v-if="designer && !(pane.widgetList || []).length"
            class="vf-drop-hint"
          >
            标签页内容
          </div>
        </div>
      </Tabs.TabPane>
    </Tabs>

    <!-- 子表单 / 树：运行态按行增删，数据是数组 -->
    <VFormRepeat
      v-else-if="widget.type === 'sub-form' || widget.type === 'tree'"
      :designer="designer"
      :label-position="labelPosition"
      :label-width="labelWidth"
      :model="model"
      :selected-id="selectedId"
      :widget="widget"
      @command="(cmd) => emit('command', cmd)"
      @drop-widget="(payload) => emit('dropWidget', payload)"
      @select="(id) => emit('select', id)"
      @update:model="(v) => emit('update:model', v)"
    />

    <!-- 卡片 -->
    <div
      v-else-if="widget.type === 'card'"
      class="vf-card"
      :class="{ 'is-over': overId === widget.id }"
      @dragover.prevent.stop="overId = widget.id"
      @dragleave="overId = ''"
      @drop="onContainerDrop($event, widget.id)"
    >
      <div class="mb-2 text-sm font-medium">{{ opt.label || widget.type }}</div>
      <VFormNode
        v-for="child in widget.widgetList || []"
        :key="child.id"
        :designer="designer"
        :label-position="labelPosition"
        :label-width="labelWidth"
        :model="model"
        :selected-id="selectedId"
        :widget="child"
        @command="(cmd) => emit('command', cmd)"
        @drop-widget="(payload) => emit('dropWidget', payload)"
        @select="(id) => emit('select', id)"
        @update:model="(v) => emit('update:model', v)"
      />
      <div
        v-if="designer && !(widget.widgetList || []).length"
        class="vf-drop-hint"
      >
        拖入或点击左侧组件放入
      </div>
    </div>

    <!-- 非表单项 -->
    <div
      v-else-if="widget.type === 'static-text'"
      class="py-1 text-sm"
      :style="{ textAlign: opt.textAlign, fontSize: opt.fontSize }"
    >
      {{ opt.textContent }}
    </div>
    <div
      v-else-if="widget.type === 'html-text'"
      class="py-1 text-sm"
      v-html="
        String(opt.htmlContent || '').replace(
          /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
          '',
        )
      "
    ></div>
    <Divider v-else-if="widget.type === 'divider'">{{ opt.label }}</Divider>
    <Button
      v-else-if="widget.type === 'button'"
      :disabled="opt.disabled"
      :type="opt.type || 'default'"
      @click="onButtonClick"
    >
      {{ opt.label || '按钮' }}
    </Button>

    <!-- 表单项 -->
    <div
      v-else-if="widget.formItemFlag"
      class="vf-item"
      :class="labelPosition === 'top' ? 'flex-col' : 'flex items-start gap-2'"
    >
      <label
        v-if="!opt.labelHidden"
        class="shrink-0 pt-1 text-sm"
        :class="labelAlignClass"
        :style="labelStyle()"
      >
        <span v-if="opt.required" class="text-red-500">*</span>
        {{ opt.label }}
      </label>
      <div class="min-w-0 flex-1">
        <Input
          v-if="widget.type === 'input'"
          :disabled="opt.disabled"
          :placeholder="opt.placeholder"
          :readonly="opt.readonly"
          :type="opt.type === 'password' ? 'password' : 'text'"
          :value="String(model[name] ?? opt.defaultValue ?? '')"
          allow-clear
          @blur="onFieldBlur"
          @focus="onFieldFocus"
          @update:value="patch"
        />
        <Input.TextArea
          v-else-if="
            widget.type === 'textarea' || widget.type === 'rich-editor'
          "
          :disabled="opt.disabled"
          :placeholder="opt.placeholder"
          :readonly="opt.readonly"
          :rows="opt.rows || (widget.type === 'rich-editor' ? 6 : 3)"
          :value="String(model[name] ?? '')"
          @blur="onFieldBlur"
          @focus="onFieldFocus"
          @update:value="patch"
        />
        <InputNumber
          v-else-if="widget.type === 'number'"
          class="w-full"
          :disabled="opt.disabled"
          :max="opt.max"
          :min="opt.min"
          :precision="opt.precision"
          :step="opt.step"
          :value="model[name] == null ? opt.defaultValue : Number(model[name])"
          @update:value="patch"
        />
        <Radio.Group
          v-else-if="widget.type === 'radio'"
          :disabled="opt.disabled"
          :value="model[name] ?? opt.defaultValue"
          @update:value="patch"
        >
          <Radio
            v-for="item in opt.optionItems || []"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </Radio>
        </Radio.Group>
        <Checkbox.Group
          v-else-if="widget.type === 'checkbox'"
          :disabled="opt.disabled"
          :options="
            (opt.optionItems || []).map((i: any) => ({
              label: i.label,
              value: i.value,
            }))
          "
          :value="(model[name] as any) || []"
          @update:value="patch"
        />
        <Select
          v-else-if="widget.type === 'select'"
          class="w-full"
          :allow-clear="opt.clearable !== false"
          :disabled="opt.disabled"
          :mode="opt.multiple ? 'multiple' : undefined"
          :options="
            (opt.optionItems || []).map((i: any) => ({
              label: i.label,
              value: i.value,
            }))
          "
          :placeholder="opt.placeholder"
          show-search
          :value="(model[name] as any) ?? undefined"
          @update:value="patch"
        />
        <TimePicker
          v-else-if="widget.type === 'time'"
          class="w-full"
          :disabled="opt.disabled"
          value-format="HH:mm:ss"
          @update:value="patch"
        />
        <TimePicker.RangePicker
          v-else-if="widget.type === 'time-range'"
          class="w-full"
          :disabled="opt.disabled"
          value-format="HH:mm:ss"
          @update:value="patch"
        />
        <DatePicker
          v-else-if="widget.type === 'date'"
          class="w-full"
          :disabled="opt.disabled"
          value-format="YYYY-MM-DD"
          @update:value="patch"
        />
        <DatePicker.RangePicker
          v-else-if="widget.type === 'date-range'"
          class="w-full"
          :disabled="opt.disabled"
          value-format="YYYY-MM-DD"
          @update:value="patch"
        />
        <Switch
          v-else-if="widget.type === 'switch'"
          :checked="!!(model[name] ?? opt.defaultValue)"
          :checked-children="opt.activeText"
          :disabled="opt.disabled"
          :un-checked-children="opt.inactiveText"
          @update:checked="patch"
        />
        <Rate
          v-else-if="widget.type === 'rate'"
          :allow-half="!!opt.allowHalf"
          :count="opt.max || 5"
          :disabled="opt.disabled"
          :value="Number(model[name] ?? opt.defaultValue ?? 0)"
          @update:value="patch"
        />
        <input
          v-else-if="widget.type === 'color'"
          class="h-8 w-16 cursor-pointer border border-border bg-transparent"
          type="color"
          :disabled="opt.disabled"
          :value="String(model[name] || opt.defaultValue || '#1677ff')"
          @input="patch(($event.target as HTMLInputElement).value)"
        />
        <Slider
          v-else-if="widget.type === 'slider'"
          :disabled="opt.disabled"
          :max="opt.max ?? 100"
          :min="opt.min ?? 0"
          :step="opt.step ?? 1"
          :value="Number(model[name] ?? opt.defaultValue ?? 0)"
          @update:value="patch"
        />
        <Cascader
          v-else-if="widget.type === 'cascader'"
          class="w-full"
          :disabled="opt.disabled"
          :options="opt.optionItems || []"
          :placeholder="opt.placeholder"
          @update:value="patch"
        />
        <Upload
          v-else-if="
            widget.type === 'picture-upload' || widget.type === 'file-upload'
          "
          :before-upload="() => false"
          :disabled="opt.disabled"
          :list-type="
            widget.type === 'picture-upload' ? 'picture-card' : 'text'
          "
          :max-count="opt.limit || 3"
        >
          <div v-if="widget.type === 'picture-upload'">上传</div>
          <Button v-else size="small">选择文件</Button>
        </Upload>
        <div v-if="errorText" class="mt-1 text-xs text-red-500">
          {{ errorText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vf-node {
  display: block;
  width: 100%;
  margin-bottom: 12px;
}

.vf-node.is-designer {
  position: relative;
  margin-bottom: 8px;
}

.vf-item {
  width: 100%;
  padding: 4px 0;
}

.vf-node.is-designer .vf-item {
  padding: 4px 28px 4px 4px;
}

.vf-actions {
  position: absolute;
  top: -14px;
  right: 0;
  z-index: 5;
  display: flex;
  gap: 2px;
  padding: 0 2px;
  background: #409eff;
}

.vf-actions button,
.vf-drag {
  font-size: 12px;
  line-height: 22px;
  color: #fff;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.vf-node.is-selected {
  outline: 2px solid #409eff;
}

.vf-col.is-selected,
.vf-cell.is-selected {
  outline: 2px solid #409eff;
  outline-offset: -2px;
}

.vf-col {
  min-width: 0;
}

.vf-node.is-designer .vf-col,
.vf-node.is-designer .vf-cell {
  min-height: 48px;
  padding: 6px;
  border: 1px dashed #dcdfe6;
}

.vf-cell {
  padding: 8px;
  vertical-align: top;
  border: 1px solid #ebeef5;
}

.vf-col.is-over,
.vf-cell.is-over,
.vf-card.is-over {
  background: rgb(64 158 255 / 8%);
}

.vf-card {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}

.vf-node.is-designer .vf-card {
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
}

.vf-table {
  width: 100%;
  border-collapse: collapse;
}

.vf-drop-hint {
  padding: 12px 0;
  font-size: 12px;
  color: #909399;
  text-align: center;
}
</style>
