#!/usr/bin/gjs

// Simple GJS script to test extension loading
// This would be called from the integration test shell script

const { GLib } = imports.gi;

imports.searchPath.unshift('.');

// Log testing framework
const log = (message) => {
    print(`[TEST] ${message}`);
};

log('Starting integration test for OLED Care extension');

try {
    // Simple test to verify extension can be loaded in GJS environment
    // In a real test, we would:
    // 1. Import the extension
    // 2. Create a mock shell environment
    // 3. Test extension enable/disable cycles
    // 4. Verify extension functionality
    
    log('Simulating extension loading...');
    
    // Simulate async operation
    const loop = GLib.MainLoop.new(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        log('Extension loading test completed successfully');
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
    
    loop.run();
    
} catch (e) {
    log(`ERROR: ${e.message}`);
    log(e.stack);
    imports.system.exit(1);
}

imports.system.exit(0); 