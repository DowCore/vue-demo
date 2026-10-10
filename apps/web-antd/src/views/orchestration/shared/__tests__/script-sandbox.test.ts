/**
 * 前端脚本沙箱测试。
 *
 * 三条契约：
 * 1. **能力保留**——完整 JS（循环、闭包、map/reduce、模板字符串）必须能跑；
 * 2. **权限剥离**——宿主能力（window/document/fetch/存储）、原型链、反射 API 一律不可达；
 * 3. **不误伤**——`row.window`、`'opens a window'` 这类同名成员与字符串不能被当成越权。
 */
import { describe, expect, it } from 'vitest';

import {
  auditScriptSource,
  deepGuard,
  hasReturnStatement,
  isSandboxRunnable,
  MAX_SCRIPT_LENGTH,
  runSandboxedScript,
  scanScript,
  wrapScriptBody,
} from '../script-sandbox';

/** 取审计失败原因；成功时返回空串，便于统一断言并避免条件断言。 */
function rejectReason(source: string): string {
  const result = auditScriptSource(source);
  return result.ok ? '' : result.reason;
}

describe('auditScriptSource —— 能力保留（不误伤）', () => {
  const allowed: Array<[string, string]> = [
    ['纯表达式', 'value * 2'],
    [
      '完整 JS',
      'const t = row.items.reduce((s, x) => s + x.qty, 0); return t;',
    ],
    [
      'for...of',
      'let total = 0; for (const x of row.items) { total += x.qty; } return total;',
    ],
    ['if / 多语句', 'if (value > 100) { return "高"; } return "低";'],
    ['闭包', 'const make = (n) => (x) => x + n; return make(2)(3);'],
    ['模板字符串（含代码插值）', `return \`名称：\${row.name}\`;`],
    ['模板字符串（纯文本）', 'return `window is fine here`;'],
    ['Object.keys', 'return Object.keys(row).length;'],
    ['JSON', 'return JSON.stringify(row);'],
    ['Math / Date', 'return Math.round(Date.now() / 1000);'],
    ['正则字面量', String.raw`return /^1[3-9]\d{9}$/.test(String(value));`],
    [
      '有出口的 while(true)',
      'let n = 0; while (true) { if (n > 3) break; n += 1; } return n;',
    ],
    ['字面量下标', "return row['name'];"],
    ['数字下标', 'return row[0];'],
    ['标识符下标', 'return row[key];'],
    ['同名成员访问', 'return row.window + row.document;'],
    [
      '同名成员（parent/location/history）',
      'return row.parent + row.location + row.history;',
    ],
    ['字符串里出现禁用词', "return row.name + ' opens a window';"],
    ['可选链', 'return row?.a?.b ?? 0;'],
  ];

  it.each(allowed)('放行：%s', (_label, source) => {
    expect(auditScriptSource(source)).toEqual({ ok: true });
  });
});

describe('auditScriptSource —— 权限剥离', () => {
  const rejected: Array<[string, string]> = [
    ['window', 'return window.location.href;'],
    ['document', 'return document.cookie;'],
    ['globalThis', 'return globalThis;'],
    ['self', 'return self;'],
    ['top / parent / opener', 'return top;'],
    ['fetch', "return fetch('/api/admin');"],
    ['XMLHttpRequest', 'return new XMLHttpRequest();'],
    ['WebSocket', 'return new WebSocket("wss://evil");'],
    ['localStorage', 'return localStorage.getItem("token");'],
    ['indexedDB', 'return indexedDB;'],
    ['eval', 'return eval("1 + 1");'],
    ['new Function', 'return new Function("return 1")();'],
    ['importScripts', 'importScripts("/evil.js");'],
    ['动态 import', 'return import("/evil.js");'],
    ['require', 'return require("fs");'],
    ['process', 'return process.env;'],
    ['setTimeout', 'setTimeout(() => 1, 10);'],
    ['Worker', 'return new Worker("/evil.js");'],
    ['Proxy', 'return new Proxy({}, {});'],
    ['Reflect', "return Reflect.get(row, 'a');"],
    ['.constructor', "return 'x'.constructor;"],
    ['?.constructor', 'return row?.constructor;'],
    ['成员 constructor', 'return row.constructor;'],
    ['原型链经典逃逸', "return 'x'.constructor.constructor('return 1')();"],
    ['.__proto__', 'return row.__proto__;'],
    ['.prototype', 'return row.prototype;'],
    ["字面量下标 'constructor'", "return row['constructor'];"],
    ['转义字面量下标', String.raw`return row['\u0063onstructor'];`],
    ['拼接下标', "return row['con' + 'structor'];"],
    ['模板下标', 'return row[`constructor`];'],
    ['模板动态下标', `return row[\`con\${value}\`];`],
    ['Object.getPrototypeOf', 'return Object.getPrototypeOf(row);'],
    ['Object.defineProperty', "return Object.defineProperty(row, 'a', {});"],
    [
      '原型链经典逃逸（getPrototypeOf）',
      'return Object.getPrototypeOf("x").constructor;',
    ],
    ['裸 for(;;)', 'for (;;) {}'],
    ['无出口 while(true)', 'while (true) {}'],
    ['无出口 while(1)', 'while (1) { row.a = 1; }'],
  ];

  it.each(rejected)('拒绝：%s', (_label, source) => {
    expect(auditScriptSource(source).ok).toBe(false);
    expect(rejectReason(source).length).toBeGreaterThan(0);
  });

  it('模板字符串里的插值按代码审计', () => {
    expect(auditScriptSource(`return \`\${window.location}\`;`).ok).toBe(false);
  });

  it('超长源码被拒绝', () => {
    const result = auditScriptSource('a'.repeat(MAX_SCRIPT_LENGTH + 1));
    expect(result.ok).toBe(false);
  });
});

