import React from 'react';
import { Satellite, Battery, Signal, Wifi } from 'lucide-react';

const Satellites = () => {
    return (
        <div className="p-6 h-full overflow-y-auto scrollbar-hide">
            <h1 className="text-3xl font-orbitron font-bold text-white mb-6">Satellite Fleet</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="glass-card p-6 relative group overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-50">
                            <Satellite size={48} className="text-white/10" />
                        </div>

                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-white">STARLINK-{1020 + i}</h3>
                                <p className="text-sm text-gray-400">SpaceX • LEO</p>
                            </div>
                            <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded border border-green-500/20">
                                OPERATIONAL
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <div className="flex items-center gap-2 text-gray-300">
                                <Battery size={16} className="text-neon-cyan" />
                                <span>98%</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-300">
                                <Signal size={16} className="text-green-400" />
                                <span>Strong</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-300">
                                <Wifi size={16} className="text-purple-400" />
                                <span>Ka-Band</span>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-white/5 flex justify-between text-xs text-gray-500 font-mono">
                            <span>ALT: 550km</span>
                            <span>INC: 53.0°</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Satellites;
