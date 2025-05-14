import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import * as TestUtils from 'resource:///org/gnome/shell/misc/testUtils.js';

export const { describe, it, beforeEach, afterEach } = TestUtils;

// Base mock settings class for tests
export const BaseMockSettings = GObject.registerClass({
    Properties: {
        'debug-mode': GObject.ParamSpec.boolean(
            'debug-mode', '', '',
            GObject.ParamFlags.READWRITE,
            false
        ),
    },
}, class BaseMockSettings extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this._settings = {};
    }

    get_boolean(key) {
        return this._settings[key] ?? this[key] ?? false;
    }

    get_int(key) {
        return this._settings[key] ?? this[key] ?? 0;
    }

    get_double(key) {
        return this._settings[key] ?? this[key] ?? 0.0;
    }

    get_string(key) {
        return this._settings[key] ?? this[key] ?? '';
    }

    set_boolean(key, value) {
        this._settings[key] = value;
        this.notify(key);
    }

    set_int(key, value) {
        this._settings[key] = value;
        this.notify(key);
    }

    set_double(key, value) {
        this._settings[key] = value;
        this.notify(key);
    }

    set_string(key, value) {
        this._settings[key] = value;
        this.notify(key);
    }
});

// Mock monitor for display tests
export const MockMonitor = GObject.registerClass({
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
}, class MockMonitor extends GObject.Object {
    constructor(params = {}) {
        super(params);
    }
});

// Test assertion helpers
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
            default:
                throw new Error(`Unsupported type: ${type}`);
        }
        TestUtils.assertValueEquals(actual, value);
    }
};

// Signal tracking helper
export class SignalTracker {
    constructor() {
        this._signals = new Map();
    }

    connect(obj, signal, callback) {
        const id = obj.connect(signal, callback);
        if (!this._signals.has(obj))
            this._signals.set(obj, new Set());
        this._signals.get(obj).add(id);
        return id;
    }

    disconnect(obj, id) {
        if (this._signals.has(obj)) {
            obj.disconnect(id);
            this._signals.get(obj).delete(id);
        }
    }

    disconnectAll() {
        for (const [obj, ids] of this._signals) {
            for (const id of ids)
                obj.disconnect(id);
            ids.clear();
        }
        this._signals.clear();
    }
}

// Test utilities for GNOME Shell extensions
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

// Mock Settings implementation that works without a real schema
export function createMockSettings(schema) {
    const schemaSource = new Gio.SettingsSchemaSource({
        schemas: schema,
        parent: null,
    });
    
    // Create a simple mock GSettings object that stores values in memory
    const settings = {
        _values: {},
        _connections: new Map(),
        _nextConnectionId: 1,
        
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
            return this._values[key] || false;
        },
        
        set_boolean(key, value) {
            const oldValue = this._values[key];
            this._values[key] = Boolean(value);
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // String settings
        get_string(key) {
            return this._values[key] || '';
        },
        
        set_string(key, value) {
            const oldValue = this._values[key];
            this._values[key] = String(value);
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // Integer settings
        get_int(key) {
            return this._values[key] || 0;
        },
        
        set_int(key, value) {
            const oldValue = this._values[key];
            this._values[key] = Number(value);
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // Double settings
        get_double(key) {
            return this._values[key] || 0.0;
        },
        
        set_double(key, value) {
            const oldValue = this._values[key];
            this._values[key] = Number(value);
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // String array settings
        get_strv(key) {
            return this._values[key] || [];
        },
        
        set_strv(key, value) {
            const oldValue = this._values[key];
            this._values[key] = Array.isArray(value) ? value : [];
            this._notifyChanges(key, oldValue, this._values[key]);
        },
        
        // Signal connections
        connect(signal, callback) {
            const id = this._nextConnectionId++;
            if (!this._connections.has(signal)) {
                this._connections.set(signal, new Map());
            }
            this._connections.get(signal).set(id, callback);
            return id;
        },
        
        disconnect(id) {
            for (const [signal, callbacks] of this._connections.entries()) {
                if (callbacks.has(id)) {
                    callbacks.delete(id);
                    return;
                }
            }
        },
        
        // Notify changes
        _notifyChanges(key, oldValue, newValue) {
            if (oldValue === newValue) return;
            
            // Notify "changed" signal
            const changedCallbacks = this._connections.get('changed');
            if (changedCallbacks) {
                for (const callback of changedCallbacks.values()) {
                    callback(this, key);
                }
            }
            
            // Notify "changed::key" signal
            const keyChangedCallbacks = this._connections.get(`changed::${key}`);
            if (keyChangedCallbacks) {
                for (const callback of keyChangedCallbacks.values()) {
                    callback(this, key);
                }
            }
        }
    };
    
    return settings._init();
}

// Mock monitor creation for testing
export function createMockMonitor(index, width, height, options = {}) {
    return {
        index,
        width: width || 1920,
        height: height || 1080,
        manufacturer: options.manufacturer || 'TestMfg',
        model: options.model || 'TestModel',
        x: options.x || 0,
        y: options.y || 0,
        scale_factor: options.scale_factor || 1,
        ...options
    };
}

// Assert function that throws an error if the condition is false
export function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
    return true;
}

// Equality assertion
export function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, but got ${actual}`);
    }
    return true;
}

// Deep equality assertion for objects and arrays
export function assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(message || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
    }
    return true;
}

// Assertion that a function throws
export function assertThrows(fn, errorType, message) {
    try {
        fn();
    } catch (e) {
        if (errorType && !(e instanceof errorType)) {
            throw new Error(message || `Expected error of type ${errorType.name}, but got ${e.constructor.name}`);
        }
        return true;
    }
    throw new Error(message || "Expected function to throw, but it did not");
}

// Wait for a condition to become true
export async function waitForCondition(condition, timeout = 5000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (condition()) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms timeout`);
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