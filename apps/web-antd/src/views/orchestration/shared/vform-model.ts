/**
 * VForm3 开源协议（variant-form3-vite widgetsConfig）
 * widgetList + formConfig；栅格列 / 表格单元格 / 标签页内再嵌套字段。
 * 参考：https://github.com/vform666/variant-form3-vite
 */
import type { FormFieldDef } from '#/api/saas/orchestration';

import { validationPattern } from './vform-events';

export interface VFormOptionItem {
  label: string;
  value: number | string;
  children?: VFormOptionItem[];
}

export interface VFormWidget {
  id: string;
  type: string;
  icon?: string;
  category?: string;
  formItemFlag?: boolean;
  internal?: boolean;
  options: Record<string, any>;
  widgetList?: VFormWidget[];
  cols?: VFormWidget[];
  rows?: { id: string; cols: VFormWidget[] }[];
  tabs?: VFormWidget[];
}

export interface VFormConfig {
  modelName: string;
  refName: string;
  rulesName: string;
  labelWidth: number;
  labelPosition: 'left' | 'top';
  labelAlign: string;
  size: string;
  layoutType: 'H5' | 'Pad' | 'PC';
  jsonVersion: number;
  /** 表单级事件源码，预览时执行 */
  onFormCreated?: string;
  onFormMounted?: string;
  onFormDataChange?: string;
}

export interface VFormDocument {
  widgetList: VFormWidget[];
  formConfig: VFormConfig;
}

export function defaultFormConfig(): VFormConfig {
  return {
    modelName: 'formData',
    refName: 'vForm',
    rulesName: 'rules',
    labelWidth: 80,
    labelPosition: 'left',
    labelAlign: 'label-left-align',
    size: 'default',
    layoutType: 'PC',
    jsonVersion: 3,
    onFormCreated: '',
    onFormMounted: '',
    onFormDataChange: '',
  };
}

export function emptyVForm(): VFormDocument {
  return { widgetList: [], formConfig: defaultFormConfig() };
}