describe('scanScript —— 词法切分', () => {
  it('字符串内容不产生标识符 token', () => {
    const tokens = scanScript("'window.document'");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      type: 'string',
      value: 'window.document',
    });
  });

  it('模板字符串的插值内容按代码切分', () => {
    const tokens = scanScript(`\`a\${window.b}\``);
    expect(tokens.some((t) => t.type === 'ident' && t.value === 'window')).toBe(
      true,
    );
  });

  it('注释被忽略', () => {
    expect(scanScript('// window\na')).toHaveLength(1);
    expect(scanScript('/* window */ a')).toHaveLength(1);
  });

  it('解码 unicode 转义', () => {
    const tokens = scanScript(String.raw`'\u0063onstructor'`);
    expect(tokens[0]?.value).toBe('constructor');
  });
});

/** 用常量间接访问 __proto__，避开 no-restricted-properties（这里正是要验证它被挡住）。 */
const PROTO_KEY = '__proto__';

describe('deepGuard —— 原型链隔离', () => {
  it('危险键一律读不到', () => {
    const guarded = deepGuard({ a: 1 }) as Record<string, unknown>;
    expect(guarded.constructor).toBeUndefined();
    expect(guarded[PROTO_KEY]).toBeUndefined();
    expect(guarded.prototype).toBeUndefined();
    expect('constructor' in guarded).toBe(false);
  });

  it('自有构造器键也会被隐藏', () => {
    const guarded = deepGuard({ a: 1, constructor: 'evil' }) as Record<
      string,
      unknown
    >;
    expect(guarded.constructor).toBeUndefined();
    expect(Object.keys(guarded)).toEqual(['a']);
  });

  it('嵌套对象同样被代理', () => {
    const guarded = deepGuard({ a: { b: { c: 1 } } }) as any;
    expect(guarded.a.b.c).toBe(1);
    expect(guarded.a.constructor).toBeUndefined();
    expect(guarded.a.b.constructor).toBeUndefined();
    expect(guarded.a.b[PROTO_KEY]).toBeUndefined();
  });

  it('原型链被切断', () => {
    const guarded = deepGuard({ a: 1 });
    expect(Object.getPrototypeOf(guarded)).toBeNull();
    // setPrototypeOf 被拒绝时 Object.setPrototypeOf 会抛 TypeError，同样达到拦截效果
    expect(() => Object.setPrototypeOf(guarded, {})).toThrow(TypeError);
    expect(Object.getPrototypeOf(guarded)).toBeNull();
  });

  it('数组可正常迭代，元素仍被代理', () => {
    const guarded = deepGuard([{ n: 1 }, { n: 2 }]) as Array<{ n: number }>;
    expect(guarded.map((x) => x.n)).toEqual([1, 2]);
    expect([...guarded].length).toBe(2);
    const first = guarded[0] as unknown as Record<string, unknown>;
    expect(first.n).toBe(1);
    expect(first.constructor).toBeUndefined();
  });

  it('回调拿到的是被代理的元素', () => {
    const guarded = deepGuard([{ n: 1 }]) as Array<Record<string, unknown>>;
    const result = guarded.map((x) => x.constructor);
    expect(result).toEqual([undefined]);
  });

  it('map / Set 这类内部槽对象方法可正常调用', () => {
    const map = deepGuard(new Map([['k', { v: 1 }]])) as Map<
      string,
      Record<string, unknown>
    >;
    const value = map.get('k');
    expect(value?.v).toBe(1);
    expect(value?.constructor).toBeUndefined();
  });

  it('函数能力可调用且返回值被代理', () => {
    const capability = deepGuard((n: number) => ({ double: n * 2 })) as (
      n: number,
    ) => Record<string, unknown>;
    const result = capability(2);
    expect(result.double).toBe(4);
    expect(result.constructor).toBeUndefined();
    expect(
      (capability as unknown as Record<string, unknown>).constructor,
    ).toBeUndefined();
  });

  it('写入会被透传到底层对象', () => {
    const raw: Record<string, unknown> = { a: 1 };
    const guarded = deepGuard(raw) as Record<string, unknown>;
    guarded.b = 2;
    expect(raw.b).toBe(2);
    expect(guarded.constructor).toBeUndefined();
  });

  it('原始值原样返回', () => {
    expect(deepGuard(1)).toBe(1);
    expect(deepGuard('s')).toBe('s');
    expect(deepGuard(null)).toBeNull();
    expect(deepGuard(undefined)).toBeUndefined();
  });
});

