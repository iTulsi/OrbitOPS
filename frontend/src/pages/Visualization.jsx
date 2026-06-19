import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    Boxes,
    CircleDot,
    Database,
    Eye,
    Focus,
    Layers3,
    Minus,
    Minimize2,
    Pause,
    Play,
    Plus,
    Satellite,
    Tag,
} from 'lucide-react';
import GlobeVisualization from '../components/GlobeVisualization';

const INITIAL_TELEMETRY = {
    status: 'loading',
    source: 'CelesTrak',
    total: 0,
    propagator: 'SGP4',
    dataMode: 'live-propagated',
};

const TYPE_CONFIG = {
    SATELLITE: {
        label: 'Satellites',
        dot: 'bg-slate-100',
        icon: Satellite,
    },
    DEBRIS: {
        label: 'Debris',
        dot: 'bg-slate-500',
        icon: Boxes,
    },
    ROCKET_BODY: {
        label: 'Rocket bodies',
        dot: 'bg-amber-400',
        icon: CircleDot,
    },
};

const RISK_STYLES = {
    CRITICAL: 'border-rose-500/60 bg-rose-500/10 text-rose-300',
    HIGH: 'border-red-500/50 bg-red-500/10 text-red-300',
    MEDIUM: 'border-amber-400/45 bg-amber-400/10 text-amber-300',
    LOW: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-300',
    TRACKED: 'border-slate-600/60 bg-slate-800/50 text-slate-400',
};

function normaliseType(value) {
    const type = String(value || 'SATELLITE').toUpperCase().replace(/[ -]/g, '_');
    if (type.includes('ROCKET')) return 'ROCKET_BODY';
    if (type.includes('DEBRIS')) return 'DEBRIS';
    return 'SATELLITE';
}

function normaliseRisk(object) {
    const risk = String(
        object?.risk_level ??
        object?.riskLevel ??
        object?.risk ??
        object?.severity ??
        ''
    ).toUpperCase();

    return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(risk)
        ? risk
        : 'TRACKED';
}

function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString() : '0';
}

function formatTime(value) {
    if (!value) return 'Awaiting first frame';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Awaiting first frame';

    return date.toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short',
    });
}

function PanelHeading({ label, icon: Icon }) {
    return (
        <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-4">
            <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500">
                {label}
            </span>
            <Icon className="h-4 w-4 text-slate-500" strokeWidth={1.5} />
        </div>
    );
}

function ToggleRow({ icon: Icon, label, value, onChange, suffix }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!value)}
            className="flex w-full items-center justify-between border-b border-white/[0.06] px-4 py-4 text-left transition hover:bg-white/[0.025]"
        >
            <span className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                <span className="font-mono text-[10px] tracking-[0.08em] text-slate-300">
                    {label}
                </span>
            </span>
            <span className="font-mono text-[9px] tracking-[0.12em] text-slate-500">
                {suffix ?? (value ? 'ON' : 'OFF')}
            </span>
        </button>
    );
}

function TypeRow({ type, count, enabled, onToggle }) {
    const config = TYPE_CONFIG[type];

    return (
        <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center justify-between border-b border-white/[0.06] px-5 py-5 text-left transition hover:bg-white/[0.025]"
        >
            <span className="flex items-start gap-3">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${config.dot}`} />
                <span>
                    <span className="block font-mono text-[10px] tracking-[0.1em] text-slate-200">
                        {config.label}
                    </span>
                    <span className="mt-1.5 block font-mono text-[8px] uppercase tracking-[0.12em] text-slate-600">
                        {formatNumber(count)} objects
                    </span>
                </span>
            </span>
            <span
                className={`font-mono text-[8px] tracking-[0.15em] ${
                    enabled ? 'text-emerald-400' : 'text-slate-700'
                }`}
            >
                {enabled ? 'ON' : 'OFF'}
            </span>
        </button>
    );
}

function ObjectRow({ object, selected, onSelect }) {
    const risk = normaliseRisk(object);
    const type = normaliseType(object?.type);
    const name = object?.name || `Object ${object?.norad_id || object?.id || '—'}`;
    const norad = object?.norad_id || object?.norad || object?.id || '—';
    const altitude = Number(
        object?.altitude_km ?? object?.altitude ?? object?.alt
    );

    return (
        <button
            type="button"
            onClick={() => onSelect(object)}
            className={`flex w-full items-center gap-3 border-b border-white/[0.07] px-4 py-4 text-left transition ${
                selected
                    ? 'bg-cyan-300/[0.065] shadow-[inset_2px_0_0_rgba(103,232,249,0.8)]'
                    : 'hover:bg-white/[0.025]'
            }`}
        >
            <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_CONFIG[type].dot}`}
            />
            <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[9px] uppercase tracking-[0.06em] text-slate-200">
                    {name}
                </span>
                <span className="mt-1.5 block truncate font-mono text-[7px] uppercase tracking-[0.1em] text-slate-600">
                    NORAD {norad}
                    {Number.isFinite(altitude)
                        ? ` · ${Math.round(altitude).toLocaleString()} km`
                        : ''}
                </span>
            </span>
            <span
                className={`shrink-0 border px-2 py-1 font-mono text-[7px] tracking-[0.12em] ${RISK_STYLES[risk]}`}
            >
                {risk}
            </span>
        </button>
    );
}

