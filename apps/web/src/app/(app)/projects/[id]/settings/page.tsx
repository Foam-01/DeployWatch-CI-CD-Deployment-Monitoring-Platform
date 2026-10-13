'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ServiceForm } from '@/components/service-form';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import type { Environment, Project, Service } from '@/types/api';

export default function ProjectSettingsPage({ params }: { params: { id: string } }) {
  const { canWrite } = useAuth();
  const project = useApi<Project>(`/projects/${params.id}`);

  if (project.loading && !project.data) return <LoadingState />;
  if (project.error) return <ErrorState error={project.error} onRetry={project.reload} />;
  const p = project.data;
  if (!p) return null;

  const readOnly = !canWrite || p.status === 'ARCHIVED';

  return (
    <>
      <nav className="breadcrumb small" aria-label="Breadcrumb">
        <Link href="/projects" className="link">
          Projects
        </Link>{' '}
        /{' '}
        <Link href={`/projects/${p.id}`} className="link">
          {p.name}
        </Link>{' '}
        / Settings
      </nav>
      <PageHeader title="Project settings" description={p.name} />

      {readOnly && (
        <p className="notice" role="note">
          {p.status === 'ARCHIVED'
            ? 'This project is archived and read-only.'
            : 'You have read-only access. Ask an owner or admin to change these settings.'}
        </p>
      )}

      <GeneralSection project={p} readOnly={readOnly} onSaved={project.reload} />
      <EnvironmentsSection project={p} readOnly={readOnly} onChange={project.reload} />
      <ServicesSection project={p} readOnly={readOnly} onChange={project.reload} />
    </>
  );
}

function GeneralSection({ project, readOnly, onSaved }: { project: Project; readOnly: boolean; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = name.trim() !== project.name || description.trim() !== (project.description ?? '');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !name.trim() || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.patch(`/projects/${project.id}`, { name: name.trim(), description: description.trim() || undefined });
      setMessage({ ok: true, text: 'Saved.' });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card settings-section" aria-labelledby="general-h">
      <div className="card-head">
        <h2 id="general-h">General</h2>
      </div>
      <form className="form narrow" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} disabled={readOnly} required />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            disabled={readOnly}
          />
        </label>
        <p className="muted small">
          Slug <span className="mono">{project.slug}</span> stays the same when you rename the project.
        </p>
        {!readOnly && (
          <div className="form-actions form-actions-start">
            <button type="submit" className="btn btn-primary" disabled={!dirty || !name.trim() || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {message && (
              <span className={message.ok ? 'success-text small' : 'form-error'} role="status">
                {message.text}
              </span>
            )}
          </div>
        )}
      </form>
    </section>
  );
}

function EnvironmentsSection({ project, readOnly, onChange }: { project: Project; readOnly: boolean; onChange: () => void }) {
  const [name, setName] = useState('');
  const [isProduction, setIsProduction] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Environment | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      await api.post(`/projects/${project.id}/environments`, { name: name.trim(), isProduction });
      setName('');
      setIsProduction(false);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the environment.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="card settings-section" aria-labelledby="env-h">
      <div className="card-head">
        <h2 id="env-h">Environments</h2>
        <span className="muted small">Names must match your GitHub Environments</span>
      </div>

      {project.environments.length === 0 ? (
        <EmptyState
          title="No environments yet"
          description="Deployment events are matched to an environment by name, so add one per GitHub Environment."
        />
      ) : (
        <ul className="list">
          {project.environments.map((env) => (
            <li key={env.id} className="list-row">
              <div className="list-main">
                <strong>{env.name}</strong>
              </div>
              {env.isProduction && <span className="chip chip-prod">production</span>}
              {!readOnly && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(env)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <form className="inline-form" onSubmit={add}>
          <label className="field">
            <span>New environment</span>
            <input
              placeholder="Staging"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              pattern="[A-Za-z0-9][A-Za-z0-9 _.\-]*"
            />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={isProduction} onChange={(e) => setIsProduction(e.target.checked)} />
            <span>Production</span>
          </label>
          <button type="submit" className="btn" disabled={!name.trim() || adding}>
            {adding ? 'Adding…' : 'Add environment'}
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}

      <ConfirmDialog
        open={removing !== null}
        danger
        title={`Remove ${removing?.name ?? 'environment'}?`}
        description="Services in this environment keep running but lose the label. Environments with deployment history cannot be removed."
        confirmLabel="Remove environment"
        onConfirm={async () => {
          await api.delete(`/projects/${project.id}/environments/${removing!.id}`);
          onChange();
        }}
        onClose={() => setRemoving(null)}
      />
    </section>
  );
}

function ServicesSection({ project, readOnly, onChange }: { project: Project; readOnly: boolean; onChange: () => void }) {
  // null = no form open, 'new' = create form, otherwise the service being edited.
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const services = project.services ?? [];

  const done = () => {
    setEditing(null);
    onChange();
  };

  return (
    <section className="card settings-section" aria-labelledby="svc-h">
      <div className="card-head">
        <h2 id="svc-h">Health checks</h2>
        {!readOnly && editing === null && (
          <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}>
            Add service
          </button>
        )}
      </div>

      {editing === 'new' && (
        <ServiceForm projectId={project.id} environments={project.environments} onSaved={done} onCancel={() => setEditing(null)} />
      )}

      {services.length === 0 && editing !== 'new' ? (
        <EmptyState
          title="No services monitored"
          description="Add a public health endpoint (for example /health) to track uptime and open incidents automatically."
        />
      ) : (
        <ul className="list">
          {services.map((s) =>
            editing !== null && editing !== 'new' && editing.id === s.id ? (
              <li key={s.id} className="list-edit">
                <ServiceForm
                  projectId={project.id}
                  environments={project.environments}
                  service={s}
                  onSaved={done}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={s.id} className="list-row">
                <StatusBadge value={s.enabled ? s.currentStatus : 'DISABLED'} />
                <div className="list-main">
                  <Link href={`/services/${s.id}`} className="link">
                    {s.name}
                  </Link>
                  <span className="muted small mono">{s.healthUrl}</span>
                </div>
                <span className="muted small nowrap">
                  every {s.intervalSeconds}s · {s.failureThreshold}/{s.successThreshold}
                </span>
                {!readOnly && editing === null && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>
                    Edit
                  </button>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
