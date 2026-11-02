import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/shared/auth/AuthProvider";

import "@/features/groups/groups.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "모여행 | 함께 쓰는 여행과 앨범",
  description: "여행 그룹과 경비를 함께 관리하고 추억을 공유하세요.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
