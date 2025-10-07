// This module simulates the high-frequency price feed (The Producer)
// Located in: modules/tickGenerator.js

const INSTRUMENTS = ["NSE:ACC", "NSE:SBIN", "NSE:TCS", "NSE:INFY"];

// Initial prices must be stored here to allow for price generation
const currentPrices = {
    "NSE:ACC": 1800.00,
    "NSE:SBIN": 750.00,
    "NSE:TCS": 3300.00,
    "NSE:INFY": 1500.00
};

// --- Core Price Generation Logic ---

function generateNewTick() {
    // 1. Select a random instrument for the new tick
    const instrument = INSTRUMENTS[Math.floor(Math.random() * INSTRUMENTS.length)];
    const oldPrice = currentPrices[instrument];

    // --- Market Volatility Settings ---
    // Base fluctuation: Generates a small random change factor between -0.5% and +0.5%
    const baseVolatility = 0.01; // 1% range
    let randomFactor = (Math.random() * baseVolatility) - (baseVolatility / 2); // e.g., -0.005 to +0.005

    // --- Chaotic Spike Generator ---
    // We force a guaranteed HUGE spike (10% or more) 
    // approximately once every 5 seconds (1 in 5000 ticks).
    if (Math.random() < 0.0002) { 
        // This forces a guaranteed spike of 10% to 15% 
        let hugeSpikeFactor = (Math.random() * 0.05 + 0.10); // 10% to 15%
        // Randomly assign a positive or negative spike
        randomFactor = (Math.random() > 0.5 ? hugeSpikeFactor : -hugeSpikeFactor);
    }
    
    // Apply the factor to the old price
    let newPrice = oldPrice * (1 + randomFactor);

    // Keep prices realistic (positive and two decimal places)
    newPrice = Math.max(0.01, newPrice).toFixed(2);
    
    // 3. Update the stored price state
    currentPrices[instrument] = parseFloat(newPrice);

    // 4. Return the new tick object
    return { [instrument]: parseFloat(newPrice) };
}

/**
 * EXPORTED FUNCTION: Allows the server to retrieve the current state 
 * of all instrument prices when a new client connects. 
 */
function getCurrentPrices() {
    return currentPrices;
}

// --- Module Export ---

module.exports = {
    generateNewTick,
    getCurrentPrices, // <-- CRITICAL FIX: Exposed the function required by server.js
};