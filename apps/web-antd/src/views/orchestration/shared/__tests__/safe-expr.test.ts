/**
 * safe-expr 求值器测试。
 *
 * 重点不是"表达式语言功能全不全"，而是**安全边界**：
 * 越权能力（全局对象、原型链、赋值、函数定义、正则）必须被拒绝，
 * 且合法场景下的取值/运算/白名单调用必须与预期一致。
 */
import { describe, expect, it } from 'vitest';

import {
  compileExpression,
  compileScript,
  isSafeExpression,
  isSafeScript,
  SafeExpressionError,
  tryCompileExpression,
  tryEvaluateExpression,
  tryRunScript,
} from '../safe-expr';

const FAILED = Symbol('failed');

/** 求值成功返回结果值，失败返回哨兵，便于统一断言。 */
function evaluate(
  source: string,
  scope: Record<string, unknown> = {},
): unknown {
  const result = tryEvaluateExpression(source, scope);
  return result.ok ? result.value : FAILED;
}

/** 执行脚本，失败返回哨兵。 */
function runScript(
  source: string,
  scope: Record<string, unknown> = {},
): unknown {
  const result = tryRunScript(source, scope);
  return result.ok ? result.value : FAILED;
}

function expectRejected(
  source: string,
  scope: Record<string, unknown> = {},
): void {
  expect(tryEvaluateExpression(source, scope).ok).toBe(false);
}

