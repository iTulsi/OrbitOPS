import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Globe, AlertTriangle, FileBarChart, Satellite, Rocket, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const Layout = ({ children }) => {
    const navItems = [
        { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/dashboard' },
        { id: 'visualization', icon: <Globe size={20} />, label: 'Live Map', path: '/visualization' },
        { id: 'alerts', icon: <AlertTriangle size={20} />, label: 'Alerts', path: '/alerts' },
        { id: 'reports', icon: <FileBarChart size={20} />, label: 'Reports', path: '/reports' },
        { id: 'satellites', icon: <Satellite size={20} />, label: 'Satellites', path: '/satellites' },
        { id: 'launches', icon: <Rocket size={20} />, label: 'Launches', path: '/launches' },
    ];

    const [isCollapsed, setIsCollapsed] = React.useState(false);

    return (
        <div className="flex h-screen w-screen bg-space-black text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <aside
                className={`${isCollapsed ? 'w-20' : 'w-64'} h-full bg-space-dark/80 backdrop-blur-xl border-r border-white/10 flex flex-col z-50 transition-all duration-300 relative`}
            >
                {/* Collapse Toggle */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-9 w-6 h-6 bg-space-dark border border-neon-cyan text-neon-cyan rounded-full flex items-center justify-center hover:bg-neon-cyan hover:text-black transition-all z-50 shadow-[0_0_10px_rgba(0,255,255,0.3)]"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                {/* Logo Area */}
                <div className={`p-6 border-b border-white/10 flex items-center gap-3 overflow-hidden whitespace-nowrap h-[89px] transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : ''}`}>
                    <div className="w-10 h-10 min-w-[2.5rem] rounded-full bg-gradient-to-br from-neon-cyan to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,255,255,0.5)]">
                        <Globe size={24} className="text-white animate-pulse-slow" />
                    </div>
                    <div className={`transition-all duration-300 overflow-hidden ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-32'}`}>
                        <h1 className="font-orbitron font-bold text-xl tracking-wider">OrbitOPS</h1>
                        <p className="text-[10px] text-neon-cyan/80 font-mono tracking-[0.2em]">SPACE DEBRIS MONITORING</p>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-6 px-3 space-y-3 overflow-x-hidden">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.id}
                            to={item.path}
                            title={isCollapsed ? item.label : ''}
                            className={({ isActive }) => `
                                flex items-center gap-3 py-3.5 transition-all duration-300 group relative overflow-hidden whitespace-nowrap
                                ${isCollapsed ? 'justify-center px-0 mx-2 rounded-xl' : 'px-4'}
                                ${isActive
                                    ? `bg-gradient-to-r from-neon-cyan/20 to-transparent text-white shadow-[inset_10px_0_20px_-10px_rgba(0,255,255,0.3)] ${isCollapsed ? 'border-none' : 'border-l-4 border-neon-cyan'}`
                                    : `text-gray-400 hover:text-white hover:bg-white/5 ${isCollapsed ? '' : 'border-l-4 border-transparent'}`}
                            `}
                        >
                            {({ isActive }) => (
                                <>
                                    <span className={`relative z-10 transition-transform duration-300 ${isCollapsed && isActive ? 'scale-110 drop-shadow-[0_0_5px_rgba(0,255,255,0.8)]' : ''}`}>{item.icon}</span>
                                    <span className={`relative z-10 font-medium tracking-wide text-sm transition-all duration-300 overflow-hidden whitespace-nowrap ${isCollapsed ? 'opacity-0 w-0' : 'opacity-100 ml-2 w-24'}`}>
                                        {item.label}
                                    </span>
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* User Profile / Status */}
                <div className="p-4 mt-auto overflow-hidden whitespace-nowrap">
                    <div className={`flex items-center gap-3 p-2 rounded-2xl bg-[#1a1a2e] border border-white/5 shadow-lg transition-all duration-300 ${isCollapsed ? 'justify-center bg-transparent border-none p-0' : 'p-4'}`}>
                        <div className="w-10 h-10 min-w-[2.5rem] rounded-full bg-gradient-to-tr from-gray-700 to-gray-600 p-[2px]">
                            <div className="w-full h-full rounded-full bg-gray-800 relative">
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#1a1a2e]"></span>
                            </div>
                        </div>
                        <div className={`transition-all duration-300 overflow-hidden ${isCollapsed ? 'opacity-0 w-0 hidden' : 'opacity-100 w-auto'}`}>
                            <p className="text-sm font-bold text-white">Commander</p>
                            <p className="text-[10px] text-green-500 font-mono tracking-wider">ONLINE</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-space-black to-space-black">
                {/* Background Grid Mesh */}
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
                        backgroundSize: '50px 50px'
                    }}
                />

                {children}
            </main>
        </div>
    );
};

export default Layout;
