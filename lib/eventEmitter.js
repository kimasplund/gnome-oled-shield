'use strict';

import GObject from 'gi://GObject';

/**
 * Event listener callback type
 * @callback EventCallback
 * @param {...any} args - Event arguments
 * @returns {void}
 */

/**
 * Event options
 * @typedef {Object} EventOptions
 * @property {boolean} [once=false] - Whether the listener should be removed after being called once
 * @property {AbortSignal} [signal] - AbortSignal to use for removing the event listener
 * @property {boolean} [prepend=false] - Whether to add the listener at the beginning of the listeners array
 */

/**
 * Base EventEmitter class that extends GObject.Object
 * Provides event handling capabilities to subclasses
 */
@GObject.registerClass({
    GTypeName: 'OledCareEventEmitter'
})
export default class EventEmitter extends GObject.Object {
    // Private fields
    #events = new Map();
    #maxListeners = 10;
    #abortListeners = new Map();
    
    // Static initialization block
    static {
        /**
         * Default error event name
         */
        this.ERROR_EVENT = 'error';
        
        /**
         * Default event names
         */
        this.EVENTS = Object.freeze({
            ERROR: 'error',
            READY: 'ready',
            DESTROYED: 'destroyed'
        });
    }
    
    /**
     * Create a new EventEmitter
     */
    constructor() {
        super();
    }
    
    /**
     * Set the maximum number of listeners per event
     * @param {number} n - Maximum number of listeners
     * @returns {EventEmitter} this instance for chaining
     */
    setMaxListeners(n) {
        if (typeof n !== 'number' || n < 0 || Number.isNaN(n)) {
            throw new TypeError('Expected maxListeners to be a non-negative number');
        }
        
        this.#maxListeners = n;
        return this;
    }
    
    /**
     * Get the maximum number of listeners per event
     * @returns {number} Maximum number of listeners
     */
    getMaxListeners() {
        return this.#maxListeners;
    }
    
    /**
     * Add an event listener
     * @param {string} eventName - Name of the event to listen for
     * @param {EventCallback} listener - Function to call when the event is emitted
     * @param {EventOptions} [options={}] - Options for the event listener
     * @returns {EventEmitter} this instance for chaining
     */
    on(eventName, listener, options = {}) {
        return this.#addListener(eventName, listener, options);
    }
    
    /**
     * Add a one-time event listener
     * @param {string} eventName - Name of the event to listen for
     * @param {EventCallback} listener - Function to call when the event is emitted
     * @param {EventOptions} [options={}] - Options for the event listener
     * @returns {EventEmitter} this instance for chaining
     */
    once(eventName, listener, options = {}) {
        return this.#addListener(eventName, listener, { ...options, once: true });
    }
    
    /**
     * Add a one-time event listener to the beginning of the listeners array
     * @param {string} eventName - Name of the event to listen for
     * @param {EventCallback} listener - Function to call when the event is emitted
     * @param {EventOptions} [options={}] - Options for the event listener
     * @returns {EventEmitter} this instance for chaining
     */
    prependOnce(eventName, listener, options = {}) {
        return this.#addListener(eventName, listener, { ...options, once: true, prepend: true });
    }
    
    /**
     * Add an event listener to the beginning of the listeners array
     * @param {string} eventName - Name of the event to listen for
     * @param {EventCallback} listener - Function to call when the event is emitted
     * @param {EventOptions} [options={}] - Options for the event listener
     * @returns {EventEmitter} this instance for chaining
     */
    prependListener(eventName, listener, options = {}) {
        return this.#addListener(eventName, listener, { ...options, prepend: true });
    }
    
    /**
     * Remove an event listener
     * @param {string} eventName - Name of the event
     * @param {EventCallback} listener - Listener function to remove
     * @returns {EventEmitter} this instance for chaining
     */
    off(eventName, listener) {
        return this.removeListener(eventName, listener);
    }
    
    /**
     * Remove an event listener
     * @param {string} eventName - Name of the event
     * @param {EventCallback} listener - Listener function to remove
     * @returns {EventEmitter} this instance for chaining
     */
    removeListener(eventName, listener) {
        if (typeof listener !== 'function') {
            throw new TypeError('The listener must be a function');
        }
        
        const listeners = this.#events.get(eventName);
        if (!listeners || listeners.length === 0) {
            return this;
        }
        
        // Find and remove the listener
        const index = listeners.findIndex(entry => entry.listener === listener);
        if (index !== -1) {
            listeners.splice(index, 1);
            
            // Clean up if no listeners left
            if (listeners.length === 0) {
                this.#events.delete(eventName);
            }
        }
        
        return this;
    }
    
    /**
     * Remove all listeners for an event, or all events if no eventName is specified
     * @param {string} [eventName] - Name of the event to remove listeners for
     * @returns {EventEmitter} this instance for chaining
     */
    removeAllListeners(eventName) {
        if (eventName === undefined) {
            // Clear all events
            this.#events.clear();
            return this;
        }
        
        // Clear specific event
        this.#events.delete(eventName);
        return this;
    }
    
    /**
     * Get the array of listeners for an event
     * @param {string} eventName - Name of the event
     * @returns {Array<Function>} Array of listener functions
     */
    listeners(eventName) {
        const eventListeners = this.#events.get(eventName) || [];
        return eventListeners.map(entry => entry.listener);
    }
    
    /**
     * Get the number of listeners for an event
     * @param {string} eventName - Name of the event
     * @returns {number} Number of listeners
     */
    listenerCount(eventName) {
        const eventListeners = this.#events.get(eventName) || [];
        return eventListeners.length;
    }
    
