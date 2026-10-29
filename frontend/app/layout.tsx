import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "FeedbackOps AI — Intelligent Feedback Triage",
  description:
    "Intelligent Customer Feedback Triage and Routing. Built by Maksalmina.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#f6f7f9", color: "#101318" }}>
        {children}
      </body>
    </html>
  );
}
