'use client';

import { useApi } from '@/lib/use-api';
import type { Project } from '@/types/api';

export function ProjectSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useApi<Project[]>('/projects?limit=100');
  return (
    <label className="field-inline">
      <span className="muted small">Project</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All projects</option>
        {data?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
