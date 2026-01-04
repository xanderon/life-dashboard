'use client';

import { supabase } from '@/lib/supabaseClient';

export function LogoutButton() {
  return (
    <button
      className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50"
      onClick={async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
      }}
    >
      Logout
    </button>
  );
}
