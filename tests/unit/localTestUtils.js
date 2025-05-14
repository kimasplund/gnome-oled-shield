'use strict';

// Local test utilities for GNOME Shell extension testing
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

// Define global object if it doesn't exist
if (typeof global === 'undefined') {
    globalThis.global = globalThis;
}

export function describe(name, fn) {
    console.log(`\nTest Suite: ${name}`);
    fn();
}

export function it(name, fn) {
    console.log(`  Test: ${name}`);
    try {
        if (global._beforeEachFn) {
            global._beforeEachFn();
        }
        fn();
        if (global._afterEachFn) {
            global._afterEachFn();
        }
        console.log('    ✓ Passed');
    } catch (e) {
        console.log('    ✗ Failed:', e.message);
        if (global._afterEachFn) {
            try {
                global._afterEachFn();
            } catch (cleanupError) {
                console.log('    ✗ Cleanup failed:', cleanupError.message);
            }
        }
        throw e;
    }
}

export function beforeEach(fn) {
    global._beforeEachFn = fn;
}

export function afterEach(fn) {
    global._afterEachFn = fn;
}

export function assertValueEquals(actual, expected) {
    if (actual !== expected)
        throw new Error(`Expected ${expected} but got ${actual}`);
}

export function assertValueCompare(actual, operator, expected) {
    switch (operator) {
        case '<=':
            if (!(actual <= expected))
                throw new Error(`Expected ${actual} to be <= ${expected}`);
            break;
        case '>=':
            if (!(actual >= expected))
                throw new Error(`Expected ${actual} to be >= ${expected}`);
            break;
        case '<':
            if (!(actual < expected))
                throw new Error(`Expected ${actual} to be < ${expected}`);
            break;
        case '>':
            if (!(actual > expected))
                throw new Error(`Expected ${actual} to be > ${expected}`);
            break;
    }
}

export function assertNotNull(value) {
    if (value === null || value === undefined)
        throw new Error('Expected value to not be null or undefined');
}

export function assertNull(value) {
    if (value !== null && value !== undefined)
        throw new Error('Expected value to be null or undefined');
}

export function assertEffectRemoved(actor, effectName) {
    const effect = actor.get_effect(effectName);
    if (effect !== undefined && effect !== null) {
        if (effect.get_enabled()) {
            throw new Error(`Expected effect '${effectName}' to be removed or disabled but it is still enabled`);
        }
    }
}

export async function waitForGarbageCollection() {
    // Force garbage collection
    imports.system.gc();
    
    // Wait a bit for cleanup
    await new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

export async function waitForTestEnvironment() {
    // Wait for environment setup
    await new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
} 