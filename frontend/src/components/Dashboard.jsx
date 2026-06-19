import {
    useMemo,
    useState
} from 'react';
import { createPortal } from 'react-dom';
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    BarChart3,
    ChevronRight,
    Clock3,
    Crosshair,
    Database,
    Eye,
    FileText,
    Globe2,
    RefreshCw,
    Search,
    ShieldAlert,
    Satellite,
    X
} from 'lucide-react';
import {
    Link,
    useNavigate
} from 'react-router-dom';
import { motion } from 'framer-motion';

import OverviewGlobe from './overview/OverviewGlobe';

function numericValue(...values) {
    const value = values.find(
        candidate =>
            candidate !== undefined &&
            candidate !== null &&
            Number.isFinite(Number(candidate))
    );

    return value === undefined ? null : Number(value);
}

function normalizeRisk(value) {
    return String(value ?? 'LOW').toUpperCase();
}

function normalizeType(value) {
    return String(value ?? 'UNKNOWN')
        .replaceAll('_', ' ')
        .toUpperCase();
}

function normalizeObject(object, index) {
    const risk = normalizeRisk(
        object?.risk_level ??
        object?.risk ??
        object?.severity
    );

    const type = normalizeType(
        object?.type ??
        object?.object_type ??
        object?.classification
    );

    return {
        original: object,
        index,
        id:
            object?.id ??
            object?.norad_id ??
            object?.catalog_number ??
            object?.satnum ??
            `OBJECT-${index + 1}`,
        name:
            object?.name ??
            object?.object_name ??
            `TRACKED OBJECT ${index + 1}`,
        type,
        risk,
        altitude: numericValue(
            object?.altitude,
            object?.alt,
            object?.altitude_km
        ),
        latitude: numericValue(
            object?.latitude,
            object?.lat
        ),
        longitude: numericValue(
            object?.longitude,
            object?.lon,
            object?.lng
        ),
        inclination: numericValue(object?.inclination),
        period: numericValue(
            object?.period,
            object?.orbital_period
        ),
        velocity: numericValue(
            object?.velocity,
            object?.speed
        )
    };
}

function formatNumber(value) {
    if (!Number.isFinite(Number(value))) return '—';

    return new Intl.NumberFormat('en-US').format(
        Math.round(Number(value))
    );
}

