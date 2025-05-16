'use strict';

/**
 * Mock implementation of performance measurement for testing
 */
export const performance = {
    /**
     * Get current time in milliseconds
     * @returns {number} Current time in ms
     */
    now() {
        return Date.now();
    },
    
    /**
     * Mark a performance timeline point
     * @param {string} name - Name of the mark
     */
    mark(name) {
        console.log(`[MOCK] Performance mark: ${name}`);
    },
    
    /**
     * Measure time between marks
     * @param {string} name - Measurement name
     * @param {string} startMark - Start mark name
     * @param {string} endMark - End mark name
     */
    measure(name, startMark, endMark) {
        console.log(`[MOCK] Performance measure: ${name} (${startMark} to ${endMark})`);
    }
};

/**
 * Mock for memory info
 */
export const memory = {
    /**
     * Get system memory information
     */
    getSystemMemoryInfo() {
        return {
            total: 16 * 1024 * 1024, // 16GB in kb
            free: 8 * 1024 * 1024,   // 8GB in kb
            used: 8 * 1024 * 1024    // 8GB in kb
        };
    }
};

export default {
    performance,
    memory
}; 