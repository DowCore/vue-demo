/**
 * 表单描述 JSON（FormDef）协议工具
 * 设计器产出 → 持久化/发布 → FormSchemaRenderer 按 JSON 渲染
 */
import type {
  FormDef,
  FormFieldDef,
  FormWidgetDef,
} from '#/api/saas/orchestration';

import { flattenVFormFields, parseVForm } from './vform-model';

const CONTROLS = new Set([
  'cascader',
  'checkbox',
  'date',
  'dateRange',
  'datetime',
  'deptPicker',
  'input',
  'list',
  'number',
  'password',
  'radio',
  'rate',
  'select',
  'slider',
  'switch',
  'table',
  'textarea',
  'time',
  'tree',
  'upload',
  'userPicker',
]);

function fieldSpan(raw: unknown, control: string) {
  const given = Number(raw);
  if (given > 0) return given;
  if (control === 'textarea' || ['list', 'table', 'tree'].includes(control)) {
    return 24;
  }
  return 12;
}

function sampleCell(field: FormFieldDef) {
  if (field.control === 'number') return 1;
  if (field.control === 'switch') return true;
  if (field.control === 'radio' || field.control === 'select') return '选项1';
  if (field.control === 'checkbox') return ['选项1'];
  if (field.control === 'userPicker') return 'admin';
  if (field.control === 'deptPicker') return '总经办';
  if (field.control === 'upload') return 'attachment.pdf';
  if (field.control === 'rate') return 5;
  return `示例${field.title || field.field}`;
}

function normalizeField(
  raw: null | Partial<FormFieldDef> | undefined,
): FormFieldDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const field = String(raw.field || '').trim();
  if (!field) return null;
  const control = CONTROLS.has(String(raw.control || ''))
    ? String(raw.control)
    : 'input';
  const children = Array.isArray(raw.children)
    ? (raw.children
        .map((c) => normalizeField(c))
        .filter(Boolean) as FormFieldDef[])
    : [];
  return {
    field,
    columnName: raw.columnName ? String(raw.columnName) : undefined,
    title: String(raw.title || field),
    control,
    span: fieldSpan(raw.span, control),
    placeholder: raw.placeholder ? String(raw.placeholder) : undefined,
    visibleOnCreate: raw.visibleOnCreate !== false,
    visibleOnUpdate: raw.visibleOnUpdate !== false,
    visibleOnDetail: raw.visibleOnDetail !== false,
    readonlyOnCreate: !!raw.readonlyOnCreate,
    readonlyOnUpdate: !!raw.readonlyOnUpdate,
    requiredOnCreate: !!raw.requiredOnCreate,
    requiredOnUpdate: !!raw.requiredOnUpdate,
    rules:
      raw.rules && typeof raw.rules === 'object' ? { ...raw.rules } : undefined,
    children: ['list', 'table', 'tree'].includes(control)
      ? children
      : undefined,
    minItems:
      raw.minItems === undefined || raw.minItems === null
        ? undefined
        : Number(raw.minItems),
    maxItems:
      raw.maxItems === undefined || raw.maxItems === null
        ? undefined
        : Number(raw.maxItems),
    treeChildrenField:
      control === 'tree'
        ? String(raw.treeChildrenField || 'children')
        : undefined,
    dependencies: Array.isArray(raw.dependencies)
      ? raw.dependencies
      : undefined,
    controlProps:
      raw.controlProps && typeof raw.controlProps === 'object'
        ? { ...raw.controlProps }
        : undefined,
  };
}

/** 规范化为可持久化的 FormDef JSON 对象（layout 优先，fields 由 layout 派生） */
export function normalizeFormDef(input: unknown): FormDef {
  const src =
    input && typeof input === 'object' ? (input as Partial<FormDef>) : {};
  const layout = Array.isArray(src.layout)
    ? (src.layout
        .map((n) => normalizeWidget(n))
        .filter(Boolean) as FormWidgetDef[])
    : [];
  let fields: FormFieldDef[] = [];
  if (layout.length > 0) {
    fields = flattenLayout(layout);
  } else if (Array.isArray(src.fields)) {
    fields = src.fields
      .map((f) => normalizeField(f))
      .filter((field): field is FormFieldDef => field !== null);
  }
  const submitFlowKey = src.submitFlowKey
    ? String(src.submitFlowKey).trim()
    : undefined;
  const vformJson = src.vformJson ? String(src.vformJson) : undefined;
  const vformFields = vformJson
    ? flattenVFormFields(parseVForm(vformJson))
    : [];
  return {
    fields: vformFields.length > 0 ? vformFields : fields,
    layout,
    ...(vformJson ? { vformJson } : {}),
    ...(submitFlowKey ? { submitFlowKey } : {}),
  };
}

const BASIC_CONTROLS = new Set([
  'date',
  'datetime',
  'input',
  'number',
  'switch',
  'textarea',
]);

