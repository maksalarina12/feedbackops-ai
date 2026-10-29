import Link from "next/link";

export default function ConsoleTopBar() {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="dot" aria-hidden />
        FEEDBACKOPS
        <span className="brand-tag">v2 · demo console</span>
      </Link>
      <nav className="topnav" aria-label="Main">
        <Link href="/" className="navlink">
          Demo
        </Link>
        <Link href="/stats" className="navlink">
          Stats
        </Link>
        <Link href="/review" className="navlink">
          Review
        </Link>
      </nav>
    </header>
  );
}
