import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isReviewer, reviewAuthConfigured } from "../../lib/review-auth";
import ConsoleTopBar from "../components/ConsoleTopBar";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const store = await cookies();
  if (isReviewer(store.toString())) redirect("/review");
  const configured = reviewAuthConfigured();

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: "0 24px 48px" }}>
      <ConsoleTopBar />

      <section className="hero">
        <div className="hero-band">
          <span className="micro">Access control · reviewer sign in</span>
          <span className="micro tnum">scrypt · httponly session</span>
        </div>
        <div className="hero-body">
          <div className="split">
            <div>
              <h1 className="display-1" style={{ marginBottom: 12 }}>
                Review access.
              </h1>
              <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, maxWidth: "56ch" }}>
                Human-review actions are protected. Message-level feedback data
                lives only behind this sign-in; session tokens are HttpOnly and
                expire in 8 hours.
              </p>
            </div>
            <div>
              <div className="micro" style={{ marginBottom: 8 }}>Protection model</div>
              <div className="spec">
                <div className="spec-row">
                  <span className="key">credentials</span>
                  <span className="val">scrypt-hashed at rest</span>
                </div>
                <div className="spec-row">
                  <span className="key">session</span>
                  <span className="val">HMAC token · 8 h</span>
                </div>
                <div className="spec-row">
                  <span className="key">attempts</span>
                  <span className="val">rate-limited per IP</span>
                </div>
                <div className="spec-row">
                  <span className="key">secrets in client</span>
                  <span className="val" style={{ color: "var(--ok)" }}>none</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {configured ? (
        <LoginForm />
      ) : (
        <section className="panel" style={{ padding: 18, fontSize: 13, lineHeight: 1.7, color: "var(--muted)" }}>
          Review access is not configured. Set <code className="mono">REVIEW_USERS</code>{" "}
          (or the legacy <code className="mono">REVIEW_PASSWORD</code>) and{" "}
          <code className="mono">REVIEW_SESSION_SECRET</code>, then restart the frontend.
        </section>
      )}
      <a href="/" className="navlink" style={{ display: "inline-block", marginTop: 20 }}>
        ← Back to demo
      </a>

      <footer className="colophon">
        <div className="micro">FeedbackOps AI · access</div>
        <div className="mono" style={{ fontSize: 11 }}>
          built by{" "}
          <a href="https://maksalmina-arina.vercel.app" target="_blank" rel="noreferrer">
            Maksalmina
          </a>{" "}
          · portfolio
        </div>
      </footer>
    </main>
  );
}
