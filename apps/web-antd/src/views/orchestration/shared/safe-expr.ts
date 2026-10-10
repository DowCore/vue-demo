/**
 * 安全表达式求值器（无 `eval` / `new Function`）。
 *
 * 背景：编排平台原先把库中存储的字符串（列 `formatFn`/`renderFn`、vform 组件事件）
 * 交给 `new Function` 在浏览器执行，等于把任意 JS 执行权交给了配置数据——存储型 XSS。
 * 本模块用一个受限的表达式语言替代它：语法可静态校验、能力白名单化、
 * 与服务端 CSP（禁 `unsafe-eval`）兼容。
 *
 * 支持：
 * - 字面量：数字、字符串、`true`/`false`/`null`/`undefined`、数组、对象
 * - 取值：标识符（仅作用域自有属性）、成员访问 `a.b`、下标 `a[b]`、可选链 `a?.b` / `a?.[b]`
 * - 运算：`+ - * / %`、`== != === !==`、`< > <= >=`、`&& || !`、三元 `? :`
 * - 调用：白名单全局函数（`len`/`round`/`substr`…）与白名单方法（`toFixed`/`slice`…）
 *
 * 明确不支持（会被拒绝，绝不执行）：赋值、函数定义、`this`/`new`、原型链访问
 * （`__proto__`/`constructor`/`prototype`）、任何全局对象（`window`/`document`/`fetch`…）、
 * 正则字面量、箭头函数、语句块。
 *
 * 兼容说明：历史配置若是完整 JS 语句（含 `return`、函数、正则），将解析失败并降级为
 * 「不执行、保留原值」，同时由调用方给出提示——这是有意的安全收紧。
 */

export interface SafeScope {
  [name: string]: unknown;
}

export type SafeEvaluator = (scope: SafeScope) => unknown;

export class SafeExpressionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SafeExpressionError';
  }
}

/** 禁止作为标识符或属性名出现的名字。 */
const FORBIDDEN_NAMES = new Set([
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
  'alert',
  'apply',
  'arguments',
  'async',
  'await',
  'bind',
  'call',
  'caller',
  'class',
  'confirm',
  'console',
  'const',
  'constructor',
  'Date',
  'delete',
  'document',
  'Error',
  'eval',
  'exports',
  'fetch',
  'finally',
  'frames',
  'function',
  'Function',
  'globalThis',
  'import',
  'in',
  'instanceof',
  'localStorage',
  'location',
  'Math',
  'module',
  'navigator',
  'new',
  'Object',
  'opener',
  'parent',
  'process',
  'Promise',
  'prompt',
  'prototype',
  'Proxy',
  'Reflect',
  'require',
  'return',
  'self',
  'sessionStorage',
  'setInterval',
  'setTimeout',
  'Symbol',
  'this',
  'top',
  'typeof',
  'var',
  'void',
  'WebSocket',
  'window',
  'XMLHttpRequest',
  'yield',
]);

const KEYWORD_LITERALS: Record<string, unknown> = {
  false: false,
  NaN: Number.NaN,
  null: null,
  true: true,
  undefined,
};

const OPERATORS = [
  '===',
  '!==',
  '?.',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '?',
  ':',
  '.',
  '[',
  ']',
  '(',
  ')',
  ',',
  '{',
  '}',
  '<',
  '>',
  ';',
  '=',
];

type TokenType =
  | 'eof'
  | 'identifier'
  | 'newline'
  | 'number'
  | 'operator'
  | 'string';

interface Token {
  pos: number;
  type: TokenType;
  value: string;
}

const EOF_TOKEN: Token = { pos: -1, type: 'eof', value: '' };

/* ------------------------------- 值语义 ------------------------------- */

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value) ?? '';
    } catch {
      return '';
    }
  }
  return String(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null) return 0;
  if (value === undefined) return Number.NaN;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? 0 : Number(trimmed);
  }
  return Number.NaN;
}

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (typeof value === 'string') return value.length > 0;
  return true;
}

function looseEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  const leftEmpty = left === null || left === undefined;
  const rightEmpty = right === null || right === undefined;
  if (leftEmpty || rightEmpty) return leftEmpty && rightEmpty;
  if (typeof left === 'string' && typeof right === 'string') return false;
  if (typeof left === 'boolean' || typeof right === 'boolean') {
    return toNumber(left) === toNumber(right);
  }
  if (typeof left === 'number' || typeof right === 'number') {
    return toNumber(left) === toNumber(right);
  }
  return false;
}

