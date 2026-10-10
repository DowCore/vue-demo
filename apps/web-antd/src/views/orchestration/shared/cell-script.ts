/**
 * 单元格自定义格式化 / 渲染脚本执行。
 *
 * ## 两层执行模型
 * 1. **受限表达式 DSL**（{@link ./safe-expr}）——同步、零 `eval`，覆盖绝大多数
 *    单纯格式化（取值、算术、三元、字符串拼接、白名单函数/方法）。这一层最快，
 *    也不需要任何隔离设施。
 * 2. **受控 JS 沙箱**（{@link ./script-sandbox}）——DSL 表达不了的完整 JS
 *    （`const` / 循环 / `map` / `reduce` / 闭包）落到这里。能力被收窄到
 *    「只能用注入的 `value` / `row` / `raw`，碰不到宿主环境」。
 *
 * `column.formatFn` / `column.renderFn` 是存在后端数据库里的脚本源码。它们是**配置**，
 * 不是攻击载荷，所以不该被禁止执行；但它们又是**半可信代码**（谁能编辑这些字段，谁就
 * 拿到执行权），所以执行时必须剥离宿主权限。详见 script-sandbox 模块头部的说明。
 *
 * 兼容性：沿用历史 `wrapBody` 语义——源码里没有 `return` 时按表达式处理，
 * 自动包成 `return (…);`。历史存量配置行为不变。
 *
 * 富文本净化见 {@link ./sanitize-html}。
 */
import { tryCompileExpression, tryEvaluateExpression } from './safe-expr';
import { isSandboxRunnable, runSandboxedScript } from './script-sandbox';

const reported = new Set<string>();

function reportOnce(source: string, message: string): void {
  if (reported.has(source)) return;
  reported.add(source);
  console.warn(
    `[cell-script] 脚本无法执行，已忽略并保留原值：${message}\n脚本：${source}`,
  );
}

/**
 * 执行列格式化 / 渲染脚本。
 *
 * 失败（语法不支持、越权能力或运行期错误）时返回传入的 `value`，保证列表仍能正常展示。
 */
export function runCellFn(
  source: null | string | undefined,
  value: unknown,
  row: Record<string, unknown>,
  raw: unknown,
): unknown {
  const expression = String(source ?? '').trim();
  if (!expression) return value;

  // 第 1 层：受限表达式（无 eval，最快）
  if (tryCompileExpression(expression).ok) {
    const result = tryEvaluateExpression(expression, { raw, row, value });
    if (result.ok) return result.value;
    reportOnce(expression, result.error);
    return value;
  }

  // 第 2 层：受控 JS 沙箱（完整 JS，但剥离宿主能力）
  const script = runSandboxedScript(
    expression,
    { raw, row, value },
    { wrapExpression: true },
  );
  if (!script.ok) {
    reportOnce(expression, script.error ?? '未知错误');
    return value;
  }
  return script.value;
}

/**
 * 脚本能否执行（供设计器做即时校验）。
 *
 * 只做**静态**判定：DSL 能否编译，或 JS 能否通过词法审计并构造。
 * 不试运行——设计期没有真实行数据，试运行会把「字段暂时不存在」误判为脚本错误。
 */
export function isRunnableCellFn(source: null | string | undefined): boolean {
  return isSandboxRunnable(source);
}
