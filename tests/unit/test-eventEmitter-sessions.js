'use strict';

import GLib from 'gi://GLib';
import { 
    assertEquals, 
    assertTrue, 
    assertFalse,

    assertNotEquals
} from '../testUtils.js';
import EventEmitter from '../../lib/eventEmitter.js';
import Meta, { setSessionType } from '../unit/mocks/meta.js';
import { 
    MockAbortController, 
    setSessionType as setAbortSessionType 
} from '../unit/mocks/abort.js';

// Test configuration
const TEST_TIMEOUT = 2000; // ms
const TEST_CLEANUP_DELAY = 500; // ms

/**
 * Run a test with a specific session type
 * @param {string} sessionType - 'wayland' or 'x11'
 * @param {Function} testFn - Test function to run
 * @param {string} testName - Test name for logging
 * @returns {Promise} Promise that resolves when the test is complete
 */
function runWithSessionType(sessionType, testFn, testName) {
    // Set the session type for both mocks
    setSessionType(sessionType);
    setAbortSessionType(sessionType);
    
    console.log(`Running test '${testName}' in ${sessionType} environment...`);
    
    return new Promise((resolve, reject) => {
        try {
            const result = testFn();
            
            // If result is a promise, wait for it
            if (result instanceof Promise) {
                result.then(resolve).catch(reject);
            } else {
                // Allow time for cleanup
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, TEST_CLEANUP_DELAY, () => {
                    resolve();
                    return GLib.SOURCE_REMOVE;
                });
            }
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Test that EventEmitter uses the correct session mode
 */
function testSessionDetection() {
    console.log('Testing session detection...');
    
    // Create emitter
    const emitter = new EventEmitter();
    
    // Test session type detection
    if (Meta.is_wayland_compositor()) {
        assertEquals(emitter.getSessionType(), 'wayland');
        assertTrue(emitter.isWaylandSession());
    } else {
        assertEquals(emitter.getSessionType(), 'x11');
        assertFalse(emitter.isWaylandSession());
    }
    
    // Cleanup
    emitter.destroy();
    
    console.log('Session detection test passed');
    return true;
}

/**
 * Test abort signal behavior in different session environments
 */
function testAbortSignalBehavior() {
    console.log('Testing abort signal behavior...');
    
    return new Promise((resolve, reject) => {
        // Create emitter
        const emitter = new EventEmitter();
        
        // Create abort controller
        const controller = new MockAbortController();
        
        // Track events
        let eventsFired = 0;
        const maxEvents = 3;
        
        // Add event listeners with abort signal
        for (let i = 0; i < maxEvents; i++) {
            emitter.on('test-event', () => {
                eventsFired++;
                console.log(`Event fired ${eventsFired}/${maxEvents}`);
            }, { signal: controller.signal });
        }
        
        // Fire event and verify all listeners are called
        emitter.emit('test-event');
        assertEquals(eventsFired, maxEvents);
        
        // Reset count
        eventsFired = 0;
        
        // Abort the controller
        controller.abort('Test aborted');
        
        // Allow time for abort to process
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            // Fire event again
            emitter.emit('test-event');
            
            // Listeners should be removed
            assertEquals(eventsFired, 0);
            
            // Cleanup
            emitter.destroy();
            console.log('Abort signal behavior test passed');
            
            resolve(true);
            return GLib.SOURCE_REMOVE;
        });
        
        // Safety timeout
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, TEST_TIMEOUT, () => {
            if (timeoutId) {
                GLib.source_remove(timeoutId);
                timeoutId = null;
            }
            
            emitter.destroy();
            reject(new Error('Test timed out'));
            return GLib.SOURCE_REMOVE;
        });
    });
}

/**
 * Test cleanup behavior in different session environments
 */
