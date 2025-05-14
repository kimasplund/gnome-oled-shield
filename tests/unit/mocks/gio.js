'use strict';

import GObject from 'gi://GObject';

// Mock Gio.SettingsBindFlags
export const SettingsBindFlags = {
    DEFAULT: 0,
    GET: 1,
    SET: 2,
    NO_SENSITIVITY: 4,
    GET_NO_CHANGES: 8,
    NO_HINTS: 16,
    INVERT_BOOLEAN: 32
};

// Define setting ranges
const SETTING_RANGES = {
    'display-brightness': { min: 10, max: 100 },
    'display-contrast': { min: 50, max: 150 },
    'dimming-level': { min: 0, max: 50 },
    'screen-dim-timeout': { min: 30, max: 3600 },
    'unfocus-dim-level': { min: 0, max: 40 },
    'pixel-shift-interval': { min: 60, max: 3600 },
    'pixel-refresh-interval': { min: 60, max: 1440 },
    'pixel-refresh-speed': { min: 1, max: 5 }
};

// Mock Gio.Settings
export class Settings {
    constructor(initialValues = {}) {
        this._values = { ...initialValues };
        this._bindings = new Map();
        this._callbacks = new Map();
    }

    get_boolean(key) {
        return !!this._values[key];
    }

    set_boolean(key, value) {
        this._values[key] = !!value;
        this._notifyChange(key);
    }

    get_int(key) {
        return this._values[key] || 0;
    }

    set_int(key, value) {
        let validatedValue = parseInt(value, 10);
        if (SETTING_RANGES[key]) {
            const { min, max } = SETTING_RANGES[key];
            validatedValue = Math.max(min, Math.min(max, validatedValue));
        }
        this._values[key] = validatedValue;
        this._notifyChange(key);
    }

    get_double(key) {
        return this._values[key] || 0.0;
    }

    set_double(key, value) {
        let validatedValue = parseFloat(value);
        if (SETTING_RANGES[key]) {
            const { min, max } = SETTING_RANGES[key];
            validatedValue = Math.max(min, Math.min(max, validatedValue));
        }
        this._values[key] = validatedValue;
        this._notifyChange(key);
    }

    get_string(key) {
        return this._values[key] || '';
    }

    set_string(key, value) {
        this._values[key] = String(value);
        this._notifyChange(key);
    }

    get_strv(key) {
        return this._values[key] || [];
    }

    set_strv(key, value) {
        this._values[key] = Array.isArray(value) ? value : [];
        this._notifyChange(key);
    }

    bind(key, object, property, flags) {
        this._bindings.set(`${key}-${property}`, { object, property, flags });
        
        // Initial sync
        if (!(flags & SettingsBindFlags.GET_NO_CHANGES)) {
            const value = this._values[key];
            if (value !== undefined) {
                object[property] = value;
            }
        }
    }

    connect(signal, callback) {
        if (!this._callbacks.has(signal)) {
            this._callbacks.set(signal, []);
        }
        this._callbacks.get(signal).push(callback);
        return this._callbacks.get(signal).length;
    }

    _notifyChange(key) {
        const callbacks = this._callbacks.get('changed::' + key) || [];
        callbacks.forEach(callback => callback(this, key));

        // Update bound objects
        for (const [bindingKey, binding] of this._bindings.entries()) {
            const [boundKey] = bindingKey.split('-');
            if (boundKey === key && !(binding.flags & SettingsBindFlags.GET_NO_CHANGES)) {
                binding.object[binding.property] = this._values[key];
            }
        }
    }
}

// Mock Gio.SettingsSchema
export const SettingsSchema = GObject.registerClass({
    GTypeName: 'MockGioSettingsSchema'
}, class SettingsSchema extends GObject.Object {
    get_path() {
        return '/org/gnome/shell/extensions/oled-dimming/';
    }
});

// Mock Gio.SettingsSchemaSource
export const SettingsSchemaSource = {
    new_from_directory: (dir, parent, trusted) => ({
        lookup: (schema_id, recursive) => new SettingsSchema()
    }),
    get_default: () => ({
        lookup: (schema_id, recursive) => new SettingsSchema()
    })
}; 