import type { ActionDef } from '#/api/saas/orchestration';

export type FormPageSource = 'report' | 'resource';

export function isCrudKind(kind?: string) {
  return kind === 'create' || kind === 'update' || kind === 'detail';
}

export function actionFormKey(action: ActionDef) {
  return action.formKey || action.formMode || action.kind || 'detail';
}

export function migrateActions(actions?: ActionDef[] | null): ActionDef[] {
  return (actions || []).map((action) => {
    const next = { ...action };
    const rawPos = (action.scene || action.position || '').toLowerCase();
    const batch = rawPos === 'batch' || action.scope === 'selection';
    if (batch) {
      next.multiSelect = true;
      next.scope = 'selection';
      if (rawPos === 'batch') {
        next.scene = 'toolbar';
        next.position = 'toolbar';
      }
    }
    const row = (next.scene || next.position) === 'row';
    if (row && action.fixed !== 'none') {
      next.fixed = 'right';
    }
    if (isCrudKind(action.kind) && !action.formKey) {
      next.formKey = action.formMode || action.kind;
    }
    return next;
  });
}

export function actionPlacement(action: ActionDef): 'row' | 'toolbar' {
  const pos = (action.scene || action.position || 'toolbar').toLowerCase();
  return pos === 'row' ? 'row' : 'toolbar';
}

export function actionSupportsMultiSelect(action: ActionDef): boolean {
  if (action.multiSelect === true) return true;
  if (action.multiSelect === false) return false;
  const pos = (action.scene || action.position || '').toLowerCase();
  return pos === 'batch' || action.scope === 'selection';
}

export function resolveActionOpen(action: ActionDef) {
  if (action.kind === 'delete') {
    return action.open === 'page' ? 'page' : 'none';
  }
  if (
    action.open === 'page' ||
    action.open === 'drawer' ||
    action.open === 'modal'
  ) {
    return action.open;
  }
  if (isCrudKind(action.kind)) return 'page';
  return action.open || 'none';
}

export function formOverlayHost(action?: ActionDef): 'drawer' | 'modal' {
  return action && resolveActionOpen(action) === 'modal' ? 'modal' : 'drawer';
}

export function formPagePath(options: {
  source: FormPageSource;
  code: string;
  formKey: string;
  id?: string;
}) {
  const root =
    options.source === 'report'
      ? `/app/reports/${options.code}`
      : `/app/${options.code}`;
  const base = `${root}/form/${options.formKey}`;
  return options.id ? `${base}/${options.id}` : base;
}

export function formModeLabel(formKey: string) {
  if (formKey === 'create') return '新增';
  if (formKey === 'update') return '编辑';
  return '详情';
}
