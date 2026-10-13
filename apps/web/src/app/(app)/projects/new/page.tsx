'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { EmptyState, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Project } from '@/types/api';

export default function NewProjectPage() {
  const { canWrite } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!canWrite) {
    return <EmptyState title="Access denied" description="Viewers cannot create projects." />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<Project>('/projects', {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/projects/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create project.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="New project" description="You can link a GitHub repository after creating it." />
      <form className="card form narrow" onSubmit={handleSubmit}>
        <label className="field">
          <span>Name</span>
          <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Description (optional)</span>
          <textarea
            maxLength={500}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <small className="muted">{description.length}/500</small>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </>
  );
}
