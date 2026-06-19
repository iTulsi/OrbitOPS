import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    Box,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    Database,
    Download,
    ExternalLink,
    Filter,
    Flag,
    Gauge,
    Globe2,
    Info,
    LocateFixed,
    Orbit,
    RefreshCw,
    Rocket,
    RotateCcw,
    Satellite,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import ObjectCatalogOrbitPreview from '../components/ObjectCatalogOrbitPreview';
import {
    exportCatalog,
    fetchCatalog,
    fetchCatalogObject,
    readCachedCatalog,
} from '../services/catalogApi';

const TYPE_META = {
    PAYLOAD: { label: 'PAYLOAD', accent: '#9b6cff', icon: Satellite },
    DEBRIS: { label: 'DEBRIS', accent: '#ff4358', icon: Trash2 },
    ROCKET_BODY: { label: 'ROCKET BODY', accent: '#ff9800', icon: Rocket },
    UNKNOWN: { label: 'UNKNOWN', accent: '#64748b', icon: Box },
};

const METRIC_META = [
    { key: 'total_objects', label: 'TOTAL OBJECTS', accent: '#27d9e9', icon: Orbit },
    { key: 'satellites', label: 'SATELLITES', accent: '#b06cff', icon: Satellite },
    { key: 'debris', label: 'DEBRIS', accent: '#ff4358', icon: Trash2 },
    { key: 'rocket_bodies', label: 'ROCKET BODIES', accent: '#ff9800', icon: Rocket },
    { key: 'active_payloads', label: 'ACTIVE PAYLOADS', accent: '#3da5ff', icon: ShieldCheck },
    { key: 'countries', label: 'COUNTRIES', accent: '#cbd5e1', icon: Flag },
];

const DEFAULT_FILTERS = {
    query: '',
    objectTypes: [],
    regimes: [],
    minAltitude: 0,
    maxAltitude: 100000,
    minInclination: 0,
    maxInclination: 180,
    owner: 'ALL',
    status: 'ALL',
};

const NUMBER = new Intl.NumberFormat('en-US');

function formatNumber(value) {
    return NUMBER.format(Number(value) || 0);
}

