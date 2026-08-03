import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { disabledFeatures } from "@/lib/features";
import {
  ADMIN_REASON_MIN,
  AdminError,
  getUserDossier,
  type AdminActionRow,
  type AdminEntitlementRow,
  type AdminExamAttemptRow,
  type AdminPaymentRow,
  type AdminUserDossier,
} from "@/modules/admin";
import { requireUser } from "@/modules/auth";
import { PACKS, PACK_IDS } from "@/modules/payments";
import {
  deleteAttemptAction,
  grantEntitlementAction,
  restoreFreeExamAction,
  revokeEntitlementAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Поддръжка · Книжка.AI",
  description: "Вътрешен изглед: поддръжка на акаунти.",
  robots: { index: false, follow: false },
};

// Reads live rows and mutates them; a cached support screen is a support
// screen that tells you the state before you changed it.
export const dynamic = "force-dynamic";

/**
 * /admin — the support surface.
 *
 * WHAT IT REPLACES. Every support case was psql over SSH at 3am: hand-written
 * UPDATEs against the production database, no record of who ran them, and no
 * undo. The specific case that made it urgent: a free student taps „Започни
 * пробен изпит", their phone drops connection, and requireEntitlementForExam
 * counts STARTED attempts — so the single lifetime free exam they were ever
 * going to get is spent on a paper they never saw. The best conversion moment
 * in the product, turned into a one-star review, with no remedy short of SQL.
 *
 * THE GATE is `user.isAdmin`, resolved server-side from User.role on every
 * request (auth/session.ts reads the DB, never the JWT — a forged token cannot
 * claim admin, and a demoted account loses access on its next click). The
 * refusal is notFound() and not a 403, exactly as review/calibration/page.tsx
 * does it: an internal tool should not confirm its own existence to a
 * logged-in student. The four server actions repeat the same check, because a
 * server action is a public POST endpoint and gating only this page would
 * leave the mutations reachable.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW: no password hash, no reset token, no
 * birth year, no session, no tutor conversation. Support answering a ticket
 * needs entitlements, money, exams and spend; it never needs to become the
 * student (ADR-004 — the student may be 17).
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  if (!user.isAdmin) notFound();

  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email.trim() : "";
  const msg = typeof params.msg === "string" ? params.msg : undefined;
  const err = typeof params.err === "string" ? params.err : undefined;

  let dossier: AdminUserDossier | null = null;
  let lookupError: string | null = null;
  if (email !== "") {
    try {
      dossier = await getUserDossier(email);
    } catch (e) {
      lookupError =
        e instanceof AdminError && e.code === "USER_NOT_FOUND"
          ? `Няма акаунт с адрес ${email}.`
          : "Търсенето се провали. Виж лога на сървъра.";
      if (!(e instanceof AdminError)) console.error("[admin] lookup failed:", e);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <span className="hud-label">Вътрешен изглед · само админ</span>
        <h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">
          Поддръжка на акаунти
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Всяка промяна оттук се записва с твоя адрес, причината и точния час.
          Записът е само за добавяне — нищо тук не може да бъде изтрито после.
        </p>
      </header>

      <KillSwitchPanel />

      <SearchForm email={email} />

      {msg ? <Banner tone="ok">{OK_COPY_BG[msg] ?? "Готово."}</Banner> : null}
      {err ? <Banner tone="bad">{ERR_COPY_BG[err] ?? ERR_COPY_BG.FAILED}</Banner> : null}
      {lookupError ? <Banner tone="bad">{lookupError}</Banner> : null}

      {dossier ? <Dossier dossier={dossier} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const OK_COPY_BG: Record<string, string> = {
  granted: "Пакетът е даден (provider: promo — не се брои за приход).",
  revoked: "Достъпът е отнет. Плащането остава в счетоводния запис.",
  "free-exam-restored": "Безплатният пробен изпит е върнат.",
  "attempt-deleted": "Незавършеният опит е изтрит.",
};

const ERR_COPY_BG: Record<string, string> = {
  USER_NOT_FOUND: "Няма такъв акаунт.",
  REASON_REQUIRED: `Причината е задължителна (поне ${ADMIN_REASON_MIN} знака).`,
  INVALID_INPUT: "Невалидни данни за това действие.",
  NOT_FOUND: "Този запис не принадлежи на този акаунт.",
  NOT_IN_PROGRESS:
    "Опитът вече е оценен — завършен изпит не се изтрива, това е записът на ученика.",
  FAILED: "Действието се провали. Виж лога на сървъра.",
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "bad";
  children: ReactNode;
}) {
  return (
    <p
      role="status"
      className={`card px-4 py-3 text-sm font-semibold ${
        tone === "ok"
          ? "border-success/50 text-success"
          : "border-danger/50 text-danger"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * What DISABLED_FEATURES is actually doing, right now, in this process.
 *
 * It lives HERE and not on /api/health because that endpoint is public and its
 * contract is "no configuration, ever" (ADR-004, and a test enforces the exact
 * key set). Behind the admin gate the same information is free — and it closes
 * the loop the kill switch needs: flip the variable, restart, load this page,
 * see it. `unknown` is the important half: `DISABLED_FEATURES=simulater` looks
 * like it worked and leaves every student driving.
 */
