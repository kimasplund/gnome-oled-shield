// Tests for Dimming in GNOME 47 on Wayland environment
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import * as TestUtils from '../../../../testUtils.js';

// Mock the GNOME Shell environment components
const MockMain = {
    layoutManager: {
        monitors: [],
        _startingUp: true
    },
    overview: {
        visible: false,
        connect: () => 1,
        disconnect: () => {}
    },
    sessionMode: {
        isLocked: false,
        connect: () => 1,
        disconnect: () => {}
    },
    screenShield: {
        locked: false,
        connect: () => 1,
        disconnect: () => {}
    }
};

const MockMeta = {
    MonitorManager: {
        get: () => ({
            connect: () => 1,
            disconnect: () => {}
        })
    },
    IdleMonitor: {
        get_core: () => ({
            get_idletime: () => 600000, // 10 minutes idle by default
            add_idle_watch: () => 1,
            add_user_active_watch: () => 2,
            remove_watch: () => {}
        })
    }
};

// The GSettings mock schema for dimming
const settingsSchema = {
    'dimming-enabled': { type: 'b', default: true },
    'dimming-brightness': { type: 'i', default: 30 },
    'dimming-idle-time': { type: 'i', default: 60 },
    'dimming-when-idle': { type: 'b', default: true },
    'dimming-when-locked': { type: 'b', default: true },
    'dimming-when-overview': { type: 'b', default: false },
    'debug-mode': { type: 'b', default: true }
};

