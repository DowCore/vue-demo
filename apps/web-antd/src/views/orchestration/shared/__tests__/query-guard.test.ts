/**
 * 查询入参守卫测试。
 *
 * 字段名与操作符来自可配置数据，必须约束形态后才允许发给后端；
 * 不合法的一律**丢弃条件**，而不是原样透传。
 */
import type { FilterNode } from '../filter-model';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  collectFilterFields,
  isSafeFieldName,
  sanitizeFilterNode,
  sanitizeSorting,
} from '../query-guard';

afterEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('isSafeFieldName', () => {
  it('接受纯标识符形态', () => {
    expect(isSafeFieldName('amount')).toBe(true);
    expect(isSafeFieldName('_id')).toBe(true);
    expect(isSafeFieldName('a1')).toBe(true);
  });

  it('拒绝空、空格、引号、分号等可拼接内容', () => {
    expect(isSafeFieldName('')).toBe(false);
    expect(isSafeFieldName('a b')).toBe(false);
    expect(isSafeFieldName('1a')).toBe(false);
    expect(isSafeFieldName('a-b')).toBe(false);
    expect(isSafeFieldName('a;drop')).toBe(false);
    expect(isSafeFieldName('a"b')).toBe(false);
    expect(isSafeFieldName('a)b')).toBe(false);
    expect(isSafeFieldName('a.b')).toBe(false);
    expect(isSafeFieldName(null)).toBe(false);
    expect(isSafeFieldName(1)).toBe(false);
  });

  it('拒绝超长字段名', () => {
    expect(isSafeFieldName('a'.repeat(64))).toBe(true);
    expect(isSafeFieldName('a'.repeat(65))).toBe(false);
  });
});

describe('sanitizeSorting', () => {
  it('规范化方向', () => {
    expect(sanitizeSorting('createdAt desc')).toBe('createdAt desc');
    expect(sanitizeSorting('createdAt')).toBe('createdAt asc');
    expect(sanitizeSorting('createdAt ASC')).toBe('createdAt asc');
    expect(sanitizeSorting('  createdAt   desc  ')).toBe('createdAt desc');
  });

  it('方向非法时回落到 asc', () => {
    expect(sanitizeSorting('createdAt sideways')).toBe('createdAt asc');
  });

  it('丢弃非法字段名', () => {
    expect(sanitizeSorting('')).toBeUndefined();
    expect(sanitizeSorting(null)).toBeUndefined();
    expect(sanitizeSorting(undefined)).toBeUndefined();
    expect(sanitizeSorting('1=1 desc')).toBeUndefined();
    expect(sanitizeSorting('a;drop desc')).toBeUndefined();
    expect(sanitizeSorting('createdAt desc, (select 1)')).toBeUndefined();
  });

  it('校验已知列白名单', () => {
    expect(sanitizeSorting('amount desc', ['amount'])).toBe('amount desc');
    expect(sanitizeSorting('other desc', ['amount'])).toBeUndefined();
    // 空集合表示"没有已知列信息"，不做列校验
    expect(sanitizeSorting('other desc', [])).toBe('other desc');
  });
});

describe('sanitizeFilterNode', () => {
  it('保留合法规则并规范化操作符', () => {
    const node: FilterNode = {
      kind: 'rule',
      left: 'amount',
      op: 'eq',
      right: 1,
    };
    expect(sanitizeFilterNode(node)).toEqual({
      kind: 'rule',
      left: 'amount',
      op: 'eq',
      right: 1,
    });
  });

  it('丢弃非法字段名或未白名单操作符', () => {
    expect(
      sanitizeFilterNode({ kind: 'rule', left: 'a;drop', op: 'eq' }),
    ).toBeUndefined();
    expect(
      sanitizeFilterNode({ kind: 'rule', left: '', op: 'eq' }),
    ).toBeUndefined();
    expect(
      sanitizeFilterNode({ kind: 'rule', left: 'amount', op: 'rawSql' }),
    ).toBeUndefined();
    expect(sanitizeFilterNode(undefined)).toBeUndefined();
  });

  it('递归清洗分组，空分组被整体丢弃', () => {
    const node: FilterNode = {
      kind: 'group',
      op: 'and',
      children: [
        { kind: 'rule', left: 'amount', op: 'gt', right: 1 },
        { kind: 'rule', left: 'a;drop', op: 'eq' },
      ],
    };
    const cleaned = sanitizeFilterNode(node);
    expect(cleaned?.children).toHaveLength(1);
    expect(cleaned?.children?.[0]?.left).toBe('amount');

    const allInvalid: FilterNode = {
      kind: 'group',
      op: 'or',
      children: [{ kind: 'rule', left: 'bad name', op: 'eq' }],
    };
    expect(sanitizeFilterNode(allInvalid)).toBeUndefined();
  });

  it('保留分组自身的 and / or', () => {
    const node: FilterNode = {
      kind: 'group',
      op: 'or',
      children: [
        { kind: 'rule', left: 'a', op: 'eq' },
        { kind: 'rule', left: 'b', op: 'eq' },
      ],
    };
    expect(sanitizeFilterNode(node)?.op).toBe('or');
  });

  it('校验已知列白名单', () => {
    const node: FilterNode = { kind: 'rule', left: 'other', op: 'eq' };
    expect(sanitizeFilterNode(node, ['amount'])).toBeUndefined();
    expect(sanitizeFilterNode(node, [])?.left).toBe('other');
  });
});

describe('collectFilterFields', () => {
  it('递归收集字段名', () => {
    const into = new Set<string>();
    collectFilterFields(
      {
        kind: 'group',
        op: 'and',
        children: [
          { kind: 'rule', left: 'amount', op: 'gt' },
          {
            kind: 'group',
            op: 'or',
            children: [
              { kind: 'rule', left: 'name', op: 'contains' },
              { kind: 'rule', left: 'a;drop', op: 'eq' },
            ],
          },
        ],
      },
      into,
    );
    expect([...into].toSorted()).toEqual(['amount', 'name']);
  });

  it('空输入安全返回', () => {
    const into = new Set<string>();
    collectFilterFields(undefined, into);
    expect(into.size).toBe(0);
  });
});
