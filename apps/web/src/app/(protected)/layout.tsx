import type { ReactNode } from "react";

import { ProtectedLayout } from "@/shared/auth/ProtectedLayout";

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