describe('Dimming Tests (GNOME 47, Wayland)', () => {
    let Dimming;
    let settings;
    let dimming;
    let mockMonitors;
    let timeoutIds = [];
    
    // Mock GLib timeout functions
    const origTimeoutAdd = GLib.timeout_add;
    const mockTimeoutAdd = (priority, interval, callback) => {
        const id = Math.floor(Math.random() * 10000) + 1;
        timeoutIds.push(id);
        
        // Immediately execute the callback once to simulate time passing
        try {
            callback();
        } catch (e) {
            console.error('Error in timeout callback:', e);
        }
        
        return id;
    };
    
    const origSourceRemove = GLib.source_remove;
    const mockSourceRemove = (id) => {
        const index = timeoutIds.indexOf(id);
        if (index !== -1) {
            timeoutIds.splice(index, 1);
            return true;
        }
        return false;
    };
    
    // Utility function to create mock monitors
    function createMockMonitors(count = 2) {
        const monitors = [];
        for (let i = 0; i < count; i++) {
            monitors.push({
                index: i,
                manufacturer: `Manufacturer${i}`,
                model: `Model${i}`,
                width: 1920,
                height: 1080,
                scale_factor: 1,
                x: 0,
                y: i * 1080
            });
        }
        MockMain.layoutManager.monitors = monitors;
        return monitors;
    }
    
    before(async () => {
        // Import the real Dimming module
        Dimming = (await import('../../../../lib/dimming.js')).Dimming;
        
        // Set up our mocks
        globalThis.Meta = MockMeta;
        globalThis.Main = MockMain;
        
        // Mock GLib timeout functions
        GLib.timeout_add = mockTimeoutAdd;
        GLib.source_remove = mockSourceRemove;
    });
    
    after(() => {
        // Restore original functions
        GLib.timeout_add = origTimeoutAdd;
        GLib.source_remove = origSourceRemove;
    });
    
    beforeEach(() => {
        // Reset the monitors and timeouts
        mockMonitors = createMockMonitors();
        timeoutIds = [];
        
        // Create mock settings
        settings = TestUtils.createMockSettings(settingsSchema);
        
        // Create the Dimming instance
        dimming = new Dimming(settings);
    });
    
    afterEach(() => {
        if (dimming) {
            dimming.destroy();
            dimming = null;
        }
    });
    
    describe('Initialization', () => {
        it('should initialize correctly', () => {
            assert.ok(dimming, 'Dimming should be created');
        });
        
        it('should respect the enabled setting', () => {
            settings.set_boolean('dimming-enabled', false);
            const newDimming = new Dimming(settings);
            
            // Should not be creating idle watchers when disabled
            assert.equal(newDimming._idleWatchId, 0, 'No idle watch should be created when disabled');
            
            newDimming.destroy();
        });
        
        it('should connect to relevant signals', () => {
            // We should have connected to overview showing/hiding signals
            assert.ok(dimming._overviewShowingId > 0, 'Should connect to overview showing signal');
            assert.ok(dimming._overviewHidingId > 0, 'Should connect to overview hiding signal');
            
            // We should have connected to lock/unlock signals
            assert.ok(dimming._lockScreenShownId > 0, 'Should connect to lock screen shown signal');
            assert.ok(dimming._lockScreenHiddenId > 0, 'Should connect to lock screen hidden signal');
        });
    });
    
    describe('Dimming Conditions', () => {
        it('should dim when screen is locked if setting enabled', () => {
            settings.set_boolean('dimming-when-locked', true);
            
            // Simulate screen lock
            MockMain.screenShield.locked = true;
            dimming._onLockScreenShown();
            
            assert.equal(dimming._isDimmed, true, 'Screen should be dimmed when locked');
        });
        
        it('should not dim when screen is locked if setting disabled', () => {
            settings.set_boolean('dimming-when-locked', false);
            
            // Simulate screen lock
            MockMain.screenShield.locked = true;
            dimming._onLockScreenShown();
            
            assert.equal(dimming._isDimmed, false, 'Screen should not be dimmed when locked if setting disabled');
        });
        
        it('should dim when overview is shown if setting enabled', () => {
            settings.set_boolean('dimming-when-overview', true);
            
            // Simulate overview shown
            MockMain.overview.visible = true;
            dimming._onOverviewShowing();
            
            assert.equal(dimming._isDimmed, true, 'Screen should be dimmed when overview shown');
        });
        
        it('should not dim when overview is shown if setting disabled', () => {
            settings.set_boolean('dimming-when-overview', false);
            
            // Simulate overview shown
            MockMain.overview.visible = true;
            dimming._onOverviewShowing();
            
            assert.equal(dimming._isDimmed, false, 'Screen should not be dimmed when overview shown if setting disabled');
        });
    });
    
    describe('Idle Monitoring', () => {
        it('should setup idle watching correctly', () => {
            // Simulate idle time setting of 30 seconds
            settings.set_int('dimming-idle-time', 30);
            
            dimming._setupIdleWatching();
            
            assert.ok(dimming._idleWatchId > 0, 'Should create idle watch');
            assert.ok(dimming._userActiveWatchId > 0, 'Should create user active watch');
        });
        
        it('should dim when system becomes idle if setting enabled', () => {
            settings.set_boolean('dimming-when-idle', true);
            
            // Simulate idle callback
            dimming._onUserIdle();
            
            assert.equal(dimming._isDimmed, true, 'Screen should be dimmed when idle');
        });
        
        it('should not dim when system becomes idle if setting disabled', () => {
            settings.set_boolean('dimming-when-idle', false);
            
            // Simulate idle callback
            dimming._onUserIdle();
            
            assert.equal(dimming._isDimmed, false, 'Screen should not be dimmed when idle if setting disabled');
        });
        
        it('should undim when user becomes active', () => {
            // First, simulate dimming due to idle
            settings.set_boolean('dimming-when-idle', true);
            dimming._onUserIdle();
            assert.equal(dimming._isDimmed, true, 'Screen should be dimmed when idle');
            
            // Now simulate user becoming active
            dimming._onUserActive();
            
            assert.equal(dimming._isDimmed, false, 'Screen should be undimmed when user becomes active');
        });
    });
    
    describe('Brightness Control', () => {
        it('should dim to the configured brightness level', () => {
            // Set a specific brightness level
            settings.set_int('dimming-brightness', 40);
            
            // Simulate dimming
            dimming._dimScreen();
            
            // Verify that the brightness level was used
            assert.equal(dimming._brightness, 40, 'Brightness should be set to configured level');
        });
        
        it('should use appropriate limits for brightness', () => {
            // Set an out-of-range brightness level
            settings.set_int('dimming-brightness', 150);
            
            // Simulate dimming
            dimming._dimScreen();
            
            // Should be limited to 100
            assert.equal(dimming._brightness, 100, 'Brightness should be limited to 100');
            
            // Set to a negative value
            settings.set_int('dimming-brightness', -10);
            
            // Simulate dimming
            dimming._dimScreen();
            
            // Should be limited to 0
            assert.equal(dimming._brightness, 0, 'Brightness should be limited to 0');
        });
    });
    
    describe('Cleanup and Destruction', () => {
        it('should clean up resources when destroyed', () => {
            // Set up a dimmed state
            dimming._dimScreen();
            assert.equal(dimming._isDimmed, true, 'Screen should be dimmed');
            
            // Destroy should clean up and reset state
            dimming.destroy();
            
            // Timeouts should be removed
            assert.equal(timeoutIds.length, 0, 'All timeouts should be removed on destroy');
            
            // Signal handlers should be disconnected (we can't really test this)
            assert.equal(dimming._overviewShowingId, 0, 'Signal handlers should be disconnected');
            assert.equal(dimming._overviewHidingId, 0, 'Signal handlers should be disconnected');
            assert.equal(dimming._lockScreenShownId, 0, 'Signal handlers should be disconnected');
            assert.equal(dimming._lockScreenHiddenId, 0, 'Signal handlers should be disconnected');
        });
    });
}); 