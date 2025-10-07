// This utility handles asynchronous CSV logging for detected spikes.
// Located in: utils/logger.js

const fs = require('fs');
const path = require('path');
const os = require('os'); // <--- CRITICAL FIX: Load the OS module
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// CRITICAL FIX: Save the CSV file outside of the project root in the OS temporary directory.
const CSV_FILE_PATH = path.join(os.tmpdir(), 'spike_log.csv'); 

const csvWriter = createCsvWriter({
    path: CSV_FILE_PATH,
    header: [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'instrument', title: 'Instrument' },
        { id: 'oldPrice', title: 'Old Price' },
        { id: 'newPrice', title: 'New Price' },
        { id: 'percentChange', title: 'Change (%)' }
    ],
    append: true, 
});

/**
 * Initializes the logger by writing the header row if the file doesn't exist.
 */
function initLogger() {
    // Check if the file exists; if not, create it with headers (append=false)
    if (!fs.existsSync(CSV_FILE_PATH)) {
        const headerWriter = createCsvWriter({
            path: CSV_FILE_PATH,
            header: csvWriter.header,
            append: false,
        });
        headerWriter.writeRecords([]).then(() => {
            console.log(`[LOGGER] Initialized new log file: ${CSV_FILE_PATH}`);
        });
    } else {
        console.log(`[LOGGER] Appending to existing log file: ${CSV_FILE_PATH}`);
    }
}

/**
 * Asynchronously adds a single spike event record to the CSV file.
 * @param {object} event - The spike data object.
 */
function appendSpike(event) {
    const record = {
        timestamp: new Date(event.timestamp).toISOString(),
        instrument: event.instrument,
        oldPrice: event.oldPrice.toFixed(2),
        newPrice: event.newPrice.toFixed(2),
        percentChange: event.percentChange.toFixed(2),
    };

    // Write the single record without blocking the main event loop
    csvWriter.writeRecords([record])
        .catch(err => console.error('[LOGGER ERROR] Failed to write spike to CSV:', err));
}

// --- Module Export ---

module.exports = {
    initLogger,
    appendSpike, 
};