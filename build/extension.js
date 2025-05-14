'use strict';

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Initialize logging
function _log(message) {
    log(`[OLED Care] ${message}`);
}

function _logError(error) {
    log(`[OLED Care] ERROR: ${error.message}`);
    if (error.stack) {
        log(`[OLED Care] Stack trace:\n${error.stack}`);
    }
}

// Import extension modules
let OledCareIndicator = null;

export default class OLEDCareExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        _log('Constructing extension');
        this._indicator = null;
    }

    async enable() {
        _log('Enabling extension');
        try {
            // Import indicator the first time 
            if (!OledCareIndicator) {
                try {
                    const {OledCareIndicator: Indicator} = await import('./lib/indicator.js');
                    OledCareIndicator = Indicator;
                    _log('Successfully imported OledCareIndicator');
                } catch (error) {
                    _logError(error);
                    return;
                }
            }
            
            // Only create indicator if we're in an allowed session mode
            if (Main.sessionMode.allowExtensions) {
                _log('Session mode allows extensions');
                this._indicator = new OledCareIndicator(this);
                Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);
                _log('Indicator added to panel');
            } else {
                _log('Extensions not allowed in current session mode');
            }
        } catch (error) {
            _logError(error);
        }
    }

    disable() {
        _log('Disabling extension');
        try {
            if (this._indicator) {
                this._indicator.destroy();
                this._indicator = null;
                _log('Indicator destroyed');
            }
        } catch (error) {
            _logError(error);
        }
    }
} 