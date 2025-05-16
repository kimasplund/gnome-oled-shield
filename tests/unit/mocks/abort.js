'use strict';

/**
 * Mock implementation of AbortSignal for testing
 */
class AbortSignal {
    #aborted = false;
    #listeners = [];
    
    /**
     * Get whether the signal is aborted
     * @returns {boolean}
     */
    get aborted() {
        return this.#aborted;
    }
    
    /**
     * Add event listener
     * @param {string} type - Event type
     * @param {Function} listener - Event listener
     * @param {Object} [options] - Event options
     */
    addEventListener(type, listener, options = {}) {
        if (type === 'abort') {
            const listenerEntry = {
                listener,
                once: options.once || false
            };
            
            this.#listeners.push(listenerEntry);
            
            // If already aborted, call the listener immediately
            if (this.#aborted && type === 'abort') {
                this.#callListener(listenerEntry);
            }
        }
    }
    
    /**
     * Remove event listener
     * @param {string} type - Event type
     * @param {Function} listener - Event listener to remove
     */
    removeEventListener(type, listener) {
        if (type === 'abort') {
            const index = this.#listeners.findIndex(entry => entry.listener === listener);
            if (index !== -1) {
                this.#listeners.splice(index, 1);
            }
        }
    }
    
    /**
     * Call a listener
     * @param {Object} entry - Listener entry
     * @private
     */
    #callListener(entry) {
        try {
            entry.listener();
            
            // Remove if once
            if (entry.once) {
                this.removeEventListener('abort', entry.listener);
            }
        } catch (e) {
            console.error('Error in abort listener:', e);
        }
    }
    
    /**
     * Trigger an abort event
     * @private
     */
    _abort() {
        if (this.#aborted) return;
        
        this.#aborted = true;
        
        // Call all listeners
        for (const entry of [...this.#listeners]) {
            this.#callListener(entry);
        }
    }
}

/**
 * Mock implementation of AbortController for testing
 */
class AbortController {
    #signal = new AbortSignal();
    
    /**
     * Get the signal
     * @returns {AbortSignal}
     */
    get signal() {
        return this.#signal;
    }
    
    /**
     * Abort the operation
     * @param {string} [reason] - Abort reason
     */
    abort(reason) {
        this.#signal._abort();
    }
}

// Export the mocks
export { AbortController, AbortSignal }; 