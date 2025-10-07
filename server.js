const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// --- Import Modules ---
const tickGenerator = require('./modules/tickGenerator');
const spikeDetector = require('./modules/spikeDetector');
const { initLogger } = require('./utils/logger'); 

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: { origin: "*", }
});

const PORT = 3000;
let isRunning = false;
let timeoutId = null; 
const tickQueue = [];

// --- CONSUMER: Spike Detector & Broadcaster ---

function processTickQueue() {
    // CRITICAL FIX: If the simulation is flagged as stopped, exit the consumer loop instantly.
    if (!isRunning) {
        return; 
    }

    if (tickQueue.length === 0) {
        return setImmediate(processTickQueue);
    }

    // PERFORMANCE OPTIMIZATION: Process a batch of 10 ticks at once
    const batchSize = Math.min(10, tickQueue.length);
    for (let i = 0; i < batchSize; i++) {
        const fullTick = tickQueue.shift(); 
        
        // Find the price portion (excluding time_sent) for the detector
        const instrumentKey = Object.keys(fullTick).find(key => key !== 'time_sent');
        const priceData = { [instrumentKey]: fullTick[instrumentKey] };

        // Pass only the price data to the detector 
        const event = spikeDetector.detectAndLog(priceData); 
        
        // Broadcast the full tick (including time_sent for latency calculation)
        io.emit('priceUpdate', {
            tick: fullTick, 
            spikes: event ? [event] : []
        });
    }

    // Schedule the next batch processing immediately (non-blocking)
    setImmediate(processTickQueue);
}

// --- PRODUCER: Tick Generator ---

function startGenerator() {
    if (isRunning) return;
    isRunning = true;
    console.log('[GENERATOR] Starting tick generation at 1000 Hz...');

    const generateLoop = () => {
        if (!isRunning) return; 

        const newPriceTick = tickGenerator.generateNewTick();
        
        // Embed a timestamp for end-to-end latency tracking (UNIQUE FEATURE)
        const fullTick = {
            ...newPriceTick,
            time_sent: Date.now() 
        };
        
        tickQueue.push(fullTick);

        // Schedule the next tick after 1ms (1000 Hz)
        timeoutId = setTimeout(generateLoop, 1); 
    };

    generateLoop();
    processTickQueue(); // Start the consumer loop
}

function stopGenerator() {
    if (!isRunning) return; 
    isRunning = false; 
    
    // Clear the scheduled timeout for the GENERATOR
    if (timeoutId) {
        clearTimeout(timeoutId); 
        timeoutId = null; 
    }
    
    console.log('[GENERATOR] Stopping tick generation.');
}

// --- Socket.IO Connection Handlers ---

io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.emit('initialData', {
        initialPrices: tickGenerator.getCurrentPrices()
    });

    socket.on('startSimulation', () => {
        startGenerator();
        io.emit('status', { running: true });
    });

    socket.on('stopSimulation', () => {
        stopGenerator();
        io.emit('status', { running: false });
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});


// --- Server Startup ---

httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Open index.html via Live Server to connect.');
});

initLogger();