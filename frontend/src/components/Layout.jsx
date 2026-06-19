import { useEffect, useState } from 'react';
import {
    NavLink,
    useLocation
} from 'react-router-dom';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    FileText,
    Globe2,
    LayoutDashboard,
    Menu,
    Satellite,
    X
} from 'lucide-react';
import {
    AnimatePresence,
    motion
} from 'framer-motion';

const navigation = [
    {
        label: 'Overview',
        path: '/overview',
        icon: LayoutDashboard
    },
    {
        label: 'Live Tracking',
        path: '/live-tracking',
        icon: Globe2
    },
    {
        label: 'Conjunctions',
        path: '/conjunctions',
        icon: AlertTriangle
    },
    {
        label: 'Analytics',
        path: '/analytics',
        icon: BarChart3
    },
    {
        label: 'Object Catalog',
        path: '/object-catalog',
        icon: Satellite
    },
    {
        label: 'Reports',
        path: '/reports',
        icon: FileText
    }
];

function formatUtcTime(date) {
    return date.toLocaleTimeString('en-GB', {
        hour12: false,
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

export default function Layout({
    children,
    connected = false
}) {
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [utcTime, setUtcTime] = useState(
        formatUtcTime(new Date())
    );

    useEffect(() => {
        const interval = window.setInterval(() => {
            setUtcTime(formatUtcTime(new Date()));
        }, 1000);

        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    return (
        <div className="command-shell">
            <header className="command-header">
                <NavLink
                    to="/"
                    className="command-brand"
                    aria-label="Return to OrbitOPS entrance"
                >
                    <span className="command-brand__mark">
                        <span />
                    </span>

                    <span className="command-brand__copy">
                        <strong>ORBITOPS</strong>
                        <small>ORBITAL INTELLIGENCE</small>
                    </span>
                </NavLink>

                <nav
                    className="command-navigation"
                    aria-label="Primary navigation"
                >
                    {navigation.map(item => {
                        const Icon = item.icon;

                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    [
                                        'command-navigation__item',
                                        isActive ? 'is-active' : ''
                                    ].join(' ')
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        {isActive && (
                                            <motion.span
                                                layoutId="active-command-route"
                                                className="command-navigation__active"
                                                transition={{
                                                    type: 'spring',
                                                    stiffness: 390,
                                                    damping: 32
                                                }}
                                            />
                                        )}

                                        <Icon
                                            size={14}
                                            strokeWidth={1.6}
                                        />

                                        <span>{item.label}</span>
                                    </>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="command-header__right">
                    <div
                        className={[
                            'command-connection',
                            connected ? 'is-connected' : ''
                        ].join(' ')}
                    >
                        <span className="command-connection__dot" />

                        <span>
                            {connected
                                ? 'TELEMETRY ONLINE'
                                : 'CONNECTING'}
                        </span>
                    </div>

                    <div className="command-clock">
                        <small>UTC</small>
                        <strong>{utcTime}</strong>
                    </div>

                    <button
                        type="button"
                        className="command-menu-button"
                        aria-label="Open navigation"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen(current => !current)}
                    >
                        {menuOpen ? (
                            <X size={19} />
                        ) : (
                            <Menu size={19} />
                        )}
                    </button>
                </div>
            </header>

            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        className="command-mobile-navigation"
                        initial={{
                            opacity: 0,
                            y: -12
                        }}
                        animate={{
                            opacity: 1,
                            y: 0
                        }}
                        exit={{
                            opacity: 0,
                            y: -12
                        }}
                    >
                        {navigation.map(item => {
                            const Icon = item.icon;

                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) =>
                                        [
                                            'command-mobile-navigation__item',
                                            isActive ? 'is-active' : ''
                                        ].join(' ')
                                    }
                                >
                                    <Icon size={17} />
                                    <span>{item.label}</span>
                                </NavLink>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="command-content">
                <motion.div
                    key={location.pathname}
                    className="command-route-transition"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                        duration: 0.35,
                        ease: [0.16, 1, 0.3, 1]
                    }}
                >
                    {children}
                </motion.div>
            </main>

            <footer className="command-footer">
                <div>
                    <Activity size={12} />
                    <span>
                        SPACE SITUATIONAL AWARENESS PLATFORM
                    </span>
                </div>

                <div>
                    <span>DATA SOURCE</span>
                    <strong>CELESTRAK + SGP4</strong>
                </div>
            </footer>
        </div>
    );
}
