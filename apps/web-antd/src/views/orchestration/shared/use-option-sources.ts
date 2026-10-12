/**
 * 选项数据源组合式函数。
 *
 * 两个渲染器（设计态 `vform-node`、运行态 `record-form-fields`）都需要
 * 「读配置 → 取数 → 落本地状态」这套动作，差异只在描述符数量，所以抽到这里，
 * 避免同一段逻辑写两份后各自漂移。
 *
 * 两条硬约束：
 * 1. **同参不重复请求**——按「入参指纹」判定，指纹没变就不发请求（含失败结果，避免重试风暴）；
 * 2. **竞态保护**——旧请求晚到不得覆盖新结果（依赖字段变化时会连发多次请求）。
 */
import type { OptionDataSource, OptionNode } from './option-source';

import { ref } from 'vue';

import {
  loadOptionNodes,
  paramsFingerprint,
  staticOptionNodes,
} from './option-source';

export interface OptionSourceDescriptor {
  /** 组件内唯一标识，通常用字段名 / widget id */
  key: string;
  /** kind=static 时使用 */
  optionItems?: unknown;
  /** 入参模板取值作用域 */
  scope?: Record<string, unknown>;
  source: OptionDataSource;
}

/** 只保留仍然存活的键。用重建代替动态 delete（同时保证引用变化能触发视图刷新） */
function pickKeys<T>(
  source: Record<string, T>,
  alive: Set<string>,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(source)) {
    if (alive.has(key)) out[key] = value;
  }
  return out;
}

export function useOptionSources(
  getDescriptors: () => OptionSourceDescriptor[],
) {
  const nodes = ref<Record<string, OptionNode[]>>({});
  const errors = ref<Record<string, string>>({});

  /** key → 已完成的指纹 */
  const done = new Map<string, string>();
  /** key → 最新请求令牌 */
  const tokens = new Map<string, number>();

  function fingerprintOf(descriptor: OptionSourceDescriptor): string {
    return [
      descriptor.source.kind,
      descriptor.source.provider ?? '',
      descriptor.source.flowKey ?? '',
      paramsFingerprint(descriptor.source, descriptor.scope),
    ].join('|');
  }

  async function loadOne(descriptor: OptionSourceDescriptor, force: boolean) {
    const { key, source } = descriptor;
    if (source.kind === 'static') {
      nodes.value[key] = staticOptionNodes(descriptor.optionItems);
      errors.value[key] = '';
      return;
    }
    const fingerprint = fingerprintOf(descriptor);
    if (!force && done.get(key) === fingerprint) return;

    const token = (tokens.get(key) ?? 0) + 1;
    tokens.set(key, token);
    const result = await loadOptionNodes({
      optionItems: descriptor.optionItems,
      scope: descriptor.scope,
      source,
    });
    // 期间若有更新的请求发出，本次结果作废
    if (tokens.get(key) !== token) return;
    // 无论成败都记指纹：失败不再自动重试，改由 refresh(true) 手动重试
    done.set(key, fingerprint);
    nodes.value[key] = result.nodes;
    errors.value[key] = result.ok ? '' : result.error;
  }

  /**
   * 加载全部描述符。
   * @param force 忽略指纹缓存，强制重新取数（手动重试用）
   */
  async function refresh(force = false): Promise<void> {
    const list = getDescriptors();
    const alive = new Set(list.map((item) => item.key));
    for (const key of Object.keys(nodes.value)) {
      if (alive.has(key)) continue;
      done.delete(key);
      tokens.delete(key);
    }
    nodes.value = pickKeys(nodes.value, alive);
    errors.value = pickKeys(errors.value, alive);
    await Promise.all(list.map((item) => loadOne(item, force)));
  }

  return { errors, nodes, refresh };
}
