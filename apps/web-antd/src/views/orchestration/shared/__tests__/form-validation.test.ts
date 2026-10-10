/**
 * 表单校验测试。
 *
 * 覆盖：必填（区分 create/update）、长度/正则、数值区间、日期时间格式、
 * 选项合法性、明细类控件的行数上下限与逐行子字段校验。
 */
import { describe, expect, it } from 'vitest';

import {
  buildActionPayload,
  isFieldRequired,
  validateFormFields,
} from '../form-validation';

/** 从函数签名反推字段类型，避免直接依赖 #/ 别名。 */
type FieldLike = Parameters<typeof validateFormFields>[0][number];

function makeField(over: Record<string, unknown>): FieldLike {
  return {
    control: 'input',
    field: 'f',
    title: '字段',
    ...over,
  } as unknown as FieldLike;
}

function validate(
  fields: FieldLike[],
  record: Record<string, unknown>,
  mode: 'create' | 'detail' | 'update' = 'create',
): null | string {
  return validateFormFields(fields, record, mode);
}

describe('isFieldRequired', () => {
  it('按模式区分必填', () => {
    const field = makeField({
      requiredOnCreate: true,
      requiredOnUpdate: false,
    });
    expect(isFieldRequired(field, 'create')).toBe(true);
    expect(isFieldRequired(field, 'update')).toBe(false);
    expect(isFieldRequired(field, 'detail')).toBe(false);
  });
});

describe('必填校验', () => {
  it('空值在必填时提示', () => {
    const fields = [
      makeField({ field: 'name', title: '名称', requiredOnCreate: true }),
    ];
    expect(validate(fields, {})).toBe('请填写「名称」');
    expect(validate(fields, { name: '' })).toBe('请填写「名称」');
    expect(validate(fields, { name: '   ' })).toBe('请填写「名称」');
    expect(validate(fields, { name: null })).toBe('请填写「名称」');
    expect(validate(fields, { name: [] })).toBe('请填写「名称」');
    expect(validate(fields, { name: 'ok' })).toBeNull();
  });

  it('update 模式不要求仅创建必填的字段', () => {
    const fields = [makeField({ field: 'name', requiredOnCreate: true })];
    expect(validate(fields, {}, 'update')).toBeNull();
  });

  it('非必填字段留空直接通过', () => {
    const fields = [makeField({ field: 'name' })];
    expect(validate(fields, {})).toBeNull();
    expect(validate(fields, { name: '' })).toBeNull();
  });
});

describe('文本长度与正则', () => {
  it('minLength / maxLength', () => {
    const fields = [makeField({ rules: { minLength: 3 } })];
    expect(validate(fields, { f: 'ab' })).toContain('至少 3');
    expect(validate(fields, { f: 'abc' })).toBeNull();

    const maxField = [makeField({ rules: { maxLength: 3 } })];
    expect(validate(maxField, { f: 'abcd' })).toContain('最多 3');
  });

  it('使用自定义 message', () => {
    const fields = [
      makeField({ rules: { message: '自定义提示', minLength: 5 } }),
    ];
    expect(validate(fields, { f: 'a' })).toBe('自定义提示');
  });

  it('正则不匹配时提示，patternMessage 优先', () => {
    const fields = [makeField({ rules: { pattern: '^\\d+$' } })];
    expect(validate(fields, { f: 'abc' })).toContain('格式不正确');
    expect(validate(fields, { f: '123' })).toBeNull();

    const custom = [
      makeField({ rules: { pattern: '^\\d+$', patternMessage: '只能填数字' } }),
    ];
    expect(validate(custom, { f: 'abc' })).toBe('只能填数字');
  });

  it('危险正则不会造成误报', () => {
    const fields = [makeField({ rules: { pattern: '(a+)+' } })];
    expect(validate(fields, { f: 'aaa' })).toBeNull();
  });
});

describe('数值校验', () => {
  it('非数字被拒绝', () => {
    const fields = [makeField({ control: 'number' })];
    expect(validate(fields, { f: 'abc' })).toContain('必须是数字');
    expect(validate(fields, { f: '3.5' })).toBeNull();
  });

  it('min / max 区间', () => {
    const fields = [
      makeField({ control: 'number', rules: { min: 1, max: 10 } }),
    ];
    expect(validate(fields, { f: 0 })).toContain('不能小于 1');
    expect(validate(fields, { f: 11 })).toContain('不能大于 10');
    expect(validate(fields, { f: 5 })).toBeNull();
  });
});

