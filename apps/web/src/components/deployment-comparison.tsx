'use client';

import { useEffect, useState } from 'react';
import { ErrorState, ExternalLink, LoadingState, StatusBadge, TimeAgo } from '@/components/ui';
import { qs } from '@/lib/api';
import { shortSha } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import type { DeploymentEnvironmentComparison, Project } from '@/types/api';

function DeploymentSnapshot({ label, snapshot }: { label: string; snapshot: DeploymentEnvironmentComparison['left'] }) {
  const { environment, deployment } = snapshot;

  return (
    <article className="deployment-comparison-item" aria-label={`${label}: ${environment.name}`}>
      <div className="deployment-comparison-title">
        <h3>{environment.name}</h3>
        {environment.isProduction && <span className="chip chip-prod chip-sm">Production</span>}
      </div>
      {deployment ? (
        <dl className="details">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge value={deployment.status} />
            </dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd className="mono" title={deployment.commitSha}>
              {shortSha(deployment.commitSha)}
            </dd>
          </div>
          <div>
            <dt>Message</dt>
            <dd>{deployment.commitMessage ?? '—'}</dd>
          </div>
          <div>
            <dt>Triggered by</dt>
            <dd>{deployment.triggeredBy ?? '—'}</dd>
          </div>
          <div>
            <dt>Deployed</dt>
            <dd>
              <TimeAgo iso={deployment.completedAt ?? deployment.createdAt} />
            </dd>
          </div>
          {deployment.workflowRun && (
            <div>
              <dt>Workflow</dt>
              <dd>
                <ExternalLink href={deployment.workflowRun.htmlUrl}>
                  {deployment.workflowRun.workflowName} #{deployment.workflowRun.runNumber}
                </ExternalLink>
              </dd>
            </div>
          )}
          {deployment.externalUrl && (
            <div>
              <dt>Environment URL</dt>
              <dd>
                <ExternalLink href={deployment.externalUrl}>{deployment.externalUrl}</ExternalLink>
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="muted">No deployment has been recorded for this environment.</p>
      )}
    </article>
  );
}

export function DeploymentComparison() {
  const {
    data: projects,
    error: projectsError,
    loading: projectsLoading,
    reload: reloadProjects,
  } = useApi<Project[]>('/projects?limit=100');
  const [projectId, setProjectId] = useState('');
  const [leftEnvironmentId, setLeftEnvironmentId] = useState('');
  const [rightEnvironmentId, setRightEnvironmentId] = useState('');

  useEffect(() => {
    if (!projects?.length) return;
    if (!projects.some((project) => project.id === projectId)) {
      setProjectId(projects[0].id);
      setLeftEnvironmentId('');
      setRightEnvironmentId('');
    }
  }, [projects, projectId]);

  const selectedProject = projects?.find((project) => project.id === projectId);
  const environments = selectedProject?.environments ?? [];

  useEffect(() => {
    if (!selectedProject) return;
    const projectEnvironments = selectedProject.environments;
    if (!projectEnvironments.some((environment) => environment.id === leftEnvironmentId)) {
      setLeftEnvironmentId(projectEnvironments[0]?.id ?? '');
    }
    if (!projectEnvironments.some((environment) => environment.id === rightEnvironmentId)) {
      setRightEnvironmentId(projectEnvironments[1]?.id ?? '');
    }
  }, [selectedProject, leftEnvironmentId, rightEnvironmentId]);

  const comparePath =
    projectId && leftEnvironmentId && rightEnvironmentId && leftEnvironmentId !== rightEnvironmentId
      ? `/projects/${projectId}/deployments/compare${qs({ leftEnvironmentId, rightEnvironmentId })}`
      : null;
  const { data: comparison, error, loading, reload } = useApi<DeploymentEnvironmentComparison>(comparePath);

  return (
    <section className="deployment-comparison" aria-labelledby="deployment-comparison-heading">
      <header className="card-head">
        <div>
          <h2 id="deployment-comparison-heading">Compare environments</h2>
          <p className="muted">Compare the latest recorded deployment and commit in two environments.</p>
        </div>
      </header>

      {projectsLoading ? (
        <LoadingState label="Loading projects…" />
      ) : projectsError ? (
        <ErrorState error={projectsError} onRetry={reloadProjects} />
      ) : !projects?.length ? (
        <p className="muted">Create a project with at least two environments to compare deployments.</p>
      ) : (
        <>
          <div className="toolbar" role="group" aria-label="Environment comparison options">
            <label className="field-inline">
              <span className="muted small">Project</span>
              <select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setLeftEnvironmentId('');
                  setRightEnvironmentId('');
                }}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-inline">
              <span className="muted small">Environment A</span>
              <select value={leftEnvironmentId} onChange={(event) => setLeftEnvironmentId(event.target.value)}>
                <option value="">Choose an environment</option>
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-inline">
              <span className="muted small">Environment B</span>
              <select value={rightEnvironmentId} onChange={(event) => setRightEnvironmentId(event.target.value)}>
                <option value="">Choose an environment</option>
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {environments.length < 2 ? (
            <p className="muted">This project needs at least two environments for comparison.</p>
          ) : leftEnvironmentId === rightEnvironmentId ? (
            <p className="muted" role="status">
              Choose two different environments.
            </p>
          ) : loading ? (
            <LoadingState label="Comparing latest deployments…" />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : comparison ? (
            <>
              <p className="state-title" role="status">
                {comparison.sameCommit === null
                  ? 'A commit comparison is unavailable until both environments have a deployment.'
                  : comparison.sameCommit
                    ? 'Both environments are deployed at the same commit.'
                    : 'The environments are deployed at different commits.'}
              </p>
              <div className="two-col">
                <DeploymentSnapshot label="Environment A" snapshot={comparison.left} />
                <DeploymentSnapshot label="Environment B" snapshot={comparison.right} />
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
