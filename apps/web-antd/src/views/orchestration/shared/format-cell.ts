import type {
  DictOption,
  ListColumnDef,
  NamedDict,
} from '#/api/saas/orchestration';

import dayjs from 'dayjs';

import { runCellFn, sanitizeCellHtml } from './cell-script';

export function formatDictMap(map?: Record<string, string>): string {
  if (!map) return '';
  return Object.entries(map)
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
}

export function parseDictMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of String(text || '').split(/[,;\n]/)) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) map[key] = value;
  }
  return map;
}

export function findNamedDict(
  dictionaries: NamedDict[] | undefined,
  code?: string,
): NamedDict | undefined {
  if (!code) return undefined;
  return (dictionaries || []).find(
    (d) => d.code.toLowerCase() === code.toLowerCase(),
  );
}

export function columnOptions(
  col?: ListColumnDef,
  dictionaries?: NamedDict[],
): DictOption[] {
  if (!col) return [];
  const shared = findNamedDict(dictionaries, col.dictCode);
  if (shared?.options?.length) return shared.options;
  if (col.options?.length) return col.options;
  return Object.entries(col.dictMap || {}).map(([value, label]) => ({
    value,
    label,
  }));
}

function applyPreset(value: unknown, preset?: null | string): string {
  if (value === null || value === undefined || value === '') return '—';
  const type = (preset || 'text').toLowerCase();
  if (type === 'boolean') {
    return value === true || value === 'true' || value === 1 ? '是' : '否';
  }
  if (type === 'date' || type === 'datetime') {
    const d = dayjs(String(value));
    if (!d.isValid()) return String(value);
    return type === 'date'
      ? d.format('YYYY-MM-DD')
      : d.format('YYYY-MM-DD HH:mm:ss');
  }
  const num = Number(value);
  if (type === 'currency' && !Number.isNaN(num)) {
    return num.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' });
  }
  if (type === 'number' && !Number.isNaN(num)) {
    return num.toLocaleString('zh-CN');
  }
  if (type === 'percent' && !Number.isNaN(num)) {
    return `${(num * 100).toFixed(2)}%`;
  }
  const text = String(value);
  if (type === 'ellipsis' && text.length > 24) {
    return `${text.slice(0, 24)}…`;
  }
  return text;
}

/** 新建/同步列时的布局默认值（对齐 Ant Design Pro / Jeecg 习惯） */
export function applyColumnLayoutDefaults(col: ListColumnDef): ListColumnDef {
  const preset = (col.formatPreset || 'text').toLowerCase();
  const next: ListColumnDef = { ...col };
  if (!next.align) {
    next.align = 'left';
    if (preset === 'currency' || preset === 'number' || preset === 'percent') {
      next.align = 'right';
    } else if (preset === 'boolean') {
      next.align = 'center';
    }
  }
  if (next.width === undefined || next.width === null) {
    if (preset === 'boolean') next.width = 80;
    else if (preset === 'date') next.width = 120;
    else if (preset === 'datetime') next.width = 170;
    else if (
      preset === 'currency' ||
      preset === 'number' ||
      preset === 'percent'
    ) {
      next.width = 120;
    }
  }
  if (
    (next.ellipsis === undefined || next.ellipsis === null) &&
    (preset === 'text' || preset === 'ellipsis')
  ) {
    next.ellipsis = true;
  }
  return next;
}

export function estimateTableScrollX(
  columns: ListColumnDef[],
  actionWidth = 0,
): number {
  let sum = actionWidth;
  for (const column of columns) {
    if (column.visible === false) continue;
    sum += column.width && column.width > 0 ? column.width : 140;
  }
  return Math.max(960, sum);
}

export function formatCellValue(
  value: unknown,
  preset?: null | string,
  dictMap?: Record<string, string>,
  options?: Array<{ label: string; value: string }>,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value);
  const mapped =
    options?.find((o) => o.value === key)?.label ??
    (dictMap && dictMap[key] !== undefined ? dictMap[key] : undefined);
  if (mapped !== undefined) return mapped;
  return applyPreset(value, preset);
}

