import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Motion for the public landing page. The admin remains deliberately static. */
export function mountLandingMotion(root: HTMLElement) {
  const context = gsap.context(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const compactMotion = window.matchMedia("(max-width: 720px)").matches;
    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });

    intro
      .from(".header-brand-lockup", { autoAlpha: 0, y: -14, duration: 0.55 })
      .from(".app-header__top", { autoAlpha: 0, y: -12, duration: 0.5 }, "-=0.28")
      .from(".app-header__copy .eyebrow", { autoAlpha: 0, y: 12, duration: 0.4 }, "-=0.12")
      .from(".app-header__copy h1", { autoAlpha: 0, y: 28, duration: 0.75 }, "-=0.16")
      .from(".app-header__copy p", { autoAlpha: 0, y: 14, duration: 0.45 }, "-=0.38")
      .from(".hero-cta", { autoAlpha: 0, y: 12, duration: 0.4 }, "-=0.2")
      .from(".hero-hours", { autoAlpha: 0, y: 14, duration: 0.5 }, "-=0.22")
      .from(".hero-dish", { autoAlpha: 0, scale: 0.88, rotate: -15, duration: 1.05 }, "-=0.65")
      .from(".header-motion-note", { autoAlpha: 0, y: 12, duration: 0.45 }, "-=0.42");

    if (!compactMotion) {
      gsap.to(".hero-dish img", {
        scale: 1.055,
        ease: "none",
        scrollTrigger: {
          trigger: ".app-header",
          start: "top top",
          end: "bottom top",
          scrub: 0.7,
        },
      });
    }

    gsap.utils.toArray<HTMLElement>(".section-title, .category-list, .day-list, .visit-card").forEach((element) => {
      gsap.from(element, {
        autoAlpha: 0,
        y: compactMotion ? 16 : 24,
        duration: 0.65,
        ease: "power2.out",
        scrollTrigger: { trigger: element, start: "top 88%", once: true },
      });
    });

    gsap.from(".hours-row", {
      autoAlpha: 0,
      y: compactMotion ? 8 : 12,
      duration: 0.5,
      stagger: 0.055,
      ease: "power3.out",
      scrollTrigger: { trigger: ".hours-list", start: "top 92%", once: true },
    });

    gsap.from(".signature-card", {
      autoAlpha: 0,
      y: compactMotion ? 18 : 30,
      duration: 0.8,
      ease: "power2.out",
      scrollTrigger: { trigger: ".signature-card", start: "top 82%", once: true },
    });

    gsap.from(".team-story__copy, .team-story__gallery", {
      autoAlpha: 0,
      y: compactMotion ? 16 : 24,
      duration: 0.7,
      stagger: compactMotion ? 0 : 0.14,
      ease: "power2.out",
      scrollTrigger: { trigger: ".team-story", start: "top 82%", once: true },
    });
  }, root);

  return () => context.revert();
}

/** Rebind menu reveals when the day, category, or search results change. */
export function mountDishCardMotion(root: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const compactMotion = window.matchMedia("(max-width: 720px)").matches;
  const context = gsap.context(() => {
    gsap.utils.toArray<HTMLElement>(".dish-card").forEach((card, index) => {
      gsap.from(card, {
        autoAlpha: 0,
        y: compactMotion ? 14 : 22,
        duration: 0.55,
        delay: (index % 3) * 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: card, start: "top 91%", once: true },
      });
    });
  }, root);
  return () => context.revert();
}