function toIndex(value: unknown, label: string): number {
  const num = toNumber(value);
  if (!Number.isFinite(num)) {
    throw new SafeExpressionError(`${label}必须是数字`);
  }
  return Math.trunc(num);
}

function clampDigits(value: unknown): number {
  const num = toIndex(value === undefined ? 0 : value, '小数位数');
  return Math.min(10, Math.max(0, num));
}

/* --------------------------- 白名单函数与方法 --------------------------- */

type GlobalFn = (args: unknown[]) => unknown;
type MethodFn = (self: unknown, args: unknown[]) => unknown;

const GLOBAL_FUNCTIONS: Record<string, GlobalFn> = {
  abs: (a) => Math.abs(toNumber(a[0])),
  blank: (a) => toText(a[0]).trim() === '',
  bool: (a) => isTruthy(a[0]),
  ceil: (a) => Math.ceil(toNumber(a[0])),
  concat: (a) => a.map((item) => toText(item)).join(''),
  default: (a) => a[0] ?? a[1],
  floor: (a) => Math.floor(toNumber(a[0])),
  join: (a) => {
    const target = a[0];
    const separator = toText(a[1] ?? ',');
    return Array.isArray(target)
      ? (target as unknown[]).map((item) => toText(item)).join(separator)
      : toText(target);
  },
  left: (a) => {
    const len = Math.max(0, toIndex(a[1], '截取长度'));
    return toText(a[0]).slice(0, len);
  },
  len: (a) => {
    const target = a[0];
    return Array.isArray(target)
      ? (target as unknown[]).length
      : toText(target).length;
  },
  lower: (a) => toText(a[0]).toLowerCase(),
  max: (a) => Math.max(...a.map((item) => toNumber(item))),
  min: (a) => Math.min(...a.map((item) => toNumber(item))),
  now: () => Date.now(),
  number: (a) => toNumber(a[0]),
  pad: (a) =>
    toText(a[0]).padStart(
      Math.max(0, toIndex(a[1], '填充长度')),
      toText(a[2] ?? '0'),
    ),
  padEnd: (a) =>
    toText(a[0]).padEnd(
      Math.max(0, toIndex(a[1], '填充长度')),
      toText(a[2] ?? '0'),
    ),
  pow: (a) => toNumber(a[0]) ** toNumber(a[1]),
  replace: (a) => toText(a[0]).split(toText(a[1])).join(toText(a[2])),
  right: (a) => {
    const text = toText(a[0]);
    const len = Math.max(0, toIndex(a[1], '截取长度'));
    return len === 0 ? '' : text.slice(-len);
  },
  round: (a) => {
    const digits = clampDigits(a[1]);
    return Number(toNumber(a[0]).toFixed(digits));
  },
  split: (a) => toText(a[0]).split(toText(a[1])),
  string: (a) => toText(a[0]),
  substr: (a) => {
    const text = toText(a[0]);
    const start = toIndex(a[1], '起始位置');
    if (a[2] === undefined) return text.slice(start);
    const len = Math.max(0, toIndex(a[2], '截取长度'));
    return text.slice(start, start + len);
  },
  trim: (a) => toText(a[0]).trim(),
  upper: (a) => toText(a[0]).toUpperCase(),
};

