'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function AuthHashCallback() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const hash = window.location.hash; // "#access_token=...&refresh_token=..."
      const params = new URLSearchParams(hash.replace('#', ''));

      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (!error) {
          router.replace('/');
          return;
        }
      }

      // fallback: dacă deja ai sesiune
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace('/');
        return;
      }

      router.replace('/login');
    })();
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-sm text-gray-600">Finalizing login…</div>
      </div>
    </main>
  );
}
