/**
 * 统一选项数据源测试。
 *
 * 契约：
 * 1. 三种来源（静态 / 内置 / 逻辑编排）都归一到 `OptionNode[]`；
 * 2. 存量表单（没有 dataSource）行为不变——用户 / 部门仍拿内置数据；
 * 3. 脏数据（成环、找不到父级、超深嵌套）不丢数据也不卡死；
 * 4. 任何失败都以 `{ ok: false, error }` 返回，**绝不抛出**。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runLogicApi } from '#/api/saas/orchestration';

import {
  countNodes,
  describeNodes,
  extractRows,
  loadOptionNodes,
  mapRowsToNodes,
  normalizeOptionSource,
  paramsFingerprint,
  readScopeValue,
  renderParams,
  renderParamValue,
  resolveOptionSource,
  staticOptionNodes,
  templateFields,
} from '../option-source';
import { loadDeptTree, loadUserOptions } from '../org-options';

vi.mock('#/api/saas/orchestration', () => ({ runLogicApi: vi.fn() }));
vi.mock('../org-options', () => ({
  loadDeptTree: vi.fn(),
  loadUserOptions: vi.fn(),
}));

const mockFlow = vi.mocked(runLogicApi);
const mockDept = vi.mocked(loadDeptTree);
const mockUser = vi.mocked(loadUserOptions);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('normalizeOptionSource', () => {
  it('非对象一律返回 null', () => {
    expect(normalizeOptionSource(null)).toBeNull();
    expect(normalizeOptionSource(undefined)).toBeNull();
    expect(normalizeOptionSource('flow')).toBeNull();
    expect(normalizeOptionSource([])).toBeNull();
  });

  it('非法 kind 退化为 static', () => {
    expect(normalizeOptionSource({ kind: 'wat' })).toEqual({ kind: 'static' });
  });

  it('丢弃空串与空白键，未配置的键不落库', () => {
    const source = normalizeOptionSource({
      kind: 'flow',
      flowKey: '   ',
      labelField: '',
      params: { '  ': 'x', ' ': 'y' },
    });
    expect(source).toEqual({ kind: 'flow' });
  });

  it('保留有效配置并规范入参为字符串', () => {
    const source = normalizeOptionSource({
      kind: 'flow',
      flowKey: ' sys.dept.tree ',
      labelField: 'name',
      parentField: 'pid',
      rootValue: '0',
      params: { amount: 12, empty: null },
    });
    expect(source).toEqual({
      kind: 'flow',
      flowKey: 'sys.dept.tree',
      labelField: 'name',
      parentField: 'pid',
      rootValue: '0',
      params: { amount: '12' },
    });
  });
});

describe('resolveOptionSource —— 存量表单兼容', () => {
  it('未配置时：用户/部门走内置提供者，其余保持静态', () => {
    expect(resolveOptionSource('select', {})).toEqual({ kind: 'static' });
    expect(resolveOptionSource('cascader', {})).toEqual({ kind: 'static' });
    expect(resolveOptionSource('user-picker', {})).toEqual({
      kind: 'builtin',
      provider: 'user',
    });
    expect(resolveOptionSource('dept-picker', {})).toEqual({
      kind: 'builtin',
      provider: 'dept',
    });
  });

  it('识别运行态 control 名（userPicker / deptPicker）', () => {
    expect(resolveOptionSource('userPicker', {})).toEqual({
      kind: 'builtin',
      provider: 'user',
    });
    expect(resolveOptionSource('deptPicker', {})).toEqual({
      kind: 'builtin',
      provider: 'dept',
    });
  });

  it('显式配置优先于控件默认', () => {
    expect(
      resolveOptionSource('user-picker', {
        dataSource: { kind: 'flow', flowKey: 'hr.users' },
      }),
    ).toEqual({ kind: 'flow', flowKey: 'hr.users' });
    // 显式把用户组件切回静态也应当生效
    expect(
      resolveOptionSource('user-picker', { dataSource: { kind: 'static' } }),
    ).toEqual({ kind: 'static' });
  });

  it('也能从运行态 controlProps 的 optionSource 读取', () => {
    expect(
      resolveOptionSource('select', {
        optionSource: { kind: 'builtin', provider: 'dept' },
      }),
    ).toEqual({ kind: 'builtin', provider: 'dept' });
  });
});

describe('staticOptionNodes', () => {
  it('保留 value 原类型（数字不能被字符串化）', () => {
    expect(staticOptionNodes([{ label: '甲', value: 1 }])).toEqual([
      { label: '甲', value: 1 },
    ]);
  });

  it('label 缺失时回退为 value 文本', () => {
    expect(staticOptionNodes([{ value: 'a' }])).toEqual([
      { label: 'a', value: 'a' },
    ]);
  });

  it('跳过没有 value 的项，保留 children 与 disabled', () => {
    const nodes = staticOptionNodes([
      { label: '无值' },
      null,
      'x',
      { label: '父', value: 'p', children: [{ label: '子', value: 'c' }] },
      { disabled: true, label: '禁用', value: 'd' },
    ]);
    expect(nodes).toEqual([
      { label: '父', value: 'p', children: [{ label: '子', value: 'c' }] },
      { disabled: true, label: '禁用', value: 'd' },
    ]);
  });

  it('非数组返回空', () => {
    expect(staticOptionNodes(undefined)).toEqual([]);
    expect(staticOptionNodes({})).toEqual([]);
  });
});

describe('mapRowsToNodes —— 出参映射', () => {
  it('默认字段 label / value / children', () => {
    const nodes = mapRowsToNodes(
      [
        {
          label: '父',
          value: 'p',
          children: [{ label: '子', value: 'c' }],
        },
      ],
      { kind: 'flow' },
    );
    expect(nodes).toEqual([
      { label: '父', value: 'p', children: [{ label: '子', value: 'c' }] },
    ]);
  });

  it('支持自定义字段名与点路径', () => {
    const nodes = mapRowsToNodes([{ data: { name: '研发部' }, id: 'd1' }], {
      childrenField: 'kids',
      kind: 'flow',
      labelField: 'data.name',
      valueField: 'id',
    });
    expect(nodes).toEqual([{ label: '研发部', value: 'd1' }]);
  });

  it('label 缺失时回退为 value 文本', () => {
    const nodes = mapRowsToNodes([{ id: 'd1' }], {
      kind: 'flow',
      valueField: 'id',
    });
    expect(nodes).toEqual([{ label: 'd1', value: 'd1' }]);
  });

  it('没有 value 的行被丢弃', () => {
    expect(
      mapRowsToNodes([{ label: '空' }, { label: '有', value: 1 }], {
        kind: 'flow',
      }),
    ).toEqual([{ label: '有', value: 1 }]);
  });

  it('扁平列表按 parentField 组树', () => {
    const nodes = mapRowsToNodes(
      [
        { id: '1', name: '总部', pid: null },
        { id: '2', name: '研发', pid: '1' },
        { id: '3', name: '前端', pid: '2' },
      ],
      {
        kind: 'flow',
        labelField: 'name',
        parentField: 'pid',
        valueField: 'id',
      },
    );
    expect(nodes).toHaveLength(1);
    expect(countNodes(nodes)).toBe(3);
    expect(nodes[0]?.label).toBe('总部');
    expect(nodes[0]?.children?.[0]?.label).toBe('研发');
    expect(nodes[0]?.children?.[0]?.children?.[0]?.label).toBe('前端');
  });

  it('rootValue 指定顶层节点的父值（parent_id 约定）', () => {
    const nodes = mapRowsToNodes(
      [
        { id: '1', name: '华东', pid: '0' },
        { id: '2', name: '华南', pid: '0' },
        { id: '3', name: '上海', pid: '1' },
      ],
      {
        kind: 'flow',
        labelField: 'name',
        parentField: 'pid',
        rootValue: '0',
        valueField: 'id',
      },
    );
    expect(nodes.map((n) => n.label)).toEqual(['华东', '华南']);
    expect(nodes[0]?.children?.[0]?.label).toBe('上海');
    expect(countNodes(nodes)).toBe(3);
  });

  it('自引用根节点落成唯一根，其子级挂在它下面', () => {
    const nodes = mapRowsToNodes(
      [
        { id: '0', name: '根', pid: '0' },
        { id: '1', name: '子', pid: '0' },
      ],
      {
        kind: 'flow',
        labelField: 'name',
        parentField: 'pid',
        valueField: 'id',
      },
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.label).toBe('根');
    expect(nodes[0]?.children?.[0]?.label).toBe('子');
  });

  it('找不到父级的节点降级为根，不丢数据', () => {
    const nodes = mapRowsToNodes(
      [
        { id: '1', name: '孤儿', pid: 'missing' },
        { id: '2', name: '正常', pid: null },
      ],
      {
        kind: 'flow',
        labelField: 'name',
        parentField: 'pid',
        valueField: 'id',
      },
    );
    expect(countNodes(nodes)).toBe(2);
    expect(nodes.map((n) => n.label).toSorted()).toEqual(['孤儿', '正常']);
  });

  it('成环数据不死循环，且两个节点都被保留', () => {
    const nodes = mapRowsToNodes(
      [
        { id: 'a', name: 'A', pid: 'b' },
        { id: 'b', name: 'B', pid: 'a' },
      ],
      {
        kind: 'flow',
        labelField: 'name',
        parentField: 'pid',
        valueField: 'id',
      },
    );
    expect(countNodes(nodes)).toBe(2);
  });

  it('超深嵌套被截断，不会无限递归', () => {
    let deepest: Record<string, unknown> = {
      label: 'L40',
      value: 'v40',
    };
    for (let i = 39; i >= 0; i -= 1) {
      deepest = { children: [deepest], label: `L${i}`, value: `v${i}` };
    }
    const nodes = mapRowsToNodes([deepest], { kind: 'flow' });
    // 深度上限 32 → 层级 0..32 共 33 个节点
    expect(countNodes(nodes)).toBe(33);
  });

  it('忽略非对象行', () => {
    expect(
      mapRowsToNodes([1, 'x', null, { label: 'a', value: 1 }], {
        kind: 'flow',
      }),
    ).toEqual([{ label: 'a', value: 1 }]);
  });
});

describe('extractRows', () => {
  it('数组直接可用', () => {
    expect(extractRows([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(extractRows([])).toEqual([]);
  });

  it('兼容 rows / items / list / data 包裹', () => {
    expect(extractRows({ rows: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(extractRows({ items: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(extractRows({ list: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(extractRows({ data: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });

  it('非数组结构返回 null', () => {
    expect(extractRows({ foo: 1 })).toBeNull();
    expect(extractRows('x')).toBeNull();
    expect(extractRows(null)).toBeNull();
    expect(extractRows([1, 2, 3])).toBeNull();
  });
});

describe('入参模板', () => {
  it('整串占位符保留原类型', () => {
    expect(renderParamValue('{{amount}}', { amount: 12 })).toBe(12);
    expect(renderParamValue('{{flag}}', { flag: false })).toBe(false);
    expect(renderParamValue('{{ a.b }}', { a: { b: 'c' } })).toBe('c');
  });

  it('混排文本按字符串拼接，缺值变空串', () => {
    expect(renderParamValue('前缀-{{x}}', { x: 5 })).toBe('前缀-5');
    expect(renderParamValue('{{missing}}!', {})).toBe('!');
  });

  it('整串占位符取不到值时返回 undefined', () => {
    expect(renderParamValue('{{missing}}', {})).toBeUndefined();
  });

  it('readScopeValue 支持 field / form.xxx / 裸字段名三种写法', () => {
    const scope = { field: 'dept', form: { region: 'east' } };
    expect(readScopeValue(scope, 'field')).toBe('dept');
    expect(readScopeValue(scope, 'form.region')).toBe('east');
    expect(readScopeValue(scope, 'region')).toBe('east');
    expect(readScopeValue(scope, 'missing')).toBeUndefined();
    expect(readScopeValue(undefined, 'region')).toBeUndefined();
  });

  it('裸字段名与 form.字段名渲染结果一致', () => {
    const scope = { field: 'dept', form: { region: 'east' } };
    expect(renderParamValue('{{region}}', scope)).toBe('east');
    expect(renderParamValue('{{form.region}}', scope)).toBe('east');
  });

  it('renderParams 只渲染配置过的键', () => {
    expect(
      renderParams({ deptId: '{{dept}}', keyword: '固定' }, { dept: 'd1' }),
    ).toEqual({ deptId: 'd1', keyword: '固定' });
    expect(renderParams(undefined)).toEqual({});
  });

  it('templateFields 提取被引用的顶层字段并去重', () => {
    expect(
      templateFields({ a: '{{x}}', b: 'y{{z.w}}', c: '{{x}}久', d: '无' }),
    ).toEqual(['x', 'z']);
    expect(templateFields(undefined)).toEqual([]);
  });

  it('templateFields 归一 form. 前缀，并忽略 field 自身', () => {
    expect(
      templateFields({
        a: '{{form.region}}',
        b: '{{field}}',
        c: '{{form.a.b}}',
      }),
    ).toEqual(['region', 'a']);
  });

  it('paramsFingerprint：无入参为空串，取值不同则不同', () => {
    expect(paramsFingerprint({ kind: 'flow' }, {})).toBe('');
    const source = { kind: 'flow' as const, params: { deptId: '{{dept}}' } };
    expect(paramsFingerprint(source, { dept: 'd1' })).toBe(
      paramsFingerprint(source, { dept: 'd1' }),
    );
    expect(paramsFingerprint(source, { dept: 'd1' })).not.toBe(
      paramsFingerprint(source, { dept: 'd2' }),
    );
  });
});

describe('loadOptionNodes —— 静态与内置', () => {
  it('静态来源直接归一 optionItems', async () => {
    const result = await loadOptionNodes({
      optionItems: [{ label: '甲', value: 1 }],
      source: { kind: 'static' },
    });
    expect(result).toEqual({ nodes: [{ label: '甲', value: 1 }], ok: true });
  });

  it('内置用户提供者', async () => {
    mockUser.mockResolvedValue([
      { label: '张三 (zhangsan)', value: 'zhangsan' },
    ]);
    const result = await loadOptionNodes({
      source: { kind: 'builtin', provider: 'user' },
    });
    expect(result).toEqual({
      nodes: [{ label: '张三 (zhangsan)', value: 'zhangsan' }],
      ok: true,
    });
    expect(mockUser).toHaveBeenCalledTimes(1);
  });

  it('内置部门提供者保留树结构', async () => {
    mockDept.mockResolvedValue([
      {
        children: [{ title: '研发中心', value: 'd2' }],
        title: '总部',
        value: 'd1',
      },
    ]);
    const result = await loadOptionNodes({
      source: { kind: 'builtin', provider: 'dept' },
    });
    if (!result.ok) throw new Error('不应失败');
    expect(result.nodes).toEqual([
      {
        children: [{ label: '研发中心', value: 'd2' }],
        label: '总部',
        value: 'd1',
      },
    ]);
  });

  it('未指定提供者时返回错误而不是抛异常', async () => {
    const result = await loadOptionNodes({ source: { kind: 'builtin' } });
    if (result.ok) throw new Error('应当失败');
    expect(result.error).toContain('未指定内置数据提供者');
    expect(result.nodes).toEqual([]);
  });

  it('内置加载抛错时被兜住', async () => {
    mockUser.mockRejectedValue(new Error('身份服务不可用'));
    const result = await loadOptionNodes({
      source: { kind: 'builtin', provider: 'user' },
    });
    if (result.ok) throw new Error('应当失败');
    expect(result.error).toBe('身份服务不可用');
  });
});

describe('loadOptionNodes —— 逻辑编排', () => {
  it('未绑定 flowKey 时给出明确错误', async () => {
    const result = await loadOptionNodes({ source: { kind: 'flow' } });
    if (result.ok) throw new Error('应当失败');
    expect(result.error).toContain('未绑定逻辑编排流程');
    expect(mockFlow).not.toHaveBeenCalled();
  });

  it('成功时把出参映射成节点，并带上入参与上下文', async () => {
    mockFlow.mockResolvedValue({
      data: [{ id: 'd1', name: '总部' }],
      instanceId: 'i1',
      meta: {
        flowKey: 'sys.dept.tree',
        omittedFieldCount: 0,
        version: 1,
        visibleFields: [],
      },
      success: true,
    });
    const result = await loadOptionNodes({
      scope: { field: 'dept', form: { region: 'east' } },
      source: {
        flowKey: 'sys.dept.tree',
        kind: 'flow',
        labelField: 'name',
        params: { region: '{{form.region}}' },
        valueField: 'id',
      },
    });
    if (!result.ok) throw new Error('不应失败');
    expect(result.nodes).toEqual([{ label: '总部', value: 'd1' }]);
    expect(mockFlow).toHaveBeenCalledWith('sys.dept.tree', {
      field: 'dept',
      form: { region: 'east' },
      region: 'east',
    });
  });

  it('出参为 { rows } 也能识别', async () => {
    mockFlow.mockResolvedValue({
      data: { rows: [{ label: '甲', value: 1 }] },
      instanceId: 'i1',
      meta: {
        flowKey: 'f',
        omittedFieldCount: 0,
        version: 1,
        visibleFields: [],
      },
      success: true,
    });
    const result = await loadOptionNodes({
      source: { flowKey: 'f', kind: 'flow' },
    });
    if (!result.ok) throw new Error('不应失败');
    expect(result.nodes).toEqual([{ label: '甲', value: 1 }]);
  });

  it('出参形状不对时提示而不是静默为空', async () => {
    mockFlow.mockResolvedValue({
      data: { foo: 1 },
      instanceId: 'i1',
      meta: {
        flowKey: 'f',
        omittedFieldCount: 0,
        version: 1,
        visibleFields: [],
      },
      success: true,
    });
    const result = await loadOptionNodes({
      source: { flowKey: 'f', kind: 'flow' },
    });
    if (result.ok) throw new Error('应当失败');
    expect(result.error).toContain('流程未返回数组');
  });

  it('流程返回失败时透传错误信息', async () => {
    mockFlow.mockResolvedValue({
      data: null,
      error: '无权限',
      instanceId: 'i1',
      meta: {
        flowKey: 'f',
        omittedFieldCount: 0,
        version: 1,
        visibleFields: [],
      },
      success: false,
    });
    const result = await loadOptionNodes({
      source: { flowKey: 'f', kind: 'flow' },
    });
    if (result.ok) throw new Error('应当失败');
    expect(result.error).toBe('无权限');
  });

  it('请求抛异常时兜住不抛', async () => {
    mockFlow.mockRejectedValue(new Error('网络超时'));
    const result = await loadOptionNodes({
      source: { flowKey: 'f', kind: 'flow' },
    });
    if (result.ok) throw new Error('应当失败');
    expect(result.error).toBe('网络超时');
  });

  it('同参数的并发调用只打一次流程', async () => {
    mockFlow.mockResolvedValue({
      data: [{ label: '甲', value: 1 }],
      instanceId: 'i1',
      meta: {
        flowKey: 'f',
        omittedFieldCount: 0,
        version: 1,
        visibleFields: [],
      },
      success: true,
    });
    const input = {
      scope: { form: { x: 1 } },
      source: { flowKey: 'f', kind: 'flow' as const },
    };
    const [first, second] = await Promise.all([
      loadOptionNodes(input),
      loadOptionNodes(input),
    ]);
    expect(mockFlow).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});

describe('设计器辅助', () => {
  it('countNodes 统计含子级的节点数', () => {
    expect(countNodes([])).toBe(0);
    expect(
      countNodes([
        { label: '父', value: 1, children: [{ label: '子', value: 2 }] },
        { label: '独', value: 3 },
      ]),
    ).toBe(3);
  });

  it('describeNodes 按深度优先取前若干标签', () => {
    const nodes = [
      { label: '甲', value: 1, children: [{ label: '乙', value: 2 }] },
      { label: '丙', value: 3 },
    ];
    expect(describeNodes(nodes)).toBe('甲、乙、丙');
    expect(describeNodes(nodes, 2)).toBe('甲、乙');
    expect(describeNodes([])).toBe('');
  });
});