describe('日期与时间格式', () => {
  it('date', () => {
    const fields = [makeField({ control: 'date' })];
    expect(validate(fields, { f: '2024-01-05' })).toBeNull();
    expect(validate(fields, { f: '2024/1/5' })).toBeNull();
    expect(validate(fields, { f: 'not-a-date' })).toContain('YYYY-MM-DD');
  });

  it('datetime', () => {
    const fields = [makeField({ control: 'datetime' })];
    expect(validate(fields, { f: '2024-01-05 10:30' })).toBeNull();
    expect(validate(fields, { f: '2024-01-05T10:30:00' })).toBeNull();
    expect(validate(fields, { f: '2024-01-05' })).toContain('YYYY-MM-DD HH:mm');
  });

  it('time', () => {
    const fields = [makeField({ control: 'time' })];
    expect(validate(fields, { f: '10:30' })).toBeNull();
    expect(validate(fields, { f: '10:30:00' })).toBeNull();
    expect(validate(fields, { f: '25' })).toContain('HH:mm');
  });
});

describe('选项合法性', () => {
  const options = [
    { label: 'A', value: 'a' },
    { label: 'B', value: 'b' },
  ];

  it('单选必须是已配置选项', () => {
    const fields = [
      makeField({ control: 'select', controlProps: { options } }),
    ];
    expect(validate(fields, { f: 'a' })).toBeNull();
    expect(validate(fields, { f: 'z' })).toContain('不是有效选项');
  });

  it('未配置选项时不校验（避免误报）', () => {
    const fields = [makeField({ control: 'select' })];
    expect(validate(fields, { f: 'anything' })).toBeNull();
  });

  it('多选包含无效项时报错', () => {
    const fields = [
      makeField({ control: 'checkbox', controlProps: { options } }),
    ];
    expect(validate(fields, { f: ['a'] })).toBeNull();
    expect(validate(fields, { f: ['a', 'z'] })).toContain('无效选项');
  });

  it('兼容纯值数组形式的选项', () => {
    const fields = [
      makeField({ control: 'radio', controlProps: { options: ['x', 'y'] } }),
    ];
    expect(validate(fields, { f: 'x' })).toBeNull();
    expect(validate(fields, { f: 'z' })).toContain('不是有效选项');
  });
});

describe('明细类控件', () => {
  it('值必须是数组', () => {
    const fields = [makeField({ control: 'table' })];
    expect(validate(fields, { f: 'not-array' })).toContain('数据格式不正确');
  });

  it('minItems / maxItems', () => {
    const fields = [makeField({ control: 'list', maxItems: 2, minItems: 1 })];
    expect(validate(fields, { f: [1, 2, 3] })).toContain('最多 2 行');
    expect(validate(fields, { f: [1, 2] })).toBeNull();
  });

  it('逐行校验子字段并标注行号', () => {
    const fields = [
      makeField({
        children: [
          makeField({ field: 'name', requiredOnCreate: true, title: '名称' }),
        ],
        control: 'table',
        field: 'items',
        title: '明细',
      }),
    ];
    expect(validate(fields, { items: [{ name: 'x', note: 'ok' }] })).toBeNull();
    expect(validate(fields, { items: [{ name: '', note: 'ok' }] })).toContain(
      '第 1 行',
    );
  });

  it('整行为空的行被跳过', () => {
    const fields = [
      makeField({
        children: [makeField({ field: 'name', requiredOnCreate: true })],
        control: 'table',
        field: 'items',
      }),
    ];
    expect(validate(fields, { items: [{ name: '' }] })).toBeNull();
  });
});

describe('多字段与 payload 抽取', () => {
  it('返回第一个错误', () => {
    const fields = [
      makeField({ field: 'a', title: 'A', requiredOnCreate: true }),
      makeField({ field: 'b', title: 'B', requiredOnCreate: true }),
    ];
    expect(validate(fields, {})).toBe('请填写「A」');
    expect(validate(fields, { a: 1 })).toBe('请填写「B」');
    expect(validate(fields, { a: 1, b: 2 })).toBeNull();
  });

  it('buildActionPayload 按 payloadFields 抽取', () => {
    expect(buildActionPayload({ a: 1, b: 2 }, ['a'])).toEqual({ a: 1 });
    expect(buildActionPayload({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(buildActionPayload({ a: 1 }, ['a'], { c: 3 })).toEqual({
      a: 1,
      c: 3,
    });
    expect(buildActionPayload(null, undefined, { c: 3 })).toEqual({ c: 3 });
  });
});
