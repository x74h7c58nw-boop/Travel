import Link from "next/link";

export default function HomePage() {
  return (
    <main className="centered-page">
      <section className="hero-card">
        <p className="eyebrow">함께 만드는 여행 기록</p>
        <h1>여행의 순간을<br />함께 모아보세요</h1>
        <p>
          로그인한 그룹 구성원끼리 사진을 공유하고, 원하는 순서로 여행 앨범을
          만들 수 있습니다.
        </p>
        <div className="button-row">
          <Link className="button" href="/login">로그인</Link>
          <Link className="button button-secondary" href="/signup">회원가입</Link>
        </div>
      </section>
    </main>
  );
}
