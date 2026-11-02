"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "./AuthProvider";

export function ProtectedLayout({ children }: { children: ReactNode }) {
  const { user, loading, configured, sessionError, signOut } = useAuth();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && configured && !user) router.replace("/login");
  }, [configured, loading, router, user]);

  if (!configured) {
    return (
      <main className="centered-page">
        <section className="notice-card">
          <h1>서비스 설정이 필요합니다</h1>
          <p>
            Supabase 환경변수를 설정한 뒤 웹 앱을 다시 시작하세요. 설정 방법은
            apps/web/README.md에 있습니다.
          </p>
        </section>
      </main>
    );
  }

  if (loading || !user) {
    return (
      <main className="centered-page" aria-live="polite">
        <p>로그인 상태를 확인하고 있습니다...</p>
      </main>
    );
  }

  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/groups">
          여행 앨범
        </Link>
        <div className="header-account">
          <span>{user.email}</span>
          <button
            className="button button-secondary"
            onClick={async () => {
              setLogoutError(null);
              try {
                await signOut();
                router.replace("/login");
              } catch (error) {
                setLogoutError(
                  error instanceof Error
                    ? `로그아웃하지 못했습니다: ${error.message}`
                    : "로그아웃하지 못했습니다.",
                );
              }
            }}
          >
            로그아웃
          </button>
        </div>
      </header>
      {logoutError && (
        <p className="global-error" role="alert">{logoutError}</p>
      )}
      {sessionError && (
        <p className="global-error" role="alert">
          세션을 복구하지 못했습니다: {sessionError}
        </p>
      )}
      {children}
    </>
  );
}
