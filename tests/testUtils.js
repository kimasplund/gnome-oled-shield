'use strict';

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import * as TestUtils from 'resource:///org/gnome/shell/misc/testUtils.js';

export const { describe, it, beforeEach, afterEach } = TestUtils;

/**
 * Base mock settings class for tests
 * Provides a GSettings-like interface for testing
 */
@GObject.registerClass({
    Properties: {
        'debug-mode': GObject.ParamSpec.boolean(
            'debug-mode', '', '',
            GObject.ParamFlags.READWRITE,
            false
        ),
    },
})
export class BaseMockSettings extends GObject.Object {
    // Private fields using true private syntax
    #settings = {};
    
    constructor(params = {}) {
        super(params);
    }

    get_boolean(key) {
        return this.#settings[key] ?? this[key] ?? false;
    }

    get_int(key) {
        return this.#settings[key] ?? this[key] ?? 0;
    }

    get_double(key) {
        return this.#settings[key] ?? this[key] ?? 0.0;
    }

    get_string(key) {
        return this.#settings[key] ?? this[key] ?? '';
    }
    
    get_strv(key) {
        return this.#settings[key] ?? this[key] ?? [];
    }

    set_boolean(key, value) {
        this.#settings[key] = value;
        this.notify(key);
    }

    set_int(key, value) {
        this.#settings[key] = value;
        this.notify(key);
    }

    set_double(key, value) {
        this.#settings[key] = value;
        this.notify(key);
    }

    set_string(key, value) {
        this.#settings[key] = value;
        this.notify(key);
    }
    
    set_strv(key, value) {
        this.#settings[key] = Array.isArray(value) ? value : [];
        this.notify(key);
    }
    
