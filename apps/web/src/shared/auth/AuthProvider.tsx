"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  sessionError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let active = true;
    const supabase = getSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setLoading(false);
        setSessionError(null);
      }
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setSessionError(error.message);
        } else {
          setUser(data.session?.user ?? null);
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSessionError(
          error instanceof Error ? error.message : "세션을 복구하지 못했습니다.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await getSupabaseBrowserClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: new URL("/login", window.location.origin).toString(),
      },
    });
    if (error) throw error;
    return { requiresEmailConfirmation: data.session === null };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      configured: isSupabaseConfigured,
      sessionError,
      signIn,
      signUp,
      signOut,
    }),
    [user, loading, sessionError, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
