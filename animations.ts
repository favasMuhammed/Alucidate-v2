import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Used on every list/grid that mounts
export const staggerReveal = (
    selector: string,
    parent?: Element | null
) => {
    gsap.fromTo(
        parent ? parent.querySelectorAll(selector) : selector,
        { opacity: 0, y: 20 },
        {
            opacity: 1,
            y: 0,
            duration: 0.45,
            stagger: 0.055,
            ease: 'power3.out',
            clearProps: 'transform',
        }
    );
};

// Mind map node entrance
export const nodeReveal = (el: Element, delay: number) => {
    gsap.fromTo(el,
        { opacity: 0, x: -16, scale: 0.95 },
        {
            opacity: 1, x: 0, scale: 1, duration: 0.4,
            delay, ease: 'power3.out', clearProps: 'transform'
        }
    );
};

// SVG edge draw-on
export const drawEdge = (path: SVGPathElement, delay: number) => {
    const length = path.getTotalLength();
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
    gsap.to(path, {
        strokeDashoffset: 0,
        duration: 0.5,
        delay,
        ease: 'power2.inOut',
    });
};

// Counter tick-up (for stats like question count)
export const countUp = (el: Element, target: number) => {
    gsap.from({ val: 0 }, {
        val: target, duration: 0.8, ease: 'power2.out',
        onUpdate: function () {
            el.textContent = Math.round(this.targets()[0].val).toString();
        }
    });
};
