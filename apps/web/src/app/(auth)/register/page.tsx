'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const MIN_PASSWORD = 8;

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nameError = name && name.trim().length < 2 ? 'Name must be at least 2 characters.' : null;
  const passwordError =
    password && password.length < MIN_PASSWORD ? `Password must be at least ${MIN_PASSWORD} characters.` : null;
  const valid = name.trim().length >= 2 && email.includes('@') && password.length >= MIN_PASSWORD;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || !valid) return;
    setError(null);
    setSubmitting(true);
    try {
      await register(name.trim(), email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'An account with this email already exists.'
          : err instanceof Error
            ? err.message
            : 'Registration failed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Create account</h1>
      <p className="muted">A personal workspace is created for you automatically.</p>
      <form onSubmit={handleSubmit} className="form" noValidate>
        <label className="field">
          <span>Name</span>
          <input
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!nameError}
          />
          {nameError && <small className="field-error">{nameError}</small>}
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!passwordError}
          />
          <small className={passwordError ? 'field-error' : 'muted'}>
            {passwordError ?? `At least ${MIN_PASSWORD} characters.`}
          </small>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting || !valid}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="muted small center">
        Already have an account? <Link href="/login" className="link">Sign in</Link>
      </p>
    </>
  );
}
