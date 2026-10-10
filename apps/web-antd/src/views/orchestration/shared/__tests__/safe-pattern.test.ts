/**
 * 用户配置正则的安全编译测试。
 *
 * 目标：非法正则与 ReDoS 风险模式**不允许**被静默执行；
 * 无法安全校验时返回 `'skip'`（放过），而不是误报为用户输入错误。
 */
import { describe, expect, it } from 'vitest';

import {
  checkPattern,
  compileSafePattern,
  isRiskyPattern,
} from '../safe-pattern';

describe('compileSafePattern', () => {
  it('编译合法正则', () => {
    expect(compileSafePattern(String.raw`^\d+$`)).toEqual({
      ok: true,
      regex: expect.any(RegExp),
    });
  });

  it('未配置正则', () => {
    expect(compileSafePattern('')).toEqual({ ok: false, reason: '未配置正则' });
    expect(compileSafePattern(null)).toEqual({
      ok: false,
      reason: '未配置正则',
    });
    expect(compileSafePattern(undefined)).toEqual({
      ok: false,
      reason: '未配置正则',
    });
  });

  it('非法正则返回原因而不抛异常', () => {
    const result = compileSafePattern('(');
    if (result.ok) throw new Error('非法正则不应编译成功');
    expect(result.reason).toContain('正则不合法');
  });

  it('超长正则被拒绝', () => {
    const result = compileSafePattern('a'.repeat(201));
    if (result.ok) throw new Error('超长正则不应编译成功');
    expect(result.reason).toContain('200');
  });

  it('嵌套量词被拒绝', () => {
    const result = compileSafePattern('(a+)+');
    if (result.ok) throw new Error('嵌套量词正则不应编译成功');
    expect(result.reason).toContain('嵌套量词');
  });
});

describe('isRiskyPattern', () => {
  it('识别嵌套量词', () => {
    expect(isRiskyPattern('(a+)+')).toBe(true);
    expect(isRiskyPattern('(a*)*')).toBe(true);
    expect(isRiskyPattern(String.raw`(\d+){2,5}`)).toBe(true);
    expect(isRiskyPattern('[a-z]*{2,}')).toBe(true);
    expect(isRiskyPattern('(a+|b+)*')).toBe(true);
  });

  it('常规业务正则不误判', () => {
    expect(isRiskyPattern(String.raw`^\d{3}-\d{4}$`)).toBe(false);
    expect(isRiskyPattern('^[A-Za-z]+$')).toBe(false);
    expect(isRiskyPattern(String.raw`^1[3-9]\d{9}$`)).toBe(false);
    expect(isRiskyPattern(String.raw`^[^\s@]+@[^\s@]+\.[^\s@]+$`)).toBe(false);
  });
});

describe('checkPattern', () => {
  it('三态判定', () => {
    expect(checkPattern(String.raw`^\d+$`, '123')).toBe('pass');
    expect(checkPattern(String.raw`^\d+$`, 'abc')).toBe('fail');
  });

  it('空文本、非字符串输入按字符串处理', () => {
    expect(checkPattern(String.raw`^\d+$`, '')).toBe('skip');
    expect(checkPattern(String.raw`^\d+$`, null)).toBe('skip');
    expect(checkPattern(String.raw`^\d+$`, undefined)).toBe('skip');
    expect(checkPattern(String.raw`^\d+$`, 123)).toBe('pass');
  });

  it('无法安全校验时跳过而不是误报', () => {
    expect(checkPattern('(a+)+', 'aaa')).toBe('skip');
    expect(checkPattern('[', 'x')).toBe('skip');
    expect(checkPattern(undefined, 'x')).toBe('skip');
    expect(checkPattern('a'.repeat(201), 'a')).toBe('skip');
    expect(checkPattern(String.raw`^\d+$`, '1'.repeat(1001))).toBe('skip');
  });
});
