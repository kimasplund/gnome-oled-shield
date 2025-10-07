'use strict';

import GLib from 'gi://GLib';

/**
 * Enhanced mock implementation of AbortController and AbortSignal for testing
 * Supports session-specific behaviors to simulate different environments.
 */

// Global configuration for session-specific behaviors
let _sessionType = 'wayland'; // Default to Wayland mode
let _debugMode = false;

// Session-specific timing configurations
const WAYLAND_CONFIG = {
    eventDelay: 10,        // ms delay for events in Wayland (faster processing)
    cleanupInterval: 100,  // ms between cleanup checks
    abortTimeout: 50,      // ms timeout for abort operations
    retryCount: 3,         // number of retries for failed operations
};

const X11_CONFIG = {
    eventDelay: 50,        // ms delay for events in X11 (slower but more stable)
    cleanupInterval: 500,  // ms between cleanup checks
    abortTimeout: 200,     // ms timeout for abort operations
    retryCount: 1,         // number of retries for failed operations
};

// Get session-specific configuration
const getConfig = () => _sessionType === 'wayland' ? WAYLAND_CONFIG : X11_CONFIG;

/**
 * Set the mock session type
 * @param {string} sessionType - 'wayland' or 'x11'
 */
function setSessionType(sessionType) {
    if (sessionType !== 'wayland' && sessionType !== 'x11') {
        throw new Error(`Invalid session type: ${sessionType}. Must be 'wayland' or 'x11'`);
    }
    
    if (_debugMode) {
        console.log(`[Abort Mock] Setting session type to: ${sessionType}`);
    }
    
    _sessionType = sessionType;
}

/**
 * Enable/disable debug mode
 * @param {boolean} enabled - Whether debug mode is enabled
 */
function setDebugMode(enabled) {
    _debugMode = Boolean(enabled);
}

/**
 * Enhanced MockAbortSignal class
 */
class MockAbortSignal {
    #aborted = false;
    #reason = undefined;
    #listeners = new Map();
    #controller = null;
    #id = `signal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    #createdAt = Date.now();
    
    /**
     * Create a new mock abort signal
     * @param {MockAbortController} controller - The associated controller
     */
    constructor(controller) {
        this.#controller = controller;
        
        if (_debugMode) {
            console.log(`[Abort Mock] Created signal: ${this.#id}`);
        }
    }
    
    /**
     * Get whether the signal is aborted
     */
    get aborted() {
        return this.#aborted;
    }
    
    /**
     * Get the reason for abortion
     */
    get reason() {
        return this.#reason;
    }
    
    /**
     * Get the signal ID (for debugging)
     */
    get id() {
        return this.#id;
    }
    
    /**
     * Add event listener with session-specific behavior
     * @param {string} type - Event type
     * @param {Function} callback - Event callback
     * @param {object} options - Event options
     */
    addEventListener(type, callback, options = {}) {
        if (!this.#listeners.has(type)) {
            this.#listeners.set(type, []);
        }
        
        const handler = {
            callback,
            once: options.once || false,
            createdAt: Date.now()
        };
        
        this.#listeners.get(type).push(handler);
        
        // If already aborted and this is an abort event, dispatch it based on session type
        if (type === 'abort' && this.#aborted) {
            const config = getConfig();
            
            // In Wayland, we simulate faster but potentially flaky event handling
            if (_sessionType === 'wayland') {
                // Add some delay to simulate async behavior
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, config.eventDelay, () => {
                    try {
                        this.#dispatchEvent(new MockEvent('abort'));
                    } catch (error) {
                        if (_debugMode) {
                            console.error(`[Abort Mock] Error in delayed abort event: ${error}`);
                        }
                    }
                    return GLib.SOURCE_REMOVE;
                });
            } else {
                // X11 behavior is more synchronous and reliable
                try {
                    this.#dispatchEvent(new MockEvent('abort'));
                } catch (error) {
                    if (_debugMode) {
                        console.error(`[Abort Mock] Error in abort event: ${error}`);
                    }
                }
            }
        }
        
