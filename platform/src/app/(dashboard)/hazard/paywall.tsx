import Link from "next/link";

/**
 * What a signed-in student without an active pack sees instead of the section.
 *
 * Two rules, both taken from simulator/paywall.tsx because they were right
 * there and they are right here:
 *  - It is an invitation, not a locked door. A bare „нямаш достъп" reads as a
 *    bug and loses a student who is otherwise practising happily.
 *  - It carries no content. No clip, no poster, no item title, no count that
 *    could be mistaken for one: the page returns this screen BEFORE a run is
 *    ever dealt, so a free account never receives anything from the item bank.
 *
 * NO PRICE IS WRITTEN HERE. Pricing is undecided (the numbers in packs.ts are
 * placeholders and /pricing itself prints no comparative claim), so the CTA
 * points at /pricing and lets the one page that owns prices say them. The
 * previous version of this argument — „струва по-малко от един учебен час" —
 * is exactly the kind of claim nothing in the codebase backs.
 *
 * THE PITCH IS THE HONEST ONE. It does not promise a better ДАИ result, because
 * hazard perception is not on the ДАИ exam and saying otherwise would be a lie
 * we could be held to. It promises the thing the evidence actually supports.
 */
export function HazardPaywall() {
  return (
    <div
      data-surface="cluster-band"
      className="grain relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-background px-5 py-8 text-foreground sm:px-8"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 hud-grid-fade" />
      <div aria-hidden className="pointer-events-none absolute inset-0 haze" />

      <div className="relative flex flex-col gap-6">
        <header>
          <p className="hud-label text-accent-2">Възприемане на опасности</p>
          <h1 className="mt-1.5 font-display text-2xl font-black tracking-tight sm:text-3xl">
            Частта, която не вади книжка — а те пази
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Гледаш кратък запис от реално каране и натискаш в момента, в който
            видиш, че се <em>задава</em> опасност — не когато вече е станала.
            След това ти показваме къде точно е бил признакът и колко време си
            имал.
          </p>
        </header>

        <section aria-labelledby="hz-paywall-why" className="panel rounded-xl p-4 sm:p-5">
          <h2 id="hz-paywall-why" className="text-base font-extrabold">
            Защо изобщо го правим
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-muted">
            <li>
              Този тест <strong className="text-foreground">не е част от изпита на ДАИ</strong>.
              Няма да ти донесе нито точка на теорията.
            </li>
            <li>
              Но от всичко, което се преподава на нови шофьори, точно това има
              най-силните доказателства, че намалява катастрофите през първата
              година зад волана. Затова го има в британския и в холандския изпит.
            </li>
            <li>
              Ние не продаваме само книжка. Затова го построихме въпреки че
              изпитът не го иска.
            </li>
          </ul>
        </section>

        <section aria-labelledby="hz-paywall-what" className="panel rounded-xl p-4 sm:p-5">
          <h2 id="hz-paywall-what" className="text-base font-extrabold">
            Какво получаваш
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <strong>Пълна тренировка</strong> — серия клипове наведнъж, както се
              прави сериозно, а не по един между другото.
            </li>
            <li>
              <strong>Разбор след всеки клип</strong>: каква беше опасността, по
              какво е личала преди да се случи, какво прави добрият шофьор — с
              члена от закона.
            </li>
            <li>
              <strong>Времева линия</strong>: къде спря клипът, къде щеше да е
              ударът и колко секунди преднина си си дал.
            </li>
            <li>
              <strong>История</strong> — виждаш дали преднината ти расте с
              времето. Това е числото, което значи нещо на пътя.
            </li>
          </ul>

          <div className="mt-5">
            <Link href="/pricing?status=hazard-locked" className="btn-accent w-full sm:w-auto">
              Виж пакетите
            </Link>
          </div>
        </section>

        {/* Честно: този екран не е задънена улица. */}
        <section aria-labelledby="hz-paywall-free" className="panel rounded-xl p-4 sm:p-5">
          <h2 id="hz-paywall-free" className="text-base font-extrabold">
            А дотогава
          </h2>
          <p className="mt-2 text-sm text-muted">
            Кратка версия на същата тренировка ще срещаш безплатно в симулатора и
            в уроците по теория. Пълната сесия с история е тук.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/theory" className="btn-ghost">
              Към теорията
            </Link>
            <Link href="/simulator" className="btn-ghost">
              Към симулатора
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
