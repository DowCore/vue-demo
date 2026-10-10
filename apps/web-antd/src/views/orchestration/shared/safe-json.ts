/**
 * JSON 解析的安全封装。
 *
 * 编排模块里大量 JSON 来自后端配置（DSL、表单 schema、vformJson），
 * 原先多处直接 `JSON.parse` 且无 `try` 保护，一个坏配置就会抛出未捕获异常。
 * 统一走这里，得到可判定的结果或明确的错误信息。
 */

export type SafeJsonResult<T> =
  | { error: string; ok: false }
  | { ok: true; value: T };

/** 解析 JSON；失败时返回错误信息而非抛异常。 */
export function tryJsonParse<T = unknown>(
  text: null | string | undefined,
): SafeJsonResult<T> {
  const source = String(text ?? '').trim();
  if (!source) return { error: '内容为空', ok: false };
  try {
    return { ok: true, value: JSON.parse(source) as T };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

/** 解析 JSON；失败时返回兜底值。 */
export function safeJsonParse<T>(
  text: null | string | undefined,
  fallback: T,
): T {
  const result = tryJsonParse<T>(text);
  return result.ok ? result.value : fallback;
}

/** 序列化 JSON；失败（循环引用等）时返回兜底字符串。 */
export function safeJsonStringify(value: unknown, fallback = ''): string {
  try {
    return JSON.stringify(value) ?? fallback;
  } catch {
    return fallback;
  }
}

const reportedFallbacks = new Set<string>();

/**
 * 上报一次"配置数据不合法导致的降级"。
 *
 * 为什么需要：解析配置（DSL / 节点参数 / 表单 schema）的失败点原先普遍是空 `catch`，
 * 配置写错时前端静默降级——排障时既没有报错也没有线索，只能靠猜。
 * 这里统一输出**一次性**告警（同一位置只报一次，避免每帧刷屏）：
 * 既不中断业务，也不再无声吞掉。
 */
export function reportConfigFallback(context: string, error?: unknown): void {
  if (reportedFallbacks.has(context)) return;
  reportedFallbacks.add(context);
  let detail = '';
  if (error !== undefined && error !== null) {
    detail = error instanceof Error ? error.message : String(error);
  }
  console.warn(
    `[config] ${context} 解析失败，已降级处理${detail ? `：${detail}` : ''}`,
  );
}
