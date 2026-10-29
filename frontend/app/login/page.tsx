import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isReviewer, reviewAuthConfigured } from "../../lib/review-auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const store = await cookies();
  if (isReviewer(store.toString())) redirect("/review");
  const configured = reviewAuthConfigured();

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Review queue sign in</h1>
      <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>
        Human-review actions are protected. Use a reviewer account configured on
        the server.
      </p>
      {configured ? (
        <LoginForm />
      ) : (
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 18, fontSize: 13, lineHeight: 1.7, color: "#4b5563" }}>
          Review access is not configured. Set <code>REVIEW_USERS</code> (or the
          legacy <code>REVIEW_PASSWORD</code>) and{" "}
          <code>REVIEW_SESSION_SECRET</code>, then restart the frontend.
        </section>
      )}
      <a href="/" style={{ display: "inline-block", marginTop: 18, color: "#4b5563", fontSize: 13 }}>
        Back to demo
      </a>
      <footer style={{ marginTop: 14, color: "#9ca3af", fontSize: 11 }}>
        Built by <strong>Maksalmina</strong> ·{" "}
        <a
          href="https://maksalmina-arina.vercel.app"
          target="_blank"
          rel="noreferrer"
          style={{ color: "#9ca3af" }}
        >
          portfolio
        </a>
      </footer>
    </main>
  );
}
