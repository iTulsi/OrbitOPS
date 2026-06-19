import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    Clock3,
    Crosshair,
    Database,
    Eye,
    FileText,
    Loader2,
    Orbit,
    Radar,
    RefreshCw,
    Satellite,
    Search,
    ShieldAlert,
    SlidersHorizontal,
    WifiOff,
} from 'lucide-react';
import {
    cacheConjunctions,
    fetchConjunctionHistory,
    fetchConjunctions,
    readCachedConjunctions,
} from '../services/conjunctionApi';
import { orbitSocket } from '../services/socket';

const PAGE_SIZE = 10;

const RISK_ORDER = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    MONITORED: 1,
};

const RISK_STYLES = {
    CRITICAL: {
        badge: 'border-red-500/55 bg-red-500/10 text-red-300',
        icon: 'border-red-500/35 bg-red-500/10 text-red-400',
        card: 'border-red-500/25 bg-gradient-to-br from-red-950/35 via-[#08090c] to-[#050608]',
        value: 'text-red-300',
        line: 'bg-red-500',
    },
    HIGH: {
        badge: 'border-orange-500/55 bg-orange-500/10 text-orange-300',
        icon: 'border-orange-500/35 bg-orange-500/10 text-orange-400',
        card: 'border-orange-500/25 bg-gradient-to-br from-orange-950/25 via-[#08090c] to-[#050608]',
        value: 'text-orange-300',
        line: 'bg-orange-500',
    },
    MEDIUM: {
        badge: 'border-amber-400/55 bg-amber-400/10 text-amber-300',
        icon: 'border-amber-400/35 bg-amber-400/10 text-amber-300',
        card: 'border-amber-400/20 bg-gradient-to-br from-amber-950/20 via-[#08090c] to-[#050608]',
        value: 'text-amber-300',
        line: 'bg-amber-400',
    },
    MONITORED: {
        badge: 'border-sky-400/45 bg-sky-400/10 text-sky-300',
        icon: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
        card: 'border-sky-400/20 bg-gradient-to-br from-sky-950/20 via-[#08090c] to-[#050608]',
        value: 'text-sky-300',
        line: 'bg-sky-400',
    },
};