export function newWidgetId(prefix = 'w') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeWidget(
  raw: null | Partial<FormWidgetDef> | undefined,
): FormWidgetDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'container' ? 'container' : 'field';
  if (kind === 'container') {
    const container = ['card', 'data-table', 'grid', 'subform'].includes(
      String(raw.container),
    )
      ? String(raw.container)
      : 'grid';
    const children = Array.isArray(raw.children)
      ? (raw.children
          .map((c) => normalizeWidget(c))
          .filter(Boolean) as FormWidgetDef[])
      : [];
    return {
      id: String(raw.id || newWidgetId('c')),
      kind: 'container',
      container,
      columns: Math.min(
        4,
        Math.max(1, Number(raw.columns) || (container === 'grid' ? 2 : 1)),
      ),
      title: raw.title ? String(raw.title) : defaultContainerTitle(container),
      hidden: !!raw.hidden,
      children,
    };
  }
  const field = String(raw.field || '').trim();
  if (!field) return null;
  const control = BASIC_CONTROLS.has(String(raw.control || ''))
    ? String(raw.control)
    : 'input';
  return {
    id: String(raw.id || newWidgetId('f')),
    kind: 'field',
    field,
    columnName: raw.columnName ? String(raw.columnName) : undefined,
    title: String(raw.title || field),
    control,
    span: Number(raw.span) > 0 ? Number(raw.span) : 24,
    placeholder: raw.placeholder ? String(raw.placeholder) : undefined,
    hidden: !!raw.hidden,
    visibleOnCreate: raw.visibleOnCreate !== false,
    visibleOnUpdate: raw.visibleOnUpdate !== false,
    visibleOnDetail: raw.visibleOnDetail !== false,
    readonlyOnCreate: !!raw.readonlyOnCreate,
    readonlyOnUpdate: !!raw.readonlyOnUpdate,
    requiredOnCreate: !!raw.requiredOnCreate,
    requiredOnUpdate: !!raw.requiredOnUpdate,
    // F2 对齐：以下属性原先在此被静默丢弃，导致 layout → fields 拍平时规则/明细约束丢失
    rules:
      raw.rules && typeof raw.rules === 'object' ? { ...raw.rules } : undefined,
    minItems:
      raw.minItems === undefined || raw.minItems === null
        ? undefined
        : Number(raw.minItems),
    maxItems:
      raw.maxItems === undefined || raw.maxItems === null
        ? undefined
        : Number(raw.maxItems),
    treeChildrenField: raw.treeChildrenField
      ? String(raw.treeChildrenField)
      : undefined,
    dependencies: Array.isArray(raw.dependencies)
      ? raw.dependencies
      : undefined,
    controlProps:
      raw.controlProps && typeof raw.controlProps === 'object'
        ? { ...raw.controlProps }
        : undefined,
    children: [],
  };
}

function defaultContainerTitle(container: string) {
  if (container === 'card') return '卡片';
  if (container === 'data-table') return '数据表格';
  if (container === 'subform') return '子表单';
  return '栅格';
}

export function createContainer(
  container: 'card' | 'data-table' | 'grid' | 'subform',
  columns = 2,
): FormWidgetDef {
  const id = newWidgetId('c');
  return {
    id,
    kind: 'container',
    container,
    columns: container === 'grid' ? columns : 1,
    title: defaultContainerTitle(container),
    field:
      container === 'data-table' || container === 'subform'
        ? `lines_${id.slice(-4)}`
        : undefined,
    hidden: false,
    children: [],
  };
}

export function createField(control: string): FormWidgetDef {
  const field = `${control}_${Math.random().toString(36).slice(2, 6)}`;
  const titles: Record<string, string> = {
    input: '单行输入',
    textarea: '多行输入',
    number: '数字',
    date: '日期',
    datetime: '时间',
    switch: '开关',
  };
  return {
    id: newWidgetId('f'),
    kind: 'field',
    field,
    title: titles[control] || control,
    control,
    span: 24,
    visibleOnCreate: true,
    visibleOnUpdate: true,
    visibleOnDetail: true,
    children: [],
  };
}

/** 旧版扁平 fields 升格为一个双列栅格，便于在新设计器里继续编 */
export function migrateFieldsToLayout(fields: FormFieldDef[]): FormWidgetDef[] {
  if (fields.length === 0) return [];
  return [
    {
      ...createContainer('grid', 2),
      title: '栅格',
      children: fields
        .filter((f) => !['list', 'table', 'tree'].includes(f.control))
        .map((f) => ({
          id: newWidgetId('f'),
          kind: 'field' as const,
          field: f.field,
          columnName: f.columnName,
          title: f.title,
          control: BASIC_CONTROLS.has(f.control) ? f.control : 'input',
          span: f.span || 12,
          placeholder: f.placeholder,
          visibleOnCreate: f.visibleOnCreate,
          visibleOnUpdate: f.visibleOnUpdate,
          visibleOnDetail: f.visibleOnDetail,
          requiredOnCreate: f.requiredOnCreate,
          requiredOnUpdate: f.requiredOnUpdate,
          rules: f.rules,
          controlProps: f.controlProps,
          children: [],
        })),
    },
    ...fields
      .filter((f) => ['list', 'table', 'tree'].includes(f.control))
      .map((f): FormWidgetDef => ({
        id: newWidgetId('c'),
        kind: 'container',
        container: f.control === 'list' ? 'subform' : 'data-table',
        columns: 1,
        title: f.title,
        field: f.field,
        hidden: false,
        minItems: f.minItems,
        maxItems: f.maxItems,
        treeChildrenField: f.treeChildrenField,
        children: (f.children || []).map((c) => ({
          id: newWidgetId('f'),
          kind: 'field' as const,
          field: c.field,
          columnName: c.columnName,
          title: c.title,
          control: c.control || 'input',
          span: 24,
          rules: c.rules,
          controlProps: c.controlProps,
          children: [],
        })),
      })),
  ];
}

