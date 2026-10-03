import { useEffect, useState } from "react";

/**
 * The section being read: the last of `ids` whose element has passed the top fifth of the viewport.
 * Drives the highlight in a page's contents, which would otherwise not say where in a long page you
 * are. Pass a stable array, such as a module-level constant: a new one re-attaches the listeners.
 */
export const useActiveSection = (ids: readonly string[]) => {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    // Read on scroll rather than through an IntersectionObserver: a jump from the contents can carry
    // a heading clean past any observed band without it ever registering as crossing.
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.2;
      const passed = elements.filter((element) => element.getBoundingClientRect().top <= line);
      setActive((passed.at(-1) ?? elements[0])?.id ?? ids[0]);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [ids]);

  return active;
};