    /**
     * Get all event names with listeners
     * @returns {Array<string>} Array of event names
     */
    eventNames() {
        return [...this.#events.keys()];
    }
    
    /**
     * Emit an event, calling all listeners
     * @param {string} eventName - Name of the event to emit
     * @param {...any} args - Arguments to pass to listeners
     * @returns {boolean} true if the event had listeners, false otherwise
     */
    emit(eventName, ...args) {
        const eventListeners = this.#events.get(eventName);
        
        // If no listeners, check if it's an error
        if (!eventListeners || eventListeners.length === 0) {
            if (eventName === EventEmitter.EVENTS.ERROR) {
                const error = args[0];
                if (error instanceof Error) {
                    console.error(`Unhandled error in EventEmitter: ${error.message}`);
                    console.error(error.stack);
                } else {
                    console.error(`Unhandled error in EventEmitter: ${error}`);
                }
                return false;
            }
            return false;
        }
        
        // Copy the array to avoid issues if listeners are added/removed during emit
        const listeners = [...eventListeners];
        const onceIndices = new Set();
        
        // Call each listener
        for (let i = 0; i < listeners.length; i++) {
            const { listener, once } = listeners[i];
            
            try {
                listener.apply(this, args);
                
                // Track indices of once listeners to remove later
                if (once) {
                    onceIndices.add(i);
                }
            } catch (error) {
                // Handle errors by emitting an error event
                this.emit(EventEmitter.EVENTS.ERROR, error);
            }
        }
        
        // Remove once listeners if any
        if (onceIndices.size > 0) {
            const currentListeners = this.#events.get(eventName) || [];
            
            // Remove from the end to avoid index shifting
            const indicesToRemove = [...onceIndices].sort((a, b) => b - a);
            
            for (const index of indicesToRemove) {
                if (index < currentListeners.length) {
                    currentListeners.splice(index, 1);
                }
            }
            
            // Clean up if no listeners left
            if (currentListeners.length === 0) {
                this.#events.delete(eventName);
            }
        }
        
        return true;
    }
    
    /**
     * Add a listener with options
     * @param {string} eventName - Name of the event
     * @param {EventCallback} listener - Listener function
     * @param {EventOptions} options - Options for the listener
     * @returns {EventEmitter} this instance for chaining
     * @private
     */
    #addListener(eventName, listener, options = {}) {
        if (typeof listener !== 'function') {
            throw new TypeError('The listener must be a function');
        }
        
        // Get or create the listeners array
        const listeners = this.#events.get(eventName) || [];
        
        // Check for listener limit
        if (listeners.length >= this.#maxListeners && this.#maxListeners !== 0) {
            console.warn(
                `Maximum listener count (${this.#maxListeners}) exceeded for event: ${eventName}`
            );
        }
        
        // Create the listener entry
        const entry = {
            listener,
            once: options.once ?? false,
            removed: false
        };
        
        // Add to beginning or end based on prepend option
        if (options.prepend) {
            listeners.unshift(entry);
        } else {
            listeners.push(entry);
        }
        
        // Set the updated listeners
        this.#events.set(eventName, listeners);
        
        // Set up auto-removal if signal is provided
        if (options.signal instanceof AbortSignal) {
            const signal = options.signal;
            
            if (signal.aborted) {
                // If already aborted, remove immediately
                this.removeListener(eventName, listener);
                return this;
            }
            
            // Create a unique key for this listener
            const key = this.#getListenerKey(eventName, listener);
            
            // Set up abort handler
            const abortHandler = () => {
                this.removeListener(eventName, listener);
                this.#abortListeners.delete(key);
            };
            
            signal.addEventListener('abort', abortHandler, { once: true });
            
            // Store for cleanup
            this.#abortListeners.set(key, { signal, abortHandler, eventName, listener });
        }
        
        return this;
    }
    
    /**
     * Generate a unique key for a listener
     * @param {string} eventName - Event name
     * @param {Function} listener - Listener function
     * @returns {string} Unique key
     * @private
     */
    #getListenerKey(eventName, listener) {
        return `${eventName}::${listener.toString().substring(0, 50)}::${Date.now()}`;
    }
    
    /**
     * Check if this emitter has the specified listener for the event
     * @param {string} eventName - Name of the event
     * @param {EventCallback} listener - Listener function
     * @returns {boolean} true if the listener exists, false otherwise
     */
    hasListener(eventName, listener) {
        const listeners = this.#events.get(eventName) || [];
        return listeners.some(entry => entry.listener === listener);
    }
    
    /**
     * Wait for an event to be emitted
     * @param {string} eventName - Name of the event to wait for
     * @param {object} [options={}] - Options for the wait
     * @param {number} [options.timeout] - Timeout in milliseconds
     * @param {AbortSignal} [options.signal] - AbortSignal to abort the wait
     * @returns {Promise<Array>} Promise that resolves with the event arguments
     */
    waitForEvent(eventName, options = {}) {
        return new Promise((resolve, reject) => {
            let timeoutId;
            const abortController = new AbortController();
            
            // Set up listener
            this.once(eventName, (...args) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                resolve(args);
            }, { signal: abortController.signal });
            
            // Set up timeout if provided
            if (options.timeout) {
                timeoutId = setTimeout(() => {
                    abortController.abort();
                    reject(new Error(`Timeout waiting for event: ${eventName}`));
                }, options.timeout);
            }
            
            // Handle external abort signal
            if (options.signal instanceof AbortSignal) {
                options.signal.addEventListener('abort', () => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    abortController.abort();
                    reject(new Error(`Aborted waiting for event: ${eventName}`));
                }, { once: true });
            }
        });
    }
} 