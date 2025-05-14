// Tests for PixelRefresh in GNOME 48 on Wayland environment
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as TestUtils from '../../../../testUtils.js';

// Mock the GNOME Shell environment components
const MockMain = {
    layoutManager: {
        monitors: [],
        addChrome: () => {},
        removeChrome: () => {},
        _startingUp: true
    },
    overview: {
        visible: false
    },
    sessionMode: {
        isLocked: false
    },
    screenShield: {
        locked: false
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
            get_idletime: () => 600000 // 10 minutes idle by default
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

// The GSettings mock schema for pixel refresh
const settingsSchema = {
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
    'debug-mode': { type: 'b', default: true }
};

describe('PixelRefresh Tests (GNOME 48, Wayland)', () => {
    let PixelRefresh;
    let settings;
    let pixelRefresh;
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
        // Import the real PixelRefresh module
        PixelRefresh = (await import('../../../../lib/pixelRefresh.js')).PixelRefresh;
        
        // Set up our mocks
        globalThis.Meta = MockMeta;
        globalThis.Main = MockMain;
        globalThis.St = MockSt;
        
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
        
        // Create the PixelRefresh instance
        pixelRefresh = new PixelRefresh(settings);
    });
    
    afterEach(() => {
        if (pixelRefresh) {
            pixelRefresh.destroy();
            pixelRefresh = null;
        }
    });
    
    describe('Initialization', () => {
        it('should initialize correctly', () => {
            assert.ok(pixelRefresh, 'PixelRefresh should be created');
        });
        
        it('should respect the enabled setting', () => {
            settings.set_boolean('pixel-refresh-enabled', false);
            const newPixelRefresh = new PixelRefresh(settings);
            
            // Should not be scheduling refreshes when disabled
            assert.equal(timeoutIds.length, 0, 'No timeouts should be scheduled when disabled');
            
            newPixelRefresh.destroy();
        });
        
        it('should validate the refresh schedule', () => {
            settings.set_strv('pixel-refresh-schedule', ['25:00', '3:00', 'invalid', '12:30']);
            const newPixelRefresh = new PixelRefresh(settings);
            
            // Should filter out invalid times
            const schedule = settings.get_strv('pixel-refresh-schedule');
            assert.deepEqual(schedule, ['3:00', '12:30'], 'Schedule should be cleaned of invalid times');
            
            newPixelRefresh.destroy();
        });
    });
    
    describe('Refresh Conditions', () => {
        it('should not run refresh when already running', () => {
            settings.set_boolean('pixel-refresh-running', true);
            
            assert.equal(pixelRefresh._shouldRunRefresh(), false, 
                'Refresh should not run when already in progress');
        });
        
        it('should not run refresh with fullscreen windows when smart is enabled', () => {
            // Mock the presence of a fullscreen window
            globalThis.global.workspace_manager.get_active_workspace = () => ({
                list_windows: () => ([
                    { is_fullscreen: () => true }
                ])
            });
            
            settings.set_boolean('pixel-refresh-smart', true);
            
            assert.equal(pixelRefresh._shouldRunRefresh(), false, 
                'Refresh should not run with fullscreen windows and smart enabled');
            
            // Reset the mock
            globalThis.global.workspace_manager.get_active_workspace = () => ({
                list_windows: () => ([
                    { is_fullscreen: () => false }
                ])
            });
        });
        
        it('should run refresh when conditions are met', () => {
            // Ensure we have the right conditions
            settings.set_boolean('pixel-refresh-running', false);
            settings.set_boolean('pixel-refresh-smart', false);
            
            assert.equal(pixelRefresh._shouldRunRefresh(), true, 
                'Refresh should run when conditions are met');
        });
    });
    
    describe('Manual Refresh', () => {
        it('should trigger a manual refresh', () => {
            // Ensure we have the right conditions
            settings.set_boolean('pixel-refresh-running', false);
            settings.set_boolean('pixel-refresh-smart', false);
            
            pixelRefresh.runManualRefresh();
            
            // Check that a refresh was triggered
            assert.equal(settings.get_boolean('pixel-refresh-running'), true, 
                'Manual refresh should set running to true');
            assert.equal(settings.get_boolean('pixel-refresh-manual-trigger'), true, 
                'Manual refresh should set manual trigger to true');
        });
        
        it('should not trigger when conditions are not met', () => {
            // Make conditions fail
            settings.set_boolean('pixel-refresh-running', true);
            
            pixelRefresh.runManualRefresh();
            
            // Should not have set manual trigger
            assert.equal(settings.get_boolean('pixel-refresh-manual-trigger'), false, 
                'Manual refresh should not set manual trigger when conditions fail');
        });
    });
    
    describe('Refresh Progress', () => {
        it('should update progress correctly', () => {
            pixelRefresh._updateProgress(50);
            
            assert.equal(settings.get_int('pixel-refresh-progress'), 50, 
                'Progress should be updated correctly');
            
            // Calculate expected time remaining
            const speed = settings.get_int('pixel-refresh-speed');
            const expectedTimeRemaining = Math.ceil((100 - 50) * (300 / speed) / 100);
            
            assert.equal(settings.get_int('pixel-refresh-time-remaining'), expectedTimeRemaining, 
                'Time remaining should be calculated correctly');
        });
        
        it('should complete refresh at 100% progress', () => {
            pixelRefresh._updateProgress(100);
            
            assert.equal(settings.get_boolean('pixel-refresh-running'), false, 
                'Refresh should be marked as not running when complete');
            assert.equal(settings.get_boolean('pixel-refresh-manual-trigger'), false, 
                'Manual trigger should be reset when complete');
            assert.equal(settings.get_int('pixel-refresh-time-remaining'), 0, 
                'Time remaining should be 0 when complete');
        });
    });
    
    describe('Refresh Duration Calculation', () => {
        it('should calculate refresh duration based on speed', () => {
            // Test with different speeds
            settings.set_int('pixel-refresh-speed', 1);
            assert.equal(pixelRefresh._calculateRefreshDuration(), 300, 
                'Duration should be 300 seconds at speed 1');
            
            settings.set_int('pixel-refresh-speed', 5);
            assert.equal(pixelRefresh._calculateRefreshDuration(), 60, 
                'Duration should be 60 seconds at speed 5');
        });
        
        it('should calculate refresh line height based on monitor resolution', () => {
            // Create a 4K monitor
            const monitor4K = { height: 2160, width: 3840 };
            assert.equal(pixelRefresh._calculateRefreshLineHeight(monitor4K), 4, 
                'Line height should be 4px for 4K monitors');
            
            // Create a 1080p monitor
            const monitor1080p = { height: 1080, width: 1920 };
            assert.equal(pixelRefresh._calculateRefreshLineHeight(monitor1080p), 2, 
                'Line height should be 2px for 1080p monitors');
            
            // Create a 720p monitor
            const monitor720p = { height: 720, width: 1280 };
            assert.equal(pixelRefresh._calculateRefreshLineHeight(monitor720p), 1, 
                'Line height should be 1px for smaller monitors');
        });
    });
    
    describe('Cleanup and Destruction', () => {
        it('should clean up resources when destroyed', () => {
            // Set up some refresh lines to ensure they get cleared
            const mockRefreshLine = new St.Widget();
            pixelRefresh._refreshLines.set(mockMonitors[0], mockRefreshLine);
            
            // Set up some timeouts
            pixelRefresh._refreshTimeout = timeoutIds[0] || 1;
            
            pixelRefresh.destroy();
            
            assert.equal(pixelRefresh._refreshLines.size, 0, 
                'Refresh lines should be cleared on destroy');
        });
    });
}); 