describe('字面量、取值与运算', () => {
  it('算术优先级与括号', () => {
    expect(evaluate('1 + 2 * 3')).toBe(7);
    expect(evaluate('(1 + 2) * 3')).toBe(9);
    expect(evaluate('10 / 4')).toBe(2.5);
    expect(evaluate('10 % 4')).toBe(2);
    expect(evaluate('-5 + 3')).toBe(-2);
    expect(evaluate('+"3"')).toBe(3);
  });

  it('比较与相等', () => {
    expect(evaluate('2 < 10')).toBe(true);
    expect(evaluate('"2" < "10"')).toBe(false);
    expect(evaluate('2 == "2"')).toBe(true);
    expect(evaluate('2 === "2"')).toBe(false);
    expect(evaluate('1 != 2')).toBe(true);
    expect(evaluate('null == undefined')).toBe(true);
    expect(evaluate('"a" === "a"')).toBe(true);
  });

  it('逻辑与三元', () => {
    expect(evaluate('!!"x"')).toBe(true);
    expect(evaluate('"x" || "y"')).toBe('x');
    expect(evaluate('"" || "y"')).toBe('y');
    expect(evaluate('"a" && "b"')).toBe('b');
    expect(evaluate('"" && "b"')).toBe('');
    expect(evaluate('1 > 0 ? "正" : "负"')).toBe('正');
  });

  it('字符串拼接', () => {
    expect(evaluate('"a" + 1')).toBe('a1');
    expect(evaluate('1 + 2 + "3"')).toBe('33');
  });

  it('字面量', () => {
    expect(evaluate('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(evaluate('{ a: 1, b: 2 }')).toEqual({ a: 1, b: 2 });
    expect(evaluate('"s"')).toBe('s');
    expect(evaluate('true')).toBe(true);
    expect(evaluate('false')).toBe(false);
    expect(evaluate('null')).toBeNull();
    expect(evaluate('undefined')).toBeUndefined();
    expect(Number.isNaN(evaluate('NaN'))).toBe(true);
  });

  it('未知标识符解析为 undefined，不做全局查找', () => {
    expect(evaluate('missing')).toBeUndefined();
    expect(evaluate('missing', { other: 1 })).toBeUndefined();
  });

  it('从作用域取值', () => {
    expect(evaluate('value', { value: 42 })).toBe(42);
    expect(evaluate('row.amount', { row: { amount: 7 } })).toBe(7);
    expect(evaluate('row.a + row.b', { row: { a: 1, b: 2 } })).toBe(3);
    expect(evaluate('map["k"]', { map: { k: 'v' } })).toBe('v');
    expect(evaluate('rows[0]', { rows: [10, 20] })).toBe(10);
    expect(evaluate('rows.length', { rows: [1, 2, 3] })).toBe(3);
    expect(evaluate('"abcd".length')).toBe(4);
    expect(evaluate('"abcd"[1]')).toBe('b');
  });

  it('可选链只对空值基线生效', () => {
    expect(evaluate('row?.amount', {})).toBeUndefined();
    expect(evaluate('row?.amount', { row: null })).toBeUndefined();
    expect(evaluate('row?.amount', { row: { amount: 7 } })).toBe(7);
    // 基线存在但属性缺失时仍然报错（与 JS 语义一致：?. 只保护空值）
    expectRejected('row?.missing', { row: {} });
    expectRejected('row.amount', {});
    expectRejected('row.amount', { row: null });
  });
});

describe('成员与下标的边界', () => {
  it('只允许自有属性', () => {
    expectRejected('row.missing', { row: {} });
    expectRejected('row.hasOwnProperty("x")', { row: {} });
    expectRejected('row.valueOf()', { row: {} });
    expectRejected('map.missing', { map: {} });
    // 白名单方法名会命中方法调用（不读属性、不触原型链）
    expect(evaluate('row.toString()', { row: {} })).toBe('{}');
  });

  it('字符串与数组只暴露 length', () => {
    expect.hasAssertions();
    expectRejected('"abcd".foo');
    expectRejected('rows.foo', { rows: [] });
    expectRejected('rows[0]', {});
  });

  it('禁止原型链相关键', () => {
    expect.hasAssertions();
    expectRejected('__proto__', {});
    expectRejected('row.__proto__', { row: {} });
    expectRejected("row['__proto__']", { row: {} });
    expectRejected('row.constructor', { row: {} });
    expectRejected('row.prototype', { row: {} });
    expectRejected('{ __proto__: 1 }');
    expectRejected('{ constructor: 1 }');
  });
});

describe('白名单全局函数', () => {
  it('字符串/数值工具', () => {
    expect(evaluate('len("abc")')).toBe(3);
    expect(evaluate('len(items)', { items: [1, 2, 3] })).toBe(3);
    expect(evaluate('upper("ab")')).toBe('AB');
    expect(evaluate('lower("AB")')).toBe('ab');
    expect(evaluate('trim("  x  ")')).toBe('x');
    expect(evaluate('substr("abcdef", 1, 3)')).toBe('bcd');
    expect(evaluate('left("abcdef", 2)')).toBe('ab');
    expect(evaluate('right("abcdef", 2)')).toBe('ef');
    expect(evaluate('pad("7", 3, "0")')).toBe('007');
    expect(evaluate('replace("a-b-c", "-", "+")')).toBe('a+b+c');
    expect(evaluate('concat("a", 1)')).toBe('a1');
    expect(evaluate('split("a,b", ",")')).toEqual(['a', 'b']);
    expect(evaluate('join(items, "-")', { items: ['a', 'b'] })).toBe('a-b');
    expect(evaluate('string(1)')).toBe('1');
  });

  it('数值与逻辑工具', () => {
    expect(evaluate('abs(-4)')).toBe(4);
    expect(evaluate('ceil(1.2)')).toBe(2);
    expect(evaluate('floor(1.8)')).toBe(1);
    expect(evaluate('round(3.14159, 2)')).toBe(3.14);
    expect(evaluate('pow(2, 10)')).toBe(1024);
    expect(evaluate('max(1, 5, 3)')).toBe(5);
    expect(evaluate('min(1, 5, 3)')).toBe(1);
    expect(evaluate('number("3.5")')).toBe(3.5);
    expect(evaluate('bool(0)')).toBe(false);
    expect(evaluate('bool([])')).toBe(true);
    expect(evaluate('blank("   ")')).toBe(true);
    expect(typeof evaluate('now()')).toBe('number');
  });

  it('default 只在空值时兜底', () => {
    expect(evaluate('default(value, "—")', {})).toBe('—');
    expect(evaluate('default(value, "—")', { value: 0 })).toBe(0);
    expect(evaluate('default(value, "—")', { value: '' })).toBe('');
    expect(evaluate('default(value, "—")', { value: null })).toBe('—');
  });

  it('函数必须被调用', () => {
    expect.hasAssertions();
    expectRejected('len');
  });
});

describe('白名单方法', () => {
  it('字符串方法', () => {
    expect(evaluate('name.charAt(1)', { name: 'abc' })).toBe('b');
    expect(evaluate('name.indexOf("b")', { name: 'abc' })).toBe(1);
    expect(evaluate('name.includes("bc")', { name: 'abc' })).toBe(true);
    expect(evaluate('name.startsWith("ab")', { name: 'abc' })).toBe(true);
    expect(evaluate('name.endsWith("bc")', { name: 'abc' })).toBe(true);
    expect(evaluate('name.padStart(5, "0")', { name: 'abc' })).toBe('00abc');
    expect(evaluate('name.padEnd(5, "0")', { name: 'abc' })).toBe('abc00');
    expect(evaluate('name.repeat(2)', { name: 'ab' })).toBe('abab');
    expect(evaluate('name.replace("b", "X")', { name: 'abc' })).toBe('aXc');
    expect(evaluate('name.slice(1, 3)', { name: 'abcdef' })).toBe('bc');
    expect(evaluate('name.substring(1, 3)', { name: 'abcdef' })).toBe('bc');
    expect(evaluate('name.toUpperCase()', { name: 'ab' })).toBe('AB');
    expect(evaluate('name.toLowerCase()', { name: 'AB' })).toBe('ab');
    expect(evaluate('name.trim()', { name: ' x ' })).toBe('x');
    expect(evaluate('name.split(",").length', { name: 'a,b' })).toBe(2);
  });

  it('数值与数组方法', () => {
    expect(evaluate('value.toFixed(2)', { value: 1.5 })).toBe('1.50');
    expect(evaluate('value.toString()', { value: 42 })).toBe('42');
    expect(evaluate('default(value, 0).toFixed(2)', { value: null })).toBe(
      '0.00',
    );
    // 空值上调用方法会被拒绝（fail-closed，由调用方决定如何兜底）
    expectRejected('value.toFixed(2)', { value: null });
    expectRejected('value.toFixed(2)', {});
    expect(evaluate('items.join("-")', { items: [1, 2] })).toBe('1-2');
    expect(evaluate('items.includes(2)', { items: [1, 2] })).toBe(true);
    expect(evaluate('items.indexOf(2)', { items: [1, 2] })).toBe(1);
    expect(evaluate('items.slice(1).length', { items: [1, 2, 3] })).toBe(2);
    expect(evaluate('items.concat(3).length', { items: [1, 2] })).toBe(3);
  });

  it('未白名单的方法不可调用', () => {
    expect.hasAssertions();
    expectRejected('items.map(1)', { items: [1, 2] });
    expectRejected('items.filter(1)', { items: [1, 2] });
    expectRejected('items.push(1)', { items: [] });
    expectRejected('name.match(1)', { name: 'a' });
  });

  it('参数类型不可转换时抛错', () => {
    expect.hasAssertions();
    expectRejected('value.charAt("x")', { value: 'abc' });
  });
});

describe('越权能力一律拒绝', () => {
  const forbidden: Array<[string, Record<string, unknown>]> = [
    ['window', {}],
    ['window.location.href', {}],
    ['document', {}],
    ['document.cookie', {}],
    ['globalThis', {}],
    ['self', {}],
    ['top', {}],
    ['parent', {}],
    ['location', {}],
    ['navigator', {}],
    ['localStorage', {}],
    ['sessionStorage', {}],
    ['process', {}],
    ['require', {}],
    ['module', {}],
    ['exports', {}],
    ['Math.max(1, 2)', {}],
    ['Object.keys(row)', { row: {} }],
    ['Reflect.get(row, "a")', { row: {} }],
    ['JSON.stringify(row)', { row: {} }],
    ['Promise.resolve(1)', {}],
    ['Symbol("x")', {}],
    ['Date.now()', {}],
    ['fetch("/api")', {}],
    ['XMLHttpRequest', {}],
    ['WebSocket', {}],
    ['setTimeout(1, 1)', {}],
    ['setInterval(1, 1)', {}],
    ['alert(1)', {}],
    ['confirm("x")', {}],
    ['prompt("x")', {}],
    ['console.log(1)', {}],
    ['eval("1 + 1")', {}],
    ['new Date()', {}],
    ['(() => 1)()', {}],
    ['(function () { return 1 })()', {}],
    ['/a/.test("a")', {}],
    ['this', {}],
    ['row.constructor.constructor("return 1")()', { row: {} }],
  ];

  it.each(forbidden)('拒绝 %s', (source, scope) => {
    expect.hasAssertions();
    expectRejected(source, scope);
  });

  it('表达式不允许赋值语句', () => {
    expect.hasAssertions();
    expectRejected('a = 1');
    expectRejected('formModel.a = 1');
  });
});

describe('脚本：只允许受控写入 formModel', () => {
  it('formModel.字段 = 表达式 是唯一副作用', () => {
    const formModel: Record<string, unknown> = {};
    expect(
      runScript('formModel.total = value * 2', { formModel, value: 21 }),
    ).not.toBe(FAILED);
    expect(formModel.total).toBe(42);
  });

  it('多条语句按顺序执行', () => {
    const formModel: Record<string, unknown> = { a: 1 };
    runScript(
      'formModel.b = formModel.a + 1;\nformModel.c = formModel.b * 10',
      { formModel },
    );
    expect(formModel).toEqual({ a: 1, b: 2, c: 20 });
  });

  it('其余赋值目标被拒绝', () => {
    expect(runScript('row.x = 1', { row: {} })).toBe(FAILED);
    expect(runScript('formModel.__proto__ = 1', { formModel: {} })).toBe(
      FAILED,
    );
    expect(runScript('window.a = 1', { formModel: {} })).toBe(FAILED);
  });

  it('没有 formModel 时脚本不产生写入', () => {
    expect(runScript('formModel.x = 1', {})).not.toBe(FAILED);
  });

  it('语法错误的脚本不执行', () => {
    expect(tryRunScript('formModel.a = (', { formModel: {} }).ok).toBe(false);
    expect(tryRunScript('formModel.a = window.x', { formModel: {} }).ok).toBe(
      false,
    );
  });
});

describe('编译缓存与对外判定 API', () => {
  it('相同表达式返回同一个求值函数', () => {
    const compiled = compileExpression('value + 1');
    expect(compiled({ value: 1 })).toBe(2);
    expect(compiled({ value: 41 })).toBe(42);
    expect(compileExpression('value + 1')).toBe(compiled);
  });

  it('失败结果同样被缓存并抛 SafeExpressionError', () => {
    expect(() => compileExpression('window')).toThrow(SafeExpressionError);
    expect(() => compileExpression('window')).toThrow(SafeExpressionError);
  });

  it('空表达式被拒绝', () => {
    expect(tryCompileExpression('')).toEqual({
      error: '表达式为空',
      ok: false,
    });
    expect(() => compileScript('')).toThrow(SafeExpressionError);
    expect(() => compileScript('   ')).toThrow(SafeExpressionError);
  });

  it('isSafeExpression / isSafeScript 判定', () => {
    expect(isSafeExpression('len(row.name)')).toBe(true);
    expect(isSafeExpression('window.x')).toBe(false);
    expect(isSafeExpression('a = 1')).toBe(false);
    expect(isSafeScript('formModel.a = 1')).toBe(true);
    expect(isSafeScript('window.a = 1')).toBe(false);
  });

  it('历史 JS 代码（含 return / 正则）判定为不可执行', () => {
    expect(isSafeExpression('return 1')).toBe(false);
    expect(isSafeExpression('if (a) { return 1 }')).toBe(false);
    expect(isSafeExpression('typeof row')).toBe(false);
  });
});
