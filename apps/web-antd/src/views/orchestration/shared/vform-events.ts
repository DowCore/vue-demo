/** 字段校验预设，和 VForm3 Pro 下拉项对应。 */
const patterns: Record<string, string> = {
  letter: '^[A-Za-z]+$',
  letterNumber: '^[A-Za-z0-9]+$',
  mobile: '^1[3-9]\\d{9}$',
  idCard: '^\\d{17}[\\dXx]$',
  email: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
  url: '^https?://\\S+$',
  noChinese: '^[^\\u4e00-\\u9fa5]*$',
  chinese: '^[\\u4e00-\\u9fa5]+$',
};

export function validationPattern(preset: unknown) {
  return patterns[String(preset || '')] || '';
}

/**
 * 执行组件事件源码。只在浏览器预览/运行态调用，参数限定为 value / oldValue / formModel。
 * 设计器里只保存字符串，不执行。
 */
export function runWidgetEvent(
  code: unknown,
  ctx: {
    value?: unknown;
    oldValue?: unknown;
    formModel?: Record<string, unknown>;
  },
) {
  const source = String(code || '').trim();
  if (!source) return;
  try {
    // oxlint-disable-next-line no-new-func
    const fn = new Function('value', 'oldValue', 'formModel', source);
    fn(ctx.value, ctx.oldValue, ctx.formModel || {});
  } catch (error) {
    console.warn('[vform-event]', error);
  }
}
