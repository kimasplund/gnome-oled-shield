/**
 * Mock implementation for GJS imports when running in Node.js
 * This file allows Node.js to handle 'gi://' imports
 */

// Create mock objects for common GJS libraries
const mockGLib = {
    PRIORITY_DEFAULT: 0,
    PRIORITY_HIGH: -100,
    PRIORITY_LOW: 300,
    SOURCE_CONTINUE: true,
    SOURCE_REMOVE: false,
    
    timeout_add: (priority, interval, func) => {
        const id = setTimeout(() => {
            const result = func();
            if (!result) {
                clearTimeout(id);
            }
        }, interval);
        return id;
    },
    
    timeout_add_seconds: (priority, seconds, func) => {
        return mockGLib.timeout_add(priority, seconds * 1000, func);
    },
    
    source_remove: (id) => {
        clearTimeout(id);
        return true;
    },
    
    getenv: (name) => process.env[name] || '',
    setenv: (name, value, overwrite) => {
        if (overwrite || process.env[name] === undefined) {
            process.env[name] = value;
            return true;
        }
        return false;
    },
    unsetenv: (name) => {
        delete process.env[name];
        return true;
    }
};

const mockGio = {
    File: {
        new_for_path: (path) => ({
            path,
            get_path: () => path,
            query_exists: () => require('fs').existsSync(path)
        })
    },
    
    Settings: class Settings {
        constructor(schema) {
            this.schema = schema;
            this._values = new Map();
        }
        
        get_boolean(key) { return this._values.get(key) || false; }
        set_boolean(key, value) { this._values.set(key, !!value); }
        
        get_int(key) { return this._values.get(key) || 0; }
        set_int(key, value) { this._values.set(key, parseInt(value) || 0); }
        
        get_string(key) { return this._values.get(key) || ''; }
        set_string(key, value) { this._values.set(key, String(value)); }
    }
};

const mockGObject = {
    registerClass: (options, klass) => klass,
    Object: class Object {
        connect() { return 0; }
        disconnect() { return true; }
        notify() { return true; }
        emit() { return true; }
    },
    
    ParamSpec: {
        string: () => ({}),
        boolean: () => ({}),
        int: () => ({})
    },
    
    ParamFlags: {
        READWRITE: 3
    }
};

// Handle imports based on module name
const resolveGiImport = (name) => {
    switch(name) {
        case 'GLib':
            return mockGLib;
        case 'Gio':
            return mockGio;
        case 'GObject':
            return mockGObject;
        default:
            console.warn(`No mock implementation for gi:// module: ${name}`);
            return {};
    }
};

// Export the resolveGiImport function
module.exports = { resolveGiImport };