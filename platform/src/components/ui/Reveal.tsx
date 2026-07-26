"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks/clientEnv";

/**
 * Scroll-linked entrance. Fades and rises a block the first time it enters
 * the viewport, then stops observing it forever.
 *
 * THE FAILURE MODE IS THE DESIGN. A scroll reveal that hides content in CSS
 * and un-hides it in JS turns every hydration error, every blocked bundle
 * and every unsupported browser into a blank page. So the hidden state is
 * only ever written by the CLIENT, after mount: the server renders no
 * `data-reveal` attribute at all, and the matching CSS (globals.css §2)
 * keys entirely off that attribute. No JS ⇒ content is simply visible.
 *
 * THE FLASH IS ALSO THE DESIGN. Hiding an element that is already on screen
 * and then revealing it a frame later is a visible blink. The layout effect
 * therefore measures first: anything already in the viewport at mount jumps
 * straight to "shown" and is never hidden. Only off-screen blocks — which
 * nobody is looking at — get the hidden state. Above-the-fold content
 * should still prefer the `.enter` choreography (globals.css §1), which is
 * pure CSS and costs no JS at all; `Reveal` is for what comes after.
 *
 * Reduced motion short-circuits to "shown" here as well as in CSS. Belt and
 * braces is warranted: this is the one primitive that can hide content.
 */

/** useLayoutEffect warns when a client component is server-rendered; the
 *  measurement it does is meaningless there anyway. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type RevealTag = "div" | "section" | "article" | "li" | "figure";

interface RevealProps {
  children: ReactNode;
  /** Semantic element. Default "div". */
  as?: RevealTag;
  /**
   * Stagger, in ms, for siblings that should arrive in sequence. Keep it a
   * multiple of the system step (--stagger, 70ms) so a Reveal group and an
   * `.enter` group read as the same choreography.
   */
  delay?: number;
  className?: string;
}

/** Fire slightly INSIDE the viewport: an element that animates the instant
 *  its first pixel appears looks like it is chasing the scroll. */
const ROOT_MARGIN = "0px 0px -12% 0px";

export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  // "idle" = the server-shaped render: no attribute, therefore visible.
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");
  const reduce = usePrefersReducedMotion();

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;

    if (reduce || typeof IntersectionObserver === "undefined") {
      setState("shown");
      return;
    }

    const box = el.getBoundingClientRect();
    const alreadyVisible = box.top < window.innerHeight && box.bottom > 0;
    if (alreadyVisible) {
      setState("shown");
      return;
    }

    setState("hidden");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setState("shown");
        // Doc 64's cheap-wow rule: unobserve after firing. A page of live
        // observers keeps costing on every scroll frame for an animation
        // that can only ever happen once.
        observer.unobserve(el);
        observer.disconnect();
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduce]);

  return (
    <Tag
      // The closed tag union keeps this cast honest: every member is an
      // HTMLElement, and React has no shared ref type across intrinsic tags.
      ref={ref as React.Ref<never>}
      data-reveal={state === "idle" ? undefined : state}
      style={delay > 0 ? { ["--reveal-delay" as string]: `${delay}ms` } : undefined}
      className={className}
    >
      {children}
    </Tag>
  );
}
