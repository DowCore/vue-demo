const fnCache = new Map<
  string,
  | ((value: unknown, row: Record<string, unknown>, raw: unknown) => unknown)
  | null
>();

function wrapBody(source: string): string {
  const body = source.trim();
  if (!body) return '';
  if (/\breturn\b/.test(body)) return body;
  return `return (${body});`;
}

export function compileCellFn(
  source?: null | string,
):
  | ((value: unknown, row: Record<string, unknown>, raw: unknown) => unknown)
  | null {
  const key = String(source || '').trim();
  if (!key) return null;
  if (fnCache.has(key)) return fnCache.get(key) ?? null;
  try {
    // oxlint-disable-next-line no-new-func
    const fn = new Function('value', 'row', 'raw', wrapBody(key)) as (
      value: unknown,
      row: Record<string, unknown>,
      raw: unknown,
    ) => unknown;
    fnCache.set(key, fn);
    return fn;
  } catch {
    fnCache.set(key, null);
    return null;
  }
}

export function runCellFn(
  source: null | string | undefined,
  value: unknown,
  row: Record<string, unknown>,
  raw: unknown,
): unknown {
  const fn = compileCellFn(source);
  if (!fn) return value;
  try {
    return fn(value, row, raw);
  } catch {
    return value;
  }
}

export function sanitizeCellHtml(html: string): string {
  return html
    .replaceAll(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replaceAll(/<\/?(?:iframe|object|embed|link|meta|style)\b[^>]*>/gi, '')
    .replaceAll(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replaceAll(/javascript:/gi, '');
}
