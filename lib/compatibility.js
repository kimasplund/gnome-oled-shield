'use strict';

import GLib from 'gi://GLib';

/**
 * Provides compatibility utilities and polyfills for modern JavaScript features
 * that might not be fully supported in all GNOME Shell environments.
 */

// Feature detection
const hasNativeWeakRef = typeof WeakRef === 'function';
const hasNativeFinalizationRegistry = typeof FinalizationRegistry === 'function';
const hasNativePromiseAllSettled = typeof Promise.allSettled === 'function';
const hasNativeAbortController = typeof AbortController === 'function';
const hasNativeLogicalAssignment = (() => {
    try {
        // Test logical assignment operator
        let test;
        // eslint-disable-next-line no-undef
        eval('test ??= true');
        return true;
    } catch (e) {
        return false;
    }
})();

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

/**
 * Promise.allSettled polyfill
 * @param {Promise[]} promises - Array of promises
 * @returns {Promise} Promise that resolves to an array of results
 */
function promiseAllSettledPolyfill(promises) {
    return Promise.all(
        promises.map(promise => 
            promise
                .then(value => ({ status: 'fulfilled', value }))
                .catch(reason => ({ status: 'rejected', reason }))
        )
    );
}

/**
 * AbortController polyfill
 */
class AbortControllerPolyfill {
    #signal;
    
    constructor() {
        this.#signal = new AbortSignalPolyfill();
    }
    
    get signal() {
        return this.#signal;
    }
    
    abort(reason) {
        this.#signal._abort(reason);
    }
}

/**
 * AbortSignal polyfill
 */
class AbortSignalPolyfill {
    #aborted = false;
    #reason = undefined;
    #listeners = new Map();
    
    get aborted() {
        return this.#aborted;
    }
    
    get reason() {
        return this.#reason;
    }
    
    addEventListener(type, callback, options = {}) {
        if (!this.#listeners.has(type)) {
            this.#listeners.set(type, []);
        }
        
        const handlers = this.#listeners.get(type);
        handlers.push({
            callback,
            once: options.once || false
        });
        
        if (type === 'abort' && this.#aborted) {
            const event = { type: 'abort' };
            setTimeout(() => {
                callback.call(this, event);
                
                // Remove if once
                if (options.once) {
                    this.removeEventListener(type, callback);
                }
            }, 0);
        }
    }
    
    removeEventListener(type, callback) {
        if (!this.#listeners.has(type)) return;
        
        const handlers = this.#listeners.get(type);
        const index = handlers.findIndex(handler => handler.callback === callback);
        
        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }
    
    _abort(reason) {
        if (this.#aborted) return;
        
        this.#aborted = true;
        this.#reason = reason;
        
        const event = { type: 'abort' };
        
        if (this.#listeners.has('abort')) {
            const handlers = [...this.#listeners.get('abort')];
            const oncers = [];
            
            for (let i = 0; i < handlers.length; i++) {
                const handler = handlers[i];
                
                try {
                    handler.callback.call(this, event);
                    
                    if (handler.once) {
                        oncers.push(i);
                    }
                } catch (error) {
                    console.error('Error in abort event handler:', error);
                }
            }
            
            // Remove once handlers in reverse order
            if (oncers.length > 0) {
                const allHandlers = this.#listeners.get('abort');
                
                for (let i = oncers.length - 1; i >= 0; i--) {
                    allHandlers.splice(oncers[i], 1);
                }
            }
        }
    }
}

/**
 * Nullish coalescing assignment helper
 * Use instead of obj[key] ??= value when native logical assignment is unavailable.
 * @param {object} obj - Target object
 * @param {string} key - Property key
 * @param {any} value - Value to assign if current value is null or undefined
 * @returns {any} The resulting value of obj[key]
 */
function nullishAssign(obj, key, value) {
    if (obj[key] === null || obj[key] === undefined) {
        obj[key] = value;
    }
    return obj[key];
}

/**
 * Logical OR assignment helper
 * Use instead of obj[key] ||= value when native logical assignment is unavailable.
 * @param {object} obj - Target object
 * @param {string} key - Property key
 * @param {any} value - Value to assign if current value is falsy
 * @returns {any} The resulting value of obj[key]
 */
function orAssign(obj, key, value) {
    if (!obj[key]) {
        obj[key] = value;
    }
    return obj[key];
}

/**
 * Logical AND assignment helper
 * Use instead of obj[key] &&= value when native logical assignment is unavailable.
 * @param {object} obj - Target object
 * @param {string} key - Property key
 * @param {any} value - Value to assign if current value is truthy
 * @returns {any} The resulting value of obj[key]
 */
function andAssign(obj, key, value) {
    if (obj[key]) {
        obj[key] = value;
    }
    return obj[key];
}

// Export the appropriate implementations based on availability
export const WeakRefImpl = hasNativeWeakRef ? WeakRef : WeakRefPolyfill;
export const FinalizationRegistryImpl = hasNativeFinalizationRegistry ? FinalizationRegistry : FinalizationRegistryPolyfill;
export const allSettled = hasNativePromiseAllSettled ? Promise.allSettled.bind(Promise) : promiseAllSettledPolyfill;
export const AbortControllerImpl = hasNativeAbortController ? AbortController : AbortControllerPolyfill;

// Export logical assignment helpers as standalone functions
export { nullishAssign, orAssign, andAssign };

// Export feature detection flags
export const features = {
    hasNativeWeakRef,
    hasNativeFinalizationRegistry,
    hasNativePromiseAllSettled,
    hasNativeAbortController,
    hasNativeLogicalAssignment
};

// Register polyfills globally so all modules can use AbortController/AbortSignal directly
if (!hasNativeAbortController) {
    globalThis.AbortController = AbortControllerPolyfill;
    globalThis.AbortSignal = AbortSignalPolyfill;
}

// Log compatibility status
console.log(`[compatibility] Feature detection:
  WeakRef: ${hasNativeWeakRef ? 'native' : 'polyfill'}
  FinalizationRegistry: ${hasNativeFinalizationRegistry ? 'native' : 'polyfill'}
  Promise.allSettled: ${hasNativePromiseAllSettled ? 'native' : 'polyfill'}
  AbortController: ${hasNativeAbortController ? 'native' : 'polyfill'}
  Logical Assignment: ${hasNativeLogicalAssignment ? 'native' : 'polyfill'}
`);