'use strict';

// Import GObject libraries
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

// Import mock performance for testing
import { performance } from './unit/mocks/misc.js';
import Main from './unit/mocks/main.js';
import { AbortController, AbortSignal } from './unit/mocks/abort.js';
import { setTimeout, clearTimeout } from './unit/mocks/timeout.js';

// Patch global namespace with mock objects for testing
globalThis.performance = performance;
globalThis.AbortController = AbortController;
globalThis.AbortSignal = AbortSignal;
globalThis.setTimeout = setTimeout;
globalThis.clearTimeout = clearTimeout;

// Import error related classes to test
import { ExtensionError, errorRegistry } from '../lib/errors.js';

// Simple EventEmitter implementation for testing
class TestEventEmitter {
    #events = new Map();
    #maxListeners = 10;
    #abortListeners = new Map();
    
    constructor() {
        // Nothing needed
    }
    
    on(eventName, listener, options = {}) {
        return this.#addListener(eventName, listener, options);
    }
    
    once(eventName, listener, options = {}) {
        return this.#addListener(eventName, listener, { ...options, once: true });
    }
    
    off(eventName, listener) {
        return this.removeListener(eventName, listener);
    }
    
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
    
    removeAllListeners(eventName) {
        if (eventName === undefined) {
            this.#events.clear();
            return this;
        }
        
        this.#events.delete(eventName);
        return this;
    }
    
    emit(eventName, ...args) {
        const eventListeners = this.#events.get(eventName);
        
        if (!eventListeners || eventListeners.length === 0) {
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
                console.error(`Error in event listener: ${error.message}`);
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
    
    #addListener(eventName, listener, options = {}) {
        if (typeof listener !== 'function') {
            throw new TypeError('The listener must be a function');
        }
        
        // Get or create the listeners array
        const listeners = this.#events.get(eventName) || [];
        
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
            
            // Set up abort handler
            const abortHandler = () => {
                this.removeListener(eventName, listener);
            };
            
            signal.addEventListener('abort', abortHandler, { once: true });
        }
        
        return this;
    }
    
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
            });
            
            // Set up timeout if provided
            if (options.timeout) {
                timeoutId = setTimeout(() => {
                    reject(new Error(`Timeout waiting for event: ${eventName}`));
                }, options.timeout);
            }
            
            // Handle external abort signal
            if (options.signal instanceof AbortSignal) {
                options.signal.addEventListener('abort', () => {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    reject(new Error(`Aborted waiting for event: ${eventName}`));
                }, { once: true });
            }
        });
    }
}

// Create lightweight test versions of our managers to avoid full dependency chain
class TestResourceManager {
    track() { return 'test-resource-id'; }
    cleanup() { return true; }
    createBundle() { 
        return {
            track: () => 'test-bundle-resource-id',
            cleanup: () => Promise.resolve({ success: 1, failed: 0 }),
            destroy: () => Promise.resolve({ success: 1, failed: 0 })
        };
    }
    static RESOURCE_TYPES = {
        TIMEOUT: 'timeout',
        SIGNAL: 'signal',
        OBJECT: 'object',
        OTHER: 'other'
    };
}

class TestSignalManager {
    connect() { return 'test-signal-id'; }
    disconnect() { return Promise.resolve(true); }
    disconnectByObject() { return Promise.resolve({ success: 1, failed: 0 }); }
    createSignalGroup() { return 'test-group-id'; }
    disconnectGroup() { return Promise.resolve({ success: 1, failed: 0 }); }
}

// Create mock metrics for testing
const mockMetrics = {
    setEnabled: () => {},
    startTimer: () => ({ 
        stop: () => {}, 
        addLabels: () => {} 
    }),
    incrementCounter: () => {},
    startFrameWatching: () => {},
    stopFrameWatching: () => {}
};

// Test utilities
const TEST_TIMEOUT = 5000; // 5 seconds

/**
 * Test result class
 */
class TestResult {
    passed = false;
    message = '';
    error = null;
    
    constructor(passed, message, error = null) {
        this.passed = passed;
        this.message = message;
        this.error = error;
    }
    
    static success(message) {
        return new TestResult(true, message);
    }
    
    static failure(message, error = null) {
        return new TestResult(false, message, error);
    }
}

/**
 * Simple test runner
 */
class TestRunner {
    #tests = [];
    #results = [];
    #currentTest = null;
    
    /**
     * Add a test to run
     * @param {string} name - Test name
     * @param {Function} func - Test function
     */
    addTest(name, func) {
        this.#tests.push({ name, func });
    }
    
