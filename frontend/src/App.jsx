import { useEffect, useState } from 'react';
import {
    BrowserRouter as Router,
    Navigate,
    Route,
    Routes
} from 'react-router-dom';
import './command-center.css';

import Layout from './components/Layout';
import Dashboard from './components/Dashboard';

import Home from './pages/Home';
import Visualization from './pages/Visualization';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import Satellites from './pages/Satellites';
import Launches from './pages/Launches';

import { orbitApi } from './services/api';
import { orbitSocket as socket } from './services/socket';

import OrbitMotionStage from './components/OrbitMotionStage';
function AppPage({ children, connected }) {
    return (
        <Layout connected={connected}>
            {children}
        </Layout>
    );
}

function App() {
    const [orbitData, setOrbitData] = useState({
        objects: [],
        stats: {},
        last_updated: 0,
        source: 'celestrak'
    });

    const [connected, setConnected] = useState(false);

    useEffect(() => {
        let cancelled = false;

        orbitApi
            .debris()
            .then((data) => {
                if (cancelled || !data) return;

                setOrbitData({
                    objects: data.objects ?? [],
                    stats: data.stats ?? {},
                    last_updated:
                        data.last_updated ??
                        data.updated_at ??
                        Date.now() / 1000,
                    source: data.source ?? 'celestrak'
                });
            })
            .catch((error) => {
                console.error('Initial orbital-data load failed:', error);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const handleConnect = () => {
            console.log('Connected to OrbitOPS real-time stream');
            setConnected(true);
        };

        const handleOrbitalData = (data) => {
            if (!data) return;

            setOrbitData((current) => ({
                objects: data.objects ?? current.objects,
                stats: data.stats ?? current.stats,
                last_updated:
                    data.last_updated ??
                    data.updated_at ??
                    Date.now() / 1000,
                source: data.source ?? current.source
            }));
        };

        const handleDisconnect = () => {
            console.log('Disconnected from OrbitOPS stream');
            setConnected(false);
        };

        socket.on('connect', handleConnect);
        socket.on('orbital_data', handleOrbitalData);
        socket.on('disconnect', handleDisconnect);

        setConnected(socket.connected);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('orbital_data', handleOrbitalData);
            socket.off('disconnect', handleDisconnect);
        };
    }, []);

    const handleRefresh = async () => {
        try {
            const data = await orbitApi.debris();

            setOrbitData((current) => ({
                objects: data.objects ?? current.objects,
                stats: data.stats ?? current.stats,
                last_updated:
                    data.last_updated ??
                    data.updated_at ??
                    Date.now() / 1000,
                source: data.source ?? current.source
            }));
        } catch (error) {
            console.error('Manual orbital-data refresh failed:', error);
        }
    };

    return (
        <Router>
            <OrbitMotionStage>
            <Routes>
                <Route
                    path="/"
                    element={
                        <Home
                            connected={connected}
                            stats={orbitData.stats}
                            lastUpdated={orbitData.last_updated}
                        />
                    }
                />

                <Route
                    path="/overview"
                    element={
                        <AppPage connected={connected}>
                            <div className="relative z-10 min-h-full w-full">
                                <Dashboard
                                    data={orbitData.objects}
                                    stats={orbitData.stats}
                                    onRefresh={handleRefresh}
                                    lastUpdated={orbitData.last_updated}
                                    source={orbitData.source}
                                    connected={connected}
                                />
                            </div>
                        </AppPage>
                    }
                />

                <Route
                    path="/live-tracking"
                    element={
                        <AppPage connected={connected}>
                            <Visualization
                                data={orbitData.objects}
                                connected={connected}
                                lastUpdated={orbitData.last_updated}
                                source={orbitData.source}
                            />
                        </AppPage>
                    }
                />

                <Route
                    path="/conjunctions"
                    element={
                        <AppPage connected={connected}>
                            <Alerts />
                        </AppPage>
                    }
                />

                <Route
                    path="/analytics"
                    element={
                        <AppPage connected={connected}>
                            <Launches />
                        </AppPage>
                    }
                />

                <Route
                    path="/object-catalog"
                    element={
                        <AppPage connected={connected}>
                            <Satellites />
                        </AppPage>
                    }
                />

                <Route
                    path="/ai-briefing"
                    element={<Navigate to="/reports" replace />}
                />

                <Route
                    path="/reports"
                    element={
                        <AppPage connected={connected}>
                            <Reports />
                        </AppPage>
                    }
                />

                {/* Compatibility redirects for the existing application URLs */}
                <Route
                    path="/dashboard"
                    element={<Navigate to="/overview" replace />}
                />
                <Route
                    path="/visualization"
                    element={<Navigate to="/live-tracking" replace />}
                />
                <Route
                    path="/alerts"
                    element={<Navigate to="/conjunctions" replace />}
                />
                <Route
                    path="/satellites"
                    element={<Navigate to="/object-catalog" replace />}
                />
                <Route
                    path="/launches"
                    element={<Navigate to="/analytics" replace />}
                />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </OrbitMotionStage>
        </Router>
    );
}

export default App;
