'use strict';

/**
 * Custom module loader for handling GJS 'gi://' imports in Node.js
 * This file sets up module resolution for GNOME JavaScript modules
 */

// Mock implementations for GNOME modules
import GLib from './mocks/glib.js';
import Gio from './mocks/gio.js';
import Clutter from './mocks/clutter.js';
import Meta from './mocks/meta.js';
import GObject from './mocks/gobject.js';
import Gtk from './mocks/gtk.js';
import Adw from './mocks/adw.js';

// Module registry - Map GJS module paths to mock implementations
const giModules = {
    'gi://GLib': GLib,
    'gi://Gio': Gio,
    'gi://Clutter': Clutter,
    'gi://Meta': Meta,
    'gi://GObject': GObject,
    'gi://Gtk': Gtk,
    'gi://Adw': Adw,
};

/**
 * Setup environment for Node.js testing
 * This function makes GJS-style imports work in Node.js
 */
export function setupGjsEnvironment() {
    // Check if we're running in Node.js
    if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
        console.warn('Not running in Node.js, skipping GJS environment setup');
        return;
    }
    
    console.log('Setting up GJS environment for Node.js');
    
    // Add global.window for compatibility
    if (typeof window === 'undefined') {
        global.window = {};
    }
    
    // Add GJS-style imports
    if (typeof imports === 'undefined') {
        global.imports = {
            gi: {
                GLib: GLib,
                Gio: Gio,
                Clutter: Clutter,
                Meta: Meta,
                GObject: GObject,
                Gtk: Gtk,
                Adw: Adw,
            },
            byteArray: {
                fromString: (str) => Buffer.from(str, 'utf8'),
                toString: (bytes) => Buffer.from(bytes).toString('utf8')
            },
            system: {
                programInvocationName: 'node',
                programPath: process.argv[0],
                exit: process.exit
            },
            searchPath: [],
            mainloop: {
                quit: () => {} // No-op in test environment
            }
        };
    }
    
    // Add other GJS globals
    if (typeof log === 'undefined') {
        global.log = console.log;
    }
    
    if (typeof logError === 'undefined') {
        global.logError = console.error;
    }
    
    if (typeof print === 'undefined') {
        global.print = console.log;
    }
    
    if (typeof printerr === 'undefined') {
        global.printerr = console.error;
    }
    
    // Add timeout/interval functions if not defined
    if (typeof setTimeout === 'undefined') {
        global.setTimeout = setTimeout;
        global.clearTimeout = clearTimeout;
        global.setInterval = setInterval;
        global.clearInterval = clearInterval;
    }
}

/**
 * Resolve a GJS module path to its mock implementation
 * @param {string} specifier - The module specifier (e.g., 'gi://GLib')
 * @returns {object} The mock module implementation
 * @throws {Error} If the module is not found
 */
export function resolveGiModule(specifier) {
    if (!specifier.startsWith('gi://')) {
        throw new Error(`Not a GI module: ${specifier}`);
    }
    
    const module = giModules[specifier];
    if (!module) {
        throw new Error(`Mock not implemented for: ${specifier}`);
    }
    
    return module;
}

/**
 * Register a custom GJS module
 * @param {string} name - The module name
 * @param {object} implementation - The module implementation
 */
export function registerGiModule(name, implementation) {
    const specifier = name.startsWith('gi://') ? name : `gi://${name}`;
    giModules[specifier] = implementation;
}

// Set up the environment by default when this module is imported
setupGjsEnvironment();