describe('wrapScriptBody / hasReturnStatement —— 历史语义兼容', () => {
  it('无 return 时按表达式包一层', () => {
    expect(wrapScriptBody('value * 2')).toBe('return (value * 2);');
  });

  it('末尾分号不会包出语法错误', () => {
    expect(wrapScriptBody('formModel.total = value * 2;')).toBe(
      'return (formModel.total = value * 2);',
    );
    expect(wrapScriptBody('value.toFixed(2);')).toBe(
      'return (value.toFixed(2));',
    );
  });

  it('已有 return 时保留语句体', () => {
    expect(wrapScriptBody('return 1;')).toBe('return 1');
    expect(wrapScriptBody('const a = 1; return a;')).toBe(
      'const a = 1; return a',
    );
  });

  it('字符串里的 return 不当作语句', () => {
    expect(hasReturnStatement("row.name.indexOf('return')")).toBe(false);
    expect(wrapScriptBody("row.name.indexOf('return')")).toBe(
      "return (row.name.indexOf('return'));",
    );
  });

  it('空源码返回空串', () => {
    expect(wrapScriptBody('   ')).toBe('');
  });
});

describe('runSandboxedScript —— 执行', () => {
  it('完整 JS 可执行（循环 + 闭包 + reduce）', () => {
    const result = runSandboxedScript(
      'const total = row.items.reduce((s, x) => s + x.qty, 0); return total * value;',
      { row: { items: [{ qty: 2 }, { qty: 3 }] }, value: 2 },
    );
    expect(result).toEqual({ ok: true, value: 10 });
  });

  it('兼容 wrapExpression：裸表达式当返回值', () => {
    const result = runSandboxedScript(
      'value * 2',
      { value: 3 },
      { wrapExpression: true },
    );
    expect(result).toEqual({ ok: true, value: 6 });
  });

  it('可以写 formModel（事件脚本的核心用途）', () => {
    const formModel: Record<string, unknown> = {};
    const result = runSandboxedScript(
      'formModel.total = value * 2;',
      { formModel, value: 3 },
      { wrapExpression: true },
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(6);
    expect(formModel.total).toBe(6);
  });

  it('多语句事件脚本可执行', () => {
    const formModel: Record<string, unknown> = {};
    runSandboxedScript(
      'if (value > 100) { formModel.level = "高"; } else { formModel.level = "低"; }',
      { formModel, value: 200 },
    );
    expect(formModel.level).toBe('高');
  });

  it('返回值被规整为普通数据，不泄漏代理', () => {
    const row = { n: 1, nested: { deep: true } };
    const result = runSandboxedScript(
      'return { n: row.n, nested: row.nested };',
      { row },
    );
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ n: 1, nested: { deep: true } });
    expect(result.value).not.toBe(row);
    expect((result.value as any).nested).not.toBe(row.nested);
  });

  it('越权脚本不执行并返回原因', () => {
    const result = runSandboxedScript(
      "return 'x'.constructor.constructor('return 1')();",
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('constructor');
  });

  it('运行期错误被捕获', () => {
    const result = runSandboxedScript('return row.a.b.c;', { row: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('死循环脚本被静态拦下', () => {
    const result = runSandboxedScript('while (true) {}', {});
    expect(result.ok).toBe(false);
  });

  it('空源码直接通过', () => {
    expect(runSandboxedScript('', {}).ok).toBe(true);
    expect(runSandboxedScript(null, {}).ok).toBe(true);
    expect(runSandboxedScript(undefined, {})).toMatchObject({ ok: true });
  });

  it('脚本拿不到 window / document / fetch', () => {
    for (const source of [
      'return typeof window;',
      'return typeof document;',
      'return typeof fetch;',
      'return typeof localStorage;',
    ]) {
      expect(runSandboxedScript(source, {}).ok).toBe(false);
    }
  });
});

describe('isSandboxRunnable —— 设计器即时校验', () => {
  it('表达式 DSL 可覆盖的算可运行', () => {
    expect(isSandboxRunnable('row.a + row.b')).toBe(true);
    expect(isSandboxRunnable('value.toFixed(2)')).toBe(true);
  });

  it('完整 JS 算可运行', () => {
    expect(
      isSandboxRunnable('return row.items.reduce((s, x) => s + x.qty, 0);'),
    ).toBe(true);
    expect(isSandboxRunnable('return 1')).toBe(true);
  });

  it('越权或语法错误不可运行', () => {
    expect(isSandboxRunnable('window.alert(1)')).toBe(false);
    expect(isSandboxRunnable('new Function("return 1")()')).toBe(false);
    expect(isSandboxRunnable('row.__proto__')).toBe(false);
    expect(isSandboxRunnable('return row..a')).toBe(false);
  });

  it('空脚本算可运行', () => {
    expect(isSandboxRunnable('')).toBe(true);
    expect(isSandboxRunnable(null)).toBe(true);
    expect(isSandboxRunnable(undefined)).toBe(true);
  });
});
