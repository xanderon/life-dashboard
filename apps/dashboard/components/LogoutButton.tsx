'use client';

import { supabase } from '@/lib/supabaseClient';

export function LogoutButton() {
  return (
    <button
      className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] shadow-sm hover:bg-[var(--panel-2)]"
      onClick={async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
      }}
    >
      Logout
    </button>
  );
}
