import { notFound } from "next/navigation";
import { MicroQuizDevClient } from "./micro-quiz-client";

/**
 * L1 dev harness — DEV BUILDS ONLY. Mounts the REAL <MicroQuizOverlay> over
 * the REAL bank shape, so the in-drive quiz can be looked at without driving a
 * lesson to a crossing and waiting for the trigger.
 *
 * It exists because L1 shipped: the sim's copy of the question bank dropped
 * `media`, and the founder was asked «Кой от показаните знаци ПРЕДУПРЕЖДАВА…»
 * over four captions reading „Знак 1 / Знак 2 / Знак 3 / Знак 4". Nothing in
 * the test suite could see that, because nothing rendered it. This route is
 * how the next person looks first. 404s in production.
 *
 * `?state=answered` shows the post-check state (explanation + law chips).
 */
export default function MicroQuizDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MicroQuizDevClient />;
}
