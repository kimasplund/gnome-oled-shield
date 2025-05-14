// Tests for DisplayManager in GNOME 48 on Wayland environment
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';
import * as TestUtils from '../../../../testUtils.js';

// Mock the GNOME Shell environment components
const MockMain = {
    layoutManager: {
        monitors: [],
        addChrome: () => {},
        removeChrome: () => {},
        _startingUp: true
    }
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

// The GSettings mock schema
const settingsSchema = {
    'enabled-displays': { type: 'as', default: [] },
    'debug-mode': { type: 'b', default: true }
};

describe('DisplayManager Tests (GNOME 48, Wayland)', () => {
    let DisplayManager;
    let settings;
    let displayManager;
    let mockMonitors;
    
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
            });
        }
        MockMain.layoutManager.monitors = monitors;
        return monitors;
    }
    
    before(async () => {
        // Import the real DisplayManager module
        DisplayManager = (await import('../../../../lib/displayManager.js')).DisplayManager;
        
        // Set up our mocks
        globalThis.Meta = MockMeta;
        globalThis.Main = MockMain;
    });
    
    beforeEach(() => {
        // Reset the monitors
        mockMonitors = createMockMonitors();
        
        // Create mock settings
        settings = TestUtils.createMockSettings(settingsSchema);
        
        // Create the DisplayManager instance
        displayManager = new DisplayManager(settings);
    });
    
    afterEach(() => {
        if (displayManager) {
            displayManager.destroy();
            displayManager = null;
        }
    });
    
    describe('Initialization', () => {
        it('should initialize correctly', () => {
            assert.ok(displayManager, 'DisplayManager should be created');
        });
        
        it('should detect monitors', () => {
            assert.equal(displayManager._monitors.length, mockMonitors.length, 
                'DisplayManager should have the correct number of monitors');
        });
        
        it('should store monitor IDs correctly', () => {
            const monitorId = displayManager._getMonitorId(mockMonitors[0]);
            assert.equal(monitorId, 'Manufacturer0-Model0-0', 
                'Monitor ID should be correctly formatted');
        });
    });
    
    describe('Display Protection', () => {
        it('should detect if a display is enabled', () => {
            // First, make sure the display is enabled
            const monitorId = displayManager._getMonitorId(mockMonitors[0]);
            const enabledDisplays = [monitorId];
            settings.set_strv('enabled-displays', enabledDisplays);
            
            const isEnabled = displayManager._isDisplayEnabled(mockMonitors[0]);
            assert.equal(isEnabled, true, 'Display should be enabled');
        });
        
        it('should detect if a display is not enabled', () => {
            // First, make sure the display is not enabled
            const monitorId = displayManager._getMonitorId(mockMonitors[0]);
            settings.set_strv('enabled-displays', []);
            
            const isEnabled = displayManager._isDisplayEnabled(mockMonitors[0]);
            assert.equal(isEnabled, false, 'Display should not be enabled');
        });
        
        it('should check protection status correctly', () => {
            // Mock the protected displays map
            const monitorId = displayManager._getMonitorId(mockMonitors[0]);
            displayManager._protectedDisplays.set(monitorId, true);
            
            const isProtected = displayManager.isProtected(mockMonitors[0]);
            assert.equal(isProtected, true, 'Display should be protected');
        });
    });
    
    describe('Cleanup and Destruction', () => {
        it('should clean up resources when destroyed', () => {
            // Set up some protection to ensure it gets cleared
            const monitorId = displayManager._getMonitorId(mockMonitors[0]);
            displayManager._protectedDisplays.set(monitorId, true);
            
            displayManager.destroy();
            
            assert.equal(displayManager._protectedDisplays.size, 0, 
                'Protected displays should be cleared on destroy');
        });
    });
}); 