import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const data = [
    { name: 'Jan', debris: 4000, satellites: 2400 },
    { name: 'Feb', debris: 4200, satellites: 2450 },
    { name: 'Mar', debris: 4500, satellites: 2500 },
    { name: 'Apr', debris: 4700, satellites: 2600 },
    { name: 'May', debris: 5000, satellites: 2700 },
    { name: 'Jun', debris: 5200, satellites: 2800 },
];

const Reports = () => {
    return (
        <div className="p-6 h-full overflow-y-auto scrollbar-hide">
            <h1 className="text-3xl font-orbitron font-bold text-white mb-6">Analytics Reports</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-card p-6">
                    <h2 className="text-xl font-orbitron text-neon-cyan mb-4">Debris Growth Trend</h2>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorDebris" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" stroke="#6b7280" />
                                <YAxis stroke="#6b7280" />
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }} />
                                <Area type="monotone" dataKey="debris" stroke="#ef4444" fillOpacity={1} fill="url(#colorDebris)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="glass-card p-6">
                    <h2 className="text-xl font-orbitron text-green-400 mb-4">Orbital Distribution</h2>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data}>
                                <XAxis dataKey="name" stroke="#6b7280" />
                                <YAxis stroke="#6b7280" />
                                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151' }} />
                                <Legend />
                                <Bar dataKey="satellites" fill="#10b981" />
                                <Bar dataKey="debris" fill="#ef4444" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Reports;
