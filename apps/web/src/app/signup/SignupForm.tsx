"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/shared/auth/AuthProvider";

export default function SignupForm() {
  const { signUp, configured } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    if (password !== passwordConfirmation) {
      setErrorMessage("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    try {
      const { requiresEmailConfirmation } = await signUp(email, password);
      if (requiresEmailConfirmation) {
        setConfirmationMessage(
          "가입 요청이 완료됐습니다. 이메일의 확인 링크를 누른 뒤 로그인해 주세요.",
        );
      } else {
        router.replace("/groups");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "회원가입하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="centered-page">
      <section className="form-card">
        <Link className="text-link" href="/">← 홈으로</Link>
        <h1>회원가입</h1>
        <p>여행 그룹에 사용할 계정을 만드세요.</p>
        {!configured && (
          <p className="error-message" role="alert">
            Supabase 설정이 필요합니다. apps/web/README.md를 확인하세요.
          </p>
        )}
        {confirmationMessage && (
          <p className="success-message" role="status">{confirmationMessage}</p>
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
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span className="field-hint">8자 이상</span>
          </label>
          <label>
            비밀번호 확인
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
            />
          </label>
          <button className="button" disabled={!configured || submitting}>
            {submitting ? "가입 중..." : "계정 만들기"}
          </button>
        </form>
        <p className="form-footer">
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </p>
      </section>
    </main>
  );
}
