/**
 * 前端脚本沙箱 —— 让「可执行脚本」重新可用，同时把它的权限关进笼子。
 *
 * ## 为什么不是「一律禁止执行」
 * 编排脚本（列 `formatFn` / `renderFn`、vform 组件事件、流程节点 Code 脚本）是**配置**，
 * 不是攻击载荷。它们由平台使用者撰写、存进业务库、由平台自己加载执行——这正是低代码
 * 平台的核心能力，禁止执行等于砍掉产品本身。
 *
 * ## 真正的风险在哪里
 * 风险不在「脚本会运行」，而在**脚本顺带获得的权限**。旧实现把脚本放进宿主页面的全局
 * 作用域用 `new Function` 直接跑，脚本因此白拿了一整套环境能力：
 * - `document` / `window` → 可读写宿主页面，构成存储型 XSS；
 * - `localStorage` / `sessionStorage` → 可窃取登录态；
 * - `fetch` / `XMLHttpRequest` → 可用当前登录身份打后端接口；
 * - 原型链 → `'x'.constructor.constructor('…')()` 绕回 `Function`；
 * - 同步死循环 → 直接冻死 UI。
 *
 * 还要注意「库里的脚本天然可信」这个前提并不成立：**代码的可信度等于写入该字段的权限**。
 * 只要租户管理员、模板导入、跨环境数据同步任一路径能改到这些字段，它就是**半可信代码**。
 *
 * ## 所以采用「隔离」而不是「消灭」
 * 三件事，都不牺牲表达能力：
 * 1. **能力白名单**：脚本只能看到调用方显式注入的 scope 键；其余全局标识符一律遮蔽为
 *    `undefined`（见 {@link SHADOWED_GLOBALS}）。
 * 2. **原型链隔离**：scope 里的对象 / 数组 / 函数经 {@link deepGuard} 递归代理，
 *    `constructor` / `__proto__` / `prototype` 等键一律读不到，方法返回值同样被代理，
 *    不留裸对象缺口。
 * 3. **词法策略审计**：{@link auditScriptSource} 在真正 `new Function` 之前扫一遍源码，
 *    拒绝裸全局访问、危险成员名、动态下标、无出口死循环。
 *
 * 脚本依旧是完整 JS：`const` / `let`、`for` / `map` / `filter` / `reduce`、闭包、
 * `JSON`、`Math`、`Date`、正则字面量、模板字符串都能用。
 *
 * ## 仍未覆盖的边界（要如实说明）
 * - **同步路径没有硬超时**。主线程上的死循环无法被中断，审计只能拦住显式死循环
 *   （`for(;;)`、无 `break/return/throw` 的 `while(true)`），拦不住 `while (i-- > 0)`
 *   这种写错边界的慢循环。需要硬超时的重计算请走异步 Worker 沙箱或后端 Code 脚本。
 * - **动态下标**：`obj[key]` 允许（保留 `row[fieldName]` 这类写法），因此理论上仍可用
 *   数据驱动的键名去访问**原始类型**的 `constructor`。要连续凑齐多个数据可控键名才可能
 *   成功，且对象路径已被代理封堵；如需完全封死，可把下标限制为纯字面量。
 * - 是否允许执行脚本本身应由**授权**控制（谁可以编辑这些字段），前端沙箱只负责
 *   「最坏情况下也伤不到宿主」，不能替代后端鉴权。
 */
import { tryCompileExpression } from './safe-expr';

/* ------------------------------------------------------------------ *
 * 策略常量
 * ------------------------------------------------------------------ */

/** 脚本源码长度上限，纯粹为了控制解析成本。 */
export const MAX_SCRIPT_LENGTH = 20_000;

/**
 * 危险成员名：出现在 `.name`、`?.name` 或 `['name']` 位置时一律拒绝。
 * 这些名字是原型链逃逸的必经之路（`'x'.constructor` 就能拿到 `String`，
 * 再 `.constructor` 即 `Function`）。
 */
export const DANGEROUS_MEMBERS: ReadonlySet<string> = new Set([
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
  'callee',
  'caller',
  'constructor',
  'defineProperties',
  'defineProperty',
  'getOwnPropertyDescriptor',
  'getPrototypeOf',
  'prototype',
  'setPrototypeOf',
]);

/**
 * 裸标识符禁用表：只要**不是** `a.window` 这种成员访问，就拒绝。
 * 这里列的是宿主环境能力，不是语法关键字。
 */
