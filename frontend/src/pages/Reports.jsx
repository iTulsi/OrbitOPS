import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    Bot,
    CalendarClock,
    CheckCircle2,
    Clock3,
    Database,
    Download,
    FileJson,
    FileText,
    Gauge,
    Loader2,
    Orbit,
    Printer,
    Radio,
    RefreshCw,
    Rocket,
    Satellite,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Trash2,
    WifiOff,
} from 'lucide-react';
import {
    exportReportJson,
    fetchAiBriefing,
    fetchReportSnapshot,
    readCachedAiBriefing,
    readCachedReportSnapshot,
} from '../services/reportsApi';

const NUMBER = new Intl.NumberFormat('en-US');

const RISK_TONES = {
    CRITICAL: {
        text: 'text-rose-300',
        border: 'border-rose-400/30',
        background: 'bg-rose-400/[0.07]',
        dot: 'bg-rose-400',
    },
    HIGH: {
        text: 'text-orange-300',
        border: 'border-orange-400/30',
        background: 'bg-orange-400/[0.07]',
        dot: 'bg-orange-400',
    },
    MEDIUM: {
        text: 'text-amber-300',
        border: 'border-amber-400/30',
        background: 'bg-amber-400/[0.07]',
        dot: 'bg-amber-400',
    },
    LOW: {
        text: 'text-emerald-300',
        border: 'border-emerald-400/30',
        background: 'bg-emerald-400/[0.07]',
        dot: 'bg-emerald-400',
    },
    NOMINAL: {
        text: 'text-emerald-300',
        border: 'border-emerald-400/30',
        background: 'bg-emerald-400/[0.07]',
        dot: 'bg-emerald-400',
    },
    UNKNOWN: {
        text: 'text-slate-400',
        border: 'border-white/10',
        background: 'bg-white/[0.03]',
        dot: 'bg-slate-500',
    },
};

const SECTION_META = [
    { key: 'mission', number: '01', title: 'MISSION STATUS', icon: ShieldCheck, accent: '#22d3ee' },
    { key: 'risk', number: '02', title: 'KEY RISK OBSERVATIONS', icon: AlertTriangle, accent: '#f59e0b' },
    { key: 'environment', number: '03', title: 'ORBITAL ENVIRONMENT', icon: Orbit, accent: '#a855f7' },
    { key: 'actions', number: '04', title: 'RECOMMENDED OPERATOR ACTIONS', icon: Gauge, accent: '#34d399' },
    { key: 'final', number: '05', title: 'FINAL RISK LEVEL', icon: ShieldAlert, accent: '#fb7185' },
];

