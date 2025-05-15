'use strict';

import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Extension imports
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';

export default GObject.registerClass({
    GTypeName: 'OledCarePixelRefresh'
},
class PixelRefresh extends GObject.Object {
    constructor(settings) {
        super();
        this._settings = settings;
        this._refreshTimeout = null;
        this._refreshLines = new Map();
        this._scheduler = null;
        this._schedulerTimeout = null;
        this._usePortalAPI = this._checkPortalSupport();
        this._cancelRequested = false;
        this._lastFrameTime = 0;
        this._frameCount = 0;

        this._performanceMonitoringActive = false;

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
            'pixel-refresh-interval',
            'pixel-refresh-running',
            'pixel-refresh-progress',
            'pixel-refresh-time-remaining',
            'pixel-refresh-next-run',
            'pixel-refresh-manual-trigger',
            'pixel-refresh-manual-cancel',
            'pixel-refresh-interrupted',
            'pixel-refresh-interrupted-progress'
        ];

        const schemas = this._settings.list_keys();
        for (const setting of requiredSettings) {
            if (!schemas.includes(setting)) {
                this._log(`Warning: Required setting '${setting}' not found in schema`);
            }
        }

        // Validate interval range
        const interval = this._settings.get_int('pixel-refresh-interval');
        if (interval < 60 || interval > 1440) {
            this._log(`Warning: Invalid refresh interval ${interval}, resetting to 240 minutes`);
            this._settings.set_int('pixel-refresh-interval', 240);
        }

        // Validate speed range
        const speed = this._settings.get_int('pixel-refresh-speed');
        if (speed < 1 || speed > 5) {
            this._log(`Warning: Invalid refresh speed ${speed}, resetting to 2`);
            this._settings.set_int('pixel-refresh-speed', 2);
        }

        // Validate schedule format
        const schedule = this._settings.get_strv('pixel-refresh-schedule');
        const validSchedule = schedule.filter(timeStr => {
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(timeStr)) {
                this._log(`Warning: Invalid schedule time format ${timeStr}, will be ignored`);
                return false;
            }
            return true;
        });
        if (validSchedule.length !== schedule.length) {
            this._settings.set_strv('pixel-refresh-schedule', validSchedule);
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
        this._performanceMonitoringActive = true;
        this._log('Started performance monitoring');
    }

    _stopPerformanceMonitoring() {
        if (this._performanceMonitoringActive) {
            const currentTime = GLib.get_monotonic_time();
            const elapsed = currentTime - this._lastFrameTime;
            if (elapsed > 0) {
                const fps = this._frameCount / (elapsed / 1000000);
                this._log(`Final performance stats: ${fps.toFixed(2)} FPS`);
            }
            this._performanceMonitoringActive = false;
            this._frameCount = 0;
            this._lastFrameTime = 0;
            this._log('Stopped performance monitoring');
        }
    }

    _updatePerformanceStats() {
        if (!this._performanceMonitoringActive) return;

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
        
        // Connect to interval setting changes
        this._settings.connect('changed::pixel-refresh-interval', () => {
            if (this._settings.get_boolean('pixel-refresh-enabled')) {
                this._rescheduleRefresh();
            }
        });

        if (this._settings.get_boolean('pixel-refresh-enabled')) {
            this._scheduleNextRefresh();
        }

        // Connect to system suspend/resume signals
        this._suspendSignalId = global.connect('suspend', () => {
            this._log('System suspending, saving refresh state');
            if (this._settings.get_boolean('pixel-refresh-running')) {
                this._settings.set_boolean('pixel-refresh-interrupted', true);
                this._settings.set_int('pixel-refresh-interrupted-progress', 
                    this._settings.get_int('pixel-refresh-progress'));
                this._cancelRefresh();
            }
        });

        this._resumeSignalId = global.connect('resume', () => {
            this._log('System resuming, checking refresh state');
            if (this._settings.get_boolean('pixel-refresh-interrupted')) {
                this._log('Resuming interrupted refresh');
                const progress = this._settings.get_int('pixel-refresh-interrupted-progress');
                this._settings.set_boolean('pixel-refresh-interrupted', false);
                this._settings.set_int('pixel-refresh-interrupted-progress', 0);
                
                // Wait a bit for the system to stabilize
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 5000, () => {
                    if (this._shouldRunRefresh()) {
                        this._startRefresh();
                    } else {
                        this._log('Conditions not met after resume, rescheduling');
                        this._scheduleNextRefresh();
                    }
                    return GLib.SOURCE_REMOVE;
                });
            }
        });

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
        
        // Disconnect system signals
        if (this._suspendSignalId) {
            global.disconnect(this._suspendSignalId);
            this._suspendSignalId = null;
        }
        if (this._resumeSignalId) {
            global.disconnect(this._resumeSignalId);
            this._resumeSignalId = null;
        }
        
        this._cancelRefresh();
        this._stopPerformanceMonitoring();
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
        const interval = this._settings.get_int('pixel-refresh-interval');
        
        const now = new Date();
        let nextRun = null;
        let nextRunReason = '';

        // Check interval-based scheduling
        const lastRun = this._settings.get_string('pixel-refresh-next-run');
        if (lastRun) {
            const lastRunDate = new Date(lastRun);
            const intervalBasedNext = new Date(lastRunDate.getTime() + interval * 60000);
            if (intervalBasedNext > now) {
                nextRun = intervalBasedNext;
                nextRunReason = `Interval-based (${interval} minutes from last run)`;
            }
        }

        // Check schedule-based timing
        if (schedule.length > 0) {
            for (let timeStr of schedule) {
                const [hours, minutes] = timeStr.split(':').map(Number);
                let scheduledTime = new Date(now);
                scheduledTime.setHours(hours, minutes, 0, 0);

                if (scheduledTime <= now) {
                    scheduledTime.setDate(scheduledTime.getDate() + 1);
                }

                if (!nextRun || scheduledTime < nextRun) {
                    nextRun = scheduledTime;
                    nextRunReason = `Scheduled for ${hours}:${minutes.toString().padStart(2, '0')}`;
                }
            }
        }

        // Check if smart scheduling is enabled
        if (this._settings.get_boolean('pixel-refresh-smart')) {
            // Add random offset between -30 and +30 minutes to prevent all users running at exact same time
            const randomOffset = Math.floor(Math.random() * 61) - 30;
            nextRun.setMinutes(nextRun.getMinutes() + randomOffset);
            nextRunReason += ` (Smart scheduling: ${randomOffset > 0 ? '+' : ''}${randomOffset} minutes)`;
        }

        if (nextRun) {
            const nextRunISO = nextRun.toISOString();
            this._settings.set_string('pixel-refresh-next-run', nextRunISO);
            const delay = nextRun.getTime() - now.getTime();
            
            this._log(`Next refresh ${nextRunReason} at ${nextRun.toLocaleString()}`);
            
            this._refreshTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                if (this._shouldRunRefresh()) {
                    this._startRefresh();
                } else {
                    this._log('Conditions not met at scheduled time, rescheduling');
                    // If conditions aren't met, try again in 5 minutes
                    this._settings.set_string('pixel-refresh-next-run', 
                        new Date(Date.now() + 5 * 60000).toISOString());
                    this._scheduleNextRefresh();
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _rescheduleRefresh() {
        this._cancelRefresh();
        this._scheduleNextRefresh();
    }

    _startRefresh() {
        this._log('Starting pixel refresh');
        if (!this._shouldRunRefresh()) {
            this._log('Refresh conditions not met, skipping');
            return;
        }

        // Update settings state
        this._settings.set_boolean('pixel-refresh-running', true);
        this._settings.set_int('pixel-refresh-progress', 0);
        
        // Start refresh based on display server and GNOME version
        if (this._usePortalAPI) {
            this._startRefreshPortal();
        } else {
            this._startRefreshNew();
        }
        
        // Reset manual trigger if set
        if (this._settings.get_boolean('pixel-refresh-manual-trigger')) {
            this._settings.set_boolean('pixel-refresh-manual-trigger', false);
        }
    }

    _cancelRefresh() {
        this._log('Cancelling pixel refresh');
        
        // Cancel refresh based on display server and GNOME version
        if (this._usePortalAPI) {
            this._cancelRefreshPortal();
        } else {
            this._cancelRefreshNew();
        }
        
        // Reset refresh state
        this._settings.set_boolean('pixel-refresh-running', false);
        this._settings.set_int('pixel-refresh-progress', 0);
        this._settings.set_int('pixel-refresh-time-remaining', 0);
        this._settings.set_boolean('pixel-refresh-manual-trigger', false);
        this._settings.set_string('pixel-refresh-next-run', '');
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
        // Validate progress range
        progress = Math.max(0, Math.min(100, progress));
        
        const timeRemaining = Math.ceil((100 - progress) * this._calculateRefreshDuration() / 100);
        this._settings.set_int('pixel-refresh-progress', progress);
        this._settings.set_int('pixel-refresh-time-remaining', Math.min(timeRemaining, 3600));
        
        if (progress >= 100) {
            this._settings.set_boolean('pixel-refresh-running', false);
            this._settings.set_boolean('pixel-refresh-manual-trigger', false);
            this._settings.set_int('pixel-refresh-time-remaining', 0);
            this._settings.set_string('pixel-refresh-next-run', '');
            this._scheduleNextRefresh();
            this._log('Pixel refresh completed');
        }
    }

    _calculateRefreshLineHeight(monitor) {
        // Calculate optimal line height based on monitor resolution
        // For 4K displays, use 4 pixels, for 1080p use 2 pixels, for lower resolutions use 1 pixel
        if (monitor.height >= 2160) {
            return 4;
        } else if (monitor.height >= 1080) {
            return 2;
        }
        return 1;
    }

    // Portal API implementations (GNOME 47+)
    _startRefreshPortal() {
        const duration = this._calculateRefreshDuration() * 1000; // Convert to milliseconds
        const refreshInterval = Math.floor(duration / 100); // For progress updates
        this._settings.set_int('pixel-refresh-time-remaining', this._calculateRefreshDuration());

        Main.layoutManager.monitors.forEach(monitor => {
            const monitorConfig = Meta.MonitorManager.get().get_monitor_config(monitor.index);
            if (!monitorConfig) {
                this._log(`No monitor config found for monitor ${monitor.index}`);
                return;
            }

            // Create refresh effect with optimal line height
            const refreshLine = new St.Widget({
                style_class: 'pixel-refresh-line',
                height: this._calculateRefreshLineHeight(monitor),
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
                this._updatePerformanceStats();

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

            // Create refresh effect with optimal line height
            const refreshLine = new St.Widget({
                style_class: 'pixel-refresh-line',
                height: this._calculateRefreshLineHeight(monitor),
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

    _shouldRunRefresh() {
        // Check if refresh is already running
        if (this._settings.get_boolean('pixel-refresh-running')) {
            this._log('Refresh already running');
            return false;
        }

        // Check if smart refresh is enabled
        if (this._settings.get_boolean('pixel-refresh-smart')) {
            // Check for fullscreen windows
            const workspace = global.workspace_manager.get_active_workspace();
            if (workspace) {
                const windows = workspace.list_windows();
                for (const window of windows) {
                    if (window.is_fullscreen()) {
                        this._log('Fullscreen window detected, skipping refresh');
                        return false;
                    }
                }
            }

            // Check if system is idle
            const idleMonitor = Meta.IdleMonitor.get_core();
            if (idleMonitor && idleMonitor.get_idletime() < 300000) { // 5 minutes
                this._log('System not idle enough, skipping refresh');
                return false;
            }

            // Check if it's during typical usage hours (8 AM to 10 PM)
            const hour = new Date().getHours();
            if (hour >= 8 && hour < 22) {
                this._log('Active hours detected, skipping refresh');
                return false;
            }

            // Check if any critical applications are running
            const criticalApps = this._checkCriticalApps();
            if (criticalApps) {
                this._log(`Critical application running: ${criticalApps}, skipping refresh`);
                return false;
            }
        }

        return true;
    }

    _checkCriticalApps() {
        // Get list of windows
        const workspace = global.workspace_manager.get_active_workspace();
        if (!workspace) return null;

        const windows = workspace.list_windows();
        const criticalAppClasses = [
            'Totem',        // Video player
            'vlc',          // VLC
            'mpv',          // MPV
            'obs',          // OBS Studio
            'zoom',         // Zoom
            'skype',        // Skype
            'teams',        // Microsoft Teams
            'meet',         // Google Meet
            'firefox',      // Firefox (might be playing video)
            'chromium',     // Chromium (might be playing video)
            'chrome',       // Chrome (might be playing video)
        ];

        for (const window of windows) {
            const wmClass = window.get_wm_class() || '';
            const match = criticalAppClasses.find(app => 
                wmClass.toLowerCase().includes(app.toLowerCase()));
            if (match) {
                return wmClass;
            }
        }

        return null;
    }

    runManualRefresh() {
        this._log('Running manual pixel refresh');
        if (!this._shouldRunRefresh()) {
            return;
        }

        this._settings.set_boolean('pixel-refresh-manual-trigger', true);
        this._settings.set_boolean('pixel-refresh-running', true);
        this._settings.set_int('pixel-refresh-progress', 0);

        // Start refresh based on display server and GNOME version
        if (this._usePortalAPI) {
            this._startRefreshPortal();
        } else {
            this._startRefreshNew();
        }
    }
}
); 