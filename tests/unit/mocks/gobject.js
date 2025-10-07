'use strict';

/**
 * Mock GObject implementation for Node.js environment
 */

// Simple event handling for signal emission
class SignalEmitter {
    #signals = new Map();
    #nextHandlerId = 1;
    
    /**
     * Connect a signal
     * @param {string} signalName - Signal name to connect to
     * @param {Function} callback - Callback function
     * @returns {number} Handler ID
     */
    connect(signalName, callback) {
        if (!this.#signals.has(signalName)) {
            this.#signals.set(signalName, new Map());
        }
        
        const handlers = this.#signals.get(signalName);
        const handlerId = this.#nextHandlerId++;
        handlers.set(handlerId, callback);
        
        return handlerId;
    }
    
    /**
     * Connect a signal with detailed event name
     * @param {string} detailedEvent - Signal name with details (e.g., 'notify::property')
     * @param {Function} callback - Callback function
     * @returns {number} Handler ID
     */
    connect_after(detailedEvent, callback) {
        return this.connect(detailedEvent, callback);
    }
    
    /**
     * Disconnect a signal handler
     * @param {number} handlerId - Handler ID to disconnect
     */
    disconnect(handlerId) {
        for (const [signalName, handlers] of this.#signals.entries()) {
            if (handlers.has(handlerId)) {
                handlers.delete(handlerId);
                return;
            }
        }
    }
    
    /**
     * Check if a particular handler ID exists
     * @param {number} handlerId - Handler ID to check
     * @returns {boolean} Whether handler exists
     */
    handler_is_connected(handlerId) {
        for (const [signalName, handlers] of this.#signals.entries()) {
            if (handlers.has(handlerId)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Emit a signal
     * @param {string} signalName - Signal name to emit
     * @param {...any} args - Arguments to pass to handlers
     * @returns {any} Return value from last handler
     */
    emit(signalName, ...args) {
        let returnValue;
        const handlers = this.#signals.get(signalName);
        
        if (handlers) {
            for (const [handlerId, callback] of handlers.entries()) {
                returnValue = callback.apply(this, args);
            }
        }
        
        return returnValue;
    }
    
    /**
     * Get a list of signals this object can emit
     * @returns {string[]} List of signal names
     */
    list_signals() {
        return Array.from(this.#signals.keys());
    }
}

/**
 * Base mock GObject class
 */
class GObject extends SignalEmitter {
    constructor(properties = {}) {
        super();
        this._init(properties);
    }
    
    /**
     * Initialize the object
     * @param {object} properties - Properties to set
     */
    _init(properties = {}) {
        this._properties = new Map();
        
        for (const [key, value] of Object.entries(properties)) {
            this._properties.set(key, value);
        }
    }
    
    /**
     * Get a property value
     * @param {string} propertyName - Property to get
     * @returns {any} Property value
     */
    get_property(propertyName) {
        return this._properties.get(propertyName);
    }
    
    /**
     * Set a property value
     * @param {string} propertyName - Property to set
     * @param {any} value - Value to set
     */
    set_property(propertyName, value) {
        const oldValue = this._properties.get(propertyName);
        this._properties.set(propertyName, value);
        
        // Emit notify signal
        this.emit(`notify::${propertyName}`, oldValue, value);
    }
    
    /**
     * Check if object has a property
     * @param {string} propertyName - Property to check
     * @returns {boolean} Whether property exists
     */
    has_property(propertyName) {
        return this._properties.has(propertyName);
    }
}

/**
 * Type registration system (simplified for testing)
 */
function registerClass(options = {}, baseClass = GObject) {
    const properties = options.Properties || {};
    const signals = options.Signals || {};
    const name = options.Name || 'GObject_Anonymous';
    
    return class extends baseClass {
        static $gtype = { name };
        
        constructor(properties = {}) {
            super();
            
            // Set default values for registered properties
            for (const [key, config] of Object.entries(properties)) {
                if (config.default !== undefined) {
                    this._properties.set(key, config.default);
                }
            }
            
            // Override with constructor properties
            for (const [key, value] of Object.entries(properties)) {
                this._properties.set(key, value);
            }
        }
    };
}

// GObject property binding
class Binding {
    #source;
    #sourceProperty;
    #target;
    #targetProperty;
    #flags;
    
    constructor(source, sourceProperty, target, targetProperty, flags = 0) {
        this.#source = source;
        this.#sourceProperty = sourceProperty;
        this.#target = target;
        this.#targetProperty = targetProperty;
        this.#flags = flags;
        
        // Set up initial binding
        this.#updateTarget();
        
        // Connect to source property changes
        this.#sourceHandler = source.connect(`notify::${sourceProperty}`, () => {
            this.#updateTarget();
        });
        
        // Connect to target property changes if bidirectional
        if (flags & BindingFlags.BIDIRECTIONAL) {
            this.#targetHandler = target.connect(`notify::${targetProperty}`, () => {
                this.#updateSource();
            });
        }
    }
    
    /**
     * Update target from source
     */
    #updateTarget() {
        const value = this.#source.get_property(this.#sourceProperty);
        this.#target.set_property(this.#targetProperty, value);
    }
    
    /**
     * Update source from target
     */
    #updateSource() {
        const value = this.#target.get_property(this.#targetProperty);
        this.#source.set_property(this.#sourceProperty, value);
    }
    
    /**
     * Unbind
     */
    unbind() {
        this.#source.disconnect(this.#sourceHandler);
        
        if (this.#targetHandler) {
            this.#target.disconnect(this.#targetHandler);
        }
    }
}

// Binding flags
const BindingFlags = {
    DEFAULT: 0,
    BIDIRECTIONAL: 1,
    SYNC_CREATE: 2,
    INVERT_BOOLEAN: 4
};

// Property flags
const ParamFlags = {
    READABLE: 1,
    WRITABLE: 2,
    CONSTRUCT: 4,
    CONSTRUCT_ONLY: 8,
    LAX_VALIDATION: 16,
    READWRITE: 3  // READABLE | WRITABLE
};

// Signal flags
const SignalFlags = {
    RUN_FIRST: 1,
    RUN_LAST: 2,
    RUN_CLEANUP: 4,
    NO_RECURSE: 8,
    DETAILED: 16,
    ACTION: 32,
    NO_HOOKS: 64,
    MUST_COLLECT: 128,
    DEPRECATED: 256,
    ACCUMULATOR_FIRST_RUN: 512
};

// Export the mock API
export default {
    Object: GObject,
    registerClass,
    Binding,
    BindingFlags,
    ParamFlags,
    SignalFlags,
    bind_property: (source, sourceProperty, target, targetProperty, flags = 0) => {
        return new Binding(source, sourceProperty, target, targetProperty, flags);
    }
};