export default function Visualization() {
    const globeRef = useRef(null);
    const [objects, setObjects] = useState([]);
    const [telemetry, setTelemetry] = useState(INITIAL_TELEMETRY);
    const [selectedObject, setSelectedObject] = useState(null);
    const [enabledTypes, setEnabledTypes] = useState({
        SATELLITE: true,
        DEBRIS: true,
        ROCKET_BODY: true,
    });
    const [elevatedRiskOnly, setElevatedRiskOnly] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [showOrbitBands, setShowOrbitBands] = useState(true);
    const [isRotating, setIsRotating] = useState(true);

    const handleObjects = useCallback((nextObjects) => {
        setObjects(nextObjects);
    }, []);

    const handleTelemetry = useCallback((nextTelemetry) => {
        setTelemetry((current) => ({ ...current, ...nextTelemetry }));
    }, []);

    const counts = useMemo(() => {
        const result = {
            SATELLITE: 0,
            DEBRIS: 0,
            ROCKET_BODY: 0,
        };

        objects.forEach((object) => {
            result[normaliseType(object?.type)] += 1;
        });

        return result;
    }, [objects]);

    const trackedObjects = useMemo(() => {
        const riskWeight = {
            CRITICAL: 5,
            HIGH: 4,
            MEDIUM: 3,
            LOW: 2,
            TRACKED: 1,
        };

        return objects
            .filter((object) => enabledTypes[normaliseType(object?.type)])
            .filter((object) => {
                if (!elevatedRiskOnly) return true;
                return ['CRITICAL', 'HIGH', 'MEDIUM'].includes(
                    normaliseRisk(object)
                );
            })
            .sort(
                (a, b) =>
                    riskWeight[normaliseRisk(b)] -
                    riskWeight[normaliseRisk(a)]
            )
            .slice(0, 14);
    }, [elevatedRiskOnly, enabledTypes, objects]);

    const elevatedCount = useMemo(
        () =>
            objects.filter((object) =>
                ['CRITICAL', 'HIGH', 'MEDIUM'].includes(normaliseRisk(object))
            ).length,
        [objects]
    );

    return (
        <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#030609] text-white">
            <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[248px_minmax(0,1fr)_310px] 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
                <aside className="hidden min-h-0 border-r border-white/[0.08] bg-black/35 xl:flex xl:flex-col">
                    <section>
                        <PanelHeading label="Object classes" icon={Layers3} />
                        {Object.keys(TYPE_CONFIG).map((type) => (
                            <TypeRow
                                key={type}
                                type={type}
                                count={counts[type]}
                                enabled={enabledTypes[type]}
                                onToggle={() =>
                                    setEnabledTypes((current) => ({
                                        ...current,
                                        [type]: !current[type],
                                    }))
                                }
                            />
                        ))}
                    </section>

                    <section className="mt-2 border-y border-white/[0.08]">
                        <PanelHeading label="Display modes" icon={Eye} />
                        <ToggleRow
                            icon={AlertTriangle}
                            label="Elevated risk only"
                            value={elevatedRiskOnly}
                            onChange={setElevatedRiskOnly}
                            suffix={formatNumber(elevatedCount)}
                        />
                        <ToggleRow
                            icon={Tag}
                            label="Priority labels"
                            value={showLabels}
                            onChange={setShowLabels}
                        />
                        <ToggleRow
                            icon={Layers3}
                            label="Reference orbit bands"
                            value={showOrbitBands}
                            onChange={setShowOrbitBands}
                        />
                    </section>

                    <section className="mt-auto border-t border-white/[0.08]">
                        <PanelHeading label="Data pipeline" icon={Database} />
                        <div className="space-y-4 px-5 py-5 font-mono uppercase">
                            <div>
                                <p className="text-[7px] tracking-[0.16em] text-slate-700">Source</p>
                                <p className="mt-1 text-[9px] tracking-[0.09em] text-slate-400">
                                    {telemetry.source || 'CelesTrak'}
                                </p>
                            </div>
                            <div className="border-t border-white/[0.05] pt-4">
                                <p className="text-[7px] tracking-[0.16em] text-slate-700">Propagator</p>
                                <p className="mt-1 text-[9px] tracking-[0.09em] text-slate-400">
                                    {telemetry.propagator || 'SGP4'}
                                </p>
                            </div>
                            <div className="border-t border-white/[0.05] pt-4">
                                <p className="text-[7px] tracking-[0.16em] text-slate-700">Mode</p>
                                <p className="mt-1 text-[9px] tracking-[0.09em] text-slate-400">
                                    {String(telemetry.dataMode || 'live-propagated').replace(/-/g, ' ')}
                                </p>
                            </div>
                            <div className="border-t border-white/[0.05] pt-4">
                                <p className="text-[7px] tracking-[0.16em] text-slate-700">Updated</p>
                                <p className="mt-1 text-[8px] leading-4 tracking-[0.06em] text-slate-500">
                                    {formatTime(telemetry.updatedAt)}
                                </p>
                            </div>
                        </div>
                    </section>
                </aside>

                <main className="relative min-h-0 min-w-0 overflow-hidden border-x border-white/[0.04] bg-[#050a0f]">
                    <div className="absolute left-5 right-5 top-5 z-20 flex h-12 items-center justify-between border border-white/[0.09] bg-black/55 px-4 backdrop-blur-xl">
                        <span className="flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.17em] text-slate-500">
                            <Activity className="h-4 w-4 text-slate-500" strokeWidth={1.5} />
                            Current telemetry frame
                        </span>
                        <span className="font-mono text-[8px] uppercase tracking-[0.09em] text-slate-500">
                            {formatTime(telemetry.updatedAt)}
                        </span>
                    </div>

                    <GlobeVisualization
                        ref={globeRef}
                        enabledTypes={enabledTypes}
                        elevatedRiskOnly={elevatedRiskOnly}
                        showLabels={showLabels}
                        showOrbitBands={showOrbitBands}
                        isRotating={isRotating}
                        selectedObject={selectedObject}
                        onSelectObject={setSelectedObject}
                        onObjects={handleObjects}
                        onTelemetry={handleTelemetry}
                    />

                    <div className="absolute left-5 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2">
                        <button
                            type="button"
                            aria-label="Zoom in"
                            title="Zoom in"
                            onClick={() => globeRef.current?.zoomIn()}
                            className="grid h-11 w-11 place-items-center border border-white/[0.13] bg-black/65 text-slate-200 backdrop-blur-xl transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-200"
                        >
                            <Plus className="h-5 w-5" strokeWidth={1.5} />
                        </button>
                        <button
                            type="button"
                            aria-label="Zoom out"
                            title="Zoom out"
                            onClick={() => globeRef.current?.zoomOut()}
                            className="grid h-11 w-11 place-items-center border border-white/[0.13] bg-black/65 text-slate-200 backdrop-blur-xl transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-200"
                        >
                            <Minus className="h-5 w-5" strokeWidth={1.5} />
                        </button>
                        <button
                            type="button"
                            aria-label="Recenter globe"
                            title="Recenter globe"
                            onClick={() => globeRef.current?.resetView()}
                            className="grid h-11 w-11 place-items-center border border-white/[0.13] bg-black/65 text-slate-200 backdrop-blur-xl transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-200"
                        >
                            <Focus className="h-5 w-5" strokeWidth={1.5} />
                        </button>
                        <button
                            type="button"
                            aria-label="Fit the full globe and orbit field"
                            title="Fit all"
                            onClick={() => globeRef.current?.fitAll()}
                            className="grid h-11 w-11 place-items-center border border-white/[0.13] bg-black/65 text-slate-200 backdrop-blur-xl transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-200"
                        >
                            <Minimize2 className="h-5 w-5" strokeWidth={1.5} />
                        </button>
                        <button
                            type="button"
                            onClick={() => globeRef.current?.fitAll()}
                            className="mt-1 border border-white/[0.13] bg-black/65 px-2.5 py-2 font-mono text-[8px] leading-4 tracking-[0.08em] text-slate-300 backdrop-blur-xl transition hover:border-cyan-300/40 hover:text-cyan-200"
                        >
                            FIT FULL
                            <br />
                            ORBIT VIEW
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsRotating((current) => !current)}
                        className="absolute bottom-5 right-5 z-30 flex items-center gap-2.5 border border-white/[0.13] bg-black/65 px-4 py-3 font-mono text-[9px] tracking-[0.08em] text-slate-300 backdrop-blur-xl transition hover:border-cyan-300/40 hover:text-cyan-200"
                    >
                        {isRotating ? (
                            <Pause className="h-4 w-4" strokeWidth={1.5} />
                        ) : (
                            <Play className="h-4 w-4" strokeWidth={1.5} />
                        )}
                        {isRotating ? 'PAUSE ROTATION' : 'RESUME ROTATION'}
                    </button>

                    <div className="absolute bottom-5 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-4 border border-white/[0.08] bg-black/50 px-4 py-2 font-mono text-[8px] tracking-[0.08em] text-slate-500 backdrop-blur-xl md:flex">
                        <span>DRAG TO ROTATE</span>
                        <span className="h-3 w-px bg-white/10" />
                        <span>SCROLL TO MAGNIFY · FIT ALL FOR SMALLEST VIEW</span>
                    </div>
                </main>

                <aside className="hidden min-h-0 flex-col bg-black/45 xl:flex">
                    <header className="border-b border-white/[0.08] px-5 py-6">
                        <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-600">
                            Object inspector
                        </p>
                        <h2 className="mt-3 text-xl font-light tracking-tight text-slate-100">
                            Tracked objects
                        </h2>
                        <p className="mt-3 font-mono text-[7px] uppercase tracking-[0.14em] text-slate-700">
                            Select a map point or list entry
                        </p>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {trackedObjects.length > 0 ? (
                            trackedObjects.map((object, index) => (
                                <ObjectRow
                                    key={
                                        object?.id ||
                                        object?.norad_id ||
                                        `${object?.name}-${index}`
                                    }
                                    object={object}
                                    selected={
                                        selectedObject &&
                                        (selectedObject?.id === object?.id ||
                                            selectedObject?.norad_id === object?.norad_id)
                                    }
                                    onSelect={setSelectedObject}
                                />
                            ))
                        ) : (
                            <div className="px-5 py-8 font-mono text-[9px] leading-5 tracking-[0.08em] text-slate-600">
                                No live objects match the active filters.
                            </div>
                        )}
                    </div>

                    <footer className="border-t border-white/[0.08] px-5 py-4">
                        <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.1em]">
                            <span className="flex items-center gap-2 text-slate-600">
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                        telemetry.status === 'live'
                                            ? 'animate-pulse bg-emerald-400'
                                            : telemetry.status === 'stale'
                                              ? 'bg-amber-400'
                                              : 'bg-rose-400'
                                    }`}
                                />
                                {telemetry.status === 'live'
                                    ? 'Telemetry online'
                                    : telemetry.status === 'stale'
                                      ? 'Telemetry stale'
                                      : 'Telemetry offline'}
                            </span>
                            <span className="text-slate-500">
                                {formatNumber(telemetry.total || objects.length)} total
                            </span>
                        </div>
                    </footer>
                </aside>
            </div>
        </div>
    );
}
