// GNOME imports
const { GObject, Meta, Clutter, St, GLib } = imports.gi;
const Main = imports.ui.main;

// Extension imports
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var PixelRefresh = class PixelRefresh {
    constructor(settings) {
        this._settings = settings;
        this._refreshLines = new Map();
        this._refreshTimeout = null;
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
            'pixel-refresh-enabled',
            'pixel-refresh-speed',
            'pixel-refresh-smart',
            'pixel-refresh-schedule',
            'pixel-refresh-running',
            'pixel-refresh-progress',
            'pixel-refresh-time-remaining',
            'pixel-refresh-next-run',
            'pixel-refresh-manual-trigger',
            'pixel-refresh-manual-cancel'
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
            log(`[PixelRefresh] ${message}`);
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
        this._log('Initializing pixel refresh');
        if (this._settings.get_boolean('pixel-refresh-enabled')) {
            this._scheduleNextRefresh();
        }

        this._settings.connect('changed::pixel-refresh-enabled', () => {
            if (this._settings.get_boolean('pixel-refresh-enabled')) {
                this._scheduleNextRefresh();
            } else {
                this._cancelRefresh();
            }
        });

        this._settings.connect('changed::pixel-refresh-schedule', () => {
            if (this._settings.get_boolean('pixel-refresh-enabled')) {
                this._rescheduleRefresh();
            }
        });

        this._settings.connect('changed::pixel-refresh-manual-trigger', () => {
            if (this._settings.get_boolean('pixel-refresh-manual-trigger')) {
                this._startRefresh();
                this._settings.set_boolean('pixel-refresh-manual-trigger', false);
            }
        });

        this._settings.connect('changed::pixel-refresh-manual-cancel', () => {
            if (this._settings.get_boolean('pixel-refresh-manual-cancel')) {
                this._cancelRefresh();
                this._settings.set_boolean('pixel-refresh-manual-cancel', false);
            }
        });
        this._log('Pixel refresh initialized');
    }

    enable() {
        this._log('Enabling pixel refresh');
        if (this._settings.get_boolean('pixel-refresh-enabled')) {
            this._scheduleNextRefresh();
        }
    }

    disable() {
        this._log('Disabling pixel refresh');
        this._cancelRefresh();
    }

    destroy() {
        this._log('Destroying pixel refresh');
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

    _scheduleNextRefresh() {
        this._log('Scheduling next refresh');
        this._cancelRefresh();

        const schedule = this._settings.get_strv('pixel-refresh-schedule');
        if (!schedule.length) {
            this._log('No schedule defined');
            return;
        }

        const now = new Date();
        let nextRun = null;

        // Find the next scheduled time
        for (let timeStr of schedule) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            let scheduledTime = new Date(now);
            scheduledTime.setHours(hours, minutes, 0, 0);

            if (scheduledTime <= now) {
                scheduledTime.setDate(scheduledTime.getDate() + 1);
            }

            if (!nextRun || scheduledTime < nextRun) {
                nextRun = scheduledTime;
            }
        }

        if (nextRun) {
            this._settings.set_string('pixel-refresh-next-run', nextRun.toISOString());
            const delay = nextRun.getTime() - now.getTime();
            this._log(`Next refresh scheduled for ${nextRun.toLocaleString()}`);
            this._refreshTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                this._startRefresh();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _rescheduleRefresh() {
        this._cancelRefresh();
        this._scheduleNextRefresh();
    }

    _startRefresh() {
        this._log('Starting refresh');
        if (this._settings.get_boolean('pixel-refresh-running')) {
            this._log('Refresh already running');
            return;
        }

        if (this._settings.get_boolean('pixel-refresh-smart')) {
            const isIdle = this._isSystemIdle();
            const hasFullscreen = this._hasFullscreenWindows();
            this._log(`System state - Idle: ${isIdle}, Fullscreen windows: ${hasFullscreen}`);
            if (!isIdle || hasFullscreen) {
                this._log('Skipping refresh due to system state');
                this._scheduleNextRefresh();
                return;
            }
        }

        this._settings.set_boolean('pixel-refresh-running', true);
        this._settings.set_int('pixel-refresh-progress', 0);
        this._settings.set_int('pixel-refresh-time-remaining', this._calculateRefreshDuration());

        this._startPerformanceMonitoring();

        // Start refresh based on display server and GNOME version
        if (this._usePortalAPI) {
            this._startRefreshPortal();
        } else if (this._useNewDisplayManager) {
            this._startRefreshNew();
        } else {
            this._startRefreshLegacy();
        }
    }

    _cancelRefresh() {
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }

        if (this._settings.get_boolean('pixel-refresh-running')) {
            // Cancel refresh based on display server and GNOME version
            if (this._usePortalAPI) {
                this._cancelRefreshPortal();
            } else if (this._useNewDisplayManager) {
                this._cancelRefreshNew();
            } else {
                this._cancelRefreshLegacy();
            }

            this._settings.set_boolean('pixel-refresh-running', false);
            this._settings.set_int('pixel-refresh-progress', 0);
            this._settings.set_int('pixel-refresh-time-remaining', 0);
        }
    }

    _isSystemIdle() {
        const idleMonitor = Meta.IdleMonitor.get_core();
        return idleMonitor && idleMonitor.get_idletime() > 60000; // 1 minute idle
    }

    _hasFullscreenWindows() {
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = workspace.list_windows();
        return windows.some(window => window.is_fullscreen());
    }

    _calculateRefreshDuration() {
        const speed = this._settings.get_int('pixel-refresh-speed');
        // Base duration in seconds, adjusted by speed (1-5)
        return Math.floor(300 / speed);
    }

    _updateProgress(progress) {
        this._settings.set_int('pixel-refresh-progress', progress);
        if (progress >= 100) {
            this._settings.set_boolean('pixel-refresh-running', false);
            this._settings.set_int('pixel-refresh-time-remaining', 0);
            this._scheduleNextRefresh();
        }
    }

    // Portal API implementations (GNOME 47+)
    _startRefreshPortal() {
        const duration = this._calculateRefreshDuration() * 1000; // Convert to milliseconds
        const refreshInterval = Math.floor(duration / 100); // For progress updates

        Main.layoutManager.monitors.forEach(monitor => {
            const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
            if (!monitorConfig) return;

            // Create refresh effect
            const refreshLine = new St.Widget({
                style_class: 'pixel-refresh-line',
                height: 2,
                width: monitor.width,
                x: monitor.x,
                y: monitor.y
            });

            Main.layoutManager.addChrome(refreshLine);
            this._refreshLines.set(monitor, refreshLine);

            // Start animation
            let progress = 0;
            const refreshTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, refreshInterval, () => {
                progress++;
                refreshLine.y = monitor.y + Math.floor((monitor.height * progress) / 100);
                this._updateProgress(progress);

                if (progress >= 100) {
                    this._refreshLines.delete(monitor);
                    Main.layoutManager.removeChrome(refreshLine);
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });

            // Store timeout for cancellation
            this._refreshTimeout = refreshTimeout;
        });
    }

    _cancelRefreshPortal() {
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }

        this._refreshLines.forEach((line, monitor) => {
            Main.layoutManager.removeChrome(line);
        });
        this._refreshLines.clear();
    }

    // New API implementations (GNOME 46+)
    _startRefreshNew() {
        const duration = this._calculateRefreshDuration() * 1000;
        const refreshInterval = Math.floor(duration / 100);
        const monitorManager = Meta.MonitorManager.get();

        Main.layoutManager.monitors.forEach(monitor => {
            const connector = monitorManager.get_monitor_connector(monitor.index);
            if (!connector) return;

            // Create refresh effect
            const refreshLine = new St.Widget({
                style_class: 'pixel-refresh-line',
                height: 2,
                width: monitor.width,
                x: monitor.x,
                y: monitor.y
            });

            Main.layoutManager.addChrome(refreshLine);
            this._refreshLines.set(monitor, refreshLine);

            // Start animation
            let progress = 0;
            const refreshTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, refreshInterval, () => {
                progress++;
                refreshLine.y = monitor.y + Math.floor((monitor.height * progress) / 100);
                this._updateProgress(progress);

                if (progress >= 100) {
                    this._refreshLines.delete(monitor);
                    Main.layoutManager.removeChrome(refreshLine);
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });

            // Store timeout for cancellation
            this._refreshTimeout = refreshTimeout;
        });
    }

    _cancelRefreshNew() {
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }

        this._refreshLines.forEach((line, monitor) => {
            Main.layoutManager.removeChrome(line);
        });
        this._refreshLines.clear();
    }

    // Legacy API implementations (GNOME 45)
    _startRefreshLegacy() {
        const duration = this._calculateRefreshDuration() * 1000;
        const refreshInterval = Math.floor(duration / 100);

        Main.layoutManager.monitors.forEach(monitor => {
            // Create refresh effect
            const refreshLine = new St.Widget({
                style_class: 'pixel-refresh-line',
                height: 2,
                width: monitor.width,
                x: monitor.x,
                y: monitor.y
            });

            Main.layoutManager.addChrome(refreshLine);
            this._refreshLines.set(monitor, refreshLine);

            // Start animation
            let progress = 0;
            const refreshTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, refreshInterval, () => {
                progress++;
                refreshLine.y = monitor.y + Math.floor((monitor.height * progress) / 100);
                this._updateProgress(progress);

                if (progress >= 100) {
                    this._refreshLines.delete(monitor);
                    Main.layoutManager.removeChrome(refreshLine);
                    return GLib.SOURCE_REMOVE;
                }
                return GLib.SOURCE_CONTINUE;
            });

            // Store timeout for cancellation
            this._refreshTimeout = refreshTimeout;
        });
    }

    _cancelRefreshLegacy() {
        if (this._refreshTimeout) {
            GLib.source_remove(this._refreshTimeout);
            this._refreshTimeout = null;
        }

        this._refreshLines.forEach((line, monitor) => {
            Main.layoutManager.removeChrome(line);
        });
        this._refreshLines.clear();
    }
}; 