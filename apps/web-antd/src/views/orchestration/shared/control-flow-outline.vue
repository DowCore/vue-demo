<script lang="ts" setup>
import type {
  DslBranch,
  DslEdge,
  DslNode,
  DslSubGraph,
  NodeBinding,
} from './dsl-graph';

import { ref } from 'vue';

import { Button, Input } from 'ant-design-vue';

defineOptions({ name: 'ControlFlowOutline' });

const props = defineProps<{
  branches?: DslBranch[] | null;
  editable?: boolean;
  graph?: DslSubGraph | null;
}>();

const emit = defineEmits<{
  'update:branches': [DslBranch[]];
  'update:graph': [DslSubGraph];
}>();

const openId = ref('');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function walk(graph?: DslSubGraph | null): DslNode[] {
  const nodes = graph?.nodes || [];
  if (nodes.length === 0) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Set((graph?.edges || []).map((edge) => edge.target));
  const start =
    nodes.find((node) => node.type === 'Start') ||
    nodes.find((node) => !incoming.has(node.id)) ||
    nodes[0];
  const next = new Map<string, string[]>();
  for (const edge of graph?.edges || []) {
    const list = next.get(edge.source) || [];
    list.push(edge.target);
    next.set(edge.source, list);
  }
  const ordered: DslNode[] = [];
  const seen = new Set<string>();
  const queue = start ? [start.id] : [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) ordered.push(node);
    for (const target of next.get(id) || []) queue.push(target);
  }
  for (const node of nodes) {
    if (!seen.has(node.id)) ordered.push(node);
  }
  return ordered;
}

function outs(graph: DslSubGraph | null | undefined, id: string): DslEdge[] {
  return (graph?.edges || []).filter((edge) => edge.source === id);
}

function caption(node: DslNode): string {
  const type = String(node.type || '');
  if (type === 'Start') return '开始';
  if (type === 'End') return '结束（本项产出）';
  if (type === 'Condition') return '条件';
  if (type === 'Log') return node.message ? `日志 ${node.message}` : '日志';
  if (type === 'Assign') {
    const names = (node.outputs || []).map((item) => item.name).filter(Boolean);
    return names.length > 0 ? `赋值 ${names.join('、')}` : '赋值';
  }
  if (type === 'ForEach') {
    return node.itemsPath ? `循环 ${node.itemsPath}` : '循环';
  }
  if (type === 'Parallel') {
    return `并行 ×${node.branches?.length || 0}（${node.joinMode || 'all'}）`;
  }
  if (type === 'SubFlow') {
    return node.subFlowKey ? `子流程 ${node.subFlowKey}` : '子流程';
  }
  return type || '节点';
}

function edgeLabel(edge: DslEdge): string {
  if (edge.isDefault) return '默认';
  if (edge.combine) return edge.combine;
  if (edge.when) return edge.when;
  return '';
}

function fromText(from: NodeBinding['from'] | string | undefined): string {
  if (from === null || from === undefined) return '';
  if (typeof from === 'string') return from;
  if (typeof from === 'object' && from && 'literal' in from) {
    return `literal:${JSON.stringify(from.literal)}`;
  }
  return JSON.stringify(from);
}

function parseFrom(text: string): NodeBinding['from'] {
  const raw = text.trim();
  if (raw.startsWith('literal:')) {
    const body = raw.slice('literal:'.length).trim();
    try {
      return { literal: JSON.parse(body) as unknown };
    } catch {
      return { literal: body };
    }
  }
  return raw;
}

function withGraph(mutate: (graph: DslSubGraph) => void) {
  if (!props.editable || !props.graph) return;
  const next = clone(props.graph);
  mutate(next);
  emit('update:graph', next);
}

function withBranches(mutate: (branches: DslBranch[]) => void) {
  if (!props.editable) return;
  const next = clone(props.branches || []);
  mutate(next);
  emit('update:branches', next);
}

function patchNode(id: string, mutate: (node: DslNode) => void) {
  withGraph((graph) => {
    const node = graph.nodes.find((item) => item.id === id);
    if (node) mutate(node);
  });
}

function setBinding(
  id: string,
  kind: 'inputs' | 'outputs',
  index: number,
  field: 'from' | 'name',
  value: string,
) {
  patchNode(id, (node) => {
    const list = (node[kind] || []) as NodeBinding[];
    const row = list[index];
    if (!row) return;
    if (field === 'name') row.name = value;
    else row.from = parseFrom(value);
    node[kind] = list;
  });
}

function addBinding(id: string, kind: 'inputs' | 'outputs') {
  patchNode(id, (node) => {
    const list = [...((node[kind] || []) as NodeBinding[])];
    list.push({ name: 'value', from: 'item' });
    node[kind] = list;
  });
}

function removeBinding(id: string, kind: 'inputs' | 'outputs', index: number) {
  patchNode(id, (node) => {
    const list = [...((node[kind] || []) as NodeBinding[])];
    list.splice(index, 1);
    node[kind] = list;
  });
}

