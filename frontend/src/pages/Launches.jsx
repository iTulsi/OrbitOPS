import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    Calendar,
    ChevronDown,
    CircleDot,
    Database,
    Download,
    Eye,
    Info,
    Orbit,
    RefreshCw,
    Rocket,
    Satellite,
    Shield,
    Trash2,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    fetchAnalytics,
    readCachedAnalytics,
} from '../services/analyticsApi';

const TYPE_COLORS = {
    SATELLITE: '#9b6cff',
    DEBRIS: '#ff4d5f',
    ROCKET_BODY: '#ff9800',
    UNKNOWN: '#64748b',
};

const REGION_COLORS = {
    LEO: '#1dd9e9',
    MEO: '#3b82f6',
    GEO: '#22c55e',
    HEO: '#a855f7',
    UNKNOWN: '#64748b',
};

const SEVERITY_COLORS = {
    CRITICAL: '#ff4057',
    HIGH: '#ff7138',
    MEDIUM: '#f2bd38',
    MONITORED: '#3b82f6',
};

const NUMBER = new Intl.NumberFormat('en-US');

function formatNumber(value) {
    return NUMBER.format(Number(value) || 0);
}

function formatCompact(value) {
    const numeric = Number(value) || 0;
    if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
    if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
    return formatNumber(numeric);
}

function formatTimestamp(value) {
    if (!value) return 'Awaiting result';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString([], {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatHistoryTime(value, windowRange) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    if (windowRange === '24h') {
        return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return parsed.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatChange(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return { text: 'history accumulating', positive: null };
    }
    const numeric = Number(value);
    return {
        text: `${numeric >= 0 ? '▲' : '▼'} ${Math.abs(numeric).toFixed(1)}% vs prior sample`,
        positive: numeric >= 0,
    };
}

function normalizeSeries(data = []) {
    if (data.length !== 1) return data;
    const only = data[0];
    return [
        { ...only, timestamp: new Date(new Date(only.timestamp).getTime() - 60_000).toISOString(), syntheticAxisOnly: true },
        only,
    ];
}

function ChartEmpty({ title = 'History is accumulating' }) {
    return (
        <div className="flex h-full min-h-[160px] items-center justify-center text-center">
            <div>
                <Activity className="mx-auto mb-3 text-slate-700" size={24} />
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{title}</p>
                <p className="mt-2 max-w-xs text-xs leading-5 text-slate-700">
                    OrbitOPS records genuine snapshots over time instead of generating fake trend values.
                </p>
            </div>
        </div>
    );
}

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="border border-white/10 bg-[#080b10]/95 px-3 py-2 shadow-2xl backdrop-blur-xl">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500">{label}</p>
            {payload.map((entry) => (
                <div key={entry.dataKey || entry.name} className="flex min-w-[130px] items-center justify-between gap-5 text-xs">
                    <span style={{ color: entry.color }}>{entry.name}</span>
                    <span className="font-mono text-slate-200">{formatNumber(entry.value)}</span>
                </div>
            ))}
        </div>
    );
}

function Panel({ title, children, className = '', action = null }) {
    return (
        <section className={`min-w-0 border border-white/[0.10] bg-[#070a0f]/85 ${className}`}>
            <header className="flex h-10 items-center justify-between border-b border-white/[0.08] px-4">
                <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-slate-300">{title}</h2>
                {action || <Info size={13} className="text-sky-400/70" />}
            </header>
            {children}
        </section>
    );
}

function MetricCard({ title, value, change, icon: Icon, accent, sparkData, sparkKey }) {
    const changeInfo = formatChange(change);
    const lineData = normalizeSeries(sparkData || []);

    return (
        <article
            className="relative min-h-[132px] overflow-hidden border bg-[#090c12]/90 p-4"
            style={{ borderColor: `${accent}35`, boxShadow: `inset 0 0 28px ${accent}08` }}
        >
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <Icon size={19} style={{ color: accent }} />
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: accent }}>{title}</p>
                </div>
            </div>
            <div className="mt-3 font-mono text-[25px] tracking-[0.08em] text-slate-100">{formatCompact(value)}</div>
            <p
                className="mt-1 font-mono text-[9px] tracking-[0.04em]"
                style={{ color: changeInfo.positive === null ? '#64748b' : changeInfo.positive ? accent : '#ff6576' }}
            >
                {changeInfo.text}
            </p>
            <div className="absolute bottom-1 left-3 right-3 h-8 opacity-90">
                {lineData.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={lineData}>
                            <Line dataKey={sparkKey} stroke={accent} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                ) : null}
            </div>
        </article>
    );
}

