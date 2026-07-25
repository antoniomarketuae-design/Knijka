import Link from "next/link";
import {
  formatPackPrice,
  FREE_TUTOR_LIFETIME_MESSAGES,
  PACKS,
} from "@/modules/payments";

/**
 * What a free student sees once the tutor trial is used up (audit C-3).
 *
 * The tone is the point: the student already had a real conversation with the
 * Учител, so this screen thanks them for it and names the cheaper pack — the
 * tutor is core, not premium, and sending someone to the €21.99 card when
 * €12.99 buys what they want would be a dark pattern. Everything that stays
 * free is repeated here, because the theory practice they came from still
 * explains every mistake with the law, tutor or no tutor.
 */
export function TutorPaywall() {
  const pack = PACKS.core;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 py-10">
      <div className="card p-8 text-center sm:p-10">
        <p className="text-4xl" aria-hidden>
          🤖
        </p>
        <h1 className="mt-4 text-2xl font-bold">
          Използва безплатните си {FREE_TUTOR_LIFETIME_MESSAGES} въпроса
        </h1>
        <p className="mt-3 text-sm opacity-80">
          Дотук Учителят ти отговори {FREE_TUTOR_LIFETIME_MESSAGES} пъти — с
          цитат от правилника всеки път. С пакет „{pack.nameBg}“ питаш колкото
          искаш, докато не ти стане ясно.
        </p>
        <p className="mt-2 text-sm opacity-80">
          Упражненията остават безплатни и продължават да обясняват всяка грешка
          с точния член от закона — Учителят е за въпросите, които обяснението
          не е покрило.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/pricing?status=tutor-limit" className="btn-accent">
            Виж пакетите — от {formatPackPrice(pack.priceEurCents)}
          </Link>
          <Link href="/theory" className="btn-ghost">
            Към упражненията
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * The countdown a free student sees ABOVE the chat while the trial is running.
 * Shown only to trial users — an owner never sees a counter, and a student who
 * does see one always knows exactly where they stand before they type.
 */
export function TutorTrialNotice({ remaining }: { remaining: number }) {
  return (
    <p
      role="status"
      className="card border-accent/50 px-4 py-3 text-sm font-semibold text-accent"
    >
      Безплатен достъп: остават{" "}
      {remaining === 1 ? "1 въпрос" : `${remaining} въпроса`} към Учителя.{" "}
      <Link href="/pricing" className="underline underline-offset-2">
        Виж пакетите
      </Link>{" "}
      за неограничени въпроси.
    </p>
  );
}