function setFinalOutput(
  id: string,
  index: number,
  field: 'from' | 'name',
  value: string,
) {
  patchNode(id, (node) => {
    const list = [...(node.finalOutputs || [])];
    const row = list[index];
    if (!row) return;
    row[field] = value;
    node.finalOutputs = list;
  });
}

function addFinalOutput(id: string) {
  patchNode(id, (node) => {
    node.finalOutputs = [
      ...(node.finalOutputs || []),
      {
        name: 'value',
        type: 'string',
        from: 'value',
        visibleTo: { mode: 'all' },
      },
    ];
  });
}

function removeFinalOutput(id: string, index: number) {
  patchNode(id, (node) => {
    const list = [...(node.finalOutputs || [])];
    list.splice(index, 1);
    node.finalOutputs = list;
  });
}

function insertBeforeEnd(type: 'Assign' | 'Log') {
  withGraph((graph) => {
    const end = graph.nodes.find((node) => node.type === 'End');
    if (!end) return;
    const id = `body_${type.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
    const node: DslNode =
      type === 'Log'
        ? { id, type: 'Log', ref: id, message: '' }
        : {
            id,
            type: 'Assign',
            ref: id,
            inputs: [{ name: 'value', from: 'item' }],
            outputs: [{ name: 'value', from: 'value' }],
          };
    const endIndex = graph.nodes.findIndex((item) => item.id === end.id);
    graph.nodes.splice(endIndex, 0, node);
    for (const edge of graph.edges) {
      if (edge.target === end.id) edge.target = id;
    }
    graph.edges.push({ source: id, target: end.id });
  });
  openId.value = '';
}

function removeNode(id: string) {
  withGraph((graph) => {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node || node.type === 'Start' || node.type === 'End') return;
    const incoming = graph.edges.filter((edge) => edge.target === id);
    const outgoing = graph.edges.filter((edge) => edge.source === id);
    graph.edges = graph.edges.filter(
      (edge) => edge.source !== id && edge.target !== id,
    );
    for (const enter of incoming) {
      for (const leave of outgoing) {
        graph.edges.push({
          source: enter.source,
          target: leave.target,
          combine: leave.combine,
          isDefault: leave.isDefault,
          when: leave.when,
        });
      }
    }
    graph.nodes = graph.nodes.filter((item) => item.id !== id);
  });
}

function onNestedGraph(nodeId: string, graph: DslSubGraph) {
  patchNode(nodeId, (node) => {
    node.loopBody = graph;
  });
}

function onNestedBranches(nodeId: string, branches: DslBranch[]) {
  patchNode(nodeId, (node) => {
    node.branches = branches;
  });
}

function onBranchBody(refName: string, graph: DslSubGraph) {
  withBranches((branches) => {
    const branch = branches.find((item) => item.ref === refName);
    if (branch) branch.body = graph;
  });
}

function setMessage(id: string, message: string) {
  patchNode(id, (node) => {
    node.message = message;
  });
}

function setBranchRef(index: number, refName: string) {
  withBranches((branches) => {
    const branch = branches[index];
    if (branch) branch.ref = refName.trim();
  });
}

function toggleOptional(index: number) {
  withBranches((branches) => {
    const branch = branches[index];
    if (branch) branch.optional = !branch.optional;
  });
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="graph?.nodes?.length" class="space-y-1.5">
      <div
        v-for="node in walk(graph)"
        :key="node.id"
        class="rounded-md border border-border bg-background/60 px-2 py-1.5"
      >
        <button
          class="flex w-full items-center justify-between gap-2 text-left text-xs font-medium"
          type="button"
          @click="openId = openId === node.id ? '' : node.id"
        >
          <span>{{ caption(node) }}</span>
          <span
            v-if="editable && node.type !== 'Start'"
            class="text-muted-foreground text-[10px]"
          >
            {{ openId === node.id ? '收起' : '编辑' }}
          </span>
        </button>

        <div
          v-if="outs(graph, node.id).length > 1"
          class="text-muted-foreground mt-1 space-y-0.5 text-[10px]"
        >
          <div
            v-for="edge in outs(graph, node.id)"
            :key="`${edge.source}-${edge.target}`"
          >
            → {{ edge.target }}
            <span v-if="edgeLabel(edge)">（{{ edgeLabel(edge) }}）</span>
          </div>
        </div>

        <div
          v-if="editable && openId === node.id && node.type === 'Assign'"
          class="mt-2 space-y-1.5"
        >
          <div class="text-muted-foreground text-[10px]">
            取值写路径，例如 <code>item.sku</code>；固定值写
            <code>literal:"checked"</code> 或 <code>literal:1</code>
          </div>
          <div
            v-for="(row, index) in node.outputs || []"
            :key="`${node.id}-out-${index}`"
            class="flex items-center gap-1"
          >
            <Input
              :value="row.name"
              class="font-mono text-xs"
              placeholder="写出名"
              size="small"
              @update:value="
                setBinding(
                  node.id,
                  'outputs',
                  index,
                  'name',
                  String($event || ''),
                )
              "
            />
            <Input
              :value="fromText(row.from)"
              class="font-mono text-xs"
              placeholder="取值"
              size="small"
              @update:value="
                setBinding(
                  node.id,
                  'outputs',
                  index,
                  'from',
                  String($event || ''),
                )
              "
            />
            <Button
              danger
              size="small"
              type="link"
              @click="removeBinding(node.id, 'outputs', index)"
            >
              删除
            </Button>
          </div>
          <Button
            size="small"
            type="dashed"
            @click="addBinding(node.id, 'outputs')"
          >
            增加赋值
          </Button>
        </div>

        <div
          v-if="editable && openId === node.id && node.type === 'Log'"
          class="mt-2"
        >
          <Input
            :value="node.message || ''"
            class="text-xs"
            placeholder="日志内容，可用 {{item.sku}}"
            size="small"
            @update:value="setMessage(node.id, String($event || ''))"
          />
        </div>

        <div
          v-if="editable && openId === node.id && node.type === 'End'"
          class="mt-2 space-y-1.5"
        >
          <div class="text-muted-foreground text-[10px]">
            这里决定循环每一项返回哪些字段
          </div>
          <div
            v-for="(row, index) in node.finalOutputs || []"
            :key="`${node.id}-final-${index}`"
            class="flex items-center gap-1"
          >
            <Input
              :value="row.name"
              class="font-mono text-xs"
              placeholder="出参名"
              size="small"
              @update:value="
                setFinalOutput(node.id, index, 'name', String($event || ''))
              "
            />
            <Input
              :value="row.from"
              class="font-mono text-xs"
              placeholder="from"
              size="small"
              @update:value="
                setFinalOutput(node.id, index, 'from', String($event || ''))
              "
            />
            <Button
              danger
              size="small"
              type="link"
              @click="removeFinalOutput(node.id, index)"
            >
              删除
            </Button>
          </div>
          <Button size="small" type="dashed" @click="addFinalOutput(node.id)">
            增加出参
          </Button>
        </div>

        <div
          v-if="
            editable &&
            openId === node.id &&
            node.type !== 'Start' &&
            node.type !== 'End'
          "
          class="mt-1"
        >
          <Button danger size="small" type="link" @click="removeNode(node.id)">
            删除此步骤
          </Button>
        </div>

        <div
          v-if="node.type === 'ForEach' && node.loopBody"
          class="mt-1.5 pl-2"
        >
          <ControlFlowOutline
            :editable="editable"
            :graph="node.loopBody"
            @update:graph="onNestedGraph(node.id, $event)"
          />
        </div>
        <div
          v-else-if="node.type === 'ForEach' && node.subFlowKey"
          class="text-muted-foreground mt-1 text-[10px]"
        >
          循环体引用 {{ node.subFlowKey }}
        </div>
        <div v-if="node.type === 'Parallel'" class="mt-1.5">
          <ControlFlowOutline
            :branches="node.branches || []"
            :editable="editable"
            @update:branches="onNestedBranches(node.id, $event)"
          />
        </div>
      </div>

      <div v-if="editable" class="flex gap-2">
        <Button size="small" type="dashed" @click="insertBeforeEnd('Assign')">
          结束前加赋值
        </Button>
        <Button size="small" type="dashed" @click="insertBeforeEnd('Log')">
          结束前加日志
        </Button>
      </div>
    </div>

    <div v-if="branches?.length" class="space-y-2">
      <div
        v-for="(branch, index) in branches"
        :key="index"
        class="rounded-md border border-dashed border-border px-2 py-1.5"
      >
        <div class="mb-1 flex items-center gap-1 text-xs font-medium">
          <Input
            v-if="editable"
            :value="branch.ref"
            class="max-w-[140px] font-mono text-xs"
            size="small"
            @update:value="setBranchRef(index, String($event || ''))"
          />
          <span v-else class="font-mono">{{ branch.ref }}</span>
          <Button
            v-if="editable"
            size="small"
            type="link"
            @click="toggleOptional(index)"
          >
            {{ branch.optional ? '可选' : '必选' }}
          </Button>
          <span
            v-else-if="branch.optional"
            class="text-muted-foreground text-[10px]"
            >可选</span>
          <span
            v-if="branch.subFlowKey && !branch.body?.nodes?.length"
            class="text-muted-foreground text-[10px]"
          >
            → {{ branch.subFlowKey }}
          </span>
        </div>
        <ControlFlowOutline
          v-if="branch.body?.nodes?.length"
          :editable="editable"
          :graph="branch.body"
          @update:graph="onBranchBody(branch.ref, $event)"
        />
      </div>
    </div>
  </div>
</template>
