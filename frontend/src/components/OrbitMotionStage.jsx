import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

const SURFACE_SELECTOR = [
    '[data-orbit-card]',
    '.glass-card',
    'article',
    'section[class*="border"]',
    'aside[class*="border"]',
    'table',
    '.grid > div[class*="border"]',
    '.grid > section',
    '.grid > article',
    '.grid > aside',
    '[class*="space-y-"] > div[class*="border"]',
    '[class*="divide-y"] > div',
].join(',');

const CONTROL_SELECTOR = 'button, a, [role="button"], input, select, textarea';
const CHIP_SELECTOR = 'span[class*="border"], [data-orbit-chip]';
const MAX_REVEALS = 34;

function isVisible(element) {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
}

function isSurface(element, root) {
    if (!(element instanceof HTMLElement)) return false;
    if (element === root || element.closest('[data-orbit-motion-ignore]')) return false;
    if (element.matches(CONTROL_SELECTOR)) return false;
    if (!isVisible(element)) return false;

    const rect = element.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    if (rect.width < 112 || rect.height < 50) return false;
    if (style.position === 'fixed') return false;
    if (rect.width >= rootRect.width * 0.97 && rect.height >= rootRect.height * 0.9) return false;

    return true;
}

function surfaceOrder(left, right) {
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    const rowDelta = a.top - b.top;
    if (Math.abs(rowDelta) > 24) return rowDelta;
    return a.left - b.left;
}

function classifyAccent(element) {
    const classes = String(element.className || '');

    if (/(rose|red)-/.test(classes)) return 'rose';
    if (/(orange|amber|yellow)-/.test(classes)) return 'amber';
    if (/(violet|purple|fuchsia)-/.test(classes)) return 'violet';
    if (/(emerald|green|lime)-/.test(classes)) return 'emerald';
    if (/(blue|indigo)-/.test(classes)) return 'blue';
    return 'cyan';
}

function finishReveal(element) {
    element.classList.remove('orbit-reveal-in');
    element.dataset.orbitAnimated = 'true';
}

function reveal(element, index, reducedMotion) {
    const rect = element.getBoundingClientRect();
    const accent = classifyAccent(element);

    element.classList.add('orbit-surface');
    element.dataset.orbitAccent = accent;

    if (rect.width > 920 || rect.height > 560) {
        element.classList.add('orbit-surface-large');
    }

    if (reducedMotion || element.dataset.orbitAnimated === 'true') return;

    element.style.setProperty('--orbit-enter-delay', `${Math.min(index, 22) * 34}ms`);
    element.classList.remove('orbit-reveal-in');
    // Restart the animation when the same route is revisited.
    void element.offsetWidth;
    element.classList.add('orbit-reveal-in');
    element.addEventListener('animationend', () => finishReveal(element), { once: true });
}

function enhance(root, reducedMotion, onlyNew = false) {
    if (!root) return;

    const candidates = Array.from(root.querySelectorAll(SURFACE_SELECTOR))
        .filter((element) => isSurface(element, root))
        .filter((element) => !onlyNew || element.dataset.orbitEnhanced !== 'true')
        .sort(surfaceOrder)
        .slice(0, MAX_REVEALS);

    candidates.forEach((element, index) => {
        element.dataset.orbitEnhanced = 'true';
        reveal(element, index, reducedMotion);
    });

    root.querySelectorAll(CONTROL_SELECTOR).forEach((element) => {
        if (!(element instanceof HTMLElement)) return;
        if (element.closest('[data-orbit-motion-ignore]')) return;
        element.classList.add('orbit-control');
    });

    root.querySelectorAll(CHIP_SELECTOR).forEach((element) => {
        if (!(element instanceof HTMLElement) || !isVisible(element)) return;
        const rect = element.getBoundingClientRect();
        if (rect.height <= 46 && rect.width <= 260) {
            element.classList.add('orbit-chip');
        }
    });

    root.querySelectorAll('tbody tr').forEach((element) => {
        element.classList.add('orbit-table-row');
    });
}

export default function OrbitMotionStage({ children }) {
    const location = useLocation();
    const rootRef = useRef(null);
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return undefined;

        root.querySelectorAll('[data-orbit-animated="true"]').forEach((element) => {
            delete element.dataset.orbitAnimated;
        });

        let frameOne = 0;
        let frameTwo = 0;
        let debounceTimer = 0;

        frameOne = window.requestAnimationFrame(() => {
            frameTwo = window.requestAnimationFrame(() => {
                enhance(root, reduceMotion, false);
            });
        });

        const observer = new MutationObserver(() => {
            window.clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(() => enhance(root, reduceMotion, true), 70);
        });

        observer.observe(root, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(frameOne);
            window.cancelAnimationFrame(frameTwo);
            window.clearTimeout(debounceTimer);
        };
    }, [location.pathname, reduceMotion]);

    const duration = reduceMotion ? 0 : 0.32;

    return (
        <AnimatePresence mode="wait" initial>
            <motion.div
                key={location.pathname}
                ref={rootRef}
                className="orbit-motion-stage h-full min-h-0 w-full"
                initial={reduceMotion ? false : { opacity: 0, y: 9, scale: 0.997 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -5, scale: 0.998 }}
                transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
}
