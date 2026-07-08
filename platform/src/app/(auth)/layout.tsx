import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* Cockpit backdrop: instrument grid + a soft projection glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hud-grid opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--glow) 0%, transparent 100%)",
        }}
      />
      <div className="relative w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 text-lg font-extrabold tracking-tight"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground shadow-glow-sm"
          >
            К
          </span>
          <span>
            Книжка<span className="text-accent">.AI</span>
          </span>
        </Link>
        <div className="hud-panel p-6">{children}</div>
      </div>
    </main>
  );
}
