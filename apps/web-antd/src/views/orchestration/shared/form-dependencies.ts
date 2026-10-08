import type { FormFieldDependencyDef } from '#/api/saas/orchestration';

export function dependencyMatches(
  dep: FormFieldDependencyDef,
  model: Record<string, unknown>,
): boolean {
  const raw = model[dep.sourceField];
  const op = (dep.op || 'eq').toLowerCase();
  const target = dep.value ?? '';
  const empty =
    raw === undefined ||
    raw === null ||
    raw === '' ||
    (Array.isArray(raw) && raw.length === 0);
  if (op === 'isempty') return empty;
  if (op === 'isnotempty') return !empty;
  if (op === 'in' || op === 'notin') {
    const values = target
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const hit = values.includes(String(raw ?? ''));
    if (op === 'in') return hit;
    return !hit;
  }
  const text = String(raw ?? '');
  if (op === 'ne') return text !== String(target);
  if (op === 'contains') return text.includes(String(target));
  return text === String(target);
}

export function isHiddenByDependencies(
  dependencies: FormFieldDependencyDef[] | undefined,
  model: Record<string, unknown>,
) {
  for (const dep of dependencies || []) {
    const matched = dependencyMatches(dep, model);
    if (matched && dep.action === 'hide') return true;
    if (!matched && dep.action === 'show') return true;
  }
  return false;
}

export function isDisabledByDependencies(
  dependencies: FormFieldDependencyDef[] | undefined,
  model: Record<string, unknown>,
) {
  return (dependencies || []).some(
    (dep) => dependencyMatches(dep, model) && dep.action === 'disable',
  );
}

export function isEnabledByDependencies(
  dependencies: FormFieldDependencyDef[] | undefined,
  model: Record<string, unknown>,
) {
  return (dependencies || []).some(
    (dep) => dependencyMatches(dep, model) && dep.action === 'enable',
  );
}

export function isOptionalByDependencies(
  dependencies: FormFieldDependencyDef[] | undefined,
  model: Record<string, unknown>,
) {
  return (dependencies || []).some(
    (dep) => dependencyMatches(dep, model) && dep.action === 'optional',
  );
}

export function isRequiredByDependencies(
  dependencies: FormFieldDependencyDef[] | undefined,
  model: Record<string, unknown>,
) {
  return (dependencies || []).some(
    (dep) => dependencyMatches(dep, model) && dep.action === 'require',
  );
}

export function appliedSetValue(
  dependencies: FormFieldDependencyDef[] | undefined,
  model: Record<string, unknown>,
) {
  for (const dep of dependencies || []) {
    if (dep.action !== 'setValue') continue;
    if (!dependencyMatches(dep, model)) continue;
    return dep.setValue ?? '';
  }
  return undefined;
}
