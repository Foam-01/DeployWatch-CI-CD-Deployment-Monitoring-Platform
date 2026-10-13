'use client';

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  GitCommit,
  GitBranch,
  ShieldAlert,
  Server,
  Zap,
  RefreshCw,
  Send,
  Check,
  Terminal,
  ShieldCheck,
  Bell,
  BarChart3,
  Mail,
  MessageSquare,
  Lock,
  ArrowUpRight
} from 'lucide-react';

interface DeploymentItem {
  id: string;
  project: string;
  environment: string;
  isProduction: boolean;
  commitSha: string;
  commitMessage: string;
  author: string;
  authorAvatar: string;
  branch: string;
  status: 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS' | 'CANCELLED';
  duration: string;
  completedAt: string;
  workflowName: string;
}

interface ServiceHealth {
  id: string;
  name: string;
  environment: string;
  url: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  latencyMs: number;
  uptimePercent: number;
  lastChecked: string;
  history: ('PASS' | 'FAIL')[];
}

interface IncidentItem {
  id: string;
  title: string;
  service: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  openedAt: string;
  eventsCount: number;
  timeline: { time: string; msg: string; actor?: string }[];
}

interface WebhookInboxItem {
  id: string;
  deliveryId: string;
  provider: 'GITHUB';
  event: 'workflow_run' | 'deployment' | 'push';
  signatureVerified: boolean;
  status: 'PROCESSED' | 'PENDING' | 'FAILED';
  receivedAt: string;
  repository: string;
  payloadSummary: string;
}

interface AlertChannelItem {
  id: string;
  name: string;
  type: 'SLACK' | 'EMAIL' | 'WEBHOOK';
  target: string;
  enabled: boolean;
  deliveriesCount: number;
  lastFired: string;
}

