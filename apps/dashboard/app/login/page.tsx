'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('alexnutu@gmail.com');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [origin, setOrigin] = useState<string>('');

  // Afișăm origin-ul curent (localhost vs 192.168...) pentru debug
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // ✅ IMPORTANT: Dacă Supabase ne redirecționează la /login cu hash tokens,
  // consumăm access_token + refresh_token și facem sesiunea.
 useEffect(() => {
  (async () => {
    console.log('[LOGIN] page loaded');
    console.log('[LOGIN] location.href:', window.location.href);

    const hash = window.location.hash;
    console.log('[LOGIN] hash:', hash);

    if (!hash) return;

    const params = new URLSearchParams(hash.replace('#', ''));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');

    console.log('[LOGIN] access_token exists:', !!access_token);
    console.log('[LOGIN] refresh_token exists:', !!refresh_token);

    if (access_token && refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      console.log('[LOGIN] setSession data:', data);
      console.log('[LOGIN] setSession error:', error);

      const sessionCheck = await supabase.auth.getSession();
      console.log('[LOGIN] getSession after setSession:', sessionCheck);

      if (!error) {
        console.log('[LOGIN] redirecting to /');
        window.history.replaceState({}, document.title, '/');
        window.location.href = '/';
      }
    }
  })();
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
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Login</h1>
        <p className="mt-2 text-sm text-gray-600">
          Dashboard-ul este privat. Loghează-te ca să continui.
        </p>

        <div className="mt-3 rounded-xl bg-gray-100 p-3 text-xs text-gray-700">
          Origin curent: <span className="font-mono">{origin || '(loading...)'}</span>
        </div>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-gray-700">
            Email
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <button
            className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={status === 'sending' || !email}
            type="submit"
          >
            {status === 'sending' ? 'Trimit…' : 'Trimite magic link'}
          </button>

          {message ? (
            <div className="rounded-xl bg-gray-100 p-3 text-sm text-gray-700">{message}</div>
          ) : null}

          {status === 'error' ? (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              Eroare. Dacă ai dat click pe un link mai vechi, cere un magic link nou și folosește-l pe
              cel mai recent.
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}
