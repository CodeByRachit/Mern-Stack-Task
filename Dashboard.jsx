// NOTE: We MUST remove the direct import statement and rely only on the global 'React' object
//       loaded by the index.html file to avoid the "useState is undefined" error.

const API_BASE_URL = 'http://localhost:3000'; 
const SPIKE_THRESHOLD = 0.10; 
const INITIAL_PRICES = {
    "NSE:ACC": 1800.00,
    "NSE:SBIN": 750.00,
    "NSE:TCS": 3300.00,
    "NSE:INFY": 1500.00
};
const LOG_STORAGE_KEY = 'spikeEventLog'; 
const MAX_HISTORY_POINTS = 500; 
const LATENCY_BUFFER_SIZE = 1000; 
const MIN_CALCULATION_TIME_MS = 500; // Critical: Start displaying metrics after 0.5s

// CRITICAL FIX: Pull all necessary hooks and utilities from the global React object
const { useState, useEffect, useCallback, useRef, memo } = React;

// --- Helper Functions ---
const formatPrice = (price) => price ? price.toFixed(2) : 'N/A';
const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
};
const calculateVolatility = (prices) => {
    if (prices.length < 2) return 0;
    const values = prices.map(d => d.price);
    const mean = values.reduce((sum, current) => sum + current, 0) / values.length;
    const variance = values.reduce((sum, current) => sum + Math.pow(current - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
};
const calculateAverage = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b) / arr.length : 0;


// --- Theme and UI Helpers (Unchanged for brevity) ---
const ThemeIcon = ({ theme }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 transition-transform duration-300" viewBox="0 0 24 24" fill="currentColor">
        {theme === 'light' ? (
            <path d="M12 2a10 10 0 1010 10 10 10 0 00-10-10zm0 18a8 8 0 118-8 8 8 0 01-8 8z"/>
        ) : (
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
        )}
    </svg>
);
const Loader = ({ isDark }) => (
    <div className="flex items-center justify-center space-x-2 p-6">
        <div className={`w-4 h-4 rounded-full animate-pulse ${isDark ? 'bg-blue-400' : 'bg-blue-600'}`}></div>
        <div className="w-4 h-4 rounded-full animate-pulse delay-150" style={{backgroundColor: isDark ? '#60A5FA' : '#1D4ED8'}}></div>
        <div className="w-4 h-4 rounded-full animate-pulse delay-300" style={{backgroundColor: isDark ? '#3B82F6' : '#2563EB'}}></div>
        <span className="ml-4 font-medium" style={{color: isDark ? '#9CA3AF' : '#6B7280'}}>Connecting to High-Frequency Server...</span>
    </div>
);


// --- Price History Line Chart Component (Unchanged for brevity) ---
const PriceHistoryChart = memo(({ history, selectedInstrument, isDark }) => {
    const data = history[selectedInstrument] || [];

    if (data.length < 2) {
        return <p className="p-4 text-center" style={{color: isDark ? '#A1A1AA' : '#6B7280'}}>Awaiting data points for charting...</p>;
    }

    const margin = 5;
    const width = 200;
    const height = 100;

    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    const getX = (index) => index / (data.length - 1) * (width - 2 * margin) + margin;
    const getY = (price) => {
        if (priceRange === 0) return height / 2;
        return height - ((price - minPrice) / priceRange) * (height - 2 * margin) - margin;
    };

    const pathD = data.map((d, i) => {
        const x = getX(i);
        const y = getY(d.price);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    const lineColor = isDark ? '#10B981' : '#047857';
    const annotationColor = isDark ? '#9CA3AF' : '#6B7280';
    const lastPrice = data[data.length - 1].price;

    return (
        <div className="p-4">
            <h3 className="text-xl font-semibold mb-2" style={{color: isDark ? '#E5E7EB' : '#1F2937'}}>
                {selectedInstrument} Price Trend 
                <span className="font-mono ml-3 text-2xl" style={{color: isDark ? '#D1D5DB' : '#374151'}}>{formatPrice(lastPrice)}</span>
            </h3>
            <div style={{ position: 'relative', height: '100px' }}>
                <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none">
                    <text x={width + 1} y={getY(maxPrice)} fill={annotationColor} fontSize="6" alignmentBaseline="hanging">{formatPrice(maxPrice)}</text>
                    <text x={width + 1} y={getY(minPrice)} fill={annotationColor} fontSize="6" alignmentBaseline="baseline">{formatPrice(minPrice)}</text>
                    <line x1={margin} y1={getY(maxPrice)} x2={width - margin} y2={getY(maxPrice)} stroke={annotationColor} strokeWidth="0.2" strokeDasharray="1,1"/>
                    <line x1={margin} y1={getY(minPrice)} x2={width - margin} y2={getY(minPrice)} stroke={annotationColor} strokeWidth="0.2" strokeDasharray="1,1"/>

                    <path d={pathD} fill="none" stroke={lineColor} strokeWidth="1" vectorEffect="non-scaling-stroke" />

                    <circle cx={getX(data.length - 1)} cy={getY(lastPrice)} r="2" fill="#F59E0B" />
                </svg>
            </div>
            <p className="text-xs text-right mt-2" style={{color: annotationColor}}>Tracking last {data.length} ticks (~{formatTime(data.length)}).</p>
        </div>
    );
});


// --- Metric Card Component (Unchanged for brevity) ---
const MetricCard = memo(({ title, value, unit, isDark, colorClass }) => {
    const cardContainerClass = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
    const valueClass = colorClass || (isDark ? 'text-blue-400' : 'text-blue-600');

    return (
        <div className={`p-4 rounded-xl shadow-md border ${cardContainerClass} transition-colors duration-300`}>
            <div className="text-sm font-medium" style={{color: isDark ? '#A1A1AA' : '#6B7280'}}>
                {title}
            </div>
            <div className="flex items-end mt-1">
                <div className={`text-3xl font-extrabold ${valueClass}`}>
                    {value}
                </div>
                <div className="text-sm ml-2" style={{color: isDark ? '#A1A1AA' : '#6B7280'}}>
                    {unit}
                </div>
            </div>
        </div>
    );
});


// --- Price Card Component (Unchanged for brevity) ---
const PriceCard = memo(({ instrument, price, lastPrice, theme }) => {
    const effectiveLastPrice = lastPrice || INITIAL_PRICES[instrument];
    const change = price - effectiveLastPrice;
    const percentChange = (change / effectiveLastPrice) * 100;

    let isSpike = Math.abs(percentChange) >= SPIKE_THRESHOLD * 100; 
    let trendClass, trendIcon;

    if (change > 0) {
        trendClass = 'text-green-500';
        trendIcon = '▲'; 
    } else if (change < 0) {
        trendClass = 'text-red-500';
        trendIcon = '▼';
    } else {
        trendClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';
        trendIcon = '•';
    }
    
    let spikeBgClass, spikeBorderClass, spikeTextClass;

    if (isSpike) {
        if (percentChange > 0) {
            spikeBgClass = 'bg-green-700/20';
            spikeBorderClass = 'border-green-500';
            spikeTextClass = 'text-green-400';
        } else {
            spikeBgClass = 'bg-red-700/20';
            spikeBorderClass = 'border-red-500';
            spikeTextClass = 'text-red-400';
        }
    } else {
        spikeBgClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
        spikeBorderClass = theme === 'dark' ? 'border-gray-700' : 'border-gray-200';
        spikeTextClass = theme === 'dark' ? 'text-white' : 'text-gray-900';
    }

    const instrumentTextClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-600';

    const cardClass = `
        p-5 rounded-xl shadow-lg transition-all duration-300 border-2 
        ${isSpike ? `${spikeBgClass} ${spikeBorderClass} animate-pulse-fast` : `${spikeBgClass} ${spikeBorderClass}`}
    `;

    return (
        <div className={cardClass}>
            <div className="text-sm font-semibold mb-2" style={{color: instrumentTextClass}}>
                {instrument}
            </div>
            <div className="flex items-center justify-between">
                <div className="text-3xl font-extrabold" style={{color: spikeTextClass}}>
                    {formatPrice(price)}
                </div>
                <div className="flex flex-col items-end text-sm font-medium">
                    <span className={`text-md font-bold ${trendClass}`}>
                        {trendIcon} {percentChange.toFixed(2)}%
                    </span>
                </div>
            </div>
            {isSpike && (
                <div className={`text-xs font-bold mt-3 p-2 rounded-lg text-center ${spikeTextClass} ${spikeBgClass}`}>
                    SPIKE ({Math.abs(percentChange).toFixed(2)}%)
                </div>
            )}
        </div>
    );
});


// --- Main App Component (Dashboard) ---

function Dashboard() { 
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark'); 
    const initialSpikes = JSON.parse(sessionStorage.getItem(LOG_STORAGE_KEY)) || [];
    
    const [prices, setPrices] = useState(INITIAL_PRICES);
    const [spikes, setSpikes] = useState(initialSpikes); 
    const [isConnected, setIsConnected] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [isSocketReady, setIsSocketReady] = useState(false);
    const [startTime, setStartTime] = useState(null); 
    const [systemTicks, setSystemTicks] = useState(0); 
    
    // State to hold final metrics after simulation stops
    const [finalMetrics, setFinalMetrics] = useState({
        tickRate: 'N/A',
        latency: 'N/A',
    });

    const [priceHistory, setPriceHistory] = useState({
        "NSE:ACC": [], "NSE:SBIN": [], "NSE:TCS": [], "NSE:INFY": []
    });
    const [latencyBuffer, setLatencyBuffer] = useState([]); 
    const [selectedInstrument, setSelectedInstrument] = useState("NSE:ACC");
    const [logFilter, setLogFilter] = useState("ALL"); 

    const prevPricesRef = useRef(INITIAL_PRICES);

    // Effect to manage theme class and save to localStorage
    useEffect(() => {
        document.documentElement.className = theme;
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Effect to save spikes to session storage whenever the state updates
    useEffect(() => {
        sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(spikes));
    }, [spikes]);

    // --- Socket.IO Setup (Connection logic) ---
    useEffect(() => {
        if (typeof io !== 'function') {
            return;
        }

        const socket = io(API_BASE_URL);

        socket.on('connect', () => {
            setIsConnected(true);
            setIsSocketReady(true);
        });
        socket.on('disconnect', () => {
            setIsConnected(false);
            setIsRunning(false);
        });
        socket.on('initialData', (data) => {
            setPrices(data.initialPrices);
            prevPricesRef.current = data.initialPrices;
        });
        socket.on('status', (data) => {
            const running = data.running;
            setIsRunning(running);
            
            if (running) {
                setStartTime(Date.now());
                setSystemTicks(0); 
                setLatencyBuffer([]); 
                setFinalMetrics({tickRate: 'N/A', latency: 'N/A'}); // Clear final metrics on new run
            } else if (!running && startTime) {
                // Calculation on STOP: Store final values
                const finalElapsedTime = Date.now() - startTime;
                
                // Final Tick Rate calculation
                const finalTickRate = finalElapsedTime >= MIN_CALCULATION_TIME_MS 
                    ? (systemTicks / (finalElapsedTime / 1000)).toFixed(1) 
                    : 'N/A'; 
                    
                const finalAvgLatency = calculateAverage(latencyBuffer).toFixed(2);
                
                setFinalMetrics({
                    tickRate: finalTickRate,
                    latency: finalAvgLatency,
                });
                setStartTime(null);
            }
        });

        socket.on('priceUpdate', (data) => {
            const timeReceived = Date.now();
            const tick = data.tick; 
            const instrument = Object.keys(tick).find(key => key !== 'time_sent');
            const price = tick[instrument];
            const timeSent = tick.time_sent; 

            setSystemTicks(prev => prev + 1); 

            // Calculate Latency
            if (timeSent) {
                const latency = timeReceived - timeSent;
                setLatencyBuffer(prev => {
                    const newBuffer = [...prev, latency];
                    return newBuffer.slice(-LATENCY_BUFFER_SIZE); 
                });
            }

            setPrices(prev => {
                prevPricesRef.current = { ...prevPricesRef.current, [instrument]: prev[instrument] };
                return { ...prev, [instrument]: price }; 
            });

            // Update Price History state 
            setPriceHistory(prevHistory => {
                const newHistory = [...(prevHistory[instrument] || [])];
                newHistory.push({ price: price, timestamp: timeReceived });

                return {
                    ...prevHistory,
                    [instrument]: newHistory.slice(-MAX_HISTORY_POINTS) 
                };
            });

            if (data.spikes && data.spikes.length > 0) {
                const newSpike = data.spikes[0];
                setSpikes(prev => [
                    {
                        id: Date.now() + Math.random(),
                        timestamp: new Date().toLocaleTimeString('en-US'),
                        ...newSpike
                    },
                    ...prev,
                ].slice(0, 100)); 
            }
        });
        return () => socket.disconnect();
    }, []);

    // --- Metric Calculations ---
    const currentTime = Date.now();
    const elapsedTime = isRunning && startTime ? currentTime - startTime : 0;
    
    // Live Calculations
    // CRITICAL FIX 3: Check against the MIN_CALCULATION_TIME_MS for live display
    const liveTicksPerSecond = isRunning && elapsedTime >= MIN_CALCULATION_TIME_MS 
        ? (systemTicks / (elapsedTime / 1000)).toFixed(1) 
        : 'N/A';
        
    const liveAvgLatency = calculateAverage(latencyBuffer).toFixed(2);

    // Values used for display: live if running, final if stopped
    // CRITICAL FIX 4: Use finalMetrics for display if NOT running, ensuring N/A is only shown during the very brief startup phase.
    const displayTickRate = isRunning ? liveTicksPerSecond : finalMetrics.tickRate;
    const displayAvgLatency = isRunning ? liveAvgLatency : finalMetrics.latency;
    
    // Volatility
    const instrumentHistory = priceHistory[selectedInstrument] || [];
    const volatility = calculateVolatility(instrumentHistory);
    
    // Latency Color
    const latencyVal = parseFloat(displayAvgLatency);
    const latencyColor = latencyVal < 4 ? 'text-green-500' : latencyVal < 8 ? 'text-orange-500' : 'text-red-500';
    const tickRateColor = displayTickRate > 900 ? 'text-green-500' : 'text-orange-500';

    const filteredSpikes = logFilter === "ALL" 
        ? spikes 
        : spikes.filter(spike => spike.instrument === logFilter);


    // --- Control Handlers (Unchanged) ---
    const toggleSimulation = useCallback(() => {
        if (!isSocketReady) {
            return;
        }
        const socket = io(API_BASE_URL);
        if (isRunning) {
            socket.emit('stopSimulation');
        } else {
            socket.emit('startSimulation');
        }
    }, [isRunning, isSocketReady]);

    const clearSpikeLog = useCallback(() => {
        setSpikes([]);
        sessionStorage.removeItem(LOG_STORAGE_KEY);
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    }, []);

    const handleCardClick = useCallback((instrument) => {
        setSelectedInstrument(instrument);
    }, []);


    // --- Rendering Logic (Unchanged) ---
    const instruments = Object.keys(prices);
    const isDark = theme === 'dark';

    const bgClass = isDark ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900';
    const headerClass = isDark ? 'text-gray-100' : 'text-gray-900';
    const subheaderClass = isDark ? 'text-gray-400' : 'text-gray-600';
    const cardContainerClass = isDark ? 'bg-gray-800' : 'bg-white';
    const buttonBaseClass = isDark ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-700 border-gray-300';


    return (
        <div className={`p-6 md:p-10 min-h-screen font-inter transition-colors duration-500 ${bgClass}`}>
            <header className="flex justify-between items-start mb-8 border-b pb-4 border-gray-700">
                <div>
                    <h1 className={`text-4xl font-extrabold ${headerClass}`}>
                        Quant Platform: Real-Time Detector
                    </h1>
                    <p className={`${subheaderClass} text-sm mt-1`}>
                        Monitoring high-frequency price ticks (1000 Hz) for critical spikes.
                    </p>
                </div>
                <button 
                    onClick={toggleTheme} 
                    className={`p-2 rounded-full border ${buttonBaseClass} shadow-md hover:scale-105 transition-transform`}
                    aria-label="Toggle theme"
                >
                    <ThemeIcon theme={theme} />
                </button>
            </header>

            {/* Status and Control */}
            <div className={`flex flex-col md:flex-row items-center justify-between p-4 rounded-xl shadow-xl mb-8 border ${cardContainerClass} border-gray-700`}>
                <div className="flex items-center mb-4 md:mb-0">
                    {isConnected ? (
                        <div className="flex items-center">
                            <div className={`w-3 h-3 rounded-full mr-2 ${isRunning ? 'bg-blue-500' : 'bg-orange-500'} animate-pulse`}></div>
                            <span className="text-sm font-medium" style={{color: subheaderClass}}>
                                Status: <span className={`font-bold ${isRunning ? 'text-blue-500' : 'text-orange-500'}`}>{isRunning ? 'RUNNING' : 'STOPPED'}</span>
                            </span>
                        </div>
                    ) : (
                        <Loader isDark={isDark} />
                    )}
                </div>

                <button
                    onClick={toggleSimulation}
                    disabled={!isConnected}
                    className={`
                        w-full md:w-auto px-6 py-2 rounded-lg font-bold text-white shadow-md transition-colors duration-200
                        ${!isConnected
                            ? 'bg-gray-500 cursor-not-allowed'
                            : isRunning
                                ? 'bg-orange-600 hover:bg-orange-700'
                                : 'bg-green-600 hover:bg-green-700'
                        }
                    `}
                >
                    {isRunning ? 'Stop Simulation' : 'Start Simulation (1000 Hz)'}
                </button>
            </div>
            
            {/* Metric Cards */}
            <h2 className="text-2xl font-bold mb-4" style={{color: headerClass}}>System Metrics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                <MetricCard 
                    title="Total Spikes" 
                    value={spikes.length} 
                    unit="events" 
                    isDark={isDark} 
                    colorClass={spikes.length > 0 ? 'text-red-500' : undefined}
                />
                <MetricCard 
                    title="Avg. Latency" 
                    value={displayAvgLatency} 
                    unit="ms" 
                    isDark={isDark} 
                    colorClass={latencyColor}
                />
                 <MetricCard 
                    title="Avg. Tick Rate" 
                    value={displayTickRate} 
                    unit="ticks/s" 
                    isDark={isDark} 
                    colorClass={tickRateColor}
                />
                <MetricCard 
                    title={`${selectedInstrument} Volatility`} 
                    value={volatility.toFixed(4)} 
                    unit="SD (Price)" 
                    isDark={isDark} 
                    colorClass={volatility > 5 ? 'text-orange-500' : 'text-green-500'}
                />
            </div>


            {/* Price Cards Grid */}
            <h2 className="text-2xl font-bold mb-4" style={{color: headerClass}}>Real-Time Prices</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                {instruments.map(instrument => (
                    <div 
                        key={instrument}
                        onClick={() => handleCardClick(instrument)}
                        className={`cursor-pointer ${instrument === selectedInstrument ? 'ring-2 ring-blue-500' : 'hover:scale-[1.01]'} transition-transform rounded-xl`}
                    >
                        <PriceCard
                            instrument={instrument}
                            price={prices[instrument]}
                            lastPrice={prevPricesRef.current[instrument]}
                            theme={theme}
                        />
                    </div>
                ))}
            </div>
            
            {/* Price History Line Chart */}
            <div className={`p-4 rounded-xl shadow-xl mb-8 border ${cardContainerClass} border-gray-700`}>
                <PriceHistoryChart history={priceHistory} selectedInstrument={selectedInstrument} isDark={isDark} />
            </div>

            {/* Spike Log */}
            <div className="flex justify-between items-center mb-4 border-b pb-2 border-gray-700">
                <h2 className="text-2xl font-bold" style={{color: headerClass}}>Spike Event Log ({spikes.length} Total)</h2>
                <div className="flex space-x-3">
                    <select
                        onChange={(e) => setLogFilter(e.target.value)}
                        className={`text-sm rounded-lg border px-3 py-1 ${buttonBaseClass}`}
                        style={{backgroundColor: isDark ? '#1F2937' : '#F9FAFB'}}
                    >
                        <option value="ALL">Filter: All Instruments</option>
                        {instruments.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                    <button
                        onClick={clearSpikeLog}
                        className={`px-4 py-1 text-sm rounded-lg border shadow-sm hover:scale-[1.02] transition-transform ${buttonBaseClass}`}
                    >
                        Clear Log ({filteredSpikes.length} Visible)
                    </button>
                </div>
            </div>
            <div className={`p-4 rounded-xl shadow-lg max-h-96 overflow-y-auto ${cardContainerClass}`}>
                {spikes.length === 0 ? (
                    <p className="italic" style={{color: subheaderClass}}>No spikes detected yet. Click "Start Simulation" to begin monitoring.</p>
                ) : (
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className={cardContainerClass} style={{color: subheaderClass}}>
                            <tr>
                                {["Time", "Instrument", "Old Price", "New Price", "Change (%)"].map(header => (
                                    <th key={header} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-gray-800' : 'divide-gray-200'} text-sm`}>
                            {filteredSpikes.map((event) => {
                                const isPositive = event.percentChange > 0;
                                const textClass = isPositive ? 'text-green-500' : 'text-red-500';
                                const bgHoverClass = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';

                                return (
                                    <tr key={event.id} className={`${bgHoverClass} transition duration-150`}>
                                        <td className={`px-3 py-2 whitespace-nowrap font-mono ${subheaderClass}`}>{event.timestamp}</td>
                                        <td className={`px-3 py-2 whitespace-nowrap font-semibold ${textClass}`}>{event.instrument}</td>
                                        <td className={`px-3 py-2 whitespace-nowrap ${subheaderClass}`}>{formatPrice(event.oldPrice)}</td>
                                        <td className={`px-3 py-2 whitespace-nowrap font-bold ${textClass}`}>{formatPrice(event.newPrice)}</td>
                                        <td className={`px-3 py-2 whitespace-nowrap text-xs ${textClass}`}>{event.percentChange.toFixed(2)}%</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}