import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 block text-center text-sm font-semibold tracking-wide opacity-70 hover:opacity-100"
        >
          Книжка.AI
        </Link>
        <div className="rounded-2xl border border-black/10 p-6 shadow-sm dark:border-white/15">
          {children}
        </div>
      </div>
    </main>
  );
}
