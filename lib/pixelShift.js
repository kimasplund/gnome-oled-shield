// GNOME imports
const { GObject, Meta, GLib } = imports.gi;
const Main = imports.ui.main;

// Extension imports
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const PIXEL_SHIFT_AMOUNT = 1; // pixels to shift

var PixelShift = class PixelShift {
    constructor(settings) {
        this._settings = settings;
        this._currentShift = { x: 0, y: 0 };
        this._pixelShiftTimeout = null;
        this._useNewDisplayManager = Main.layoutManager._startingUp !== undefined;
        this._usePortalAPI = this._checkPortalSupport();
        this._lastFrameTime = 0;
        this._frameCount = 0;

        // Validate settings
        this._validateSettings();
    }

    _validateSettings() {
        const requiredSettings = [
            'debug-mode',
            'pixel-shift-enabled',
            'pixel-shift-interval'
        ];

        const schemas = this._settings.list_keys();
        for (const setting of requiredSettings) {
            if (!schemas.includes(setting)) {
                this._log(`Warning: Required setting '${setting}' not found in schema`);
            }
        }
    }

    _log(message) {
        if (this._settings.get_boolean('debug-mode')) {
            log(`[PixelShift] ${message}`);
        }
    }

    _startPerformanceMonitoring() {
        this._lastFrameTime = GLib.get_monotonic_time();
        this._frameCount = 0;
        this._log('Started performance monitoring');
    }

    _updatePerformanceStats() {
        this._frameCount++;
        const currentTime = GLib.get_monotonic_time();
        const elapsed = currentTime - this._lastFrameTime;
        if (elapsed > 1000000) { // 1 second
            const fps = this._frameCount / (elapsed / 1000000);
            this._log(`Performance: ${fps.toFixed(2)} FPS`);
            this._frameCount = 0;
            this._lastFrameTime = currentTime;
        }
    }

    init() {
        this._log('Initializing pixel shift');
        if (this._settings.get_boolean('pixel-shift-enabled')) {
            this._startPixelShift();
        }

        this._settings.connect('changed::pixel-shift-enabled', () => {
            if (this._settings.get_boolean('pixel-shift-enabled')) {
                this._startPixelShift();
            } else {
                this._stopPixelShift();
            }
        });

        this._settings.connect('changed::pixel-shift-interval', () => {
            if (this._settings.get_boolean('pixel-shift-enabled')) {
                this._restartPixelShift();
            }
        });
        this._log('Pixel shift initialized');
    }

    enable() {
        this._log('Enabling pixel shift');
        if (this._settings.get_boolean('pixel-shift-enabled')) {
            this._startPixelShift();
        }
    }

    disable() {
        this._log('Disabling pixel shift');
        this._stopPixelShift();
    }

    destroy() {
        this._log('Destroying pixel shift');
        this.disable();
    }

    _checkPortalSupport() {
        try {
            const proxy = Main.shellDBusService.shellProxy;
            return proxy !== null;
        } catch (e) {
            this._log('Portal API not available: ' + e.message);
            return false;
        }
    }

    _startPixelShift() {
        this._log('Starting pixel shift');
        this._stopPixelShift();
        
        const interval = this._settings.get_int('pixel-shift-interval') * 1000;
        this._pixelShiftTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
            this._shiftPixels();
            return GLib.SOURCE_CONTINUE;
        });

        this._startPerformanceMonitoring();
    }

    _stopPixelShift() {
        this._log('Stopping pixel shift');
        if (this._pixelShiftTimeout) {
            GLib.source_remove(this._pixelShiftTimeout);
            this._pixelShiftTimeout = null;
        }
        this._resetShift();
    }

    _restartPixelShift() {
        this._log('Restarting pixel shift');
        this._stopPixelShift();
        this._startPixelShift();
    }

    _shiftPixels() {
        // Calculate new shift
        let newShift = this._calculateNextShift();
        this._log(`Shifting pixels to x:${newShift.x}, y:${newShift.y}`);

        // Apply shift based on display server and GNOME version
        if (this._usePortalAPI) {
            this._applyShiftPortal(newShift);
        } else if (this._useNewDisplayManager) {
            this._applyShiftNew(newShift);
        } else {
            this._applyShiftLegacy(newShift);
        }

        this._currentShift = newShift;
        this._updatePerformanceStats();
        return GLib.SOURCE_CONTINUE;
    }

    _resetShift() {
        if (this._currentShift.x !== 0 || this._currentShift.y !== 0) {
            this._currentShift = { x: 0, y: 0 };
            
            // Reset shift based on display server and GNOME version
            if (this._usePortalAPI) {
                this._applyShiftPortal(this._currentShift);
            } else if (this._useNewDisplayManager) {
                this._applyShiftNew(this._currentShift);
            } else {
                this._applyShiftLegacy(this._currentShift);
            }
        }
    }

    _calculateNextShift() {
        // Calculate a new shift position that's different from the current one
        let newShift = { x: 0, y: 0 };
        
        // Randomly choose a direction (0: right, 1: left, 2: down, 3: up)
        const direction = Math.floor(Math.random() * 4);
        
        switch (direction) {
            case 0: // right
                newShift.x = PIXEL_SHIFT_AMOUNT;
                break;
            case 1: // left
                newShift.x = -PIXEL_SHIFT_AMOUNT;
                break;
            case 2: // down
                newShift.y = PIXEL_SHIFT_AMOUNT;
                break;
            case 3: // up
                newShift.y = -PIXEL_SHIFT_AMOUNT;
                break;
        }
        
        // If the new shift is the same as the current one, try again
        if (newShift.x === this._currentShift.x && newShift.y === this._currentShift.y) {
            return this._calculateNextShift();
        }
        
        return newShift;
    }

    // Portal API implementation (GNOME 47+)
    _applyShiftPortal(shift) {
        const monitors = Main.layoutManager.monitors;
        monitors.forEach(monitor => {
            const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
            if (!monitorConfig) return;

            monitorConfig.set_position_offset(shift.x, shift.y);
        });
    }

    // New API implementation (GNOME 46+)
    _applyShiftNew(shift) {
        const monitorManager = Meta.MonitorManager.get();
        Main.layoutManager.monitors.forEach(monitor => {
            const connector = monitorManager.get_monitor_connector(monitor.index);
            if (!connector) return;

            connector.set_position_offset(shift.x, shift.y);
        });
    }

    // Legacy API implementation (GNOME 45)
    _applyShiftLegacy(shift) {
        const display = global.display;
        if (!display) return;

        Main.layoutManager.monitors.forEach(monitor => {
            display.set_monitor_position_offset(monitor.index, shift.x, shift.y);
        });
    }
}; 