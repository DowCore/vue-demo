export type FilterOp =
  | 'and'
  | 'between'
  | 'contains'
  | 'eq'
  | 'gt'
  | 'gte'
  | 'in'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'lt'
  | 'lte'
  | 'ne'
  | 'notContains'
  | 'notcontains'
  | 'or'
  | 'startswith';

export interface FilterNode {
  kind?: 'group' | 'rule';
  op?: string;
  left?: string;
  right?: unknown;
  children?: FilterNode[];
}

export interface SearchFormFieldDef {
  key: string;
  field: string;
  title: string;
  op: string;
  control: string;
  span?: number;
  placeholder?: string;
  orGroup?: string;
}

export interface SearchFormDef {
  columns?: number;
  fields: SearchFormFieldDef[];
}

export interface NamedFilterPreset {
  key: string;
  label: string;
  filter: FilterNode;
}

export const FILTER_OP_OPTIONS = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'ne' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' },
  { label: '包含', value: 'contains' },
  { label: '不包含', value: 'notcontains' },
  { label: '开头是', value: 'startswith' },
  { label: '介于', value: 'between' },
  { label: '为空', value: 'isEmpty' },
  { label: '非空', value: 'isNotEmpty' },
];

export function emptyGroup(op: 'and' | 'or' = 'and'): FilterNode {
  return { kind: 'group', op, children: [] };
}

export function emptyRule(left = ''): FilterNode {
  return { kind: 'rule', left, op: 'eq', right: '' };
}

export function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.every((x) => isBlankValue(x));
  return false;
}

export function pruneFilter(node?: FilterNode | null): FilterNode | undefined {
  if (!node) return undefined;
  const kind = node.kind || (node.children ? 'group' : 'rule');
  if (kind === 'rule') {
    const op = (node.op || 'eq').toLowerCase();
    if (op === 'isempty' || op === 'isnotempty') {
      return node.left ? { kind: 'rule', left: node.left, op } : undefined;
    }
    if (!node.left || isBlankValue(node.right)) return undefined;
    return {
      kind: 'rule',
      left: node.left,
      op,
      right: node.right,
    };
  }

  const children = (node.children || [])
    .map((child) => pruneFilter(child))
    .filter((child): child is FilterNode => !!child);
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return {
    kind: 'group',
    op: node.op === 'or' ? 'or' : 'and',
    children,
  };
}

export function mergeAnd(
  parts: Array<FilterNode | undefined>,
): FilterNode | undefined {
  const children = parts.filter((p): p is FilterNode => !!p);
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return { kind: 'group', op: 'and', children };
}

function rangeToRule(
  field: string,
  defaultOp: string,
  value: unknown,
): FilterNode | undefined {
  if (!Array.isArray(value)) {
    return isBlankValue(value)
      ? undefined
      : { kind: 'rule', left: field, op: defaultOp, right: value };
  }
  const min = value[0];
  const max = value[1];
  const hasMin = !isBlankValue(min);
  const hasMax = !isBlankValue(max);
  if (hasMin && hasMax) {
    return { kind: 'rule', left: field, op: 'between', right: [min, max] };
  }
  if (hasMin) return { kind: 'rule', left: field, op: 'gte', right: min };
  if (hasMax) return { kind: 'rule', left: field, op: 'lte', right: max };
  return undefined;
}

export function searchFormToFilter(
  fields: SearchFormFieldDef[],
  values: Record<string, unknown>,
): FilterNode | undefined {
  const andChildren: FilterNode[] = [];
  const orBuckets = new Map<string, FilterNode[]>();

  for (const field of fields) {
    const raw = values[field.key];
    const control = field.control || 'input';
    let rule: FilterNode | undefined;
    if (
      control === 'dateRange' ||
      control === 'numberRange' ||
      field.op === 'between'
    ) {
      rule = rangeToRule(field.field, field.op || 'between', raw);
    } else if (control === 'switch') {
      if (raw === true || raw === false) {
        rule = {
          kind: 'rule',
          left: field.field,
          op: field.op || 'eq',
          right: raw,
        };
      }
    } else {
      rule = isBlankValue(raw)
        ? undefined
        : { kind: 'rule', left: field.field, op: field.op || 'eq', right: raw };
    }
    if (!rule) continue;
    if (field.orGroup) {
      const bucket = orBuckets.get(field.orGroup) || [];
      bucket.push(rule);
      orBuckets.set(field.orGroup, bucket);
    } else {
      andChildren.push(rule);
    }
  }

  for (const bucket of orBuckets.values()) {
    const first = bucket[0];
    if (bucket.length === 1 && first) andChildren.push(first);
    else andChildren.push({ kind: 'group', op: 'or', children: bucket });
  }

  return pruneFilter({ kind: 'group', op: 'and', children: andChildren });
}

export function ensureGroup(node?: FilterNode | null): FilterNode {
  if (node?.kind === 'group' || node?.children) {
    return {
      kind: 'group',
      op: node.op === 'or' ? 'or' : 'and',
      children: [...(node.children || [])],
    };
  }
  if (node?.kind === 'rule' || node?.left) {
    return { kind: 'group', op: 'and', children: [node] };
  }
  return emptyGroup();
}
