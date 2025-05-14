'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';

// Mock enums
export const Orientation = GObject.registerClass({
    Properties: {
        'value': GObject.ParamSpec.int(
            'value',
            'Value',
            'Orientation value',
            GObject.ParamFlags.READWRITE,
            0, 1, 0
        ),
    },
}, class Orientation extends GObject.Object {
    static HORIZONTAL = 0;
    static VERTICAL = 1;
});

export const Align = {
    FILL: 0,
    START: 1,
    END: 2,
    CENTER: 3,
    BASELINE: 4
};

export const PositionType = {
    LEFT: 0,
    RIGHT: 1,
    TOP: 2,
    BOTTOM: 3
};

// Register enum types with GObject
GObject.registerClass({
    GTypeName: 'MockAdwAlign',
    Enum: Align
}, class MockAdwAlign extends GObject.Object {});

GObject.registerClass({
    GTypeName: 'MockAdwPositionType',
    Enum: PositionType
}, class MockAdwPositionType extends GObject.Object {});

// Mock Adw.PreferencesWindow without GObject registration
export class PreferencesWindow {
    constructor() {
        this._pages = [];
    }

    add(page) {
        if (page) {
            this._pages.push(page);
        }
    }

    get_pages() {
        return this._pages;
    }

    destroy() {
        this._pages = [];
    }
}

// Mock Adw.PreferencesPage without GObject registration
export class PreferencesPage {
    constructor() {
        this._groups = [];
    }

    add(group) {
        if (group) {
            this._groups.push(group);
        }
    }

    get_groups() {
        return this._groups;
    }

    destroy() {
        this._groups = [];
    }
}

// Mock Adw.PreferencesGroup without GObject registration
export class PreferencesGroup {
    constructor() {
        this._rows = [];
    }

    add(row) {
        if (row) {
            this._rows.push(row);
        }
    }

    get_rows() {
        return this._rows;
    }

    destroy() {
        this._rows = [];
    }
}

// Mock Adw.ActionRow without GObject registration
export class ActionRow {
    constructor() {
        this._suffixes = [];
    }

    add_suffix(widget) {
        if (widget) {
            this._suffixes.push(widget);
        }
    }

    get_suffixes() {
        return this._suffixes;
    }

    destroy() {
        this._suffixes = [];
    }
}

// Mock Adw.Adjustment
export const Adjustment = GObject.registerClass({
    GTypeName: 'MockAdwAdjustment',
    Properties: {
        'value': GObject.ParamSpec.double(
            'value',
            'Value',
            'Current value',
            GObject.ParamFlags.READWRITE,
            0, 100, 0
        ),
        'lower': GObject.ParamSpec.double(
            'lower',
            'Lower',
            'Lower bound',
            GObject.ParamFlags.READWRITE,
            -Number.MAX_VALUE, Number.MAX_VALUE, 0
        ),
        'upper': GObject.ParamSpec.double(
            'upper',
            'Upper',
            'Upper bound',
            GObject.ParamFlags.READWRITE,
            -Number.MAX_VALUE, Number.MAX_VALUE, 100
        ),
        'step-increment': GObject.ParamSpec.double(
            'step-increment',
            'Step Increment',
            'Step increment value',
            GObject.ParamFlags.READWRITE,
            0, Number.MAX_VALUE, 1
        ),
    },
}, class Adjustment extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this._value = params.value || 0;
        this._lower = params.lower || 0;
        this._upper = params.upper || 100;
        this._stepIncrement = params.step_increment || 1;
    }

    get_value() {
        return this._value;
    }

    set_value(value) {
        this._value = Math.max(this._lower, Math.min(this._upper, value));
        this.notify('value');
    }

    get_lower() {
        return this._lower;
    }

    set_lower(lower) {
        this._lower = lower;
        this.notify('lower');
    }

    get_upper() {
        return this._upper;
    }

    set_upper(upper) {
        this._upper = upper;
        this.notify('upper');
    }

    get_step_increment() {
        return this._stepIncrement;
    }

    set_step_increment(step) {
        this._stepIncrement = step;
        this.notify('step-increment');
    }

    connect(signal, callback) {
        if (signal === 'value-changed') {
            this._valueChangedCallback = callback;
        }
        return 1;
    }

    emit_value_changed() {
        if (this._valueChangedCallback) {
            this._valueChangedCallback(this);
        }
    }
});