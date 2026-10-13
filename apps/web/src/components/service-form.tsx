'use client';

import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { Environment, Service } from '@/types/api';

/** Limits mirror CreateServiceDto on the API so errors surface before submit. */
const LIMITS = {
  intervalSeconds: [10, 86400],
  timeoutMs: [1000, 30000],
  expectedHttpStatus: [100, 599],
  failureThreshold: [1, 10],
  successThreshold: [1, 10],
} as const;

type NumericField = keyof typeof LIMITS;

interface Values {
  name: string;
  healthUrl: string;
  environmentId: string;
  intervalSeconds: string;
  timeoutMs: string;
  expectedHttpStatus: string;
  failureThreshold: string;
  successThreshold: string;
  enabled: boolean;
}

function initialValues(service?: Service): Values {
  return {
    name: service?.name ?? '',
    healthUrl: service?.healthUrl ?? 'https://',
    environmentId: '',
    intervalSeconds: String(service?.intervalSeconds ?? 60),
    timeoutMs: String(service?.timeoutMs ?? 5000),
    expectedHttpStatus: String(service?.expectedHttpStatus ?? 200),
    failureThreshold: String(service?.failureThreshold ?? 3),
    successThreshold: String(service?.successThreshold ?? 2),
    enabled: service?.enabled ?? true,
  };
}

function validate(v: Values): Partial<Record<keyof Values, string>> {
  const errors: Partial<Record<keyof Values, string>> = {};
  if (!v.name.trim()) errors.name = 'Name is required.';
  try {
    const url = new URL(v.healthUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') errors.healthUrl = 'Use an http:// or https:// URL.';
  } catch {
    errors.healthUrl = 'Enter a full URL, e.g. https://api.example.com/health';
  }
  for (const key of Object.keys(LIMITS) as NumericField[]) {
    const [min, max] = LIMITS[key];
    const n = Number(v[key]);
    if (!Number.isInteger(n) || n < min || n > max) errors[key] = `Whole number between ${min} and ${max}.`;
  }
  if (!errors.timeoutMs && !errors.intervalSeconds && Number(v.timeoutMs) >= Number(v.intervalSeconds) * 1000) {
    errors.timeoutMs = 'Timeout must be shorter than the check interval.';
  }
  return errors;
}

export function ServiceForm({
  projectId,
  environments,
  service,
  onSaved,
  onCancel,
}: {
  projectId: string;
  environments: Environment[];
  /** When set, the form edits this service instead of creating one. */
  service?: Service;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Values>(() => initialValues(service));
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = validate(values);
  const showError = (key: keyof Values) => (touched ? errors[key] : undefined);
  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length || submitting) return;
    setSubmitting(true);
    setServerError(null);
    const body = {
      name: values.name.trim(),
      healthUrl: values.healthUrl.trim(),
      ...(values.environmentId && { environmentId: values.environmentId }),
      intervalSeconds: Number(values.intervalSeconds),
      timeoutMs: Number(values.timeoutMs),
      expectedHttpStatus: Number(values.expectedHttpStatus),
      failureThreshold: Number(values.failureThreshold),
      successThreshold: Number(values.successThreshold),
      enabled: values.enabled,
    };
    try {
      if (service) await api.patch(`/services/${service.id}`, body);
      else await api.post(`/projects/${projectId}/services`, body);
      onSaved();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not save the service.');
    } finally {
      setSubmitting(false);
    }
  }

  const numberField = (key: NumericField, label: string, hint: string) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={LIMITS[key][0]}
        max={LIMITS[key][1]}
        value={values[key]}
        onChange={set(key)}
        aria-invalid={!!showError(key)}
      />
      <small className={showError(key) ? 'field-error' : 'muted'}>{showError(key) ?? hint}</small>
    </label>
  );

  return (
    <form className="form service-form" onSubmit={submit} noValidate>
      <div className="form-row">
        <label className="field">
          <span>Name</span>
          <input value={values.name} onChange={set('name')} maxLength={100} aria-invalid={!!showError('name')} />
          {showError('name') && <small className="field-error">{showError('name')}</small>}
        </label>
        <label className="field">
          <span>Environment</span>
          <select value={values.environmentId} onChange={set('environmentId')}>
            <option value="">{service?.environment ? `Keep: ${service.environment.name}` : 'None'}</option>
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Health URL</span>
        <input
          type="url"
          inputMode="url"
          className="mono"
          value={values.healthUrl}
          onChange={set('healthUrl')}
          maxLength={2048}
          aria-invalid={!!showError('healthUrl')}
        />
        <small className={showError('healthUrl') ? 'field-error' : 'muted'}>
          {showError('healthUrl') ?? 'Public endpoints only. Private, loopback and cloud metadata addresses are rejected.'}
        </small>
      </label>

      <div className="form-row form-row-3">
        {numberField('intervalSeconds', 'Interval (seconds)', '10 – 86400')}
        {numberField('timeoutMs', 'Timeout (ms)', '1000 – 30000')}
        {numberField('expectedHttpStatus', 'Expected status', 'Usually 200')}
      </div>
      <div className="form-row">
        {numberField('failureThreshold', 'Failures before incident', 'Consecutive failed checks')}
        {numberField('successThreshold', 'Passes before recovery', 'Consecutive passing checks')}
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={values.enabled} onChange={set('enabled')} />
        <span>Run checks for this service</span>
      </label>

      {serverError && (
        <p className="form-error" role="alert">
          {serverError}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : service ? 'Save changes' : 'Add service'}
        </button>
      </div>
    </form>
  );
}
