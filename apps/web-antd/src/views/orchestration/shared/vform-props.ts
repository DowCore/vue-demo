/** VForm3 属性面板字段（对齐 widgetsConfig / setting-panel 常见项） */
export interface VFormPropField {
  key: string;
  label: string;
  kind: 'number' | 'segment' | 'select' | 'switch' | 'text' | 'textarea';
  group: string;
  options?: { label: string; value: number | string }[];
}

const align = [
  { label: '居左', value: 'label-left-align' },
  { label: '居中', value: 'label-center-align' },
  { label: '居右', value: 'label-right-align' },
];

const sizes = [
  { label: '默认', value: '' },
  { label: '大', value: 'large' },
  { label: '中', value: 'default' },
  { label: '小', value: 'small' },
];

const common: VFormPropField[] = [
  { group: '基本属性', key: 'label', label: '标签', kind: 'text' },
  {
    group: '基本属性',
    key: 'labelAlign',
    label: 'PC字段标签对齐',
    kind: 'segment',
    options: align,
  },
  { group: '基本属性', key: 'defaultValue', label: '默认值', kind: 'text' },
  {
    group: '基本属性',
    key: 'placeholder',
    label: '占位提示文字',
    kind: 'text',
  },
  {
    group: '基本属性',
    key: 'size',
    label: '组件大小',
    kind: 'select',
    options: sizes,
  },
  { group: '基本属性', key: 'labelWidth', label: '标签宽度', kind: 'number' },
  {
    group: '基本属性',
    key: 'labelWrap',
    label: '标签超长换行',
    kind: 'switch',
  },
  {
    group: '基本属性',
    key: 'labelHidden',
    label: '隐藏字段标签',
    kind: 'switch',
  },
  { group: '校验属性', key: 'required', label: '必填字段', kind: 'switch' },
  {
    group: '校验属性',
    key: 'requiredHint',
    label: '必填校验提示',
    kind: 'text',
  },
  {
    group: '校验属性',
    key: 'validation',
    label: '字段校验',
    kind: 'select',
    options: [
      { label: '请选择', value: '' },
      { label: '字母', value: 'letter' },
      { label: '数字字母', value: 'letterNumber' },
      { label: '手机号码', value: 'mobile' },
      { label: '身份证号', value: 'idCard' },
      { label: '邮箱', value: 'email' },
      { label: '网址', value: 'url' },
      { label: '非中文字符', value: 'noChinese' },
      { label: '仅中文字符', value: 'chinese' },
    ],
  },
  {
    group: '校验属性',
    key: 'validationHint',
    label: '校验失败提示',
    kind: 'text',
  },
  { group: '状态属性', key: 'readonly', label: '只读', kind: 'switch' },
  { group: '状态属性', key: 'disabled', label: '禁用', kind: 'switch' },
  { group: '状态属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  { group: '状态属性', key: 'clearable', label: '可清除', kind: 'switch' },
  { group: '高级属性', key: 'name', label: '唯一名称', kind: 'text' },
  {
    group: '高级属性',
    key: 'customClass',
    label: '自定义CSS样式',
    kind: 'text',
  },
  { group: '高级属性', key: 'minLength', label: '最小长度', kind: 'number' },
  { group: '高级属性', key: 'maxLength', label: '最大长度', kind: 'number' },
  {
    group: '高级属性',
    key: 'showWordLimit',
    label: '显示字数',
    kind: 'switch',
  },
];

const extra: Record<string, VFormPropField[]> = {
  input: [
    {
      group: '基本属性',
      key: 'type',
      label: '显示类型',
      kind: 'select',
      options: [
        { label: '明文', value: 'text' },
        { label: '密码', value: 'password' },
      ],
    },
    {
      group: '基本属性',
      key: 'showPassword',
      label: '显示密码切换',
      kind: 'switch',
    },
  ],
  textarea: [{ group: '基本属性', key: 'rows', label: '行数', kind: 'number' }],
  number: [
    { group: '基本属性', key: 'min', label: '最小值', kind: 'number' },
    { group: '基本属性', key: 'max', label: '最大值', kind: 'number' },
    { group: '基本属性', key: 'precision', label: '精度', kind: 'number' },
    { group: '基本属性', key: 'step', label: '步长', kind: 'number' },
  ],
  radio: [
    {
      group: '基本属性',
      key: 'displayStyle',
      label: '排列',
      kind: 'select',
      options: [
        { label: '行内', value: 'inline' },
        { label: '块级', value: 'block' },
      ],
    },
  ],
  checkbox: [
    {
      group: '基本属性',
      key: 'displayStyle',
      label: '排列',
      kind: 'select',
      options: [
        { label: '行内', value: 'inline' },
        { label: '块级', value: 'block' },
      ],
    },
  ],
  select: [
    { group: '基本属性', key: 'filterable', label: '可搜索', kind: 'switch' },
    { group: '基本属性', key: 'multiple', label: '多选', kind: 'switch' },
    {
      group: '基本属性',
      key: 'multipleLimit',
      label: '多选数量限制',
      kind: 'number',
    },
  ],
  date: [
    { group: '基本属性', key: 'format', label: '显示格式', kind: 'text' },
    {
      group: '基本属性',
      key: 'valueFormat',
      label: '绑定值格式',
      kind: 'text',
    },
  ],
  'date-range': [
    { group: '基本属性', key: 'format', label: '显示格式', kind: 'text' },
    {
      group: '基本属性',
      key: 'startPlaceholder',
      label: '开始占位',
      kind: 'text',
    },
    {
      group: '基本属性',
      key: 'endPlaceholder',
      label: '结束占位',
      kind: 'text',
    },
  ],
  time: [{ group: '基本属性', key: 'format', label: '时间格式', kind: 'text' }],
  'time-range': [
    { group: '基本属性', key: 'format', label: '时间格式', kind: 'text' },
    {
      group: '基本属性',
      key: 'startPlaceholder',
      label: '开始占位',
      kind: 'text',
    },
    {
      group: '基本属性',
      key: 'endPlaceholder',
      label: '结束占位',
      kind: 'text',
    },
  ],
  switch: [
    { group: '基本属性', key: 'activeText', label: '开启文字', kind: 'text' },
    { group: '基本属性', key: 'inactiveText', label: '关闭文字', kind: 'text' },
  ],
  rate: [
    { group: '基本属性', key: 'max', label: '最大分值', kind: 'number' },
    { group: '基本属性', key: 'allowHalf', label: '允许半选', kind: 'switch' },
    { group: '基本属性', key: 'showScore', label: '显示分数', kind: 'switch' },
  ],
  slider: [
    { group: '基本属性', key: 'min', label: '最小值', kind: 'number' },
    { group: '基本属性', key: 'max', label: '最大值', kind: 'number' },
    { group: '基本属性', key: 'step', label: '步长', kind: 'number' },
    {
      group: '基本属性',
      key: 'showStops',
      label: '显示间断点',
      kind: 'switch',
    },
  ],
  'static-text': [
    {
      group: '基本属性',
      key: 'textContent',
      label: '静态文字',
      kind: 'textarea',
    },
    {
      group: '基本属性',
      key: 'textAlign',
      label: '对齐',
      kind: 'select',
      options: [
        { label: '左', value: 'left' },
        { label: '中', value: 'center' },
        { label: '右', value: 'right' },
      ],
    },
    { group: '基本属性', key: 'fontSize', label: '字号', kind: 'text' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
  'html-text': [
    { group: '基本属性', key: 'htmlContent', label: 'HTML', kind: 'textarea' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
  button: [
    { group: '基本属性', key: 'label', label: '按钮文字', kind: 'text' },
    {
      group: '基本属性',
      key: 'type',
      label: '类型',
      kind: 'select',
      options: [
        { label: '默认', value: '' },
        { label: '主要', value: 'primary' },
        { label: '虚线', value: 'dashed' },
        { label: '链接', value: 'link' },
      ],
    },
    { group: '基本属性', key: 'disabled', label: '禁用', kind: 'switch' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
  divider: [
    { group: '基本属性', key: 'label', label: '文字', kind: 'text' },
    {
      group: '基本属性',
      key: 'contentPosition',
      label: '文字位置',
      kind: 'select',
      options: [
        { label: '左', value: 'left' },
        { label: '中', value: 'center' },
        { label: '右', value: 'right' },
      ],
    },
  ],
  'picture-upload': [
    { group: '基本属性', key: 'limit', label: '最大数量', kind: 'number' },
    {
      group: '基本属性',
      key: 'fileMaxSize',
      label: '大小上限 MB',
      kind: 'number',
    },
    { group: '基本属性', key: 'uploadTip', label: '上传提示', kind: 'text' },
    { group: '基本属性', key: 'multipleSelect', label: '多选', kind: 'switch' },
  ],
  'file-upload': [
    { group: '基本属性', key: 'limit', label: '最大数量', kind: 'number' },
    {
      group: '基本属性',
      key: 'fileMaxSize',
      label: '大小上限 MB',
      kind: 'number',
    },
    { group: '基本属性', key: 'uploadTip', label: '上传提示', kind: 'text' },
    { group: '基本属性', key: 'multipleSelect', label: '多选', kind: 'switch' },
  ],
  'rich-editor': [
    { group: '基本属性', key: 'rows', label: '行数', kind: 'number' },
  ],
  grid: [
    { group: '基本属性', key: 'name', label: '唯一名称', kind: 'text' },
    { group: '基本属性', key: 'gutter', label: '栅格间距', kind: 'number' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
  'grid-col': [
    { group: '基本属性', key: 'span', label: '栅格宽度 span', kind: 'number' },
    { group: '基本属性', key: 'offset', label: '左侧间隔', kind: 'number' },
    { group: '基本属性', key: 'push', label: '右移栅格', kind: 'number' },
    { group: '基本属性', key: 'pull', label: '左移栅格', kind: 'number' },
    { group: '基本属性', key: 'responsive', label: '响应式', kind: 'switch' },
    { group: '基本属性', key: 'md', label: '中屏 md', kind: 'number' },
    { group: '基本属性', key: 'sm', label: '小屏 sm', kind: 'number' },
    { group: '基本属性', key: 'xs', label: '超小屏 xs', kind: 'number' },
  ],
  table: [
    { group: '基本属性', key: 'name', label: '唯一名称', kind: 'text' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
  tab: [
    { group: '基本属性', key: 'name', label: '唯一名称', kind: 'text' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
  'tab-pane': [
    { group: '基本属性', key: 'label', label: '标签标题', kind: 'text' },
    { group: '基本属性', key: 'disabled', label: '禁用', kind: 'switch' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
  card: [
    { group: '基本属性', key: 'name', label: '唯一名称', kind: 'text' },
    { group: '基本属性', key: 'label', label: '卡片标题', kind: 'text' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
  'sub-form': [
    { group: '基本属性', key: 'name', label: '唯一名称', kind: 'text' },
    { group: '基本属性', key: 'label', label: '子表单标题', kind: 'text' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
  tree: [
    { group: '基本属性', key: 'name', label: '唯一名称', kind: 'text' },
    { group: '基本属性', key: 'label', label: '树标题', kind: 'text' },
    { group: '基本属性', key: 'hidden', label: '隐藏', kind: 'switch' },
  ],
};

const formItemTypes = new Set([
  'cascader',
  'checkbox',
  'color',
  'date',
  'date-range',
  'file-upload',
  'input',
  'number',
  'picture-upload',
  'radio',
  'rate',
  'rich-editor',
  'select',
  'slider',
  'switch',
  'textarea',
  'time',
  'time-range',
]);

export function propsForWidget(type: string): VFormPropField[] {
  if (formItemTypes.has(type)) return [...common, ...(extra[type] || [])];
  return extra[type] || common;
}

/** 组件事件。代码存在 options 上，和 VForm3 Pro「编写代码」同一结构。 */
export function eventsFor(type: string) {
  const life = [
    { key: 'onCreated', label: 'onCreated' },
    { key: 'onMounted', label: 'onMounted' },
  ];
  const value = [
    { key: 'onChange', label: 'onChange' },
    { key: 'onFocus', label: 'onFocus' },
    { key: 'onBlur', label: 'onBlur' },
    { key: 'onValidate', label: 'onValidate' },
  ];
  if (type === 'button') return [...life, { key: 'onClick', label: 'onClick' }];
  if (type === 'static-text' || type === 'html-text' || type === 'divider')
    return life;
  if (formItemTypes.has(type)) return [...life, ...value];
  return life;
}

export function propGroups(type: string) {
  const fields = propsForWidget(type);
  const groups: { name: string; fields: VFormPropField[] }[] = [];
  for (const field of fields) {
    let group = groups.find((item) => item.name === field.group);
    if (!group) {
      group = { name: field.group, fields: [] };
      groups.push(group);
    }
    group.fields.push(field);
  }
  return groups;
}
