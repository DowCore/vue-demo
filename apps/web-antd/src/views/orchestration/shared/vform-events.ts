import { tryCompileScript, tryRunScript } from './safe-expr';
import { runSandboxedScript } from './script-sandbox';

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
 * 执行组件事件源码。只在浏览器预览/运行态调用；设计器里只保存字符串，不执行。
 *
 * ## 两层执行模型
 * 1. **受限表达式 DSL**（{@link ./safe-expr}）——同步、零 `eval`，覆盖
 *    「条件赋值」这类最常见的事件脚本，例如 `formModel.total = value * 2`。
 * 2. **受控 JS 沙箱**（{@link ./script-sandbox}）——DSL 表达不了的完整 JS
 *    （多语句、`if` / 循环 / 闭包）落到这里执行。脚本能读写 `formModel`
 *    （这是事件脚本的核心用途），但拿不到 `window` / `document` / `fetch` /
 *    网络与存储等宿主能力，也碰不到原型链。
 *
 * 形参顺序沿用历史实现 `(value, oldValue, formModel)`，避免影响存量脚本。
 */
export function runWidgetEvent(
  code: unknown,
  ctx: {
    formModel?: Record<string, unknown>;
    oldValue?: unknown;
    value?: unknown;
  },
) {
  const source = String(code || '').trim();
  if (!source) return;

  const scope: Record<string, unknown> = {
    value: ctx.value,
    oldValue: ctx.oldValue,
    formModel: ctx.formModel || {},
  };

  // 第 1 层：受限表达式（无 eval）
  if (tryCompileScript(source).ok) {
    const result = tryRunScript(source, scope);
    if (!result.ok) {
      console.warn(`[vform-event] 事件脚本无法执行，已忽略：${result.error}`);
    }
    return;
  }

  // 第 2 层：受控 JS 沙箱（完整 JS，但剥离宿主能力）
  const result = runSandboxedScript(source, scope);
  if (!result.ok) {
    console.warn(`[vform-event] 事件脚本无法执行，已忽略：${result.error}`);
  }
}
