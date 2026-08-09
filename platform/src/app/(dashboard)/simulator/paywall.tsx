import Link from "next/link";
import {
  FREE_DAILY_PRACTICE_LIMIT,
  FREE_MOCK_EXAM_LIMIT,
  formatPackPrice,
  PACKS,
} from "@/modules/payments";

/**
 * What a signed-in student without the „Изпит + Симулатор" pack sees instead
 * of the lesson-select screen (audit C-3).
 *
 * Two rules shape it:
 *  - It is an invitation, not a locked door. A 17-year-old who lands here
 *    should learn what the simulator IS and how much of the product stays
 *    free forever — a bare „нямаш достъп" would read as a bug and lose a
 *    student who is otherwise practising happily.
 *  - It carries no lesson data. The counts are sizes, not content: a free
 *    account never receives the catalog, the routes or the scenario specs,
 *    because the page returns this screen BEFORE loading any of them.
 *
 * Presentation only — the access decision lives in access.ts.
 */
export function SimulatorPaywall({
  lessonCount,
  scenarioCount,
}: {
  /** Number of shipped driving lessons (incl. полигон + the exam route). */
  lessonCount: number;
  /** Number of shipped scenario templates in „Сценарии". */
  scenarioCount: number;
}) {
  const pack = PACKS.premium_sim;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-8">
      <header className="text-center">
        <p className="text-4xl" aria-hidden>
          🚗
        </p>
        <h1 className="mt-3 text-2xl font-black sm:text-3xl">
          Шофьорският симулатор те чака
        </h1>
        <p className="mt-2 text-sm text-muted">
          Караш по истинската улична мрежа на Студентски град, а инструкторът в
          колата ти казва точно какво сгреши и защо — с члена от закона.
        </p>
      </header>

      <section aria-labelledby="sim-paywall-unlock" className="card p-5 sm:p-6">
        <h2 id="sim-paywall-unlock" className="text-base font-extrabold">
          Какво отключва „{pack.nameBg}“
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          <li>
            <strong>{lessonCount} учебни маршрута</strong> — от площадката до
            изпитния маршрут, с оценяване в реално време.
          </li>
          <li>
            <strong>{scenarioCount} сценария</strong> по нива: кръгово,
            предимство, пешеходци, паркиране — карай ги, докато станат рефлекс.
          </li>
          <li>
            {/* „колко точки струва на изпита" — the one unqualified „точки"
                left in the guarded directories once the check learned to read
                the word as well as the abbreviation. On a sales page, before
                the student has driven anything, „точки" with no scale is the
                founder's own misreading offered pre-emptively: it is the
                PRACTICAL sheet's наказателни точки (Наредба № 38, приложение
                № 5, т. 10), not the licence. */}
            <strong>Разбор след всяко каране</strong>: къде точно сгреши, колко
            наказателни точки струва на изпита и какво да направиш следващия
            път.
          </li>
          <li>
            <strong>Връзка с теорията</strong>: сгрешен въпрос → същата
            ситуация зад волана, с едно кликване.
          </li>
        </ul>

        <div className="mt-5 flex flex-col items-center gap-2">
          <Link href="/pricing?status=sim-locked" className="btn-accent w-full sm:w-auto">
            Виж пакета — {formatPackPrice(pack.priceEurCents)} еднократно
          </Link>
          <p className="text-xs text-muted">
            Еднократно плащане за {pack.accessMonths} месеца. Без абонамент, без
            автоматично подновяване.
          </p>
        </div>
      </section>

      {/* Честно: какво имаш и БЕЗ пакет — този екран не е задънена улица. */}
      <section aria-labelledby="sim-paywall-free" className="card p-5 sm:p-6">
        <h2 id="sim-paywall-free" className="text-base font-extrabold">
          А дотогава — безплатно и без срок
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
          <li>
            {FREE_DAILY_PRACTICE_LIMIT} въпроса на ден с пълни обяснения защо
            отговорът е грешен.
          </li>
          <li>
            {FREE_MOCK_EXAM_LIMIT === 1
              ? "Един пробен изпит"
              : `${FREE_MOCK_EXAM_LIMIT} пробни изпита`}{" "}
            в официалния формат — 45 въпроса, 40 минути.
          </li>
          <li>Оценка на готовността ти за изпит.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/theory" className="btn-accent">
            Към упражненията
          </Link>
          <Link href="/dashboard" className="btn-ghost">
            Начало
          </Link>
        </div>
      </section>
    </div>
  );
}
