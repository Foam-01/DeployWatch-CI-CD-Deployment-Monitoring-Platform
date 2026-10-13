'use client';

import Link from 'next/link';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import type { Project } from '@/types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function IntegrationsPage() {
  const { canManageIntegrations } = useAuth();
  const { data, error, loading, reload } = useApi<Project[]>('/projects?limit=100');
  const linked = (data ?? []).flatMap((p) => p.repositories.map((r) => ({ project: p, repo: r })));

  return (
    <>
      <PageHeader
        title="Integrations"
        description="GitHub repositories that send workflow and deployment events to DeployWatch."
      />

      <section className="card setup-steps" aria-labelledby="setup-h">
        <div className="card-head">
          <h2 id="setup-h">Connecting a repository</h2>
        </div>
        <ol className="small">
          <li>Open a project and link its GitHub repository (owners and admins only).</li>
          <li>
            Copy the webhook secret shown once after linking, then in GitHub go to{' '}
            <strong>Settings → Webhooks → Add webhook</strong>.
          </li>
          <li>
            Use the payload URL below, content type <code>application/json</code>, and select the{' '}
            <strong>Workflow runs</strong> and <strong>Deployment statuses</strong> events.
          </li>
          <li>Add an environment in project settings for each GitHub Environment you deploy to.</li>
        </ol>
      </section>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : linked.length === 0 ? (
        <EmptyState
          title="No repositories linked"
          description={
            canManageIntegrations
              ? 'Open a project to link its GitHub repository.'
              : 'Ask an owner or admin to link a repository.'
          }
          action={
            <Link href="/projects" className="btn">
              Go to projects
            </Link>
          }
        />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Repository</th>
                <th scope="col">Project</th>
                <th scope="col">Webhook payload URL</th>
              </tr>
            </thead>
            <tbody>
              {linked.map(({ project, repo }) => (
                <tr key={repo.id}>
                  <td className="mono">{repo.fullName}</td>
                  <td>
                    <Link href={`/projects/${project.id}`} className="link">
                      {project.name}
                    </Link>
                  </td>
                  <td>
                    <code className="secret">
                      {API_BASE}/webhooks/github/{repo.id}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
