import { DashboardShell } from "@/components/dashboard/DashboardShell";

/**
 * Shared chrome for every authenticated screen in the (dashboard) group:
 * sidebar/topbar navigation + skip link. Pages render inside <main>.
 */
export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-accent-foreground"
      >
        Към съдържанието
      </a>
      <DashboardShell>
        <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </DashboardShell>
    </>
  );
}
