import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/shared/auth/AuthProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "여행 앨범",
  description: "그룹 구성원과 사진을 공유하고 여행 앨범을 만드세요.",
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
