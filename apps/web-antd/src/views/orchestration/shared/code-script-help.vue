<script lang="ts" setup>
import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Collapse, Divider, message, Modal, Tag } from 'ant-design-vue';

export type CodeSampleId =
  | 'badConcat'
  | 'batch'
  | 'compute'
  | 'executeLoop'
  | 'loopLocals'
  | 'mapOuter'
  | 'mongoFind'
  | 'mongoInsertMany'
  | 'query'
  | 'redisGetSet'
  | 'redisMset';

const props = defineProps<{
  open: boolean;
  hasDataSource?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  apply: [script: string];
}>();

const activeKeys = ref<string[]>(['basics', 'redis', 'mongo']);

const visible = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
});

const samples: Array<{
  id: CodeSampleId;
  group: 'basics' | 'db' | 'forbid' | 'mongo' | 'redis' | 'vars';
  title: string;
  tip: string;
  needDb?: boolean;
  script: string;
}> = [
  {
    id: 'compute',
    group: 'basics',
    title: '纯计算 return',
    tip: '不绑库；用 nodeInput / input / sys 组装返回对象。',
    script: `const amount = Number(nodeInput.amount ?? input.amount ?? 0);
const level = amount > 1000 ? 'high' : 'normal';
return {
  level,
  amount,
  operator: sys.userName || 'anonymous'
};`,
  },
  {
    id: 'loopLocals',
    group: 'vars',
    title: '循环里用局部变量',
    tip: 'for / map / filter 里可自由声明临时变量；外层常量可直接闭包引用。',
    script: `const lines = nodeInput.lines || [];
const currency = nodeInput.currency || 'CNY';
const minQty = Number(nodeInput.minQty || 1);

const accepted = [];
const skipped = [];
for (const row of lines) {
  const sku = String(row.sku || '').trim();
  const qty = Number(row.qty || 0);
  if (!sku || qty < minQty) {
    skipped.push({ sku, qty, reason: 'invalid' });
    continue;
  }
  // 外层 currency / minQty 可在循环内直接使用
  accepted.push({
    sku,
    qty,
    currency,
    amount: qty * Number(row.price || 0)
  });
}

return {
  accepted,
  skipped,
  total: accepted.reduce((s, x) => s + x.amount, 0)
};`,
  },
  {
    id: 'mapOuter',
    group: 'vars',
    title: 'map 时带上外层字段',
    tip: '批量落库前先把 orderId 等外层标量「摊」进每一行参数对象。',
    script: `const orderId = nodeInput.orderId;
const lines = nodeInput.lines || [];

// ❌ 不要只传 row：外层 orderId 会丢失
// ✅ 显式合并外层变量
const paramList = lines.map((row) => ({
  orderId,
  sku: String(row.sku),
  qty: Number(row.qty),
  tenantHint: sys.tenantId || null
}));

return { orderId, count: paramList.length, paramList };`,
  },
  {
    id: 'query',
    group: 'db',
    title: 'db.query 查询',
    tip: '只读；返回 { rows, affectedRows, sqlFingerprint }。SQL 必须是字面量。',
    needDb: true,
    script: `const orderId = nodeInput.orderId;
const result = db.query(
  \`SELECT id, sku, qty FROM order_line WHERE order_id = @orderId\`,
  { orderId }
);
return {
  count: result.rows.length,
  rows: result.rows
};`,
  },
  {
    id: 'executeLoop',
    group: 'db',
    title: '循环 + db.execute（分支多）',
    tip: '行数少、每行逻辑不同时用；写库需 Sql.Write。循环内外层变量照常可用。',
    needDb: true,
    script: `const orderId = nodeInput.orderId;
const lines = nodeInput.lines || [];
let inserted = 0;
let skipped = 0;

for (const row of lines) {
  const sku = String(row.sku || '').trim();
  const qty = Number(row.qty || 0);
  if (!sku || qty <= 0) {
    skipped += 1;
    continue;
  }
  // 外层 orderId + 行内 sku/qty 一并作为命名参数
  const r = db.execute(
    \`INSERT INTO order_line (order_id, sku, qty) VALUES (@orderId, @sku, @qty)\`,
    { orderId, sku, qty }
  );
  inserted += r.affectedRows;
}

return { inserted, skipped };`,
  },
  {
    id: 'batch',
    group: 'db',
    title: 'db.batch 批量写入（推荐）',
    tip: '同一 SQL + 参数对象数组；服务端按行参数化执行。适合 list 落库。',
    needDb: true,
    script: `const orderId = nodeInput.orderId;
const lines = nodeInput.lines || [];

const paramList = [];
for (const row of lines) {
  if (!row.sku || Number(row.qty) <= 0) continue;
  paramList.push({
    orderId,                 // 外层变量
    sku: String(row.sku),    // 行内字段
    qty: Number(row.qty)
  });
}

const batch = db.batch(
  \`INSERT INTO order_line (order_id, sku, qty) VALUES (@orderId, @sku, @qty)\`,
  paramList
);

return {
  inserted: batch.affectedRows,
  skipped: lines.length - paramList.length
};`,
  },
  {
    id: 'redisGetSet',
    group: 'redis',
    title: 'Redis：查询 get + 写入 set',
    tip: '字符串值；对象会 JSON 序列化。可选 ttl 秒。',
    needDb: true,
    script: `const cacheKey = 'order:' + nodeInput.orderId;

// 查询
const cached = db.get(cacheKey);
if (cached) {
  return { fromCache: true, data: JSON.parse(cached) };
}

// 写入（外层变量拼 key；值可为对象）
const payload = {
  orderId: nodeInput.orderId,
  status: nodeInput.status || 'pending',
  by: sys.userName
};
db.set(cacheKey, payload, { ttl: 600 });

return { fromCache: false, key: cacheKey, data: payload };`,
  },
  {
    id: 'redisMset',
    group: 'redis',
    title: 'Redis：批量 mget / mset',
    tip: 'mget 查多 key；mset 一次写多 key（批量插入缓存）。循环里可拼外层前缀。',
    needDb: true,
    script: `const prefix = 'sku:' + (nodeInput.tenantId || sys.tenantId || 'host') + ':';
const lines = nodeInput.lines || [];

// 批量查询
const keys = lines.map((x) => prefix + x.sku);
const got = db.mget(keys);

// 批量写入：把外层字段摊进每个 value
const map = {};
for (const row of lines) {
  const key = prefix + String(row.sku);
  map[key] = JSON.stringify({
    sku: row.sku,
    qty: Number(row.qty || 0),
    orderId: nodeInput.orderId
  });
}
const written = db.mset(map);

return {
  queried: got.rows,
  written: written.affectedRows
};`,
  },
  {
    id: 'mongoFind',
    group: 'mongo',
    title: 'MongoDB：查询 find / findOne',
    tip: '集合名必须是字面量；filter/options 可用变量。',
    needDb: true,
    script: `const orderId = nodeInput.orderId;

const one = db.findOne('orders', { orderId });
const list = db.find(
  'order_lines',
  { orderId, qty: { $gte: 1 } },
  { limit: 100, sort: { sku: 1 } }
);

return {
  order: one,
  lines: list.rows,
  count: list.affectedRows
};`,
  },
  {
    id: 'mongoInsertMany',
    group: 'mongo',
    title: 'MongoDB：insertOne / insertMany（批量）',
    tip: 'insertMany = 批量插入；循环里可先过滤再组装 docs，外层字段写入每条文档。',
    needDb: true,
    script: `const orderId = nodeInput.orderId;
const lines = nodeInput.lines || [];

db.insertOne('orders', {
  orderId,
  createdBy: sys.userName,
  createdAt: sys.Now
});

const docs = [];
for (const row of lines) {
  if (!row.sku || Number(row.qty) <= 0) continue;
  docs.push({
    orderId,                 // 外层变量
    sku: String(row.sku),
    qty: Number(row.qty),
    tenantId: sys.tenantId || null
  });
}

const batch = db.insertMany('order_lines', docs);
return {
  insertedLines: batch.affectedRows,
  skipped: lines.length - docs.length
};`,
  },
  {
    id: 'badConcat',
    group: 'forbid',
    title: '禁止：拼接 SQL / 动态集合名',
    tip: '仅作反例说明，请勿填入运行。',
    needDb: true,
    script: `// ❌ SQL：禁止把值拼进文本
// db.execute("INSERT … VALUES ('" + nodeInput.sku + "')");
//
// ❌ Mongo：集合名必须字面量，不能 db.insertOne(nodeInput.coll, doc)
//
// ✅ Redis key 可用变量拼接；✅ Mongo filter 可用变量对象
return { ok: false, hint: '这是反例' };`,
  },
];

