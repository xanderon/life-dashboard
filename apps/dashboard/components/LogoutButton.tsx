'use client';

import { supabase } from '@/lib/supabaseClient';

export function LogoutButton() {
  return (
    <button
      className="btn-base btn-ghost"
      onClick={async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
      }}
    >
      Sign out
    </button>
  );
}