function formatDecimal(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return '—';

    return Number(value).toFixed(digits);
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'AWAITING TELEMETRY';

    const numericTimestamp = Number(timestamp);

    const milliseconds =
        numericTimestamp > 10_000_000_000
            ? numericTimestamp
            : numericTimestamp * 1000;

    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
        return 'AWAITING TELEMETRY';
    }

    return date.toLocaleString('en-GB', {
        hour12: false,
        timeZone: 'UTC',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function isSatellite(type) {
    return (
        type.includes('SATELLITE') ||
        type.includes('PAYLOAD') ||
        type.includes('ACTIVE')
    );
}

function isDebris(type) {
    return (
        type.includes('DEBRIS') ||
        type.includes('ROCKET BODY') ||
        type.includes('ROCKETBODY')
    );
}

function riskPriority(risk) {
    if (risk === 'CRITICAL') return 4;
    if (risk === 'HIGH') return 3;
    if (risk === 'MEDIUM') return 2;
    return 1;
}

const featureLinks = [
    {
        title: 'Live Tracking',
        description: 'Inspect propagated positions and object paths.',
        path: '/live-tracking',
        icon: Globe2,
        marker: '01'
    },
    {
        title: 'Conjunction Monitor',
        description: 'Review elevated and high-risk encounters.',
        path: '/conjunctions',
        icon: ShieldAlert,
        marker: '02'
    },
    {
        title: 'Orbital Analytics',
        description: 'Analyse traffic distribution and orbital behaviour.',
        path: '/analytics',
        icon: BarChart3,
        marker: '03'
    },
    {
        title: 'Mission Reports',
        description: 'Open generated intelligence and exportable reports.',
        path: '/reports',
        icon: FileText,
        marker: '04'
    }
];

function Metric({
    label,
    value,
    detail,
    accent = false
}) {
    return (
        <div className="overview-metric">
            <div className="overview-metric__header">
                <span>{label}</span>

                {accent && (
                    <span className="overview-metric__pulse" />
                )}
            </div>

            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    );
}

function RiskBadge({ risk }) {
    return (
        <span
            className={[
                'risk-badge',
                `risk-badge--${risk.toLowerCase()}`
            ].join(' ')}
        >
            {risk}
        </span>
    );
}

function ObjectDrawer({
    object,
    lastUpdated,
    onClose
}) {
    if (!object) return null;

    return createPortal(
        <motion.div
            className="object-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.aside
                className="object-drawer"
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 50, opacity: 0 }}
                transition={{
                    duration: 0.35,
                    ease: [0.16, 1, 0.3, 1]
                }}
                onClick={event => event.stopPropagation()}
            >
                <header>
                    <div>
                        <span>SELECTED ORBITAL OBJECT</span>
                        <h2>{object.name}</h2>
                        <p>NORAD / ID {object.id}</p>
                    </div>

                    <button
                        type="button"
                        aria-label="Close object details"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </header>

                <div className="object-drawer__risk">
                    <span>RISK CLASSIFICATION</span>
                    <RiskBadge risk={object.risk} />
                </div>

                <dl className="object-drawer__grid">
                    <div>
                        <dt>TYPE</dt>
                        <dd>{object.type}</dd>
                    </div>

                    <div>
                        <dt>ALTITUDE</dt>
                        <dd>
                            {formatNumber(object.altitude)}
                            <small> KM</small>
                        </dd>
                    </div>

                    <div>
                        <dt>LATITUDE</dt>
                        <dd>
                            {formatDecimal(object.latitude)}
                            <small>°</small>
                        </dd>
                    </div>

                    <div>
                        <dt>LONGITUDE</dt>
                        <dd>
                            {formatDecimal(object.longitude)}
                            <small>°</small>
                        </dd>
                    </div>

                    <div>
                        <dt>INCLINATION</dt>
                        <dd>
                            {formatDecimal(object.inclination)}
                            <small>°</small>
                        </dd>
                    </div>

                    <div>
                        <dt>ORBITAL PERIOD</dt>
                        <dd>
                            {formatDecimal(object.period)}
                            <small> MIN</small>
                        </dd>
                    </div>
                </dl>

                <div className="object-drawer__update">
                    <Clock3 size={14} />

                    <span>
                        LAST TELEMETRY UPDATE
                        <strong>
                            {formatTimestamp(lastUpdated)} UTC
                        </strong>
                    </span>
                </div>

                <Link
                    to="/live-tracking"
                    className="object-drawer__action"
                >
                    <Crosshair size={16} />
                    <span>OPEN IN LIVE TRACKING</span>
                    <ArrowUpRight size={15} />
                </Link>
            </motion.aside>
        </motion.div>,
        document.body
    );
}

