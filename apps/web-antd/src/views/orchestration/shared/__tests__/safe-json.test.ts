/**
 * JSON 解析安全封装测试。
 *
 * 后端配置（DSL / 表单 schema / vformJson）坏掉时不允许抛出未捕获异常，
 * 必须给出可判定的结果或明确错误信息。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  reportConfigFallback,
  safeJsonParse,
  safeJsonStringify,
  tryJsonParse,
} from '../safe-json';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tryJsonParse', () => {
  it('解析合法 JSON', () => {
    const result = tryJsonParse<{ a: number }>('{"a":1}');
    if (!result.ok) throw new Error('合法 JSON 不应解析失败');
    expect(result.value).toEqual({ a: 1 });
  });

  it('空内容返回明确错误', () => {
    expect(tryJsonParse('')).toEqual({ error: '内容为空', ok: false });
    expect(tryJsonParse('   ')).toEqual({ error: '内容为空', ok: false });
    expect(tryJsonParse(null)).toEqual({ error: '内容为空', ok: false });
    expect(tryJsonParse(undefined)).toEqual({ error: '内容为空', ok: false });
  });

  it('坏 JSON 返回错误信息而不抛异常', () => {
    const result = tryJsonParse('{bad');
    if (result.ok) throw new Error('坏 JSON 不应解析成功');
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });
});

describe('safeJsonParse', () => {
  it('成功时返回解析值', () => {
    expect(safeJsonParse<number[]>('[1,2]', [])).toEqual([1, 2]);
  });

  it('失败时返回兜底值', () => {
    expect(safeJsonParse('nope', { d: 1 })).toEqual({ d: 1 });
    expect(safeJsonParse(null, 'fallback')).toBe('fallback');
  });
});

describe('safeJsonStringify', () => {
  it('正常序列化', () => {
    expect(safeJsonStringify({ a: 1 })).toBe('{"a":1}');
  });

  it('循环引用时返回兜底值', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(safeJsonStringify(cyclic, 'failed')).toBe('failed');
  });

  it('undefined 时返回兜底值', () => {
    expect(safeJsonStringify(undefined, 'empty')).toBe('empty');
  });
});

describe('reportConfigFallback', () => {
  it('输出告警且同一上下文只报一次', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reportConfigFallback('测试上下文-A', new Error('坏数据'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('测试上下文-A');

    reportConfigFallback('测试上下文-A', new Error('坏数据'));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('不同上下文各自告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    reportConfigFallback('测试上下文-B');
    reportConfigFallback('测试上下文-C');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
