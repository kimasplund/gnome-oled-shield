'use strict';

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import System from 'system';

// Import error related classes to test
import { ExtensionError, errorRegistry } from '../lib/errors.js';

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
 * Simplified test suite for ES2021+ features
 */
class ModernFeaturesTest {
    #results = [];
    
    /**
     * Run all tests
     */
    async runTests() {
        // Reset results
        this.#results = [];
        
        // Run each test
        await this.#runSingleTest('Private Fields', this.#testPrivateFields);
        await this.#runSingleTest('Nullish Coalescing', this.#testNullishCoalescing);
        await this.#runSingleTest('Optional Chaining', this.#testOptionalChaining);
        await this.#runSingleTest('Static Block', this.#testStaticBlock);
        await this.#runSingleTest('Error Chaining', this.#testErrorChain);
        
        // Print summary
        this.#printSummary();
        
        // Return success if all tests passed
        return this.#results.every(r => r.result.passed);
    }
    
    /**
     * Run a single test and record result
     */
    async #runSingleTest(name, testFn) {
        console.log(`Running test: ${name}`);
        
        try {
            const result = await testFn.call(this);
            this.#results.push({ name, result });
            console.log(`${result.passed ? '✓' : '✗'} ${name}: ${result.message}`);
        } catch (error) {
            const result = TestResult.failure('Test threw an exception', error);
            this.#results.push({ name, result });
            console.error(`✗ ${name}: ${error.message}`);
            if (error.stack) {
                console.error(error.stack);
            }
        }
    }
    
    /**
     * Print test summary
     */
    #printSummary() {
        const totalTests = this.#results.length;
        const passedTests = this.#results.filter(r => r.result.passed).length;
        console.log(`\nTest Summary: ${passedTests}/${totalTests} tests passed`);
    }
    
    /**
     * Test private fields
     */
    async #testPrivateFields() {
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
}

// Run the tests and exit appropriately
const tests = new ModernFeaturesTest();
tests.runTests().then(success => {
    // Exit after a brief delay to allow async cleanup
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        System.exit(success ? 0 : 1);
        return GLib.SOURCE_REMOVE;
    });
}).catch(error => {
    console.error('Unhandled error in test runner:', error);
    System.exit(1);
}); 