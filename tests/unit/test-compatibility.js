'use strict';

import GLib from 'gi://GLib';
import { assertEquals, assertTrue, assertFalse, assertNotEquals } from '../testUtils.js';
import { WeakRefImpl, FinalizationRegistryImpl, features } from '../../lib/compatibility.js';
import EventEmitter from '../../lib/eventEmitter.js';

/**
 * Test compatibility utilities
 */
export function testCompatibilityUtilities() {
    console.log('Testing compatibility utilities...');
    
    // Test WeakRefImpl
    const obj = { name: 'test-object' };
    const weakRef = new WeakRefImpl(obj);
    
    // WeakRef should return the object
    assertEquals(weakRef.deref(), obj);
    
    // Test FinalizationRegistryImpl
    let cleanupCalled = false;
    const registry = new FinalizationRegistryImpl((value) => {
        cleanupCalled = true;
        assertEquals(value, 'test-value');
    });
    
    // Register an object
    registry.register(obj, 'test-value');
    
    // Test feature detection flags
    assertTrue(typeof features.hasNativeWeakRef === 'boolean');
    assertTrue(typeof features.hasNativeFinalizationRegistry === 'boolean');
    
    console.log('Compatibility utilities tested successfully');
    return true;
}

/**
 * Test EventEmitter session-specific handling
 */
export function testEventEmitterSessionHandling() {
    console.log('Testing EventEmitter session handling...');
    
    // Create event emitter
    const emitter = new EventEmitter();
    
    // Test session type detection
    const sessionType = emitter.getSessionType();
    assertTrue(sessionType === 'wayland' || sessionType === 'x11');
    
    // Test isWaylandSession method
    if (sessionType === 'wayland') {
        assertTrue(emitter.isWaylandSession());
    } else {
        assertFalse(emitter.isWaylandSession());
    }
    
    // Test signal handling with abort controller
    let eventFired = false;
    const abortController = new AbortController();
    
    // Add event listener with abort signal
    emitter.on('test-event', () => {
        eventFired = true;
    }, { signal: abortController.signal });
    
    // Event should fire
    emitter.emit('test-event');
    assertTrue(eventFired);
    
    // Reset flag and abort
    eventFired = false;
    abortController.abort();
    
    // Wait for abort to process
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        // Event should no longer fire after abort
        emitter.emit('test-event');
        assertFalse(eventFired);
        
        // Cleanup
        emitter.destroy();
        console.log('EventEmitter session handling tested successfully');
        return GLib.SOURCE_REMOVE;
    });
    
    return true;
}

/**
 * Run all tests
 */
export function runTests() {
    console.log('Running compatibility tests...');
    
    const tests = [
        testCompatibilityUtilities,
        testEventEmitterSessionHandling
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            const result = test();
            if (result) {
                passed++;
            } else {
                failed++;
            }
        } catch (error) {
            console.error(`Error in test ${test.name}: ${error.message}`);
            console.error(error.stack);
            failed++;
        }
    }
    
    console.log(`Compatibility tests completed: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

// If run directly, execute tests
if (imports.misc?.modulesDirs === undefined) {
    runTests();
} 