export function formatCellDisplay(
  value: unknown,
  column: ListColumnDef,
  row: Record<string, unknown>,
  dictionaries?: NamedDict[],
): string {
  const options = columnOptions(column, dictionaries);
  const mapped = formatCellValue(
    value,
    column.formatPreset,
    column.dictMap,
    options,
  );
  if (!column.formatFn?.trim()) return mapped;
  const formatted = runCellFn(column.formatFn, mapped, row, value);
  if (formatted === null || formatted === undefined || formatted === '') {
    return '—';
  }
  return String(formatted);
}

export function formatCellHtml(
  value: unknown,
  column: ListColumnDef,
  row: Record<string, unknown>,
  dictionaries?: NamedDict[],
): string {
  if (!column.renderFn?.trim()) return '';
  const display = formatCellDisplay(value, column, row, dictionaries);
  const html = runCellFn(column.renderFn, display, row, value);
  if (html === null || html === undefined || html === '') return '';
  return sanitizeCellHtml(String(html));
}

export function toDatePickerValue(
  value: unknown,
  kind: 'date' | 'datetime',
): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const d = dayjs(String(value));
  if (!d.isValid()) return undefined;
  return kind === 'date'
    ? d.format('YYYY-MM-DD')
    : d.format('YYYY-MM-DD HH:mm:ss');
}

export function pickRecordValue(
  row: Record<string, unknown>,
  field: string,
): unknown {
  if (row[field] !== undefined) return row[field];
  const found = Object.keys(row).find(
    (k) => k.toLowerCase() === field.toLowerCase(),
  );
  return found ? row[found] : undefined;
}

export function matchStyleRule(
  value: unknown,
  op: string,
  expected?: string,
): boolean {
  const left = value === null || value === undefined ? '' : String(value);
  const right = expected ?? '';
  const ln = Number(left);
  const rn = Number(right);
  const numeric = !Number.isNaN(ln) && !Number.isNaN(rn) && right !== '';
  switch ((op || 'eq').toLowerCase()) {
    case 'ne': {
      return left !== right;
    }
    case 'gt': {
      return numeric ? ln > rn : left > right;
    }
    case 'gte': {
      return numeric ? ln >= rn : left >= right;
    }
    case 'lt': {
      return numeric ? ln < rn : left < right;
    }
    case 'lte': {
      return numeric ? ln <= rn : left <= right;
    }
    case 'contains': {
      return left.includes(right);
    }
    default: {
      return left === right;
    }
  }
}

export function resolveTone(
  value: unknown,
  rules?: Array<{
    op?: string;
    target?: string;
    tone?: string;
    value?: string;
  }>,
  target: 'cell' | 'row' = 'cell',
  options?: Array<{ tone?: string; value: string }>,
): string {
  if (rules?.length) {
    for (const rule of rules) {
      if ((rule.target || 'cell') !== target) continue;
      if (matchStyleRule(value, rule.op || 'eq', rule.value)) {
        return rule.tone || '';
      }
    }
  }
  if (target === 'cell' && options?.length) {
    const hit = options.find((o) => o.value === String(value ?? ''));
    if (hit?.tone) return hit.tone;
  }
  return '';
}

export function toneClass(tone?: string): string {
  switch (tone) {
    case 'success': {
      return 'text-emerald-700';
    }
    case 'warning': {
      return 'text-amber-700';
    }
    case 'danger': {
      return 'text-red-600 font-medium';
    }
    case 'info': {
      return 'text-sky-700';
    }
    case 'danger-subtle': {
      return 'bg-red-50';
    }
    case 'success-subtle': {
      return 'bg-emerald-50';
    }
    default: {
      return '';
    }
  }
}