export const DANGEROUS_GLOBALS: ReadonlySet<string> = new Set([
  'alert',
  'BroadcastChannel',
  'Bun',
  'caches',
  'close',
  'confirm',
  'Deno',
  'document',
  'eval',
  'EventSource',
  'fetch',
  'frames',
  'Function',
  'globalThis',
  'history',
  'import',
  'importScripts',
  'indexedDB',
  'localStorage',
  'location',
  'MessageChannel',
  'MessagePort',
  'navigator',
  'open',
  'opener',
  'parent',
  'postMessage',
  'process',
  'prompt',
  'Proxy',
  'queueMicrotask',
  'Reflect',
  'requestAnimationFrame',
  'require',
  'self',
  'sessionStorage',
  'setImmediate',
  'setInterval',
  'setTimeout',
  'SharedWorker',
  'top',
  'WebSocket',
  'window',
  'Worker',
  'XMLHttpRequest',
]);

/**
 * 需要遮蔽为 `undefined` 的全局名（作为函数形参注入）。
 *
 * 注意：`eval` / `arguments` **不能**出现在这里——严格模式下它们是非法形参名，
 * `new Function('eval', '"use strict"; …')` 会直接抛 SyntaxError。
 * 这两者由 {@link DANGEROUS_GLOBALS} 的审计规则拦截。
 */
const SHADOWED_GLOBALS: readonly string[] = [
  'BroadcastChannel',
  'Bun',
  'Deno',
  'EventSource',
  'Function',
  'MessageChannel',
  'MessagePort',
  'Proxy',
  'Reflect',
  'SharedWorker',
  'WebSocket',
  'Worker',
  'XMLHttpRequest',
  'alert',
  'caches',
  'close',
  'confirm',
  'document',
  'fetch',
  'frames',
  'globalThis',
  'history',
  'importScripts',
  'indexedDB',
  'localStorage',
  'location',
  'navigator',
  'open',
  'opener',
  'parent',
  'postMessage',
  'process',
  'prompt',
  'queueMicrotask',
  'requestAnimationFrame',
  'require',
  'self',
  'sessionStorage',
  'setImmediate',
  'setInterval',
  'setTimeout',
  'top',
  'window',
];

/** 允许透传的 well-known Symbol；其余 Symbol 读取一律拒绝。 */
const ALLOWED_SYMBOLS: ReadonlySet<symbol> = new Set<symbol>([
  Symbol.asyncIterator,
  Symbol.iterator,
  Symbol.toPrimitive,
  Symbol.toStringTag,
]);

const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

/* ------------------------------------------------------------------ *
 * 词法扫描（只切分，不做完整语法解析）
 * ------------------------------------------------------------------ */

interface Token {
  /** 模板字符串里含 `${}` 时为 true，表示值不是静态字面量。 */
  dynamic: boolean;
  type: 'ident' | 'number' | 'punct' | 'string';
  value: string;
}

/** 解码字面量里的常见转义，使 `'\u0063onstructor'` 也能与 `constructor` 比对。 */
function decodeLiteral(raw: string): string {
  let out = '';
  let index = 0;
  while (index < raw.length) {
    const ch = raw[index];
    if (ch !== '\\') {
      out += ch;
      index += 1;
      continue;
    }
    const next = raw[index + 1];
    if (next === 'u') {
      const braced = raw[index + 2] === '{';
      const width = braced ? 6 : 4;
      const hex = raw.slice(
        index + (braced ? 3 : 2),
        index + (braced ? 3 : 2) + width,
      );
      const code = Number.parseInt(hex.replace('}', ''), 16);
      out += Number.isNaN(code) ? `\\u` : String.fromCodePoint(code);
      index += braced ? hex.length + 4 : 6;
      continue;
    }
    if (next === 'x') {
      const code = Number.parseInt(raw.slice(index + 2, index + 4), 16);
      out += Number.isNaN(code) ? String.raw`\x` : String.fromCodePoint(code);
      index += 4;
      continue;
    }
    const simple: Record<string, string> = {
      '0': '\0',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
    };
    out += simple[next ?? ''] ?? next ?? '';
    index += 2;
  }
  return out;
}

/**
 * 把源码切成策略检查需要的 token 流。
 *
 * 关键点：**模板字符串里的 `${}` 按代码继续切分**，这样 `` `${window.x}` ``
 * 不会被当成一个无害的字符串字面量跳过。
 */
