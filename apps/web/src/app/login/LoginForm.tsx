"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/shared/auth/AuthProvider";

export default function LoginForm() {
  const { signIn, configured, loading, user, sessionError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/groups");
  }, [loading, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/groups");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "로그인하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="centered-page">
      <section className="form-card">
        <Link className="text-link" href="/">← 홈으로</Link>
        <h1>로그인</h1>
        <p>이메일과 비밀번호로 여행 기록을 이어가세요.</p>
        {!configured && (
          <p className="error-message" role="alert">
            Supabase 설정이 필요합니다. apps/web/README.md를 확인하세요.
          </p>
        )}
        {sessionError && (
          <p className="error-message" role="alert">
            저장된 로그인 세션을 복구하지 못했습니다: {sessionError}
          </p>
        )}
        {errorMessage && (
          <p className="error-message" role="alert">{errorMessage}</p>
        )}
        <form className="stack-form" onSubmit={handleSubmit}>
          <label>
            이메일
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="button" disabled={!configured || submitting}>
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
        <p className="form-footer">
          계정이 없나요? <Link href="/signup">회원가입</Link>
        </p>
      </section>
    </main>
  );
}
