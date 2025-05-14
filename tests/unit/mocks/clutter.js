'use strict';

import GObject from 'gi://GObject';

// Mock BrightnessContrastEffect
export const BrightnessContrastEffect = GObject.registerClass(
    class BrightnessContrastEffect extends GObject.Object {
        constructor(params = {}) {
            super();
            this.name = params.name || '';
            this.brightness = params.brightness || 1.0;
            this._enabled = true;
        }

        set_enabled(enabled) {
            this._enabled = Boolean(enabled);
        }

        get_enabled() {
            return this._enabled;
        }

        disable() {
            this._enabled = false;
        }
    }
); 