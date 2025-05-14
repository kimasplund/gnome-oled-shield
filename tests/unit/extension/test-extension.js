'use strict';

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Extension } from '../../../extension.js';
import { describe, it, beforeEach, afterEach, assertValueEquals } from '../localTestUtils.js';

describe('Extension', () => {
    let extension;
    let settings;

    beforeEach(() => {
        // Create a mock settings
        settings = {
            get_boolean: (key) => key === 'debug-mode' ? true : false,
            get_int: (key) => key === 'dimming-brightness' ? 50 : 300,
            set_boolean: (key, value) => {
                if (key === 'debug-mode') {
                    settings._debugMode = value;
                    settings._onChanged('debug-mode');
                }
            },
            connect: (signal, callback) => {
                settings._onChanged = callback;
                return 1; // Return a handler ID
            },
            disconnect: (handlerId) => {},
            bind: (key, object, property, flags) => {}
        };
        
        // Create extension instance
        extension = new Extension();
        extension.path = GLib.get_current_dir();
        extension.getSettings = () => settings;
    });

    afterEach(() => {
        if (extension) {
            extension.disable();
            extension = null;
        }
        settings = null;
    });

    it('initializes correctly', () => {
        assertValueEquals(extension._dimming, null);
        assertValueEquals(extension._settings, null);
        assertValueEquals(extension._settingsChangedId, null);
    });

    it('enables and disables correctly', () => {
        extension.enable();
        assertValueEquals(extension._dimming !== null, true);
        assertValueEquals(extension._settings !== null, true);
        assertValueEquals(extension._settingsChangedId !== null, true);

        extension.disable();
        assertValueEquals(extension._dimming, null);
        assertValueEquals(extension._settings, null);
        assertValueEquals(extension._settingsChangedId, null);
    });

    it('handles settings changes', () => {
        extension.enable();
        const dimming = extension._dimming;
        let applyDimmingCalled = false;
        dimming.applyDimming = () => {
            applyDimmingCalled = true;
        };

        settings.set_boolean('debug-mode', !settings.get_boolean('debug-mode'));
        assertValueEquals(applyDimmingCalled, true);
    });
}); 