function toNumber(...values) {
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function normaliseRisk(value) {
    const risk = String(value || 'MONITORED').toUpperCase();
    if (risk.includes('CRITICAL')) return 'CRITICAL';
    if (risk.includes('HIGH')) return 'HIGH';
    if (risk.includes('MEDIUM') || risk.includes('MODERATE')) return 'MEDIUM';
    return 'MONITORED';
}

function normaliseType(value) {
    const type = String(value || 'UNKNOWN').toUpperCase().replace(/[ -]/g, '_');
    if (type.includes('DEBRIS')) return 'DEBRIS';
    if (type.includes('ROCKET') || type.includes('R_B')) return 'ROCKET_BODY';
    if (type.includes('SAT') || type.includes('PAYLOAD')) return 'SATELLITE';
    return 'UNKNOWN';
}

function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatUtc(value, includeDate = true) {
    const date = parseDate(value);
    if (!date) return 'Awaiting solution';
    return date.toLocaleString(undefined, {
        ...(includeDate ? { day: '2-digit', month: 'short', year: 'numeric' } : {}),
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'UTC',
        timeZoneName: 'short',
    });
}

function formatNumber(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return number.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function formatDistance(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    if (number < 1) return `${number.toFixed(3)} km`;
    if (number < 10) return `${number.toFixed(2)} km`;
    return `${number.toFixed(1)} km`;
}

function formatDuration(hours) {
    const value = Number(hours);
    if (!Number.isFinite(value)) return '—';
    if (value < 1) return `${Math.max(0, Math.round(value * 60))} min`;
    if (value < 48) return `${value.toFixed(1)} hr`;
    return `${(value / 24).toFixed(1)} d`;
}

function objectName(object, fallback) {
    return object?.name || object?.object_name || fallback;
}

function objectId(object) {
    return object?.norad_id || object?.id || object?.catalog_number || '—';
}

function objectType(object) {
    return normaliseType(object?.type || object?.object_type);
}

function TypeGlyph({ type, className = 'h-4 w-4' }) {
    const normalised = normaliseType(type);
    if (normalised === 'SATELLITE') return <Satellite className={className} strokeWidth={1.5} />;
    if (normalised === 'ROCKET_BODY') return <Orbit className={className} strokeWidth={1.5} />;
    if (normalised === 'DEBRIS') return <CircleDot className={className} strokeWidth={1.5} />;
    return <Radar className={className} strokeWidth={1.5} />;
}

function RiskBadge({ risk, compact = false }) {
    const level = normaliseRisk(risk);
    return (
        <span
            className={`inline-flex items-center border font-mono uppercase tracking-[0.14em] ${RISK_STYLES[level].badge} ${
                compact ? 'px-2 py-1 text-[8px]' : 'px-2.5 py-1.5 text-[9px]'
            }`}
        >
            {level}
        </span>
    );
}

function SummaryCard({ risk, label, value, detail, icon: Icon }) {
    const styles = RISK_STYLES[risk];
    return (
        <article className={`relative min-h-[118px] overflow-hidden border p-4 ${styles.card}`}>
            <span className={`absolute inset-x-0 bottom-0 h-px opacity-70 ${styles.line}`} />
            <div className="flex items-start justify-between gap-4">
                <div className={`flex h-10 w-10 items-center justify-center border ${styles.icon}`}>
                    <Icon className="h-5 w-5" strokeWidth={1.6} />
                </div>
                <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-slate-600">
                    Events
                </span>
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                    <p className={`font-mono text-3xl leading-none ${styles.value}`}>{formatNumber(value)}</p>
                    <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-300">
                        {label}
                    </p>
                </div>
                <p className="max-w-[120px] text-right font-mono text-[7px] uppercase leading-4 tracking-[0.1em] text-slate-600">
                    {detail}
                </p>
            </div>
        </article>
    );
}

function TotalCard({ total, diagnostics }) {
    return (
        <article className="relative min-h-[118px] overflow-hidden border border-white/[0.09] bg-gradient-to-br from-slate-900/70 via-[#08090c] to-[#050608] p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-white/10 bg-white/[0.035] text-slate-400">
                    <Orbit className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-slate-600">
                    Active
                </span>
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                    <p className="font-mono text-3xl leading-none text-slate-100">{formatNumber(total)}</p>
                    <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-300">
                        Total events
                    </p>
                </div>
                <p className="text-right font-mono text-[7px] uppercase leading-4 tracking-[0.1em] text-slate-600">
                    {formatNumber(diagnostics?.objects_analyzed)} objects<br />screened
                </p>
            </div>
        </article>
    );
}

function FilterSelect({ value, onChange, children, label }) {
    return (
        <label className="relative flex min-w-[128px] items-center border border-white/[0.09] bg-black/20">
            <span className="sr-only">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-10 w-full appearance-none bg-transparent px-3 pr-8 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-300 outline-none"
            >
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-600" />
        </label>
    );
}

function StatusPill({ status, refreshing, hasData }) {
    const normalised = String(status || '').toLowerCase();
    const live = normalised === 'live' || normalised === 'available';
    const warming = refreshing || normalised === 'warming';
    const cached = !live && hasData;

    let classes = 'border-red-500/25 bg-red-500/10 text-red-300';
    let label = 'Offline';
    let DotIcon = WifiOff;

    if (warming) {
        classes = 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300';
        label = hasData ? 'Refreshing' : 'Warming';
        DotIcon = Loader2;
    } else if (live) {
        classes = 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300';
        label = 'Live';
        DotIcon = Activity;
    } else if (cached) {
        classes = 'border-amber-400/25 bg-amber-400/10 text-amber-300';
        label = 'Cached';
        DotIcon = Database;
    }

    return (
        <span className={`inline-flex items-center gap-2 border px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.16em] ${classes}`}>
            <DotIcon className={`h-3.5 w-3.5 ${warming ? 'animate-spin' : ''}`} strokeWidth={1.7} />
            {label}
        </span>
    );
}

function EventRow({ event, selected, onSelect, tracked, acknowledged }) {
    const risk = normaliseRisk(event?.risk_level);
    const objectA = event?.object_a || {};
    const objectB = event?.object_b || {};

    return (
        <button
            type="button"
            onClick={() => onSelect(event)}
            className={`grid w-full grid-cols-[90px_minmax(150px,1.2fr)_minmax(150px,1.2fr)_150px_100px_110px_105px_92px_32px] items-center border-b border-white/[0.065] text-left transition ${
                selected
                    ? 'bg-cyan-300/[0.055] shadow-[inset_2px_0_0_rgba(103,232,249,0.75)]'
                    : 'hover:bg-white/[0.025]'
            }`}
        >
            <span className="px-3 py-3.5">
                <RiskBadge risk={risk} compact />
            </span>
            <span className="min-w-0 px-3 py-3.5">
                <span className="flex items-center gap-2">
                    <TypeGlyph type={objectType(objectA)} className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                    <span className="truncate font-mono text-[9px] uppercase tracking-[0.05em] text-slate-200">
                        {objectName(objectA, 'Object A')}
                    </span>
                </span>
                <span className="mt-1 block truncate font-mono text-[7px] uppercase tracking-[0.1em] text-slate-600">
                    NORAD {objectId(objectA)}
                </span>
            </span>
            <span className="min-w-0 px-3 py-3.5">
                <span className="flex items-center gap-2">
                    <TypeGlyph type={objectType(objectB)} className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    <span className="truncate font-mono text-[9px] uppercase tracking-[0.05em] text-slate-200">
                        {objectName(objectB, 'Object B')}
                    </span>
                </span>
                <span className="mt-1 block truncate font-mono text-[7px] uppercase tracking-[0.1em] text-slate-600">
                    NORAD {objectId(objectB)}
                </span>
            </span>
            <span className="px-3 py-3.5 font-mono text-[8px] leading-4 text-slate-400">
                {formatUtc(event?.closest_approach_utc)}
            </span>
            <span className="px-3 py-3.5 font-mono text-[9px] text-slate-300">
                {formatDuration(event?.time_to_closest_approach_hours)}
            </span>
            <span className="px-3 py-3.5 font-mono text-[9px] text-slate-300">
                {formatDistance(event?.miss_distance_km)}
            </span>
            <span className="px-3 py-3.5 font-mono text-[9px] text-slate-300">
                {Number.isFinite(Number(event?.relative_velocity_km_s))
                    ? `${Number(event.relative_velocity_km_s).toFixed(2)} km/s`
                    : '—'}
            </span>
            <span className={`px-3 py-3.5 font-mono text-[10px] ${RISK_STYLES[risk].value}`}>
                {formatNumber(event?.risk_score, 1)}
                <span className="ml-1 text-[7px] text-slate-600">/100</span>
            </span>
            <span className="flex flex-col items-center gap-1 py-3.5 pr-2">
                {tracked ? <Eye className="h-3 w-3 text-sky-400" /> : null}
                {acknowledged ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : null}
                <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
            </span>
        </button>
    );
}

function EmptyEvents({ warming, error }) {
    return (
        <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center border border-white/10 bg-white/[0.025] text-slate-500">
                {warming ? (
                    <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} />
                ) : error ? (
                    <WifiOff className="h-6 w-6" strokeWidth={1.5} />
                ) : (
                    <Radar className="h-6 w-6" strokeWidth={1.5} />
                )}
            </div>
            <h3 className="mt-5 font-mono text-sm uppercase tracking-[0.18em] text-slate-300">
                {warming ? 'Screening orbital frame' : error ? 'Screening unavailable' : 'No active events'}
            </h3>
            <p className="mt-3 max-w-md font-mono text-[9px] leading-5 tracking-[0.06em] text-slate-600">
                {warming
                    ? 'OrbitOPS is evaluating the latest real CelesTrak/SGP4 frame. The page stays usable while the result is generated.'
                    : error
                        ? error
                        : 'No object pairs crossed the configured screening-distance threshold in the current model horizon.'}
            </p>
        </div>
    );
}

function DetailCell({ label, value, accent = '' }) {
    return (
        <div className="border border-white/[0.065] bg-white/[0.018] p-3">
            <p className="font-mono text-[7px] uppercase tracking-[0.14em] text-slate-600">{label}</p>
            <p className={`mt-1.5 font-mono text-[9px] text-slate-300 ${accent}`}>{value}</p>
        </div>
    );
}

function EncounterVisualization({ event }) {
    const objectA = event?.object_a || {};
    const objectB = event?.object_b || {};
    const nameA = objectName(objectA, 'Object A');
    const nameB = objectName(objectB, 'Object B');

    return (
        <div className="relative h-[205px] overflow-hidden border-y border-white/[0.07] bg-[#020408]">
            <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:40px_40px]" />
            <svg viewBox="0 0 640 240" className="absolute inset-0 h-full w-full" role="img" aria-label="Relative encounter geometry preview">
                <defs>
                    <radialGradient id="earthGlow" cx="50%" cy="20%" r="80%">
                        <stop offset="0%" stopColor="#235d93" stopOpacity="0.95" />
                        <stop offset="55%" stopColor="#0a2441" stopOpacity="0.96" />
                        <stop offset="100%" stopColor="#020712" stopOpacity="1" />
                    </radialGradient>
                    <radialGradient id="eventGlow">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                        <stop offset="25%" stopColor="#ff4d4d" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="#ff2020" stopOpacity="0" />
                    </radialGradient>
                    <filter id="softGlow">
                        <feGaussianBlur stdDeviation="5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>
                <circle cx="320" cy="300" r="145" fill="url(#earthGlow)" stroke="#2f7fbc" strokeOpacity="0.55" />
                <ellipse cx="320" cy="300" rx="210" ry="38" fill="none" stroke="#738195" strokeOpacity="0.16" />
                <ellipse cx="320" cy="300" rx="260" ry="58" fill="none" stroke="#738195" strokeOpacity="0.11" />
                <path d="M 55 45 C 185 65, 248 105, 325 126" fill="none" stroke="#25a7ff" strokeWidth="2" />
                <path d="M 585 40 C 470 60, 410 74, 325 126" fill="none" stroke="#ff3b30" strokeWidth="2" strokeDasharray="7 5" />
                <path d="M 325 126 C 286 164, 267 197, 250 236" fill="none" stroke="#ff3b30" strokeWidth="1.5" strokeDasharray="6 5" opacity="0.8" />
                <circle cx="325" cy="126" r="25" fill="url(#eventGlow)" opacity="0.75" />
                <circle cx="325" cy="126" r="4" fill="#fff" stroke="#ff4545" strokeWidth="2" filter="url(#softGlow)" />
                <text x="65" y="35" fill="#39b8ff" fontSize="11" fontFamily="monospace">{nameA.slice(0, 24)}</text>
                <text x="575" y="31" fill="#ff5c52" fontSize="11" textAnchor="end" fontFamily="monospace">{nameB.slice(0, 24)}</text>
                <text x="343" y="119" fill="#f8fafc" fontSize="10" fontFamily="monospace">CLOSEST APPROACH</text>
            </svg>
            <div className="absolute bottom-3 left-3 border border-white/[0.08] bg-black/45 px-2.5 py-1.5 font-mono text-[7px] uppercase tracking-[0.12em] text-slate-500 backdrop-blur">
                Relative geometry preview · not to scale
            </div>
        </div>
    );
}