function KillSwitchPanel() {
  const { disabled, unknown } = disabledFeatures();

  return (
    <section className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
      <span className="hud-label">DISABLED_FEATURES</span>
      {disabled.length === 0 ? (
        <span className="text-muted">нищо не е изключено</span>
      ) : (
        disabled.map((f) => (
          <span
            key={f}
            className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-bold text-warning"
          >
            {f} · изключено
          </span>
        ))
      )}
      {unknown.length > 0 ? (
        <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-bold text-danger">
          непозната стойност: {unknown.join(", ")} — нищо не е изключено от нея
        </span>
      ) : null}
      <span className="ml-auto text-xs text-muted">
        Променя се в средата на процеса и изисква рестарт (pm2 restart
        --update-env), не деплой.
      </span>
    </section>
  );
}

/**
 * A GET form, not an action: the e-mail belongs in the URL so the dossier is
 * linkable into a ticket and survives every mutation redirect below.
 */
function SearchForm({ email }: { email: string }) {
  return (
    <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
      <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
        <span className="hud-label">Имейл на ученика</span>
        <input
          type="email"
          name="email"
          defaultValue={email}
          required
          autoComplete="off"
          placeholder="ivan@example.com"
          className="rounded-lg border border-hair bg-surface-2 px-3 py-2 text-sm"
        />
      </label>
      <button type="submit" className="btn-accent">
        Намери
      </button>
    </form>
  );
}

