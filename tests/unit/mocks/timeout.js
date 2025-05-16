'use strict';

import GLib from 'gi://GLib';

/**
 * Mock implementation of setTimeout using GLib.timeout_add
 * @param {Function} callback - Function to call after timeout
 * @param {number} delay - Delay in milliseconds
 * @returns {number} Timeout ID
 */
export function setTimeout(callback, delay) {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
        callback();
        return GLib.SOURCE_REMOVE; // Remove the source after first execution
    });
}

/**
 * Mock implementation of clearTimeout using GLib.source_remove
 * @param {number} id - Timeout ID to clear
 */
export function clearTimeout(id) {
    if (id) {
        GLib.source_remove(id);
    }
}

export default {
    setTimeout,
    clearTimeout
}; 