export default function Dashboard({
    data = [],
    stats = {},
    onRefresh = () => {},
    lastUpdated = 0,
    source = 'celestrak',
    connected = false
}) {
    const navigate = useNavigate();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedObject, setSelectedObject] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const objects = useMemo(
        () => data.map(normalizeObject),
        [data]
    );

    const computed = useMemo(() => {
        const total =
            objects.length ||
            Number(stats?.total_objects) ||
            Number(stats?.tracked_objects) ||
            Number(stats?.objects) ||
            0;

        const satellites =
            objects.filter(object =>
                isSatellite(object.type)
            ).length ||
            Number(
                stats?.classification?.active_satellites
            ) ||
            Number(stats?.satellites) ||
            0;

        const debris =
            objects.filter(object =>
                isDebris(object.type)
            ).length ||
            Number(stats?.classification?.debris) ||
            Number(stats?.debris) ||
            0;

        const highRisk = objects.filter(
            object =>
                object.risk === 'HIGH' ||
                object.risk === 'CRITICAL'
        ).length;

        return {
            total,
            satellites,
            debris,
            highRisk
        };
    }, [objects, stats]);

    const riskObjects = useMemo(() => {
        return [...objects]
            .sort(
                (left, right) =>
                    riskPriority(right.risk) -
                    riskPriority(left.risk)
            )
            .filter(object => object.risk !== 'LOW')
            .slice(0, 5);
    }, [objects]);

    const searchableObjects = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        if (!query) return objects.slice(0, 7);

        return objects
            .filter(object => {
                return (
                    object.name
                        .toLowerCase()
                        .includes(query) ||
                    String(object.id)
                        .toLowerCase()
                        .includes(query) ||
                    object.type
                        .toLowerCase()
                        .includes(query)
                );
            })
            .slice(0, 7);
    }, [objects, searchTerm]);

    const altitudeBins = useMemo(() => {
        const bins = [
            {
                label: '0–250',
                minimum: 0,
                maximum: 250
            },
            {
                label: '250–500',
                minimum: 250,
                maximum: 500
            },
            {
                label: '500–750',
                minimum: 500,
                maximum: 750
            },
            {
                label: '750–1K',
                minimum: 750,
                maximum: 1000
            },
            {
                label: '1K–2K',
                minimum: 1000,
                maximum: 2000
            },
            {
                label: '2K+',
                minimum: 2000,
                maximum: Infinity
            }
        ];

        const populated = bins.map(bin => ({
            ...bin,
            count: objects.filter(object => {
                return (
                    object.altitude !== null &&
                    object.altitude >= bin.minimum &&
                    object.altitude < bin.maximum
                );
            }).length
        }));

        const maximumCount = Math.max(
            ...populated.map(bin => bin.count),
            1
        );

        return populated.map(bin => ({
            ...bin,
            percentage:
                (bin.count / maximumCount) * 100
        }));
    }, [objects]);

    const floatingObjects = objects
        .filter(object => object.name)
        .slice(0, 4);

    const handleRefresh = async () => {
        setRefreshing(true);

        try {
            await onRefresh();
        } finally {
            window.setTimeout(() => {
                setRefreshing(false);
            }, 550);
        }
    };

    const selectOriginalObject = originalObject => {
        const index = data.indexOf(originalObject);

        if (index === -1) return;

        setSelectedObject(
            normalizeObject(originalObject, index)
        );
    };

    return (
        <div className="overview-page">
            <section className="overview-introduction">
                <div>
                    <div className="overview-eyebrow">
                        <span />
                        MISSION CONTROL / OVERVIEW
                    </div>

                    <h1>
                        Maintain clarity
                        <br />
                        in crowded orbit.
                    </h1>

                    <p>
                        Real-time orbital monitoring, propagated
                        object positions and conjunction awareness
                        from the OrbitOPS intelligence pipeline.
                    </p>
                </div>

                <div className="overview-introduction__actions">
                    <button
                        type="button"
                        className="command-secondary-button"
                        disabled={refreshing}
                        onClick={handleRefresh}
                    >
                        <RefreshCw
                            size={15}
                            className={
                                refreshing
                                    ? 'is-spinning'
                                    : ''
                            }
                        />

                        <span>
                            {refreshing
                                ? 'SYNCING'
                                : 'REFRESH FEED'}
                        </span>
                    </button>

                    <button
                        type="button"
                        className="command-primary-button"
                        onClick={() =>
                            navigate('/live-tracking')
                        }
                    >
                        <Crosshair size={15} />
                        <span>OPEN LIVE TRACKING</span>
                        <ArrowUpRight size={14} />
                    </button>
                </div>
            </section>

            <section className="overview-metrics">
                <Metric
                    label="TRACKED OBJECTS"
                    value={formatNumber(computed.total)}
                    detail="CURRENT TELEMETRY SET"
                    accent
                />

                <Metric
                    label="ACTIVE SATELLITES"
                    value={formatNumber(computed.satellites)}
                    detail="PAYLOADS / SATELLITES"
                />

                <Metric
                    label="DEBRIS OBJECTS"
                    value={formatNumber(computed.debris)}
                    detail="DEBRIS / ROCKET BODIES"
                />

                <Metric
                    label="HIGH-RISK TRACKS"
                    value={formatNumber(computed.highRisk)}
                    detail="HIGH + CRITICAL"
                />
            </section>

            <section className="overview-hero-grid">
                <article className="overview-globe-card">
                    <header className="panel-heading">
                        <div>
                            <span>LIVE ORBITAL ENVIRONMENT</span>
                            <h2>Earth traffic overview</h2>
                        </div>

                        <div
                            className={[
                                'panel-heading__status',
                                connected ? 'is-online' : ''
                            ].join(' ')}
                        >
                            <span />
                            {connected
                                ? 'STREAM ACTIVE'
                                : 'STREAM CONNECTING'}
                        </div>
                    </header>

                    <div className="overview-globe-card__canvas">
                        <OverviewGlobe
                            data={data}
                            onSelect={selectOriginalObject}
                        />

                        <div className="overview-globe-card__reticle">
                            <span />
                            <span />
                        </div>

                        {floatingObjects.map(
                            (object, index) => (
                                <motion.button
                                    type="button"
                                    key={`${object.id}-${index}`}
                                    className={[
                                        'floating-object-tag',
                                        `floating-object-tag--${index + 1}`
                                    ].join(' ')}
                                    initial={{
                                        opacity: 0,
                                        scale: 0.84
                                    }}
                                    animate={{
                                        opacity: 1,
                                        scale: 1,
                                        y: [0, -7, 0]
                                    }}
                                    transition={{
                                        opacity: {
                                            delay:
                                                0.25 +
                                                index * 0.12,
                                            duration: 0.4
                                        },
                                        scale: {
                                            delay:
                                                0.25 +
                                                index * 0.12,
                                            duration: 0.4
                                        },
                                        y: {
                                            duration:
                                                3.4 +
                                                index * 0.4,
                                            repeat: Infinity,
                                            ease: 'easeInOut'
                                        }
                                    }}
                                    onClick={() =>
                                        setSelectedObject(object)
                                    }
                                >
                                    <span
                                        className={
                                            object.risk === 'HIGH' ||
                                            object.risk === 'CRITICAL'
                                                ? 'is-danger'
                                                : ''
                                        }
                                    />

                                    <strong>
                                        {object.name}
                                    </strong>

                                    <small>
                                        {formatNumber(
                                            object.altitude
                                        )}{' '}
                                        KM
                                    </small>
                                </motion.button>
                            )
                        )}
                    </div>

                    <footer className="overview-globe-card__footer">
                        <div>
                            <Database size={13} />
                            <span>
                                SOURCE
                                <strong>
                                    {String(
                                        source || 'celestrak'
                                    ).toUpperCase()}
                                </strong>
                            </span>
                        </div>

                        <div>
                            <Clock3 size={13} />
                            <span>
                                UPDATED
                                <strong>
                                    {formatTimestamp(
                                        lastUpdated
                                    )}{' '}
                                    UTC
                                </strong>
                            </span>
                        </div>

                        <Link to="/live-tracking">
                            INTERACT WITH LIVE MAP
                            <ChevronRight size={14} />
                        </Link>
                    </footer>
                </article>

                <div className="overview-side-column">
                    <article className="overview-risk-card">
                        <header className="panel-heading">
                            <div>
                                <span>
                                    CONJUNCTION WATCH
                                </span>
                                <h2>Priority tracks</h2>
                            </div>

                            <AlertTriangle size={18} />
                        </header>

                        <div className="overview-risk-card__content">
                            {riskObjects.length > 0 ? (
                                riskObjects.map(
                                    (object, index) => (
                                        <button
                                            type="button"
                                            key={`${object.id}-${index}`}
                                            onClick={() =>
                                                setSelectedObject(
                                                    object
                                                )
                                            }
                                        >
                                            <span
                                                className={[
                                                    'risk-index',
                                                    object.risk ===
                                                        'HIGH' ||
                                                    object.risk ===
                                                        'CRITICAL'
                                                        ? 'is-danger'
                                                        : ''
                                                ].join(' ')}
                                            >
                                                {String(
                                                    index + 1
                                                ).padStart(2, '0')}
                                            </span>

                                            <span className="risk-object-copy">
                                                <strong>
                                                    {object.name}
                                                </strong>

                                                <small>
                                                    {object.type}
                                                </small>
                                            </span>

                                            <RiskBadge
                                                risk={
                                                    object.risk
                                                }
                                            />

                                            <ChevronRight
                                                size={14}
                                            />
                                        </button>
                                    )
                                )
                            ) : (
                                <div className="panel-empty-state">
                                    <ShieldAlert size={25} />
                                    <strong>
                                        No elevated tracks
                                    </strong>
                                    <span>
                                        The current telemetry
                                        set contains no medium,
                                        high or critical objects.
                                    </span>
                                </div>
                            )}
                        </div>

                        <Link
                            to="/conjunctions"
                            className="panel-text-link"
                        >
                            OPEN CONJUNCTION MONITOR
                            <ArrowUpRight size={13} />
                        </Link>
                    </article>

                    <article className="overview-altitude-card">
                        <header className="panel-heading">
                            <div>
                                <span>
                                    TRAFFIC DISTRIBUTION
                                </span>
                                <h2>Altitude profile</h2>
                            </div>

                            <Activity size={18} />
                        </header>

                        <div className="altitude-chart">
                            {altitudeBins.map(bin => (
                                <div
                                    key={bin.label}
                                    className="altitude-chart__column"
                                >
                                    <span>
                                        {formatNumber(
                                            bin.count
                                        )}
                                    </span>

                                    <div>
                                        <motion.i
                                            initial={{
                                                height: 0
                                            }}
                                            animate={{
                                                height: `${Math.max(
                                                    bin.percentage,
                                                    bin.count > 0
                                                        ? 8
                                                        : 0
                                                )}%`
                                            }}
                                            transition={{
                                                duration: 0.75,
                                                delay: 0.15
                                            }}
                                        />
                                    </div>

                                    <small>{bin.label}</small>
                                </div>
                            ))}
                        </div>

                        <div className="altitude-chart__legend">
                            ALTITUDE BANDS IN KILOMETRES
                        </div>
                    </article>
                </div>
            </section>

            <section className="overview-lower-grid">
                <article className="overview-catalog-card">
                    <header className="panel-heading panel-heading--catalog">
                        <div>
                            <span>OBJECT CATALOG</span>
                            <h2>Current tracked objects</h2>
                        </div>

                        <label className="catalog-search">
                            <Search size={14} />

                            <input
                                value={searchTerm}
                                onChange={event =>
                                    setSearchTerm(
                                        event.target.value
                                    )
                                }
                                placeholder="Search name, ID or type"
                            />
                        </label>
                    </header>

                    <div className="catalog-table">
                        <div className="catalog-table__header">
                            <span>OBJECT</span>
                            <span>CLASS</span>
                            <span>ALTITUDE</span>
                            <span>RISK</span>
                            <span />
                        </div>

                        {searchableObjects.length > 0 ? (
                            searchableObjects.map(
                                (object, index) => (
                                    <button
                                        type="button"
                                        className="catalog-table__row"
                                        key={`${object.id}-${index}`}
                                        onClick={() =>
                                            setSelectedObject(
                                                object
                                            )
                                        }
                                    >
                                        <span className="catalog-object">
                                            <i
                                                className={
                                                    object.risk ===
                                                        'HIGH' ||
                                                    object.risk ===
                                                        'CRITICAL'
                                                        ? 'is-danger'
                                                        : ''
                                                }
                                            />

                                            <span>
                                                <strong>
                                                    {object.name}
                                                </strong>

                                                <small>
                                                    ID {object.id}
                                                </small>
                                            </span>
                                        </span>

                                        <span>
                                            {object.type}
                                        </span>

                                        <span>
                                            {formatNumber(
                                                object.altitude
                                            )}{' '}
                                            KM
                                        </span>

                                        <span>
                                            <RiskBadge
                                                risk={
                                                    object.risk
                                                }
                                            />
                                        </span>

                                        <span>
                                            <Eye size={14} />
                                        </span>
                                    </button>
                                )
                            )
                        ) : (
                            <div className="catalog-empty">
                                No tracked objects match the
                                current search.
                            </div>
                        )}
                    </div>

                    <Link
                        to="/object-catalog"
                        className="panel-text-link"
                    >
                        OPEN COMPLETE OBJECT CATALOG
                        <ArrowUpRight size={13} />
                    </Link>
                </article>

                <aside className="overview-feature-navigation">
                    <header>
                        <span>OPERATIONS</span>
                        <h2>Mission workspaces</h2>
                    </header>

                    <div>
                        {featureLinks.map(
                            ({
                                title,
                                description,
                                path,
                                icon: Icon,
                                marker
                            }) => (
                                <Link
                                    key={path}
                                    to={path}
                                    className="feature-navigation-card"
                                >
                                    <span className="feature-navigation-card__marker">
                                        {marker}
                                    </span>

                                    <span className="feature-navigation-card__icon">
                                        <Icon size={17} />
                                    </span>

                                    <span className="feature-navigation-card__copy">
                                        <strong>{title}</strong>
                                        <small>
                                            {description}
                                        </small>
                                    </span>

                                    <ArrowUpRight size={15} />

                                    <motion.i
                                        initial={{ scaleX: 0 }}
                                        whileHover={{
                                            scaleX: 1
                                        }}
                                    />
                                </Link>
                            )
                        )}
                    </div>
                </aside>
            </section>

            <ObjectDrawer
                object={selectedObject}
                lastUpdated={lastUpdated}
                onClose={() => setSelectedObject(null)}
            />
        </div>
    );
}
