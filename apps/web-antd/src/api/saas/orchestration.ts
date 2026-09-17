import { requestClient } from '#/api/request';

export type FlowDefinitionStatus = 0 | 1 | 2;
export type FlowInstanceStatus = 0 | 1 | 2 | 3;

export interface FlowDefinition {
  id: string;
  name: string;
  code: string;
  category?: string;
  status: FlowDefinitionStatus;
  graphJson?: string;
  dslJson?: string;
  publishedVersion?: number;
  creationTime?: string;
  lastModificationTime?: string;
}

export interface FlowVersion {
  id: string;
  definitionId: string;
  version: number;
  graphJson: string;
  dslJson: string;
  creationTime: string;
}

export interface NodeExecution {
  nodeId: string;
  nodeType: string;
  status: string;
  inputJson?: string;
  outputJson?: string;
  error?: string;
  durationMs: number;
}

export interface FlowInstance {
  id: string;
  definitionId: string;
  definitionName: string;
  version: number;
  status: FlowInstanceStatus;
  variablesJson?: string;
  error?: string;
  isDryRun: boolean;
  nodes: NodeExecution[];
  creationTime?: string;
}

export interface OrchestrationPagedResult<T> {
  items: T[];
  totalCount: number;
}

export function getFlowDefinitionsApi(params?: {
  filter?: string;
  status?: FlowDefinitionStatus;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<FlowDefinition>>(
    '/api/orchestration/definitions',
    { params },
  );
}

export function getFlowDefinitionApi(id: string) {
  return requestClient.get<FlowDefinition>(
    `/api/orchestration/definitions/${id}`,
  );
}

export function createFlowDefinitionApi(data: {
  name: string;
  code: string;
  category?: string;
  graphJson?: string;
  dslJson?: string;
}) {
  return requestClient.post<FlowDefinition>(
    '/api/orchestration/definitions',
    data,
  );
}

export function updateFlowDefinitionApi(
  id: string,
  data: {
    name: string;
    category?: string;
    graphJson?: string;
    dslJson?: string;
  },
) {
  return requestClient.put<FlowDefinition>(
    `/api/orchestration/definitions/${id}`,
    data,
  );
}

export function deleteFlowDefinitionApi(id: string) {
  return requestClient.delete(`/api/orchestration/definitions/${id}`);
}

export function publishFlowDefinitionApi(id: string) {
  return requestClient.post<FlowVersion>(
    `/api/orchestration/definitions/${id}/publish`,
  );
}

export function getFlowVersionsApi(id: string) {
  return requestClient.get<{ items: FlowVersion[] }>(
    `/api/orchestration/definitions/${id}/versions`,
  );
}

export function getFlowInstancesApi(params?: {
  definitionId?: string;
  status?: FlowInstanceStatus;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<FlowInstance>>(
    '/api/orchestration/instances',
    { params },
  );
}

export function getFlowInstanceApi(id: string) {
  return requestClient.get<FlowInstance>(`/api/orchestration/instances/${id}`);
}

export function startFlowInstanceApi(data: {
  definitionId: string;
  version?: number;
  variablesJson?: string;
}) {
  return requestClient.post<FlowInstance>('/api/orchestration/instances', data);
}

export function dryRunFlowInstanceApi(data: {
  definitionId: string;
  graphJson?: string;
  dslJson?: string;
  variablesJson?: string;
}) {
  return requestClient.post<FlowInstance>(
    '/api/orchestration/instances/dry-run',
    data,
  );
}

export function cancelFlowInstanceApi(id: string) {
  return requestClient.post(`/api/orchestration/instances/${id}/cancel`);
}

export function getSystemParametersApi() {
  return requestClient.get<{
    fixedKeys: Array<{
      key: string;
      category: string;
      description: string;
      sampleValue?: string;
    }>;
    dateExpressionExamples: string[];
    dateExpressionSyntax: string;
  }>('/api/orchestration/system-parameters');
}

export function previewDateExpressionApi(
  expression: string,
  timeZone?: string,
) {
  return requestClient.post<{ expression: string; value: string }>(
    '/api/orchestration/system-parameters/preview-date',
    { expression, timeZone },
  );
}

export type DataSourceAccessMode = 0 | 1 | 2;

export interface DataSourceLookup {
  code: string;
  name: string;
  provider: string;
  family: string;
  accessMode: DataSourceAccessMode;
}

export interface DataSourceItem {
  id: string;
  code: string;
  name: string;
  provider: string;
  family: string;
  accessMode: DataSourceAccessMode;
  allowedOps: string[];
  isEnabled: boolean;
  description?: string;
  hasConnectionString: boolean;
  connectionStringHint?: string;
  creationTime?: string;
  lastModificationTime?: string;
}

export interface DataSourceProviderOption {
  provider: string;
  displayName: string;
  family: string;
  connectionHint: string;
}

export function getDataSourceLookupApi() {
  return requestClient.get<{ items: DataSourceLookup[] }>(
    '/api/orchestration/data-sources/lookup',
  );
}

export function getDataSourceProvidersApi() {
  return requestClient.get<{ items: DataSourceProviderOption[] }>(
    '/api/orchestration/data-sources/providers',
  );
}

export function getDataSourcesApi(params?: {
  filter?: string;
  enabledOnly?: boolean;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<DataSourceItem>>(
    '/api/orchestration/data-sources',
    { params },
  );
}

export function createDataSourceApi(data: {
  code: string;
  name: string;
  provider: string;
  connectionString: string;
  accessMode?: DataSourceAccessMode;
  allowedOps?: string[];
  description?: string;
}) {
  return requestClient.post<DataSourceItem>(
    '/api/orchestration/data-sources',
    data,
  );
}

export function updateDataSourceApi(
  id: string,
  data: {
    name: string;
    provider: string;
    connectionString?: string;
    accessMode: DataSourceAccessMode;
    allowedOps?: string[];
    isEnabled: boolean;
    description?: string;
  },
) {
  return requestClient.put<DataSourceItem>(
    `/api/orchestration/data-sources/${id}`,
    data,
  );
}

export function deleteDataSourceApi(id: string) {
  return requestClient.delete(`/api/orchestration/data-sources/${id}`);
}

export function runLogicApi(flowKey: string, body: Record<string, unknown>) {
  return requestClient.post<{
    success: boolean;
    instanceId: string;
    data: unknown;
    error?: string;
    meta: {
      visibleFields: string[];
      omittedFieldCount: number;
      flowKey: string;
      version: number;
    };
  }>(`/api/logic/${encodeURIComponent(flowKey)}`, body);
}

/** 新建空白流程时的简单默认 DSL（复杂 HTTP 演示由 DbMigrator 种子写入库） */
export const DEFAULT_FLOW_DSL = `{
  "version": "1.1",
  "inputs": [
    { "name": "amount", "type": "number", "required": true, "source": "input" }
  ],
  "outputs": [
    { "name": "message", "type": "string", "from": "message", "visibleTo": { "mode": "all" } }
  ],
  "nodes": [
    { "id": "start", "type": "Start" },
    {
      "id": "if1",
      "type": "Condition",
      "items": [{ "no": 1, "left": "input.amount", "op": "gt", "right": 1000 }]
    },
    { "id": "log_high", "type": "Log", "ref": "logHigh", "message": "High: {{input.amount}}", "outputs": [{ "name": "message", "from": "message" }] },
    { "id": "log_low", "type": "Log", "ref": "logLow", "message": "Normal: {{input.amount}}", "outputs": [{ "name": "message", "from": "message" }] },
    { "id": "end", "type": "End" }
  ],
  "edges": [
    { "source": "start", "target": "if1" },
    { "source": "if1", "target": "log_high", "combine": "1" },
    { "source": "if1", "target": "log_low", "isDefault": true },
    { "source": "log_high", "target": "end" },
    { "source": "log_low", "target": "end" }
  ]
}`;
