'use strict';

/**
 * Assert that two values are equal
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} [message] - Optional message
 */
export function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

/**
 * Assert that a value is true
 * @param {*} value - Value to check
 * @param {string} [message] - Optional message
 */
export function assertTrue(value, message) {
    if (!value) {
        throw new Error(message || `Expected value to be true, got ${value}`);
    }
}

/**
 * Assert that a value is false
 * @param {*} value - Value to check
 * @param {string} [message] - Optional message
 */
export function assertFalse(value, message) {
    if (value) {
        throw new Error(message || `Expected value to be false, got ${value}`);
    }
}

/**
 * Assert that two values are not equal
 * @param {*} actual - Actual value
 * @param {*} expected - Value to compare against
 * @param {string} [message] - Optional message
 */
export function assertNotEquals(actual, expected, message) {
    if (actual === expected) {
        throw new Error(message || `Expected ${actual} to be different from ${expected}`);
    }
}

/**
 * Assert that a value is null
 * @param {*} value - Value to check
 * @param {string} [message] - Optional message
 */
export function assertNull(value, message) {
    if (value !== null) {
        throw new Error(message || `Expected null, got ${value}`);
    }
}

/**
 * Assert that a value is not null
 * @param {*} value - Value to check
 * @param {string} [message] - Optional message
 */
export function assertNotNull(value, message) {
    if (value === null) {
        throw new Error(message || 'Expected value to not be null');
    }
}

/**
 * Assert that a value is undefined
 * @param {*} value - Value to check
 * @param {string} [message] - Optional message
 */
export function assertUndefined(value, message) {
    if (value !== undefined) {
        throw new Error(message || `Expected undefined, got ${value}`);
    }
}

/**
 * Assert that a value is not undefined
 * @param {*} value - Value to check
 * @param {string} [message] - Optional message
 */
export function assertDefined(value, message) {
    if (value === undefined) {
        throw new Error(message || 'Expected value to be defined');
    }
}

/**
 * Assert that a function throws an error
 * @param {Function} fn - Function to call
 * @param {string|RegExp} [expected] - Expected error message or pattern
 * @param {string} [message] - Optional message
 */
export function assertThrows(fn, expected, message) {
    try {
        fn();
        throw new Error(message || 'Expected function to throw an error');
    } catch (error) {
        if (expected instanceof RegExp) {
            if (!expected.test(error.message)) {
                throw new Error(message || `Expected error message to match ${expected}, got "${error.message}"`);
            }
        } else if (typeof expected === 'string') {
            if (error.message !== expected) {
                throw new Error(message || `Expected error message "${expected}", got "${error.message}"`);
            }
        }
    }
}

/**
 * Assert that a function does not throw an error
 * @param {Function} fn - Function to call
 * @param {string} [message] - Optional message
 */
export function assertDoesNotThrow(fn, message) {
    try {
        fn();
    } catch (error) {
        throw new Error(message || `Expected function not to throw, but it threw: ${error.message}`);
    }
}

/**
 * Assert that a value is an instance of a class
 * @param {*} value - Value to check
 * @param {Function} type - Constructor to check against
 * @param {string} [message] - Optional message
 */
export function assertInstanceOf(value, type, message) {
    if (!(value instanceof type)) {
        throw new Error(message || `Expected value to be an instance of ${type.name}`);
    }
}

/**
 * Assert that two arrays have the same elements
 * @param {Array} actual - Actual array
 * @param {Array} expected - Expected array
 * @param {string} [message] - Optional message
 */
export function assertArrayEquals(actual, expected, message) {
    if (!Array.isArray(actual)) {
        throw new Error(message || 'Actual value is not an array');
    }
    
    if (!Array.isArray(expected)) {
        throw new Error(message || 'Expected value is not an array');
    }
    
    if (actual.length !== expected.length) {
        throw new Error(message || `Array lengths differ: expected ${expected.length}, got ${actual.length}`);
    }
    
    for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) {
            throw new Error(message || `Arrays differ at index ${i}: expected ${expected[i]}, got ${actual[i]}`);
        }
    }
} 