    list_keys() {
        return Object.keys(this.#settings);
    }
    
    reset(key) {
        delete this.#settings[key];
        this.notify(key);
    }
}

/**
 * Mock monitor for display tests
 */
@GObject.registerClass({
    Properties: {
        'connector': GObject.ParamSpec.string(
            'connector', '', '',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'display-name': GObject.ParamSpec.string(
            'display-name', '', '',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'is-primary': GObject.ParamSpec.boolean(
            'is-primary', '', '',
            GObject.ParamFlags.READWRITE,
            false
        ),
    },
})
export class MockMonitor extends GObject.Object {
    constructor(params = {}) {
        super(params);
    }
}

/**
 * Test assertion helper for checking settings values
 * @param {Object} settings - Settings object to check
 * @param {Object} expectedValues - Expected values as key-value pairs
 * @throws {Error} If type is unsupported or values don't match
 */
export const assertSettings = (settings, expectedValues) => {
    for (const [key, value] of Object.entries(expectedValues)) {
        const type = typeof value;
        let actual;
        
        switch (type) {
            case 'boolean':
                actual = settings.get_boolean(key);
                break;
            case 'number':
                if (Number.isInteger(value))
                    actual = settings.get_int(key);
                else
                    actual = settings.get_double(key);
                break;
            case 'string':
                actual = settings.get_string(key);
                break;
            case 'object':
                if (Array.isArray(value))
                    actual = settings.get_strv(key);
                else
                    throw new Error(`Unsupported object type for key ${key}`);
                break;
            default:
                throw new Error(`Unsupported type: ${type} for key ${key}`);
        }
        
        TestUtils.assertValueEquals(actual, value);
    }
};

/**
 * Signal tracking helper class for connecting and tracking GObject signals
 * Automatically disconnects signals when requested
 */
export class SignalTracker {
    // Private fields with # prefix
    #signals = new Map();
    #abortController = new AbortController();

    constructor() {
        // Set up cleanup for any potential long-running operations
        this.#abortController.signal.addEventListener('abort', () => {
            this.disconnectAll();
        });
    }

    /**
     * Connect a signal to an object and track the connection
     * @param {GObject.Object} obj - The object to connect to
     * @param {string} signal - The signal name
     * @param {Function} callback - The callback function
     * @returns {number} The connection ID
     */
    connect(obj, signal, callback) {
        try {
            const id = obj.connect(signal, callback);
            
            if (!this.#signals.has(obj))
                this.#signals.set(obj, new Set());
                
            this.#signals.get(obj).add(id);
            return id;
        } catch (error) {
            console.error(`Failed to connect signal ${signal}: ${error.message}`);
            return 0;
        }
    }

    /**
     * Disconnect a specific signal
     * @param {GObject.Object} obj - The object to disconnect from
     * @param {number} id - The connection ID
     */
    disconnect(obj, id) {
        try {
            if (this.#signals.has(obj) && id) {
                obj.disconnect(id);
                this.#signals.get(obj).delete(id);
                
                // Clean up map entry if no more signals
                if (this.#signals.get(obj).size === 0) {
                    this.#signals.delete(obj);
                }
            }
        } catch (error) {
            console.error(`Failed to disconnect signal ${id}: ${error.message}`);
        }
    }

    /**
     * Disconnect all tracked signals
     */
    disconnectAll() {
        for (const [obj, ids] of this.#signals) {
            for (const id of ids) {
                try {
                    obj.disconnect(id);
                } catch (error) {
                    console.error(`Failed to disconnect signal ${id}: ${error.message}`);
                }
            }
            ids.clear();
        }
        this.#signals.clear();
        
        // Abort any pending operations
        this.#abortController.abort('Disconnecting all signals');
    }
}

/**
 * Create a mock settings object with the given schema
 * @param {Object} schema - Schema definition
 * @returns {Object} Mock settings object
 */
export function createMockSettings(schema) {
    // Create a mock settings object that works like GSettings
    const settings = {
        _values: {},
        _connections: new Map(),
        _nextConnectionId: 1,
        _abortController: new AbortController(),
        
        // Schema definitions
        _schema: schema,
        
        // Initialize values from schema defaults
        _init() {
            for (const [key, def] of Object.entries(this._schema)) {
                this._values[key] = def.default;
            }
            return this;
        },
        
        // Boolean settings
        get_boolean(key) {
            return this._values[key] ?? false;
        },
        
        set_boolean(key, value) {
            const oldValue = this._values[key];
            this._values[key] = Boolean(value);
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // String settings
        get_string(key) {
            return this._values[key] ?? '';
        },
        
        set_string(key, value) {
            const oldValue = this._values[key];
            this._values[key] = String(value);
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // Integer settings
        get_int(key) {
            return this._values[key] ?? 0;
        },
        
        set_int(key, value) {
            const oldValue = this._values[key];
            this._values[key] = Number(value);
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // Double settings
        get_double(key) {
            return this._values[key] ?? 0.0;
        },
        
        set_double(key, value) {
            const oldValue = this._values[key];
            this._values[key] = Number(value);
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // String array settings
        get_strv(key) {
            return this._values[key] ?? [];
        },
        
        set_strv(key, value) {
            const oldValue = this._values[key];
            this._values[key] = Array.isArray(value) ? [...value] : [];
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // Signal connections
        connect(signal, callback) {
            const id = this._nextConnectionId++;
            
            if (!this._connections.has(signal))
                this._connections.set(signal, new Map());
                
            this._connections.get(signal).set(id, callback);
            
            return id;
        },
        
        // Disconnect a signal
        disconnect(id) {
            for (const [signal, connections] of this._connections) {
                if (connections.has(id)) {
                    connections.delete(id);
                    
                    // Clean up if no more connections for this signal
                    if (connections.size === 0)
                        this._connections.delete(signal);
                        
                    return;
                }
            }
        },
        
        // Notify about changes
        _notifyChanges(key, oldValue, newValue) {
            if (oldValue === newValue)
                return;
                
            // Emit the 'changed' signal
            const signal = `changed::${key}`;
            
            if (this._connections.has('changed')) {
                for (const callback of this._connections.get('changed').values()) {
                    try {
                        callback(this, key);
                    } catch (error) {
                        console.error(`Error in 'changed' signal callback: ${error.message}`);
                    }
                }
            }
            
            if (this._connections.has(signal)) {
                for (const callback of this._connections.get(signal).values()) {
                    try {
                        callback(this, key);
                    } catch (error) {
                        console.error(`Error in '${signal}' signal callback: ${error.message}`);
                    }
                }
            }
        },
        
        // Clean up resources
        destroy() {
            this._connections.clear();
            this._abortController.abort('Settings destroyed');
        }
    };
    
    return settings._init();
}

/**
 * Create a mock monitor with the given parameters
 * @param {number} index - Monitor index
 * @param {number} width - Monitor width
 * @param {number} height - Monitor height
 * @param {Object} options - Additional monitor options
 * @returns {Object} Mock monitor object
 */
export function createMockMonitor(index, width, height, options = {}) {
    return {
        index,
        width: width ?? 1920,
        height: height ?? 1080,
        connector: options.connector ?? `DP-${index}`,
        display_name: options.display_name ?? `Monitor ${index}`,
        is_primary: options.is_primary ?? (index === 0),
        manufacturer: options.manufacturer ?? 'Mock',
        model: options.model ?? `MockModel-${index}`,
        is_builtin: options.is_builtin ?? false
    };
}

/**
 * Assert that a condition is true
 * @param {boolean} condition - The condition to check
 * @param {string} message - The error message if the assertion fails
 * @throws {Error} If the condition is false
 */
export function assert(condition, message) {
    if (!condition)
        throw new Error(message ?? 'Assertion failed');
}

/**
 * Assert that two values are equal
 * @param {any} actual - The actual value
 * @param {any} expected - The expected value
 * @param {string} message - The error message if the assertion fails
 * @throws {Error} If the values are not equal
 */
export function assertEqual(actual, expected, message) {
    if (actual !== expected)
        throw new Error(message ?? `Expected ${expected}, got ${actual}`);
}

/**
 * Assert that two values are deeply equal
 * @param {any} actual - The actual value
 * @param {any} expected - The expected value
 * @param {string} message - The error message if the assertion fails
 * @throws {Error} If the values are not deeply equal
 */
export function assertDeepEqual(actual, expected, message) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    
    if (actualJson !== expectedJson)
        throw new Error(message ?? `Expected ${expectedJson}, got ${actualJson}`);
}

/**
 * Assert that a function throws an error
 * @param {Function} fn - The function to call
 * @param {Function} errorType - The expected error type
 * @param {string} message - The error message if the assertion fails
 * @throws {Error} If the function doesn't throw or throws the wrong error type
 */
export function assertThrows(fn, errorType, message) {
    try {
        fn();
        throw new Error(message ?? 'Expected function to throw an error');
    } catch (error) {
        if (errorType && !(error instanceof errorType))
            throw new Error(message ?? `Expected error of type ${errorType.name}, got ${error.constructor.name}`);
    }
}

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns a boolean
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<void>} Resolves when the condition is true
 * @throws {Error} If the timeout is reached
 */
export async function waitForCondition(condition, timeout = 5000, interval = 100) {
    const abortController = new AbortController();
    const startTime = Date.now();
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
        abortController.abort(`Timeout of ${timeout}ms exceeded`);
    }, timeout);
    
    try {
        while (!condition()) {
            if (abortController.signal.aborted)
                throw new Error(`Condition not met: ${abortController.signal.reason}`);
                
            // Check if we've exceeded the timeout manually as well
            if (Date.now() - startTime > timeout)
                throw new Error(`Timeout of ${timeout}ms exceeded`);
                
            // Wait for the next interval
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    } finally {
        clearTimeout(timeoutId);
    }
}

// Define a global describe function for test organization
globalThis.describe = function(description, testFn) {
    console.log(`\n==== ${description} ====`);
    testFn();
};

// Define a global it function for individual tests
globalThis.it = function(description, testFn) {
    try {
        testFn();
        console.log(`✓ ${description}`);
    } catch (e) {
        console.error(`✗ ${description}`);
        console.error(`  ${e.message}`);
        console.error(`  ${e.stack.split('\n').slice(1).join('\n')}`);
    }
};

// Define before, beforeEach, after, afterEach hooks
globalThis.before = function(fn) {
    try {
        fn();
    } catch (e) {
        console.error(`Failed in before hook: ${e.message}`);
        throw e;
    }
};

globalThis.beforeEach = function(fn) {
    globalThis._beforeEachFn = fn;
};

globalThis.after = function(fn) {
    try {
        fn();
    } catch (e) {
        console.error(`Failed in after hook: ${e.message}`);
        throw e;
    }
};

globalThis.afterEach = function(fn) {
    globalThis._afterEachFn = fn;
};

// Add assertions to global scope
globalThis.assert = assert;
globalThis.assertEqual = assertEqual;
globalThis.assertDeepEqual = assertDeepEqual;
globalThis.assertThrows = assertThrows; 