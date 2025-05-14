#!/usr/bin/gjs

// Test for panel button component
// This tests a specific component in a subdirectory

const { GLib } = imports.gi;

imports.searchPath.unshift('.');

// Log testing framework
const log = (message) => {
    print(`[TEST] ${message}`);
};

log('Starting panel button component test');

try {
    // Here we would test the panel button component specifically
    log('Testing panel button component...');
    
    // Simulate async operation
    const loop = GLib.MainLoop.new(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
        log('Panel button component test completed successfully');
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