import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Sphere, MeshDistortMaterial } from '@react-three/drei';
import { motion } from 'framer-motion';
import {
    Globe,
    Satellite,
    Trash2,
    AlertTriangle,
    CloudSun,
    Tractor,
    Wifi,
    Radio,
    ArrowRight,
    Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';

/* --- 3D Components --- */

const RotatingEarth = () => {
    const earthRef = useRef();

    useFrame(({ clock }) => {
        if (earthRef.current) {
            earthRef.current.rotation.y = clock.getElapsedTime() * 0.1;
        }
    });

    return (
        <group>
            {/* Main Earth Sphere */}
            <Sphere ref={earthRef} args={[2.5, 64, 64]}>
                <MeshDistortMaterial
                    color="#1e3a8a" // Deep blue
                    emissive="#172554" // Dark navy glow
                    emissiveIntensity={0.2}
                    roughness={0.4}
                    metalness={0.8}
                    distort={0.15} // Slight atmosphere distortion effect
                    speed={1.5}
                />
            </Sphere>

            {/* Atmosphere Glow */}
            <Sphere args={[2.8, 64, 64]}>
                <meshBasicMaterial
                    color="#0ea5e9" // Cyan
                    transparent
                    opacity={0.1}
                    side={2} // DoubleSide logic safely mapped
                />
            </Sphere>

            {/* Orbit Lines */}
            <mesh rotation={[Math.PI / 3, 0, 0]}>
                <torusGeometry args={[3.2, 0.02, 16, 100]} />
                <meshBasicMaterial color="#a855f7" transparent opacity={0.6} />
            </mesh>
            <mesh rotation={[-Math.PI / 4, 0, 0]}>
                <torusGeometry args={[3.8, 0.02, 16, 100]} />
                <meshBasicMaterial color="#06b6d4" transparent opacity={0.6} />
            </mesh>
        </group>
    );
};

const SpaceScene = () => {
    return (
        <div className="absolute inset-0 z-0">
            <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1.5} color="#c084fc" />
                <pointLight position={[-10, -10, -10]} intensity={1} color="#38bdf8" />

                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

                <RotatingEarth />
                <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.5} />
            </Canvas>
        </div>
    );
};


/* --- UI Components --- */

const StatCard = ({ icon: Icon, label, value, color, delay }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay }}
        className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4 hover:bg-white/10 transition-colors shadow-[0_0_15px_rgba(0,0,0,0.3)] group"
    >
        <div className={`p-3 rounded-lg bg-${color}-500/20 text-${color}-400 group-hover:scale-110 transition-transform`}>
            <Icon size={24} />
        </div>
        <div>
            <div className="text-2xl font-bold text-white tracking-widest font-mono">{value}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wider">{label}</div>
        </div>
    </motion.div>
);

const BenefitCard = ({ icon: Icon, title, desc, delay }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay }}
        viewport={{ once: true }}
        className="glass-panel p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all group"
    >
        <div className="mb-4 inline-block p-4 rounded-full bg-indigo-500/10 text-cyan-400 group-hover:text-cyan-300 group-hover:bg-cyan-500/20 transition-colors">
            <Icon size={32} />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
    </motion.div>
);

const RiskGauge = ({ percentage, color, label }) => (
    <div className="relative w-32 h-32 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
            <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/10" />
            <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={351.86}
                strokeDashoffset={351.86 - (351.86 * percentage) / 100}
                className={`${color} transition-all duration-1000 ease-out`}
                strokeLinecap="round"
            />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white font-mono">{percentage}%</span>
            <span className="text-xs text-gray-400 uppercase">{label}</span>
        </div>
    </div>
);


/* --- Main Page --- */

