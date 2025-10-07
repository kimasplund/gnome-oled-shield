'use strict';

/**
 * Mock GLib implementation for Node.js environment
 */

// Priority constants
const PRIORITY_DEFAULT = 0;
const PRIORITY_HIGH = -100;
const PRIORITY_LOW = 100;
const PRIORITY_DEFAULT_IDLE = 200;

// Source removal constants
const SOURCE_REMOVE = false;
const SOURCE_CONTINUE = true;

// Timeout handling
let timeoutCounter = 1;
const timeouts = new Map();

/**
 * Add a timeout
 * @param {number} priority - Priority level
 * @param {number} interval - Timeout in milliseconds
 * @param {Function} callback - Function to call
 * @returns {number} Timeout ID
 */
function timeout_add(priority, interval, callback) {
    const id = timeoutCounter++;
    const timeoutId = setTimeout(() => {
        const result = callback();
        if (result === SOURCE_CONTINUE) {
            // Re-add the timeout
            timeout_add(priority, interval, callback);
        }
        timeouts.delete(id);
    }, interval);
    
    timeouts.set(id, {
        nodeTimeoutId: timeoutId,
        callback,
        interval,
        priority
    });
    
    return id;
}

/**
 * Add an idle callback
 * @param {number} priority - Priority level
 * @param {Function} callback - Function to call
 * @returns {number} Source ID
 */
function idle_add(priority, callback) {
    const id = timeoutCounter++;
    const timeoutId = setTimeout(() => {
        const result = callback();
        if (result === SOURCE_CONTINUE) {
            // Re-add the idle
            idle_add(priority, callback);
        }
        timeouts.delete(id);
    }, 0);
    
    timeouts.set(id, {
        nodeTimeoutId: timeoutId,
        callback,
        idle: true,
        priority
    });
    
    return id;
}

/**
 * Remove a source
 * @param {number} id - Source ID to remove
 * @returns {boolean} Whether removal was successful
 */
function source_remove(id) {
    const timeout = timeouts.get(id);
    if (!timeout) {
        return false;
    }
    
    clearTimeout(timeout.nodeTimeoutId);
    timeouts.delete(id);
    return true;
}

/**
 * Create a cancellable main context
 */
class MainContext {
    constructor() {
        this.timeouts = new Map();
        this.isCancelled = false;
    }
    
    /**
     * Push a thread default
     */
    push_thread_default() {
        // No-op in test environment
    }
    
    /**
     * Pop thread default
     */
    pop_thread_default() {
        // No-op in test environment
    }
}

/**
 * Create a main loop
 */
class MainLoop {
    #context;
    #isRunning = false;
    
    constructor(context = null) {
        this.#context = context || new MainContext();
    }
    
    /**
     * Run the loop
     */
    run() {
        this.#isRunning = true;
    }
    
    /**
     * Quit the loop
     */
    quit() {
        this.#isRunning = false;
    }
    
    /**
     * Check if running
     */
    is_running() {
        return this.#isRunning;
    }
    
    /**
     * Get the context
     */
    get_context() {
        return this.#context;
    }
}

/**
 * Error domain handling - simpler mocked version for tests
 */
const Error = {
    new_literal: function(domain, code, message) {
        return new ErrorObject(domain, code, message);
    }
};

/**
 * Mock Error object
 */
class ErrorObject {
    constructor(domain, code, message) {
        this.domain = domain;
        this.code = code;
        this.message = message;
    }
    
    /**
     * Convert to string
     */
    toString() {
        return `${this.domain}:${this.code}: ${this.message}`;
    }
}

// Date and time utilities
function get_monotonic_time() {
    return Date.now() * 1000; // Microseconds
}

function get_real_time() {
    return Date.now() * 1000; // Microseconds
}

// Export the mock API
export default {
    PRIORITY_DEFAULT,
    PRIORITY_HIGH,
    PRIORITY_LOW,
    PRIORITY_DEFAULT_IDLE,
    SOURCE_REMOVE,
    SOURCE_CONTINUE,
    timeout_add,
    idle_add,
    source_remove,
    MainLoop,
    MainContext,
    Error,
    get_monotonic_time,
    get_real_time
};