export function scanScript(source: string): Token[] {
  const tokens: Token[] = [];
  const length = source.length;
  /** 每个模板字面量进入 `${` 时的花括号深度，用于判断 `}` 是「回到模板」还是普通块。 */
  const templateStack: number[] = [];
  /** 模板字面量的文本累加器栈，闭合时产出 string token。 */
  const templateAccums: Array<{ dynamic: boolean; text: string }> = [];
  let braceDepth = 0;
  let index = 0;
  let mode: 'block' | 'code' | 'line' | 'tpl' = 'code';

  while (index < length) {
    const ch = source[index] as string;
    const next = source[index + 1] as string | undefined;

    if (mode === 'line') {
      if (ch === '\n') mode = 'code';
      index += 1;
      continue;
    }

    if (mode === 'block') {
      if (ch === '*' && next === '/') {
        mode = 'code';
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (mode === 'tpl') {
      const accum = templateAccums.at(-1);
      if (ch === '\\') {
        if (accum) accum.text += ch + (next ?? '');
        index += 2;
        continue;
      }
      if (ch === '$' && next === '{') {
        if (accum) accum.dynamic = true;
        templateStack.push(braceDepth + 1);
        braceDepth += 1;
        mode = 'code';
        index += 2;
        continue;
      }
      if (ch === '`') {
        const closed = templateAccums.pop();
        tokens.push({
          dynamic: closed?.dynamic ?? false,
          type: 'string',
          value: decodeLiteral(closed?.text ?? ''),
        });
        mode = 'code';
        index += 1;
        continue;
      }
      if (accum) accum.text += ch;
      index += 1;
      continue;
    }

    if (ch === '/') {
      if (next === '/') {
        mode = 'line';
        index += 2;
        continue;
      }
      if (next === '*') {
        mode = 'block';
        index += 2;
        continue;
      }
      tokens.push({ dynamic: false, type: 'punct', value: '/' });
      index += 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const { end, text } = readQuoted(source, index, ch);
      tokens.push({
        dynamic: false,
        type: 'string',
        value: decodeLiteral(text),
      });
      index = end;
      continue;
    }

    if (ch === '`') {
      templateAccums.push({ dynamic: false, text: '' });
      mode = 'tpl';
      index += 1;
      continue;
    }

    if (
      ch === ' ' ||
      ch === '\t' ||
      ch === '\n' ||
      ch === '\r' ||
      ch === '\f' ||
      ch === '\v'
    ) {
      index += 1;
      continue;
    }

    if (isDigit(ch) || (ch === '.' && next !== undefined && isDigit(next))) {
      let end = index;
      while (end < length && /[\d.eE+\-_]/.test(source[end] as string))
        end += 1;
      tokens.push({
        dynamic: false,
        type: 'number',
        value: source.slice(index, end),
      });
      index = end;
      continue;
    }

    if (isIdentifierStart(ch)) {
      let end = index;
      while (end < length && isIdentifierPart(source[end] as string)) end += 1;
      tokens.push({
        dynamic: false,
        type: 'ident',
        value: source.slice(index, end),
      });
      index = end;
      continue;
    }

    if (ch === '?' && next === '.') {
      tokens.push({ dynamic: false, type: 'punct', value: '?.' });
      index += 2;
      continue;
    }

    if (ch === '{') braceDepth += 1;
    if (ch === '}') {
      braceDepth -= 1;
      const expected = templateStack.at(-1);
      if (expected !== undefined && braceDepth < expected) {
        templateStack.pop();
        mode = 'tpl';
        index += 1;
        continue;
      }
    }

    tokens.push({ dynamic: false, type: 'punct', value: ch });
    index += 1;
  }

  return tokens;
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

function isIdentifierPart(ch: string): boolean {
  return IDENTIFIER_PATTERN.test(`a${ch}`);
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

/** 读取普通字符串字面量（单/双引号）。模板字符串由 {@link scanScript} 的主循环处理。 */
function readQuoted(
  source: string,
  start: number,
  quote: string,
): { end: number; text: string } {
  let index = start + 1;
  let text = '';
  while (index < source.length) {
    const ch = source[index] as string;
    if (ch === '\\') {
      text += ch + (source[index + 1] ?? '');
      index += 2;
      continue;
    }
    if (ch === quote) return { end: index + 1, text };
    // 未闭合的普通字符串只会出现在语法错误里：在此收手，避免吞掉后续代码
    if (ch === '\n') break;
    text += ch;
    index += 1;
  }
  return { end: source.length, text };
}

/* ------------------------------------------------------------------ *
 * 静态策略审计
 * ------------------------------------------------------------------ */

export type ScriptAudit = { ok: false; reason: string } | { ok: true };

const AUDIT_PASS: ScriptAudit = { ok: true };

/** 判断 `}` 之前是否只有「一个字面量 / 一个标识符」，否则视为动态下标。 */
function checkBracketIndex(tokens: Token[], openIndex: number): null | string {
  const inner: Token[] = [];
  let depth = 0;
  for (let index = openIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index] as Token;
    if (
      token.type === 'punct' &&
      (token.value === '[' || token.value === '(' || token.value === '{')
    ) {
      depth += 1;
    }
    if (
      token.type === 'punct' &&
      (token.value === ']' || token.value === ')' || token.value === '}')
    ) {
      if (depth === 0 && token.value === ']') break;
      depth -= 1;
    }
    inner.push(token);
  }

  if (inner.length !== 1) {
    return '下标必须是单个字面量或标识符（禁止拼接、调用等动态下标）';
  }
  const only = inner[0] as Token;
  if (only.type === 'string') {
    if (only.dynamic) return '下标不能是含插值的模板字符串';
    if (DANGEROUS_MEMBERS.has(only.value)) {
      return `禁止访问危险成员「${only.value}」`;
    }
    return null;
  }
  if (only.type === 'number' || only.type === 'ident') return null;
  return '下标必须是单个字面量或标识符';
}

/**
 * 检查循环是否可能永不退出。
 *
 * 只看两种显式写法：`for(;;)` 与 `while(true|1)`。
 * 后者要求循环体内出现 `break` / `return` / `throw`，否则拒绝。
 */
function checkLoops(tokens: Token[]): null | string {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as Token;
    if (token.type !== 'ident') continue;

    if (token.value === 'for') {
      const slice = tokens
        .slice(index + 1, index + 5)
        .map((item) => item.value)
        .join('');
      if (slice === '(;;)') {
        return '禁止使用不设条件的 for(;;) 死循环（同步执行会冻死界面）';
      }
      continue;
    }

    if (token.value !== 'while') continue;

    const condition = tokens.slice(index + 1, index + 4);
    const subject = condition[1];
    const isForever =
      condition.length === 3 &&
      condition[0]?.value === '(' &&
      condition[2]?.value === ')' &&
      subject !== undefined &&
      ((subject.type === 'ident' && subject.value === 'true') ||
        (subject.type === 'number' && subject.value === '1'));
    if (!isForever) continue;

    let depth = 0;
    let hasExit = false;
    for (let cursor = index + 4; cursor < tokens.length; cursor += 1) {
      const inner = tokens[cursor] as Token;
      if (inner.type === 'punct' && inner.value === '{') depth += 1;
      if (inner.type === 'punct' && inner.value === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
      if (
        inner.type === 'ident' &&
        (inner.value === 'break' ||
          inner.value === 'return' ||
          inner.value === 'throw')
      ) {
        hasExit = true;
      }
    }
    if (!hasExit) {
      return '禁止使用没有 break/return/throw 的 while(true) 死循环（同步执行会冻死界面）';
    }
  }
  return null;
}

/**
 * 审计脚本源码。通过后才可以交给 {@link buildScriptFunction} 构造。
 */
export function auditScriptSource(source: string): ScriptAudit {
  if (source.length > MAX_SCRIPT_LENGTH) {
    return { ok: false, reason: `脚本长度超过 ${MAX_SCRIPT_LENGTH} 字符上限` };
  }

  const tokens = scanScript(source);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as Token;

    if (token.type === 'punct' && token.value === '[') {
      const issue = checkBracketIndex(tokens, index);
      if (issue) return { ok: false, reason: issue };
      continue;
    }

    if (token.type !== 'ident') continue;

    const previous = tokens[index - 1];
    const isMemberAccess =
      previous !== undefined &&
      previous.type === 'punct' &&
      (previous.value === '.' || previous.value === '?.');

    if (isMemberAccess) {
      if (DANGEROUS_MEMBERS.has(token.value)) {
        return { ok: false, reason: `禁止访问危险成员「.${token.value}」` };
      }
      continue;
    }

    if (DANGEROUS_GLOBALS.has(token.value)) {
      return {
        ok: false,
        reason: `禁止访问宿主能力「${token.value}」，脚本只能使用显式注入的变量`,
      };
    }
  }

  const loopIssue = checkLoops(tokens);
  if (loopIssue) return { ok: false, reason: loopIssue };

  return AUDIT_PASS;
}

/* ------------------------------------------------------------------ *
 * 原型链隔离（能力代理）
 * ------------------------------------------------------------------ */

const rawToGuard = new WeakMap<object, object>();
const guardToRaw = new WeakMap<object, object>();

function isObjectLike(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}

function isBlockedKey(key: PropertyKey): boolean {
  if (typeof key === 'string') return DANGEROUS_MEMBERS.has(key);
  return !ALLOWED_SYMBOLS.has(key as symbol);
}

/** Map / Set / Date 这类带内部槽的对象，方法必须绑定到原始目标才不会报 receiver 错。 */
function needsBind(target: object): boolean {
  if (Array.isArray(target)) return false;
  const proto: unknown = Object.getPrototypeOf(target);
  return proto !== null && proto !== Object.prototype;
}

/**
 * 把函数包成能力代理：读取危险键返回 `undefined`，返回值继续递归代理。
 *
 * `getPrototypeOf` 固定返回 `null`，堵住 `Object.getPrototypeOf(fn).constructor` 这条路。
 */
function guardCallable(
  fn: (...args: unknown[]) => unknown,
  owner: object,
): object {
  return new Proxy(fn, {
    apply(target, thisArg, args: unknown[]) {
      return deepGuard(Reflect.apply(target, thisArg, args));
    },
    construct(target, args: unknown[], newTarget) {
      return deepGuard(Reflect.construct(target, args, newTarget));
    },
    get(target, key) {
      if (isBlockedKey(key)) return undefined;
      const value = Reflect.get(target, key, owner);
      return isObjectLike(value) ? guardCallable(value as never, owner) : value;
    },
    getPrototypeOf() {
      return null;
    },
    setPrototypeOf() {
      return false;
    },
  });
}

/**
 * 递归代理注入给脚本的值。
 *
 * 只在「宿主对象进入脚本」这一个方向上使用，脚本自己 new 出来的对象不需要代理。
 */
export function deepGuard<T>(value: T): T {
  if (!isObjectLike(value)) return value;

  const cached = rawToGuard.get(value);
  if (cached !== undefined) return cached as T;

  if (typeof value === 'function') {
    const guarded = guardCallable(value as never, value);
    rawToGuard.set(value, guarded);
    return guarded as T;
  }

  const proxy = new Proxy(value, {
    defineProperty(target, key, descriptor) {
      if (isBlockedKey(key)) return false;
      return Reflect.defineProperty(target, key, descriptor);
    },
    deleteProperty(target, key) {
      if (isBlockedKey(key)) return false;
      return Reflect.deleteProperty(target, key);
    },
    get(target, key) {
      if (isBlockedKey(key)) return undefined;
      const result = Reflect.get(target, key);
      if (typeof result === 'function') {
        const bound = needsBind(target) ? result.bind(target) : result;
        return guardCallable(bound, target);
      }
      return deepGuard(result);
    },
    getOwnPropertyDescriptor(target, key) {
      if (isBlockedKey(key)) return undefined;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
    getPrototypeOf() {
      return null;
    },
    has(target, key) {
      if (isBlockedKey(key)) return false;
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      return Reflect.ownKeys(target).filter((key) => !isBlockedKey(key));
    },
    set(target, key, incoming) {
      if (isBlockedKey(key)) return false;
      return Reflect.set(target, key, unwrapGuard(incoming));
    },
    setPrototypeOf() {
      return false;
    },
  }) as T;

  rawToGuard.set(value, proxy as object);
  guardToRaw.set(proxy as object, value);
  return proxy;
}

/** 脚本若把代理对象写回宿主状态，落库/落状态时应还原成原始对象。 */
function unwrapGuard(value: unknown): unknown {
  if (!isObjectLike(value)) return value;
  return guardToRaw.get(value) ?? value;
}

/* ------------------------------------------------------------------ *
 * 执行
 * ------------------------------------------------------------------ */

export interface ScriptRunResult<T = unknown> {
  error?: string;
  ok: boolean;
  value?: T;
}

export interface SandboxRunOptions {
  /**
   * 兼容旧语义：源码里没有 `return` 时，把它当作表达式并自动包成 `return (…);`。
   * 列 `formatFn` / `renderFn` 需要打开；组件事件脚本按语句执行，不打开。
   */
  wrapExpression?: boolean;
}

const fnCache = new Map<
  string,
  { fn: (...args: unknown[]) => unknown; keys: string[] }
>();
const FN_CACHE_LIMIT = 200;

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  try {
    return String(error);
  } catch {
    return '未知错误';
  }
}

/** 源码里是否真的出现 `return` 语句（按 token 判断，不受字符串内容干扰）。 */
export function hasReturnStatement(source: string): boolean {
  return scanScript(source).some(
    (token) => token.type === 'ident' && token.value === 'return',
  );
}

/** 复刻历史 `wrapBody` 语义：无 `return` 则按表达式处理。 */
export function wrapScriptBody(source: string): string {
  // 末尾分号要去掉，否则会包出 `return (expr;);` 这种语法错误
  const body = source.trim().replace(/;+\s*$/, '');
  if (!body) return '';
  if (hasReturnStatement(body)) return body;
  return `return (${body});`;
}

/**
 * 构造沙箱函数。
 *
 * 形参 = 调用方注入的 scope 键 + 遮蔽全局名；函数体前置 `"use strict"`，
 * 因此 `this` 为 `undefined`，且无法用 `with` / 八进制字面量等历史后门。
 */
export function buildScriptFunction(
  body: string,
  scopeKeys: readonly string[],
): { fn: (...args: unknown[]) => unknown; keys: string[] } {
  const keys = scopeKeys.filter(
    (key) => IDENTIFIER_PATTERN.test(key) && !SHADOWED_GLOBALS.includes(key),
  );
  const params = [...new Set([...keys, ...SHADOWED_GLOBALS])];
  const cacheKey = `${keys.join(',')}\u0000${body}`;
  const cached = fnCache.get(cacheKey);
  if (cached) return cached;

  // oxlint-disable-next-line no-new-func
  const fn = new Function(...params, `"use strict";\n${body}\n`) as (
    ...args: unknown[]
  ) => unknown;

  const entry = { fn, keys };
  if (fnCache.size >= FN_CACHE_LIMIT) {
    const oldest = fnCache.keys().next();
    if (!oldest.done) fnCache.delete(oldest.value);
  }
  fnCache.set(cacheKey, entry);
  return entry;
}

/** 把脚本返回值规整成普通数据，避免把代理对象或宿主引用带出去。 */
export function normalizeScriptResult(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === 'number' || type === 'string' || type === 'boolean')
    return value;
  if (type === 'bigint' || type === 'symbol') return String(value);
  if (type === 'function') return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    try {
      return String(value);
    } catch {
      return undefined;
    }
  }
}

