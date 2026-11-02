"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/shared/auth/AuthProvider";
import { getSupabaseBrowserClient } from "@/shared/auth/supabase";

export default function GroupsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await getSupabaseBrowserClient()
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);
      if (error) {
        setGroupIds([]);
        setErrorMessage(
          `그룹 목록을 불러오지 못했습니다. 그룹 기능 연동을 확인하세요: ${error.message}`,
        );
      } else {
        setGroupIds([...new Set(data.map((membership) => membership.group_id))]);
      }
    } catch (error) {
      setGroupIds([]);
      setErrorMessage(
        `그룹 목록을 불러오지 못했습니다. 그룹 기능 연동을 확인하세요: ${
          error instanceof Error ? error.message : "알 수 없는 오류"
        }`,
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void Promise.resolve().then(loadGroups);
  }, [loadGroups]);

  return (
    <main className="content-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">그룹 앨범</p>
          <h1>내 여행 그룹</h1>
          <p>그룹을 선택해 구성원과 사진 및 앨범을 공유하세요.</p>
        </div>
        <button className="button button-secondary" onClick={() => void loadGroups()}>
          새로고침
        </button>
      </div>
      {loading && <p aria-live="polite">그룹을 불러오는 중...</p>}
      {errorMessage && (
        <div className="error-message" role="alert">
          <p>{errorMessage}</p>
          <p>그룹·멤버십 데이터베이스 설정과 로그인 상태를 확인하세요.</p>
        </div>
      )}
      {!loading && !errorMessage && groupIds.length === 0 && (
        <section className="empty-card">
          <h2>참여 중인 그룹이 없습니다</h2>
          <p>여행 그룹을 만들거나 초대 코드로 참여한 뒤 앨범을 공유하세요.</p>
          <button className="button" onClick={() => router.push("/")}>
            그룹 만들기 또는 초대 코드 입력
          </button>
        </section>
      )}
      <div className="group-list">
        {groupIds.map((groupId) => (
          <Link
            className="group-card"
            href={`/groups/${encodeURIComponent(groupId)}/albums`}
            key={groupId}
          >
            <span>그룹 앨범 보기</span>
            <code>{groupId}</code>
          </Link>
        ))}
      </div>
    </main>
  );
}