function DonutLegend({ data, colors, total }) {
    return (
        <div className="space-y-3">
            {data.filter((item) => item.value > 0).map((item) => {
                const percentage = total ? (item.value / total) * 100 : 0;
                return (
                    <div key={item.name} className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2">
                            <span className="mt-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: colors[item.name] }} />
                            <div>
                                <p className="font-mono text-[10px] text-slate-300">{item.name.replace('_', ' ')}</p>
                                <p className="mt-0.5 font-mono text-[9px] text-slate-600">{formatNumber(item.value)} ({percentage.toFixed(1)}%)</p>
                            </div>
                        </div>
                    </div>
                );
            })}
            <div className="flex items-center justify-between border-t border-white/[0.08] pt-2 font-mono text-[10px]">
                <span className="text-slate-500">TOTAL</span>
                <span className="text-slate-200">{formatNumber(total)}</span>
            </div>
        </div>
    );
}

function SelectControl({ value, onChange, options, icon: Icon }) {
    return (
        <label className="relative flex h-10 items-center border border-white/[0.12] bg-[#080b10] px-3 text-xs text-slate-300">
            {Icon ? <Icon size={13} className="mr-2 text-slate-500" /> : null}
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="appearance-none bg-transparent pr-8 font-mono text-[10px] uppercase tracking-[0.05em] text-slate-300 outline-none"
            >
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-3 text-slate-500" />
        </label>
    );
}