const METHODS: Record<string, MethodFn> = {
  charAt: (self, a) => toText(self).charAt(Math.max(0, toIndex(a[0], '下标'))),
  concat: (self, a) =>
    Array.isArray(self)
      ? [...(self as unknown[]), ...a]
      : toText(self) + a.map((item) => toText(item)).join(''),
  endsWith: (self, a) => toText(self).endsWith(toText(a[0])),
  includes: (self, a) =>
    Array.isArray(self)
      ? (self as unknown[]).includes(a[0])
      : toText(self).includes(toText(a[0])),
  indexOf: (self, a) =>
    Array.isArray(self)
      ? (self as unknown[]).indexOf(a[0])
      : toText(self).indexOf(toText(a[0])),
  join: (self, a) =>
    Array.isArray(self)
      ? (self as unknown[])
          .map((item) => toText(item))
          .join(toText(a[0] ?? ','))
      : toText(self),
  padEnd: (self, a) =>
    toText(self).padEnd(
      Math.max(0, toIndex(a[0], '填充长度')),
      toText(a[1] ?? '0'),
    ),
  padStart: (self, a) =>
    toText(self).padStart(
      Math.max(0, toIndex(a[0], '填充长度')),
      toText(a[1] ?? '0'),
    ),
  repeat: (self, a) =>
    toText(self).repeat(Math.min(1000, Math.max(0, toIndex(a[0], '重复次数')))),
  replace: (self, a) => toText(self).split(toText(a[0])).join(toText(a[1])),
  slice: (self, a) => {
    const start = toIndex(a[0] ?? 0, '起始位置');
    const end = a[1] === undefined ? undefined : toIndex(a[1], '结束位置');
    if (Array.isArray(self)) {
      return end === undefined
        ? (self as unknown[]).slice(start)
        : (self as unknown[]).slice(start, end);
    }
    return end === undefined
      ? toText(self).slice(start)
      : toText(self).slice(start, end);
  },
  split: (self, a) => toText(self).split(toText(a[0])),
  startsWith: (self, a) => toText(self).startsWith(toText(a[0])),
  substring: (self, a) => {
    const start = Math.max(0, toIndex(a[0] ?? 0, '起始位置'));
    const end =
      a[1] === undefined ? undefined : Math.max(0, toIndex(a[1], '结束位置'));
    // 保持 `substring` 的「start > end 时自动交换」语义，用 slice 实现（规则要求）。
    return end === undefined
      ? toText(self).slice(start)
      : toText(self).slice(Math.min(start, end), Math.max(start, end));
  },
  toFixed: (self, a) => toNumber(self).toFixed(clampDigits(a[0])),
  toLowerCase: (self) => toText(self).toLowerCase(),
  // 显式标注：`toString` 与 Object.prototype 同名，索引签名的上下文类型在此不生效。
  toString: (self: unknown) => toText(self),
  toUpperCase: (self) => toText(self).toUpperCase(),
  trim: (self) => toText(self).trim(),
};

/* ------------------------------- 词法分析 ------------------------------- */

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentifierStart(ch: string): boolean {
  return (
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    ch === '_' ||
    ch === '$'
  );
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}

function readString(
  source: string,
  start: number,
): { text: string; next: number } {
  const quote = source.charAt(start);
  let index = start + 1;
  let text = '';
  const escapes: Record<string, string> = {
    '"': '"',
    "'": "'",
    '\\': '\\',
    0: '\0',
    n: '\n',
    r: '\r',
    t: '\t',
  };
  while (index < source.length) {
    const ch = source.charAt(index);
    if (ch === '\\') {
      const next = source.charAt(index + 1);
      text += Object.hasOwn(escapes, next) ? escapes[next] : next;
      index += 2;
      continue;
    }
    if (ch === quote) return { next: index + 1, text };
    if (ch === '\n' || ch === '\r') break;
    text += ch;
    index += 1;
  }
  throw new SafeExpressionError('字符串字面量没有正确闭合');
}

function readNumber(
  source: string,
  start: number,
): { next: number; text: string } {
  let index = start;
  let seenDot = false;
  let seenExponent = false;
  while (index < source.length) {
    const ch = source.charAt(index);
    if (isDigit(ch)) {
      index += 1;
      continue;
    }
    if (ch === '.' && !seenDot && !seenExponent) {
      seenDot = true;
      index += 1;
      continue;
    }
    if ((ch === 'e' || ch === 'E') && !seenExponent) {
      seenExponent = true;
      index += 1;
      const sign = source.charAt(index);
      if (sign === '+' || sign === '-') index += 1;
      continue;
    }
    break;
  }
  const text = source.slice(start, index);
  if (!Number.isFinite(Number(text))) {
    throw new SafeExpressionError(`非法数字「${text}」`);
  }
  return { next: index, text };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const ch = source.charAt(index);
    if (ch === '\n' || ch === '\r') {
      const last = tokens[tokens.length - 1];
      if (last && last.type !== 'newline') {
        tokens.push({ pos: index, type: 'newline', value: '\n' });
      }
      index += 1;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      index += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const result = readString(source, index);
      tokens.push({ pos: index, type: 'string', value: result.text });
      index = result.next;
      continue;
    }
    if (isDigit(ch)) {
      const result = readNumber(source, index);
      tokens.push({ pos: index, type: 'number', value: result.text });
      index = result.next;
      continue;
    }
    if (isIdentifierStart(ch)) {
      let end = index + 1;
      while (end < source.length && isIdentifierPart(source.charAt(end)))
        end += 1;
      tokens.push({
        pos: index,
        type: 'identifier',
        value: source.slice(index, end),
      });
      index = end;
      continue;
    }
    const operator = OPERATORS.find((item) => source.startsWith(item, index));
    if (operator) {
      tokens.push({ pos: index, type: 'operator', value: operator });
      index += operator.length;
      continue;
    }
    throw new SafeExpressionError(`含有不支持的字面字符「${ch}」`);
  }
  tokens.push({ pos: source.length, type: 'eof', value: '' });
  return tokens;
}

