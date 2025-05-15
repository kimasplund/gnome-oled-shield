'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';

// Import modules conditionally based on environment
const isTestEnv = GLib.getenv('G_TEST_SRCDIR') !== null;

const Main = isTestEnv 
    ? (await import('../tests/unit/mocks/main.js')).Main 
    : (await import('resource:///org/gnome/shell/ui/main.js')).Main;

const { BrightnessContrastEffect } = isTestEnv
    ? await import('../tests/unit/mocks/clutter.js')
    : await import('gi://Clutter');

export default GObject.registerClass({
    GTypeName: 'OledCareDimming'
}, class Dimming extends GObject.Object {
        constructor(settings) {
            super();
            this._settings = settings;
            this._validateSettings();
            this._dimEffect = null;
            this._log('Dimming initialized');
        }

            _validateSettings() {
        const requiredBooleanKeys = ['debug-mode', 'screen-dim-enabled'];
        const requiredIntKeys = ['dimming-level', 'screen-dim-timeout'];

        for (const key of requiredBooleanKeys) {
            if (this._settings.get_boolean(key) === undefined) {
                this._log(`Missing required boolean setting: ${key}`);
                return false;
            }
        }

        for (const key of requiredIntKeys) {
            if (this._settings.get_int(key) === undefined) {
                this._log(`Missing required integer setting: ${key}`);
                return false;
            }
        }

        return true;
    }

        _log(message) {
            if (this._settings && this._settings.get_boolean('debug-mode')) {
                console.log(`[Dimming] ${message}`);
            }
        }

            applyDimming() {
        if (!this._settings.get_boolean('screen-dim-enabled')) {
            this._log('Dimming is disabled');
            return;
        }

        const brightness = this._settings.get_int('dimming-level') / 100;
            this._log(`Applying dimming with brightness: ${brightness}`);

            const actor = global.stage.get_child_at_index(0);
            if (!actor) {
                this._log('No actor found to apply dimming');
                return;
            }

            this._dimEffect = new BrightnessContrastEffect({
                name: 'dimming',
                brightness: brightness
            });
            actor.add_effect(this._dimEffect);
            this._log('Dimming effect applied');
        }

        removeDimming() {
            if (!this._dimEffect) {
                this._log('No dimming effect to remove');
                return;
            }

            const actor = global.stage.get_child_at_index(0);
            if (actor) {
                this._dimEffect.set_enabled(false);
                actor.remove_effect(this._dimEffect);
                this._log('Dimming effect removed');
            }
            this._dimEffect = null;
        }

        destroy() {
            const wasDebugEnabled = this._settings?.get_boolean('debug-mode');
            this.removeDimming();
            this._dimEffect = null;
            this._settings = null;
            if (wasDebugEnabled) {
                console.log('[Dimming] Dimming destroyed');
            }
        }
    }
); 