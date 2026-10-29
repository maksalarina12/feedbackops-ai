"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `login_failed_${response.status}`);
      }
      router.push("/review");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "login_failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 18, marginTop: 18 }}
    >
      <label htmlFor="review-username" style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
        Username
      </label>
      <input
        id="review-username"
        type="text"
        autoComplete="username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        required
        autoFocus
        style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 12 }}
      />
      <label htmlFor="review-password" style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
        Password
      </label>
      <input
        id="review-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", fontSize: 14 }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{ width: "100%", marginTop: 12, background: "#101318", color: "#fff", border: 0, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer" }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
      {error && (
        <p role="alert" style={{ color: "#9f1d1d", fontSize: 12, marginBottom: 0 }}>
          {error === "invalid_credentials" ? "Wrong username or password." : error === "rate_limited" ? "Too many attempts. Try again shortly." : error}
        </p>
      )}
    </form>
  );
}
