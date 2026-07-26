import { IconCheck } from "@/components/icons";
import {
  FREE_DAILY_PRACTICE_LIMIT,
  FREE_MOCK_EXAM_LIMIT,
  FREE_TUTOR_LIFETIME_MESSAGES,
  PACKS,
} from "@/modules/payments";

type Cell = { kind: "yes" } | { kind: "no" } | { kind: "text"; text: string };

interface Row {
  featureBg: string;
  free: Cell;
  core: Cell;
  premium: Cell;
}

const yes: Cell = { kind: "yes" };
const no: Cell = { kind: "no" };
const text = (t: string): Cell => ({ kind: "text", text: t });

/**
 * Честен тон: казваме точно какво има безплатно и какво отключват пакетите.
 *
 * ПРАВИЛО (одит C-3): всяка платена клетка тук трябва да има гейт зад себе си
 * в modules/payments/quota.ts. Числата идват от същите константи, които гейтът
 * прилага — така редът не може да лъже, дори когато лимитът се промени.
 */
const ROWS: Row[] = [
  {
    featureBg: "Практика с въпроси и обяснения",
    free: text(`до ${FREE_DAILY_PRACTICE_LIMIT} въпроса на ден`),
    core: text("неограничена"),
    premium: text("неограничена"),
  },
  {
    featureBg: "Пробни изпити (официален формат, 45 въпроса / 40 мин)",
    free: text(
      FREE_MOCK_EXAM_LIMIT === 1
        ? "1 пробен изпит"
        : `${FREE_MOCK_EXAM_LIMIT} пробни изпита`,
    ),
    core: text("неограничени"),
    premium: text("неограничени"),
  },
  {
    // Гейт: checkTutorQuota — доживотен пробен лимит, не дневен (вж. quota.ts).
    featureBg: "AI Учител — лични обяснения на грешките",
    free: text(
      FREE_TUTOR_LIFETIME_MESSAGES === 1
        ? "1 въпрос за проба"
        : `${FREE_TUTOR_LIFETIME_MESSAGES} въпроса за проба`,
    ),
    core: yes,
    premium: yes,
  },
  {
    // Реалност днес: пръстенът „Готовност за изпит" се показва на всеки акаунт
    // без entitlement проверка — таблицата казва същото. Затова и не стои като
    // предимство в bullet-ите на пакета (packs.ts).
    featureBg: "Оценка на готовността за изпит",
    free: yes,
    core: yes,
    premium: yes,
  },
  {
    // Гейт: requireEntitlementForSimulator (hasPremium) — приложен на
    // /simulator страницата И на двата server action-а (simulator/access.ts).
    featureBg: "Шофьорски симулатор",
    free: no,
    core: no,
    premium: yes,
  },
];

function CellContent({ cell }: { cell: Cell }) {
  if (cell.kind === "yes") {
    return (
      <>
        <IconCheck className="mx-auto h-5 w-5 text-success" aria-hidden />
        <span className="visually-hidden">включено</span>
      </>
    );
  }
  if (cell.kind === "no") {
    return (
      <>
        <span aria-hidden className="text-muted">
          —
        </span>
        <span className="visually-hidden">не е включено</span>
      </>
    );
  }
  return <span className="text-sm font-semibold">{cell.text}</span>;
}

/**
 * Free vs packs — the honest overview above the FAQ.
 *
 * The column heads are `.hud-label` (dim, tracked-out mono) rather than bold
 * body text: they are captions, and letting them shout puts the contrast in
 * the header row instead of in the answers, which is the row a reader is
 * actually scanning. Same ratio the cluster's readouts use.
 *
 * The table scrolls inside its own box (`overflow-x-auto` + a min width) so
 * four columns on a 375px Android never make the PAGE scroll sideways.
 *
 * `relative` is load-bearing, not decoration. The cells contain
 * `.visually-hidden` spans ("включено" / "не е включено") and that class is
 * `position: absolute` — with no positioned ancestor they resolved against the
 * initial containing block, i.e. at their unscrolled x of ~525px, which made
 * the whole /pricing DOCUMENT 150px wider than a phone screen. The table was
 * scrolling correctly the entire time; it was the screen-reader text that
 * escaped the box. Containing block here, and the overflow goes back inside.
 */
export function ComparisonTable() {
  return (
    <div className="panel relative overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <caption className="visually-hidden">
          Сравнение между безплатния достъп и платените пакети
        </caption>
        <thead>
          <tr className="border-b border-border-strong">
            <th scope="col" className="hud-label px-4 py-3 text-left">
              Какво получаваш
            </th>
            <th scope="col" className="hud-label px-4 py-3 text-center">
              Безплатно
            </th>
            <th scope="col" className="hud-label px-4 py-3 text-center">
              {PACKS.core.nameBg}
            </th>
            <th scope="col" className="hud-label px-4 py-3 text-center !text-accent">
              {PACKS.premium_sim.nameBg}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr
              key={row.featureBg}
              className={i < ROWS.length - 1 ? "border-b border-border" : ""}
            >
              <th scope="row" className="px-4 py-3.5 text-sm font-semibold leading-snug">
                {row.featureBg}
              </th>
              <td className="px-4 py-3.5 text-center text-muted">
                <CellContent cell={row.free} />
              </td>
              <td className="px-4 py-3.5 text-center">
                <CellContent cell={row.core} />
              </td>
              <td className="px-4 py-3.5 text-center">
                <CellContent cell={row.premium} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
