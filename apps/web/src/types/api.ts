export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type WorkflowStatus = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED';
export type WorkflowConclusion = 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'SKIPPED' | 'TIMED_OUT' | 'ACTION_REQUIRED';
export type DeploymentStatus = 'QUEUED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'SKIPPED';
export type ServiceStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
export type HealthCheckStatus = 'PASS' | 'FAIL' | 'TIMEOUT';
export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED';

export interface Pagination {
  limit: number;
  hasMore: boolean;
  cursor?: string;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: { requestId?: string; pagination?: Pagination };
}

export interface Me {
  id: string;
  email: string;
  name: string;
  memberships: {
    role: MemberRole;
    organization: { id: string; name: string; slug: string };
  }[];
}

export interface Environment {
  id: string;
  name: string;
  isProduction: boolean;
}

export interface Repository {
  id: string;
  fullName: string;
  provider: string;
  defaultBranch?: string;
  externalRepoId?: string;
  webhookSecret?: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  repositories: Repository[];
  environments: Environment[];
  services?: Service[];
  _count?: { deployments: number };
}

export interface ProjectMetrics {
  period: string;
  workflowRuns: { total: number; successful: number; failed: number };
  deployments: { total: number; successful: number; successRate: number | null };
  openIncidents: number;
}

export interface WorkflowRun {
  id: string;
  externalRunId: string;
  runNumber: number;
  workflowName: string;
  status: WorkflowStatus;
  conclusion: WorkflowConclusion | null;
  branch: string | null;
  commitSha: string;
  commitMessage: string | null;
  triggeredBy: string | null;
  eventType: string | null;
  htmlUrl: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  durationSeconds?: number | null;
  repository?: { fullName?: string; project: { id?: string; name: string } };
  deployments?: Deployment[];
}

export interface Deployment {
  id: string;
  status: DeploymentStatus;
  commitSha: string;
  commitMessage: string | null;
  triggeredBy: string | null;
  errorSummary: string | null;
  externalUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  environment?: { name: string; isProduction?: boolean };
  project?: { id?: string; name: string };
  workflowRun?: { workflowName: string; runNumber: number; htmlUrl: string } | null;
}

export interface DeploymentEnvironmentComparison {
  project: { id: string; name: string };
  left: {
    environment: Environment;
    deployment: Deployment | null;
  };
  right: {
    environment: Environment;
    deployment: Deployment | null;
  };
  sameCommit: boolean | null;
}

export interface Service {
  id: string;
  name: string;
  healthUrl: string;
  intervalSeconds: number;
  timeoutMs: number;
  expectedHttpStatus: number;
  failureThreshold: number;
  successThreshold: number;
  currentStatus: ServiceStatus;
  lastCheckedAt: string | null;
  enabled: boolean;
  environment?: { name: string } | null;
  project?: { id: string; name: string };
  healthChecks?: { latencyMs: number | null; httpStatus: number | null }[];
  incidents?: Incident[];
}

export interface HealthCheck {
  id: string;
  status: HealthCheckStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  errorMsg: string | null;
  checkedAt: string;
}

export interface IncidentEvent {
  id: string;
  eventType: string;
  message: string | null;
  createdAt: string;
  actorUser?: { name: string; email?: string } | null;
}

export interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  openedAt: string;
  resolvedAt: string | null;
  service?: { id?: string; name: string; healthUrl?: string; project?: { id: string; name: string } } | null;
  events?: IncidentEvent[];
}

export interface DashboardOverview {
  summary: {
    totalProjects: number;
    successfulRuns: number;
    failedRuns: number;
    deploymentSuccessRate: number | null;
    services: { healthy: number; degraded: number; down: number };
    openIncidents: number;
  };
  recentRuns: WorkflowRun[];
  recentDeployments: Deployment[];
}

export interface DashboardAnalyticsPoint {
  date: string;
  successes: number;
  failures: number;
}

export interface DashboardAnalytics {
  periodDays: 7 | 30;
  workflowRuns: DashboardAnalyticsPoint[];
  deployments: DashboardAnalyticsPoint[];
}

export interface Member {
  id: string;
  role: MemberRole;
  createdAt: string;
  user: { id: string; email: string; name: string };
}

export interface AuditLogEntry {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ARCHIVE' | 'INVITE' | 'REMOVE' | 'LOGIN' | 'LOGOUT' | 'REGISTER';
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorUser: { id: string; email: string; name: string } | null;
}

export type AlertEventType =
  | 'WORKFLOW_FAILURE'
  | 'DEPLOYMENT_FAILURE'
  | 'SERVICE_DOWN'
  | 'SERVICE_RECOVERED'
  | 'INCIDENT_OPENED'
  | 'INCIDENT_RESOLVED';

export interface AppNotification {
  id: string;
  eventType: AlertEventType;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'SLACK' | 'WEBHOOK';
  events: AlertEventType[];
  enabled: boolean;
  destination: string;
  createdAt: string;
  deliveryCount?: number;
}

export interface NotificationDelivery {
  id: string;
  title: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
  errorMsg: string | null;
  createdAt: string;
  channel: { id: string; name: string; type: string };
}