function SelectedEventPanel({ event, tracked, acknowledged, onTrack, onAcknowledge, onReport }) {
    if (!event) {
        return (
            <aside className="flex min-h-[620px] items-center justify-center border border-white/[0.09] bg-[#05070a] p-8 text-center">
                <div>
                    <Crosshair className="mx-auto h-8 w-8 text-slate-700" strokeWidth={1.4} />
                    <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        Select a conjunction event
                    </p>
                </div>
            </aside>
        );
    }

    const risk = normaliseRisk(event?.risk_level);
    const objectA = event?.object_a || {};
    const objectB = event?.object_b || {};
    const hasProbability = Number.isFinite(Number(event?.collision_probability));

    return (
        <aside className="overflow-hidden border border-white/[0.09] bg-[#05070a]">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500">Selected event</p>
                    <p className="mt-1 font-mono text-[8px] tracking-[0.06em] text-slate-700">{event.id}</p>
                </div>
                <RiskBadge risk={risk} compact />
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-white/[0.08] px-5 py-5">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sky-400">
                        <TypeGlyph type={objectType(objectA)} className="h-5 w-5 shrink-0" />
                        <p className="truncate font-mono text-sm uppercase tracking-[0.08em] text-slate-100">
                            {objectName(objectA, 'Object A')}
                        </p>
                    </div>
                    <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600">
                        NORAD {objectId(objectA)} · {objectType(objectA).replace('_', ' ')}
                    </p>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-600">vs</span>
                <div className="min-w-0 text-right">
                    <div className="flex items-center justify-end gap-2 text-red-400">
                        <p className="truncate font-mono text-sm uppercase tracking-[0.08em] text-slate-100">
                            {objectName(objectB, 'Object B')}
                        </p>
                        <TypeGlyph type={objectType(objectB)} className="h-5 w-5 shrink-0" />
                    </div>
                    <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600">
                        NORAD {objectId(objectB)} · {objectType(objectB).replace('_', ' ')}
                    </p>
                </div>
            </div>

            <div className="p-4">
                <p className="mb-3 font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">Event details</p>
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                    <DetailCell label="Closest approach" value={formatUtc(event.closest_approach_utc)} />
                    <DetailCell label="Relative velocity" value={Number.isFinite(Number(event.relative_velocity_km_s)) ? `${Number(event.relative_velocity_km_s).toFixed(2)} km/s` : 'Unavailable'} />
                    <DetailCell label="Risk index" value={`${formatNumber(event.risk_score, 1)} / 100`} accent={RISK_STYLES[risk].value} />
                    <DetailCell label="Time to event" value={formatDuration(event.time_to_closest_approach_hours)} />
                    <DetailCell label="Mean altitude" value={Number.isFinite(Number(event.altitude_km)) ? `${formatNumber(event.altitude_km, 0)} km` : 'Unavailable'} />
                    <DetailCell label="Miss distance" value={formatDistance(event.miss_distance_km)} />
                    <DetailCell label="Probability P(c)" value={hasProbability ? Number(event.collision_probability).toExponential(2) : 'Not computed'} />
                    <DetailCell label="Model basis" value={String(event.model_basis || 'screening').replaceAll('-', ' ')} />
                    <DetailCell label="Confidence" value={String(event.confidence || 'screening').toUpperCase()} />
                    <DetailCell
                        label="Lifecycle"
                        value={String(event.lifecycle?.change_type || event.lifecycle?.status || 'active').replaceAll('-', ' ').toUpperCase()}
                    />
                    <DetailCell
                        label="Observations"
                        value={formatNumber(event.lifecycle?.observation_count || 1)}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.08] px-4 py-3">
                <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">Encounter visualization</p>
                <span className="border border-white/10 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.12em] text-slate-500">3D-style view</span>
            </div>
            <EncounterVisualization event={event} />

            <div className="p-4">
                <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">Recommended action</p>
                <div className={`mt-3 flex gap-3 border p-3 ${RISK_STYLES[risk].card}`}>
                    <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${RISK_STYLES[risk].value}`} strokeWidth={1.6} />
                    <div>
                        <p className={`font-mono text-[9px] uppercase tracking-[0.1em] ${RISK_STYLES[risk].value}`}>
                            {risk === 'CRITICAL' || risk === 'HIGH' ? 'Operator review recommended' : 'Continue monitoring'}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-5 text-slate-400">
                            {event.recommendation || 'Refresh tracking data and review the conjunction solution.'}
                        </p>
                        {!hasProbability ? (
                            <p className="mt-2 font-mono text-[7px] uppercase leading-4 tracking-[0.08em] text-slate-600">
                                No operational collision probability is shown because covariance data is unavailable.
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                        type="button"
                        onClick={onAcknowledge}
                        className={`flex h-10 items-center justify-center gap-2 border font-mono text-[8px] uppercase tracking-[0.12em] transition ${
                            acknowledged
                                ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300'
                                : 'border-red-500/35 bg-red-500/[0.07] text-red-300 hover:bg-red-500/15'
                        }`}
                    >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {acknowledged ? 'Acknowledged' : 'Acknowledge'}
                    </button>
                    <button
                        type="button"
                        onClick={onTrack}
                        className={`flex h-10 items-center justify-center gap-2 border font-mono text-[8px] uppercase tracking-[0.12em] transition ${
                            tracked
                                ? 'border-sky-400/35 bg-sky-400/10 text-sky-300'
                                : 'border-sky-400/20 bg-sky-400/[0.04] text-sky-300 hover:bg-sky-400/10'
                        }`}
                    >
                        <Eye className="h-3.5 w-3.5" />
                        {tracked ? 'Tracking' : 'Track event'}
                    </button>
                    <button
                        type="button"
                        onClick={onReport}
                        className="flex h-10 items-center justify-center gap-2 border border-white/10 bg-white/[0.025] font-mono text-[8px] uppercase tracking-[0.12em] text-slate-300 transition hover:bg-white/[0.06]"
                    >
                        <FileText className="h-3.5 w-3.5" />
                        Generate report
                    </button>
                </div>
            </div>
        </aside>
    );
}

function readIdSet(key) {
    try {
        const value = JSON.parse(window.localStorage.getItem(key) || '[]');
        return new Set(Array.isArray(value) ? value : []);
    } catch {
        return new Set();
    }
}

function saveIdSet(key, setValue) {
    try {
        window.localStorage.setItem(key, JSON.stringify([...setValue]));
    } catch {
        // Local state still functions for the active session.
    }
}

function downloadEventReport(event) {
    const payload = {
        generated_at: new Date().toISOString(),
        system: 'OrbitOPS',
        report_type: 'Conjunction Screening Event',
        operational_use: false,
        note: 'This is a baseline screening product. Collision probability is unavailable without covariance data.',
        event,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${event?.id || 'orbitops-conjunction-report'}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function lifecycleFromHistory(record) {
    if (!record || typeof record !== 'object') return null;

    return {
        status: record.status || 'active',
        change_type: record.last_change_type || 'stable',
        first_seen_at: record.first_seen_at || null,
        last_seen_at: record.last_seen_at || null,
        resolved_at: record.resolved_at || null,
        unconfirmed_since: record.unconfirmed_since || null,
        observation_count: Number(record.observation_count || 0),
    };
}

function mergeHistoryIntoPayload(nextPayload, historyPayload) {
    if (!nextPayload || !Array.isArray(nextPayload.events)) {
        return nextPayload;
    }

    const historyRecords = Array.isArray(historyPayload?.events)
        ? historyPayload.events
        : [];

    const historyById = new Map(
        historyRecords
            .filter((record) => record?.id)
            .map((record) => [String(record.id), record])
    );

    const events = nextPayload.events.map((event) => {
        const record = historyById.get(String(event?.id || ''));
        if (!record) return event;

        return {
            ...event,
            lifecycle: {
                ...lifecycleFromHistory(record),
                ...(event.lifecycle || {}),
            },
        };
    });

    return {
        ...nextPayload,
        events,
        history_status:
            nextPayload.history_status ||
            (historyPayload ? 'tracking' : undefined),
        lifecycle_summary:
            nextPayload.lifecycle_summary ||
            historyPayload?.lifecycle_summary,
    };
}

function upsertRealtimeAlert(currentPayload, alert) {
    const eventId = alert?.event_id || alert?.id;
    if (!eventId) return currentPayload;

    const currentEvents = Array.isArray(currentPayload?.events)
        ? currentPayload.events
        : [];
    const existing = currentEvents.find(
        (event) => String(event?.id) === String(eventId)
    ) || {};

    const valuePatch = {
        id: eventId,
        object_a: alert.object_a,
        object_b: alert.object_b,
        risk_level: alert.risk_level,
        screening_priority_level: alert.risk_level,
        risk_score: alert.risk_score,
        screening_priority_score: alert.risk_score,
        miss_distance_km: alert.miss_distance_km,
        closest_approach_utc: alert.closest_approach_utc,
    };

    const definedPatch = Object.fromEntries(
        Object.entries(valuePatch).filter(
            ([, value]) => value !== null && value !== undefined
        )
    );

    const nextEvent = {
        ...existing,
        ...definedPatch,
        lifecycle: {
            ...(existing.lifecycle || {}),
            status:
                alert.status ||
                existing.lifecycle?.status ||
                'active',
            change_type:
                alert.type ||
                alert.change_type ||
                existing.lifecycle?.change_type ||
                'stable',
            last_seen_at:
                alert.observed_at ||
                existing.lifecycle?.last_seen_at ||
                null,
            previous_risk_level:
                alert.previous_risk_level ??
                existing.lifecycle?.previous_risk_level ??
                null,
            previous_risk_score:
                alert.previous_risk_score ??
                existing.lifecycle?.previous_risk_score ??
                null,
            previous_miss_distance_km:
                alert.previous_miss_distance_km ??
                existing.lifecycle?.previous_miss_distance_km ??
                null,
            risk_score_delta:
                alert.risk_score_delta ??
                existing.lifecycle?.risk_score_delta ??
                null,
            miss_distance_delta_km:
                alert.miss_distance_delta_km ??
                existing.lifecycle?.miss_distance_delta_km ??
                null,
        },
    };

    const byId = new Map(
        currentEvents
            .filter((event) => event?.id)
            .map((event) => [String(event.id), event])
    );
    byId.set(String(eventId), nextEvent);

    const events = [...byId.values()]
        .sort((left, right) => {
            const scoreDelta =
                Number(right?.screening_priority_score ?? right?.risk_score ?? 0) -
                Number(left?.screening_priority_score ?? left?.risk_score ?? 0);
            if (scoreDelta !== 0) return scoreDelta;

            return (
                Number(left?.miss_distance_km ?? Number.POSITIVE_INFINITY) -
                Number(right?.miss_distance_km ?? Number.POSITIVE_INFINITY)
            );
        })
        .slice(0, 500);

    return {
        ...(currentPayload || {}),
        events,
        last_updated:
            alert.observed_at ||
            currentPayload?.last_updated,
        history_status: 'tracking',
    };
}

export default function Alerts() {
    const cached = useMemo(() => readCachedConjunctions(), []);
    const [payload, setPayload] = useState(cached || {
        status: 'warming',
        events: [],
        summary: { critical: 0, high: 0, medium: 0, monitored: 0, total: 0 },
        diagnostics: {},
    });
    const [loading, setLoading] = useState(!cached);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [riskFilter, setRiskFilter] = useState('ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [altitudeFilter, setAltitudeFilter] = useState('ALL');
    const [timeFilter, setTimeFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const [selectedId, setSelectedId] = useState(cached?.events?.[0]?.id || null);
    const [trackedIds, setTrackedIds] = useState(() => readIdSet('orbitops-tracked-conjunctions'));
    const [acknowledgedIds, setAcknowledgedIds] = useState(() => readIdSet('orbitops-acknowledged-conjunctions'));
    const [socketConnected, setSocketConnected] = useState(orbitSocket.connected);
    const realtimeHydrationRef = useRef(null);

    const loadData = useCallback(async ({ force = false, quiet = false } = {}) => {
        const controller = new AbortController();
        if (force) setRefreshing(true);
        else if (!quiet) setLoading(true);

        try {
            const [nextPayload, historyPayload] = await Promise.all([
                fetchConjunctions({
                    refresh: force,
                    limit: 500,
                    signal: controller.signal,
                }),
                fetchConjunctionHistory({
                    status: 'active',
                    limit: 1000,
                    signal: controller.signal,
                }).catch(() => null),
            ]);

            const enrichedPayload = mergeHistoryIntoPayload(
                nextPayload,
                historyPayload
            );

            setPayload(enrichedPayload);
            cacheConjunctions(enrichedPayload);
            setError('');
            setSelectedId((current) => {
                if (
                    current &&
                    enrichedPayload.events?.some(
                        (event) => event.id === current
                    )
                ) {
                    return current;
                }
                return enrichedPayload.events?.[0]?.id || null;
            });
        } catch (requestError) {
            if (requestError?.name !== 'AbortError') {
                setError(
                    requestError?.message ||
                    'Unable to connect to the conjunction service.'
                );
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const scheduleRealtimeHydration = useCallback(() => {
        window.clearTimeout(realtimeHydrationRef.current);
        realtimeHydrationRef.current = window.setTimeout(() => {
            loadData({ quiet: true });
        }, 500);
    }, [loadData]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const handleConnect = () => {
            setSocketConnected(true);
            scheduleRealtimeHydration();
        };

        const handleDisconnect = () => {
            setSocketConnected(false);
        };

        const handleScreeningComplete = (message) => {
            if (!message || typeof message !== 'object') return;

            setPayload((current) => ({
                ...current,
                status: message.status ?? current?.status,
                last_updated:
                    message.last_updated ??
                    current?.last_updated,
                source_position_timestamp:
                    message.source_position_timestamp ??
                    current?.source_position_timestamp,
                model_type:
                    message.model_type ??
                    current?.model_type,
                screening_stage:
                    message.screening_stage ??
                    current?.screening_stage,
                coverage_status:
                    message.coverage_status ??
                    current?.coverage_status,
                summary_status:
                    message.summary_status ??
                    current?.summary_status,
                summary:
                    message.summary ??
                    current?.summary,
                lifecycle_summary:
                    message.lifecycle_summary ??
                    current?.lifecycle_summary,
                diagnostics: {
                    ...(current?.diagnostics || {}),
                    ...(message.diagnostics || {}),
                },
                refresh_in_progress: false,
            }));

            scheduleRealtimeHydration();
        };

        const handleBatchUpdate = (message) => {
            if (!message || typeof message !== 'object') return;

            setPayload((current) => {
                let next = {
                    ...current,
                    coverage_status:
                        message.coverage_status ??
                        current?.coverage_status,
                    summary:
                        message.screening_summary ??
                        current?.summary,
                    lifecycle_summary:
                        message.lifecycle_summary ??
                        current?.lifecycle_summary,
                    changes: {
                        ...(current?.changes || {}),
                        generated_at: message.generated_at,
                        counts:
                            message.change_counts ??
                            current?.changes?.counts,
                    },
                    last_updated:
                        message.snapshot_updated_at ??
                        current?.last_updated,
                    history_status: 'tracking',
                };

                for (const alert of message.alerts || []) {
                    next = upsertRealtimeAlert(next, alert);
                }

                return next;
            });

            scheduleRealtimeHydration();
        };

        const handleConjunctionAlert = (alert) => {
            if (!alert || typeof alert !== 'object') return;

            setPayload((current) =>
                upsertRealtimeAlert(current, alert)
            );
            setSelectedId((current) =>
                current || alert.event_id || alert.id || null
            );
            scheduleRealtimeHydration();
        };

        orbitSocket.on('connect', handleConnect);
        orbitSocket.on('disconnect', handleDisconnect);
        orbitSocket.on(
            'conjunction_screening_complete',
            handleScreeningComplete
        );
        orbitSocket.on(
            'conjunction_batch_update',
            handleBatchUpdate
        );
        orbitSocket.on(
            'conjunction_alert',
            handleConjunctionAlert
        );

        setSocketConnected(orbitSocket.connected);
        if (!orbitSocket.connected) orbitSocket.connect();

        return () => {
            orbitSocket.off('connect', handleConnect);
            orbitSocket.off('disconnect', handleDisconnect);
            orbitSocket.off(
                'conjunction_screening_complete',
                handleScreeningComplete
            );
            orbitSocket.off(
                'conjunction_batch_update',
                handleBatchUpdate
            );
            orbitSocket.off(
                'conjunction_alert',
                handleConjunctionAlert
            );
            window.clearTimeout(realtimeHydrationRef.current);
        };
    }, [scheduleRealtimeHydration]);

    useEffect(() => {
        const warming =
            payload?.status === 'warming' ||
            payload?.refresh_in_progress;
        const intervalMs = warming
            ? 2500
            : socketConnected
                ? 120000
                : 30000;

        const interval = window.setInterval(
            () => loadData({ quiet: true }),
            intervalMs
        );

        return () => window.clearInterval(interval);
    }, [
        loadData,
        payload?.refresh_in_progress,
        payload?.status,
        socketConnected,
    ]);

    const events = useMemo(
        () => (Array.isArray(payload?.events) ? payload.events : []),
        [payload?.events]
    );

    const filteredEvents = useMemo(() => {
        const term = query.trim().toLowerCase();
        const now = Date.now();

        return [...events]
            .filter((event) => {
                const risk = normaliseRisk(event?.risk_level);
                if (riskFilter !== 'ALL' && risk !== riskFilter) return false;

                const typeA = objectType(event?.object_a);
                const typeB = objectType(event?.object_b);
                if (typeFilter !== 'ALL' && typeA !== typeFilter && typeB !== typeFilter) return false;

                const altitude = toNumber(event?.altitude_km);
                if (altitudeFilter === 'LEO' && !(altitude !== null && altitude < 2000)) return false;
                if (altitudeFilter === 'MEO' && !(altitude !== null && altitude >= 2000 && altitude < 35786)) return false;
                if (altitudeFilter === 'GEO' && !(altitude !== null && altitude >= 35786)) return false;

                const eventTime = parseDate(event?.closest_approach_utc)?.getTime();
                if (timeFilter !== 'ALL' && eventTime) {
                    const hours = (eventTime - now) / 3_600_000;
                    if (timeFilter === '6H' && hours > 6) return false;
                    if (timeFilter === '12H' && hours > 12) return false;
                    if (timeFilter === '24H' && hours > 24) return false;
                }

                if (!term) return true;
                const searchText = [
                    event?.id,
                    objectName(event?.object_a, ''),
                    objectId(event?.object_a),
                    objectName(event?.object_b, ''),
                    objectId(event?.object_b),
                    event?.risk_level,
                ].join(' ').toLowerCase();
                return searchText.includes(term);
            })
            .sort((a, b) => {
                const riskDelta = RISK_ORDER[normaliseRisk(b?.risk_level)] - RISK_ORDER[normaliseRisk(a?.risk_level)];
                if (riskDelta !== 0) return riskDelta;
                return Number(b?.risk_score || 0) - Number(a?.risk_score || 0);
            });
    }, [altitudeFilter, events, query, riskFilter, timeFilter, typeFilter]);

    useEffect(() => {
        setPage(1);
    }, [query, riskFilter, typeFilter, altitudeFilter, timeFilter]);

    const pageCount = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
    useEffect(() => {
        setPage((current) => Math.min(current, pageCount));
    }, [pageCount]);

    const visibleEvents = filteredEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const selectedEvent = events.find((event) => event.id === selectedId) || visibleEvents[0] || events[0] || null;
    const summary = payload?.summary || {};
    const hasData = events.length > 0;
    const isWarming = loading || payload?.status === 'warming' || payload?.refresh_in_progress;

    const toggleTracked = () => {
        if (!selectedEvent?.id) return;
        setTrackedIds((current) => {
            const next = new Set(current);
            if (next.has(selectedEvent.id)) next.delete(selectedEvent.id);
            else next.add(selectedEvent.id);
            saveIdSet('orbitops-tracked-conjunctions', next);
            return next;
        });
    };

    const toggleAcknowledged = () => {
        if (!selectedEvent?.id) return;
        setAcknowledgedIds((current) => {
            const next = new Set(current);
            if (next.has(selectedEvent.id)) next.delete(selectedEvent.id);
            else next.add(selectedEvent.id);
            saveIdSet('orbitops-acknowledged-conjunctions', next);
            return next;
        });
    };

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-[#020304] text-slate-100">
            <div className="mx-auto w-full max-w-[1900px] p-4 sm:p-5 xl:p-6">
                <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-5 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Collision risk assessment</p>
                        <h1 className="mt-2 font-mono text-2xl uppercase tracking-[0.08em] text-white sm:text-3xl">Conjunctions</h1>
                        <p className="mt-2 max-w-2xl font-mono text-[8px] uppercase leading-5 tracking-[0.1em] text-slate-600">
                            Screening-grade relative-motion analysis from the latest real CelesTrak frame propagated with SGP4.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="border-l border-white/[0.08] pl-4">
                            <p className="font-mono text-[7px] uppercase tracking-[0.16em] text-slate-600">Data source</p>
                            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-300">
                                {payload?.source || 'CelesTrak'} + {payload?.propagator || 'SGP4'}
                            </p>
                        </div>
                        <div className="border-l border-white/[0.08] pl-4">
                            <p className="font-mono text-[7px] uppercase tracking-[0.16em] text-slate-600">Last updated</p>
                            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-slate-300">
                                {payload?.last_updated ? formatUtc(payload.last_updated) : 'Awaiting result'}
                            </p>
                        </div>
                        <StatusPill status={payload?.status} refreshing={refreshing || payload?.refresh_in_progress} hasData={hasData} />
                        <button
                            type="button"
                            onClick={() => loadData({ force: true })}
                            disabled={refreshing}
                            className="flex h-10 items-center gap-2 border border-white/10 bg-white/[0.025] px-4 font-mono text-[8px] uppercase tracking-[0.14em] text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh now
                        </button>
                    </div>
                </header>

                <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <SummaryCard risk="CRITICAL" label="Critical" value={summary.critical || 0} detail="Immediate operator review" icon={ShieldAlert} />
                    <SummaryCard risk="HIGH" label="High risk" value={summary.high || 0} detail="Priority tracking" icon={AlertTriangle} />
                    <SummaryCard risk="MEDIUM" label="Medium risk" value={summary.medium || 0} detail="Enhanced monitoring" icon={Clock3} />
                    <SummaryCard risk="MONITORED" label="Monitored" value={summary.monitored || 0} detail="Routine watchlist" icon={Eye} />
                    <TotalCard total={summary.total ?? events.length} diagnostics={payload?.diagnostics} />
                </section>

                <section className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(470px,1fr)]">
                    <div className="min-w-0 overflow-hidden border border-white/[0.09] bg-[#05070a]">
                        <div className="flex flex-col gap-3 border-b border-white/[0.08] p-3 xl:flex-row xl:items-center">
                            <label className="relative min-w-0 flex-1">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Search by object name, NORAD ID, or event ID..."
                                    className="h-10 w-full border border-white/[0.09] bg-black/20 pl-9 pr-3 font-mono text-[9px] tracking-[0.05em] text-slate-300 outline-none placeholder:text-slate-700 focus:border-cyan-400/30"
                                />
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <FilterSelect value={riskFilter} onChange={setRiskFilter} label="Risk filter">
                                    <option value="ALL">Risk: all</option>
                                    <option value="CRITICAL">Critical</option>
                                    <option value="HIGH">High</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="MONITORED">Monitored</option>
                                </FilterSelect>
                                <FilterSelect value={typeFilter} onChange={setTypeFilter} label="Object type filter">
                                    <option value="ALL">Type: all</option>
                                    <option value="SATELLITE">Satellite</option>
                                    <option value="DEBRIS">Debris</option>
                                    <option value="ROCKET_BODY">Rocket body</option>
                                </FilterSelect>
                                <FilterSelect value={altitudeFilter} onChange={setAltitudeFilter} label="Altitude filter">
                                    <option value="ALL">Altitude: all</option>
                                    <option value="LEO">LEO</option>
                                    <option value="MEO">MEO</option>
                                    <option value="GEO">GEO+</option>
                                </FilterSelect>
                                <FilterSelect value={timeFilter} onChange={setTimeFilter} label="Time window filter">
                                    <option value="ALL">Window: {payload?.horizon_hours || 24} hr</option>
                                    <option value="6H">Next 6 hr</option>
                                    <option value="12H">Next 12 hr</option>
                                    <option value="24H">Next 24 hr</option>
                                </FilterSelect>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuery('');
                                        setRiskFilter('ALL');
                                        setTypeFilter('ALL');
                                        setAltitudeFilter('ALL');
                                        setTimeFilter('ALL');
                                    }}
                                    className="flex h-10 w-10 items-center justify-center border border-white/[0.09] bg-black/20 text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
                                    title="Reset filters"
                                >
                                    <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <div className="min-w-[1130px]">
                                <div className="grid grid-cols-[90px_minmax(150px,1.2fr)_minmax(150px,1.2fr)_150px_100px_110px_105px_92px_32px] border-b border-white/[0.08] bg-white/[0.018] font-mono text-[7px] uppercase tracking-[0.1em] text-slate-500">
                                    <span className="px-3 py-3">Risk</span>
                                    <span className="px-3 py-3">Object A</span>
                                    <span className="px-3 py-3">Object B</span>
                                    <span className="px-3 py-3">Closest approach (UTC)</span>
                                    <span className="px-3 py-3">Time to CA</span>
                                    <span className="px-3 py-3">Miss distance</span>
                                    <span className="px-3 py-3">Rel. velocity</span>
                                    <span className="px-3 py-3">Risk index</span>
                                    <span />
                                </div>

                                {visibleEvents.length > 0 ? (
                                    visibleEvents.map((event) => (
                                        <EventRow
                                            key={event.id}
                                            event={event}
                                            selected={selectedEvent?.id === event.id}
                                            onSelect={(nextEvent) => setSelectedId(nextEvent.id)}
                                            tracked={trackedIds.has(event.id)}
                                            acknowledged={acknowledgedIds.has(event.id)}
                                        />
                                    ))
                                ) : (
                                    <EmptyEvents warming={isWarming} error={error} />
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-white/[0.08] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-slate-600">
                                Showing {filteredEvents.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filteredEvents.length)} of {formatNumber(filteredEvents.length)} events
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                                    disabled={page <= 1}
                                    className="flex h-8 w-8 items-center justify-center border border-white/[0.09] text-slate-500 transition hover:bg-white/[0.04] disabled:opacity-30"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="min-w-[70px] text-center font-mono text-[8px] uppercase tracking-[0.1em] text-slate-500">
                                    {page} / {pageCount}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                                    disabled={page >= pageCount}
                                    className="flex h-8 w-8 items-center justify-center border border-white/[0.09] text-slate-500 transition hover:bg-white/[0.04] disabled:opacity-30"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <SelectedEventPanel
                        event={selectedEvent}
                        tracked={selectedEvent ? trackedIds.has(selectedEvent.id) : false}
                        acknowledged={selectedEvent ? acknowledgedIds.has(selectedEvent.id) : false}
                        onTrack={toggleTracked}
                        onAcknowledge={toggleAcknowledged}
                        onReport={() => selectedEvent && downloadEventReport(selectedEvent)}
                    />
                </section>

                <footer className="mt-4 flex flex-col gap-2 border-t border-white/[0.07] pt-4 font-mono text-[7px] uppercase leading-4 tracking-[0.1em] text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        Model: {String(payload?.model_type || 'baseline-screening').replaceAll('-', ' ')} · Horizon {payload?.horizon_hours || 24} hr · Threshold {payload?.screening_distance_km || 75} km · Coverage {String(payload?.coverage_status || 'unknown')}
                    </span>
                    <span>
                        Screening product only · Not an operational collision-avoidance determination
                    </span>
                </footer>
            </div>
        </div>
    );
}
