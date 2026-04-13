'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell, SurfaceCard } from '@/components/PageShell';
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
    <PageShell width="md" className="flex items-center justify-center">
      <SurfaceCard className="hero-card p-6">
        <div className="eyebrow">Auth callback</div>
        <div className="display-title mt-5 text-3xl font-semibold tracking-[-0.06em]">
          Finalizing login…
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Validăm sesiunea Supabase și te trimitem imediat în dashboard.
        </p>
      </SurfaceCard>
    </PageShell>
  );
}