function StatusPill({ status, refreshing }) {
    const config = {
        live: ['LIVE', 'text-emerald-300 border-emerald-400/25 bg-emerald-400/[0.06]'],
        stale: ['CACHED', 'text-amber-300 border-amber-400/25 bg-amber-400/[0.06]'],
        warming: ['WARMING', 'text-cyan-300 border-cyan-400/25 bg-cyan-400/[0.06]'],
        offline: ['OFFLINE', 'text-rose-300 border-rose-400/25 bg-rose-400/[0.06]'],
    }[status] || ['UNKNOWN', 'text-slate-400 border-white/10 bg-white/[0.03]'];

    return (
        <span className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] ${config[1]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? 'animate-pulse bg-cyan-300' : status === 'live' ? 'bg-emerald-400' : 'bg-current'}`} />
            {refreshing ? 'REFRESHING' : config[0]}
        </span>
    );
}

function downloadReport(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `orbitops-analytics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

const EMPTY = {
    status: 'warming',
    source: 'CelesTrak + SGP4',
    summary: {
        total_objects: 0,
        satellites: 0,
        debris: 0,
        rocket_bodies: 0,
        critical_events: 0,
        high_events: 0,
        medium_events: 0,
        monitored_events: 0,
        changes: {},
    },
    object_distribution: [],
    orbital_regions: [],
    severity_distribution: [],
    miss_distance_distribution: [],
    history: [],
    top_pairs: [],
    catalog_dynamics: {},
    insights: [],
    diagnostics: {},
};

export default function Launches() {
    const [windowRange, setWindowRange] = useState('7d');
    const [objectType, setObjectType] = useState('ALL');
    const [data, setData] = useState(() => readCachedAnalytics() || EMPTY);
    const [loading, setLoading] = useState(!readCachedAnalytics());
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async ({ force = false } = {}) => {
        const controller = new AbortController();
        setError('');
        if (force) setRefreshing(true);
        else setLoading(true);

        try {
            const payload = await fetchAnalytics({
                windowRange,
                objectType,
                refresh: force,
                signal: controller.signal,
            });
            setData(payload);
        } catch (requestError) {
            setError(requestError.message || 'Analytics data could not be loaded.');
            setData((current) => ({ ...current, status: current.summary?.total_objects ? 'stale' : 'offline' }));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }

        return () => controller.abort();
    }, [windowRange, objectType]);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        setLoading(true);
        setError('');
        fetchAnalytics({ windowRange, objectType, signal: controller.signal })
            .then((payload) => {
                if (!cancelled) setData(payload);
            })
            .catch((requestError) => {
                if (!cancelled && requestError.name !== 'AbortError') {
                    setError(requestError.message || 'Analytics data could not be loaded.');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [windowRange, objectType]);

    useEffect(() => {
        if (!data.refresh_in_progress && data.status !== 'warming') return undefined;
        const timer = window.setInterval(() => load(), 5000);
        return () => window.clearInterval(timer);
    }, [data.refresh_in_progress, data.status, load]);

    const summary = data.summary || EMPTY.summary;
    const history = useMemo(
        () => (data.history || []).map((item) => ({
            ...item,
            label: formatHistoryTime(item.timestamp, windowRange),
            elevated: (Number(item.critical) || 0) + (Number(item.high) || 0),
        })),
        [data.history, windowRange]
    );
    const chartHistory = normalizeSeries(history);
    const objectTotal = (data.object_distribution || []).reduce((sum, item) => sum + Number(item.value || 0), 0);
    const regionTotal = (data.orbital_regions || []).reduce((sum, item) => sum + Number(item.value || 0), 0);

    const metricCards = [
        { title: 'TOTAL OBJECTS', value: summary.total_objects, change: summary.changes?.total_objects, icon: Orbit, accent: '#23d7e8', sparkKey: 'total_objects' },
        { title: 'SATELLITES', value: summary.satellites, change: summary.changes?.satellites, icon: Satellite, accent: '#9b6cff', sparkKey: 'satellites' },
        { title: 'DEBRIS', value: summary.debris, change: summary.changes?.debris, icon: Trash2, accent: '#ff4d5f', sparkKey: 'debris' },
        { title: 'ROCKET BODIES', value: summary.rocket_bodies, change: summary.changes?.rocket_bodies, icon: Rocket, accent: '#ff9800', sparkKey: 'rocket_bodies' },
        { title: 'HIGH RISK EVENTS', value: (summary.critical_events || 0) + (summary.high_events || 0), change: summary.changes?.high_events, icon: AlertTriangle, accent: '#f4bd21', sparkKey: 'elevated' },
        { title: 'MONITORED EVENTS', value: summary.monitored_events, change: summary.changes?.monitored_events, icon: Shield, accent: '#3b82f6', sparkKey: 'monitored' },
    ];

    const insightIcon = {
        warning: AlertTriangle,
        success: Shield,
        info: CircleDot,
        neutral: Info,
    };
    const insightColor = {
        warning: '#ff5d65',
        success: '#35d98b',
        info: '#36c7ff',
        neutral: '#94a3b8',
    };

    return (
        <div className="relative h-full overflow-y-auto bg-[#030507] text-slate-200">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_46%_-10%,rgba(25,75,105,0.12),transparent_35%),linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:auto,44px_44px,44px_44px]" />

            <main className="relative mx-auto w-full max-w-[1880px] px-5 pb-8 pt-5 lg:px-7">
                <header className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <h1 className="font-orbitron text-3xl font-semibold tracking-[0.04em] text-white sm:text-[36px]">ANALYTICS</h1>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-600">
                            Comprehensive orbital insights &amp; genuine recorded trends
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <SelectControl
                            value={windowRange}
                            onChange={setWindowRange}
                            icon={Calendar}
                            options={[
                                { value: '24h', label: 'Last 24 hours' },
                                { value: '7d', label: 'Last 7 days' },
                                { value: '30d', label: 'Last 30 days' },
                            ]}
                        />
                        <SelectControl
                            value={objectType}
                            onChange={setObjectType}
                            options={[
                                { value: 'ALL', label: 'All object types' },
                                { value: 'SATELLITE', label: 'Satellites' },
                                { value: 'DEBRIS', label: 'Debris' },
                                { value: 'ROCKET_BODY', label: 'Rocket bodies' },
                            ]}
                        />
                        <button
                            type="button"
                            onClick={() => load({ force: true })}
                            disabled={refreshing}
                            className="flex h-10 items-center gap-2 border border-cyan-400/35 bg-cyan-400/[0.05] px-4 font-mono text-[10px] uppercase tracking-[0.08em] text-cyan-300 transition hover:bg-cyan-400/10 disabled:cursor-wait disabled:opacity-50"
                        >
                            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={() => downloadReport(data)}
                            className="flex h-10 items-center gap-2 border border-white/[0.12] bg-[#080b10] px-4 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-300 transition hover:border-white/25 hover:text-white"
                        >
                            <Download size={13} />
                            Export report
                        </button>
                    </div>
                </header>

                <div className="mb-3 flex flex-wrap items-center justify-end gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-600">
                    <span>Data source: <b className="font-normal text-slate-400">{data.source || 'CelesTrak + SGP4'}</b></span>
                    <span>Updated: <b className="font-normal text-slate-400">{formatTimestamp(data.generated_at)}</b></span>
                    <StatusPill status={data.status} refreshing={refreshing || data.refresh_in_progress} />
                </div>

                {error ? (
                    <div className="mb-3 flex items-center gap-3 border border-rose-400/25 bg-rose-500/[0.06] px-4 py-3 text-xs text-rose-200">
                        <AlertTriangle size={15} />
                        {error} Cached analytics remain visible when available.
                    </div>
                ) : null}

                {data.message ? (
                    <div className="mb-3 border border-cyan-400/15 bg-cyan-400/[0.035] px-4 py-2 font-mono text-[9px] tracking-[0.06em] text-cyan-200/70">
                        {data.message}
                    </div>
                ) : null}

                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    {metricCards.map((card) => <MetricCard key={card.title} {...card} sparkData={history} />)}
                </section>

                <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
                    <Panel title="Object population trend" className="xl:col-span-5">
                        <div className="h-[220px] p-3">
                            {history.length ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartHistory} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                                        <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={formatCompact} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconType="line" wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
                                        <Line name="Total objects" type="monotone" dataKey="total_objects" stroke="#23d7e8" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                                        <Line name="Satellites" type="monotone" dataKey="satellites" stroke="#9b6cff" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} />
                                        <Line name="Debris" type="monotone" dataKey="debris" stroke="#ff4d5f" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} />
                                        <Line name="Rocket bodies" type="monotone" dataKey="rocket_bodies" stroke="#ff9800" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : <ChartEmpty />}
                        </div>
                    </Panel>

                    <Panel title="Object distribution" className="xl:col-span-3">
                        <div className="grid h-[220px] grid-cols-[1.05fr_1fr] items-center gap-1 px-3 py-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.object_distribution || []} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="76%" stroke="rgba(255,255,255,0.05)" isAnimationActive={false}>
                                        {(data.object_distribution || []).map((item) => <Cell key={item.name} fill={TYPE_COLORS[item.name] || '#64748b'} />)}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                            <DonutLegend data={data.object_distribution || []} colors={TYPE_COLORS} total={objectTotal} />
                        </div>
                    </Panel>

                    <Panel title="Objects by orbital region" className="xl:col-span-4">
                        <div className="grid h-[220px] grid-cols-[1fr_1.15fr] items-center gap-2 px-3 py-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.orbital_regions || []} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="76%" stroke="rgba(255,255,255,0.05)" isAnimationActive={false}>
                                        {(data.orbital_regions || []).map((item) => <Cell key={item.name} fill={REGION_COLORS[item.name] || '#64748b'} />)}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                            <DonutLegend data={data.orbital_regions || []} colors={REGION_COLORS} total={regionTotal} />
                        </div>
                    </Panel>
                </section>

                <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
                    <Panel title="Risk events trend" className="xl:col-span-5">
                        <div className="h-[190px] p-3">
                            {history.length ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartHistory} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                                        <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                                        <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend iconType="line" wrapperStyle={{ fontSize: 10, fontFamily: 'monospace' }} />
                                        <Area name="Elevated events" type="monotone" dataKey="elevated" stroke="#ff4d5f" fill="#ff4d5f" fillOpacity={0.13} strokeWidth={1.7} isAnimationActive={false} />
                                        <Area name="Monitored events" type="monotone" dataKey="monitored" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.08} strokeWidth={1.4} isAnimationActive={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : <ChartEmpty />}
                        </div>
                    </Panel>

                    <Panel title="Conjunctions by severity" className="xl:col-span-3">
                        <div className="h-[190px] p-3">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.severity_distribution || []} margin={{ top: 10, right: 4, left: -24, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 8 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="value" name="Events" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                                        {(data.severity_distribution || []).map((item) => <Cell key={item.name} fill={SEVERITY_COLORS[item.name] || '#64748b'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>

                    <Panel title="Closest approach distribution" className="xl:col-span-4">
                        <div className="h-[190px] p-3">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.miss_distance_distribution || []} margin={{ top: 10, right: 4, left: -24, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 8 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="value" name="Events" fill="#1fc8d7" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Panel>
                </section>

                <section className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-12">
                    <Panel title="Top high-risk object pairs" className="xl:col-span-6">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] border-collapse font-mono text-[9px]">
                                <thead className="text-left uppercase tracking-[0.06em] text-slate-600">
                                    <tr className="border-b border-white/[0.08]">
                                        <th className="px-3 py-2 font-normal">Risk</th>
                                        <th className="px-3 py-2 font-normal">Object A</th>
                                        <th className="px-3 py-2 font-normal">Object B</th>
                                        <th className="px-3 py-2 font-normal">Closest approach</th>
                                        <th className="px-3 py-2 text-right font-normal">Miss km</th>
                                        <th className="px-3 py-2 text-right font-normal">Rel. km/s</th>
                                        <th className="px-3 py-2 text-right font-normal">Index</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.top_pairs || []).slice(0, 6).map((event) => (
                                        <tr key={event.id} className="border-b border-white/[0.055] text-slate-400">
                                            <td className="px-3 py-2.5">
                                                <span className="border px-1.5 py-1" style={{ color: SEVERITY_COLORS[event.severity], borderColor: `${SEVERITY_COLORS[event.severity]}70` }}>{event.severity}</span>
                                            </td>
                                            <td className="px-3 py-2.5 text-slate-300">{event.object_a?.name} <span className="text-slate-700">({event.object_a?.norad_id})</span></td>
                                            <td className="px-3 py-2.5 text-slate-300">{event.object_b?.name} <span className="text-slate-700">({event.object_b?.norad_id})</span></td>
                                            <td className="px-3 py-2.5">{event.closest_approach_utc}</td>
                                            <td className="px-3 py-2.5 text-right">{event.miss_distance_km == null ? '—' : Number(event.miss_distance_km).toFixed(3)}</td>
                                            <td className="px-3 py-2.5 text-right">{event.relative_velocity_km_s == null ? '—' : Number(event.relative_velocity_km_s).toFixed(2)}</td>
                                            <td className="px-3 py-2.5 text-right text-rose-300">{event.risk_index == null ? '—' : Number(event.risk_index).toFixed(1)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!(data.top_pairs || []).length ? (
                                <div className="flex h-40 items-center justify-center font-mono text-[10px] uppercase tracking-[0.15em] text-slate-700">
                                    Awaiting completed conjunction screening
                                </div>
                            ) : null}
                        </div>
                    </Panel>

                    <Panel title="Object launch & decay metadata" className="xl:col-span-2">
                        <div className="space-y-4 p-4">
                            <div className="border-b border-white/[0.07] pb-4">
                                <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-emerald-400">Launches / last 30 days</p>
                                <div className="mt-2 font-mono text-3xl text-emerald-300">
                                    {data.catalog_dynamics?.launches_30d == null ? 'N/A' : formatNumber(data.catalog_dynamics.launches_30d)}
                                </div>
                            </div>
                            <div>
                                <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-rose-400">Decays / last 30 days</p>
                                <div className="mt-2 font-mono text-3xl text-rose-300">
                                    {data.catalog_dynamics?.decays_30d == null ? 'N/A' : formatNumber(data.catalog_dynamics.decays_30d)}
                                </div>
                            </div>
                            <p className="font-mono text-[8px] leading-4 text-slate-700">
                                N/A means the active live frame does not expose reliable launch or decay date metadata. OrbitOPS does not invent these values.
                            </p>
                        </div>
                    </Panel>

                    <Panel title="Key insights" className="xl:col-span-4">
                        <div className="divide-y divide-white/[0.07] px-4">
                            {(data.insights || []).map((insight, index) => {
                                const Icon = insightIcon[insight.level] || Info;
                                return (
                                    <div key={`${insight.text}-${index}`} className="flex gap-3 py-3">
                                        <Icon size={15} className="mt-0.5 shrink-0" style={{ color: insightColor[insight.level] || '#94a3b8' }} />
                                        <p className="text-[11px] leading-5 text-slate-400">{insight.text}</p>
                                    </div>
                                );
                            })}
                            {!(data.insights || []).length ? (
                                <div className="flex h-40 items-center justify-center font-mono text-[9px] uppercase tracking-[0.15em] text-slate-700">Insights generate from live data</div>
                            ) : null}
                        </div>
                    </Panel>
                </section>

                <footer className="mt-4 flex flex-col justify-between gap-2 border-t border-white/[0.08] py-3 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-700 sm:flex-row">
                    <span className="flex items-center gap-2"><Activity size={11} /> Space situational awareness platform</span>
                    <span>
                        {data.diagnostics?.objects_in_live_frame ? `${formatNumber(data.diagnostics.objects_in_live_frame)} objects in current frame` : 'Awaiting orbital frame'}
                        {' · '}
                        Sample-based analytics
                    </span>
                </footer>
            </main>

            {loading && !summary.total_objects ? (
                <div className="pointer-events-none fixed inset-x-0 bottom-8 z-20 flex justify-center">
                    <div className="flex items-center gap-3 border border-cyan-400/20 bg-[#070b10]/95 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200 shadow-2xl backdrop-blur-xl">
                        <RefreshCw size={14} className="animate-spin" />
                        Preparing analytics frame
                    </div>
                </div>
            ) : null}
        </div>
    );
}
