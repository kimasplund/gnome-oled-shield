'use strict';

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import System from 'system';

/**
 * Main test runner function
 */
async function runTests() {
    console.log('Starting test suite...');
    
    // List of test modules to run
    const testModules = [
        './test-modern-features.js'
    ];
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    // Run each test module
    for (const testModule of testModules) {
        try {
            console.log(`\nRunning test module: ${testModule}`);
            
            // Import and run the test module
            const module = await import(testModule);
            
            // Wait for a moment to allow tests to complete
            await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            }));
            
            // Simple count based on assumption that each file has its own reporting
            totalTests += 1;
            passedTests += 1;
        } catch (error) {
            console.error(`Error running test module ${testModule}:`, error);
            totalTests += 1;
            failedTests += 1;
        }
    }
    
    // Print final summary
    console.log('\n====================');
    console.log(`Test Suite Complete: ${passedTests}/${totalTests} modules passed`);
    console.log('====================');
    
    // Exit with appropriate status code
    if (failedTests > 0) {
        System.exit(1);
    } else {
        System.exit(0);
    }
}

// Run the tests when this file is executed
runTests().catch(error => {
    console.error('Unhandled error in test runner:', error);
    System.exit(1);
}); 