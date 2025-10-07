// This module handles spike detection and hands off logging to the logger utility.

// CRITICAL FIX: The path to logger is corrected to go up one level (..) then into utils
const { appendSpike } = require('../utils/logger'); 

// Store last known price for comparison (in-memory state)
const lastKnownPrices = {
    "NSE:ACC": 1800.00,
    "NSE:SBIN": 750.00,
    "NSE:TCS": 3300.00,
    "NSE:INFY": 1500.00
};

const SPIKE_THRESHOLD = 0.10; // 10% change

/**
 * Processes a single price tick, checks for a spike, and logs the event if detected.
 * * @param {object} tick - The incoming price tick (e.g., {"NSE:ACC": 1850.50})
 * @returns {object|null} - The spike event data if detected, otherwise null.
 */
function detectAndLog(tick) {
    const instrument = Object.keys(tick)[0];
    const newPrice = tick[instrument];
    const oldPrice = lastKnownPrices[instrument];

    if (!oldPrice) {
        // Initialize if price is missing (shouldn't happen with our setup, but good safeguard)
        lastKnownPrices[instrument] = newPrice;
        return null;
    }

    const priceChange = newPrice - oldPrice;
    const percentChange = (priceChange / oldPrice);

    // Update the last known price *before* checking the spike. 
    // This is crucial for high-frequency trading simulation.
    lastKnownPrices[instrument] = newPrice;

    if (Math.abs(percentChange) >= SPIKE_THRESHOLD) {
        
        const spikeEvent = {
            instrument: instrument,
            oldPrice: oldPrice,
            newPrice: newPrice,
            percentChange: percentChange * 100, // Send as percentage
            timestamp: Date.now()
        };

        // Log the spike event asynchronously
        appendSpike(spikeEvent);

        console.log(`[SPIKE DETECTED] ${instrument}: ${oldPrice.toFixed(2)} -> ${newPrice.toFixed(2)} (${(percentChange * 100).toFixed(2)}%)`);
        
        return spikeEvent;
    }

    return null;
}


// --- Module Export ---

module.exports = {
    detectAndLog, // <--- CRITICAL FIX: Exported the function required by server.js
};