import type { ActionDef } from '#/api/saas/orchestration';

import { message, Modal } from 'ant-design-vue';

import { runLogicApi } from '#/api/saas/orchestration';

import { pickRecordValue } from './format-cell';

/** 从行数据抽取 flow 入参；未配置 payloadFields 则传整行 */
export function projectRowPayload(
  row: Record<string, unknown>,
  payloadFields?: string[],
) {
  if (!payloadFields?.length) {
    return { ...row };
  }
  const out: Record<string, unknown> = {};
  for (const field of payloadFields) {
    out[field] = pickRecordValue(row, field);
  }
  return out;
}

export function buildActionLogicPayload(input: {
  action: ActionDef;
  resourceCode?: string;
  reportCode?: string;
  row?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  ids?: string[];
  record?: Record<string, unknown>;
}) {
  const { action } = input;
  const fields = action.payloadFields;
  const row = input.row ? projectRowPayload(input.row, fields) : undefined;
  const rows = input.rows?.map((r) => projectRowPayload(r, fields));
  return {
    actionKey: action.key,
    resourceCode: input.resourceCode,
    reportCode: input.reportCode,
    ids: input.ids,
    row,
    rows,
    record: input.record,
  } as Record<string, unknown>;
}

function confirmAsync(title: string) {
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      title,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

/**
 * 自定义按钮：二次确认 → Invoker(flowKey) → after=refresh
 * @returns 是否成功执行
 */
export async function invokeActionFlow(
  action: ActionDef,
  payload: Record<string, unknown>,
  options?: {
    onRefresh?: () => Promise<void> | void;
  },
): Promise<boolean> {
  const flowKey = action.flowKey?.trim();
  if (!flowKey) {
    message.warning(`按钮「${action.label}」未绑定 flowKey`);
    return false;
  }

  if (action.confirm) {
    const ok = await confirmAsync(
      action.confirmText || `确认执行「${action.label}」？`,
    );
    if (!ok) return false;
  }

  try {
    const res = await runLogicApi(flowKey, payload);
    if (res && res.success === false) {
      message.error(res.error || `「${action.label}」执行失败`);
      return false;
    }
    message.success(`「${action.label}」已执行`);
    const after = (action.after || 'refresh').toLowerCase();
    if (after === 'refresh' || after === 'close') {
      await options?.onRefresh?.();
    }
    return true;
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : `「${action.label}」执行失败`,
    );
    return false;
  }
}

/** open=none 且配置了 flowKey 的自定义（或非 CRUD）动作 */
export function isDirectFlowAction(action: ActionDef) {
  const open = (action.open || 'none').toLowerCase();
  if (open !== 'none') return false;
  if (action.kind === 'delete') return false;
  return !!action.flowKey?.trim();
}
