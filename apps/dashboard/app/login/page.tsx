'use client';

import { useEffect, useState } from 'react';
import { PageShell, SurfaceCard } from '@/components/PageShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [origin, setOrigin] = useState('');

  // ✅ IMPORTANT: Dacă Supabase ne redirecționează la /login cu hash tokens,
  // consumăm access_token + refresh_token și facem sesiunea.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOrigin(window.location.origin);
    });

    (async () => {
      const hash = window.location.hash;
      if (!hash) return;

      const params = new URLSearchParams(hash.replace('#', ''));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (!error) {
          window.history.replaceState({}, document.title, '/');
          window.location.href = '/';
        }
      }
    })();

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setMessage('');

    // Supabase poate ignora redirect_to în unele flow-uri și te aduce tot pe /login.
    // E OK, pentru că avem handler-ul de mai sus care consumă tokenii din hash.
    const redirectTo = `${window.location.origin}/auth/hash`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setStatus('error');
      setMessage(error.message);
      return;
    }

    setStatus('sent');
    setMessage(`Ți-am trimis un magic link pe email. (redirect: ${redirectTo})`);
  }

  return (
    <PageShell width="md" className="flex items-center justify-center">
      <SurfaceCard className="hero-card p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">Private access</span>
            <h1 className="display-title mt-5 text-4xl font-semibold tracking-[-0.06em]">
              Login
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Dashboard-ul este privat. Loghează-te cu magic link și continui exact de unde ai
              rămas.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <ThemeToggle />
        </div>

        <div className="metric-tile mt-5">
          <div className="metric-tile__label">Origin curent</div>
          <div className="metric-tile__value font-mono text-sm">{origin || '(loading...)'}</div>
        </div>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-[var(--muted)]">
            Email
            <input
              className="field-base mt-2 px-4 py-3"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <button
            className="btn-base btn-primary w-full disabled:opacity-50"
            disabled={status === 'sending' || !email}
            type="submit"
          >
            {status === 'sending' ? 'Trimit…' : 'Trimite magic link'}
          </button>

          {message ? (
            <div className="surface-card surface-card--soft p-4 text-sm text-[var(--muted)]">
              {message}
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="surface-card surface-card--danger p-4 text-sm">
              Eroare. Dacă ai dat click pe un link mai vechi, cere un magic link nou și folosește-l
              pe cel mai recent.
            </div>
          ) : null}
        </form>
      </SurfaceCard>
    </PageShell>
  );
}
