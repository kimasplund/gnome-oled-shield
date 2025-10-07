/**
 * Test utilities that work in both GJS and Node.js environments
 */

// Use conditional imports for compatibility
let GLib;
let isNodeEnvironment = false;

try {
    // Check if running in Node.js
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        isNodeEnvironment = true;
        // In Node.js, use the mock implementation
        GLib = global.gi.GLib;
    } else {
        // In GJS, use the real implementation
        GLib = imports.gi.GLib;
    }
} catch (error) {
    console.error('Error loading GLib:', error);
}

/**
 * Run tests in the current environment
 */
async function runTests() {
    console.log(`Running utility tests in ${isNodeEnvironment ? 'Node.js' : 'GJS'} environment`);
    
    // Test results
    const results = {
        total: 0,
        passed: 0,
        failed: 0
    };
    
    // Simple test function
    function test(name, testFn) {
        results.total++;
        try {
            console.log(`Running test: ${name}`);
            const result = testFn();
            console.log(`✓ ${name}`);
            results.passed++;
            return true;
        } catch (error) {
            console.error(`✗ ${name}: ${error.message}`);
            results.failed++;
            return false;
        }
    }
    
    // Run tests that work in both environments
    test('Basic test', () => {
        // This should work in both environments
        const a = 1;
        const b = 2;
        if (a + b !== 3) throw new Error('1 + 2 should equal 3');
        return true;
    });
    
    // Test environment-specific features
    if (!isNodeEnvironment) {
        // These tests only run in GJS
        test('GLib.timeout_add', () => {
            // This is a simple check that doesn't actually test functionality
            if (typeof GLib.timeout_add !== 'function') 
                throw new Error('GLib.timeout_add should be a function');
            return true;
        });
    }
    
    // Print summary
    console.log(`\nResults: ${results.passed}/${results.total} tests passed`);
    
    // Return success if all tests passed
    return results.failed === 0;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runTests };
}

// Run directly in GJS
if (typeof window === 'undefined' && typeof imports !== 'undefined' && typeof module === 'undefined') {
    runTests().catch(console.error);
}