'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

// Integration adapter only: the teammate owns sign-in/out UI and auth actions.
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabase();
    if (!client) { setLoading(false); return; }
    let active = true;
    let changed = false;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      changed = true;
      if (active) { setUser(session?.user ?? null); setLoading(false); setError(null); }
    });
    client.auth.getSession().then(({ data, error }) => {
      if (!active || changed) return;
      setUser(data.session?.user ?? null);
      setError(error?.message ?? null);
      setLoading(false);
    }).catch(() => {
      if (active && !changed) { setError('로그인 상태를 확인할 수 없습니다.'); setLoading(false); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return { user, loading, error };
}
