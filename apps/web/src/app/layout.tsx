import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '모여행 | 함께 쓰는 여행 경비', description: '여행 그룹과 경비를 함께 관리하세요.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
