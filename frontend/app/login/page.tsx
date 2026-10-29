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
    <main style={{ maxWidth: 420, margin: "72px auto", padding: "0 24px" }}>
      <span className="micro" style={{ display: "block", marginBottom: 8 }}>
        FeedbackOps · Access
      </span>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 6 }}>
        Review queue sign in
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6 }}>
        Human-review actions are protected. Use a reviewer account configured
        on the server.
      </p>
      {configured ? (
        <LoginForm />
      ) : (
        <section className="panel" style={{ padding: 18, marginTop: 16, fontSize: 13, lineHeight: 1.7, color: "var(--muted)" }}>
          Review access is not configured. Set <code className="mono">REVIEW_USERS</code>{" "}
          (or the legacy <code className="mono">REVIEW_PASSWORD</code>) and{" "}
          <code className="mono">REVIEW_SESSION_SECRET</code>, then restart the frontend.
        </section>
      )}
      <a href="/" className="navlink" style={{ display: "inline-block", marginTop: 20 }}>
        ← Back to demo
      </a>
      <footer style={{ marginTop: 16, color: "var(--faint)", fontSize: 11 }}>
        Built by <b>Maksalmina</b> ·{" "}
        <a className="textlink" href="https://maksalmina-arina.vercel.app" target="_blank" rel="noreferrer">
          portfolio
        </a>
      </footer>
    </main>
  );
}
