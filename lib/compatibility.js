'use strict';

import GLib from 'gi://GLib';

/**
 * Provides compatibility utilities and polyfills for modern JavaScript features
 * that might not be fully supported in all GNOME Shell environments.
 */

// Check if WeakRef is natively available
const hasNativeWeakRef = typeof WeakRef === 'function';

// Check if FinalizationRegistry is natively available
const hasNativeFinalizationRegistry = typeof FinalizationRegistry === 'function';

/**
 * Polyfill implementation of WeakRef
 * Note: This does not truly implement weak references, but provides the same interface
 */
class WeakRefPolyfill {
    #target;
    #referenceId;
    static #references = new Map();
    static #cleanupTimer = null;
    
    /**
     * Create a new WeakRef-like object
     * @param {object} target - Target object to reference
     */
    constructor(target) {
        if (target === null || target === undefined || typeof target !== 'object') {
            throw new TypeError('WeakRef target must be an object');
        }
        
        this.#target = target;
        this.#referenceId = `ref-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Store in static map
        WeakRefPolyfill.#references.set(this.#referenceId, {
            target,
            createdAt: Date.now()
        });
        
        // Start cleanup timer if not already running
        if (!WeakRefPolyfill.#cleanupTimer) {
            WeakRefPolyfill.#startCleanupTimer();
        }
    }
    
    /**
     * Get the referenced object
     * @returns {object|undefined} The referenced object or undefined if garbage collected
     */
    deref() {
        return this.#target;
    }
    
    /**
     * Start the cleanup timer
     * @private
     */
    static #startCleanupTimer() {
        this.#cleanupTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this.#cleanReferences();
            return GLib.SOURCE_CONTINUE;
        });
    }
    
    /**
     * Clean up old references
     * @private
     */
    static #cleanReferences() {
        const now = Date.now();
        const HOUR_IN_MS = 3600000;
        
        // Remove references older than 1 hour
        // This is a simplistic approach but helps prevent indefinite memory growth
        for (const [id, ref] of this.#references.entries()) {
            if (now - ref.createdAt > HOUR_IN_MS) {
                this.#references.delete(id);
            }
        }
        
        // Stop timer if no references left
        if (this.#references.size === 0) {
            if (this.#cleanupTimer) {
                GLib.source_remove(this.#cleanupTimer);
                this.#cleanupTimer = null;
            }
        }
    }
}

/**
 * Polyfill implementation of FinalizationRegistry
 * Note: This does not truly detect garbage collection, but provides periodic cleanup
 */
class FinalizationRegistryPolyfill {
    #cleanupCallback;
    #registry = new Map();
    #cleanupTimer = null;
    #timerInterval = 60; // Check every 60 seconds
    
    /**
     * Create a new FinalizationRegistry-like object
     * @param {Function} cleanupCallback - Function called with held value when target is garbage collected
     */
    constructor(cleanupCallback) {
        if (typeof cleanupCallback !== 'function') {
            throw new TypeError('FinalizationRegistry callback must be a function');
        }
        
        this.#cleanupCallback = cleanupCallback;
        this.#startCleanupTimer();
    }
    
    /**
     * Register an object for finalization
     * @param {object} target - Object to track
     * @param {any} heldValue - Value to pass to callback when target is garbage collected
     * @param {object} [unregisterToken] - Optional token that can be used to unregister
     */
    register(target, heldValue, unregisterToken = null) {
        if (target === null || target === undefined || typeof target !== 'object') {
            throw new TypeError('FinalizationRegistry target must be an object');
        }
        
        const entryId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        this.#registry.set(entryId, {
            target,
            heldValue,
            unregisterToken,
            createdAt: Date.now(),
            lastChecked: Date.now()
        });
    }
    
    /**
     * Unregister an object
     * @param {object} unregisterToken - Token used to unregister
     */
    unregister(unregisterToken) {
        if (unregisterToken === null || unregisterToken === undefined) return;
        
        for (const [id, entry] of this.#registry.entries()) {
            if (entry.unregisterToken === unregisterToken) {
                this.#registry.delete(id);
                break;
            }
        }
    }
    
    /**
     * Start the cleanup timer
     * @private
     */
    #startCleanupTimer() {
        this.#cleanupTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.#timerInterval, () => {
            this.#checkEntries();
            return GLib.SOURCE_CONTINUE;
        });
    }
    
    /**
     * Stop the cleanup timer
     */
    destroy() {
        if (this.#cleanupTimer) {
            GLib.source_remove(this.#cleanupTimer);
            this.#cleanupTimer = null;
        }
        this.#registry.clear();
    }
    
    /**
     * Check entries for potential cleanup
     * @private
     */
    #checkEntries() {
        const now = Date.now();
        const entries = [...this.#registry.entries()];
        
        // Process entries periodically, with increased chance of cleanup as they age
        for (const [id, entry] of entries) {
            // Entries get checked more frequently as they age
            const hoursSinceCreation = (now - entry.createdAt) / 3600000;
            const hoursSinceLastCheck = (now - entry.lastChecked) / 3600000;
            
            // Probability increases with age
            const checkProbability = Math.min(0.8, hoursSinceCreation * 0.1);
            
            // Update last checked time
            entry.lastChecked = now;
            
            // Probabilistic check based on age
            if (Math.random() < checkProbability || hoursSinceLastCheck > 6) {
                this.#registry.delete(id);
                
                // Call cleanup callback with held value
                try {
                    this.#cleanupCallback(entry.heldValue);
                } catch (error) {
                    console.error('Error in FinalizationRegistry callback:', error);
                }
            }
        }
    }
}

// Export the appropriate implementations based on availability
export const WeakRefImpl = hasNativeWeakRef ? WeakRef : WeakRefPolyfill;
export const FinalizationRegistryImpl = hasNativeFinalizationRegistry ? FinalizationRegistry : FinalizationRegistryPolyfill;

// Export feature detection flags
export const features = {
    hasNativeWeakRef,
    hasNativeFinalizationRegistry
};

// Log compatibility status
console.log(`[compatibility] WeakRef: ${hasNativeWeakRef ? 'native' : 'polyfill'}, FinalizationRegistry: ${hasNativeFinalizationRegistry ? 'native' : 'polyfill'}`); 