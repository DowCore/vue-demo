/**
 * 运行时查询入参的守卫。
 *
 * 背景：列表页把 `sorting`（如 `"amount desc"`）与 `FilterNode`（`left`/`op`）**原样**发给后端。
 * 设计器里 `left` 在无可选字段时是**自由文本输入**，`sorting` 也可来自配置字符串，
 * 因此前端必须先把「字段名」和「操作符」约束到白名单形态：
 * 字段名只允许 `[A-Za-z_][A-Za-z0-9_]*`（杜绝空格、引号、括号、分号等可拼接内容），
 * 操作符只允许既有预设。
 *
 * 注意：字段是否**真实存在于表结构**属于后端的知识，前端只做形态与已知列的校验，
 * 服务端仍必须使用参数化查询并对列名做白名单（本模块不能替代服务端校验）。
 */
import type { FilterNode } from './filter-model';

/** 与 filter-group-editor 的预设保持一致，并兼容 FilterOp 中已有的其它取值。 */
export const FILTER_OPS = new Set([
  'between',
  'contains',
  'eq',
  'gt',
  'gte',
  'in',
  'isEmpty',
  'isNotEmpty',
  'lt',
  'lte',
  'ne',
  'notContains',
  'notcontains',
  'startswith',
]);

const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const SORT_DIRECTIONS = new Set(['asc', 'desc']);

const warned = new Set<string>();

function warnOnce(key: string, detail: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[query-guard] ${detail}`);
}

/** 字段名是否为安全形态（纯标识符）。 */
export function isSafeFieldName(name: unknown): boolean {
  return typeof name === 'string' && FIELD_NAME_PATTERN.test(name);
}

/**
 * 规范化排序串。
 *
 * @param sorting 形如 `"createdAt desc"`，也接受不带方向的 `"createdAt"`（默认 asc）
 * @param allowedFields 可选的已知列集合；提供时再校验列是否属于该集合
 * @returns 规范化后的排序串；非法时返回 undefined（调用方应放弃该排序条件）
 */
export function sanitizeSorting(
  sorting: null | string | undefined,
  allowedFields?: Iterable<string>,
): string | undefined {
  const raw = String(sorting ?? '').trim();
  if (!raw) return undefined;

  const parts = raw.split(/\s+/);
  if (parts.length > 2) {
    warnOnce(
      `sort-shape:${raw}`,
      `排序串「${raw}」格式不正确（只接受「字段 [asc|desc]」），已忽略该排序`,
    );
    return undefined;
  }

  const [field, direction] = parts;
  if (!isSafeFieldName(field)) {
    warnOnce(`sort:${raw}`, `排序字段「${raw}」不是合法列名，已忽略该排序`);
    return undefined;
  }

  if (allowedFields) {
    const allowed = new Set(allowedFields);
    if (allowed.size > 0 && !allowed.has(String(field))) {
      warnOnce(
        `sort-field:${field}`,
        `排序字段「${field}」不在当前列表列定义中，已忽略该排序`,
      );
      return undefined;
    }
  }

  const dir = String(direction ?? 'asc').toLowerCase();
  return `${field} ${SORT_DIRECTIONS.has(dir) ? dir : 'asc'}`;
}

/** 从（配置来源的）筛选树中收集字段名，用于构造"已知列"白名单。 */
export function collectFilterFields(
  node: FilterNode | undefined,
  into: Set<string>,
): void {
  if (!node || typeof node !== 'object') return;
  if (node.kind === 'group') {
    for (const child of node.children || []) collectFilterFields(child, into);
    return;
  }
  if (isSafeFieldName(node.left)) into.add(String(node.left));
}

/**
 * 递归清洗筛选树：丢弃字段名不合法或操作符不在白名单的规则；
 * 组内已无有效规则时整组丢弃（避免产生永真/永假的空条件）。
 */
export function sanitizeFilterNode(
  node: FilterNode | undefined,
  allowedFields?: Iterable<string>,
): FilterNode | undefined {
  if (!node || typeof node !== 'object') return undefined;

  if (node.kind === 'group') {
    const children = (node.children || [])
      .map((child) => sanitizeFilterNode(child, allowedFields))
      .filter((child): child is FilterNode => child !== undefined);
    if (children.length === 0) return undefined;
    return {
      ...node,
      children,
      kind: 'group',
      op: node.op === 'or' ? 'or' : 'and',
    };
  }

  const left = node.left;
  if (!isSafeFieldName(left)) {
    warnOnce(
      `filter-field:${String(left)}`,
      `筛选字段「${String(left)}」不是合法列名，该条件已忽略`,
    );
    return undefined;
  }
  if (allowedFields) {
    const allowed = new Set(allowedFields);
    if (allowed.size > 0 && !allowed.has(String(left))) {
      warnOnce(
        `filter-known:${String(left)}`,
        `筛选字段「${String(left)}」不在当前列定义中，该条件已忽略`,
      );
      return undefined;
    }
  }

  const op = String(node.op ?? 'eq');
  if (!FILTER_OPS.has(op)) {
    warnOnce(
      `filter-op:${op}`,
      `筛选操作符「${op}」不在白名单内，该条件已忽略`,
    );
    return undefined;
  }

  return { ...node, op };
}