        if (_debugMode) {
            console.log(`[Abort Mock] Added ${type} listener to signal: ${this.#id}`);
        }
    }
    
    /**
     * Remove event listener with session-specific error simulation
     * @param {string} type - Event type
     * @param {Function} callback - Event callback
     */
    removeEventListener(type, callback) {
        if (!this.#listeners.has(type)) return;
        
        const handlers = this.#listeners.get(type);
        const config = getConfig();
        
        // Simulate flaky event listener removal in Wayland sessions
        if (_sessionType === 'wayland' && Math.random() < 0.05) {
            if (_debugMode) {
                console.warn(`[Abort Mock] Simulating flaky event listener removal in Wayland mode`);
            }
            
            // Retry the removal after a delay (simulating race conditions)
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, config.eventDelay, () => {
                try {
                    const index = handlers.findIndex(handler => handler.callback === callback);
                    if (index !== -1) {
                        handlers.splice(index, 1);
                        if (_debugMode) {
                            console.log(`[Abort Mock] Removed ${type} listener on retry: ${this.#id}`);
                        }
                    }
                } catch (error) {
                    if (_debugMode) {
                        console.error(`[Abort Mock] Error in delayed listener removal: ${error}`);
                    }
                }
                return GLib.SOURCE_REMOVE;
            });
            
            return;
        }
        
        // Normal path
        const index = handlers.findIndex(handler => handler.callback === callback);
        if (index !== -1) {
            handlers.splice(index, 1);
            
            if (_debugMode) {
                console.log(`[Abort Mock] Removed ${type} listener from signal: ${this.#id}`);
            }
        }
    }
    
    /**
     * Abort the signal
     * @param {any} reason - Reason for abortion
     * @private
     */
    _abort(reason) {
        if (this.#aborted) return;
        
        this.#aborted = true;
        this.#reason = reason;
        
        // Dispatch with session-specific behavior
        const config = getConfig();
        
        if (_sessionType === 'wayland') {
            // Simulate immediate dispatch but with potential for errors
            if (Math.random() < 0.05) {
                if (_debugMode) {
                    console.warn(`[Abort Mock] Simulating delayed abort in Wayland mode`);
                }
                
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, config.abortTimeout, () => {
                    this.#dispatchEvent(new MockEvent('abort'));
                    return GLib.SOURCE_REMOVE;
                });
            } else {
                this.#dispatchEvent(new MockEvent('abort'));
            }
        } else {
            // X11 behavior is more deterministic
            this.#dispatchEvent(new MockEvent('abort'));
        }
        
        if (_debugMode) {
            console.log(`[Abort Mock] Aborted signal: ${this.#id}`);
        }
    }
    
    /**
     * Dispatch an event to listeners
     * @param {MockEvent} event - Event to dispatch
     * @private
     */
    #dispatchEvent(event) {
        if (!this.#listeners.has(event.type)) return;
        
        const handlers = [...this.#listeners.get(event.type)];
        const oncers = [];
        
        for (let i = 0; i < handlers.length; i++) {
            const handler = handlers[i];
            
            try {
                handler.callback.call(this, event);
                
                if (handler.once) {
                    oncers.push(i);
                }
            } catch (error) {
                if (_debugMode) {
                    console.error(`[Abort Mock] Error in event handler: ${error}`);
                }
                
                // In Wayland mode, retry failed callbacks
                if (_sessionType === 'wayland') {
                    const config = getConfig();
                    const retryCount = handler.retryCount || 0;
                    
                    if (retryCount < config.retryCount) {
                        if (_debugMode) {
                            console.log(`[Abort Mock] Retrying failed callback (${retryCount + 1}/${config.retryCount})`);
                        }
                        
                        // Update retry count
                        handler.retryCount = retryCount + 1;
                        
                        // Retry after delay
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, config.eventDelay, () => {
                            try {
                                handler.callback.call(this, event);
                            } catch (error) {
                                if (_debugMode) {
                                    console.error(`[Abort Mock] Retry failed: ${error}`);
                                }
                            }
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                }
            }
        }
        
        // Remove once handlers in reverse order to avoid index shifting
        if (oncers.length > 0) {
            const handlersArray = this.#listeners.get(event.type);
            
            for (let i = oncers.length - 1; i >= 0; i--) {
                handlersArray.splice(oncers[i], 1);
            }
        }
    }
    
    /**
     * Check if this signal has any active listeners
     * @returns {boolean} True if there are active listeners
     */
    hasListeners() {
        for (const [, handlers] of this.#listeners.entries()) {
            if (handlers.length > 0) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Get the number of active listeners
     * @returns {number} Number of active listeners
     */
    getListenerCount() {
        let count = 0;
        for (const [, handlers] of this.#listeners.entries()) {
            count += handlers.length;
        }
        return count;
    }
    
    /**
     * Get the creation time
     * @returns {number} Creation timestamp
     */
    getCreationTime() {
        return this.#createdAt;
    }
}

/**
 * Enhanced MockAbortController class
 */
class MockAbortController {
    #signal;
    #id = `controller-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    /**
     * Create a new mock abort controller
     */
    constructor() {
        this.#signal = new MockAbortSignal(this);
        
        if (_debugMode) {
            console.log(`[Abort Mock] Created controller: ${this.#id}`);
        }
    }
    
    /**
     * Get the associated signal
     */
    get signal() {
        return this.#signal;
    }
    
    /**
     * Get the controller ID (for debugging)
     */
    get id() {
        return this.#id;
    }
    
    /**
     * Abort the controller's signal
     * @param {any} reason - Reason for abortion
     */
    abort(reason) {
        this.#signal._abort(reason);
        
        // In Wayland mode, simulate memory/resource cleanup
        if (_sessionType === 'wayland') {
            const config = getConfig();
            
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, config.cleanupInterval, () => {
                // Release resources
                if (_debugMode) {
                    console.log(`[Abort Mock] Cleaning up resources for controller: ${this.#id}`);
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }
}

/**
 * MockEvent class
 */
class MockEvent {
    type;
    target;
    
    constructor(type) {
        this.type = type;
        this.target = null;
    }
}

// Export the mock classes
export {
    MockAbortController,
    MockAbortSignal,
    MockEvent,
    setSessionType,
    WAYLAND_CONFIG, 
    X11_CONFIG
}; 