function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function firstNumber(object, keys, fallback = 0) {
    for (const key of keys) {
        const value = object?.[key];
        if (value !== undefined && value !== null && value !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return fallback;
}

function firstText(object, keys, fallback = '') {
    for (const key of keys) {
        const value = object?.[key];
        if (value !== undefined && value !== null && String(value).trim()) {
            return String(value).trim();
        }
    }
    return fallback;
}

function formatNumber(value) {
    return NUMBER.format(safeNumber(value));
}

function formatDateTime(value) {
    if (!value) return 'Awaiting first update';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatAge(value) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';

    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function readCountFromText(text, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(text || '').match(new RegExp(`${escaped}\\s*[:=-]?\\s*([\\d,]+)`, 'i'));
    return match ? safeNumber(match[1].replaceAll(',', '')) : 0;
}

function riskLevelFromText(text) {
    const match = String(text || '').match(/(?:final\s+risk\s+level|risk\s+level)\s*[:=-]?\s*(critical|high|medium|low|nominal)/i);
    return match ? match[1].toUpperCase() : '';
}

function stripHeading(text, patterns) {
    let result = String(text || '').trim();
    for (const pattern of patterns) {
        result = result.replace(pattern, '').trim();
    }
    return result;
}

function parseBriefing(rawText) {
    const text = String(rawText || '')
        .replace(/\r/g, '')
        .replace(/\*\*/g, '')
        .replace(/#{1,6}\s*/g, '')
        .trim();

    if (!text) return {};

    const definitions = [
        {
            key: 'mission',
            start: /(?:^|\n|\s)1[.)]?\s*Mission Status\s*[:\-]?/i,
            end: /(?:^|\n|\s)2[.)]?\s*Key Risk Observations\s*[:\-]?/i,
        },
        {
            key: 'risk',
            start: /(?:^|\n|\s)2[.)]?\s*Key Risk Observations\s*[:\-]?/i,
            end: /(?:^|\n|\s)3[.)]?\s*(?:Satellite\/Debris Situation|Orbital Environment|Situation Classification)\s*[:\-]?/i,
        },
        {
            key: 'environment',
            start: /(?:^|\n|\s)3[.)]?\s*(?:Satellite\/Debris Situation|Orbital Environment|Situation Classification)\s*[:\-]?/i,
            end: /(?:^|\n|\s)4[.)]?\s*Recommended Operator Actions\s*[:\-]?/i,
        },
        {
            key: 'actions',
            start: /(?:^|\n|\s)4[.)]?\s*Recommended Operator Actions\s*[:\-]?/i,
            end: /(?:^|\n|\s)5[.)]?\s*Final Risk Level\s*[:\-]?/i,
        },
        {
            key: 'final',
            start: /(?:^|\n|\s)5[.)]?\s*Final Risk Level\s*[:\-]?/i,
            end: null,
        },
    ];

    const sections = {};

    for (const definition of definitions) {
        const startMatch = definition.start.exec(text);
        if (!startMatch) continue;

        const startIndex = startMatch.index + startMatch[0].length;
        const tail = text.slice(startIndex);
        const endMatch = definition.end?.exec(tail);
        const body = endMatch ? tail.slice(0, endMatch.index) : tail;

        sections[definition.key] = body
            .replace(/^\s*[.:\-–—]+\s*/, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    if (Object.keys(sections).length === 0) {
        sections.mission = text.replace(/\s+/g, ' ').trim();
    }

    return sections;
}

function normaliseType(value) {
    const type = String(value || '').toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
    if (type.includes('DEBRIS')) return 'DEBRIS';
    if (type.includes('ROCKET') || type.includes('R_B')) return 'ROCKET_BODY';
    if (type.includes('SAT') || type.includes('PAYLOAD')) return 'SATELLITE';
    return 'UNKNOWN';
}

function deriveReport(snapshot, ai) {
    const stats = snapshot?.stats || {};
    const classification = stats?.classification || snapshot?.data_status?.classification || {};
    const conjunctions = snapshot?.conjunctions || {};
    const events = Array.isArray(conjunctions?.events) ? conjunctions.events : [];
    const briefingText = ai?.briefing || '';

    const eventCounts = events.reduce(
        (accumulator, event) => {
            const key = String(event?.risk_level || event?.severity || 'MONITORED').toUpperCase();
            accumulator[key] = (accumulator[key] || 0) + 1;
            return accumulator;
        },
        { CRITICAL: 0, HIGH: 0, MEDIUM: 0, MONITORED: 0 },
    );

    const summary = conjunctions?.summary || {};
    for (const key of ['CRITICAL', 'HIGH', 'MEDIUM', 'MONITORED']) {
        const lower = key.toLowerCase();
        const summaryValue = firstNumber(summary, [lower, `${lower}_events`, `${lower}_count`], 0);
        if (summaryValue > eventCounts[key]) eventCounts[key] = summaryValue;
    }

    const tracked = firstNumber(stats, ['total_objects', 'tracked_objects', 'total', 'objects'], 0) ||
        firstNumber(snapshot?.data_status, ['objects', 'total_objects'], 0) ||
        readCountFromText(briefingText, 'tracking');
    const satellites = firstNumber(stats, ['active_satellites', 'satellites', 'satellite_count', 'payloads'], 0) ||
        firstNumber(classification, ['active_satellites', 'satellites', 'satellite_count', 'payloads'], 0) ||
        readCountFromText(briefingText, 'Active satellites');
    const debris = firstNumber(stats, ['debris', 'debris_objects', 'debris_count'], 0) ||
        firstNumber(classification, ['debris', 'debris_objects', 'debris_count'], 0) ||
        readCountFromText(briefingText, 'Debris');
    const rocketBodies = firstNumber(stats, ['rocket_bodies', 'rocket_body_count', 'rockets'], 0) ||
        firstNumber(classification, ['rocket_bodies', 'rocket_body_count', 'rockets'], 0) ||
        readCountFromText(briefingText, 'Rocket bodies');

    let riskLevel = firstText(stats, ['risk_level', 'mission_risk_level', 'overall_risk'], '').toUpperCase();
    if (!riskLevel) riskLevel = riskLevelFromText(briefingText);
    if (!riskLevel) {
        if (eventCounts.CRITICAL > 0) riskLevel = 'CRITICAL';
        else if (eventCounts.HIGH > 0) riskLevel = 'HIGH';
        else if (eventCounts.MEDIUM > 0) riskLevel = 'MEDIUM';
        else if (events.length > 0) riskLevel = 'LOW';
        else riskLevel = 'UNKNOWN';
    }

    const source = firstText(
        snapshot?.data_status,
        ['source', 'source_name'],
        firstText(snapshot?.stats_meta, ['source'], 'CelesTrak'),
    );
    const propagator = firstText(snapshot?.data_status, ['propagator'], firstText(conjunctions, ['propagator'], 'SGP4'));
    const sourceStatus = firstText(snapshot?.data_status, ['status', 'source_status'], 'unknown').toLowerCase();
    const lastUpdated =
        snapshot?.data_status?.positions_generated_at ||
        snapshot?.data_status?.last_successful_fetch ||
        conjunctions?.last_updated ||
        snapshot?.stats_meta?.last_updated ||
        snapshot?.generated_at ||
        null;

    const parsed = parseBriefing(briefingText);
    const sectionFallbacks = {
        mission: tracked > 0
            ? `OrbitOPS is monitoring ${formatNumber(tracked)} propagated orbital objects from the ${source} data pipeline.`
            : `OrbitOPS is connected to the ${source} orbital data pipeline.`,
        risk: events.length > 0
            ? `${formatNumber(eventCounts.CRITICAL)} critical and ${formatNumber(eventCounts.HIGH)} high-priority conjunction events are present in the latest screening frame.`
            : 'No conjunction event summary is currently available from the screening service.',
        environment: `Current classification: ${formatNumber(satellites)} satellites, ${formatNumber(debris)} debris objects, and ${formatNumber(rocketBodies)} rocket bodies.`,
        actions: eventCounts.CRITICAL + eventCounts.HIGH > 0
            ? 'Prioritise the highest-ranked conjunctions, refresh tracking for the involved objects, and review miss-distance and relative-velocity evidence before taking action.'
            : 'Continue routine monitoring and refresh the orbital frame when newer source elements become available.',
        final: `Current mission risk level: ${riskLevel}.`,
    };

    const sections = SECTION_META.map((meta) => ({
        ...meta,
        body: meta.key === 'environment' && (tracked > 0 || satellites > 0 || debris > 0 || rocketBodies > 0)
            ? sectionFallbacks.environment
            : parsed[meta.key] || sectionFallbacks[meta.key],
    }));

    return {
        tracked,
        satellites,
        debris,
        rocketBodies,
        riskLevel,
        source,
        propagator,
        sourceStatus,
        lastUpdated,
        events,
        eventCounts,
        sections,
        aiModel: ai?.model || 'Deterministic live-data summary',
        aiStatus: ai?.status || 'derived',
        aiMessage: ai?.message || null,
        snapshotWarnings: snapshot?.warnings || [],
    };
}

function MetricCard({ icon: Icon, label, value, accent, detail }) {
    return (
        <article className="min-h-[108px] border border-white/[0.09] bg-[#080b10]/90 px-4 py-4">
            <div className="flex items-center gap-2.5">
                <Icon size={17} style={{ color: accent }} />
                <span className="font-mono text-[9px] tracking-[0.11em] text-slate-500">{label}</span>
            </div>
            <div className="mt-3 font-mono text-[25px] tracking-[0.08em]" style={{ color: accent }}>
                {value}
            </div>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-700">{detail}</p>
        </article>
    );
}

function RiskBadge({ level }) {
    const key = RISK_TONES[level] ? level : 'UNKNOWN';
    const tone = RISK_TONES[key];
    return (
        <span className={`inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-[9px] tracking-[0.1em] ${tone.border} ${tone.background} ${tone.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {key}
        </span>
    );
}

function ReportSelector({ selected, onSelect, report }) {
    const items = [
        {
            id: 'briefing',
            icon: Bot,
            title: 'AI Mission Briefing',
            subtitle: 'Live operational assessment',
            tone: '#22d3ee',
            status: report.riskLevel,
        },
        {
            id: 'conjunctions',
            icon: AlertTriangle,
            title: 'Conjunction Summary',
            subtitle: `${formatNumber(report.events.length)} screened events`,
            tone: '#fb7185',
            status: report.eventCounts.CRITICAL > 0 ? 'CRITICAL' : report.eventCounts.HIGH > 0 ? 'HIGH' : 'LIVE',
        },
        {
            id: 'environment',
            icon: Orbit,
            title: 'Orbital Environment',
            subtitle: 'Population classification',
            tone: '#a855f7',
            status: 'LIVE',
        },
        {
            id: 'health',
            icon: Activity,
            title: 'Pipeline Health',
            subtitle: `${report.source} + ${report.propagator}`,
            tone: '#34d399',
            status: report.sourceStatus === 'offline' ? 'OFFLINE' : 'NOMINAL',
        },
    ];

    return (
        <nav className="space-y-2" aria-label="Available live reports">
            {items.map((item) => {
                const Icon = item.icon;
                const active = selected === item.id;
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        className={`w-full border px-3 py-3 text-left transition ${active ? 'border-cyan-400/45 bg-cyan-400/[0.06]' : 'border-white/[0.08] bg-white/[0.018] hover:border-white/[0.16] hover:bg-white/[0.035]'}`}
                    >
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-white/[0.08] bg-black/30">
                                <Icon size={16} style={{ color: item.tone }} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[12px] font-medium text-slate-200">{item.title}</p>
                                <p className="mt-0.5 truncate text-[9px] text-slate-600">{item.subtitle}</p>
                                <p className="mt-2 font-mono text-[8px] tracking-[0.1em]" style={{ color: item.tone }}>{item.status}</p>
                            </div>
                        </div>
                    </button>
                );
            })}
        </nav>
    );
}

function RiskOverview({ report }) {
    const counts = report.eventCounts;
    const total = counts.CRITICAL + counts.HIGH + counts.MEDIUM + counts.MONITORED;
    const criticalEnd = total ? (counts.CRITICAL / total) * 360 : 0;
    const highEnd = total ? criticalEnd + (counts.HIGH / total) * 360 : criticalEnd;
    const mediumEnd = total ? highEnd + (counts.MEDIUM / total) * 360 : highEnd;
    const gradient = total
        ? `conic-gradient(#fb4358 0deg ${criticalEnd}deg, #fb923c ${criticalEnd}deg ${highEnd}deg, #fbbf24 ${highEnd}deg ${mediumEnd}deg, #3b82f6 ${mediumEnd}deg 360deg)`
        : 'conic-gradient(#1f2937 0deg 360deg)';

    const rows = [
        ['Critical', counts.CRITICAL, '#fb4358'],
        ['High', counts.HIGH, '#fb923c'],
        ['Medium', counts.MEDIUM, '#fbbf24'],
        ['Monitored', counts.MONITORED, '#3b82f6'],
    ];

    return (
        <section className="border border-white/[0.09] bg-[#080b10]/90 p-4">
            <h3 className="font-mono text-[10px] tracking-[0.12em] text-slate-300">RISK OVERVIEW</h3>
            <div className="mt-5 flex items-center gap-5">
                <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: gradient }}>
                    <div className="absolute inset-[15px] flex flex-col items-center justify-center rounded-full bg-[#080b10]">
                        <span className="font-mono text-2xl text-white">{formatNumber(total)}</span>
                        <span className="font-mono text-[7px] tracking-[0.12em] text-slate-600">EVENTS</span>
                    </div>
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                    {rows.map(([label, value, color]) => (
                        <div key={label} className="flex items-center justify-between gap-3 font-mono text-[9px]">
                            <span className="flex items-center gap-2 text-slate-500">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                                {label}
                            </span>
                            <span className="text-slate-200">{formatNumber(value)}</span>
                        </div>
                    ))}
                </div>
            </div>
            {!total ? (
                <p className="mt-4 border-t border-white/[0.06] pt-3 text-[9px] leading-4 text-slate-600">
                    The conjunction service has not returned an event frame yet.
                </p>
            ) : null}
        </section>
    );
}

function DataQuality({ report }) {
    const live = ['live', 'ok', 'available', 'partial-live', 'cached-fresh'].includes(report.sourceStatus);
    const rows = [
        ['Source frame', formatAge(report.lastUpdated), live ? '#34d399' : '#f59e0b'],
        ['Catalog source', report.source, '#e2e8f0'],
        ['Propagator', report.propagator, '#e2e8f0'],
        ['Pipeline', live ? 'Available' : report.sourceStatus || 'Unknown', live ? '#34d399' : '#f59e0b'],
    ];

    return (
        <section className="border border-white/[0.09] bg-[#080b10]/90 p-4">
            <h3 className="font-mono text-[10px] tracking-[0.12em] text-slate-300">DATA QUALITY</h3>
            <div className="mt-3 divide-y divide-white/[0.06]">
                {rows.map(([label, value, color]) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-3 font-mono text-[9px]">
                        <span className="text-slate-600">{label}</span>
                        <span className="max-w-[150px] truncate text-right" style={{ color }}>{value}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function AssessmentPanel({ report }) {
    return (
        <section className="border border-white/[0.09] bg-[#080b10]/90 p-5 lg:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
                <div>
                    <h2 className="font-mono text-[13px] tracking-[0.12em] text-slate-100">MISSION ASSESSMENT</h2>
                    <p className="mt-1 text-[9px] text-slate-600">Generated from current OrbitOPS telemetry and screening outputs.</p>
                </div>
                <span className="font-mono text-[8px] tracking-[0.1em] text-slate-600">{report.aiModel}</span>
            </div>

            <div className="space-y-1">
                {report.sections.map((section) => {
                    const Icon = section.icon;
                    return (
                        <article key={section.key} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 border-b border-white/[0.045] py-4 last:border-b-0">
                            <div className="flex h-8 w-8 items-center justify-center border border-white/[0.07] bg-black/20">
                                <Icon size={16} style={{ color: section.accent }} />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.09em] text-slate-300">
                                    <span className="text-slate-700">{section.number}</span>
                                    <h3>{section.title}</h3>
                                </div>
                                <p className="mt-2 max-w-4xl text-[12px] leading-6 text-slate-400">{section.body}</p>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function ConjunctionPanel({ report }) {
    const events = report.events.slice(0, 10);
    return (
        <section className="border border-white/[0.09] bg-[#080b10]/90">
            <header className="border-b border-white/[0.07] px-5 py-4">
                <h2 className="font-mono text-[13px] tracking-[0.12em] text-slate-100">CONJUNCTION SUMMARY</h2>
                <p className="mt-1 text-[9px] text-slate-600">Highest-ranked events from the current screening frame.</p>
            </header>
            {events.length ? (
                <div className="divide-y divide-white/[0.055]">
                    {events.map((event) => {
                        const level = String(event?.risk_level || 'MONITORED').toUpperCase();
                        const tone = RISK_TONES[level] || RISK_TONES.UNKNOWN;
                        return (
                            <article key={event?.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[92px_minmax(0,1fr)_115px_115px] sm:items-center">
                                <span className={`inline-flex w-fit border px-2 py-1 font-mono text-[8px] ${tone.border} ${tone.background} ${tone.text}`}>{level}</span>
                                <div className="min-w-0">
                                    <p className="truncate font-mono text-[10px] text-slate-200">
                                        {event?.object_a?.name || event?.object_a?.norad_id || 'Object A'}
                                        <span className="mx-2 text-slate-700">/</span>
                                        {event?.object_b?.name || event?.object_b?.norad_id || 'Object B'}
                                    </p>
                                    <p className="mt-1 truncate font-mono text-[8px] text-slate-700">{event?.id}</p>
                                </div>
                                <div className="font-mono text-[8px] text-slate-600">
                                    MISS DISTANCE
                                    <div className="mt-1 text-[10px] text-slate-300">{safeNumber(event?.miss_distance_km).toFixed(3)} km</div>
                                </div>
                                <div className="font-mono text-[8px] text-slate-600">
                                    REL. VELOCITY
                                    <div className="mt-1 text-[10px] text-slate-300">{safeNumber(event?.relative_velocity_km_s).toFixed(2)} km/s</div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="flex min-h-[360px] items-center justify-center p-8 text-center">
                    <div>
                        <Orbit size={28} className="mx-auto text-slate-700" />
                        <p className="mt-4 font-mono text-[11px] tracking-[0.12em] text-slate-500">AWAITING CONJUNCTION FRAME</p>
                        <p className="mt-2 text-[10px] text-slate-700">The page will update when the screening service returns events.</p>
                    </div>
                </div>
            )}
        </section>
    );
}

function EnvironmentPanel({ report }) {
    const totalClassified = report.satellites + report.debris + report.rocketBodies;
    const rows = [
        { label: 'Satellites', value: report.satellites, icon: Satellite, color: '#a855f7' },
        { label: 'Debris', value: report.debris, icon: Trash2, color: '#fb4358' },
        { label: 'Rocket bodies', value: report.rocketBodies, icon: Rocket, color: '#fb923c' },
    ];

    return (
        <section className="border border-white/[0.09] bg-[#080b10]/90 p-5">
            <h2 className="font-mono text-[13px] tracking-[0.12em] text-slate-100">ORBITAL ENVIRONMENT</h2>
            <p className="mt-1 text-[9px] text-slate-600">Live object classification from the current propagated frame.</p>
            <div className="mt-6 space-y-4">
                {rows.map((row) => {
                    const Icon = row.icon;
                    const share = totalClassified > 0 ? (row.value / totalClassified) * 100 : 0;
                    return (
                        <div key={row.label} className="border border-white/[0.07] bg-black/20 p-4">
                            <div className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
                                    <Icon size={15} style={{ color: row.color }} />
                                    {row.label.toUpperCase()}
                                </span>
                                <span className="font-mono text-[18px] text-slate-100">{formatNumber(row.value)}</span>
                            </div>
                            <div className="mt-3 h-1 overflow-hidden bg-slate-900">
                                <div className="h-full" style={{ width: `${share}%`, backgroundColor: row.color }} />
                            </div>
                            <p className="mt-2 text-right font-mono text-[8px] text-slate-700">{share.toFixed(1)}% OF CLASSIFIED OBJECTS</p>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function HealthPanel({ report }) {
    const live = ['live', 'ok', 'available', 'partial-live', 'cached-fresh'].includes(report.sourceStatus);
    const rows = [
        { label: 'CelesTrak source', value: report.source, good: live },
        { label: 'SGP4 propagation', value: report.propagator, good: Boolean(report.propagator) },
        { label: 'Current object frame', value: `${formatNumber(report.tracked)} objects`, good: report.tracked > 0 },
        { label: 'Latest update', value: formatDateTime(report.lastUpdated), good: Boolean(report.lastUpdated) },
    ];

    return (
        <section className="border border-white/[0.09] bg-[#080b10]/90 p-5">
            <h2 className="font-mono text-[13px] tracking-[0.12em] text-slate-100">PIPELINE HEALTH</h2>
            <p className="mt-1 text-[9px] text-slate-600">Source and propagation state used by this report.</p>
            <div className="mt-5 divide-y divide-white/[0.06] border border-white/[0.07] bg-black/20 px-4">
                {rows.map((row) => (
                    <div key={row.label} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-mono text-[9px] text-slate-600">{row.label.toUpperCase()}</span>
                        <span className={`flex items-center gap-2 font-mono text-[10px] ${row.good ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {row.good ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                            {row.value}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function Reports() {
    const cachedSnapshotRef = useRef(readCachedReportSnapshot());
    const cachedAiRef = useRef(readCachedAiBriefing());
    const [snapshot, setSnapshot] = useState(cachedSnapshotRef.current);
    const [aiBriefing, setAiBriefing] = useState(cachedAiRef.current);
    const [selectedReport, setSelectedReport] = useState('briefing');
    const [loadingSnapshot, setLoadingSnapshot] = useState(!cachedSnapshotRef.current);
    const [loadingAi, setLoadingAi] = useState(!cachedAiRef.current);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const report = useMemo(() => deriveReport(snapshot, aiBriefing), [snapshot, aiBriefing]);

    const loadSnapshot = useCallback(async (signal) => {
        try {
            const nextSnapshot = await fetchReportSnapshot({ signal });
            setSnapshot(nextSnapshot);
            setError('');
        } catch (requestError) {
            if (!cachedSnapshotRef.current && !snapshot) {
                setError(requestError.message || 'Unable to load report data');
            }
        } finally {
            setLoadingSnapshot(false);
        }
    }, [snapshot]);

    const loadAi = useCallback(async (signal) => {
        setLoadingAi(true);
        try {
            const nextAi = await fetchAiBriefing({ signal });
            setAiBriefing(nextAi);
        } catch (requestError) {
            if (!cachedAiRef.current && !aiBriefing) {
                setError((current) => current || requestError.message || 'AI briefing unavailable');
            }
        } finally {
            setLoadingAi(false);
        }
    }, [aiBriefing]);

    useEffect(() => {
        const controller = new AbortController();
        loadSnapshot(controller.signal);
        loadAi(controller.signal);
        return () => controller.abort();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleGenerate = async () => {
        if (refreshing) return;
        setRefreshing(true);
        setError('');
        const controller = new AbortController();

        try {
            await Promise.allSettled([
                loadSnapshot(controller.signal),
                loadAi(controller.signal),
            ]);
        } finally {
            setRefreshing(false);
        }
    };

    const handleExport = () => {
        exportReportJson({
            report_type: 'OrbitOPS AI Mission Briefing',
            exported_at: new Date().toISOString(),
            metrics: {
                tracked_objects: report.tracked,
                active_satellites: report.satellites,
                debris_objects: report.debris,
                rocket_bodies: report.rocketBodies,
                mission_risk_level: report.riskLevel,
            },
            risk_events: report.eventCounts,
            assessment: Object.fromEntries(report.sections.map((section) => [section.key, section.body])),
            source: {
                catalog: report.source,
                propagator: report.propagator,
                source_status: report.sourceStatus,
                last_updated: report.lastUpdated,
                ai_model: report.aiModel,
            },
            raw_snapshot: snapshot,
        });
    };

    const metrics = [
        { icon: Orbit, label: 'TRACKED OBJECTS', value: formatNumber(report.tracked), accent: '#22d3ee', detail: 'Current propagated frame' },
        { icon: Satellite, label: 'SATELLITES', value: formatNumber(report.satellites), accent: '#a855f7', detail: 'Payload classification' },
        { icon: Trash2, label: 'DEBRIS OBJECTS', value: formatNumber(report.debris), accent: '#fb4358', detail: 'Tracked debris' },
        { icon: Rocket, label: 'ROCKET BODIES', value: formatNumber(report.rocketBodies), accent: '#fb923c', detail: 'On-orbit stages' },
    ];

    return (
        <div className="h-full overflow-y-auto bg-[#030508] text-slate-200">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute left-[16%] top-[-220px] h-[420px] w-[420px] rounded-full bg-cyan-500/[0.045] blur-[140px]" />
                <div className="absolute bottom-[-200px] right-[5%] h-[380px] w-[380px] rounded-full bg-indigo-500/[0.035] blur-[150px]" />
            </div>

            <div className="relative mx-auto min-h-full w-full max-w-[1760px] p-4 sm:p-5 lg:p-6">
                <div className="grid min-h-[calc(100vh-135px)] gap-4 xl:grid-cols-[286px_minmax(0,1fr)]">
                    <aside className="border border-white/[0.09] bg-[#070a0f]/95 p-4">
                        <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
                            <div>
                                <p className="font-mono text-[10px] tracking-[0.14em] text-slate-300">REPORTS</p>
                                <p className="mt-1 text-[9px] text-slate-700">Operational intelligence</p>
                            </div>
                            <FileText size={18} className="text-slate-600" />
                        </div>

                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={refreshing}
                            className="mt-4 flex h-10 w-full items-center justify-center gap-2 border border-cyan-400/40 bg-cyan-400/[0.055] font-mono text-[9px] tracking-[0.12em] text-cyan-300 transition hover:bg-cyan-400/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {refreshing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            {refreshing ? 'GENERATING' : 'GENERATE NEW REPORT'}
                        </button>

                        <div className="mt-4">
                            <ReportSelector selected={selectedReport} onSelect={setSelectedReport} report={report} />
                        </div>

                        <div className="mt-4 border border-white/[0.08] bg-black/20 p-3">
                            <div className="flex items-center gap-2 font-mono text-[8px] tracking-[0.12em] text-slate-600">
                                {loadingAi ? <Loader2 size={12} className="animate-spin text-cyan-400" /> : <Bot size={12} className="text-cyan-400" />}
                                BRIEFING ENGINE
                            </div>
                            <p className="mt-2 truncate text-[9px] text-slate-400">{loadingAi ? 'Refreshing in background' : report.aiModel}</p>
                            {report.aiMessage ? <p className="mt-2 text-[8px] leading-4 text-amber-300/70">{report.aiMessage}</p> : null}
                        </div>
                    </aside>

                    <main className="min-w-0 border border-white/[0.09] bg-[#05080c]/90 p-4 sm:p-5">
                        <header className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <p className="font-mono text-[10px] tracking-[0.14em] text-cyan-400">ORBITAL INTELLIGENCE / REPORTS</p>
                                    <RiskBadge level={report.riskLevel} />
                                </div>
                                <h1 className="mt-3 font-mono text-2xl tracking-[0.08em] text-white sm:text-3xl">CURRENT AI BRIEFING</h1>
                                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[8px] tracking-[0.08em] text-slate-600">
                                    <span className="flex items-center gap-1.5"><CalendarClock size={12} /> {formatDateTime(report.lastUpdated)}</span>
                                    <span className="flex items-center gap-1.5"><Database size={12} /> {report.source} + {report.propagator}</span>
                                    <span className="flex items-center gap-1.5">
                                        {loadingSnapshot ? <Loader2 size={12} className="animate-spin text-cyan-400" /> : report.sourceStatus === 'offline' ? <WifiOff size={12} /> : <Radio size={12} />}
                                        {loadingSnapshot ? 'Synchronising telemetry' : report.sourceStatus.toUpperCase()}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={handleGenerate}
                                    disabled={refreshing}
                                    className="inline-flex h-9 items-center gap-2 border border-white/[0.1] bg-white/[0.025] px-3 font-mono text-[8px] tracking-[0.1em] text-slate-300 hover:border-cyan-400/30 hover:text-cyan-300 disabled:opacity-50"
                                >
                                    <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> REFRESH
                                </button>
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="inline-flex h-9 items-center gap-2 border border-white/[0.1] bg-white/[0.025] px-3 font-mono text-[8px] tracking-[0.1em] text-slate-300 hover:border-white/20 hover:text-white"
                                >
                                    <Printer size={13} /> PRINT / PDF
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExport}
                                    className="inline-flex h-9 items-center gap-2 border border-white/[0.1] bg-white/[0.025] px-3 font-mono text-[8px] tracking-[0.1em] text-slate-300 hover:border-white/20 hover:text-white"
                                >
                                    <FileJson size={13} /> EXPORT JSON
                                </button>
                            </div>
                        </header>

                        {error ? (
                            <div className="mt-4 flex items-start gap-3 border border-amber-400/20 bg-amber-400/[0.055] p-3 text-[10px] leading-5 text-amber-200/80">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-mono text-[9px] tracking-[0.08em]">LIVE REFRESH INCOMPLETE</p>
                                    <p className="mt-1 text-amber-200/60">{error}. Cached or partial telemetry remains visible.</p>
                                </div>
                            </div>
                        ) : null}

                        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
                            <article className="min-h-[108px] border border-rose-400/20 bg-rose-400/[0.04] px-4 py-4">
                                <div className="flex items-center gap-2.5">
                                    <ShieldAlert size={17} className="text-rose-400" />
                                    <span className="font-mono text-[9px] tracking-[0.11em] text-slate-500">MISSION RISK</span>
                                </div>
                                <div className={`mt-3 font-mono text-[21px] tracking-[0.08em] ${(RISK_TONES[report.riskLevel] || RISK_TONES.UNKNOWN).text}`}>{report.riskLevel}</div>
                                <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.1em] text-slate-700">Current assessment</p>
                            </article>
                        </section>

                        <div className="mt-4 grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_330px]">
                            <div className="min-w-0">
                                {selectedReport === 'briefing' ? <AssessmentPanel report={report} /> : null}
                                {selectedReport === 'conjunctions' ? <ConjunctionPanel report={report} /> : null}
                                {selectedReport === 'environment' ? <EnvironmentPanel report={report} /> : null}
                                {selectedReport === 'health' ? <HealthPanel report={report} /> : null}
                            </div>
                            <aside className="space-y-4">
                                <RiskOverview report={report} />
                                <DataQuality report={report} />
                            </aside>
                        </div>

                        <footer className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-4 font-mono text-[8px] tracking-[0.1em] text-slate-700 sm:flex-row sm:items-center sm:justify-between">
                            <span>SPACE SITUATIONAL AWARENESS PLATFORM</span>
                            <span>Values supplied or derived from current OrbitOPS telemetry</span>
                        </footer>
                    </main>
                </div>
            </div>
        </div>
    );
}
