import React from 'react';
import GlobeVisualization from '../components/GlobeVisualization';

const Visualization = () => {
    return (
        <div className="w-full h-full relative">
            <div className="absolute top-4 left-4 z-10">
                <h1 className="text-3xl font-orbitron font-bold text-white mb-2 drop-shadow-md">3D Orbital View</h1>
                <p className="text-gray-300 drop-shadow-md">Interactive Global Debris Map</p>
            </div>
            <GlobeVisualization />
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex gap-4 bg-black/50 backdrop-blur-md p-2 rounded-full border border-white/10">
                <div className="flex items-center gap-2 px-3">
                    <span className="w-3 h-3 rounded-full bg-green-500"></span>
                    <span className="text-xs text-white">Satellites</span>
                </div>
                <div className="flex items-center gap-2 px-3">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span className="text-xs text-white">Debris</span>
                </div>
                <div className="flex items-center gap-2 px-3">
                    <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                    <span className="text-xs text-white">Rocket Bodies</span>
                </div>
            </div>
        </div>
    );
};

export default Visualization;
