import React from 'react';
import { Rocket, Target, ShieldCheck } from 'lucide-react';

const Launches = () => {
    return (
        <div className="p-6 h-full overflow-y-auto scrollbar-hide">
            <h1 className="text-3xl font-orbitron font-bold text-white mb-6">Launch Mission Planner</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="glass-card p-6 lg:col-span-2">
                    <h2 className="text-xl font-orbitron text-white mb-4 flex items-center gap-2">
                        <Rocket className="text-neon-cyan" /> Mission Trajectory
                    </h2>
                    <div className="h-[400px] w-full bg-black/20 rounded-xl border border-white/10 flex items-center justify-center text-gray-500 font-mono relative overflow-hidden">
                        {/* Mock Trajectory Visualization */}
                        <div className="absolute inset-0 opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/World_map_blank_without_borders.svg/2000px-World_map_blank_without_borders.svg.png')] bg-cover bg-center grayscale" />
                        <svg className="absolute inset-0 w-full h-full">
                            <path d="M 100 350 Q 400 100 700 350" stroke="#00ffff" strokeWidth="2" fill="none" strokeDasharray="5,5" className="animate-pulse" />
                            <circle cx="100" cy="350" r="4" fill="#fff" />
                            <circle cx="700" cy="350" r="4" fill="#00ff99" />
                        </svg>
                        <div className="z-10 bg-black/80 px-4 py-2 rounded-lg border border-neon-cyan text-neon-cyan drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">
                            SIMULATION ACTIVE
                        </div>
                    </div>
                </div>

                <div className="glass-card p-6 space-y-6">
                    <div>
                        <h3 className="text-gray-400 text-sm uppercase tracking-wider mb-2">Launch Status</h3>
                        <div className="text-4xl font-bold font-orbitron text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">
                            GO FOR LAUNCH
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                            <div className="flex justify-between mb-1">
                                <span className="text-gray-400">T-Minus</span>
                                <span className="font-mono text-neon-cyan">00:45:00</span>
                            </div>
                            <div className="w-full h-1 bg-gray-700 rounded-full mt-2">
                                <div className="w-3/4 h-full bg-neon-cyan rounded-full" />
                            </div>
                        </div>

                        <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                            <div className="flex items-center gap-3 mb-2">
                                <Target size={18} className="text-purple-400" />
                                <span className="font-bold text-white">Orbit Injection</span>
                            </div>
                            <p className="text-sm text-gray-400">Target Altitude: 450km</p>
                            <p className="text-sm text-gray-400">Inclination: 28.5°</p>
                        </div>

                        <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30 flex items-center gap-3">
                            <ShieldCheck size={24} className="text-green-400" />
                            <div>
                                <div className="font-bold text-green-400">Corridor Clear</div>
                                <div className="text-xs text-gray-300">No debris intersections detected</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Launches;
