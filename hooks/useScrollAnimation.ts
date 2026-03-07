import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { RefObject } from "react";

gsap.registerPlugin(ScrollTrigger);

export function useFadeUp(
    ref: RefObject<HTMLElement>,
    options?: { delay?: number; stagger?: number }
) {
    useGSAP(() => {
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
            const targets = ref.current?.querySelectorAll("[data-animate]") ?? [ref.current];
            // GSAP animate from y: 50, opacity 0
            gsap.from(targets, {
                y: 40,
                opacity: 0,
                duration: 0.8,
                delay: options?.delay ?? 0,
                stagger: options?.stagger ?? 0.1,
                ease: "power2.out",
                scrollTrigger: {
                    trigger: ref.current,
                    start: "top 85%",
                },
            });
        });
    }, { scope: ref });
}

export function useParallax(ref: RefObject<HTMLElement>, speed = 0.4) {
    useGSAP(() => {
        const mm = gsap.matchMedia();
        mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
            gsap.to(ref.current, {
                yPercent: speed * 100,
                ease: "none",
                scrollTrigger: {
                    trigger: ref.current,
                    start: "top bottom",
                    end: "bottom top",
                    scrub: true,
                },
            });
        });
    }, { scope: ref });
}
