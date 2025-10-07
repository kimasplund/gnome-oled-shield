/**
 * Node.js test runner for GNOME Shell extension tests
 * This runner uses the mock GJS environment to run tests in Node.js
 */

// Setup the mock environment
require('./unit/node-mocks/loader.js').setup();

// Override imports for GJS modules
global.gi = {
    GLib: require('./unit/node-mocks/gi.js').resolveGiImport('GLib'),
    Gio: require('./unit/node-mocks/gi.js').resolveGiImport('Gio'),
    GObject: require('./unit/node-mocks/gi.js').resolveGiImport('GObject')
};

/**
 * Simple test runner
 */
async function runTests() {
    console.log('Starting Node.js test runner for GNOME Shell extension...');
    
    // List of test modules to run (these should be compatible with the mock environment)
    const testModules = [
        // Add test modules that have been adapted to work with the mock environment
        './unit/lib/test-utils-node.js'
    ];
    
    // Results tracking
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    
    // Run each test module
    for (const module of testModules) {
        try {
            console.log(`\nRunning test module: ${module}`);
            
            // Import and run the test
            const test = require(module);
            if (typeof test.runTests === 'function') {
                const result = await test.runTests();
                if (result) {
                    passed++;
                } else {
                    failed++;
                }
            } else {
                console.warn(`No runTests function in module: ${module}`);
                skipped++;
            }
        } catch (error) {
            console.error(`Error in test module ${module}:`, error);
            failed++;
        }
    }
    
    // Print results
    console.log('\n===============================');
    console.log(`Test Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log('===============================');
    
    // Return exit code
    return failed === 0 ? 0 : 1;
}

// Run tests
runTests().then(code => {
    // In Node.js environment we can actually exit
    process.exit(code);
}).catch(error => {
    console.error('Unhandled error in test runner:', error);
    process.exit(1);
});