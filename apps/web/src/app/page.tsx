'use client';
import Link from 'next/link';
import { useAuth } from '../shared/auth';
import { isSupabaseConfigured } from '../shared/auth/supabase';
import { Workspace } from '../features/groups/workspace';
export default function Page() {
  const { user, loading, error } = useAuth();
  const configured = isSupabaseConfigured;
  return <>
    <header className="site-header"><Link className="brand" href="/">모여행<span>함께 떠나고, 가볍게 나누고.</span></Link><nav className="header-account"><Link href="/groups">사진 앨범</Link>{user ? <span>{user.email}</span> : <Link href="/login">로그인</Link>}</nav></header>
    {!configured ? <main className="gate"><p className="eyebrow">시작할 준비</p><h1>우리 여행을<br/>함께 기록하는 공간</h1><p>Supabase 연결 후 그룹과 정산을 사용할 수 있습니다.</p><ol><li>apps/web/.env.example을 .env.local로 복사</li><li>Supabase URL과 publishable key 입력</li><li>그룹·정산, 사진·앨범 SQL 마이그레이션 순서대로 적용</li><li>로그인 후 그룹과 앨범 사용</li></ol><p>설정과 검증 방법: docs/groups-settlement-setup.md 및 apps/web/README.md</p></main>
      : loading ? <main className="gate" aria-busy="true">로그인 상태를 확인하고 있습니다…</main>
      : error ? <main className="gate" role="alert">{error}</main>
      : !user ? <main className="gate"><p className="eyebrow">OUR NEXT JOURNEY</p><h1>여행의 즐거움은 함께,<br/>정산은 가볍게.</h1><p>로그인하면 내 여행 그룹과 저장한 결제 내역을 확인할 수 있어요.</p><Link className="button" href="/login">로그인으로 이동</Link><p className="muted">처음 오셨나요? <Link href="/signup">회원가입</Link> 후 그룹에 참여할 수 있습니다.</p></main>
      : <Workspace key={user.id} userId={user.id}/>}
    <footer>모여행 · 여행비는 정확하게, 추억은 오래도록.</footer>
  </>;
}