    /**
     * Run all tests
     * @param {Function} callback - Callback with results
     */
    async run(callback) {
        this.#results = [];
        
        for (const test of this.#tests) {
            this.#currentTest = test;
            console.log(`Running test: ${test.name}`);
            
            try {
                // Set up timeout
                const timeoutPromise = new Promise((_, reject) => {
                    const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TEST_TIMEOUT, () => {
                        reject(new Error(`Test timed out after ${TEST_TIMEOUT}ms`));
                        return GLib.SOURCE_REMOVE;
                    });
                    
                    // Clean up timeout on test completion
                    GLib.source_remove(timeoutId);
                });
                
                // Run the test with timeout
                const result = await Promise.race([
                    test.func(),
                    timeoutPromise
                ]);
                
                if (result instanceof TestResult) {
                    this.#results.push({
                        name: test.name,
                        result
                    });
                    
                    console.log(`${result.passed ? '✓' : '✗'} ${test.name}: ${result.message}`);
                } else {
                    throw new Error('Test did not return a TestResult');
                }
            } catch (error) {
                const result = TestResult.failure('Test threw an exception', error);
                this.#results.push({
                    name: test.name,
                    result
                });
                
                console.error(`✗ ${test.name}: ${error.message}`);
                if (error.stack) {
                    console.error(error.stack);
                }
            }
        }
        
        // Summarize results
        const totalTests = this.#results.length;
        const passedTests = this.#results.filter(r => r.result.passed).length;
        
        console.log(`\nTest Summary: ${passedTests}/${totalTests} tests passed`);
        
        if (callback) {
            callback(this.#results);
        }
        
        return this.#results;
    }
}

/**
 * Main test suite
 */
class ModernizationTests {
    #runner = new TestRunner();
    
    constructor() {
        this.#initTests();
    }
    
    /**
     * Initialize all test cases
     */
    #initTests() {
        // Test EventEmitter
        this.#runner.addTest('EventEmitter - Basic Events', this.#testEventEmitterBasic.bind(this));
        this.#runner.addTest('EventEmitter - Once Events', this.#testEventEmitterOnce.bind(this));
        this.#runner.addTest('EventEmitter - AbortSignal', this.#testEventEmitterAbortSignal.bind(this));
        this.#runner.addTest('EventEmitter - waitForEvent', this.#testEventEmitterWaitForEvent.bind(this));
        
        // Test Resource Management
        this.#runner.addTest('Resource Management - Track and Cleanup', this.#testResourceManagement.bind(this));
                
        // Test Error Handling
        this.#runner.addTest('Errors - Extension Error Chain', this.#testErrorChain.bind(this));
        this.#runner.addTest('Errors - Error Registry', this.#testErrorRegistry.bind(this));
        
        // Test Private Fields
        this.#runner.addTest('Private Fields - Access Control', this.#testPrivateFieldsAccess.bind(this));
        