/* --------------------------- 成员 / 下标 读取 --------------------------- */

function assertAllowedName(name: string): void {
  if (FORBIDDEN_NAMES.has(name)) {
    throw new SafeExpressionError(`不允许使用「${name}」`);
  }
}

function readMember(target: unknown, key: string): unknown {
  assertAllowedName(key);
  if (typeof target === 'string') {
    if (key === 'length') return target.length;
    throw new SafeExpressionError(`字符串不支持读取属性「${key}」`);
  }
  if (Array.isArray(target)) {
    if (key === 'length') return (target as unknown[]).length;
    throw new SafeExpressionError(`数组不支持读取属性「${key}」，请使用下标`);
  }
  if (typeof target === 'object' && target !== null) {
    const record = target as Record<string, unknown>;
    if (!Object.hasOwn(record, key)) {
      throw new SafeExpressionError(`对象上不存在属性「${key}」`);
    }
    return record[key];
  }
  throw new SafeExpressionError(`无法读取属性「${key}」`);
}

function readIndex(target: unknown, key: unknown): unknown {
  if (target === null || target === undefined) {
    throw new SafeExpressionError('不能对空值取下标');
  }
  if (Array.isArray(target)) {
    return (target as unknown[])[toIndex(key, '数组下标')];
  }
  if (typeof target === 'string') {
    return target.charAt(Math.max(0, toIndex(key, '字符串下标')));
  }
  if (typeof target === 'object') {
    const property = toText(key);
    assertAllowedName(property);
    const record = target as Record<string, unknown>;
    if (!Object.hasOwn(record, property)) {
      throw new SafeExpressionError(`对象上不存在属性「${property}」`);
    }
    return record[property];
  }
  throw new SafeExpressionError('不支持取下标操作');
}

/* ------------------------------- 语法分析 ------------------------------- */

class ExpressionParser {
  private index = 0;

  private readonly tokens: Token[];

  public constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public expectEnd(): void {
    if (this.current().type !== 'eof') {
      throw new SafeExpressionError(
        `表达式结尾存在多余内容「${this.current().value}」`,
      );
    }
  }

  public parse(): SafeEvaluator {
    const evaluator = this.parseTernary();
    this.expectEnd();
    return evaluator;
  }

  private advance(): Token {
    const token = this.current();
    if (token.type !== 'eof') this.index += 1;
    return token;
  }

  private current(): Token {
    let token = this.tokens[this.index];
    while (token && token.type === 'newline') {
      this.index += 1;
      token = this.tokens[this.index];
    }
    return token ?? EOF_TOKEN;
  }

  private expectOperator(value: string): void {
    if (!this.matchOperator(value)) {
      throw new SafeExpressionError(`期望「${value}」`);
    }
  }