function Dossier({ dossier }: { dossier: AdminUserDossier }) {
  const { user, entitlements, payments, attempts, tutor, freeExam, history } = dossier;

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Акаунт">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Field label="Имейл" value={user.email} />
          <Field label="Име" value={user.name ?? "—"} />
          <Field label="Роля" value={user.role} />
          <Field label="Регистриран" value={fmtDate(user.createdAt)} />
          <Field label="ID" value={user.id} mono />
        </dl>
      </Panel>

      {/* ---- the free exam, and the button this whole screen exists for ---- */}
      <Panel title="Безплатен пробен изпит">
        <p className="text-sm leading-relaxed text-muted">
          Безплатният тарифен план дава {freeExam.allowance - freeExam.grants}{" "}
          пробен изпит за цял живот, и <strong>започнатият</strong> опит го
          изразходва — така никой не фермерва изпити, като ги зарязва. Цената:
          ако връзката падне на 30-ата секунда, изпитът е изхабен върху лист,
          който ученикът никога не е видял. Бутонът връща точно един изпит — не
          дава пакет и не трие история.
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <Field label="Започнати опити" value={String(freeExam.attempts)} />
          <Field label="Позволени" value={String(freeExam.allowance)} />
          <Field
            label="Може ли да започне"
            value={freeExam.hasFreeExamLeft ? "да" : "не"}
          />
        </dl>
        <ActionForm
          action={restoreFreeExamAction}
          email={user.email}
          userId={user.id}
          label="Върни безплатния изпит"
          reasonPlaceholder="напр. връзката падна на 30-ата секунда"
        />
      </Panel>

      {/* ---- entitlements ------------------------------------------------- */}
      <Panel title="Достъп (Entitlement)">
        {entitlements.length === 0 ? (
          <Empty>Няма нито един запис за достъп.</Empty>
        ) : (
          <Rows>
            {entitlements.map((e) => (
              <EntitlementRow
                key={e.id}
                row={e}
                email={user.email}
                userId={user.id}
              />
            ))}
          </Rows>
        )}

        <form
          action={grantEntitlementAction}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-hair pt-4"
        >
          <input type="hidden" name="email" value={user.email} />
          <input type="hidden" name="userId" value={user.id} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="hud-label">Пакет</span>
            <select
              name="pack"
              className="rounded-lg border border-hair bg-surface-2 px-3 py-2 text-sm"
            >
              {PACK_IDS.map((id) => (
                <option key={id} value={id}>
                  {PACKS[id].nameBg} ({id})
                </option>
              ))}
            </select>
          </label>
          <ReasonInput placeholder="напр. компенсация за проваления изпит" />
          <button type="submit" className="btn-accent">
            Дай пакет (promo)
          </button>
        </form>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Дадените пакети се записват с provider „promo“, никога „stripe“:
          колоната provider е това, което разделя платения достъп от подарения,
          и подарък, представен за покупка, изкривява всяка сметка за приходи
          завинаги.
        </p>
      </Panel>

      {/* ---- money -------------------------------------------------------- */}
      <Panel title="Плащания">
        {payments.length === 0 ? (
          <Empty>Няма нито едно плащане.</Empty>
        ) : (
          <Rows>
            {payments.map((p) => (
              <PaymentRow key={p.id} row={p} />
            ))}
          </Rows>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Плащанията не се редактират и не се трият оттук. Отнемането на достъп
          маха разрешението, не разписката — счетоводният запис трябва да
          преживее и акаунта (българското счетоводно законодателство).
        </p>
      </Panel>

      {/* ---- exams -------------------------------------------------------- */}
      <Panel title="Пробни изпити">
        {attempts.length === 0 ? (
          <Empty>Няма нито един опит.</Empty>
        ) : (
          <Rows>
            {attempts.map((a) => (
              <AttemptRow key={a.id} row={a} email={user.email} userId={user.id} />
            ))}
          </Rows>
        )}
      </Panel>

      {/* ---- tutor spend --------------------------------------------------- */}
      <Panel title="AI Учител — разход">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Field label="Разговори" value={String(tutor.threads)} />
          <Field label="Въпроси" value={String(tutor.questions)} />
          <Field label="Токени вх." value={tutor.tokensIn.toLocaleString("bg-BG")} />
          <Field label="Токени изх." value={tutor.tokensOut.toLocaleString("bg-BG")} />
          <Field label="Разход" value={fmtMicroUsd(tutor.costMicroUsd)} />
        </dl>
      </Panel>

      {/* ---- the ledger ---------------------------------------------------- */}
      <Panel title="Какво е правила поддръжката">
        {history.length === 0 ? (
          <Empty>Никой не е пипал този акаунт.</Empty>
        ) : (
          <Rows>
            {history.map((h) => (
              <ActionRow key={h.id} row={h} />
            ))}
          </Rows>
        )}
      </Panel>
    </div>
  );
}

function EntitlementRow({
  row,
  email,
  userId,
}: {
  row: AdminEntitlementRow;
  email: string;
  userId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="text-sm font-semibold">{row.pack}</span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
          row.active
            ? "bg-success/15 text-success"
            : "border border-hair text-muted"
        }`}
      >
        {row.active ? "активен" : "изтекъл"}
      </span>
      <span className="font-mono text-xs text-muted">
        {row.provider ?? "—"}
        {row.providerRef ? ` · ${row.providerRef}` : ""}
      </span>
      <span className="text-xs text-muted">
        {fmtDate(row.purchasedAt)} → {row.expiresAt ? fmtDate(row.expiresAt) : "безсрочен"}
      </span>
      <form
        action={revokeEntitlementAction}
        className="ml-auto flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="entitlementId" value={row.id} />
        <ReasonInput placeholder="напр. chargeback" compact />
        <button type="submit" className="btn-ghost px-4 py-2 text-xs">
          Отнеми
        </button>
      </form>
    </div>
  );
}

function PaymentRow({ row }: { row: AdminPaymentRow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="metric text-sm">{fmtMoney(row.amountCents, row.currency)}</span>
      <span className="text-sm font-semibold">{row.pack}</span>
      <span className="text-xs font-bold uppercase tracking-wide text-muted">
        {row.status}
      </span>
      {/* A test-mode payment is not revenue, and looks identical without this. */}
      {row.livemode ? null : (
        <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-bold text-warning">
          TEST MODE
        </span>
      )}
      <span className="font-mono text-xs text-muted">{row.stripeSessionId}</span>
      <span className="ml-auto text-xs text-muted">{fmtDate(row.createdAt)}</span>
    </div>
  );
}

function AttemptRow({
  row,
  email,
  userId,
}: {
  row: AdminExamAttemptRow;
  email: string;
  userId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="text-xs text-muted">{fmtDate(row.startedAt)}</span>
      <span className="metric text-sm">
        {row.score === null ? "— т." : `${row.score}/${row.maxScore} т.`}
      </span>
      <span className="text-xs font-bold uppercase tracking-wide text-muted">
        {ATTEMPT_STATUS_BG[row.status]}
      </span>
      <span className="font-mono text-xs text-muted">{row.id}</span>
      {/* Only unfinished attempts get the button. A graded exam is the
          student's record and the module refuses to delete one anyway — this
          is the same rule, said before the click instead of after it. */}
      {row.finishedAt === null ? (
        <form
          action={deleteAttemptAction}
          className="ml-auto flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="attemptId" value={row.id} />
          <ReasonInput placeholder="напр. заклещен от петък" compact />
          <button type="submit" className="btn-ghost px-4 py-2 text-xs">
            Изтрий опита
          </button>
        </form>
      ) : null}
    </div>
  );
}

const ATTEMPT_STATUS_BG: Record<AdminExamAttemptRow["status"], string> = {
  "in-progress": "тече",
  expired: "изтекъл",
  completed: "завършен",
};

function ActionRow({ row }: { row: AdminActionRow }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
      <span className="text-xs text-muted">{fmtDate(row.createdAt)}</span>
      <span className="text-sm font-bold">{row.action}</span>
      <span className="text-sm text-muted">{row.actorEmail}</span>
      <span className="w-full text-sm">„{row.reason}“</span>
      {row.targetRef ? (
        <span className="font-mono text-xs text-muted">{row.targetRef}</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="hud-panel p-5 sm:p-6">
      <div className="panel-head panel-head-bleed">
        <h2 className="font-display text-base font-extrabold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-hair rounded-xl border border-hair">
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="hud-label">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : "text-sm font-semibold"}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The reason box. `required` and `minLength` are the browser's half of the
 * rule; the module enforces the same thing server-side, because a form is not
 * the only thing that can post to a server action.
 */
function ReasonInput({
  placeholder,
  compact = false,
}: {
  placeholder: string;
  compact?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${compact ? "" : "min-w-64 flex-1"}`}>
      <span className="hud-label">Причина</span>
      <input
        type="text"
        name="reason"
        required
        minLength={ADMIN_REASON_MIN}
        placeholder={placeholder}
        className="rounded-lg border border-hair bg-surface-2 px-3 py-2 text-sm"
      />
    </label>
  );
}

function ActionForm({
  action,
  email,
  userId,
  label,
  reasonPlaceholder,
}: {
  action: (formData: FormData) => Promise<void>;
  email: string;
  userId: string;
  label: string;
  reasonPlaceholder: string;
}) {
  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="userId" value={userId} />
      <ReasonInput placeholder={reasonPlaceholder} />
      <button type="submit" className="btn-accent">
        {label}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat("bg-BG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Sofia",
});

const fmtDate = (d: Date) => dateFmt.format(d);

function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("bg-BG", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    // Stripe reported something Intl does not know — show the raw truth rather
    // than throwing inside a support screen.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Model spend is booked in micro-USD; four decimals is where it stops lying. */
function fmtMicroUsd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}