/**
 * 在受控沙箱里执行脚本（同步）。
 *
 * 失败不抛异常，返回 `{ ok: false, error }`，由调用方决定降级策略。
 */
export function runSandboxedScript(
  source: null | string | undefined,
  scope: Record<string, unknown>,
  options: SandboxRunOptions = {},
): ScriptRunResult {
  const raw = String(source ?? '').trim();
  if (!raw) return { ok: true, value: undefined };

  const body = options.wrapExpression ? wrapScriptBody(raw) : raw;
  if (!body) return { ok: true, value: undefined };

  const audit = auditScriptSource(body);
  if (!audit.ok) return { error: audit.reason, ok: false };

  try {
    const { fn, keys } = buildScriptFunction(body, Object.keys(scope));
    const guarded = deepGuard(scope);
    const args = keys.map((key) => guarded[key]);
    const shadowArgs = SHADOWED_GLOBALS.map(() => undefined);
    return {
      ok: true,
      value: normalizeScriptResult(fn(...args, ...shadowArgs)),
    };
  } catch (error) {
    return { error: describeError(error), ok: false };
  }
}

/**
 * 脚本能否在沙箱里跑（供设计器即时校验）。
 *
 * 先看受限表达式 DSL，再看向法审计 + 能否构造。
 */
export function isSandboxRunnable(source: null | string | undefined): boolean {
  const raw = String(source ?? '').trim();
  if (!raw) return true;
  if (tryCompileExpression(raw).ok) return true;
  const body = wrapScriptBody(raw);
  if (!auditScriptSource(body).ok) return false;
  try {
    buildScriptFunction(body, ['raw', 'row', 'value']);
    return true;
  } catch {
    return false;
  }
}
