// Integration Tests for OLED Shield Extension in GNOME 48 on X11 environment
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as TestUtils from '../../../../testUtils.js';

// Mock the GNOME Shell environment components
const MockMain = {
    layoutManager: {
        monitors: [],
        addChrome: () => {},
        removeChrome: () => {},
        uiGroup: {
            get_stage: () => ({
                connect: () => 1
            })
        },
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

// Mock window workspace manager
globalThis.global = {
    workspace_manager: {
        get_active_workspace: () => ({
            list_windows: () => ([
                { is_fullscreen: () => false }, // Default no fullscreen windows
            ])
        })
    },
    get_current_time: () => 0
};

const MockMeta = {
    MonitorManager: {
        get: () => ({
            get_monitor_config: () => true,
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

// The St mock for widgets
const MockSt = {
    Widget: class Widget {
        constructor(props) {
            Object.assign(this, props);
        }
    }
};

// The Clutter mock for actors
const MockClutter = {
    Actor: class Actor {
        constructor(props) {
            Object.assign(this, props);
            this._x = 0;
            this._y = 0;
            this._scale_x = 1;
            this._scale_y = 1;
        }
        
        // Add getter/setter for x, y, scale_x, scale_y
        get x() { return this._x; }
        set x(val) { this._x = val; }
        get y() { return this._y; }
        set y(val) { this._y = val; }
        get scale_x() { return this._scale_x; }
        set scale_x(val) { this._scale_x = val; }
        get scale_y() { return this._scale_y; }
        set scale_y(val) { this._scale_y = val; }
        
        get_position() {
            return [this._x, this._y];
        }
        
        set_position(x, y) {
            this._x = x;
            this._y = y;
        }
        
        get_scale() {
            return [this._scale_x, this._scale_y];
        }
        
        set_scale(x, y) {
            this._scale_x = x;
            this._scale_y = y;
        }
    }
};

// Combined settings schema for all modules
const settingsSchema = {
    // Pixel Refresh settings
    'pixel-refresh-enabled': { type: 'b', default: true },
    'pixel-refresh-schedule': { type: 'as', default: ['3:00'] },
    'pixel-refresh-running': { type: 'b', default: false },
    'pixel-refresh-progress': { type: 'i', default: 0 },
    'pixel-refresh-time-remaining': { type: 'i', default: 0 },
    'pixel-refresh-next-run': { type: 's', default: '' },
    'pixel-refresh-manual-trigger': { type: 'b', default: false },
    'pixel-refresh-speed': { type: 'i', default: 3 },
    'pixel-refresh-smart': { type: 'b', default: true },
    'pixel-refresh-style': { type: 's', default: 'horizontal' },
    
    // Pixel Shift settings
    'pixel-shift-enabled': { type: 'b', default: true },
    'pixel-shift-interval': { type: 'i', default: 60 },
    'pixel-shift-distance': { type: 'i', default: 2 },
    'pixel-shift-pattern': { type: 's', default: 'random' },
    
    // Dimming settings
    'dimming-enabled': { type: 'b', default: true },
    'dimming-brightness': { type: 'i', default: 30 },
    'dimming-idle-time': { type: 'i', default: 60 },
    'dimming-when-idle': { type: 'b', default: true },
    'dimming-when-locked': { type: 'b', default: true },
    'dimming-when-overview': { type: 'b', default: false },
    
    // Display Manager settings
    'enabled-displays': { type: 'as', default: [] },
    
    // General settings
    'debug-mode': { type: 'b', default: true }
};

describe('OLED Shield Integration Tests (GNOME 48, X11)', () => {
    let PixelRefresh, PixelShift, Dimming, DisplayManager;
    let settings;
    let pixelRefresh, pixelShift, dimming, displayManager;
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
        // Import the real modules
        DisplayManager = (await import('../../../../lib/displayManager.js')).DisplayManager;
        PixelRefresh = (await import('../../../../lib/pixelRefresh.js')).PixelRefresh;
        PixelShift = (await import('../../../../lib/pixelShift.js')).PixelShift;
        Dimming = (await import('../../../../lib/dimming.js')).Dimming;
        
        // Set up our mocks
        globalThis.Meta = MockMeta;
        globalThis.Main = MockMain;
        globalThis.St = MockSt;
        globalThis.Clutter = MockClutter;
        
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
        
        // Create all component instances in the correct order
        displayManager = new DisplayManager(settings);
        pixelRefresh = new PixelRefresh(settings);
        pixelShift = new PixelShift(settings);
        dimming = new Dimming(settings);
    });
    
    afterEach(() => {
        // Destroy all components in reverse order
        if (dimming) {
            dimming.destroy();
            dimming = null;
        }
        
        if (pixelShift) {
            pixelShift.destroy();
            pixelShift = null;
        }
        
        if (pixelRefresh) {
            pixelRefresh.destroy();
            pixelRefresh = null;
        }
        
        if (displayManager) {
            displayManager.destroy();
            displayManager = null;
        }
    });
    
    describe('Initialization', () => {
        it('should initialize all components correctly', () => {
            assert.ok(displayManager, 'DisplayManager should be created');
            assert.ok(pixelRefresh, 'PixelRefresh should be created');
            assert.ok(pixelShift, 'PixelShift should be created');
            assert.ok(dimming, 'Dimming should be created');
        });
        
        it('should respect global enabled settings', () => {
            // Disable all components
            settings.set_boolean('pixel-refresh-enabled', false);
            settings.set_boolean('pixel-shift-enabled', false);
            settings.set_boolean('dimming-enabled', false);
            
            // Create new instances
            const newPixelRefresh = new PixelRefresh(settings);
            const newPixelShift = new PixelShift(settings);
            const newDimming = new Dimming(settings);
            
            // Verify they're in a disabled state
            assert.equal(newPixelRefresh._isEnabled, false, 'PixelRefresh should be disabled');
            assert.equal(newPixelShift._isEnabled, false, 'PixelShift should be disabled');
            assert.equal(newDimming._isEnabled, false, 'Dimming should be disabled');
            
            // Cleanup
            newPixelRefresh.destroy();
            newPixelShift.destroy();
            newDimming.destroy();
        });
    });
    
    describe('Integration Scenarios', () => {
        it('should handle screen locking correctly', () => {
            // Enable dimming when locked
            settings.set_boolean('dimming-when-locked', true);
            
            // Simulate screen lock
            MockMain.screenShield.locked = true;
            dimming._onLockScreenShown();
            
            // Dimming should be active
            assert.equal(dimming._isDimmed, true, 'Screen should be dimmed when locked');
            
            // Simulate unlock
            MockMain.screenShield.locked = false;
            dimming._onLockScreenHidden();
            
            // Dimming should be inactive
            assert.equal(dimming._isDimmed, false, 'Screen should not be dimmed when unlocked');
        });
        
        it('should not run pixel refresh during active usage', () => {
            // Setup smart refresh
            settings.set_boolean('pixel-refresh-smart', true);
            
            // Simulate active user (not idle)
            Meta.IdleMonitor.get_core = () => ({
                get_idletime: () => 30000 // Only 30 seconds idle
            });
            
            // Attempt to refresh
            assert.equal(pixelRefresh._shouldRunRefresh(), false, 
                'Refresh should not run during active usage');
        });
        
        it('should handle manual pixel refresh trigger', () => {
            // Disable smart conditions to ensure it runs
            settings.set_boolean('pixel-refresh-smart', false);
            
            // Trigger a manual refresh
            pixelRefresh.runManualRefresh();
            
            // Should be running and manually triggered
            assert.equal(settings.get_boolean('pixel-refresh-running'), true, 
                'Refresh should be marked as running');
            assert.equal(settings.get_boolean('pixel-refresh-manual-trigger'), true, 
                'Should be marked as manually triggered');
            
            // Progress should start at 0
            assert.equal(settings.get_int('pixel-refresh-progress'), 0, 
                'Progress should start at 0');
        });
        
        it('should handle pixel shifting while dimmed', () => {
            // Enable dimming
            settings.set_boolean('dimming-enabled', true);
            
            // Dim the screen
            dimming._dimScreen();
            assert.equal(dimming._isDimmed, true, 'Screen should be dimmed');
            
            // Perform a pixel shift
            pixelShift._shiftDisplays();
            
            // Both dimming and pixel shift should be active
            assert.equal(dimming._isDimmed, true, 'Screen should remain dimmed after pixel shift');
            assert.ok(pixelShift._shiftPattern >= 0, 'Pixel shift pattern should be active');
        });
        
        it('should handle display selection', () => {
            // Create a clean set of monitors
            const monitors = createMockMonitors(3);
            
            // Select only two of them
            const enabledDisplays = [
                displayManager._getMonitorId(monitors[0]),
                displayManager._getMonitorId(monitors[2])
            ];
            settings.set_strv('enabled-displays', enabledDisplays);
            
            // Check enabled status
            assert.equal(displayManager._isDisplayEnabled(monitors[0]), true, 
                'First monitor should be enabled');
            assert.equal(displayManager._isDisplayEnabled(monitors[1]), false, 
                'Second monitor should be disabled');
            assert.equal(displayManager._isDisplayEnabled(monitors[2]), true, 
                'Third monitor should be enabled');
        });
    });
    
    describe('Resource Management', () => {
        it('should clean up all resources when destroyed', () => {
            // First, ensure we have some active state
            dimming._dimScreen();
            assert.equal(dimming._isDimmed, true, 'Screen should be dimmed');
            
            // Destroy all components
            dimming.destroy();
            pixelShift.destroy();
            pixelRefresh.destroy();
            displayManager.destroy();
            
            // All timeouts should be cleaned up
            assert.equal(timeoutIds.length, 0, 'All timeouts should be removed');
        });
        
        it('should handle settings changes in all components', () => {
            // Change interval for pixel shifting
            settings.set_int('pixel-shift-interval', 30);
            
            // Create new instances that should pick up the new setting
            const newPixelShift = new PixelShift(settings);
            
            // Test that it was applied (we can't directly test the interval)
            assert.ok(newPixelShift._shiftIntervalMinutes === 30, 
                'New interval should be applied');
            
            newPixelShift.destroy();
        });
    });
}); 