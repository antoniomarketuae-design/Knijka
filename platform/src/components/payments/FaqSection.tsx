import { PACK_ACCESS_MONTHS } from "@/modules/payments";

interface FaqItem {
  questionBg: string;
  answerBg: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    questionBg: "Това абонамент ли е?",
    answerBg:
      "Не. Плащаш веднъж и толкова — без автоматично подновяване, без скрити такси, без запазена карта. Никога няма да те таксуваме втори път.",
  },
  {
    questionBg: "Колко време важи пакетът?",
    answerBg: `${PACK_ACCESS_MONTHS} месеца от деня на покупката — повече от типичния курс в автошкола, така че покрива цялата ти подготовка до изпита.`,
  },
  {
    questionBg: `Какво става след ${PACK_ACCESS_MONTHS}-те месеца?`,
    answerBg:
      "Достъпът до платените функции изтича, но прогресът ти остава запазен. Ако все още ти трябва, купуваш нов пакет — по твое решение, не автоматично.",
  },
  {
    questionBg: "Как се плаща и в каква валута?",
    answerBg:
      "С банкова карта през Stripe — една от най-сигурните платежни платформи в света. Цените са в евро, официалната валута на България от 1 януари 2026 г. Не съхраняваме данни от картата ти.",
  },
  {
    questionBg: "Симулаторът включен ли е в цената?",
    answerBg:
      "Пакетът „Изпит + Симулатор“ включва пълен достъп до шофьорския симулатор, без доплащане, докато пакетът ти е активен.",
  },
];

/**
 * Кратки, честни отговори — без дребен шрифт.
 *
 * Deliberately NOT an accordion. Five short answers about money are the part a
 * paying parent came to read, and hiding them behind five clicks is how a
 * pricing page looks like it has something to hide. They are all open, and the
 * numbered index is what makes the block scannable instead.
 */
export function FaqSection() {
  return (
    <section aria-labelledby="pricing-faq-title" className="flex flex-col gap-3">
      <h2 id="pricing-faq-title" className="text-base font-extrabold">
        Чести въпроси
      </h2>
      <dl className="flex flex-col gap-2">
        {/* `dl > div` may contain only dt/dd, so the index lives INSIDE the dt
            (aria-hidden — "01" is a visual anchor, not part of the question). */}
        {FAQ_ITEMS.map((item, i) => (
          <div key={item.questionBg} className="panel px-4 py-3.5 sm:px-5 sm:py-4">
            <dt className="flex items-baseline gap-3 text-sm font-bold">
              <span aria-hidden className="hud-label tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{item.questionBg}</span>
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted">
              {item.answerBg}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