export function generateId(type: string) {
  return `${type.replaceAll('-', '')}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

function baseOptions(label: string, extra: Record<string, any> = {}) {
  return {
    name: '',
    label,
    labelAlign: '',
    placeholder: '',
    labelWidth: null as null | number,
    labelHidden: false,
    hidden: false,
    disabled: false,
    readonly: false,
    required: false,
    requiredHint: '',
    validation: '',
    validationHint: '',
    defaultValue: '',
    clearable: true,
    labelWrap: false,
    customClass: '',
    onCreated: '',
    onMounted: '',
    onChange: '',
    onFocus: '',
    onBlur: '',
    onValidate: '',
    ...extra,
  };
}

function gridCol(span: number): VFormWidget {
  const id = generateId('grid-col');
  return {
    id,
    type: 'grid-col',
    category: 'container',
    icon: 'grid-col',
    internal: true,
    widgetList: [],
    options: {
      name: id,
      hidden: false,
      span,
      offset: 0,
      push: 0,
      pull: 0,
      responsive: false,
      md: span,
      sm: 12,
      xs: 24,
    },
  };
}

function tableCell(): VFormWidget {
  const id = generateId('table-cell');
  return {
    id,
    type: 'table-cell',
    category: 'container',
    internal: true,
    widgetList: [],
    options: {
      name: id,
      cellWidth: '',
      cellHeight: '',
      colspan: 1,
      rowspan: 1,
      wordBreak: false,
    },
  };
}

function tabPane(label: string, active = false): VFormWidget {
  const id = generateId('tab-pane');
  return {
    id,
    type: 'tab-pane',
    category: 'container',
    internal: true,
    widgetList: [],
    options: { name: id, label, hidden: false, active, disabled: false },
  };
}

export function createWidget(type: string, columns = 2): VFormWidget {
  const id = generateId(type);
  const name = id;
  if (type === 'grid') {
    const span = Math.floor(24 / Math.max(1, columns));
    return {
      id,
      type: 'grid',
      category: 'container',
      icon: 'grid',
      cols: Array.from({ length: columns }, () => gridCol(span)),
      options: { name, hidden: false, gutter: 12, colHeight: null },
    };
  }
  if (type === 'table') {
    return {
      id,
      type: 'table',
      category: 'container',
      icon: 'table',
      rows: [0, 1].map(() => ({
        id: generateId('table-row'),
        cols: [tableCell(), tableCell()],
      })),
      options: { name, hidden: false },
    };
  }
  if (type === 'tab') {
    return {
      id,
      type: 'tab',
      category: 'container',
      icon: 'tab',
      tabs: [tabPane('标签1', true), tabPane('标签2')],
      options: { name, hidden: false, displayType: 'border-card' },
    };
  }
  if (type === 'card') {
    return {
      id,
      type: 'card',
      category: 'container',
      widgetList: [],
      options: { name, label: '卡片', hidden: false, shadow: 'never' },
    };
  }
  if (type === 'sub-form') {
    return {
      id,
      type: 'sub-form',
      category: 'container',
      widgetList: [],
      options: {
        name,
        label: '子表',
        hidden: false,
        showBlankRow: true,
        columns: defaultSubColumns(),
        buttons: defaultSubButtons(),
      },
    };
  }
  if (type === 'tree') {
    return {
      id,
      type: 'tree',
      category: 'container',
      widgetList: [],
      options: { name, label: '树形', hidden: false },
    };
  }

  const field = (
    label: string,
    formItemFlag: boolean,
    extra: Record<string, any> = {},
  ): VFormWidget => ({
    id,
    type,
    icon: type,
    formItemFlag,
    options: { ...baseOptions(label, extra), name },
  });

  const options3 = [
    { label: '选项1', value: 1 },
    { label: '选项2', value: 2 },
    { label: '选项3', value: 3 },
  ];

  switch (type) {
    case 'input': {
      return field('单行输入', true, {
        type: 'text',
        showPassword: false,
        clearable: true,
      });
    }
    case 'password': {
      return field('密码', true, {
        type: 'password',
        showPassword: true,
        clearable: true,
      });
    }
    case 'textarea': {
      return field('多行输入', true, { rows: 3 });
    }
    case 'number': {
      return field('计数器', true, {
        defaultValue: 0,
        min: 0,
        max: 100_000,
        precision: 0,
        step: 1,
      });
    }
    case 'radio': {
      return field('单选项', true, {
        defaultValue: null,
        optionItems: options3,
        displayStyle: 'inline',
      });
    }
    case 'checkbox': {
      return field('多选项', true, {
        defaultValue: [],
        optionItems: options3,
        displayStyle: 'inline',
      });
    }
    case 'select': {
      return field('下拉选项', true, {
        optionItems: options3,
        filterable: true,
        multiple: false,
        clearable: true,
      });
    }
    case 'time': {
      return field('时间', true, { format: 'HH:mm:ss', defaultValue: null });
    }
    case 'time-range': {
      return field('时间范围', true, {
        format: 'HH:mm:ss',
        defaultValue: null,
      });
    }
    case 'date': {
      return field('日期', true, {
        type: 'date',
        format: 'YYYY-MM-DD',
        valueFormat: 'YYYY-MM-DD',
        defaultValue: null,
      });
    }
    case 'date-range': {
      return field('日期范围', true, {
        type: 'daterange',
        format: 'YYYY-MM-DD',
        valueFormat: 'YYYY-MM-DD',
        defaultValue: null,
      });
    }
    case 'switch': {
      return field('开关', true, {
        defaultValue: false,
        activeText: '',
        inactiveText: '',
      });
    }
    case 'rate': {
      return field('评分', true, { defaultValue: 0, max: 5, allowHalf: false });
    }
    case 'color': {
      return field('颜色', true, { defaultValue: '#1677ff' });
    }
    case 'slider': {
      return field('滑块', true, {
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 1,
      });
    }
    case 'static-text': {
      return field('静态文字', false, {
        textContent: '静态文字',
        fontSize: '13px',
        textAlign: 'left',
      });
    }
    case 'html-text': {
      return field('HTML', false, { htmlContent: '<b>HTML 文本</b>' });
    }
    case 'button': {
      return field('按钮', false, {
        label: '按钮',
        type: 'primary',
        displayStyle: 'inline',
        onClick: '',
      });
    }
    case 'divider': {
      return field('', false, { label: '分隔线', contentPosition: 'center' });
    }
    case 'picture-upload': {
      return field('图片', true, {
        limit: 3,
        fileTypes: ['jpg', 'png'],
        uploadTip: 'jpg/png',
      });
    }
    case 'file-upload': {
      return field('文件', true, {
        limit: 3,
        fileTypes: ['pdf', 'docx', 'xlsx'],
        uploadTip: '',
      });
    }
    case 'rich-editor': {
      return field('富文本', true, { rows: 6 });
    }
    case 'cascader': {
      return field('级联选择', true, {
        optionItems: [
          {
            label: '分类1',
            value: 'c1',
            children: [{ label: '子项', value: 'c1-1' }],
          },
        ],
        clearable: true,
      });
    }
    case 'user-picker': {
      return field('用户', true, {
        placeholder: '选择用户',
        multiple: false,
        orgScope: 'all',
      });
    }
    case 'dept-picker': {
      return field('部门', true, {
        placeholder: '选择部门',
        multiple: false,
      });
    }
    default: {
      return field(type, true);
    }
  }
}

export const paletteGroups = [
  {
    key: 'container',
    label: '容器',
    items: [
      { type: 'grid', columns: 1, label: '单列栅格' },
      { type: 'grid', columns: 2, label: '双列栅格' },
      { type: 'grid', columns: 3, label: '三列栅格' },
      { type: 'grid', columns: 4, label: '四列栅格' },
      { type: 'table', label: '表格' },
      { type: 'tab', label: '标签页' },
      { type: 'card', label: '卡片' },
      { type: 'sub-form', label: '子表' },
      { type: 'tree', label: '树形' },
    ],
  },
  {
    key: 'basic',
    label: '基础字段',
    items: [
      { type: 'input', label: '单行输入' },
      { type: 'password', label: '密码' },
      { type: 'textarea', label: '多行输入' },
      { type: 'number', label: '计数器' },
      { type: 'radio', label: '单选项' },
      { type: 'checkbox', label: '多选项' },
      { type: 'select', label: '下拉选项' },
      { type: 'time', label: '时间' },
      { type: 'time-range', label: '时间范围' },
      { type: 'date', label: '日期' },
      { type: 'date-range', label: '日期范围' },
      { type: 'switch', label: '开关' },
      { type: 'rate', label: '评分' },
      { type: 'color', label: '颜色' },
      { type: 'slider', label: '滑块' },
      { type: 'static-text', label: '静态文字' },
      { type: 'html-text', label: 'HTML' },
      { type: 'button', label: '按钮' },
      { type: 'divider', label: '分隔线' },
    ],
  },
  {
    key: 'advanced',
    label: '高级字段',
    items: [
      { type: 'picture-upload', label: '图片' },
      { type: 'file-upload', label: '文件' },
      { type: 'rich-editor', label: '富文本' },
      { type: 'cascader', label: '级联选择' },
      { type: 'user-picker', label: '用户' },
      { type: 'dept-picker', label: '部门' },
    ],
  },
];

export function parseVForm(text?: null | string): VFormDocument {
  if (!text?.trim()) return emptyVForm();
  try {
    const raw = JSON.parse(text) as Partial<VFormDocument>;
    return {
      widgetList: Array.isArray(raw.widgetList) ? raw.widgetList : [],
      formConfig: { ...defaultFormConfig(), ...raw.formConfig },
    };
  } catch {
    return emptyVForm();
  }
}

export function stringifyVForm(doc: VFormDocument) {
  return JSON.stringify(doc, null, 2);
}

/** 找到可接收子组件的 widgetList。栅格列、单元格、标签页本身就是投放目标。 */
export function findInsertList(
  doc: VFormDocument,
  selectedId: string,
): VFormWidget[] {
  if (!selectedId) return doc.widgetList;
  let found: null | VFormWidget[] = null;
  const consider = (widget: VFormWidget) => {
    if (widget.id !== selectedId || found) return;
    if (widget.widgetList) {
      found = widget.widgetList;
    } else if (widget.cols?.[0]?.widgetList) {
      found = widget.cols[0].widgetList;
    } else if (widget.tabs?.[0]?.widgetList) {
      found = widget.tabs[0].widgetList;
    } else if (widget.rows?.[0]?.cols?.[0]?.widgetList) {
      found = widget.rows[0].cols[0].widgetList;
    }
  };
  const scan = (list: VFormWidget[]) => {
    for (const widget of list) {
      consider(widget);
      if (widget.widgetList) scan(widget.widgetList);
      for (const col of widget.cols || []) {
        consider(col);
        if (col.widgetList) scan(col.widgetList);
      }
      for (const row of widget.rows || []) {
        for (const cell of row.cols || []) {
          consider(cell);
          if (cell.widgetList) scan(cell.widgetList);
        }
      }
      for (const tab of widget.tabs || []) {
        consider(tab);
        if (tab.widgetList) scan(tab.widgetList);
      }
    }
  };
  scan(doc.widgetList);
  return found || doc.widgetList;
}

export function findWidget(
  list: VFormWidget[],
  id: string,
): null | VFormWidget {
  for (const w of list) {
    if (w.id === id) return w;
    const nests = [
      ...(w.widgetList || []),
      ...(w.cols || []),
      ...(w.tabs || []),
      ...(w.rows || []).flatMap((r) => r.cols || []),
    ];
    const hit = findWidget(nests, id);
    if (hit) return hit;
  }
  return null;
}

export function parentList(
  list: VFormWidget[],
  id: string,
): null | { list: VFormWidget[]; index: number } {
  const index = list.findIndex((w) => w.id === id);
  if (index !== -1) return { list, index };
  for (const widget of list) {
    const nests = [
      widget.widgetList,
      widget.cols,
      widget.tabs,
      ...(widget.rows || []).map((row) => row.cols),
    ].filter(Boolean) as VFormWidget[][];
    for (const child of nests) {
      const hit = parentList(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function cloneWidgetTree(widget: VFormWidget): VFormWidget {
  const next = JSON.parse(JSON.stringify(widget)) as VFormWidget;
  const renew = (node: VFormWidget) => {
    node.id = generateId(node.type);
    if (node.options?.name) node.options.name = `${node.options.name}_copy`;
    node.widgetList?.forEach(renew);
    node.cols?.forEach(renew);
    node.tabs?.forEach(renew);
    node.rows?.forEach((row) => {
      row.id = generateId('table-row');
      row.cols?.forEach(renew);
    });
  };
  renew(next);
  return next;
}

export function removeWidget(list: VFormWidget[], id: string): boolean {
  const idx = list.findIndex((w) => w.id === id);
  if (idx !== -1) {
    list.splice(idx, 1);
    return true;
  }
  for (const w of list) {
    if (w.widgetList && removeWidget(w.widgetList, id)) return true;
    if (w.cols && removeWidget(w.cols, id)) return true;
    if (w.tabs && removeWidget(w.tabs, id)) return true;
    for (const row of w.rows || []) {
      if (removeWidget(row.cols || [], id)) return true;
    }
  }
  return false;
}

const controlMap: Record<string, string> = {
  input: 'input',
  password: 'password',
  textarea: 'textarea',
  number: 'number',
  radio: 'radio',
  checkbox: 'checkbox',
  select: 'select',
  time: 'time',
  'time-range': 'time',
  date: 'date',
  'date-range': 'dateRange',
  switch: 'switch',
  rate: 'rate',
  color: 'input',
  slider: 'slider',
  'picture-upload': 'upload',
  'file-upload': 'upload',
  'rich-editor': 'textarea',
  cascader: 'cascader',
  'user-picker': 'userPicker',
  'dept-picker': 'deptPicker',
};

export interface SubTableColumn {
  key: string;
  label: string;
  control: 'date' | 'input' | 'number' | 'select' | 'switch';
  width: number;
  /** 空字符串表示不固定 */
  fixed: '' | 'left' | 'right';
  /** 下拉选项，逗号分隔 */
  options?: string;
}

export interface SubTableButton {
  key: string;
  label: string;
  action: 'add' | 'import';
  /** 数据调入：已发布逻辑编排编码 */
  flowKey?: string;
  /** append 追加行，replace 覆盖子表 */
  mode?: 'append' | 'replace';
}

export function defaultSubColumns(): SubTableColumn[] {
  return [
    { key: 'item', label: '项目', control: 'input', width: 180, fixed: 'left' },
    { key: 'qty', label: '数量', control: 'number', width: 120, fixed: '' },
  ];
}

export function defaultSubButtons(): SubTableButton[] {
  return [
    { key: 'add', label: '添加行', action: 'add' },
    {
      key: 'import',
      label: '数据调入',
      action: 'import',
      flowKey: '',
      mode: 'append',
    },
  ];
}

function normalizeSubColumn(raw: any): null | SubTableColumn {
  const key = String(raw?.key || '').trim();
  if (!key) return null;
  const control = ['date', 'input', 'number', 'select', 'switch'].includes(
    raw?.control,
  )
    ? raw.control
    : 'input';
  const fixed =
    raw?.fixed === 'left' || raw?.fixed === 'right' ? raw.fixed : '';
  return {
    key,
    label: String(raw?.label || key),
    control,
    width: Number(raw?.width) > 40 ? Number(raw.width) : 140,
    fixed,
    options: raw?.options ? String(raw.options) : '',
  };
}

function columnControl(type: string) {
  if (type === 'number') return 'number';
  if (type === 'date' || type === 'time') return 'date';
  if (type === 'select' || type === 'radio') return 'select';
  if (type === 'switch') return 'switch';
  return 'input';
}

function columnFromWidget(
  widget: VFormWidget,
  index: number,
): null | SubTableColumn {
  const key = String(widget.options?.name || '').trim();
  if (!key) return null;
  const control = columnControl(widget.type);
  return {
    key,
    label: String(widget.options?.label || key),
    control,
    width: 160,
    fixed: index === 0 ? 'left' : '',
    options: '',
  };
}

/** 子表列。已保存的 columns 优先；旧的栅格模板折成列。 */
export function subFormColumns(widget: VFormWidget): SubTableColumn[] {
  const raw = widget.options?.columns;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeSubColumn(item))
      .filter(Boolean) as SubTableColumn[];
  }
  const migrated = (widget.widgetList || [])
    .filter((child) => child.formItemFlag)
    .map((child, index) => columnFromWidget(child, index))
    .filter(Boolean) as SubTableColumn[];
  return migrated.length > 0 ? migrated : defaultSubColumns();
}

export function subFormButtons(widget: VFormWidget): SubTableButton[] {
  const raw = widget.options?.buttons;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item: any, index: number) => {
      const action = item?.action === 'import' ? 'import' : 'add';
      return {
        key: String(item?.key || `btn${index + 1}`),
        label: String(
          item?.label || (action === 'import' ? '数据调入' : '添加行'),
        ),
        action,
        flowKey: item?.flowKey ? String(item.flowKey) : '',
        mode: item?.mode === 'replace' ? 'replace' : 'append',
      } as SubTableButton;
    });
  }
  return defaultSubButtons();
}

export function appendSubFormColumn(
  widget: VFormWidget,
  control: SubTableColumn['control'],
  label: string,
) {
  const columns = subFormColumns(widget);
  let n = columns.length + 1;
  let key = `col${n}`;
  const used = new Set(columns.map((col) => col.key));
  while (used.has(key)) {
    n += 1;
    key = `col${n}`;
  }
  columns.push({
    key,
    label: label || `列${n}`,
    control,
    width: 160,
    fixed: '',
  });
  widget.options = {
    ...widget.options,
    columns,
    buttons: subFormButtons(widget),
  };
  widget.widgetList = [];
}

function scalarRules(options: VFormWidget['options']) {
  const pattern = validationPattern(options.validation);
  const minLength = options.minLength || undefined;
  const maxLength = options.maxLength || undefined;
  if (pattern) {
    return {
      pattern,
      patternMessage: String(options.validationHint || '格式不正确'),
      minLength,
      maxLength,
    };
  }
  if (minLength || maxLength) return { minLength, maxLength };
  return undefined;
}

function scalarField(w: VFormWidget): FormFieldDef {
  const options = Array.isArray(w.options.optionItems)
    ? w.options.optionItems
    : undefined;
  const dependencies = Array.isArray(w.options.dependencies)
    ? w.options.dependencies
    : undefined;
  return {
    field: String(w.options.name),
    title: String(w.options.label || w.options.name),
    control: controlMap[w.type] || 'input',
    span: 24,
    placeholder: w.options.placeholder,
    requiredOnCreate: !!w.options.required,
    requiredOnUpdate: !!w.options.required,
    rules: scalarRules(w.options),
    dependencies,
    controlProps: {
      ...(options ? { options } : {}),
      ...(w.options.multiple ? { multiple: true } : {}),
      ...(w.options.orgScope ? { orgScope: w.options.orgScope } : {}),
    },
  };
}

function childControl(control: string) {
  if (control === 'number') return 'number';
  if (control === 'date') return 'date';
  if (control === 'switch') return 'switch';
  return 'input';
}

/** 子表单 / 树收成一条集合字段，行内字段进 children，不摊到根上。 */
function collectionField(w: VFormWidget): FormFieldDef {
  const tree = w.type === 'tree';
  const children = tree
    ? collectFields(w.widgetList || [])
    : subFormColumns(w).map((col) => ({
        field: col.key,
        title: col.label,
        control: childControl(col.control),
        span: 24,
      }));
  return {
    field: String(w.options?.name || w.id),
    title: String(w.options?.label || w.options?.name || w.id),
    control: tree ? 'tree' : 'list',
    span: 24,
    children,
    treeChildrenField: tree ? 'children' : undefined,
  };
}

function collectFields(list: VFormWidget[]): FormFieldDef[] {
  const fields: FormFieldDef[] = [];
  const walk = (widgets: VFormWidget[]) => {
    for (const w of widgets) {
      if (w.options?.hidden) {
        /* 隐藏字段不进提交契约，容器内部仍继续 */
      }
      if (w.type === 'sub-form' || w.type === 'tree') {
        if (!w.options?.hidden) fields.push(collectionField(w));
        continue;
      }
      if (w.formItemFlag && w.options?.name && !w.options.hidden) {
        fields.push(scalarField(w));
      }
      if (w.widgetList) walk(w.widgetList);
      for (const col of w.cols || []) if (col.widgetList) walk(col.widgetList);
      for (const row of w.rows || []) {
        for (const cell of row.cols || [])
          if (cell.widgetList) walk(cell.widgetList);
      }
      for (const tab of w.tabs || []) if (tab.widgetList) walk(tab.widgetList);
    }
  };
  walk(list);
  return fields;
}

export function flattenVFormFields(doc: VFormDocument): FormFieldDef[] {
  return collectFields(doc.widgetList);
}

export function layoutWidth(type: string) {
  if (type === 'H5') return '375px';
  if (type === 'Pad') return '768px';
  return '100%';
}
