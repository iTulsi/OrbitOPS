import React from 'react';
import { AlertTriangle, CheckCircle, Info, ShieldAlert } from 'lucide-react';

const Alerts = () => {
    const [alerts, setAlerts] = React.useState([
        { id: 1, type: 'CRITICAL', message: 'Collision risk detected: SAT-552 vs DEB-001', time: '10s ago' },
        { id: 2, type: 'WARNING', message: 'Solar flare activity increasing', time: '5m ago' },
        { id: 3, type: 'INFO', message: 'System maintenance scheduled for 02:00 UTC', time: '1h ago' },
    ]);

    return (
        <div className="p-6 h-full overflow-y-auto scrollbar-hide">
            <h1 className="text-3xl font-orbitron font-bold text-white mb-6">System Alerts</h1>
            <div className="grid gap-4">
                {alerts.map(alert => (
                    <div key={alert.id} className={`glass-card p-4 border-l-4 flex justify-between items-center ${alert.type === 'CRITICAL' ? 'border-red-500 bg-red-900/10' :
                            alert.type === 'WARNING' ? 'border-orange-500 bg-orange-900/10' :
                                'border-neon-cyan bg-cyan-900/10'
                        }`}>
                        <div className="flex items-center gap-4">
                            {alert.type === 'CRITICAL' ? <ShieldAlert className="text-red-500" /> :
                                alert.type === 'WARNING' ? <AlertTriangle className="text-orange-500" /> :
                                    <Info className="text-neon-cyan" />}
                            <div>
                                <h3 className="font-bold text-white">{alert.type} ALERT</h3>
                                <p className="text-gray-300">{alert.message}</p>
                            </div>
                        </div>
                        <span className="text-sm text-gray-500 font-mono">{alert.time}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Alerts;
