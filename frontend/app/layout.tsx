import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FeedbackOps AI — Intelligent Feedback Triage",
  description:
    "Intelligent Customer Feedback Triage and Routing. Built by Maksalmina.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
