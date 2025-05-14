'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from '../../../prefs.js';
import { describe, it, beforeEach, afterEach, assertNotNull, assertValueEquals } from '../localTestUtils.js';

// Import mocks
import { PreferencesWindow, PreferencesPage, PreferencesGroup, ActionRow } from '../mocks/adw.js';
import { Settings } from '../mocks/gio.js';
import { Switch, SpinButton, Entry, Button, Box, Label, ProgressBar } from '../mocks/gtk.js';

let prefs;
let window;
let settings;

describe('ExtensionPreferences', () => {
    beforeEach(() => {
        // Create mock settings with all expected keys
        settings = new Settings({
            'screen-dim-enabled': false,
            'display-brightness': 50,
            'display-contrast': 100,
            'dimming-level': 20,
            'screen-dim-timeout': 300,
            'unfocus-dim-enabled': false,
            'unfocus-dim-level': 30,
            'pixel-shift-enabled': false,
            'pixel-shift-interval': 300,
            'true-black-background': false,
            'autohide-top-panel': false,
            'autohide-dash': false,
            'pixel-refresh-enabled': false,
            'pixel-refresh-interval': 120,
            'pixel-refresh-speed': 3,
            'pixel-refresh-smart': true,
            'pixel-refresh-schedule': [],
            'pixel-refresh-running': false,
            'pixel-refresh-progress': 0,
            'pixel-refresh-time-remaining': 0,
            'pixel-refresh-next-run': '',
            'pixel-refresh-manual-trigger': false,
            'pixel-refresh-manual-cancel': false,
            'debug-mode': true
        });

        // Create mock preferences object
        prefs = new ExtensionPreferences();
        prefs.path = GLib.get_current_dir();
        prefs.getSettings = () => settings;

        // Create preferences window
        window = new PreferencesWindow();
    });

    afterEach(() => {
        prefs = null;
        window = null;
        settings = null;
    });

    it('should initialize correctly', () => {
        assertNotNull(prefs);
        assertNotNull(prefs.path);
        assertNotNull(prefs.getSettings());
    });

    it('should create a preferences window with basic structure', () => {
        const filledWindow = prefs.fillPreferencesWindow(window);
        assertNotNull(filledWindow);
        assertNotNull(filledWindow.get_pages());
    });

    it('should handle settings changes correctly', () => {
        const filledWindow = prefs.fillPreferencesWindow(window);
        
        // Test boolean setting
        settings.set_boolean('screen-dim-enabled', true);
        assertValueEquals(settings.get_boolean('screen-dim-enabled'), true);
        
        // Test integer setting
        settings.set_int('display-brightness', 75);
        assertValueEquals(settings.get_int('display-brightness'), 75);
        
        // Test string array setting
        const schedule = ['09:00', '18:00'];
        settings.set_strv('pixel-refresh-schedule', schedule);
        assertValueEquals(settings.get_strv('pixel-refresh-schedule').join(','), schedule.join(','));
    });

    it('should update status indicators when refresh state changes', () => {
        const filledWindow = prefs.fillPreferencesWindow(window);
        
        // Test refresh running state
        settings.set_boolean('pixel-refresh-running', true);
        assertValueEquals(settings.get_boolean('pixel-refresh-running'), true);
        
        // Test progress updates
        settings.set_int('pixel-refresh-progress', 50);
        assertValueEquals(settings.get_int('pixel-refresh-progress'), 50);
        
        // Test time remaining updates
        settings.set_int('pixel-refresh-time-remaining', 120);
        assertValueEquals(settings.get_int('pixel-refresh-time-remaining'), 120);
        
        // Test next run time updates
        const nextRun = new Date().toISOString();
        settings.set_string('pixel-refresh-next-run', nextRun);
        assertValueEquals(settings.get_string('pixel-refresh-next-run'), nextRun);
    });

    it('should handle manual control actions', () => {
        const filledWindow = prefs.fillPreferencesWindow(window);
        
        // Test manual trigger
        settings.set_boolean('pixel-refresh-manual-trigger', true);
        assertValueEquals(settings.get_boolean('pixel-refresh-manual-trigger'), true);
        
        // Test manual cancel
        settings.set_boolean('pixel-refresh-manual-cancel', true);
        assertValueEquals(settings.get_boolean('pixel-refresh-manual-cancel'), true);
    });

    it('should validate setting ranges', () => {
        const filledWindow = prefs.fillPreferencesWindow(window);
        
        // Test brightness range
        settings.set_int('display-brightness', 5); // Below minimum
        assertValueEquals(settings.get_int('display-brightness'), 10);
        settings.set_int('display-brightness', 110); // Above maximum
        assertValueEquals(settings.get_int('display-brightness'), 100);
        
        // Test dimming level range
        settings.set_int('dimming-level', -10); // Below minimum
        assertValueEquals(settings.get_int('dimming-level'), 0);
        settings.set_int('dimming-level', 60); // Above maximum
        assertValueEquals(settings.get_int('dimming-level'), 50);
        
        // Test refresh speed range
        settings.set_int('pixel-refresh-speed', 0); // Below minimum
        assertValueEquals(settings.get_int('pixel-refresh-speed'), 1);
        settings.set_int('pixel-refresh-speed', 6); // Above maximum
        assertValueEquals(settings.get_int('pixel-refresh-speed'), 5);
    });
}); 