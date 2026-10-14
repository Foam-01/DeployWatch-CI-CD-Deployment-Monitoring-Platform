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
        description="Connect GitHub, GitLab, and Jenkins repositories and send CI/CD events to DeployWatch."
      />

      <section className="card setup-steps" aria-labelledby="setup-h">
        <div className="card-head">
          <h2 id="setup-h">Provider setup</h2>
        </div>
        <ol className="small">
          <li>Open a project and choose GitHub, GitLab, or Jenkins (owners and admins only).</li>
          <li>
            GitLab and Jenkins use an access token to discover projects/jobs and sync recent runs. Credentials are
            encrypted at rest.
          </li>
          <li>
            Configure the displayed webhook URL and secret in your provider. GitLab supports pipeline and deployment
            events; Jenkins uses Generic Webhook Trigger with an HMAC signature.
          </li>
          <li>
            For self-hosted GitLab/Jenkins, use an HTTPS URL whose DNS resolves only to public IP addresses.
            Internal/private hosts are intentionally blocked.
          </li>
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
                <th scope="col">Provider</th>
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
                  <td>{repo.provider}</td>
                  <td>
                    <code className="secret">
                      {API_BASE}/webhooks/{repo.provider.toLowerCase()}/{repo.id}
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
