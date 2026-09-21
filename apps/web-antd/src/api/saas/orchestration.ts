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
  isReusable?: boolean;
  isSystem?: boolean;
  creationTime?: string;
  lastModificationTime?: string;
}

export interface ReusableFlowLookup {
  id: string;
  code: string;
  name: string;
  category?: string;
  publishedVersion: number;
}

export interface FlowUsage {
  id: string;
  callerDefinitionId: string;
  callerCode: string;
  callerName: string;
  calleeFlowKey: string;
  nodeId?: string;
  nodeRef?: string;
  creationTime?: string;
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
  triggerSource?: string;
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
  isReusable?: boolean;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<FlowDefinition>>(
    '/api/orchestration/definitions',
    { params },
  );
}

export function getReusableFlowLookupApi(filter?: string) {
  return requestClient.get<{ items: ReusableFlowLookup[] }>(
    '/api/orchestration/definitions/reusable-lookup',
    { params: { filter } },
  );
}

export function getFlowUsagesByCalleeApi(flowKey: string) {
  return requestClient.get<{ items: FlowUsage[] }>(
    '/api/orchestration/definitions/usages/by-callee',
    { params: { flowKey } },
  );
}

export function getFlowUsagesByCallerApi(definitionId: string) {
  return requestClient.get<{ items: FlowUsage[] }>(
    `/api/orchestration/definitions/${definitionId}/usages`,
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
  isReusable?: boolean;
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
    isReusable?: boolean;
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

export function deleteFlowInstanceApi(id: string) {
  return requestClient.delete(`/api/orchestration/instances/${id}`);
}

export function deleteManyFlowInstancesApi(ids: string[]) {
  return requestClient.post('/api/orchestration/instances/delete-many', {
    ids,
  });
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

export function testDataSourceApi(data: {
  id?: string;
  provider: string;
  connectionString?: string;
}) {
  return requestClient.post<{
    success: boolean;
    elapsedMs: number;
    message?: string;
  }>('/api/orchestration/data-sources/test', data);
}

export function testSavedDataSourceApi(id: string) {
  return requestClient.post<{
    success: boolean;
    elapsedMs: number;
    message?: string;
  }>(`/api/orchestration/data-sources/${id}/test`);
}

/* ---- Message sources / triggers / schedules ---- */

export interface MessageSourceItem {
  id: string;
  code: string;
  name: string;
  provider: string;
  isEnabled: boolean;
  description?: string;
  hasConnectionString: boolean;
  connectionStringHint?: string;
  creationTime?: string;
}

export interface MessageSourceProviderOption {
  provider: string;
  displayName: string;
  connectionHint: string;
  consumeSupported: boolean;
}

export interface FlowTriggerItem {
  id: string;
  code: string;
  name: string;
  triggerType: number;
  flowKey: string;
  messageSourceCode: string;
  queue: string;
  exchange?: string;
  exchangeType?: string;
  routingKey?: string;
  isEnabled: boolean;
  description?: string;
  creationTime?: string;
}

export interface FlowScheduleItem {
  id: string;
  code: string;
  name: string;
  flowKey: string;
  cron: string;
  timeZone: string;
  variablesJson?: string;
  isEnabled: boolean;
  description?: string;
  lastFiredAt?: string;
  nextFireAt?: string;
  creationTime?: string;
}

export function getMessageSourceProvidersApi() {
  return requestClient.get<{ items: MessageSourceProviderOption[] }>(
    '/api/orchestration/message-sources/providers',
  );
}

export function getMessageSourceLookupApi() {
  return requestClient.get<{
    items: Array<{ code: string; name: string; provider: string }>;
  }>('/api/orchestration/message-sources/lookup');
}

export function getMessageSourcesApi(params?: {
  filter?: string;
  enabledOnly?: boolean;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<MessageSourceItem>>(
    '/api/orchestration/message-sources',
    { params },
  );
}

export function createMessageSourceApi(data: {
  code: string;
  name: string;
  provider: string;
  connectionString?: string;
  description?: string;
}) {
  return requestClient.post<MessageSourceItem>(
    '/api/orchestration/message-sources',
    data,
  );
}

export function updateMessageSourceApi(
  id: string,
  data: {
    name: string;
    provider: string;
    connectionString?: string;
    clearConnectionString?: boolean;
    isEnabled: boolean;
    description?: string;
  },
) {
  return requestClient.put<MessageSourceItem>(
    `/api/orchestration/message-sources/${id}`,
    data,
  );
}

export function deleteMessageSourceApi(id: string) {
  return requestClient.delete(`/api/orchestration/message-sources/${id}`);
}

export function getFlowTriggersApi(params?: {
  filter?: string;
  enabledOnly?: boolean;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<FlowTriggerItem>>(
    '/api/orchestration/triggers',
    { params },
  );
}

export function createFlowTriggerApi(data: {
  code: string;
  name: string;
  flowKey: string;
  messageSourceCode: string;
  queue: string;
  exchange?: string;
  exchangeType?: string;
  routingKey?: string;
  description?: string;
}) {
  return requestClient.post<FlowTriggerItem>(
    '/api/orchestration/triggers',
    data,
  );
}

export function updateFlowTriggerApi(
  id: string,
  data: {
    name: string;
    flowKey: string;
    messageSourceCode: string;
    queue: string;
    exchange?: string;
    exchangeType?: string;
    routingKey?: string;
    isEnabled: boolean;
    description?: string;
  },
) {
  return requestClient.put<FlowTriggerItem>(
    `/api/orchestration/triggers/${id}`,
    data,
  );
}

export function deleteFlowTriggerApi(id: string) {
  return requestClient.delete(`/api/orchestration/triggers/${id}`);
}

export function getFlowSchedulesApi(params?: {
  filter?: string;
  enabledOnly?: boolean;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<FlowScheduleItem>>(
    '/api/orchestration/schedules',
    { params },
  );
}

export function createFlowScheduleApi(data: {
  code: string;
  name: string;
  flowKey: string;
  cron: string;
  timeZone?: string;
  variablesJson?: string;
  description?: string;
}) {
  return requestClient.post<FlowScheduleItem>(
    '/api/orchestration/schedules',
    data,
  );
}

export function updateFlowScheduleApi(
  id: string,
  data: {
    name: string;
    flowKey: string;
    cron: string;
    timeZone?: string;
    variablesJson?: string;
    isEnabled: boolean;
    description?: string;
  },
) {
  return requestClient.put<FlowScheduleItem>(
    `/api/orchestration/schedules/${id}`,
    data,
  );
}

export function deleteFlowScheduleApi(id: string) {
  return requestClient.delete(`/api/orchestration/schedules/${id}`);
}

export function runFlowScheduleNowApi(id: string) {
  return requestClient.post<{
    success: boolean;
    instanceId: string;
    error?: string;
  }>(`/api/orchestration/schedules/${id}/run-now`);
}

/* ---- Managed tables / app resources ---- */

export type TableOrigin = 'convention' | 'imported' | 'managed' | 'user';
export type TableSyncState =
  | 'conflict'
  | 'draft'
  | 'inSync'
  | 'localAhead'
  | 'remoteAhead';

export interface TableColumn {
  name: string;
  displayName: string;
  platformType: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  default?: string;
  unique: boolean;
  comment?: string;
  origin: string;
  appliedName?: string;
}

export interface TableIndexColumn {
  name: string;
  descending: boolean;
}

export interface TableIndex {
  name: string;
  unique: boolean;
  isPrimary: boolean;
  origin: string;
  columns: TableIndexColumn[];
}

export interface TableDefinition {
  id: string;
  dataSourceCode: string;
  tableName: string;
  displayName: string;
  origin: string;
  syncState: string | TableSyncState;
  lastAppliedAt?: string;
  comment?: string;
  columns: TableColumn[];
  indexes: TableIndex[];
  creationTime?: string;
}

export interface DdlPreviewItem {
  kind: string;
  sql: string;
  destructive: boolean;
}

export interface FilterItemDef {
  no: number;
  left: string;
  op: string;
  valueSource?: string;
  literal?: string;
  systemKey?: string;
  exposed?: boolean;
}

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

export interface FilterDef {
  items: FilterItemDef[];
  combine?: string;
  dataScope?: FilterNode;
  searchForm?: SearchFormDef;
  advancedFilter?: boolean;
  presets?: NamedFilterPreset[];
}

export interface ColumnStyleRule {
  op?: string;
  value?: string;
  tone?: string;
  target?: string;
}

export interface ListColumnDef {
  field: string;
  title: string;
  width?: number;
  sortable?: boolean;
  visible?: boolean;
  formatPreset?: string;
  align?: string;
  render?: string;
  dictMap?: Record<string, string>;
  styleRules?: ColumnStyleRule[];
  summaryFn?: string;
  summaryScope?: string;
}

export interface ActionDef {
  key: string;
  label: string;
  position: string;
  scene?: string;
  scope?: string;
  kind: string;
  flowKey?: string;
  open?: string;
  formMode?: string;
  fieldsMode?: string;
  fields?: string[];
  confirm?: boolean;
  confirmText?: string;
  batchLimit?: number;
}

export interface ListViewDef {
  columns: ListColumnDef[];
  defaultSorting?: string;
  pageSize?: number;
  actions: ActionDef[];
}

export interface FormFieldDef {
  field: string;
  title: string;
  control: string;
  visibleOnCreate?: boolean;
  visibleOnUpdate?: boolean;
  visibleOnDetail?: boolean;
  readonlyOnCreate?: boolean;
  readonlyOnUpdate?: boolean;
  requiredOnCreate?: boolean;
  requiredOnUpdate?: boolean;
}

export interface FormDef {
  fields: FormFieldDef[];
}

export interface AppResource {
  id: string;
  code: string;
  name: string;
  dataSourceCode: string;
  tableName: string;
  titleField: string;
  status: number;
  queryFlowKey: string;
  getFlowKey: string;
  createFlowKey: string;
  updateFlowKey: string;
  deleteFlowKey: string;
  filter: FilterDef;
  listView: ListViewDef;
  form: FormDef;
  creationTime?: string;
}

export interface ResourceInvokeResult {
  success: boolean;
  instanceId: string;
  data?: unknown;
  error?: string;
}

export interface RuntimeFilter {
  items: Array<{
    no: number;
    left: string;
    op: string;
    right?: boolean | number | string;
  }>;
  combine?: string;
}

export interface ReportDefinition {
  id: string;
  code: string;
  name: string;
  kind: string;
  resourceCode?: string;
  queryFlowKey: string;
  status: number;
  dataScope?: FilterNode;
  searchForm?: SearchFormDef;
  advancedFilter?: boolean;
  presets?: NamedFilterPreset[];
  kpis?: Array<{ title: string; field: string; fn: string }>;
  columns: ListColumnDef[];
  actions: ActionDef[];
  defaultSorting?: string;
  pageSize?: number;
  selectionEnabled?: boolean;
  description?: string;
  creationTime?: string;
}

export function getTableDefinitionsApi(params?: {
  dataSourceCode?: string;
  filter?: string;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<TableDefinition>>(
    '/api/orchestration/tables',
    { params },
  );
}

export function getTableDefinitionApi(id: string) {
  return requestClient.get<TableDefinition>(`/api/orchestration/tables/${id}`);
}

export function createTableDefinitionApi(data: {
  dataSourceCode: string;
  tableName: string;
  displayName: string;
}) {
  return requestClient.post<TableDefinition>('/api/orchestration/tables', data);
}

export function updateTableDefinitionApi(
  id: string,
  data: {
    displayName: string;
    comment?: string;
    columns: TableColumn[];
    indexes: TableIndex[];
  },
) {
  return requestClient.put<TableDefinition>(
    `/api/orchestration/tables/${id}`,
    data,
  );
}

export function deleteTableDefinitionApi(id: string) {
  return requestClient.delete(`/api/orchestration/tables/${id}`);
}

export function previewTableDdlApi(id: string) {
  return requestClient.get<{ items: DdlPreviewItem[] }>(
    `/api/orchestration/tables/${id}/preview`,
  );
}

export function applyTableDdlApi(id: string) {
  return requestClient.post<TableDefinition>(
    `/api/orchestration/tables/${id}/apply`,
  );
}

export function createAppResourceFromTableApi(
  tableId: string,
  data: { code: string; name: string },
) {
  return requestClient.post<AppResource>(
    `/api/orchestration/tables/${tableId}/resources`,
    data,
  );
}

export function getAppResourcesApi(params?: {
  filter?: string;
  status?: number;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<AppResource>>(
    '/api/orchestration/resources',
    { params },
  );
}

export function getAppResourceApi(id: string) {
  return requestClient.get<AppResource>(`/api/orchestration/resources/${id}`);
}

export function getPublishedAppResourceApi(code: string) {
  return requestClient.get<AppResource>(
    `/api/orchestration/resources/published/${encodeURIComponent(code)}`,
  );
}

export function updateAppResourceApi(
  id: string,
  data: {
    name: string;
    titleField?: string;
    filter?: FilterDef;
    listView?: ListViewDef;
    form?: FormDef;
    queryFlowKey?: string;
    getFlowKey?: string;
    createFlowKey?: string;
    updateFlowKey?: string;
    deleteFlowKey?: string;
  },
) {
  return requestClient.put<AppResource>(
    `/api/orchestration/resources/${id}`,
    data,
  );
}

export function deleteAppResourceApi(id: string) {
  return requestClient.delete(`/api/orchestration/resources/${id}`);
}

export function publishAppResourceApi(id: string) {
  return requestClient.post<AppResource>(
    `/api/orchestration/resources/${id}/publish`,
  );
}

export function queryAppResourceApi(
  code: string,
  data: {
    page?: number;
    pageSize?: number;
    sorting?: string;
    filter?: FilterNode;
    filters?: RuntimeFilter;
    summaryFields?: Array<{ field: string; fn: string }>;
  },
) {
  return requestClient.post<ResourceInvokeResult>(
    `/api/orchestration/resources/${encodeURIComponent(code)}/query`,
    data,
  );
}

export function getAppResourceRecordApi(code: string, id: string) {
  return requestClient.post<ResourceInvokeResult>(
    `/api/orchestration/resources/${encodeURIComponent(code)}/get`,
    { id },
  );
}

export function createAppResourceRecordApi(
  code: string,
  data: { record: Record<string, unknown> },
) {
  return requestClient.post<ResourceInvokeResult>(
    `/api/orchestration/resources/${encodeURIComponent(code)}/create`,
    data,
  );
}

export function updateAppResourceRecordApi(
  code: string,
  data: {
    id: string;
    concurrencyStamp?: string;
    record: Record<string, unknown>;
  },
) {
  return requestClient.post<ResourceInvokeResult>(
    `/api/orchestration/resources/${encodeURIComponent(code)}/update`,
    data,
  );
}

export function deleteAppResourceRecordApi(code: string, id: string) {
  return requestClient.post<ResourceInvokeResult>(
    `/api/orchestration/resources/${encodeURIComponent(code)}/delete`,
    { id },
  );
}

export function getReportsApi(params?: {
  filter?: string;
  status?: number;
  maxResultCount?: number;
  skipCount?: number;
}) {
  return requestClient.get<OrchestrationPagedResult<ReportDefinition>>(
    '/api/orchestration/reports',
    { params },
  );
}

export function getReportApi(id: string) {
  return requestClient.get<ReportDefinition>(
    `/api/orchestration/reports/${id}`,
  );
}

export function getPublishedReportApi(code: string) {
  return requestClient.get<ReportDefinition>(
    `/api/orchestration/reports/published/${encodeURIComponent(code)}`,
  );
}

export function createReportApi(data: {
  code: string;
  name: string;
  kind?: string;
  resourceCode?: string;
}) {
  return requestClient.post<ReportDefinition>(
    '/api/orchestration/reports',
    data,
  );
}

export function createReportFromResourceApi(data: {
  resourceCode: string;
  code: string;
  name: string;
}) {
  return requestClient.post<ReportDefinition>(
    '/api/orchestration/reports/from-resource',
    data,
  );
}

export function updateReportApi(
  id: string,
  data: Partial<ReportDefinition> & { name: string },
) {
  return requestClient.put<ReportDefinition>(
    `/api/orchestration/reports/${id}`,
    data,
  );
}

export function deleteReportApi(id: string) {
  return requestClient.delete(`/api/orchestration/reports/${id}`);
}

export function publishReportApi(id: string) {
  return requestClient.post<ReportDefinition>(
    `/api/orchestration/reports/${id}/publish`,
  );
}

export function queryReportApi(
  code: string,
  data: {
    page?: number;
    pageSize?: number;
    sorting?: string;
    filter?: FilterNode;
    summaryFields?: Array<{ field: string; fn: string }>;
  },
) {
  return requestClient.post<ResourceInvokeResult>(
    `/api/orchestration/reports/${encodeURIComponent(code)}/query`,
    data,
  );
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