  private matchOperator(...values: string[]): boolean {
    const token = this.current();
    if (token.type === 'operator' && values.includes(token.value)) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private parseAdditive(): SafeEvaluator {
    let left = this.parseMultiplicative();
    for (;;) {
      const operator = this.current();
      if (
        operator.type === 'operator' &&
        (operator.value === '+' || operator.value === '-')
      ) {
        this.index += 1;
        const right = this.parseMultiplicative();
        const prev = left;
        const plus = operator.value === '+';
        left = (scope) => {
          const a = prev(scope);
          const b = right(scope);
          if (plus) {
            if (typeof a === 'string' || typeof b === 'string')
              return toText(a) + toText(b);
            return toNumber(a) + toNumber(b);
          }
          return toNumber(a) - toNumber(b);
        };
        continue;
      }
      return left;
    }
  }

  private parseArguments(): SafeEvaluator[] {
    this.expectOperator('(');
    const args: SafeEvaluator[] = [];
    if (!this.matchOperator(')')) {
      do {
        args.push(this.parseTernary());
      } while (this.matchOperator(','));
      this.expectOperator(')');
    }
    return args;
  }

  private parseEquality(): SafeEvaluator {
    let left = this.parseRelational();
    for (;;) {
      const operator = this.current();
      if (
        operator.type === 'operator' &&
        ['!=', '!==', '==', '==='].includes(operator.value)
      ) {
        this.index += 1;
        const right = this.parseRelational();
        const prev = left;
        const op = operator.value;
        left = (scope) => {
          const a = prev(scope);
          const b = right(scope);
          if (op === '===') return a === b;
          if (op === '!==') return a !== b;
          const equal = looseEquals(a, b);
          return op === '==' ? equal : !equal;
        };
        continue;
      }
      return left;
    }
  }

  private parseLogicalAnd(): SafeEvaluator {
    let left = this.parseEquality();
    while (this.matchOperator('&&')) {
      const right = this.parseEquality();
      const prev = left;
      left = (scope) => {
        const value = prev(scope);
        return isTruthy(value) ? right(scope) : value;
      };
    }
    return left;
  }

  private parseLogicalOr(): SafeEvaluator {
    let left = this.parseLogicalAnd();
    while (this.matchOperator('||')) {
      const right = this.parseLogicalAnd();
      const prev = left;
      left = (scope) => {
        const value = prev(scope);
        return isTruthy(value) ? value : right(scope);
      };
    }
    return left;
  }

  private parseMultiplicative(): SafeEvaluator {
    let left = this.parseUnary();
    for (;;) {
      const operator = this.current();
      if (
        operator.type === 'operator' &&
        (operator.value === '*' ||
          operator.value === '/' ||
          operator.value === '%')
      ) {
        this.index += 1;
        const right = this.parseUnary();
        const prev = left;
        const op = operator.value;
        left = (scope) => {
          const a = toNumber(prev(scope));
          const b = toNumber(right(scope));
          if (op === '*') return a * b;
          if (op === '/') return a / b;
          return a % b;
        };
        continue;
      }
      return left;
    }
  }

  private parsePostfix(): SafeEvaluator {
    let node = this.parsePrimary();
    for (;;) {
      const token = this.current();
      if (token.type !== 'operator') return node;
      if (token.value === '.' || token.value === '?.') {
        const optional = token.value === '?.';
        this.index += 1;
        const keyToken = this.current();
        if (keyToken.type !== 'identifier') {
          throw new SafeExpressionError('「.」之后需要接属性名');
        }
        const key = keyToken.value;
        assertAllowedName(key);
        this.index += 1;
        const after = this.current();
        const base = node;
        if (after.type === 'operator' && after.value === '(') {
          const method = METHODS[key];
          if (!method)
            throw new SafeExpressionError(`不允许调用方法「${key}」`);
          const args = this.parseArguments();
          node = (scope) => {
            const self = base(scope);
            if (self === null || self === undefined) {
              if (optional) return undefined;
              throw new SafeExpressionError(`不能在空值上调用「${key}」`);
            }
            return method(
              self,
              args.map((item) => item(scope)),
            );
          };
        } else {
          node = (scope) => {
            const self = base(scope);
            if (self === null || self === undefined) {
              if (optional) return undefined;
              throw new SafeExpressionError(`不能读取空值的属性「${key}」`);
            }
            return readMember(self, key);
          };
        }
        continue;
      }
      if (token.value === '[') {
        this.index += 1;
        const key = this.parseTernary();
        this.expectOperator(']');
        const base = node;
        node = (scope) => readIndex(base(scope), key(scope));
        continue;
      }
      return node;
    }
  }

  private parsePrimary(): SafeEvaluator {
    const token = this.advance();
    if (token.type === 'number') {
      const value = Number(token.value);
      return () => value;
    }
    if (token.type === 'string') {
      const value = token.value;
      return () => value;
    }
    if (token.type === 'identifier') {
      const name = token.value;
      const globalFn = GLOBAL_FUNCTIONS[name];
      if (globalFn) {
        const next = this.current();
        if (next.type !== 'operator' || next.value !== '(') {
          throw new SafeExpressionError(`函数「${name}」必须被调用`);
        }
        const args = this.parseArguments();
        return (scope) => globalFn(args.map((item) => item(scope)));
      }
      if (Object.hasOwn(KEYWORD_LITERALS, name)) {
        const value = KEYWORD_LITERALS[name];
        return () => value;
      }
      assertAllowedName(name);
      return (scope) => (Object.hasOwn(scope, name) ? scope[name] : undefined);
    }
    if (token.type === 'operator' && token.value === '(') {
      const inner = this.parseTernary();
      this.expectOperator(')');
      return inner;
    }
    if (token.type === 'operator' && token.value === '[') {
      const items: SafeEvaluator[] = [];
      if (!this.matchOperator(']')) {
        do {
          items.push(this.parseTernary());
        } while (this.matchOperator(','));
        this.expectOperator(']');
      }
      return (scope) => items.map((item) => item(scope));
    }
    if (token.type === 'operator' && token.value === '{') {
      const entries: Array<[string, SafeEvaluator]> = [];
      if (!this.matchOperator('}')) {
        do {
          const keyToken = this.advance();
          if (
            keyToken.type !== 'identifier' &&
            keyToken.type !== 'string' &&
            keyToken.type !== 'number'
          ) {
            throw new SafeExpressionError('对象字面量的键必须是标识符或字符串');
          }
          const key = keyToken.value;
          assertAllowedName(key);
          this.expectOperator(':');
          entries.push([key, this.parseTernary()]);
        } while (this.matchOperator(','));
        this.expectOperator('}');
      }
      return (scope) => {
        const result: Record<string, unknown> = {};
        for (const [key, evaluator] of entries) result[key] = evaluator(scope);
        return result;
      };
    }
    throw new SafeExpressionError(
      `无法解析的内容「${token.value || '表达式结束'}」`,
    );
  }

  private parseRelational(): SafeEvaluator {
    let left = this.parseAdditive();
    for (;;) {
      const operator = this.current();
      if (
        operator.type === 'operator' &&
        ['<', '<=', '>', '>='].includes(operator.value)
      ) {
        this.index += 1;
        const right = this.parseAdditive();
        const prev = left;
        const op = operator.value;
        left = (scope) => {
          const a = prev(scope);
          const b = right(scope);
          if (typeof a === 'string' && typeof b === 'string') {
            if (op === '<') return a < b;
            if (op === '<=') return a <= b;
            if (op === '>') return a > b;
            return a >= b;
          }
          const x = toNumber(a);
          const y = toNumber(b);
          if (op === '<') return x < y;
          if (op === '<=') return x <= y;
          if (op === '>') return x > y;
          return x >= y;
        };
        continue;
      }
      return left;
    }
  }

  private parseTernary(): SafeEvaluator {
    const test = this.parseLogicalOr();
    if (!this.matchOperator('?')) return test;
    const consequent = this.parseTernary();
    this.expectOperator(':');
    const alternate = this.parseTernary();
    return (scope) =>
      isTruthy(test(scope)) ? consequent(scope) : alternate(scope);
  }

  private parseUnary(): SafeEvaluator {
    const token = this.current();
    if (token.type === 'operator') {
      if (token.value === '!') {
        this.index += 1;
        const operand = this.parseUnary();
        return (scope) => !isTruthy(operand(scope));
      }
      if (token.value === '-' || token.value === '+') {
        this.index += 1;
        const operand = this.parseUnary();
        const negate = token.value === '-';
        return (scope) =>
          negate ? -toNumber(operand(scope)) : toNumber(operand(scope));
      }
    }
    return this.parsePostfix();
  }
}

/* ------------------------------- 语句支持 ------------------------------- */

/** 拆分语句：顶层 `;` 与换行作为分隔符；括号内换行忽略。 */
function splitStatements(tokens: Token[]): Token[][] {
  const statements: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  const flush = () => {
    if (current.length > 0) statements.push(current);
    current = [];
  };
  for (const token of tokens) {
    if (token.type === 'eof') break;
    if (token.type === 'newline') {
      if (depth === 0) flush();
      continue;
    }
    if (token.type === 'operator') {
      if (token.value === '(' || token.value === '[' || token.value === '{')
        depth += 1;
      else if (
        token.value === ')' ||
        token.value === ']' ||
        token.value === '}'
      ) {
        depth = Math.max(0, depth - 1);
      }
      if (depth === 0 && token.value === ';') {
        flush();
        continue;
      }
    }
    current.push(token);
  }
  flush();
  return statements;
}

/**
 * 允许的唯一副作用：`formModel.字段 = 表达式`。
 * 其余语句一律按纯表达式求值（无副作用），从而保证不会对运行环境产生意外写入。
 */
function compileStatement(tokens: Token[]): SafeEvaluator {
  const [first, second, third, fourth] = tokens;
  if (
    first?.type === 'identifier' &&
    first.value === 'formModel' &&
    second?.type === 'operator' &&
    second.value === '.' &&
    third?.type === 'identifier' &&
    fourth?.type === 'operator' &&
    fourth.value === '='
  ) {
    const key = third.value;
    assertAllowedName(key);
    const value = new ExpressionParser(tokens.slice(4)).parse();
    return (scope) => {
      const model = scope.formModel;
      if (model && typeof model === 'object') {
        (model as Record<string, unknown>)[key] = value(scope);
      }
      return undefined;
    };
  }
  return new ExpressionParser(tokens).parse();
}

/* ------------------------------- 对外 API ------------------------------- */

const expressionCache = new Map<string, SafeEvaluator | SafeExpressionError>();

const scriptCache = new Map<string, SafeEvaluator | SafeExpressionError>();

/**
 * 编译为可复用的求值函数；语法不合法或含被禁能力时抛 {@link SafeExpressionError}。
 */
export function compileExpression(source: string): SafeEvaluator {
  const key = source.trim();
  if (!key) throw new SafeExpressionError('表达式为空');
  const cached = expressionCache.get(key);
  if (cached) {
    if (cached instanceof SafeExpressionError) throw cached;
    return cached;
  }
  try {
    const evaluator = new ExpressionParser(tokenize(key)).parse();
    expressionCache.set(key, evaluator);
    return evaluator;
  } catch (error) {
    const failure =
      error instanceof SafeExpressionError
        ? error
        : new SafeExpressionError('表达式解析失败');
    expressionCache.set(key, failure);
    throw failure;
  }
}

/** 编译多语句脚本（供组件事件使用），语法不合法时抛 {@link SafeExpressionError}。 */
export function compileScript(source: string): SafeEvaluator {
  const key = source.trim();
  if (!key) throw new SafeExpressionError('脚本为空');
  const cached = scriptCache.get(key);
  if (cached) {
    if (cached instanceof SafeExpressionError) throw cached;
    return cached;
  }
  try {
    const statements = splitStatements(tokenize(key)).map((tokens) =>
      compileStatement(tokens),
    );
    const runner: SafeEvaluator = (scope) => {
      let last: unknown;
      for (const statement of statements) last = statement(scope);
      return last;
    };
    scriptCache.set(key, runner);
    return runner;
  } catch (error) {
    const failure =
      error instanceof SafeExpressionError
        ? error
        : new SafeExpressionError('脚本解析失败');
    scriptCache.set(key, failure);
    throw failure;
  }
}

export type SafeResult<T> =
  | { error: string; ok: false }
  | { ok: true; value: T };

/** 编译表达式（不抛错版本）。 */
export function tryCompileExpression(
  source: string,
): SafeResult<SafeEvaluator> {
  try {
    return { ok: true, value: compileExpression(source) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

/** 编译脚本（不抛错版本）。 */
export function tryCompileScript(source: string): SafeResult<SafeEvaluator> {
  try {
    return { ok: true, value: compileScript(source) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

/** 求值表达式（不抛错版本）。 */
export function tryEvaluateExpression(
  source: string,
  scope: SafeScope,
): SafeResult<unknown> {
  const compiled = tryCompileExpression(source);
  if (!compiled.ok) return compiled;
  try {
    return { ok: true, value: compiled.value(scope) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

/** 执行脚本（不抛错版本）。 */
export function tryRunScript(
  source: string,
  scope: SafeScope,
): SafeResult<unknown> {
  const compiled = tryCompileScript(source);
  if (!compiled.ok) return compiled;
  try {
    return { ok: true, value: compiled.value(scope) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
    };
  }
}

/** 是否为可安全求值的表达式（用于迁移期判断历史 JS 代码是否受支持）。 */
export function isSafeExpression(source: string): boolean {
  return tryCompileExpression(source).ok;
}

/** 是否为可安全执行的脚本。 */
export function isSafeScript(source: string): boolean {
  return tryCompileScript(source).ok;
}
