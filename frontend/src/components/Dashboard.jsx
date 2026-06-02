import React, { useMemo, useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, X, Eye } from 'lucide-react';

export default function Dashboard({ data = [], stats = {}, onRefresh = () => {}, lastUpdated = 0, source }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedObject, setSelectedObject] = useState(null);

    // Auto-refresh every 10 seconds
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            setIsRefreshing(true);
            onRefresh();
            setTimeout(() => setIsRefreshing(false), 1000);
        }, 10000);
        return () => clearInterval(interval);
    }, [autoRefresh, onRefresh]);

    const handleManualRefresh = () => {
        setIsRefreshing(true);
        onRefresh();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    const computed = useMemo(() => {
        const total = (data && data.length) || stats?.total_objects || 0;
        const satellites = (data && data.filter?.(d => d.type === 'SATELLITE').length) || stats?.classification?.active_satellites || 0;
        const debris = (data && data.filter?.(d => d.type === 'DEBRIS' || d.type === 'ROCKET_BODY').length) || stats?.classification?.debris || 0;
        const highRisk = (data && data.filter?.(d => d.risk_level === 'HIGH' || d.risk === 'HIGH').length) || 0;
        return { total, satellites, debris, highRisk };
    }, [data, stats]);

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return data || [];
        const lower = searchTerm.toLowerCase();
        return (data || []).filter(o => (o?.name || '').toLowerCase().includes(lower));
    }, [data, searchTerm]);

    const displayList = filtered.slice(0, 5);

    return (
        <div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-3xl font-bold">Mission Control Dashboard</h1>
                        <p className="text-sm text-gray-400 mt-1">Real-time space debris monitoring and tracking</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Live Status Indicator */}
                        <div className="flex items-center gap-2">
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isRefreshing ? 'bg-blue-600/30 border border-blue-500' : 'bg-slate-700/50'}`}>
                                {isRefreshing && <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />}
                                {!isRefreshing && autoRefresh && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>}
                                <span className="text-xs font-medium text-gray-300">
                                    {isRefreshing ? 'Checking Status...' : autoRefresh ? 'Live' : 'Paused'}
                                </span>
                            </div>
                        </div>
                        {/* Buttons */}
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setAutoRefresh(!autoRefresh)}
                                className={`px-4 py-2 rounded font-semibold transition-all ${autoRefresh ? 'bg-green-600/40 border border-green-500 text-green-300' : 'bg-slate-700 text-gray-300'}`}
                            >
                                {autoRefresh ? '✓ Auto Refresh' : 'Auto Refresh'}
                            </button>
                            <button 
                                onClick={handleManualRefresh}
                                disabled={isRefreshing}
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded font-semibold transition-all flex items-center gap-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard 
                    icon="🛰️" 
                    label="Total Objects"
                    value={computed.total}
                    bgGradient="from-cyan-600/10 to-blue-600/10"
                    borderColor="border-cyan-500/30"
                />
                <StatCard 
                    icon="✓" 
                    label="Active Satellites"
                    value={computed.satellites}
                    bgGradient="from-green-600/10 to-emerald-600/10"
                    borderColor="border-green-500/30"
                />
                <StatCard 
                    icon="⚠️" 
                    label="Space Debris"
                    value={computed.debris}
                    bgGradient="from-yellow-600/10 to-orange-600/10"
                    borderColor="border-yellow-500/30"
                />
                <StatCard 
                    icon="🚨" 
                    label="High Risk Collisions"
                    value={computed.highRisk}
                    bgGradient="from-red-600/10 to-pink-600/10"
                    borderColor="border-red-500/30"
                />
            </div>

            {/* Search & Filters */}
            <div className="mb-8 space-y-4">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search objects..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                        />
                    </div>
                    <button onClick={onRefresh} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded font-semibold">
                        Refresh
                    </button>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <Filter className="w-4 h-4" />
                    <span className="text-cyan-400">Advanced Filters</span>
                </div>
            </div>

            {/* Tracked Objects Table */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50">
                    <h2 className="text-lg font-semibold">Tracked Objects</h2>
                    <p className="text-xs text-gray-400 mt-1">{filtered.length} objects · Showing first 5</p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-700/30 border-b border-slate-700/50">
                            <tr>
                                <th className="text-left px-6 py-3 font-semibold">Name</th>
                                <th className="text-left px-6 py-3 font-semibold">Type</th>
                                <th className="text-left px-6 py-3 font-semibold">Altitude (km)</th>
                                <th className="text-left px-6 py-3 font-semibold">Risk</th>
                                <th className="text-left px-6 py-3 font-semibold">Status</th>
                                <th className="text-left px-6 py-3 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayList.length > 0 ? (
                                displayList.map((obj, idx) => (
                                    <tr key={idx} className="data-row border-b border-slate-700/30 hover:bg-slate-700/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full animate-pulse ${obj?.risk_level === 'HIGH' || obj?.risk === 'HIGH' ? 'bg-red-500' : 'bg-green-500'}`}></span>
                                                <div>
                                                    <div className="font-medium">{obj?.name || `Object ${idx + 1}`}</div>
                                                    <div className="text-xs text-gray-400">{obj?.id || 'ID-' + idx.toString().padStart(3, '0')}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">{obj?.type || 'Debris'}</td>
                                        <td className="px-6 py-4 text-gray-300 font-semibold text-cyan-400">{(obj?.altitude ?? obj?.alt) ? Math.round(obj?.altitude ?? obj?.alt).toLocaleString() : 'N/A'}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                obj?.risk_level === 'HIGH' || obj?.risk === 'HIGH' ? 'bg-red-600/20 text-red-300' :
                                                obj?.risk_level === 'MEDIUM' || obj?.risk === 'MEDIUM' ? 'bg-yellow-600/20 text-yellow-300' :
                                                'bg-green-600/20 text-green-300'
                                            }`}>
                                                {obj?.risk_level || obj?.risk || 'LOW'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1">
                                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                                <span className="text-green-400 font-medium">ACTIVE</span>
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setSelectedObject(obj)}
                                                className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/50 hover:border-cyan-400 text-cyan-400 hover:text-cyan-300 rounded text-xs font-medium transition-all group"
                                            >
                                                <Eye className="w-3 h-3 group-hover:scale-110 transition-transform" />
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr className="border-b border-slate-700/30">
                                    <td colSpan="6" className="px-6 py-8 text-center text-gray-400">No objects found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex items-center justify-between text-xs text-gray-500">
                <div>Last update: {lastUpdated ? new Date(lastUpdated * 1000).toLocaleString() : '—'}</div>
                <div>{source === 'mock' ? '(Mock data - CelesTrak unavailable)' : '(Live CelesTrak data)'}</div>
            </div>

            {/* Details Modal */}
            {selectedObject && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto shadow-2xl">
                        {/* Modal Header */}
                        <div className="px-8 py-6 border-b border-slate-700 flex items-start justify-between">
                            <div>
                                <h2 className="text-2xl font-bold text-cyan-400">{selectedObject?.name || 'Unknown Object'}</h2>
                                <p className="text-sm text-gray-400 mt-1">ID: {selectedObject?.id || 'N/A'}</p>
                            </div>
                            <button
                                onClick={() => setSelectedObject(null)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="px-8 py-6 space-y-6">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600/50">
                                    <div className="text-xs text-gray-400 mb-1">Object Type</div>
                                    <div className="text-lg font-bold text-blue-400">{selectedObject?.type || 'Unknown'}</div>
                                </div>
                                <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600/50">
                                    <div className="text-xs text-gray-400 mb-1">Status</div>
                                    <div className="inline-flex items-center gap-2">
                                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                        <span className="text-lg font-bold text-green-400">ACTIVE</span>
                                    </div>
                                </div>
                            </div>

                            {/* Orbital Data */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600/50">
                                    <div className="text-xs text-gray-400 mb-2">Altitude</div>
                                    <div className="text-xl font-bold text-cyan-400">{(selectedObject?.altitude ?? selectedObject?.alt) ? Math.round(selectedObject?.altitude ?? selectedObject?.alt).toLocaleString() : 'N/A'} km</div>
                                </div>
                                <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600/50">
                                    <div className="text-xs text-gray-400 mb-2">Risk Level</div>
                                    <div className={`text-lg font-bold ${
                                        selectedObject?.risk_level === 'HIGH' || selectedObject?.risk === 'HIGH' ? 'text-red-400' :
                                        selectedObject?.risk_level === 'MEDIUM' || selectedObject?.risk === 'MEDIUM' ? 'text-yellow-400' :
                                        'text-green-400'
                                    }`}>
                                        {selectedObject?.risk_level || selectedObject?.risk || 'LOW'}
                                    </div>
                                </div>
                                <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600/50">
                                    <div className="text-xs text-gray-400 mb-2">Last Updated</div>
                                    <div className="text-sm font-bold text-gray-300">{lastUpdated ? new Date(lastUpdated * 1000).toLocaleTimeString() : 'N/A'}</div>
                                </div>
                            </div>

                            {/* Additional Details */}
                            <div className="bg-gradient-to-r from-cyan-600/10 to-blue-600/10 p-4 rounded-lg border border-cyan-500/30">
                                <div className="text-xs text-gray-400 mb-3 font-semibold">ADDITIONAL INFORMATION</div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Orbital Period:</span>
                                        <span className="text-cyan-300 font-medium">{selectedObject?.period ? selectedObject.period.toFixed(2) : 'N/A'} min</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Inclination:</span>
                                        <span className="text-cyan-300 font-medium">{selectedObject?.inclination ? selectedObject.inclination.toFixed(2) : 'N/A'}°</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Eccentricity:</span>
                                        <span className="text-cyan-300 font-medium">{selectedObject?.eccentricity ? selectedObject.eccentricity.toFixed(4) : 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Mean Motion:</span>
                                        <span className="text-cyan-300 font-medium">{selectedObject?.mean_motion ? selectedObject.mean_motion.toFixed(4) : 'N/A'} rev/day</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-8 py-4 border-t border-slate-700 flex justify-end gap-3">
                            <button
                                onClick={() => setSelectedObject(null)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded font-medium transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => setSelectedObject(null)}
                                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded font-medium transition-colors"
                            >
                                Track Object
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ icon, label, value, bgGradient, borderColor }) {
    return (
        <div className={`stat-card bg-gradient-to-br ${bgGradient} border ${borderColor} rounded-lg p-6`}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="text-2xl">{icon}</div>
                    <p className="text-sm text-gray-300 mt-4">{label}</p>
                    <div className="text-3xl font-bold mt-2">{value.toLocaleString()}</div>
                </div>
            </div>
        </div>
    );
}
