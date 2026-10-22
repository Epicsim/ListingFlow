"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** Content is visible without JavaScript; only offscreen content is prepared
 * for a one-time reveal. Keyboard focus and reduced motion always expose it. */
export function LandingReveal({ children, className = "", delay = 0 }: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        element.dataset.reveal = "visible";
        observer.disconnect();
      }
    }, { threshold: 0.1 });

    element.dataset.reveal = "pending";
    observer.observe(element);
    return () => {
      observer.disconnect();
      delete element.dataset.reveal;
    };
  }, []);

  return (
    <div ref={ref} className={`landing-reveal ${className}`} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}
