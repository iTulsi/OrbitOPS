import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import CinematicGlobe from '../components/CinematicGlobe';

const BOOT_DURATION = 2400;

function getTrackedObjects(stats = {}) {
    return (
        stats.total_objects ??
        stats.tracked_objects ??
        stats.objects ??
        stats.total ??
        0
    );
}

function formatCount(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
        return '—';
    }

    return new Intl.NumberFormat('en-US').format(number);
}

function formatUpdateTime(timestamp) {
    if (!timestamp) return 'AWAITING FEED';

    const milliseconds =
        Number(timestamp) > 10_000_000_000
            ? Number(timestamp)
            : Number(timestamp) * 1000;

    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) return 'AWAITING FEED';

    return date.toLocaleTimeString('en-GB', {
        hour12: false,
        timeZone: 'UTC'
    });
}

export default function Home({
    connected = false,
    stats = {},
    lastUpdated = 0
}) {
    const navigate = useNavigate();
    const reduceMotion = useReducedMotion();
    const [progress, setProgress] = useState(reduceMotion ? 100 : 0);

    useEffect(() => {
        if (reduceMotion) return undefined;

        let animationFrame;
        const startedAt = performance.now();

        const updateProgress = (currentTime) => {
            const elapsed = currentTime - startedAt;
            const nextProgress = Math.min(
                100,
                Math.round((elapsed / BOOT_DURATION) * 100)
            );

            setProgress(nextProgress);

            if (nextProgress < 100) {
                animationFrame = requestAnimationFrame(updateProgress);
            }
        };

        animationFrame = requestAnimationFrame(updateProgress);

        return () => cancelAnimationFrame(animationFrame);
    }, [reduceMotion]);

    const ready = progress >= 100;

    useEffect(() => {
        const handleKeyboard = (event) => {
            if (event.key === 'Enter' && ready) {
                navigate('/overview');
            }
        };

        window.addEventListener('keydown', handleKeyboard);

        return () => {
            window.removeEventListener('keydown', handleKeyboard);
        };
    }, [navigate, ready]);

    const bootMessage = useMemo(() => {
        if (progress < 24) return 'INITIALIZING ORBITAL CORE';
        if (progress < 48) return 'CONNECTING TO CELESTRAK';
        if (progress < 72) return 'SYNCHRONIZING TRACKED OBJECTS';
        if (progress < 100) return 'ESTABLISHING SECURE SESSION';
        return 'MISSION CONTROL READY';
    }, [progress]);

    const trackedObjects = formatCount(getTrackedObjects(stats));
    const updatedAt = formatUpdateTime(lastUpdated);

    return (
        <main className="orbit-entry">
            <div className="orbit-entry__scene" aria-hidden="true">
                <CinematicGlobe />
            </div>

            <div className="orbit-entry__grid" aria-hidden="true" />
            <div className="orbit-entry__vignette" aria-hidden="true" />
            <div className="orbit-entry__scanline" aria-hidden="true" />

            <svg
                className="orbit-entry__trajectory orbit-entry__trajectory--one"
                viewBox="0 0 1600 900"
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <path
                    d="M-120 645 C 220 350, 520 720, 875 380 S 1400 165, 1730 430"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                />

                <circle r="5" fill="#ff4338">
                    <animateMotion
                        dur="8s"
                        repeatCount="indefinite"
                        path="M-120 645 C 220 350, 520 720, 875 380 S 1400 165, 1730 430"
                    />
                </circle>
            </svg>

            <svg
                className="orbit-entry__trajectory orbit-entry__trajectory--two"
                viewBox="0 0 1600 900"
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <path
                    d="M80 220 C 390 80, 620 250, 790 515 S 1270 865, 1600 590"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                />

                <circle r="4" fill="#c8ced5">
                    <animateMotion
                        dur="11s"
                        repeatCount="indefinite"
                        path="M80 220 C 390 80, 620 250, 790 515 S 1270 865, 1600 590"
                    />
                </circle>
            </svg>

            <motion.header
                className="orbit-entry__header"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.2 }}
            >
                <div className="orbit-entry__status-group">
                    <span className="orbit-entry__live-dot" />
                    <div>
                        <p>LIVE DATA FEED</p>
                        <span>{connected ? 'UPLINK STABLE' : 'CONNECTING'}</span>
                    </div>
                </div>

                <div className="orbit-entry__time">
                    <p>UTC SYSTEM</p>
                    <span>{updatedAt}</span>
                </div>
            </motion.header>

            <aside className="orbit-entry__panel orbit-entry__panel--left">
                <span className="orbit-entry__corner orbit-entry__corner--tl" />
                <span className="orbit-entry__corner orbit-entry__corner--br" />

                <p className="orbit-entry__panel-label">ACTIVE TRACKS</p>

                <dl>
                    <div>
                        <dt>OBJECTS</dt>
                        <dd>{trackedObjects}</dd>
                    </div>

                    <div>
                        <dt>NETWORK</dt>
                        <dd>{connected ? 'ONLINE' : 'SYNCING'}</dd>
                    </div>

                    <div>
                        <dt>SOURCE</dt>
                        <dd>CELESTRAK</dd>
                    </div>
                </dl>
            </aside>

            <aside className="orbit-entry__panel orbit-entry__panel--right">
                <span className="orbit-entry__corner orbit-entry__corner--tr" />
                <span className="orbit-entry__corner orbit-entry__corner--bl" />

                <p className="orbit-entry__panel-label">SYSTEM STATUS</p>

                <dl>
                    <div>
                        <dt>DATA PIPELINE</dt>
                        <dd className={connected ? 'is-online' : ''}>
                            {connected ? 'ACTIVE' : 'STANDBY'}
                        </dd>
                    </div>

                    <div>
                        <dt>THREAT ENGINE</dt>
                        <dd>MONITORING</dd>
                    </div>

                    <div>
                        <dt>MISSION MODE</dt>
                        <dd>REAL TIME</dd>
                    </div>
                </dl>
            </aside>

            <section className="orbit-entry__identity">
                <motion.div
                    className="orbit-entry__eyebrow"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55, duration: 0.65 }}
                >
                    ORBITAL INTELLIGENCE PLATFORM
                </motion.div>

                <motion.h1
                    initial={{
                        opacity: 0,
                        letterSpacing: '0.78em',
                        filter: 'blur(14px)',
                        scale: 0.92
                    }}
                    animate={{
                        opacity: 1,
                        letterSpacing: '0.25em',
                        filter: 'blur(0px)',
                        scale: 1
                    }}
                    transition={{
                        duration: 1.55,
                        delay: 0.2,
                        ease: [0.16, 1, 0.3, 1]
                    }}
                >
                    ORBITOPS
                </motion.h1>

                <motion.p
                    className="orbit-entry__subtitle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.15, duration: 0.8 }}
                >
                    SPACE SITUATIONAL AWARENESS
                </motion.p>

                <motion.div
                    className="orbit-entry__action"
                    initial={{ opacity: 0, y: 18 }}
                    animate={{
                        opacity: ready ? 1 : 0.44,
                        y: ready ? 0 : 18
                    }}
                    transition={{ duration: 0.5 }}
                >
                    <span className="orbit-entry__action-label">
                        INITIATE SECURE SESSION
                    </span>

                    <button
                        type="button"
                        disabled={!ready}
                        onClick={() => navigate('/overview')}
                    >
                        <span>ENTER ORBIT</span>
                        <span aria-hidden="true">→</span>
                    </button>

                    <small>
                        {ready
                            ? 'PRESS ENTER OR SELECT TO CONTINUE'
                            : 'MISSION SYSTEMS INITIALIZING'}
                    </small>
                </motion.div>
            </section>

            <footer className="orbit-entry__footer">
                <div className="orbit-entry__boot">
                    <div className="orbit-entry__boot-copy">
                        <span>{bootMessage}</span>
                        <strong>{progress}%</strong>
                    </div>

                    <div
                        className="orbit-entry__progress"
                        aria-label={`System initialization ${progress}%`}
                    >
                        <span style={{ width: `${progress}%` }} />
                    </div>
                </div>

                <div className="orbit-entry__footer-status">
                    <span className={connected ? 'is-online' : ''}>
                        {connected ? 'ALL SYSTEMS OPERATIONAL' : 'UPLINK PENDING'}
                    </span>
                </div>
            </footer>
        </main>
    );
}