export function flattenLayout(layout: FormWidgetDef[]): FormFieldDef[] {
  const fields: FormFieldDef[] = [];
  const walk = (nodes: FormWidgetDef[]) => {
    for (const node of nodes) {
      if (node.hidden) continue;
      if (node.kind === 'container') {
        if (node.container === 'data-table' || node.container === 'subform') {
          const name = node.field || `lines_${node.id.slice(-4)}`;
          fields.push({
            field: name,
            title: node.title || name,
            control: node.container === 'subform' ? 'list' : 'table',
            span: 24,
            minItems: node.minItems,
            maxItems: node.maxItems,
            children: (node.children || [])
              .filter(
                (c): c is FormWidgetDef & { field: string } =>
                  c.kind === 'field' && !!c.field,
              )
              .map((c) => ({
                field: c.field,
                columnName: c.columnName,
                title: c.title || c.field,
                control: c.control || 'input',
                span: 12,
                placeholder: c.placeholder,
                requiredOnCreate: c.requiredOnCreate,
                requiredOnUpdate: c.requiredOnUpdate,
                rules: c.rules,
                controlProps: c.controlProps,
              })),
          });
        } else {
          walk(node.children || []);
        }
      } else if (node.field) {
        fields.push({
          field: node.field,
          columnName: node.columnName,
          title: node.title || node.field,
          control: node.control || 'input',
          span: node.span || 12,
          placeholder: node.placeholder,
          visibleOnCreate: node.visibleOnCreate,
          visibleOnUpdate: node.visibleOnUpdate,
          visibleOnDetail: node.visibleOnDetail,
          readonlyOnCreate: node.readonlyOnCreate,
          readonlyOnUpdate: node.readonlyOnUpdate,
          requiredOnCreate: node.requiredOnCreate,
          requiredOnUpdate: node.requiredOnUpdate,
          rules: node.rules,
          minItems: node.minItems,
          maxItems: node.maxItems,
          treeChildrenField: node.treeChildrenField,
          dependencies: node.dependencies,
          controlProps: node.controlProps,
        });
      }
    }
  };
  walk(layout);
  return fields;
}

export function findWidget(
  nodes: FormWidgetDef[],
  id: string,
): FormWidgetDef | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findWidget(n.children || [], id);
    if (hit) return hit;
  }
  return null;
}

export function stringifyFormDef(schema: FormDef, pretty = true): string {
  const normalized = normalizeFormDef(schema);
  return pretty
    ? JSON.stringify(normalized, null, 2)
    : JSON.stringify(normalized);
}

export function parseFormDefJson(text: string): FormDef {
  const trimmed = text.trim();
  if (!trimmed) {
    return { fields: [] };
  }
  const parsed = JSON.parse(trimmed) as unknown;
  return normalizeFormDef(parsed);
}

export function emptyRecord(fields: FormFieldDef[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const f of fields) {
    if (['list', 'table', 'tree'].includes(f.control)) {
      record[f.field] = [];
    } else if (f.control === 'switch') {
      record[f.field] = false;
    } else {
      record[f.field] = undefined;
    }
  }
  return record;
}

/** 预览用示例数据（不写回 Schema） */
export function buildSampleRecord(
  fields: FormFieldDef[],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.control === 'table' || f.control === 'list' || f.control === 'tree') {
      const row: Record<string, unknown> = {};
      for (const c of f.children || []) {
        row[c.field] = sampleCell(c);
      }
      if (f.control === 'tree') {
        row[f.treeChildrenField || 'children'] = [];
      }
      record[f.field] = [row];
    } else if (f.control === 'number') {
      record[f.field] = 100;
    } else if (f.control === 'switch') {
      record[f.field] = true;
    } else if (f.control === 'date') {
      record[f.field] = '2026-01-15';
    } else if (f.control === 'datetime') {
      record[f.field] = '2026-01-15 09:30:00';
    } else if (f.control === 'textarea') {
      record[f.field] = `示例${f.title || f.field}说明`;
    } else {
      record[f.field] = `示例${f.title || f.field}`;
    }
  }
  return record;
}
