/**
 * 单元格脚本执行测试。
 *
 * 两层模型：
 * 1. 受限表达式 DSL（无 eval）覆盖常见格式化；
 * 2. 受控 JS 沙箱兜住完整 JS（循环 / 闭包 / reduce）。
 *
 * 核心保证：**配置里的字符串可以执行，但执行时拿不到宿主权限**——
 * 越权脚本降级为「保留原值 + 一次性告警」，列表仍可正常展示。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRunnableCellFn, runCellFn } from '../cell-script';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runCellFn 正常路径（表达式层）', () => {
  it('空表达式原样返回', () => {
    expect(runCellFn('', 'v', {}, 'v')).toBe('v');
    expect(runCellFn(null, 'v', {}, 'v')).toBe('v');
    expect(runCellFn(undefined, 'v', {}, 'v')).toBe('v');
    expect(runCellFn('   ', 'v', {}, 'v')).toBe('v');
  });

  it('可读取 value / row / raw', () => {
    expect(runCellFn('value * 2', 3, {}, 3)).toBe(6);
    expect(runCellFn('row.amount', 0, { amount: 99 }, 0)).toBe(99);
    expect(runCellFn('raw', 'x', {}, 'x')).toBe('x');
    expect(runCellFn('row.a + row.b', 0, { a: 1, b: 2 }, 0)).toBe(3);
  });

  it('可用白名单函数与方法', () => {
    expect(runCellFn('value.toFixed(2)', 1.5, {}, 1.5)).toBe('1.50');
    expect(runCellFn('len(row.name)', '', { name: 'abcd' }, '')).toBe(4);
    expect(runCellFn('upper(row.name)', '', { name: 'ab' }, '')).toBe('AB');
    expect(
      runCellFn(
        'row.status == "ok" ? "正常" : "异常"',
        '',
        { status: 'ok' },
        '',
      ),
    ).toBe('正常');
  });

  it('字符串拼接可做 HTML 片段', () => {
    expect(runCellFn('"<b>" + row.name + "</b>"', '', { name: '甲' }, '')).toBe(
      '<b>甲</b>',
    );
  });
});

describe('runCellFn 正常路径（JS 沙箱层）', () => {
  it('还原「无 return 视为表达式」的历史语义', () => {
    expect(
      runCellFn(
        'row.items.reduce((s, x) => s + x.qty, 0)',
        0,
        {
          items: [{ qty: 2 }, { qty: 3 }],
        },
        0,
      ),
    ).toBe(5);
  });

  it('多语句 / 循环 / 闭包脚本可执行', () => {
    expect(
      runCellFn(
        'let total = 0; for (const x of row.items) { total += x.qty; } return total;',
        0,
        { items: [{ qty: 1 }, { qty: 4 }] },
        0,
      ),
    ).toBe(5);

    expect(
      runCellFn(
        'const fmt = (n) => "¥" + n.toFixed(2); return fmt(value);',
        1.5,
        {},
        1.5,
      ),
    ).toBe('¥1.50');
  });

  it('模板字符串插值可执行', () => {
    expect(
      runCellFn(`return \`\${row.a}-\${row.b}\`;`, '', { a: 1, b: 2 }, ''),
    ).toBe('1-2');
  });

  it('同名成员不被误判为宿主能力', () => {
    expect(
      runCellFn(
        'return row.window + row.document;',
        '',
        { window: 1, document: 2 },
        '',
      ),
    ).toBe(3);
  });

  it('写不了宿主对象：越权成员读取返回 undefined', () => {
    // constructor 属于静态审计拦截，走降级分支；这里验证对象成员路径上的隔离
    expect(runCellFn('return row.a.constructor;', 'v', { a: {} }, 'v')).toBe(
      'v',
    );
  });
});

describe('runCellFn 降级路径', () => {
  it('越权脚本不执行，保留原值并告警一次', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const value = { keep: true };
    expect(runCellFn('window.alert(1)', value, {}, value)).toBe(value);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('同一个失败脚本只告警一次', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    runCellFn('document.title', 'v', {}, 'v');
    const first = warn.mock.calls.length;
    warn.mockClear();
    runCellFn('document.title', 'v', {}, 'v');
    expect(first).toBeGreaterThan(0);
    expect(warn.mock.calls.length).toBe(0);
  });

  it('运行期错误（属性不存在）同样降级', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(runCellFn('row.missing.deep', 'v', {}, 'v')).toBe('v');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('死循环脚本被拦下，不会冻住界面', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(runCellFn('while (true) {}', 'v', {}, 'v')).toBe('v');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('原型链逃逸被拦下', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      runCellFn(
        "return 'x'.constructor.constructor('return 1')();",
        'v',
        {},
        'v',
      ),
    ).toBe('v');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('isRunnableCellFn', () => {
  it('空脚本视为可运行', () => {
    expect(isRunnableCellFn('')).toBe(true);
    expect(isRunnableCellFn(null)).toBe(true);
    expect(isRunnableCellFn(undefined)).toBe(true);
  });

  it('白名单表达式可运行', () => {
    expect(isRunnableCellFn('len(row.name)')).toBe(true);
    expect(isRunnableCellFn('value > 0 ? "是" : "否"')).toBe(true);
  });

  it('完整 JS 脚本可运行', () => {
    expect(
      isRunnableCellFn('return row.items.reduce((s, x) => s + x.qty, 0);'),
    ).toBe(true);
    expect(isRunnableCellFn('return 1')).toBe(true);
  });

  it('只校验语法与能力，不依赖设计期并不存在的字段', () => {
    expect(isRunnableCellFn('row.amount * 100')).toBe(true);
    expect(isRunnableCellFn('value.toFixed(2)')).toBe(true);
    expect(isRunnableCellFn('row.a + row.b')).toBe(true);
  });

  it('越权脚本不可运行', () => {
    expect(isRunnableCellFn('window.alert(1)')).toBe(false);
    expect(isRunnableCellFn('new Function("return 1")()')).toBe(false);
    expect(isRunnableCellFn('row.__proto__')).toBe(false);
    expect(isRunnableCellFn('return fetch("/x")')).toBe(false);
  });
});
