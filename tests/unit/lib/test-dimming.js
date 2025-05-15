'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import { Main } from '../mocks/main.js';
import { WindowActor } from '../mocks/meta.js';
import { BrightnessContrastEffect } from '../mocks/clutter.js';
import Dimming from '../../../lib/dimming.js';
import { describe, it, beforeEach, afterEach, assertValueEquals, assertNotNull, assertEffectRemoved } from '../localTestUtils.js';

let windowActor;
let settings;

describe('Dimming', () => {
    beforeEach(() => {
        // Create mock window actor
        windowActor = new WindowActor();
        global.stage = {
            get_child_at_index: () => windowActor
        };

        // Create mock settings
        settings = {
            get_boolean: (key) => key === 'screen-dim-enabled' || key === 'debug-mode' ? true : false,
            get_int: (key) => key === 'dimming-level' ? 50 : 0
        };
    });

    afterEach(() => {
        windowActor = null;
        settings = null;
        delete global.stage;
    });

    it('should initialize with correct settings', () => {
        const dimming = new Dimming(settings);
        assertNotNull(dimming);
        dimming.destroy();
    });

    it('should validate settings correctly', () => {
        const dimming = new Dimming(settings);
        const result = dimming._validateSettings();
        assertValueEquals(result, true);
        dimming.destroy();
    });

    it('should apply dimming effect', () => {
        const dimming = new Dimming(settings);
        dimming.applyDimming();
        
        const effect = windowActor.get_effect('dimming');
        assertNotNull(effect);
        assertValueEquals(effect.brightness, 0.5);
        
        dimming.destroy();
    });

    it('should remove dimming effect', () => {
        const dimming = new Dimming(settings);
        dimming.applyDimming();
        
        // First verify effect is applied
        let effect = windowActor.get_effect('dimming');
        assertNotNull(effect);
        
        // Then remove it
        dimming.removeDimming();
        
        // Verify effect is removed
        assertEffectRemoved(windowActor, 'dimming');
        
        dimming.destroy();
    });
}); 