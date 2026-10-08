import type { FormFieldDef } from '#/api/saas/orchestration';

export function isFieldRequired(
  field: FormFieldDef,
  mode: 'create' | 'detail' | 'update',
) {
  if (mode === 'create') return !!field.requiredOnCreate;
  if (mode === 'update') return !!field.requiredOnUpdate;
  return false;
}

export function validateFormFields(
  fields: FormFieldDef[],
  record: Record<string, unknown>,
  mode: 'create' | 'detail' | 'update',
): null | string {
  for (const field of fields) {
    const title = field.title || field.field;
    const raw = record[field.field];
    const empty =
      raw === undefined ||
      raw === null ||
      (typeof raw === 'string' && raw.trim() === '');

    if (isFieldRequired(field, mode) && empty) {
      return `请填写「${title}」`;
    }
    if (empty) continue;

    const rules = field.rules;
    if (!rules) continue;

    const text = String(raw);
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
    if (rules.pattern) {
      try {
        const re = new RegExp(rules.pattern);
        if (!re.test(text)) {
          return (
            rules.patternMessage || rules.message || `「${title}」格式不正确`
          );
        }
      } catch {
        // ignore invalid pattern in config
      }
    }
    if (field.control === 'number' || typeof raw === 'number') {
      const num = Number(raw);
      if (!Number.isNaN(num)) {
        if (rules.min !== undefined && rules.min !== null && num < rules.min) {
          return rules.message || `「${title}」不能小于 ${rules.min}`;
        }
        if (rules.max !== undefined && rules.max !== null && num > rules.max) {
          return rules.message || `「${title}」不能大于 ${rules.max}`;
        }
      }
    }
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