function applySample(id: CodeSampleId) {
  const sample = samples.find((x) => x.id === id);
  if (!sample) return;
  if (sample.needDb && !props.hasDataSource) {
    message.warning('请先在上方选择 dataSourceId，再填入数据库示例');
  }
  emit('apply', sample.script);
  message.success(`已填入：${sample.title}`);
  visible.value = false;
}

function groupSamples(group: string) {
  return samples.filter((x) => x.group === group);
}
</script>

<template>
  <Modal
    v-model:open="visible"
    title="Code 脚本说明与示例"
    :width="760"
    :footer="null"
    destroy-on-close
  >
    <div class="space-y-3 text-sm">
      <div
        class="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
      >
        <div class="mb-1 font-medium text-foreground">能力边界</div>
        <ul class="list-disc space-y-0.5 pl-4">
          <li>
            可读：
            <code>nodeInput</code>（本节点入参）、
            <code>input</code>（流程入参）、 <code>sys</code>（系统上下文）、
            <code>results</code>（上游出参，推荐仍用 inputs 绑进 nodeInput）
          </li>
          <li>
            可写本地变量：
            <code>const</code> / <code>let</code>、 <code>for</code> /
            <code>map</code> / <code>filter</code> / <code>reduce</code>
            ；循环内外层变量可自由闭包使用
          </li>
          <li>
            按数据源类型调用不同 API（需选 dataSourceId）：
            <div class="mt-1">
              SQL：
              <Tag class="mx-0.5" color="blue">query</Tag>
              <Tag class="mx-0.5" color="blue">execute</Tag>
              <Tag class="mx-0.5" color="blue">batch</Tag>
            </div>
            <div>
              Redis：
              <Tag class="mx-0.5" color="orange">get/set</Tag>
              <Tag class="mx-0.5" color="orange">mget/mset</Tag>
              <Tag class="mx-0.5" color="orange">del</Tag>
            </div>
            <div>
              Mongo：
              <Tag class="mx-0.5" color="green">find/findOne</Tag>
              <Tag class="mx-0.5" color="green">insertOne/insertMany</Tag>
              <Tag class="mx-0.5" color="green">updateOne/deleteMany</Tag>
            </div>
          </li>
          <li>
            SQL 文本 / Mongo 集合名须为<strong>字面量</strong>；写操作需
            <code>Orchestration.Sql.Write</code>；试运行不落库
          </li>
          <li>
            最后用
            <code>return { … }</code>
            ；出参相对
            <code>resultRoot=return</code>
          </li>
        </ul>
      </div>

      <Collapse
        v-model:active-key="activeKeys"
        :bordered="false"
        class="bg-transparent"
      >
        <Collapse.Panel key="basics" header="基础：纯计算">
          <div
            v-for="s in groupSamples('basics')"
            :key="s.id"
            class="mb-3 rounded-lg border border-border p-3 last:mb-0"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <div class="font-medium">{{ s.title }}</div>
              <Button
                size="small"
                type="primary"
                ghost
                @click="applySample(s.id)"
              >
                填入此示例
              </Button>
            </div>
            <div class="mb-2 text-xs text-muted-foreground">{{ s.tip }}</div>
            <pre
              class="max-h-48 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-100"
              >{{ s.script }}</pre>
          </div>
        </Collapse.Panel>

        <Collapse.Panel key="vars" header="变量与循环（外层字段怎么进循环）">
          <div class="mb-2 text-xs leading-relaxed text-muted-foreground">
            循环体里可以声明任意临时变量；外层的
            <code>orderId</code>、<code>currency</code>、<code>sys.*</code>
            等都能直接用。落库时务必把外层字段<strong>显式写进</strong>每一行参数对象，不要指望
            SQL 自己知道。
          </div>
          <div
            v-for="s in groupSamples('vars')"
            :key="s.id"
            class="mb-3 rounded-lg border border-border p-3 last:mb-0"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <div class="font-medium">{{ s.title }}</div>
              <Button
                size="small"
                type="primary"
                ghost
                @click="applySample(s.id)"
              >
                填入此示例
              </Button>
            </div>
            <div class="mb-2 text-xs text-muted-foreground">{{ s.tip }}</div>
            <pre
              class="max-h-56 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-100"
              >{{ s.script }}</pre>
          </div>
        </Collapse.Panel>

        <Collapse.Panel key="db" header="SQL：query / execute / batch">
          <div class="mb-2 text-xs leading-relaxed text-muted-foreground">
            适用于 PostgreSQL / MySQL / SQL Server / Oracle。无自由拼 SQL。
          </div>
          <div
            v-for="s in groupSamples('db')"
            :key="s.id"
            class="mb-3 rounded-lg border border-border p-3 last:mb-0"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <div class="font-medium">
                {{ s.title }}
                <Tag v-if="s.needDb" class="ml-1" color="orange">需选库</Tag>
              </div>
              <Button
                size="small"
                type="primary"
                ghost
                @click="applySample(s.id)"
              >
                填入此示例
              </Button>
            </div>
            <div class="mb-2 text-xs text-muted-foreground">{{ s.tip }}</div>
            <pre
              class="max-h-56 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-100"
              >{{ s.script }}</pre>
          </div>
        </Collapse.Panel>

        <Collapse.Panel key="redis" header="Redis：查询 / 写入 / 批量">
          <div class="mb-2 text-xs leading-relaxed text-muted-foreground">
            <code>get</code> 查单 key；<code>mget</code> 批量查；
            <code>set</code> 写单 key（可 ttl）； <code>mset</code> 批量写（推荐
            list→缓存）； <code>del</code> 删除。key 可用变量拼接；值对象会 JSON
            序列化。
          </div>
          <div
            v-for="s in groupSamples('redis')"
            :key="s.id"
            class="mb-3 rounded-lg border border-border p-3 last:mb-0"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <div class="font-medium">
                {{ s.title }}
                <Tag class="ml-1" color="orange">需 Redis 连接</Tag>
              </div>
              <Button
                size="small"
                type="primary"
                ghost
                @click="applySample(s.id)"
              >
                填入此示例
              </Button>
            </div>
            <div class="mb-2 text-xs text-muted-foreground">{{ s.tip }}</div>
            <pre
              class="max-h-56 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-100"
              >{{ s.script }}</pre>
          </div>
        </Collapse.Panel>

        <Collapse.Panel key="mongo" header="MongoDB：查询 / 插入 / 批量插入">
          <div class="mb-2 text-xs leading-relaxed text-muted-foreground">
            <code>find</code> / <code>findOne</code> 查询；
            <code>insertOne</code> 单插；
            <code>insertMany</code> 批量插入（推荐）； <code>updateOne</code> /
            <code>deleteMany</code> 更新删除。
            集合名必须字面量；filter/文档可用变量；外层字段写入每条 doc。
          </div>
          <div
            v-for="s in groupSamples('mongo')"
            :key="s.id"
            class="mb-3 rounded-lg border border-border p-3 last:mb-0"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <div class="font-medium">
                {{ s.title }}
                <Tag class="ml-1" color="green">需 Mongo 连接</Tag>
              </div>
              <Button
                size="small"
                type="primary"
                ghost
                @click="applySample(s.id)"
              >
                填入此示例
              </Button>
            </div>
            <div class="mb-2 text-xs text-muted-foreground">{{ s.tip }}</div>
            <pre
              class="max-h-56 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-100"
              >{{ s.script }}</pre>
          </div>
        </Collapse.Panel>

        <Collapse.Panel key="forbid" header="禁止写法">
          <div
            v-for="s in groupSamples('forbid')"
            :key="s.id"
            class="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 last:mb-0"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <div class="font-medium text-rose-700 dark:text-rose-300">
                {{ s.title }}
              </div>
              <Button size="small" danger ghost @click="applySample(s.id)">
                填入反例（勿运行）
              </Button>
            </div>
            <div class="mb-2 text-xs text-muted-foreground">{{ s.tip }}</div>
            <pre
              class="max-h-48 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-100"
              >{{ s.script }}</pre>
          </div>
        </Collapse.Panel>
      </Collapse>

      <Divider class="my-1" />
      <div class="flex items-start gap-2 text-xs text-muted-foreground">
        <IconifyIcon icon="lucide:lightbulb" class="mt-0.5 shrink-0" />
        <div>
          上游 Http/Assign 的字段请用本节点
          <strong>入参绑定</strong>
          进
          <code>nodeInput</code>
          ，脚本里再读；比直接挖
          <code>results.xxx</code>
          更清晰、也方便单节点试跑。
        </div>
      </div>
    </div>
  </Modal>
</template>
