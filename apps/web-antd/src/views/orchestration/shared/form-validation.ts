import type { FormFieldDef } from '#/api/saas/orchestration';

import { checkPattern } from './safe-pattern';

type FormMode = 'create' | 'detail' | 'update';

/** 明细类控件：值应为数组。 */
const ARRAY_CONTROLS = new Set(['list', 'table', 'tree']);

/** 支持逐行校验子字段的明细控件。 */
const ROW_CONTROLS = new Set(['list', 'table']);

/** 单选类控件：值必须是已配置的某个选项。 */
const SINGLE_OPTION_CONTROLS = new Set(['radio', 'select']);

const DATE_PATTERN = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]|$)/;
const DATETIME_PATTERN = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}/;
const TIME_PATTERN = /^\d{1,2}:\d{2}(?::\d{2})?$/;

export function isFieldRequired(field: FormFieldDef, mode: FormMode) {
  if (mode === 'create') return !!field.requiredOnCreate;
  if (mode === 'update') return !!field.requiredOnUpdate;
  return false;
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isBlankRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => isEmptyValue(value));
}

/** 字段显式配置的选项值；未配置返回 null（此时不做选项合法性校验，避免误报）。 */
function optionValues(field: FormFieldDef): null | unknown[] {
  const props = field.controlProps as undefined | { options?: unknown };
  const options = props?.options;
  if (!Array.isArray(options) || options.length === 0) return null;
  return options.map((item) =>
    item && typeof item === 'object' && 'value' in item
      ? (item as { value: unknown }).value
      : item,
  );
}

function validateScalar(
  field: FormFieldDef,
  raw: unknown,
  title: string,
): null | string {
  const rules = field.rules;
  const text = typeof raw === 'string' ? raw : String(raw);

  if (rules) {
    if (
      rules.minLength !== undefined &&
      rules.minLength !== null &&
      text.length < rules.minLength
    ) {
      return rules.message || `「${title}」至少 ${rules.minLength} 个字符`;
    }
    if (
      rules.maxLength !== undefined &&
      rules.maxLength !== null &&
      text.length > rules.maxLength
    ) {
      return rules.message || `「${title}」最多 ${rules.maxLength} 个字符`;
    }
    if (rules.pattern && checkPattern(rules.pattern, text) === 'fail') {
      return rules.patternMessage || rules.message || `「${title}」格式不正确`;
    }
  }

  if (field.control === 'number' || typeof raw === 'number') {
    const num = typeof raw === 'number' ? raw : Number(text);
    if (!Number.isFinite(num)) {
      return `「${title}」必须是数字`;
    }
    if (rules?.min !== undefined && rules.min !== null && num < rules.min) {
      return rules?.message || `「${title}」不能小于 ${rules.min}`;
    }
    if (rules?.max !== undefined && rules.max !== null && num > rules.max) {
      return rules?.message || `「${title}」不能大于 ${rules.max}`;
    }
  }

  if (typeof raw === 'string') {
    if (field.control === 'date' && !DATE_PATTERN.test(raw)) {
      return `「${title}」日期格式应为 YYYY-MM-DD`;
    }
    if (field.control === 'datetime' && !DATETIME_PATTERN.test(raw)) {
      return `「${title}」时间格式应为 YYYY-MM-DD HH:mm:ss`;
    }
    if (field.control === 'time' && !TIME_PATTERN.test(raw)) {
      return `「${title}」时间格式应为 HH:mm`;
    }
  }

  if (SINGLE_OPTION_CONTROLS.has(field.control)) {
    const values = optionValues(field);
    if (values && !values.some((item) => String(item) === String(raw))) {
      return `「${title}」不是有效选项`;
    }
  }

  if (field.control === 'checkbox') {
    const values = optionValues(field);
    if (values && Array.isArray(raw)) {
      const invalid = raw.some(
        (item) => !values.some((option) => String(option) === String(item)),
      );
      if (invalid) return `「${title}」包含无效选项`;
    }
  }

  return null;
}

function validateField(
  field: FormFieldDef,
  raw: unknown,
  mode: FormMode,
): null | string {
  const title = field.title || field.field;

  if (isFieldRequired(field, mode) && isEmptyValue(raw)) {
    return `请填写「${title}」`;
  }
  if (isEmptyValue(raw)) return null;

  if (ARRAY_CONTROLS.has(field.control)) {
    if (!Array.isArray(raw)) return `「${title}」数据格式不正确`;

    if (
      field.minItems !== undefined &&
      field.minItems !== null &&
      raw.length < field.minItems
    ) {
      return `「${title}」至少 ${field.minItems} 行`;
    }
    if (
      field.maxItems !== undefined &&
      field.maxItems !== null &&
      raw.length > field.maxItems
    ) {
      return `「${title}」最多 ${field.maxItems} 行`;
    }

    if (ROW_CONTROLS.has(field.control) && field.children?.length) {
      for (const [index, row] of raw.entries()) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const rowRecord = row as Record<string, unknown>;
        if (isBlankRow(rowRecord)) continue;
        for (const child of field.children) {
          const error = validateField(child, rowRecord[child.field], mode);
          if (error) return `${title}第 ${index + 1} 行：${error}`;
        }
      }
    }
    return null;
  }

  return validateScalar(field, raw, title);
}

export function validateFormFields(
  fields: FormFieldDef[],
  record: Record<string, unknown>,
  mode: FormMode,
): null | string {
  for (const field of fields) {
    const error = validateField(field, record[field.field], mode);
    if (error) return error;
  }
  return null;
}

/** 从行数据按 payloadFields 抽取；空则整行浅拷贝 */
export function buildActionPayload(
  row: null | Record<string, unknown> | undefined,
  payloadFields?: string[],
  extra?: Record<string, unknown>,
) {
  const picked: [string, unknown][] = [];
  for (const field of payloadFields || []) {
    if (field) picked.push([field, row?.[field]]);
  }
  const base =
    !payloadFields?.length || !row ? { ...row } : Object.fromEntries(picked);
  return { ...base, ...extra };
}
