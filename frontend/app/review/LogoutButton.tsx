"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      style={{ color: "var(--muted)", fontSize: 12, background: "none", border: 0, cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
    >
      Sign out
    </button>
  );
}
