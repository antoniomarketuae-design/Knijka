import { IconCheck } from "@/components/icons";
import {
  FREE_DAILY_PRACTICE_LIMIT,
  FREE_MOCK_EXAM_LIMIT,
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

/** Честен тон: казваме точно какво има безплатно и какво отключват пакетите. */
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
    featureBg: "AI Учител — лични обяснения на грешките",
    free: text("кратък пробен достъп"),
    core: yes,
    premium: yes,
  },
  {
    featureBg: "Оценка на готовността за изпит",
    free: no,
    core: yes,
    premium: yes,
  },
  {
    featureBg: "Шофьорски симулатор (при пускането му)",
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

/** Free vs packs — the honest overview above the FAQ. */
export function ComparisonTable() {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <caption className="visually-hidden">
          Сравнение между безплатния достъп и платените пакети
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-3 text-sm font-extrabold">
              Какво получаваш
            </th>
            <th scope="col" className="px-4 py-3 text-center text-sm font-extrabold">
              Безплатно
            </th>
            <th scope="col" className="px-4 py-3 text-center text-sm font-extrabold">
              {PACKS.core.nameBg}
            </th>
            <th scope="col" className="px-4 py-3 text-center text-sm font-extrabold text-accent">
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
              <th scope="row" className="px-4 py-3 text-sm font-semibold">
                {row.featureBg}
              </th>
              <td className="px-4 py-3 text-center text-muted">
                <CellContent cell={row.free} />
              </td>
              <td className="px-4 py-3 text-center">
                <CellContent cell={row.core} />
              </td>
              <td className="px-4 py-3 text-center">
                <CellContent cell={row.premium} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