export default function DeployWatchDashboard() {
  const [activeTab, setActiveTab] = useState<'deployments' | 'services' | 'incidents' | 'webhooks' | 'alerts' | 'dora'>('deployments');
  const [envFilter, setEnvFilter] = useState<'ALL' | 'PRODUCTION' | 'STAGING'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS'>('ALL');
  
  // Interactive Simulation Modal
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);
  const [simWorkflowName, setSimWorkflowName] = useState('Deploy Production');
  const [simStatus, setSimStatus] = useState<'SUCCESS' | 'FAILURE' | 'IN_PROGRESS'>('SUCCESS');
  const [simBranch, setSimBranch] = useState('main');
  const [simMessage, setSimMessage] = useState('feat(checkout): add Apple Pay & Google Pay checkout flow');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Inspector Drawer
  const [selectedRun, setSelectedRun] = useState<DeploymentItem | null>(null);

  // State
  const [deployments, setDeployments] = useState<DeploymentItem[]>([
    {
      id: 'dep-1',
      project: 'Storefront Web',
      environment: 'Production',
      isProduction: true,
      commitSha: 'd9e4a8b',
      commitMessage: 'feat(cart): implement one-click checkout Apple Pay integration',
      author: 'Alex Rivera',
      authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&fit=crop&crop=faces',
      branch: 'main',
      status: 'SUCCESS',
      duration: '3m 14s',
      completedAt: '12 minutes ago',
      workflowName: 'Deploy Production',
    },
    {
      id: 'dep-2',
      project: 'Payments Engine',
      environment: 'Production',
      isProduction: true,
      commitSha: 'f87a19c',
      commitMessage: 'chore(deps): bump cryptographic hashing lib to latest CVE fix',
      author: 'Sarah Chen',
      authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&fit=crop&crop=faces',
      branch: 'main',
      status: 'IN_PROGRESS',
      duration: '1m 45s',
      completedAt: 'Running now...',
      workflowName: 'Build & Security Scan',
    },
    {
      id: 'dep-3',
      project: 'Storefront Web',
      environment: 'Staging',
      isProduction: false,
      commitSha: 'a12bc89',
      commitMessage: 'fix(discount): resolve coupon code rounding error on multi-currency items',
      author: 'Sarah Chen',
      authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&fit=crop&crop=faces',
      branch: 'fix/discount-calc',
      status: 'FAILURE',
      duration: '4m 02s',
      completedAt: '38 minutes ago',
      workflowName: 'CI / Jest & Playwright',
    },
    {
      id: 'dep-4',
      project: 'Notification Gateway',
      environment: 'Production',
      isProduction: true,
      commitSha: '7b209fa',
      commitMessage: 'perf(webhook): switch redis buffer worker pool to clustered workers',
      author: 'Alex Rivera',
      authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&fit=crop&crop=faces',
      branch: 'main',
      status: 'SUCCESS',
      duration: '2m 10s',
      completedAt: '2 hours ago',
      workflowName: 'Deploy Production',
    },
    {
      id: 'dep-5',
      project: 'Storefront Web',
      environment: 'Production',
      isProduction: true,
      commitSha: '3c81e41',
      commitMessage: 'refactor(catalog): migrate product grid to server components caching',
      author: 'Michael Torres',
      authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&fit=crop&crop=faces',
      branch: 'main',
      status: 'SUCCESS',
      duration: '3m 22s',
      completedAt: '5 hours ago',
      workflowName: 'Deploy Production',
    },
  ]);

  const [services, setServices] = useState<ServiceHealth[]>([
    {
      id: 'srv-1',
      name: 'Storefront Web Gateway',
      environment: 'Production',
      url: 'https://storefront.acme.io/api/health',
      status: 'HEALTHY',
      latencyMs: 42,
      uptimePercent: 99.98,
      lastChecked: 'Just now',
      history: ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'],
    },
    {
      id: 'srv-2',
      name: 'Payments Engine API',
      environment: 'Production',
      url: 'https://pay.acme.io/healthz',
      status: 'DOWN',
      latencyMs: 512,
      uptimePercent: 97.4,
      lastChecked: '45s ago',
      history: ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL'],
    },
    {
      id: 'srv-3',
      name: 'Notification Gateway',
      environment: 'Production',
      url: 'https://notify.acme.io/status',
      status: 'HEALTHY',
      latencyMs: 38,
      uptimePercent: 100,
      lastChecked: '1m ago',
      history: ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'],
    },
    {
      id: 'srv-4',
      name: 'Storefront Web (Staging)',
      environment: 'Staging',
      url: 'https://staging.storefront.acme.io/health',
      status: 'HEALTHY',
      latencyMs: 84,
      uptimePercent: 99.45,
      lastChecked: '2m ago',
      history: ['PASS', 'PASS', 'PASS', 'FAIL', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'],
    },
  ]);

  const [incidents, setIncidents] = useState<IncidentItem[]>([
    {
      id: 'inc-101',
      title: 'Payment Authorization API elevated 5xx error rate',
      service: 'Payments Engine API',
      severity: 'CRITICAL',
      status: 'OPEN',
      openedAt: '15 mins ago',
      eventsCount: 3,
      timeline: [
        { time: '15 mins ago', msg: 'System auto-detected outage after 4 consecutive failed health checks' },
        { time: '10 mins ago', msg: 'DevOps on-call paged via Slack and PagerDuty', actor: 'DeployWatch Bot' },
        { time: '6 mins ago', msg: 'Sarah Chen acknowledged: Investigating upstream gateway timeout', actor: 'Sarah Chen' },
      ],
    },
    {
      id: 'inc-100',
      title: 'Staging Storefront high latency spike (>800ms)',
      service: 'Storefront Web (Staging)',
      severity: 'LOW',
      status: 'RESOLVED',
      openedAt: '4 hours ago',
      eventsCount: 2,
      timeline: [
        { time: '4 hours ago', msg: 'Latency threshold exceeded on staging container' },
        { time: '3 hours ago', msg: 'Resolved after database connection pool restart', actor: 'Alex Rivera' },
      ],
    },
  ]);

  const [webhookEvents, setWebhookEvents] = useState<WebhookInboxItem[]>([
    {
      id: 'wh-1',
      deliveryId: '7a19c5b2-0e4a-4c12-98ab-312019481021',
      provider: 'GITHUB',
      event: 'workflow_run',
      signatureVerified: true,
      status: 'PROCESSED',
      receivedAt: '3 mins ago',
      repository: 'acme-cloud/payments-engine',
      payloadSummary: 'action: in_progress, run_id: 84729103, branch: main',
    },
    {
      id: 'wh-2',
      deliveryId: '9e4a8b7c-3120-410a-8472-910182736412',
      provider: 'GITHUB',
      event: 'workflow_run',
      signatureVerified: true,
      status: 'PROCESSED',
      receivedAt: '21 mins ago',
      repository: 'acme-cloud/storefront-web',
      payloadSummary: 'action: completed, conclusion: success, run_id: 84729101',
    },
    {
      id: 'wh-3',
      deliveryId: '8bc890e7-4fa1-42cb-b102-184920192847',
      provider: 'GITHUB',
      event: 'workflow_run',
      signatureVerified: true,
      status: 'PROCESSED',
      receivedAt: '38 mins ago',
      repository: 'acme-cloud/storefront-web',
      payloadSummary: 'action: completed, conclusion: failure, run_id: 84729102',
    },
  ]);

  const [alertChannels, setAlertChannels] = useState<AlertChannelItem[]>([
    {
      id: 'chan-1',
      name: '#devops-deployments Slack Channel',
      type: 'SLACK',
      target: 'https://hooks.slack.com/services/T00/B00/XXXX',
      enabled: true,
      deliveriesCount: 42,
      lastFired: '15 mins ago (Incident #101)',
    },
    {
      id: 'chan-2',
      name: 'On-Call PagerDuty Escalation',
      type: 'EMAIL',
      target: 'oncall@acme.io',
      enabled: true,
      deliveriesCount: 18,
      lastFired: '15 mins ago (Incident #101)',
    },
    {
      id: 'chan-3',
      name: 'Custom Webhook Gateway',
      type: 'WEBHOOK',
      target: 'https://ops.acme.io/events',
      enabled: false,
      deliveriesCount: 0,
      lastFired: 'Never',
    },
  ]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSimulateWebhook = () => {
    const newId = 'dep-' + Date.now().toString(36);
    const newRun: DeploymentItem = {
      id: newId,
      project: 'Storefront Web',
      environment: 'Production',
      isProduction: true,
      commitSha: Math.random().toString(16).substring(2, 9),
      commitMessage: simMessage,
      author: 'Alex Rivera',
      authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&fit=crop&crop=faces',
      branch: simBranch,
      status: simStatus,
      duration: simStatus === 'IN_PROGRESS' ? '30s' : '2m 45s',
      completedAt: simStatus === 'IN_PROGRESS' ? 'Running now...' : 'Just now',
      workflowName: simWorkflowName,
    };

    setDeployments([newRun, ...deployments]);

    // Also record into webhook inbox
    const newDeliveryId = Math.random().toString(16).substring(2, 10) + '-sim-uuid';
    const newWh: WebhookInboxItem = {
      id: 'wh-' + Date.now().toString(36),
      deliveryId: newDeliveryId,
      provider: 'GITHUB',
      event: 'workflow_run',
      signatureVerified: true,
      status: 'PROCESSED',
      receivedAt: 'Just now',
      repository: 'acme-cloud/storefront-web',
      payloadSummary: `action: ${simStatus === 'IN_PROGRESS' ? 'in_progress' : 'completed'}, conclusion: ${simStatus.toLowerCase()}, branch: ${simBranch}`,
    };
    setWebhookEvents([newWh, ...webhookEvents]);

    setIsSimModalOpen(false);
    showToast(`⚡ GitHub Webhook Ingested: "${simWorkflowName}" [${simStatus}]`);
  };

  const handleAcknowledgeIncident = (incidentId: string) => {
    setIncidents(prev =>
      prev.map(inc => {
        if (inc.id === incidentId) {
          return {
            ...inc,
            status: 'ACKNOWLEDGED',
            timeline: [
              ...inc.timeline,
              { time: 'Just now', msg: 'Acknowledged by Alex Rivera', actor: 'Alex Rivera' },
            ],
          };
        }
        return inc;
      })
    );
    showToast('Incident acknowledged');
  };

  const handleResolveIncident = (incidentId: string) => {
    setIncidents(prev =>
      prev.map(inc => {
        if (inc.id === incidentId) {
          return {
            ...inc,
            status: 'RESOLVED',
            timeline: [
              ...inc.timeline,
              { time: 'Just now', msg: 'Marked resolved: service returned to healthy state', actor: 'Alex Rivera' },
            ],
          };
        }
        return inc;
      })
    );
    // Also set Payments Engine API to HEALTHY
    setServices(prev =>
      prev.map(s => (s.id === 'srv-2' ? { ...s, status: 'HEALTHY', latencyMs: 54 } : s))
    );
    showToast('Incident resolved! Service health restored.');
  };

  const toggleAlertChannel = (chanId: string) => {
    setAlertChannels(prev =>
      prev.map(c => (c.id === chanId ? { ...c, enabled: !c.enabled } : c))
    );
    showToast('Channel status updated');
  };

  // Filtered Deployments
  const filteredDeployments = deployments.filter(d => {
    if (envFilter === 'PRODUCTION' && !d.isProduction) return false;
    if (envFilter === 'STAGING' && d.isProduction) return false;
    if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
    return true;
  });

  const criticalIncidentCount = incidents.filter(i => i.status !== 'RESOLVED').length;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 80 }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            backgroundColor: '#1e1b4b',
            border: '1px solid #6366f1',
            borderRadius: 12,
            padding: '12px 20px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            animation: 'modalIn 0.2s ease',
          }}
        >
          <Zap size={18} color="#818cf8" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(9, 13, 22, 0.8)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
          {/* Logo & Org */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'var(--brand-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 16px rgba(99, 102, 241, 0.5)',
                }}
              >
                <Activity size={22} color="#ffffff" />
              </div>
              <div>
                <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
                  Deploy<span style={{ color: '#818cf8' }}>Watch</span>
                </span>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 10,
                    fontWeight: 700,
                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                    color: '#818cf8',
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                  }}
                >
                  v1.0 PROD
                </span>
              </div>
            </div>

            <div style={{ height: 24, width: 1, backgroundColor: 'var(--border-subtle)' }} />

            {/* Org Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <span>Organization:</span>
              <span style={{ fontWeight: 600, color: '#f8fafc', background: 'var(--bg-surface-elevated)', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                Acme Cloud Platform ▾
              </span>
            </div>
          </div>

          {/* Right Header Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Live Gateway Beacon */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                fontWeight: 600,
                color: '#34d399',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                padding: '6px 12px',
                borderRadius: 9999,
                border: '1px solid rgba(16, 185, 129, 0.2)',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981' }} className="beacon-success" />
              <span>Gateway Live (12ms)</span>
            </div>

            {/* Simulate Webhook Trigger Button */}
            <button
              id="simulate-webhook-btn"
              className="btn btn-primary"
              onClick={() => setIsSimModalOpen(true)}
              style={{ gap: 8 }}
            >
              <Send size={15} />
              <span>Simulate GitHub Webhook</span>
            </button>

            {/* User Profile */}
            <a
              href="https://portfoliof-01.netlify.app"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 8, textDecoration: 'none', background: 'var(--bg-surface-elevated)', padding: '4px 10px 4px 6px', borderRadius: 9999, border: '1px solid var(--border-subtle)' }}
            >
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&fit=crop&crop=faces"
                alt="Foam"
                style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(99, 102, 241, 0.6)' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>Foam (Dev)</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="container" style={{ marginTop: 32 }}>
        {/* System Outage Alert or All-Green Banner */}
        {criticalIncidentCount > 0 ? (
          <div
            style={{
              background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15), rgba(15, 23, 42, 0.9))',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 32,
              boxShadow: '0 8px 24px rgba(239, 68, 68, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldAlert size={24} color="#ef4444" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                    Active Incident: Payment Authorization API elevated 5xx error rate
                  </h3>
                  <span className="badge badge-error">CRITICAL</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Automated health checker detected 4 consecutive failed health checks. Automated alerts dispatched.
                </p>
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setActiveTab('incidents')}
              style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
            >
              Triage Incident ➔
            </button>
          </div>
        ) : (
          <div
            style={{
              background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.1), rgba(15, 23, 42, 0.9))',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 32,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <CheckCircle2 size={24} color="#10b981" />
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>All Systems Operational</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  All 4 tracked microservices and GitHub Actions deployment pipelines running without interruption.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top KPI Metrics Cards */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
            marginBottom: 36,
          }}
        >
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deployments (24h)</span>
              <GitCommit size={18} color="#818cf8" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc' }}>18</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#34d399' }}>+22% vs yesterday</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              Success Rate: <strong style={{ color: '#34d399' }}>94.4%</strong> (1 failed, 1 in progress)
            </div>
          </div>

          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mean Recovery (MTTR)</span>
              <Clock size={18} color="#f59e0b" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc' }}>11.4m</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#34d399' }}>-3.8m improvement</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              Average duration to resolve production alerts
            </div>
          </div>

          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Service Health</span>
              <Server size={18} color="#10b981" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc' }}>3 / 4</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: criticalIncidentCount > 0 ? '#f87171' : '#34d399' }}>
                {criticalIncidentCount > 0 ? '1 Impaired' : '100% Healthy'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              Active synthetic probes polling every 30-60s
            </div>
          </div>

          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg CI Duration</span>
              <Zap size={18} color="#ec4899" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc' }}>2m 58s</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#34d399' }}>-18s (Docker cache)</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              Across 3 repositories with parallel test suites
            </div>
          </div>
        </section>

        {/* View Switcher Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: 24,
            paddingBottom: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'deployments', label: 'Deployments & CI Runs', count: deployments.length, icon: GitCommit },
              { id: 'services', label: 'Services & Uptime', count: services.length, icon: Server },
              { id: 'incidents', label: 'Incidents & Triage', count: incidents.length, icon: AlertTriangle },
              { id: 'webhooks', label: 'Webhook Inbox', count: webhookEvents.length, icon: ShieldCheck },
              { id: 'alerts', label: 'Alert Channels', count: alertChannels.length, icon: Bell },
              { id: 'dora', label: 'DORA Metrics', count: null, icon: BarChart3 },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    fontSize: 14,
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                    border: 'none',
                    cursor: 'pointer',
                    background: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                    color: isActive ? '#f8fafc' : 'var(--text-muted)',
                    borderBottom: isActive ? '2px solid var(--brand-primary)' : '2px solid transparent',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Icon size={16} color={isActive ? '#818cf8' : 'currentColor'} />
                  <span>{tab.label}</span>
                  {tab.count !== null && (
                    <span
                      style={{
                        fontSize: 11,
                        backgroundColor: isActive ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                        color: isActive ? '#a5b4fc' : 'var(--text-muted)',
                        padding: '2px 7px',
                        borderRadius: 9999,
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sub-Filters for Deployments */}
          {activeTab === 'deployments' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Environment Filter */}
              <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 3, border: '1px solid var(--border-subtle)' }}>
                {(['ALL', 'PRODUCTION', 'STAGING'] as const).map(env => (
                  <button
                    key={env}
                    onClick={() => setEnvFilter(env)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      background: envFilter === env ? 'var(--brand-primary)' : 'transparent',
                      color: envFilter === env ? '#ffffff' : 'var(--text-muted)',
                    }}
                  >
                    {env === 'ALL' ? 'All Envs' : env.charAt(0) + env.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: 8, padding: 3, border: '1px solid var(--border-subtle)' }}>
                {(['ALL', 'SUCCESS', 'FAILURE'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      background: statusFilter === st ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                      color: statusFilter === st ? '#ffffff' : 'var(--text-muted)',
                    }}
                  >
                    {st === 'ALL' ? 'All Status' : st.charAt(0) + st.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* TAB CONTENT 1: DEPLOYMENTS & CI RUNS */}
        {activeTab === 'deployments' && (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Status</th>
                  <th>Project & Workflow</th>
                  <th>Commit & Branch</th>
                  <th>Environment</th>
                  <th>Duration</th>
                  <th>Time</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeployments.map(item => (
                  <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedRun(item)}>
                    <td>
                      {item.status === 'SUCCESS' && (
                        <span className="badge badge-success">
                          <CheckCircle2 size={12} /> Success
                        </span>
                      )}
                      {item.status === 'FAILURE' && (
                        <span className="badge badge-error">
                          <XCircle size={12} /> Failed
                        </span>
                      )}
                      {item.status === 'IN_PROGRESS' && (
                        <span className="badge badge-warning">
                          <RefreshCw size={12} className="spin-active" /> In Progress
                        </span>
                      )}
                      {item.status === 'CANCELLED' && (
                        <span className="badge badge-neutral">Cancelled</span>
                      )}
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.project}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Zap size={11} color="#818cf8" />
                        <span>{item.workflowName}</span>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 500, color: '#e2e8f0', maxWidth: 380, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.commitMessage}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 11,
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            padding: '1px 6px',
                            borderRadius: 4,
                            color: '#818cf8',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                          }}
                        >
                          {item.commitSha}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                          <GitBranch size={11} />
                          <span>{item.branch}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                          <img src={item.authorAvatar} alt="" style={{ width: 14, height: 14, borderRadius: '50%' }} />
                          <span>{item.author}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          backgroundColor: item.isProduction ? 'rgba(99, 102, 241, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                          color: item.isProduction ? '#818cf8' : '#94a3b8',
                          border: `1px solid ${item.isProduction ? 'rgba(99, 102, 241, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                        }}
                      >
                        {item.environment}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <Clock size={13} />
                        <span>{item.duration}</span>
                      </div>
                    </td>

                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {item.completedAt}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRun(item);
                        }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB CONTENT 2: SERVICES & UPTIME */}
        {activeTab === 'services' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
            {services.map(srv => (
              <div key={srv.id} className="glass-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h4 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{srv.name}</h4>
                      {srv.status === 'HEALTHY' && <span className="badge badge-success">Healthy</span>}
                      {srv.status === 'DOWN' && <span className="badge badge-error">Down (5xx)</span>}
                      {srv.status === 'DEGRADED' && <span className="badge badge-warning">Degraded</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                      {srv.url}
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      backgroundColor: srv.environment === 'Production' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                      color: srv.environment === 'Production' ? '#818cf8' : '#94a3b8',
                    }}
                  >
                    {srv.environment}
                  </span>
                </div>

                {/* Metrics Bar */}
                <div style={{ display: 'flex', gap: 24, marginTop: 20, padding: '12px 16px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Response Latency</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: srv.latencyMs > 300 ? '#f87171' : '#34d399', marginTop: 2 }}>
                      {srv.latencyMs} ms
                    </div>
                  </div>
                  <div style={{ width: 1, backgroundColor: 'var(--border-subtle)' }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>30d Availability</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', marginTop: 2 }}>
                      {srv.uptimePercent}%
                    </div>
                  </div>
                  <div style={{ width: 1, backgroundColor: 'var(--border-subtle)' }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last Check</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {srv.lastChecked}
                    </div>
                  </div>
                </div>

                {/* Health Checks Block Bar Chart */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span>Last 12 probe runs (every 30s)</span>
                    <span>Recent ➔</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {srv.history.map((h, i) => (
                      <div
                        key={i}
                        title={`Check #${i + 1}: ${h === 'PASS' ? 'HTTP 200 OK' : 'HTTP 500 Error'}`}
                        style={{
                          flex: 1,
                          height: 28,
                          borderRadius: 4,
                          backgroundColor: h === 'PASS' ? '#10b981' : '#ef4444',
                          opacity: 0.9,
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Failure Threshold: 3 tries</span>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 12, gap: 6 }}
                    onClick={() => {
                      showToast(`Triggered manual health probe on ${srv.name}`);
                    }}
                  >
                    <RefreshCw size={12} />
                    <span>Trigger Manual Check</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB CONTENT 3: INCIDENTS & TRIAGE */}
        {activeTab === 'incidents' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {incidents.map(inc => (
              <div
                key={inc.id}
                className="glass-card"
                style={{
                  padding: 24,
                  borderLeft: inc.status !== 'RESOLVED' ? '4px solid #ef4444' : '4px solid #10b981',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="font-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inc.id}</span>
                      <h4 style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>{inc.title}</h4>
                      <span className={`badge ${inc.severity === 'CRITICAL' ? 'badge-error' : 'badge-warning'}`}>
                        {inc.severity}
                      </span>
                      <span className={`badge ${inc.status === 'RESOLVED' ? 'badge-success' : inc.status === 'ACKNOWLEDGED' ? 'badge-info' : 'badge-error'}`}>
                        {inc.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                      Target: <strong>{inc.service}</strong> • Opened {inc.openedAt}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    {inc.status === 'OPEN' && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleAcknowledgeIncident(inc.id)}
                        style={{ fontSize: 13 }}
                      >
                        Acknowledge
                      </button>
                    )}
                    {inc.status !== 'RESOLVED' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleResolveIncident(inc.id)}
                        style={{ fontSize: 13 }}
                      >
                        <Check size={14} /> Resolve Incident
                      </button>
                    )}
                  </div>
                </div>

                {/* Timeline History */}
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Incident Timeline & Audit Trail
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {inc.timeline.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                        <span style={{ color: 'var(--text-muted)', width: 110, flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {item.time}
                        </span>
                        <div style={{ color: '#e2e8f0' }}>
                          <span>{item.msg}</span>
                          {item.actor && (
                            <span style={{ marginLeft: 8, color: '#818cf8', fontWeight: 600 }}>({item.actor})</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB CONTENT 4: WEBHOOK INBOX & INGESTION (PORTFOLIO SPECIAL) */}
        {activeTab === 'webhooks' && (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>Incoming GitHub Webhook Event Stream</h4>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Verifies HMAC-SHA256 <code style={{ color: '#818cf8' }}>X-Hub-Signature-256</code> headers and deduplicates events using idempotent delivery IDs.
                </p>
              </div>
              <span className="badge badge-success">
                <ShieldCheck size={12} /> HMAC Verification Active
              </span>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Delivery ID</th>
                  <th>Event</th>
                  <th>Repository</th>
                  <th>Signature Check</th>
                  <th>Payload Summary</th>
                  <th style={{ textAlign: 'right' }}>Received</th>
                </tr>
              </thead>
              <tbody>
                {webhookEvents.map(wh => (
                  <tr key={wh.id}>
                    <td>
                      <span className="badge badge-success">PROCESSED</span>
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontSize: 12, color: '#818cf8' }}>
                        {wh.deliveryId.substring(0, 18)}...
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: 13 }}>{wh.event}</span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {wh.repository}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399', fontSize: 12 }}>
                        <Lock size={12} />
                        <span>SHA256 Match</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {wh.payloadSummary}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                      {wh.receivedAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB CONTENT 5: ALERT CHANNELS & SETTINGS */}
        {activeTab === 'alerts' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
            {alertChannels.map(chan => (
              <div key={chan.id} className="glass-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: chan.type === 'SLACK' ? 'rgba(74, 21, 75, 0.3)' : 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {chan.type === 'SLACK' && <MessageSquare size={18} color="#ec4899" />}
                      {chan.type === 'EMAIL' && <Mail size={18} color="#818cf8" />}
                      {chan.type === 'WEBHOOK' && <Zap size={18} color="#34d399" />}
                    </div>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>{chan.name}</h4>
                      <span className="badge badge-neutral" style={{ marginTop: 4 }}>{chan.type}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleAlertChannel(chan.id)}
                    style={{
                      background: chan.enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                      border: `1px solid ${chan.enabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                      color: chan.enabled ? '#34d399' : 'var(--text-muted)',
                      padding: '4px 10px',
                      borderRadius: 9999,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {chan.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>

                <div style={{ marginTop: 18, background: 'rgba(0, 0, 0, 0.25)', padding: '10px 14px', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Target Endpoint</div>
                  <div className="font-mono" style={{ fontSize: 12, color: '#e2e8f0', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {chan.target}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>Delivered: <strong>{chan.deliveriesCount}</strong> alerts</span>
                  <span style={{ color: 'var(--text-muted)' }}>{chan.lastFired}</span>
                </div>

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={() => showToast(`Sent test payload to ${chan.name}`)}
                  >
                    Send Test Alert
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB CONTENT 6: DORA METRICS */}
        {activeTab === 'dora' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              <div className="glass-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Deployment Frequency</span>
                  <span className="badge badge-success">ELITE</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', marginTop: 12 }}>
                  18 / day
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Multiple production deployments pushed per day on main branches.
                </p>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Lead Time for Changes</span>
                  <span className="badge badge-success">ELITE</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', marginTop: 12 }}>
                  28 mins
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  From code commit merged to verified running in production Kubernetes cluster.
                </p>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Change Failure Rate</span>
                  <span className="badge badge-success">HIGH</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', marginTop: 12 }}>
                  5.5%
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Percentage of deployments causing immediate degradation or rollback.
                </p>
              </div>

              <div className="glass-card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Time to Restore Service</span>
                  <span className="badge badge-success">ELITE</span>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#f8fafc', marginTop: 12 }}>
                  11.4 mins
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Mean Time to Recovery (MTTR) with automated health probes and rollback scripts.
                </p>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 24 }}>
              <h4 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 12 }}>
                DORA Benchmarking & Maturity
              </h4>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                DeployWatch evaluates DevOps Research and Assessment (DORA) metrics in real time. Organizations deploying code at high frequency with lower change failure rates experience improved reliability and developer velocity.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: SIMULATE GITHUB WEBHOOK (PORTFOLIO SHOWCASE FEATURE) */}
      {isSimModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSimModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Zap size={20} color="#818cf8" />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>Simulate GitHub Actions Webhook</h3>
              </div>
              <button
                onClick={() => setIsSimModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                Trigger a simulated GitHub Actions <code style={{ color: '#818cf8' }}>workflow_run</code> event with an HMAC SHA256 signature to demonstrate real-time ingestion and status propagation.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>
                    Workflow Name
                  </label>
                  <select
                    value={simWorkflowName}
                    onChange={e => setSimWorkflowName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  >
                    <option value="Deploy Production">Deploy Production</option>
                    <option value="CI / Jest & Playwright">CI / Jest & Playwright</option>
                    <option value="Build & Security Scan">Build & Security Scan</option>
                    <option value="Docker Container Push">Docker Container Push</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>
                    Workflow Conclusion
                  </label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {(['SUCCESS', 'FAILURE', 'IN_PROGRESS'] as const).map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setSimStatus(st)}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: `1px solid ${simStatus === st ? '#6366f1' : 'var(--border-subtle)'}`,
                          backgroundColor: simStatus === st ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-surface-elevated)',
                          color: simStatus === st ? '#818cf8' : 'var(--text-secondary)',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>
                    Git Branch
                  </label>
                  <input
                    type="text"
                    value={simBranch}
                    onChange={e => setSimBranch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>
                    Commit Message
                  </label>
                  <input
                    type="text"
                    value={simMessage}
                    onChange={e => setSimMessage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '16px 24px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
              }}
            >
              <button className="btn btn-secondary" onClick={() => setIsSimModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSimulateWebhook}>
                Dispatch Webhook Payload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER / INSPECTOR: WORKFLOW RUN DETAILS */}
      {selectedRun && (
        <div className="modal-overlay" onClick={() => setSelectedRun(null)}>
          <div className="modal-content" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{selectedRun.workflowName}</h3>
                  {selectedRun.status === 'SUCCESS' && <span className="badge badge-success">Success</span>}
                  {selectedRun.status === 'FAILURE' && <span className="badge badge-error">Failed</span>}
                  {selectedRun.status === 'IN_PROGRESS' && <span className="badge badge-warning">In Progress</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Project: <strong>{selectedRun.project}</strong> • {selectedRun.environment}
                </div>
              </div>
              <button onClick={() => setSelectedRun(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>
                ✕
              </button>
            </div>

            <div style={{ padding: 24 }}>
              {/* Metadata Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-surface-elevated)', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Commit SHA</div>
                  <div className="font-mono" style={{ fontSize: 13, fontWeight: 600, color: '#818cf8', marginTop: 2 }}>{selectedRun.commitSha}</div>
                </div>
                <div style={{ background: 'var(--bg-surface-elevated)', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Duration</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', marginTop: 2 }}>{selectedRun.duration}</div>
                </div>
                <div style={{ background: 'var(--bg-surface-elevated)', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Triggered By</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', marginTop: 2 }}>{selectedRun.author}</div>
                </div>
              </div>

              {/* Execution Steps */}
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Terminal size={15} color="#818cf8" />
                <span>Pipeline Execution Jobs & Steps</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { step: '1. Set up job & runner environment', duration: '4s', status: 'PASS' },
                  { step: '2. Check out repository (acme-cloud/storefront-web)', duration: '6s', status: 'PASS' },
                  { step: '3. Setup Node.js v20.x & restore cache', duration: '12s', status: 'PASS' },
                  { step: '4. Run Prisma database migrations check', duration: '18s', status: 'PASS' },
                  { step: '5. Run Jest Unit & Integration Test Suites', duration: '45s', status: selectedRun.status === 'FAILURE' ? 'FAIL' : 'PASS' },
                  { step: '6. Docker Multi-stage Container Build & Tag', duration: '1m 12s', status: selectedRun.status === 'FAILURE' ? 'SKIPPED' : 'PASS' },
                  { step: '7. Deploy to Kubernetes Production Cluster', duration: '37s', status: selectedRun.status === 'FAILURE' ? 'SKIPPED' : 'PASS' },
                ].map((st, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'var(--bg-surface-elevated)',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle)',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {st.status === 'PASS' && <CheckCircle2 size={16} color="#10b981" />}
                      {st.status === 'FAIL' && <XCircle size={16} color="#ef4444" />}
                      {st.status === 'SKIPPED' && <Clock size={16} color="#64748b" />}
                      <span style={{ color: st.status === 'FAIL' ? '#fca5a5' : '#e2e8f0' }}>{st.step}</span>
                    </div>
                    <span className="font-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{st.duration}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
