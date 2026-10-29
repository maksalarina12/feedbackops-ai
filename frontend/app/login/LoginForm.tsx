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
      className="panel"
      style={{ padding: 20, marginTop: 16, maxWidth: 380 }}
    >
      <label className="micro" htmlFor="review-username" style={{ display: "block", marginBottom: 6 }}>
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
        className="field"
        style={{ width: "100%", boxSizing: "border-box", marginBottom: 12 }}
      />
      <label className="micro" htmlFor="review-password" style={{ display: "block", marginBottom: 6 }}>
        Password
      </label>
      <input
        id="review-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        className="field"
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      <button
        type="submit"
        disabled={loading}
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 14, padding: "9px 12px", fontSize: 13 }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
      {error && (
        <p role="alert" style={{ color: "var(--err)", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          {error === "invalid_credentials" ? "Wrong username or password." : error === "rate_limited" ? "Too many attempts. Try again shortly." : error}
        </p>
      )}
    </form>
  );
}
