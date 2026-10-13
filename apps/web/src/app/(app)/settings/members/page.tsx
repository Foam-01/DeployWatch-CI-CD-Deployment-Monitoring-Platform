'use client';

import { FormEvent, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ErrorState, LoadingState, PageHeader, TimeAgo } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';
import type { Member, MemberRole } from '@/types/api';

const ROLES: { value: MemberRole; label: string; description: string }[] = [
  { value: 'OWNER', label: 'Owner', description: 'Everything, including organization settings and other owners' },
  { value: 'ADMIN', label: 'Admin', description: 'Manage members, integrations, projects and incidents' },
  { value: 'MEMBER', label: 'Member', description: 'Create and edit projects, services and incidents' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only access' },
];

export default function MembersPage() {
  const { orgId, role: myRole, user } = useAuth();
  const members = useApi<Member[]>(orgId ? `/organizations/${orgId}/memberships` : null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const canManage = myRole === 'OWNER' || myRole === 'ADMIN';
  // Admins cannot grant OWNER or act on owners; the API enforces the same rule.
  const assignableRoles = ROLES.filter((r) => myRole === 'OWNER' || r.value !== 'OWNER');
  // Your own row is read-only: changing or removing yourself could lock you (or the org) out.
  const canEdit = (m: Member) =>
    canManage && m.user.id !== user?.id && (myRole === 'OWNER' || m.role !== 'OWNER');

  async function changeRole(m: Member, role: MemberRole) {
    setRowError(null);
    try {
      await api.patch(`/organizations/${orgId}/memberships/${m.id}`, { role });
      members.reload();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not change the role.');
    }
  }

  return (
    <>
      <PageHeader title="Members" description="People with access to this organization and what they can do." />

      {canManage && <AddMemberForm orgId={orgId!} roles={assignableRoles} onAdded={members.reload} />}

      {rowError && (
        <p className="form-error" role="alert">
          {rowError}
        </p>
      )}

      {members.loading && !members.data ? (
        <LoadingState />
      ) : members.error ? (
        <ErrorState error={members.error} onRetry={members.reload} />
      ) : (
        <div className="card table-wrap">
          <table className="table table-middle">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.data?.map((m) => (
                <tr key={m.id}>
                  <td className="strong">
                    {m.user.name}
                    {m.user.id === user?.id && <span className="muted"> (you)</span>}
                  </td>
                  <td className="mono small">{m.user.email}</td>
                  <td>
                    {canEdit(m) ? (
                      <select
                        aria-label={`Role for ${m.user.name}`}
                        value={m.role}
                        onChange={(e) => changeRole(m, e.target.value as MemberRole)}
                      >
                        {(m.role === 'OWNER' ? ROLES : assignableRoles).map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLES.find((r) => r.value === m.role)?.label
                    )}
                  </td>
                  <td className="muted small">
                    <TimeAgo iso={m.createdAt} />
                  </td>
                  <td className="actions-cell">
                    {canEdit(m) && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(m)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="role-legend" aria-label="Role permissions">
        {ROLES.map((r) => (
          <p key={r.value} className="small">
            <strong>{r.label}</strong> <span className="muted">— {r.description}</span>
          </p>
        ))}
      </section>

      <ConfirmDialog
        open={removing !== null}
        danger
        title={`Remove ${removing?.user.name ?? 'member'}?`}
        description="They lose access to every project in this organization immediately. Their past activity stays in the audit log."
        confirmLabel="Remove member"
        onConfirm={async () => {
          await api.delete(`/organizations/${orgId}/memberships/${removing!.id}`);
          members.reload();
        }}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

function AddMemberForm({
  orgId,
  roles,
  onAdded,
}: {
  orgId: string;
  roles: typeof ROLES;
  onAdded: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('MEMBER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !email.includes('@')) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/organizations/${orgId}/memberships`, { email: email.trim(), role });
      setEmail('');
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the member.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form card" onSubmit={submit}>
      <label className="field grow">
        <span>Add a member by email</span>
        <input type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-primary" disabled={busy || !email.includes('@')}>
        {busy ? 'Adding…' : 'Add member'}
      </button>
      <p className={error ? 'form-error full' : 'muted small full'} role={error ? 'alert' : undefined}>
        {error ?? 'They need a DeployWatch account first; invitations by email are not available yet.'}
      </p>
    </form>
  );
}
