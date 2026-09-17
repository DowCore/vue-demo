import type { InputParameter, OutputParameter } from './dsl-graph';

/** 根据 InputSchema 生成试运行示例 JSON（仅 source=input） */
export function buildSampleInputJson(
  inputs: InputParameter[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const p of inputs || []) {
    if (p.source === 'system') continue;
    if (!p.name) continue;
    result[p.name] = sampleValue(p);
  }
  return result;
}

function sampleValue(p: InputParameter): unknown {
  if (p.default !== undefined && p.default !== null && p.default !== '') {
    return coerceDefault(p);
  }
  const minRule = p.rules?.find((r) => r.type === 'min');
  const minLen = p.rules?.find((r) => r.type === 'minLength');
  const enumRule = p.rules?.find((r) => r.type === 'enum');
  if (enumRule && Array.isArray(enumRule.value) && enumRule.value.length > 0) {
    return enumRule.value[0];
  }
  switch (p.type) {
    case 'number': {
      return typeof minRule?.value === 'number' ? minRule.value : 0;
    }
    case 'boolean': {
      return false;
    }
    case 'datetime': {
      return new Date().toISOString();
    }
    case 'guid': {
      return '00000000-0000-0000-0000-000000000000';
    }
    case 'object': {
      const obj: Record<string, unknown> = {};
      for (const child of p.properties || []) {
        if (!child.name) continue;
        obj[child.name] = sampleValue(child);
      }
      return obj;
    }
    case 'array': {
      if (!p.items) return [];
      return [
        sampleValue({
          ...p.items,
          name: p.items.name || 'item',
          source: 'input',
        }),
      ];
    }
    default: {
      const n = typeof minLen?.value === 'number' ? minLen.value : 0;
      return n > 0 ? 'x'.repeat(n) : '';
    }
  }
}

function coerceDefault(p: InputParameter): unknown {
  const d = p.default;
  if (p.type === 'number' && typeof d === 'string') {
    const n = Number(d);
    return Number.isFinite(n) ? n : d;
  }
  if (p.type === 'boolean') {
    if (typeof d === 'boolean') return d;
    return String(d).toLowerCase() === 'true';
  }
  return d;
}

/** 扁平列出可选路径，供条件/绑定选择器参考 */
export function flattenInputPaths(
  inputs: InputParameter[],
  prefix = 'input',
): Array<{ path: string; type: string; label: string }> {
  const rows: Array<{ path: string; type: string; label: string }> = [];
  for (const p of inputs || []) {
    if (!p.name) continue;
    const path = `${prefix}.${p.name}`;
    rows.push({
      path,
      type: p.type,
      label: p.displayName || p.name,
    });
    if (p.type === 'object' && p.properties?.length) {
      rows.push(...flattenInputPaths(p.properties, path));
    }
    if (
      p.type === 'array' &&
      p.items?.type === 'object' &&
      p.items.properties?.length
    ) {
      rows.push(...flattenInputPaths(p.items.properties, `${path}[]`));
    }
  }
  return rows;
}

export function ensureParamTree(inputs: InputParameter[]): InputParameter[] {
  return (inputs || []).map((p) => ({
    ...p,
    source: p.source || 'input',
    rules: p.rules || [],
    properties:
      p.type === 'object' ? ensureParamTree(p.properties || []) : p.properties,
    items:
      p.type === 'array' && p.items
        ? {
            ...p.items,
            source: 'input' as const,
            rules: p.items.rules || [],
            properties:
              p.items.type === 'object'
                ? ensureParamTree(p.items.properties || [])
                : p.items.properties,
          }
        : p.items,
  }));
}

export type { InputParameter, OutputParameter };
