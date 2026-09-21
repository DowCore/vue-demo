import dayjs from 'dayjs';

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

export function formatCellValue(
  value: unknown,
  preset?: null | string,
  dictMap?: Record<string, string>,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value);
  if (dictMap && dictMap[key] !== undefined) {
    return dictMap[key];
  }
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
    value?: string;
    tone?: string;
    target?: string;
  }>,
  target: 'cell' | 'row' = 'cell',
): string {
  if (!rules?.length) return '';
  for (const rule of rules) {
    if ((rule.target || 'cell') !== target) continue;
    if (matchStyleRule(value, rule.op || 'eq', rule.value)) {
      return rule.tone || '';
    }
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