function testCleanupBehavior() {
    console.log('Testing cleanup behavior...');
    
    return new Promise((resolve, reject) => {
        // Create emitter
        const emitter = new EventEmitter();
        
        // Create event counter
        let eventCount = 0;
        
        // Add many listeners
        const listenerCount = 20;
        for (let i = 0; i < listenerCount; i++) {
            emitter.on('cleanup-test', () => {
                eventCount++;
            });
        }
        
        // Verify correct number of listeners
        assertEquals(emitter.listenerCount('cleanup-test'), listenerCount);
        
        // Emit event
        emitter.emit('cleanup-test');
        assertEquals(eventCount, listenerCount);
        
        // Reset counter
        eventCount = 0;
        
        // Destroy the emitter
        emitter.destroy();
        
        // Create new timeout to verify cleanup
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            // Create a new emitter to verify the old one was properly cleaned up
            const newEmitter = new EventEmitter();
            
            try {
                // Verify cleanup
                assertEquals(emitter.listenerCount('cleanup-test'), 0);
                
                // Emit event to verify listeners don't fire
                emitter.emit('cleanup-test');
                assertEquals(eventCount, 0);
                
                newEmitter.destroy();
                console.log('Cleanup behavior test passed');
                
                resolve(true);
            } catch (error) {
                newEmitter.destroy();
                reject(error);
            }
            
            return GLib.SOURCE_REMOVE;
        });
        
        // Safety timeout
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, TEST_TIMEOUT, () => {
            if (timeoutId) {
                GLib.source_remove(timeoutId);
                timeoutId = null;
            }
            
            reject(new Error('Test timed out'));
            return GLib.SOURCE_REMOVE;
        });
    });
}

/**
 * Test stress behavior under rapid event emission
 */
function testStressBehavior() {
    console.log('Testing stress behavior...');
    
    return new Promise((resolve, reject) => {
        // Create emitter
        const emitter = new EventEmitter();
        
        // Create abort controllers
        const controllers = [];
        const controllerCount = 50;
        
        // Track events
        let eventsFired = 0;
        
        // Add many event listeners with abort signals
        for (let i = 0; i < controllerCount; i++) {
            const controller = new MockAbortController();
            controllers.push(controller);
            
            emitter.on('stress-test', () => {
                eventsFired++;
            }, { signal: controller.signal });
        }
        
        // Fire event and verify all listeners are called
        emitter.emit('stress-test');
        assertEquals(eventsFired, controllerCount);
        
        // Reset count
        eventsFired = 0;
        
        // Abort half the controllers rapidly
        for (let i = 0; i < controllerCount / 2; i++) {
            controllers[i].abort('Stress test');
        }
        
        // Allow time for aborts to process
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            // Fire event again
            emitter.emit('stress-test');
            
            // Half the listeners should be removed
            assertEquals(eventsFired, controllerCount / 2);
            
            // Cleanup
            emitter.destroy();
            console.log('Stress behavior test passed');
            
            resolve(true);
            return GLib.SOURCE_REMOVE;
        });
        
        // Safety timeout
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, TEST_TIMEOUT, () => {
            if (timeoutId) {
                GLib.source_remove(timeoutId);
                timeoutId = null;
            }
            
            emitter.destroy();
            reject(new Error('Test timed out'));
            return GLib.SOURCE_REMOVE;
        });
    });
}

/**
 * Run all tests for a specific session type
 * @param {string} sessionType - 'wayland' or 'x11'
 */
async function runSessionTests(sessionType) {
    console.log(`\n=== Running tests in ${sessionType.toUpperCase()} environment ===\n`);
    
    try {
        await runWithSessionType(sessionType, testSessionDetection, 'Session Detection');
        await runWithSessionType(sessionType, testAbortSignalBehavior, 'Abort Signal Behavior');
        await runWithSessionType(sessionType, testCleanupBehavior, 'Cleanup Behavior');
        await runWithSessionType(sessionType, testStressBehavior, 'Stress Behavior');
        
        console.log(`\n=== All ${sessionType.toUpperCase()} tests passed ===\n`);
        return true;
    } catch (error) {
        console.error(`Error in ${sessionType} tests:`, error);
        return false;
    }
}

/**
 * Run all tests
 */
export async function runTests() {
    console.log('Running EventEmitter session tests...');
    
    let wayland = false;
    let x11 = false;
    
    try {
        // Run tests in Wayland environment
        wayland = await runSessionTests('wayland');
        
        // Run tests in X11 environment
        x11 = await runSessionTests('x11');
        
        console.log('\n=== EventEmitter session tests completed ===');
        console.log(`Wayland: ${wayland ? 'PASSED' : 'FAILED'}`);
        console.log(`X11: ${x11 ? 'PASSED' : 'FAILED'}`);
        
        return wayland && x11;
    } catch (error) {
        console.error('Error running tests:', error);
        return false;
    } finally {
        // For some reason the test might still be running in the background
        // Force exit after 1 second
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            // Only running directly
            if (imports.misc?.modulesDirs === undefined) {
                console.log('Forcing exit...');
                imports.system.exit(0);
            }
            return GLib.SOURCE_REMOVE;
        });
    }
}

// Run tests if run directly
if (imports.misc?.modulesDirs === undefined) {
    runTests().catch(error => {
        console.error('Error running tests:', error);
    });
} 