const Home = () => {
    return (
        <div className="min-h-screen bg-[#020617] text-white relative overflow-x-hidden font-sans selection:bg-cyan-500/30">

            {/* Background Gradient */}
            <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-indigo-950/40 to-slate-950 pointer-events-none" />

            {/* Hero Section */}
            <section className="relative h-screen min-h-[800px] flex flex-col items-center justify-center pt-20">

                {/* 3D Background */}
                <SpaceScene />

                {/* Content Overlay */}
                <div className="relative z-10 container mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 h-full items-center">

                    {/* Left Side: Text */}
                    <div className="lg:col-span-5 space-y-8 text-center lg:text-left pt-20 lg:pt-0">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8 }}
                        >
                            <h1 className="text-5xl lg:text-7xl font-bold tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 animate-gradient-x">
                                OrbitOPS
                            </h1>
                            <h2 className="text-3xl lg:text-4xl font-light text-white mb-6">
                                Live Space Activity <br /><span className="text-cyan-400 font-semibold">Above Us</span>
                            </h2>
                            <p className="text-lg text-slate-300 max-w-lg mx-auto lg:mx-0 leading-relaxed">
                                Thousands of satellites orbit Earth, powering our GPS, weather forecasts, and global communication. Monitor the skies in real-time.
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                            className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
                        >
                            <Link
                                to="/visualization"
                                className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full font-semibold transition-all shadow-[0_0_20px_rgba(8,145,178,0.4)] hover:shadow-[0_0_30px_rgba(8,145,178,0.6)] flex items-center gap-2 group"
                            >
                                Launch Live Map
                                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </Link>
                            <Link
                                to="/reports"
                                className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full font-semibold transition-all backdrop-blur-sm"
                            >
                                View Reports
                            </Link>
                        </motion.div>
                    </div>

                    {/* Right Side: Floating Counters (positioned around the 3D earth visually) */}
                    <div className="lg:col-span-7 relative h-full flex items-center justify-center pointer-events-none">
                        {/* The Earth is in the background, but we can place UI elements "floating" near it */}

                        <div className="absolute top-1/4 right-10 lg:right-20 pointer-events-auto">
                            <StatCard icon={Satellite} label="Active Satellites" value="8,400+" color="cyan" delay={0.4} />
                        </div>

                        <div className="absolute bottom-1/3 left-0 lg:-left-10 pointer-events-auto">
                            <StatCard icon={Trash2} label="Debris Objects" value="34,000+" color="rose" delay={0.6} />
                        </div>

                        <div className="absolute top-1/3 left-10 lg:left-0 pointer-events-auto">
                            <StatCard icon={Activity} label="Tracked Objects" value="~42k" color="purple" delay={0.5} />
                        </div>

                        <div className="absolute bottom-1/4 right-0 lg:right-10 pointer-events-auto">
                            <StatCard icon={AlertTriangle} label="Collision Risks" value="High" color="amber" delay={0.7} />
                        </div>
                    </div>
                </div>

                {/* Scroll Indicator */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, y: [0, 10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                    className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
                >
                    <div className="w-6 h-10 border-2 border-white/20 rounded-full flex justify-center p-1">
                        <div className="w-1 h-2 bg-cyan-400 rounded-full" />
                    </div>
                </motion.div>
            </section>


            {/* Farmer / Impact Section */}
            <section className="relative py-24 px-6 bg-slate-950/80 backdrop-blur-xl border-t border-white/5">
                <div className="container mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
                            Why This Matters to Farmers
                        </h2>
                        <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                            Space isn’t just about rockets. It directly impacts your daily operations on the ground.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <BenefitCard
                            icon={CloudSun}
                            title="Weather Forecasts"
                            desc="Satellites provide the data for upcoming storms, rainfall predictions, and drought monitoring."
                            delay={0.1}
                        />
                        <BenefitCard
                            icon={Tractor}
                            title="GPS for Tractors"
                            desc="Precision farming relies on GPS satellites for automated steering and field mapping."
                            delay={0.2}
                        />
                        <BenefitCard
                            icon={Wifi}
                            title="Rural Connection"
                            desc="Starlink and other constellations bring high-speed internet to remote farm locations."
                            delay={0.3}
                        />
                        <BenefitCard
                            icon={Radio}
                            title="Disaster Alerts"
                            desc="Early warnings for floods and fires help protect livestock and crops before disaster strikes."
                            delay={0.4}
                        />
                    </div>
                </div>
            </section>

            {/* Live Metrics Section */}
            <section className="py-24 px-6 relative overflow-hidden">
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-1/2 h-full bg-cyan-500/5 blur-[100px] -z-10" />
                <div className="absolute bottom-0 left-0 w-1/2 h-full bg-purple-500/5 blur-[100px] -z-10" />

                <div className="container mx-auto">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-12 bg-white/5 border border-white/10 rounded-3xl p-8 lg:p-12 backdrop-blur-md">

                        <div className="lg:w-1/2 space-y-6">
                            <h3 className="text-3xl font-bold text-white">Current Orbit Risk Status</h3>
                            <p className="text-slate-400 leading-relaxed">
                                Space debris poses a constant threat to the satellites that power modern agriculture and communication.
                                Our real-time monitoring system tracks collision probabilities 24/7.
                            </p>
                            <div className="flex items-center gap-4 text-sm text-cyan-300">
                                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                                Live System Status: OTPIMAL
                            </div>
                        </div>

                        <div className="lg:w-1/2 flex flex-wrap justify-center gap-8 lg:gap-16">
                            <RiskGauge percentage={72} color="text-amber-500" label="Collision Risk" />
                            <RiskGauge percentage={85} color="text-cyan-500" label="Traffic Load" />
                            <RiskGauge percentage={98} color="text-purple-500" label="Data Uptime" />
                        </div>

                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 text-center text-slate-500 text-sm border-t border-white/5">
                <p>© 2026 OrbitOPS. Monitoring the chaos above.</p>
            </footer>
        </div>
    );
};

export default Home;
