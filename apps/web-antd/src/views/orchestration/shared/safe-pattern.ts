/**
 * 用户可配置正则的安全编译与匹配。
 *
 * 风险背景：表单字段的 `rules.pattern` 来自发布的表单 schema（后端存储），
 * 若直接 `new RegExp(pattern).test(userInput)`，则：
 * 1) 非法正则会抛异常（原先被静默吞掉，配置错误无法被发现）；
 * 2) 灾难性回溯（ReDoS）模式会让浏览器主线程长时间卡死。
 *
 * 这里做三件事：
 * - 限制模式长度与待测文本长度（兜住回溯爆发的代价上限）；
 * - 拒绝明显的嵌套量词等 ReDoS 模式（宁可跳过校验，也不静默跑一个定时炸弹）；
 * - 编译失败时给出原因，由调用方决定如何提示。
 */

/** 模式长度上限：正常业务正则远小于此值。 */
const MAX_PATTERN_LENGTH = 200;

/** 待测文本长度上限：超过则跳过正则校验，避免回溯爆炸。 */
const MAX_TEST_INPUT_LENGTH = 1000;

/** 形如 `(…+…)*`、`(…量词…){n,m}` 的嵌套量词，是 ReDoS 的典型来源。 */
const NESTED_QUANTIFIER = [
  /\([^()]*(?:[+*]|\{\d+,?\d*\})[^()]*\)\s*(?:[+*]|\{\d+,?\d*\})/,
  /\[[^\]]*\]\s*[+*]\s*\{\d+,?\d*\}/,
];

export type PatternCheckResult = 'fail' | 'pass' | 'skip';

export type PatternCompileResult =
  | { ok: false; reason: string }
  | { ok: true; regex: RegExp };

/** 是否为高风险（可能灾难性回溯）的模式。 */
export function isRiskyPattern(pattern: string): boolean {
  return NESTED_QUANTIFIER.some((rule) => rule.test(pattern));
}

/** 编译用户配置的正则；返回结果而非抛异常。 */
export function compileSafePattern(
  pattern: null | string | undefined,
): PatternCompileResult {
  const source = String(pattern ?? '');
  if (!source) return { ok: false, reason: '未配置正则' };
  if (source.length > MAX_PATTERN_LENGTH) {
    return {
      ok: false,
      reason: `正则长度超过 ${MAX_PATTERN_LENGTH} 字符，已跳过`,
    };
  }
  if (isRiskyPattern(source)) {
    return {
      ok: false,
      reason: '正则包含嵌套量词（可能导致灾难性回溯），已跳过',
    };
  }
  try {
    return { ok: true, regex: new RegExp(source) };
  } catch (error) {
    return {
      ok: false,
      reason: `正则不合法：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 校验文本是否匹配正则。
 *
 * - `'pass'` 匹配成功；
 * - `'fail'` 匹配失败（应当提示用户）；
 * - `'skip'` 无法安全校验（模式不合法/有风险/文本过长），调用方应放过而不是误报。
 */
export function checkPattern(
  pattern: null | string | undefined,
  value: unknown,
): PatternCheckResult {
  const text = String(value ?? '');
  if (!text) return 'skip';
  if (text.length > MAX_TEST_INPUT_LENGTH) return 'skip';
  const compiled = compileSafePattern(pattern);
  if (!compiled.ok) return 'skip';
  try {
    return compiled.regex.test(text) ? 'pass' : 'fail';
  } catch {
    return 'skip';
  }
}