function formatValue(value, decimals = 1, suffix = '') {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${number.toFixed(decimals)}${suffix}`;
}

function formatTimestamp(value) {
    if (!value) return 'AWAITING FULL CATALOG';
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

function formatShortTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusTone(status) {
    const upper = String(status || '').toUpperCase();
    if (['OPERATIONAL', 'ACTIVE', 'PARTIAL', 'EXTENDED'].includes(upper)) {
        return 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300';
    }
    if (['TRACKED', 'STANDBY', 'SPARE'].includes(upper)) {
        return 'border-amber-400/25 bg-amber-400/[0.06] text-amber-300';
    }
    if (upper === 'NONOPERATIONAL') {
        return 'border-orange-400/25 bg-orange-400/[0.06] text-orange-300';
    }
    return 'border-slate-400/20 bg-slate-400/[0.05] text-slate-400';
}

function DataStatus({ status, refreshing, scope }) {
    const tone = {
        live: 'border-emerald-400/25 text-emerald-300 bg-emerald-400/[0.05]',
        cached: 'border-amber-400/25 text-amber-300 bg-amber-400/[0.05]',
        warming: 'border-cyan-400/25 text-cyan-300 bg-cyan-400/[0.05]',
        offline: 'border-rose-400/25 text-rose-300 bg-rose-400/[0.05]',
    }[status] || 'border-white/10 text-slate-400 bg-white/[0.03]';

    return (
        <span className={`inline-flex h-8 items-center gap-2 border px-3 font-mono text-[9px] uppercase tracking-[0.14em] ${tone}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? 'animate-pulse bg-cyan-300' : status === 'live' ? 'bg-emerald-400' : 'bg-current'}`} />
            {refreshing ? 'REFRESHING' : scope === 'preview' ? 'PREVIEW' : status || 'UNKNOWN'}
        </span>
    );
}

function MetricCard({ meta, value, scope }) {
    const Icon = meta.icon;
    return (
        <article
            className="relative min-h-[104px] overflow-hidden border bg-[#080b10]/90 p-4"
            style={{ borderColor: `${meta.accent}28`, boxShadow: `inset 0 0 28px ${meta.accent}06` }}
        >
            <div className="flex items-center gap-3">
                <Icon size={21} style={{ color: meta.accent }} />
                <span className="font-mono text-[10px] tracking-[0.08em]" style={{ color: meta.accent }}>{meta.label}</span>
            </div>
            <div className="mt-2 font-mono text-[25px] tracking-[0.07em] text-slate-100">{formatNumber(value)}</div>
            <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">
                {scope === 'preview' ? 'Preview set · full SATCAT loading' : meta.key === 'countries' ? 'Tracked owners / nations' : 'Currently on orbit'}
            </p>
        </article>
    );
}

function Checkbox({ checked, onChange, label, count }) {
    return (
        <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 font-mono text-[10px] text-slate-400 hover:text-slate-200">
            <span className="flex items-center gap-2">
                <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
                <span className={`flex h-3.5 w-3.5 items-center justify-center border ${checked ? 'border-cyan-400 bg-cyan-400 text-black' : 'border-white/20 bg-black/20'}`}>
                    {checked ? <Check size={10} strokeWidth={3} /> : null}
                </span>
                {label}
            </span>
            {count !== undefined ? <span className="text-[8px] text-slate-700">{formatNumber(count)}</span> : null}
        </label>
    );
}

function SelectBox({ value, onChange, children }) {
    return (
        <label className="relative block">
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-9 w-full appearance-none border border-white/[0.09] bg-[#090c11] px-3 pr-8 font-mono text-[9px] uppercase tracking-[0.08em] text-slate-400 outline-none focus:border-cyan-400/40"
            >
                {children}
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-3 top-3 text-slate-600" />
        </label>
    );
}

function RangeField({ label, min, max, value, onChange, suffix = '' }) {
    return (
        <div>
            <div className="mb-2 flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">
                <span>{label}</span>
                <span className="text-slate-400">{formatNumber(value)}{suffix}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-1 w-full cursor-pointer appearance-none rounded bg-slate-800 accent-cyan-400"
            />
        </div>
    );
}

function TypePill({ type }) {
    const meta = TYPE_META[type] || TYPE_META.UNKNOWN;
    return (
        <span className="inline-flex border px-2 py-1 font-mono text-[8px] tracking-[0.06em]" style={{ color: meta.accent, borderColor: `${meta.accent}45`, backgroundColor: `${meta.accent}0b` }}>
            {meta.label}
        </span>
    );
}

function OrbitPreview({ object }) {
    return <ObjectCatalogOrbitPreview object={object} />;
}

function DetailLine({ label, value, accent }) {
    return (
        <div className="flex items-center justify-between gap-5 py-1 font-mono text-[9px]">
            <span className="text-slate-600">{label}</span>
            <span className="text-right text-slate-300" style={accent ? { color: accent } : undefined}>{value ?? '—'}</span>
        </div>
    );
}

function Inspector({ object, loading, onRefresh }) {
    if (!object) {
        return (
            <aside className="flex min-h-[620px] items-center justify-center border border-white/[0.09] bg-[#070a0f]/90 p-8 text-center">
                <div>
                    <LocateFixed size={25} className="mx-auto mb-4 text-slate-700" />
                    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">SELECT AN OBJECT</p>
                    <p className="mt-2 max-w-[220px] text-xs leading-5 text-slate-700">Choose a catalog row to inspect verified SATCAT and OMM orbital parameters.</p>
                </div>
            </aside>
        );
    }

    const typeMeta = TYPE_META[object.type] || TYPE_META.UNKNOWN;
    const Icon = typeMeta.icon;

    return (
        <aside className="min-w-0 border border-white/[0.09] bg-[#070a0f]/90">
            <div className="border-b border-white/[0.08] p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Icon size={18} style={{ color: typeMeta.accent }} />
                            <h2 className="truncate font-mono text-base tracking-[0.03em] text-slate-100">{object.name}</h2>
                        </div>
                        <p className="mt-1 font-mono text-[9px] text-slate-500">NORAD ID: {object.norad_id}</p>
                    </div>
                    <span className={`shrink-0 border px-2 py-1 font-mono text-[8px] ${statusTone(object.status)}`}>{object.status}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-b border-white/[0.08] bg-white/[0.06]">
                {[
                    ['OBJECT TYPE', object.type?.replace('_', ' '), typeMeta.accent],
                    ['OWNER', object.country || object.owner_code, null],
                    ['INTL DESIGNATOR', object.international_designator || '—', null],
                    ['LAUNCH DATE', object.launch_date || '—', null],
                    ['CATALOG SOURCE', 'CelesTrak', null],
                    ['LIVE STATE', object.has_live_state ? 'AVAILABLE' : 'MEAN ORBIT', object.has_live_state ? '#34d399' : '#fbbf24'],
                ].map(([label, value, accent]) => (
                    <div key={label} className="min-w-0 bg-[#080b10] p-3">
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-slate-600">{label}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-slate-300" style={accent ? { color: accent } : undefined}>{value}</p>
                    </div>
                ))}
            </div>

            <section className="border-b border-white/[0.08] p-4">
                <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400">ORBITAL PARAMETERS</h3>
                    <button onClick={onRefresh} disabled={loading} className="text-slate-600 transition hover:text-cyan-300 disabled:opacity-40" title="Refresh selected object details">
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
                <DetailLine label="Altitude" value={formatValue(object.current_altitude_km ?? object.altitude_km, 2, ' km')} />
                <DetailLine label="Apogee" value={formatValue(object.apogee_km, 1, ' km')} />
                <DetailLine label="Perigee" value={formatValue(object.perigee_km, 1, ' km')} />
                <DetailLine label="Inclination" value={formatValue(object.inclination_deg, 3, '°')} />
                <DetailLine label="RAAN" value={formatValue(object.raan_deg, 3, '°')} />
                <DetailLine label="Eccentricity" value={formatValue(object.eccentricity, 7)} />
                <DetailLine label="Argument of Perigee" value={formatValue(object.argument_of_perigee_deg, 3, '°')} />
                <DetailLine label="Mean Anomaly" value={formatValue(object.mean_anomaly_deg, 3, '°')} />
                <DetailLine label="Mean Motion" value={formatValue(object.mean_motion_rev_day, 6, ' rev/day')} />
                <DetailLine label="Orbital Period" value={formatValue(object.period_min, 2, ' min')} />
                <DetailLine label="Velocity" value={formatValue(object.current_velocity_km_s ?? object.velocity_km_s, 3, ' km/s')} />
            </section>

            <section>
                <div className="flex h-9 items-center justify-between border-b border-white/[0.08] px-4">
                    <h3 className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400">ORBIT VISUALIZATION</h3>
                    <span className="font-mono text-[8px] text-cyan-400">{object.orbital_regime || 'UNKNOWN'}</span>
                </div>
                <OrbitPreview object={object} />
            </section>

            <div className="p-4">
                <button className="flex h-9 w-full items-center justify-center gap-2 border border-white/[0.12] bg-white/[0.02] font-mono text-[9px] tracking-[0.09em] text-slate-300 transition hover:border-cyan-400/35 hover:text-cyan-300">
                    VIEW FULL DETAILS <ExternalLink size={11} />
                </button>
                {object.detail_error ? <p className="mt-2 text-[10px] leading-4 text-amber-400/70">Cached details shown: {object.detail_error}</p> : null}
            </div>
        </aside>
    );
}

function Pagination({ page, totalPages, onChange }) {
    const pages = useMemo(() => {
        const candidates = new Set([1, totalPages, page - 1, page, page + 1]);
        return [...candidates].filter((item) => item >= 1 && item <= totalPages).sort((a, b) => a - b);
    }, [page, totalPages]);

    return (
        <div className="flex items-center justify-center gap-1">
            <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1} className="flex h-8 w-8 items-center justify-center text-slate-600 hover:text-cyan-300 disabled:opacity-30"><ChevronLeft size={14} /></button>
            {pages.map((item, index) => (
                <React.Fragment key={item}>
                    {index > 0 && pages[index - 1] + 1 < item ? <span className="px-1 text-slate-700">…</span> : null}
                    <button
                        onClick={() => onChange(item)}
                        className={`h-8 min-w-8 border px-2 font-mono text-[9px] ${item === page ? 'border-cyan-400/45 bg-cyan-400/[0.07] text-cyan-300' : 'border-transparent text-slate-500 hover:border-white/10 hover:text-slate-300'}`}
                    >
                        {item}
                    </button>
                </React.Fragment>
            ))}
            <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="flex h-8 w-8 items-center justify-center text-slate-600 hover:text-cyan-300 disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
    );
}

export default function ObjectCatalog() {
    const cached = useMemo(() => readCachedCatalog(), []);
    const [catalog, setCatalog] = useState(cached);
    const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);
    const [sortBy, setSortBy] = useState('norad_id');
    const [sortDir, setSortDir] = useState('asc');
    const [loading, setLoading] = useState(!cached);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(cached?.rows?.[0] || null);
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [exporting, setExporting] = useState('');
    const pollRef = useRef(null);

    const requestParams = useMemo(() => ({
        page,
        per_page: perPage,
        query: filters.query,
        object_types: filters.objectTypes,
        regimes: filters.regimes,
        min_altitude: filters.minAltitude,
        max_altitude: filters.maxAltitude,
        min_inclination: filters.minInclination,
        max_inclination: filters.maxInclination,
        owner: filters.owner,
        status: filters.status,
        sort_by: sortBy,
        sort_dir: sortDir,
    }), [filters, page, perPage, sortBy, sortDir]);

    const loadCatalog = useCallback(async ({ refresh = false, quiet = false } = {}) => {
        if (!quiet) setLoading(true);
        setError('');
        try {
            const payload = await fetchCatalog({ ...requestParams, refresh: refresh ? 1 : 0 }, { timeoutMs: refresh ? 18000 : 12000 });
            setCatalog(payload);
            setSelected((current) => {
                if (current && payload.rows?.some((row) => row.norad_id === current.norad_id)) {
                    return payload.rows.find((row) => row.norad_id === current.norad_id);
                }
                return payload.rows?.[0] || null;
            });
        } catch (requestError) {
            setError(requestError.message || 'Unable to load the object catalog.');
        } finally {
            if (!quiet) setLoading(false);
        }
    }, [requestParams]);

    useEffect(() => {
        loadCatalog();
    }, [loadCatalog]);

    useEffect(() => {
        window.clearInterval(pollRef.current);
        if (catalog?.refresh_in_progress || catalog?.scope === 'preview' || catalog?.status === 'warming') {
            pollRef.current = window.setInterval(() => loadCatalog({ quiet: true }), 4000);
        }
        return () => window.clearInterval(pollRef.current);
    }, [catalog?.refresh_in_progress, catalog?.scope, catalog?.status, loadCatalog]);

    const loadDetail = useCallback(async (object, refresh = false) => {
        if (!object?.norad_id) return;
        setSelected(object);
        setSelectedDetail(null);
        setDetailLoading(true);
        try {
            const payload = await fetchCatalogObject(object.norad_id, { refresh });
            setSelectedDetail(payload?.object || null);
        } catch (detailError) {
            setSelectedDetail({ ...object, detail_error: detailError.message });
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selected?.norad_id) loadDetail(selected, false);
    // Deliberately keyed only to the selected NORAD ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.norad_id]);

    const activeObject = useMemo(() => ({ ...selected, ...selectedDetail }), [selected, selectedDetail]);

    const updateArrayFilter = (key, value, enabled) => {
        setDraftFilters((current) => ({
            ...current,
            [key]: enabled
                ? [...new Set([...current[key], value])]
                : current[key].filter((item) => item !== value),
        }));
    };

    const applyFilters = () => {
        setPage(1);
        setFilters({ ...draftFilters });
    };

    const resetFilters = () => {
        setPage(1);
        setDraftFilters(DEFAULT_FILTERS);
        setFilters(DEFAULT_FILTERS);
    };

    const toggleSort = (field) => {
        if (sortBy === field) setSortDir((current) => current === 'asc' ? 'desc' : 'asc');
        else {
            setSortBy(field);
            setSortDir('asc');
        }
        setPage(1);
    };

    const exportParams = useMemo(() => ({
        query: filters.query,
        object_types: filters.objectTypes,
        regimes: filters.regimes,
        min_altitude: filters.minAltitude,
        max_altitude: filters.maxAltitude,
        min_inclination: filters.minInclination,
        max_inclination: filters.maxInclination,
        owner: filters.owner,
        status: filters.status,
        sort_by: sortBy,
        sort_dir: sortDir,
    }), [filters, sortBy, sortDir]);

    const runExport = async (format) => {
        setExporting(format);
        try {
            await exportCatalog(exportParams, format);
        } catch (exportError) {
            setError(exportError.message || 'Export failed.');
        } finally {
            setExporting('');
        }
    };

    const summary = catalog?.summary || {};
    const rows = catalog?.rows || [];

    return (
        <main className="min-h-[calc(100vh-86px)] bg-[#030507] px-4 py-5 text-slate-200 sm:px-6">
            <header className="mb-5 flex flex-col gap-4 border-b border-white/[0.08] pb-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-slate-600">SPACE OBJECT INTELLIGENCE</p>
                    <h1 className="mt-2 font-mono text-[28px] tracking-[0.08em] text-slate-100">OBJECT CATALOG</h1>
                    <p className="mt-1 text-xs text-slate-600">Comprehensive on-orbit catalog from CelesTrak SATCAT, enriched with OMM and SGP4 state data.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="border-l border-white/[0.08] pl-4">
                        <p className="font-mono text-[8px] uppercase tracking-[0.13em] text-slate-700">DATA SOURCE</p>
                        <p className="mt-1 font-mono text-[9px] text-slate-400">CELESTRAK + SGP4</p>
                    </div>
                    <div className="border-l border-white/[0.08] pl-4">
                        <p className="font-mono text-[8px] uppercase tracking-[0.13em] text-slate-700">LAST UPDATED</p>
                        <p className="mt-1 font-mono text-[9px] text-slate-400">{formatTimestamp(catalog?.last_updated)}</p>
                    </div>
                    <DataStatus status={catalog?.status} refreshing={catalog?.refresh_in_progress} scope={catalog?.scope} />
                    <button
                        onClick={() => loadCatalog({ refresh: true })}
                        disabled={loading}
                        className="flex h-9 items-center gap-2 border border-white/[0.12] bg-white/[0.02] px-4 font-mono text-[9px] tracking-[0.1em] text-slate-300 transition hover:border-cyan-400/35 hover:text-cyan-300 disabled:opacity-40"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> REFRESH NOW
                    </button>
                </div>
            </header>

            {error ? (
                <div className="mb-4 flex items-center justify-between border border-rose-400/25 bg-rose-400/[0.05] px-4 py-3 text-xs text-rose-300">
                    <span>{error}</span>
                    <button onClick={() => setError('')}><X size={14} /></button>
                </div>
            ) : null}

            <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                {METRIC_META.map((meta) => <MetricCard key={meta.key} meta={meta} value={summary[meta.key]} scope={catalog?.scope} />)}
            </section>

            <section className="grid min-h-[650px] gap-3 xl:grid-cols-[230px_minmax(0,1fr)_320px]">
                <aside className="border border-white/[0.09] bg-[#070a0f]/90">
                    <div className="flex h-10 items-center justify-between border-b border-white/[0.08] px-3">
                        <h2 className="font-mono text-[10px] tracking-[0.1em] text-slate-300">FILTERS</h2>
                        <SlidersHorizontal size={13} className="text-slate-600" />
                    </div>
                    <div className="space-y-5 p-3">
                        <label className="relative block">
                            <Search size={13} className="absolute left-3 top-3 text-slate-600" />
                            <input
                                value={draftFilters.query}
                                onChange={(event) => setDraftFilters((current) => ({ ...current, query: event.target.value }))}
                                onKeyDown={(event) => event.key === 'Enter' && applyFilters()}
                                placeholder="Name, NORAD ID..."
                                className="h-9 w-full border border-white/[0.09] bg-[#090c11] pl-9 pr-3 font-mono text-[9px] text-slate-300 outline-none placeholder:text-slate-700 focus:border-cyan-400/35"
                            />
                        </label>

                        <div>
                            <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">OBJECT TYPE</p>
                            {[
                                ['PAYLOAD', 'Satellites / Payloads'],
                                ['DEBRIS', 'Debris'],
                                ['ROCKET_BODY', 'Rocket Bodies'],
                                ['UNKNOWN', 'Unknown'],
                            ].map(([value, label]) => (
                                <Checkbox key={value} checked={draftFilters.objectTypes.includes(value)} onChange={(checked) => updateArrayFilter('objectTypes', value, checked)} label={label} />
                            ))}
                        </div>

                        <div className="border-t border-white/[0.07] pt-4">
                            <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">ORBITAL REGIME</p>
                            {[
                                ['LEO', 'LEO (0–2,000 km)'],
                                ['MEO', 'MEO (2,000–35,000 km)'],
                                ['GEO', 'GEO (35,000–37,000 km)'],
                                ['HEO', 'HEO / Deep Space'],
                            ].map(([value, label]) => (
                                <Checkbox key={value} checked={draftFilters.regimes.includes(value)} onChange={(checked) => updateArrayFilter('regimes', value, checked)} label={label} />
                            ))}
                        </div>

                        <div className="space-y-4 border-t border-white/[0.07] pt-4">
                            <RangeField label="MIN INCLINATION" min={0} max={180} value={draftFilters.minInclination} onChange={(value) => setDraftFilters((current) => ({ ...current, minInclination: Math.min(value, current.maxInclination) }))} suffix="°" />
                            <RangeField label="MAX INCLINATION" min={0} max={180} value={draftFilters.maxInclination} onChange={(value) => setDraftFilters((current) => ({ ...current, maxInclination: Math.max(value, current.minInclination) }))} suffix="°" />
                            <RangeField label="MIN ALTITUDE" min={0} max={100000} value={draftFilters.minAltitude} onChange={(value) => setDraftFilters((current) => ({ ...current, minAltitude: Math.min(value, current.maxAltitude) }))} suffix=" km" />
                            <RangeField label="MAX ALTITUDE" min={0} max={100000} value={draftFilters.maxAltitude} onChange={(value) => setDraftFilters((current) => ({ ...current, maxAltitude: Math.max(value, current.minAltitude) }))} suffix=" km" />
                        </div>

                        <div className="space-y-3 border-t border-white/[0.07] pt-4">
                            <div>
                                <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">COUNTRY / OWNER</p>
                                <SelectBox value={draftFilters.owner} onChange={(owner) => setDraftFilters((current) => ({ ...current, owner }))}>
                                    <option value="ALL">All countries / owners</option>
                                    {(catalog?.countries || []).map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name} ({country.count})</option>)}
                                </SelectBox>
                            </div>
                            <div>
                                <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">STATUS</p>
                                <SelectBox value={draftFilters.status} onChange={(status) => setDraftFilters((current) => ({ ...current, status }))}>
                                    <option value="ALL">All statuses</option>
                                    <option value="ACTIVE">Active payloads</option>
                                    <option value="OPERATIONAL">Operational</option>
                                    <option value="TRACKED">Tracked</option>
                                    <option value="NONOPERATIONAL">Nonoperational</option>
                                    <option value="UNKNOWN">Unknown</option>
                                </SelectBox>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <button onClick={resetFilters} className="flex h-9 items-center justify-center gap-1.5 border border-white/[0.10] font-mono text-[8px] tracking-[0.08em] text-slate-500 transition hover:text-slate-200"><RotateCcw size={11} /> RESET</button>
                            <button onClick={applyFilters} className="flex h-9 items-center justify-center gap-1.5 border border-cyan-400/35 bg-cyan-400/[0.06] font-mono text-[8px] tracking-[0.08em] text-cyan-300 transition hover:bg-cyan-400/[0.12]"><Filter size={11} /> APPLY</button>
                        </div>
                    </div>
                </aside>

                <div className="min-w-0 border border-white/[0.09] bg-[#070a0f]/90">
                    <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-2">
                        <p className="font-mono text-[9px] text-slate-500">
                            Showing <span className="text-slate-300">{rows.length ? (catalog.page - 1) * catalog.per_page + 1 : 0}</span> to <span className="text-slate-300">{Math.min(catalog?.filtered_count || 0, (catalog?.page || 1) * (catalog?.per_page || perPage))}</span> of <span className="text-slate-300">{formatNumber(catalog?.filtered_count)}</span> objects
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => runExport('csv')} disabled={Boolean(exporting)} className="flex h-8 items-center gap-2 border border-white/[0.10] px-3 font-mono text-[8px] text-slate-400 hover:border-cyan-400/30 hover:text-cyan-300 disabled:opacity-40"><Download size={11} className={exporting === 'csv' ? 'animate-bounce' : ''} /> EXPORT CSV</button>
                            <button onClick={() => runExport('json')} disabled={Boolean(exporting)} className="flex h-8 items-center gap-2 border border-white/[0.10] px-3 font-mono text-[8px] text-slate-400 hover:border-cyan-400/30 hover:text-cyan-300 disabled:opacity-40"><Database size={11} className={exporting === 'json' ? 'animate-pulse' : ''} /> EXPORT JSON</button>
                            <SelectBox value={perPage} onChange={(value) => { setPerPage(Number(value)); setPage(1); }}>
                                <option value={10}>10 / page</option>
                                <option value={25}>25 / page</option>
                                <option value={50}>50 / page</option>
                                <option value={100}>100 / page</option>
                            </SelectBox>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[930px] border-collapse">
                            <thead>
                                <tr className="border-b border-white/[0.08] bg-[#090c11]">
                                    {[
                                        ['norad_id', 'NORAD ID'],
                                        ['name', 'NAME'],
                                        ['type', 'TYPE'],
                                        ['country', 'COUNTRY / OWNER'],
                                        ['altitude', 'ALTITUDE (KM)'],
                                        ['inclination', 'INCLINATION (°)'],
                                        ['velocity', 'VELOCITY (KM/S)'],
                                        ['status', 'STATUS'],
                                    ].map(([field, label]) => (
                                        <th key={field} onClick={() => toggleSort(field)} className="cursor-pointer whitespace-nowrap px-3 py-3 text-left font-mono text-[8px] font-normal uppercase tracking-[0.08em] text-slate-600 hover:text-slate-300">
                                            {label} {sortBy === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                    ))}
                                    <th className="px-3 py-3 text-left font-mono text-[8px] font-normal text-slate-600">UPDATED</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    const isSelected = selected?.norad_id === row.norad_id;
                                    return (
                                        <tr
                                            key={row.norad_id}
                                            onClick={() => setSelected(row)}
                                            className={`cursor-pointer border-b border-white/[0.055] transition ${isSelected ? 'bg-cyan-400/[0.055]' : 'hover:bg-white/[0.025]'}`}
                                        >
                                            <td className="px-3 py-3 font-mono text-[10px] text-slate-300">{row.norad_id}</td>
                                            <td className="max-w-[190px] px-3 py-3">
                                                <p className="truncate font-mono text-[10px] text-slate-200">{row.name}</p>
                                                <p className="mt-0.5 truncate font-mono text-[8px] text-slate-700">{row.international_designator || 'NO INTL DESIGNATOR'}</p>
                                            </td>
                                            <td className="px-3 py-3"><TypePill type={row.type} /></td>
                                            <td className="max-w-[150px] px-3 py-3">
                                                <p className="truncate font-mono text-[9px] text-slate-400"><span className="mr-1.5">{row.flag}</span>{row.country}</p>
                                            </td>
                                            <td className="px-3 py-3 font-mono text-[9px] text-slate-300">{formatValue(row.altitude_km, 1)}</td>
                                            <td className="px-3 py-3 font-mono text-[9px] text-slate-300">{formatValue(row.inclination_deg, 2)}</td>
                                            <td className="px-3 py-3 font-mono text-[9px] text-slate-300">{formatValue(row.velocity_km_s, 3)}</td>
                                            <td className="px-3 py-3"><span className={`border px-2 py-1 font-mono text-[8px] ${statusTone(row.status)}`}>{row.status}</span></td>
                                            <td className="px-3 py-3 font-mono text-[8px] text-slate-600">{formatShortTime(row.updated_at)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {loading && !rows.length ? (
                        <div className="flex min-h-[420px] items-center justify-center text-center">
                            <div>
                                <RefreshCw size={24} className="mx-auto mb-4 animate-spin text-cyan-400" />
                                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">LOADING OBJECT CATALOG</p>
                                <p className="mt-2 text-xs text-slate-700">Using the fast OMM preview while the full SATCAT refresh completes.</p>
                            </div>
                        </div>
                    ) : null}

                    {!loading && !rows.length ? (
                        <div className="flex min-h-[420px] items-center justify-center text-center">
                            <div>
                                <Search size={24} className="mx-auto mb-4 text-slate-700" />
                                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">NO MATCHING OBJECTS</p>
                                <p className="mt-2 text-xs text-slate-700">Adjust the active filters or reset the catalog view.</p>
                            </div>
                        </div>
                    ) : null}

                    <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-2">
                        <div className="font-mono text-[8px] text-slate-700">
                            {catalog?.scope === 'preview' ? 'FAST PREVIEW · FULL ON-ORBIT SATCAT REFRESHING' : 'FULL ON-ORBIT SATCAT CATALOG'}
                        </div>
                        <Pagination page={catalog?.page || page} totalPages={catalog?.total_pages || 1} onChange={setPage} />
                        <div className="font-mono text-[8px] text-slate-700">PAGE {catalog?.page || 1} / {catalog?.total_pages || 1}</div>
                    </div>
                </div>

                <Inspector object={activeObject} loading={detailLoading} onRefresh={() => loadDetail(activeObject, true)} />
            </section>

            <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-700">
                <span className="flex items-center gap-2"><Activity size={11} /> SPACE SITUATIONAL AWARENESS PLATFORM</span>
                <span className="flex items-center gap-4"><span>DATA SOURCE · CELESTRAK SATCAT + OMM</span><span>PROPAGATOR · SGP4</span></span>
            </footer>
        </main>
    );
}