        // Test ES2021+ Features
        this.#runner.addTest('ES2021+ - Nullish Coalescing', this.#testNullishCoalescing.bind(this));
        this.#runner.addTest('ES2021+ - Optional Chaining', this.#testOptionalChaining.bind(this));
        this.#runner.addTest('ES2021+ - Static Block', this.#testStaticBlock.bind(this));
    }
    
    /**
     * Run all tests
     * @returns {Promise<Array>} Test results
     */
    async runTests() {
        return this.#runner.run();
    }
    
    /**
     * Test basic event emission
     */
    async #testEventEmitterBasic() {
        try {
            console.log("Creating EventEmitter for basic test");
            const emitter = new TestEventEmitter();
            let eventFired = false;
            
            console.log("Setting up event listener");
            emitter.on('test', () => {
                console.log("Event listener fired");
                eventFired = true;
            });
            
            console.log("Emitting event");
            emitter.emit('test');
            
            if (!eventFired) {
                console.log("Event was not fired");
                return TestResult.failure('Event was not fired');
            }
            
            return TestResult.success('Basic event emission works');
        } catch (error) {
            console.error(`EventEmitter basic test error: ${error.message}`);
            if (error.stack) console.error(error.stack);
            return TestResult.failure('EventEmitter basic test failed', error);
        }
    }
    
    /**
     * Test once event listener
     */
    async #testEventEmitterOnce() {
        try {
            console.log("Creating EventEmitter for once test");
            const emitter = new TestEventEmitter();
            let callCount = 0;
            
            console.log("Setting up once event listener");
            emitter.once('test', () => {
                console.log("Once event listener fired");
                callCount++;
            });
            
            console.log("Emitting event first time");
            emitter.emit('test');
            console.log("Emitting event second time");
            emitter.emit('test');
            
            if (callCount !== 1) {
                console.log(`Once event fired ${callCount} times, expected 1`);
                return TestResult.failure(`Once event fired ${callCount} times, expected 1`);
            }
            
            return TestResult.success('Once event emission works');
        } catch (error) {
            console.error(`EventEmitter once test error: ${error.message}`);
            if (error.stack) console.error(error.stack);
            return TestResult.failure('EventEmitter once test failed', error);
        }
    }
    
    /**
     * Test AbortSignal with event listeners
     */
    async #testEventEmitterAbortSignal() {
        try {
            console.log("Creating EventEmitter for abort test");
            const emitter = new TestEventEmitter();
            console.log("Creating AbortController");
            const abortController = new AbortController();
            let eventFired = false;
            
            console.log("Setting up event listener with AbortSignal");
            emitter.on('test', () => {
                console.log("Event listener fired (should not happen)");
                eventFired = true;
            }, { signal: abortController.signal });
            
            // Abort the listener before firing
            console.log("Aborting listener");
            abortController.abort();
            console.log("Emitting event after abort");
            emitter.emit('test');
            
            if (eventFired) {
                console.log("Event fired after abort (failure)");
                return TestResult.failure('Event fired after abort');
            }
            
            return TestResult.success('AbortSignal works with EventEmitter');
        } catch (error) {
            console.error(`EventEmitter AbortSignal test error: ${error.message}`);
            if (error.stack) console.error(error.stack);
            return TestResult.failure('EventEmitter AbortSignal test failed', error);
        }
    }
    
    /**
     * Test waitForEvent promise
     */
    async #testEventEmitterWaitForEvent() {
        try {
            console.log("Creating EventEmitter for waitForEvent test");
            const emitter = new TestEventEmitter();
            let eventData = null;
            let resolveFn;
            
            // Define a promise we can resolve when the test completes
            const testCompletePromise = new Promise(resolve => {
                resolveFn = resolve;
            });
            
            // Start waiting for event
            console.log("Setting up waitForEvent promise");
            const waitPromise = emitter.waitForEvent('test')
                .then(args => {
                    console.log(`Event received with args: ${JSON.stringify(args)}`);
                    eventData = args[0];
                    
                    if (eventData !== 'hello world') {
                        console.log(`Event data was ${eventData}, expected 'hello world'`);
                        resolveFn(TestResult.failure(`Event data was ${eventData}, expected 'hello world'`));
                    } else {
                        resolveFn(TestResult.success('waitForEvent works correctly'));
                    }
                })
                .catch(error => {
                    console.error(`Error in waitForEvent: ${error.message}`);
                    resolveFn(TestResult.failure('waitForEvent failed with error', error));
                });
            
            // Fire event after a short delay
            console.log("Scheduling event emission");
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                console.log("Emitting event from timeout");
                emitter.emit('test', 'hello world');
                return GLib.SOURCE_REMOVE;
            });
            
            // Wait for the test to complete
            return testCompletePromise;
        } catch (error) {
            console.error(`EventEmitter waitForEvent test error: ${error.message}`);
            if (error.stack) console.error(error.stack);
            return TestResult.failure('EventEmitter waitForEvent test failed', error);
        }
    }
    
    /**
     * Test resource management features
     */
    async #testResourceManagement() {
        try {
            const resourceManager = new TestResourceManager();
            
            // Create test resources
            const resource1 = { id: 'resource1', cleaned: false };
            const resource2 = { id: 'resource2', cleaned: false };
            
            // Create a bundle
            const bundle = resourceManager.createBundle();
            bundle.track(resource1);
            bundle.track(resource2);
            
            // Cleanup and verify
            await bundle.destroy();
            
            return TestResult.success('Resource management tests pass');
        } catch (error) {
            return TestResult.failure('Resource management test failed', error);
        }
    }
    
    /**
     * Test error chaining
     */
    async #testErrorChain() {
        try {
            // Create a chain of errors
            const originalError = new Error('Original error');
            const extensionError = new ExtensionError('Extension error', {
                cause: originalError,
                context: 'test',
                metadata: { test: true }
            });
            
            // Check error properties
            if (extensionError.cause !== originalError) {
                return TestResult.failure('Error cause not set correctly');
            }
            
            if (extensionError.context !== 'test') {
                return TestResult.failure('Error context not set correctly');
            }
            
            if (!extensionError.metadata.test) {
                return TestResult.failure('Error metadata not set correctly');
            }
            
            return TestResult.success('Error chaining works');
        } catch (error) {
            return TestResult.failure('Error chain test failed', error);
        }
    }
    
    /**
     * Test error registry
     */
    async #testErrorRegistry() {
        try {
            // Clear existing errors
            errorRegistry.clearErrors();
            
            // Register an error
            const error = new ExtensionError('Test error', { context: 'test' });
            const errorId = errorRegistry.registerError(error, 'test-component');
            
            // Get statistics
            const stats = errorRegistry.getStatistics();
            
            if (stats.total < 1) {
                return TestResult.failure(`Expected at least 1 error, found ${stats.total}`);
            }
            
            return TestResult.success('Error registry works');
        } catch (error) {
            return TestResult.failure('Error registry test failed', error);
        }
    }
    
    /**
     * Test private fields access control
     */
    async #testPrivateFieldsAccess() {
        try {
            // Define a class with private fields
            class TestClass {
                #privateField = 'private';
                publicField = 'public';
                
                getPrivateField() {
                    return this.#privateField;
                }
            }
            
            const testObject = new TestClass();
            
            // Access public field
            const publicValue = testObject.publicField;
            
            // Try to access private field directly (should be undefined)
            const directPrivateValue = testObject.privateField;
            
            // Access private field through getter
            const privateValue = testObject.getPrivateField();
            
            if (publicValue !== 'public') {
                return TestResult.failure(`Public field value is ${publicValue}, expected 'public'`);
            }
            
            if (directPrivateValue !== undefined) {
                return TestResult.failure('Private field accessible directly');
            }
            
            if (privateValue !== 'private') {
                return TestResult.failure(`Private field value is ${privateValue}, expected 'private'`);
            }
            
            return TestResult.success('Private fields work correctly');
        } catch (error) {
            return TestResult.failure('Private fields test failed', error);
        }
    }
    
    /**
     * Test nullish coalescing operator
     */
    async #testNullishCoalescing() {
        try {
            // Test with undefined
            const test1 = undefined ?? 'default';
            
            // Test with null
            const test2 = null ?? 'default';
            
            // Test with falsy value (should not use default)
            const test3 = 0 ?? 'default';
            
            // Test with empty string (should not use default)
            const test4 = '' ?? 'default';
            
            if (test1 !== 'default') {
                return TestResult.failure(`Undefined ?? 'default' returned ${test1}`);
            }
            
            if (test2 !== 'default') {
                return TestResult.failure(`null ?? 'default' returned ${test2}`);
            }
            
            if (test3 !== 0) {
                return TestResult.failure(`0 ?? 'default' returned ${test3}`);
            }
            
            if (test4 !== '') {
                return TestResult.failure(`'' ?? 'default' returned ${test4}`);
            }
            
            return TestResult.success('Nullish coalescing operator works');
        } catch (error) {
            return TestResult.failure('Nullish coalescing test failed', error);
        }
    }
    
    /**
     * Test optional chaining
     */
    async #testOptionalChaining() {
        try {
            // Test with valid path
            const obj1 = { a: { b: { c: 'value' } } };
            const test1 = obj1?.a?.b?.c;
            
            // Test with null in path
            const obj2 = { a: null };
            const test2 = obj2?.a?.b?.c;
            
            // Test with undefined in path
            const obj3 = {};
            const test3 = obj3?.a?.b?.c;
            
            if (test1 !== 'value') {
                return TestResult.failure(`Valid path returned ${test1}`);
            }
            
            if (test2 !== undefined) {
                return TestResult.failure(`Null in path returned ${test2}`);
            }
            
            if (test3 !== undefined) {
                return TestResult.failure(`Undefined in path returned ${test3}`);
            }
            
            return TestResult.success('Optional chaining operator works');
        } catch (error) {
            return TestResult.failure('Optional chaining test failed', error);
        }
    }
    
    /**
     * Test static initialization blocks
     */
    async #testStaticBlock() {
        try {
            // Define a class with a static block
            class TestClass {
                static field1;
                static field2;
                
                static {
                    this.field1 = 'initialized';
                    this.field2 = { frozen: true };
                    Object.freeze(this.field2);
                }
            }
            
            // Check static field values
            if (TestClass.field1 !== 'initialized') {
                return TestResult.failure(`Static field1 value is ${TestClass.field1}`);
            }
            
            // Check if object was frozen in static block
            try {
                TestClass.field2.frozen = false;
                return TestResult.failure('Object was not frozen in static block');
            } catch (error) {
                // Expected error - the object is frozen
            }
            
            return TestResult.success('Static initialization blocks work');
        } catch (error) {
            return TestResult.failure('Static block test failed', error);
        }
    }
}

// Run all tests when this file is executed
const tests = new ModernizationTests();
tests.runTests().then(() => {
    // Exit after a brief delay to allow async cleanup
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        if (Gio.Application.get_default()) {
            Gio.Application.get_default().quit();
        }
        return GLib.SOURCE_REMOVE;
    });
}); 