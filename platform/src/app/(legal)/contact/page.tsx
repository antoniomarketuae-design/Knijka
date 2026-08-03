import type { Metadata } from "next";
import Link from "next/link";
import { ContactEmail } from "@/components/legal/ContactEmail";
import {
  KzldCard,
  LegalSection,
  OperatorCard,
  PageIntro,
} from "../legal-ui";

export const metadata: Metadata = {
  title: "Контакт — Книжка.AI",
  description:
    "Как да се свържеш с екипа на Книжка.AI — въпроси, проблеми, искания за лични данни и информация за жалби до КЗЛД.",
};

export default function ContactPage() {
  return (
    <article>
      <PageIntro
        title="Контакт"
        lead="Един имейл стига за всичко — въпрос за платформата, проблем с плащане, искане за личните ти данни или просто идея как да станем по-добри."
      />

      <LegalSection id="write-us" title="Пиши ни">
        <div className="card p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">
            Имейл за всички въпроси
          </p>
          {/* The hero treatment lives on the <p>; the anchor only adds the
              affordance, so the address keeps its size and weight whether it is
              a live mailto or still the placeholder. */}
          <p className="mt-2 text-xl font-extrabold text-accent">
            <ContactEmail className="underline-offset-4 hover:underline" />
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Отговаряме възможно най-бързо. На искания, свързани с лични данни
            (достъп, коригиране, изтриване и другите права по GDPR),
            отговаряме най-късно до един месец — пиши от имейла, с който е
            регистриран акаунтът, за да те разпознаем.
          </p>
        </div>
        <OperatorCard />
      </LegalSection>

      <LegalSection id="data-requests" title="Искания за лични данни">
        <p>
          Всички права, които имаш върху данните си, са описани в{" "}
          <Link
            href="/privacy#rights"
            className="font-semibold text-accent hover:text-accent-soft"
          >
            Политиката за поверителност
          </Link>
          . Достатъчно е да напишеш какво искаш със свои думи — например
          „искам да изтриете акаунта ми“ — без формуляри и без такси. Родител
          или настойник също може да пише от името на дете под 18 години.
        </p>
      </LegalSection>

      <LegalSection id="kzld" title="Жалба до надзорния орган">
        <p>
          Ако смяташ, че обработваме личните ти данни неправомерно и не сме
          решили проблема, имаш право на жалба до Комисията за защита на
          личните данни:
        </p>
        <KzldCard />
      </LegalSection>

      <LegalSection id="consumer" title="Потребителски спорове">
        <p>
          За спорове по покупка можеш да се обърнеш и към Комисията за защита
          на потребителите (
          <a
            href="https://kzp.bg"
            className="font-semibold text-accent hover:text-accent-soft"
          >
            kzp.bg
          </a>
          ). Подробности — в{" "}
          <Link
            href="/terms#law"
            className="font-semibold text-accent hover:text-accent-soft"
          >
            Условията за ползване
          </Link>
          .
        </p>
      </LegalSection>
    </article>
  );
}
