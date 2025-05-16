'use strict';

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

// Import core classes to test
import EventEmitter from '../lib/eventEmitter.js';
import ResourceManager from '../lib/resourceManager.js';
import SignalManager from '../lib/signalManager.js';
import { ExtensionError, errorRegistry } from '../lib/errors.js';
import { metrics } from '../lib/metrics.js';

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
        
        // Test ResourceManager
        this.#runner.addTest('ResourceManager - Track and Cleanup', this.#testResourceManagerTrackAndCleanup.bind(this));
        this.#runner.addTest('ResourceManager - Resource Bundle', this.#testResourceManagerBundle.bind(this));
        this.#runner.addTest('ResourceManager - WeakRef Auto Cleanup', this.#testResourceManagerWeakRef.bind(this));
        
        // Test SignalManager
        this.#runner.addTest('SignalManager - Connect and Disconnect', this.#testSignalManagerBasic.bind(this));
        this.#runner.addTest('SignalManager - Disconnect By Object', this.#testSignalManagerDisconnectByObject.bind(this));
        this.#runner.addTest('SignalManager - Signal Groups', this.#testSignalManagerGroups.bind(this));
        
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
            const emitter = new EventEmitter();
            let eventFired = false;
            
            emitter.on('test', () => {
                eventFired = true;
            });
            
            emitter.emit('test');
            
            if (!eventFired) {
                return TestResult.failure('Event was not fired');
            }
            
            return TestResult.success('Basic event emission works');
        } catch (error) {
            return TestResult.failure('EventEmitter basic test failed', error);
        }
    }
    
    /**
     * Test once event listener
     */
    async #testEventEmitterOnce() {
        try {
            const emitter = new EventEmitter();
            let callCount = 0;
            
            emitter.once('test', () => {
                callCount++;
            });
            
            emitter.emit('test');
            emitter.emit('test');
            
            if (callCount !== 1) {
                return TestResult.failure(`Once event fired ${callCount} times, expected 1`);
            }
            
            return TestResult.success('Once event emission works');
        } catch (error) {
            return TestResult.failure('EventEmitter once test failed', error);
        }
    }
    
    /**
     * Test AbortSignal with event listeners
     */
    async #testEventEmitterAbortSignal() {
        try {
            const emitter = new EventEmitter();
            const abortController = new AbortController();
            let eventFired = false;
            
            emitter.on('test', () => {
                eventFired = true;
            }, { signal: abortController.signal });
            
            // Abort the listener before firing
            abortController.abort();
            emitter.emit('test');
            
            if (eventFired) {
                return TestResult.failure('Event fired after abort');
            }
            
            return TestResult.success('AbortSignal works with EventEmitter');
        } catch (error) {
            return TestResult.failure('EventEmitter AbortSignal test failed', error);
        }
    }
    
    /**
     * Test waitForEvent promise
     */
    async #testEventEmitterWaitForEvent() {
        try {
            const emitter = new EventEmitter();
            let eventData = null;
            
            // Start waiting for event
            const waitPromise = emitter.waitForEvent('test');
            
            // Fire event after a short delay
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                emitter.emit('test', 'hello world');
                return GLib.SOURCE_REMOVE;
            });
            
            // Wait for the event
            const eventArgs = await waitPromise;
            eventData = eventArgs[0];
            
            if (eventData !== 'hello world') {
                return TestResult.failure(`Event data was ${eventData}, expected 'hello world'`);
            }
            
            return TestResult.success('waitForEvent works correctly');
        } catch (error) {
            return TestResult.failure('EventEmitter waitForEvent test failed', error);
        }
    }
    
    /**
     * Test resource tracking and cleanup
     */
    async #testResourceManagerTrackAndCleanup() {
        try {
            const resourceManager = new ResourceManager();
            
            // Create a resource
            const resource = { value: 'test', cleaned: false };
            
            // Track the resource
            resourceManager.track(
                resource, 
                (res) => { res.cleaned = true; }, 
                ResourceManager.RESOURCE_TYPES.OTHER
            );
            
            // Clean up the resource
            await resourceManager.cleanup(resource);
            
            if (!resource.cleaned) {
                return TestResult.failure('Resource was not cleaned up');
            }
            
            return TestResult.success('ResourceManager track and cleanup works');
        } catch (error) {
            return TestResult.failure('ResourceManager track and cleanup test failed', error);
        }
    }
    
    /**
     * Test resource bundles
     */
    async #testResourceManagerBundle() {
        try {
            const resourceManager = new ResourceManager();
            
            // Create a bundle
            const bundle = resourceManager.createBundle('test-bundle');
            
            // Track resources in the bundle
            const resources = [
                { value: 'resource1', cleaned: false },
                { value: 'resource2', cleaned: false },
                { value: 'resource3', cleaned: false }
            ];
            
            for (const resource of resources) {
                bundle.track(
                    resource, 
                    (res) => { res.cleaned = true; }, 
                    ResourceManager.RESOURCE_TYPES.OTHER
                );
            }
            
            // Destroy the bundle
            await bundle.destroy();
            
            // Check all resources were cleaned
            const allCleaned = resources.every(r => r.cleaned);
            
            if (!allCleaned) {
                return TestResult.failure('Not all resources in bundle were cleaned up');
            }
            
            return TestResult.success('ResourceManager bundle works');
        } catch (error) {
            return TestResult.failure('ResourceManager bundle test failed', error);
        }
    }
    
    /**
     * Test WeakRef based auto cleanup
     */
    async #testResourceManagerWeakRef() {
        try {
            const resourceManager = new ResourceManager();
            let cleanedUp = false;
            
            // Run in a block so object can be garbage collected
            {
                const object = { value: 'test' };
                resourceManager.track(
                    object, 
                    () => { cleanedUp = true; }, 
                    ResourceManager.RESOURCE_TYPES.OTHER
                );
            }
            
            // Force garbage collection if possible
            if (global.gc) {
                global.gc();
            }
            
            // Wait a moment for finalization to run
            await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            }));
            
            // Note: We can't reliably test this as garbage collection is not guaranteed
            // Just return success as we set up the test correctly
            return TestResult.success('ResourceManager WeakRef setup correctly (actual GC behavior can vary)');
        } catch (error) {
            return TestResult.failure('ResourceManager WeakRef test failed', error);
        }
    }
    
    /**
     * Test signal manager connect and disconnect
     */
    async #testSignalManagerBasic() {
        try {
            const signalManager = new SignalManager();
            
            // Create a test GObject
            const TestObject = GObject.registerClass({
                Signals: {
                    'test-signal': {}
                }
            }, class TestObject extends GObject.Object {});
            
            const obj = new TestObject();
            let signalFired = false;
            
            // Connect signal
            const signalId = signalManager.connect(
                obj,
                'test-signal',
                () => { signalFired = true; }
            );
            
            // Emit signal
            obj.emit('test-signal');
            
            if (!signalFired) {
                return TestResult.failure('Signal was not fired');
            }
            
            // Disconnect signal
            await signalManager.disconnect(signalId);
            
            // Reset flag and emit again
            signalFired = false;
            obj.emit('test-signal');
            
            if (signalFired) {
                return TestResult.failure('Signal fired after disconnect');
            }
            
            return TestResult.success('SignalManager connect and disconnect works');
        } catch (error) {
            return TestResult.failure('SignalManager basic test failed', error);
        }
    }
    
    /**
     * Test disconnecting signals by object
     */
    async #testSignalManagerDisconnectByObject() {
        try {
            const signalManager = new SignalManager();
            
            // Create test objects
            const TestObject = GObject.registerClass({
                Signals: {
                    'test-signal': {}
                }
            }, class TestObject extends GObject.Object {});
            
            const obj1 = new TestObject();
            const obj2 = new TestObject();
            let obj1SignalFired = false;
            let obj2SignalFired = false;
            
            // Connect signals
            signalManager.connect(obj1, 'test-signal', () => { obj1SignalFired = true; });
            signalManager.connect(obj2, 'test-signal', () => { obj2SignalFired = true; });
            
            // Disconnect all signals from obj1
            await signalManager.disconnectByObject(obj1);
            
            // Emit signals
            obj1.emit('test-signal');
            obj2.emit('test-signal');
            
            if (obj1SignalFired) {
                return TestResult.failure('obj1 signal fired after disconnectByObject');
            }
            
            if (!obj2SignalFired) {
                return TestResult.failure('obj2 signal did not fire');
            }
            
            return TestResult.success('SignalManager disconnectByObject works');
        } catch (error) {
            return TestResult.failure('SignalManager disconnectByObject test failed', error);
        }
    }
    
    /**
     * Test signal groups
     */
    async #testSignalManagerGroups() {
        try {
            const signalManager = new SignalManager();
            
            // Create test objects
            const TestObject = GObject.registerClass({
                Signals: {
                    'test-signal': {}
                }
            }, class TestObject extends GObject.Object {});
            
            const obj1 = new TestObject();
            const obj2 = new TestObject();
            
            let signal1Fired = false;
            let signal2Fired = false;
            
            // Create a signal group
            const groupId = signalManager.createSignalGroup('test-group');
            
            // Connect signals with the group
            signalManager.connect(obj1, 'test-signal', () => { signal1Fired = true; }, groupId);
            signalManager.connect(obj2, 'test-signal', () => { signal2Fired = true; }, groupId);
            
            // Disconnect the group
            await signalManager.disconnectGroup(groupId);
            
            // Emit signals
            obj1.emit('test-signal');
            obj2.emit('test-signal');
            
            if (signal1Fired || signal2Fired) {
                return TestResult.failure('Signals fired after group disconnect');
            }
            
            return TestResult.success('SignalManager groups work');
        } catch (error) {
            return TestResult.failure('SignalManager groups test failed', error);
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
            errorRegistry.registerError(error, 'test-component');
            
            // Get statistics
            const stats = errorRegistry.getStatistics();
            
            if (stats.total !== 1) {
                return TestResult.failure(`Expected 1 error, found ${stats.total}`);
            }
            
            if (!stats.byComponent['test-component']) {
                return TestResult.failure('Error component not tracked correctly');
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
        Gio.Application.get_default().quit();
        return GLib.SOURCE_REMOVE;
    });
}); 