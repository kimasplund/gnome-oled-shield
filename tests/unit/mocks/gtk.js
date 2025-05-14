'use strict';

import GObject from 'gi://GObject';
import { Adjustment } from './adw.js';

// Mock Gtk enums
const GtkAlign = GObject.registerClass({
    GTypeName: 'MockGtkAlign',
    Properties: {
        'value': GObject.ParamSpec.int(
            'value',
            'Value',
            'Align value',
            GObject.ParamFlags.READWRITE,
            0, 4, 0
        ),
    },
}, class GtkAlign extends GObject.Object {});

export const Align = {
    FILL: 0,
    START: 1,
    END: 2,
    CENTER: 3,
    BASELINE: 4,
    _gtype: GtkAlign.$gtype
};

const GtkOrientation = GObject.registerClass({
    GTypeName: 'MockGtkOrientation',
    Properties: {
        'value': GObject.ParamSpec.int(
            'value',
            'Value',
            'Orientation value',
            GObject.ParamFlags.READWRITE,
            0, 1, 0
        ),
    },
}, class GtkOrientation extends GObject.Object {});

export const Orientation = {
    HORIZONTAL: 0,
    VERTICAL: 1,
    _gtype: GtkOrientation.$gtype
};

const PositionType = GObject.registerClass({
    Properties: {
        'value': GObject.ParamSpec.int(
            'value',
            'Value',
            'Position value',
            GObject.ParamFlags.READWRITE,
            0, 3, 0
        ),
    },
}, class PositionType extends GObject.Object {});

export const Position = {
    LEFT: 0,
    RIGHT: 1,
    TOP: 2,
    BOTTOM: 3,
    _gtype: PositionType.$gtype
};

// Mock Gtk.Box
export const Box = GObject.registerClass({
    GTypeName: 'MockGtkBox',
    Properties: {
        'orientation': GObject.ParamSpec.int(
            'orientation',
            'Orientation',
            'Box orientation',
            GObject.ParamFlags.READWRITE,
            0, 1, Orientation.HORIZONTAL
        ),
        'spacing': GObject.ParamSpec.int(
            'spacing',
            'Spacing',
            'Box spacing',
            GObject.ParamFlags.READWRITE,
            0, 1000, 0
        ),
        'homogeneous': GObject.ParamSpec.boolean(
            'homogeneous',
            'Homogeneous',
            'Whether the box is homogeneous',
            GObject.ParamFlags.READWRITE,
            false
        ),
    },
}, class Box extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this.orientation = params.orientation || Orientation.HORIZONTAL;
        this.spacing = params.spacing || 0;
        this.homogeneous = params.homogeneous || false;
        this.valign = params.valign || Align.FILL;
        this._children = [];
        this._visible = true;
        this._destroyed = false;
    }

    append(widget) {
        if (widget && !this._destroyed) {
            this._children.push(widget);
        }
    }

    remove(widget) {
        if (widget && !this._destroyed) {
            const index = this._children.indexOf(widget);
            if (index !== -1) {
                this._children.splice(index, 1);
            }
        }
    }

    get_children() {
        return this._children;
    }

    set_visible(visible) {
        this._visible = visible;
    }

    get_visible() {
        return this._visible;
    }

    destroy() {
        this._destroyed = true;
        this._children.forEach(child => {
            if (child && typeof child.destroy === 'function') {
                child.destroy();
            }
        });
        this._children = [];
    }
});

// Mock Gtk.Switch
export const Switch = GObject.registerClass({
    GTypeName: 'MockGtkSwitch',
    Properties: {
        'active': GObject.ParamSpec.boolean(
            'active',
            'Active',
            'Switch state',
            GObject.ParamFlags.READWRITE,
            false
        ),
        'valign': GObject.ParamSpec.int(
            'valign',
            'Vertical Alignment',
            'Vertical alignment',
            GObject.ParamFlags.READWRITE,
            0, 4, Align.FILL
        ),
    },
}, class Switch extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this.active = params.active || false;
        this.valign = params.valign || Align.FILL;
        this._sensitive = true;
        this._visible = true;
    }

    set_active(active) {
        this.active = active;
        if (this._stateSetCallback) {
            this._stateSetCallback(this, active);
        }
    }

    get_active() {
        return this.active;
    }

    set_sensitive(sensitive) {
        this._sensitive = sensitive;
    }

    get_sensitive() {
        return this._sensitive;
    }

    set_visible(visible) {
        this._visible = visible;
    }

    get_visible() {
        return this._visible;
    }

    connect(signal, callback) {
        if (signal === 'state-set') {
            this._stateSetCallback = callback;
        }
        return 1;
    }
});

// Mock Gtk.Scale
export const Scale = GObject.registerClass({
    GTypeName: 'MockGtkScale'
}, class Scale extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this._orientation = params.orientation || Orientation.HORIZONTAL;
        this._adjustment = params.adjustment || new Adjustment();
        this.valign = params.valign || Align.FILL;
        this._sensitive = true;
        this._visible = true;
    }

    get adjustment() {
        return this._adjustment;
    }

    set adjustment(adj) {
        this._adjustment = adj;
    }

    set_sensitive(sensitive) {
        this._sensitive = sensitive;
    }

    get_sensitive() {
        return this._sensitive;
    }

    set_visible(visible) {
        this._visible = visible;
    }

    get_visible() {
        return this._visible;
    }

    set_size_request(width, height) {
        this._width = width;
        this._height = height;
    }

    set_value_pos(pos) {
        this._valuePos = pos;
    }

    set_draw_value(draw) {
        this._drawValue = draw;
    }

    set_digits(digits) {
        this._digits = digits;
    }

    connect(signal, callback) {
        if (signal === 'value-changed') {
            this._valueChangedCallback = callback;
        }
        return 1; // Return a handler ID
    }

    emit_value_changed() {
        if (this._valueChangedCallback) {
            this._valueChangedCallback(this);
        }
    }
});

// Mock Gtk.Entry
export const Entry = GObject.registerClass({
    GTypeName: 'MockGtkEntry'
}, class Entry extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this._text = params.text || '';
        this.valign = params.valign || Align.FILL;
        this.width_chars = params.width_chars || 0;
        this._visible = true;
        this._sensitive = true;
    }

    get_text() {
        return this._text;
    }

    set_text(text) {
        this._text = text;
        if (this._changedCallback) {
            this._changedCallback();
        }
    }

    set_visible(visible) {
        this._visible = visible;
    }

    get_visible() {
        return this._visible;
    }

    set_sensitive(sensitive) {
        this._sensitive = sensitive;
    }

    get_sensitive() {
        return this._sensitive;
    }

    connect(signal, callback) {
        if (signal === 'changed') {
            this._changedCallback = callback;
        }
        return 1; // Return a handler ID
    }
});

// Mock Gtk.Label
export const Label = GObject.registerClass({
    GTypeName: 'MockGtkLabel'
}, class Label extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this._label = params.label || '';
        this.css_classes = params.css_classes || [];
        this._visible = true;
        this._sensitive = true;
    }

    get_label() {
        return this._label;
    }

    set_label(label) {
        this._label = label;
    }

    set_text(text) {
        this._label = text;
    }

    get_text() {
        return this._label;
    }

    set_visible(visible) {
        this._visible = visible;
    }

    get_visible() {
        return this._visible;
    }

    set_sensitive(sensitive) {
        this._sensitive = sensitive;
    }

    get_sensitive() {
        return this._sensitive;
    }

    set_css_classes(classes) {
        this.css_classes = classes;
    }

    get_css_classes() {
        return this.css_classes;
    }
});

// Mock Gtk.Button
export const Button = GObject.registerClass({
    GTypeName: 'MockGtkButton'
}, class Button extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this._label = params.label || '';
        this.css_classes = params.css_classes || [];
        this._visible = true;
        this._sensitive = params.sensitive !== undefined ? params.sensitive : true;
    }

    set_label(label) {
        this._label = label;
    }

    get_label() {
        return this._label;
    }

    set_visible(visible) {
        this._visible = visible;
    }

    get_visible() {
        return this._visible;
    }

    set_sensitive(sensitive) {
        this._sensitive = sensitive;
    }

    get_sensitive() {
        return this._sensitive;
    }

    set_css_classes(classes) {
        this.css_classes = classes;
    }

    get_css_classes() {
        return this.css_classes;
    }

    connect(signal, callback) {
        if (signal === 'clicked') {
            this._clickedCallback = callback;
        }
        return 1; // Return a handler ID
    }

    emit_clicked() {
        if (this._clickedCallback) {
            this._clickedCallback(this);
        }
    }
});

// Mock Gtk.ProgressBar
export const ProgressBar = GObject.registerClass({
    GTypeName: 'MockGtkProgressBar'
}, class ProgressBar extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this._fraction = params.fraction || 0;
        this._text = '';
        this._showText = false;
        this._visible = params.visible !== undefined ? params.visible : true;
    }

    set_fraction(fraction) {
        this._fraction = Math.max(0, Math.min(1, fraction));
    }

    get_fraction() {
        return this._fraction;
    }

    set_text(text) {
        this._text = text;
    }

    get_text() {
        return this._text;
    }

    set_show_text(show) {
        this._showText = show;
    }

    get_show_text() {
        return this._showText;
    }

    set_visible(visible) {
        this._visible = visible;
    }

    get_visible() {
        return this._visible;
    }
});

// Mock Gtk.SpinButton
export const SpinButton = GObject.registerClass({
    GTypeName: 'MockGtkSpinButton',
    Properties: {
        'value': GObject.ParamSpec.double(
            'value',
            'Value',
            'Current value',
            GObject.ParamFlags.READWRITE,
            -Number.MAX_VALUE, Number.MAX_VALUE, 0
        ),
        'valign': GObject.ParamSpec.int(
            'valign',
            'Vertical Alignment',
            'Vertical alignment',
            GObject.ParamFlags.READWRITE,
            0, 4, Align.FILL
        ),
    },
}, class SpinButton extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this._adjustment = params.adjustment || new Adjustment();
        this.valign = params.valign || Align.FILL;
        this._sensitive = true;
        this._visible = true;
        this._digits = 0;
        this._numeric = true;
        this._climbRate = 1;
    }

    get adjustment() {
        return this._adjustment;
    }

    set adjustment(adj) {
        this._adjustment = adj;
    }

    get_value() {
        return this._adjustment.get_value();
    }

    set_value(value) {
        this._adjustment.set_value(value);
    }

    set_sensitive(sensitive) {
        this._sensitive = sensitive;
    }

    get_sensitive() {
        return this._sensitive;
    }

    set_visible(visible) {
        this._visible = visible;
    }

    get_visible() {
        return this._visible;
    }

    connect(signal, callback) {
        if (signal === 'value-changed') {
            this._valueChangedCallback = callback;
        }
        return 1;
    }
});

// Mock Gtk.Window
export const Window = GObject.registerClass({
    GTypeName: 'MockGtkWindow',
    Properties: {
        'title': GObject.ParamSpec.string(
            'title', 'title', 'title',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'visible': GObject.ParamSpec.boolean(
            'visible', 'visible', 'visible',
            GObject.ParamFlags.READWRITE,
            false
        )
    }
}, class Window extends GObject.Object {
    constructor(params = {}) {
        super(params);
        this._title = params.title || '';
        this._visible = params.visible || false;
        this._defaultSize = { width: 800, height: 600 };
        this._child = null;
        this._destroyed = false;
        this._widgets = new Set();
    }

    set_title(title) {
        this._title = title;
    }

    get_title() {
        return this._title;
    }

    set_visible(visible) {
        this._visible = visible;
    }

    get_visible() {
        return this._visible;
    }

    set_default_size(width, height) {
        this._defaultSize = { width, height };
    }

    get_default_size() {
        return this._defaultSize;
    }

    set_child(child) {
        if (this._child) {
            this._widgets.delete(this._child);
        }
        this._child = child;
        if (child) {
            this._widgets.add(child);
        }
    }

    get_child() {
        return this._child;
    }

    add(widget) {
        this._widgets.add(widget);
    }

    remove(widget) {
        this._widgets.delete(widget);
        if (this._child === widget) {
            this._child = null;
        }
    }

    get_widgets() {
        return Array.from(this._widgets);
    }

    present() {
        this._visible = true;
    }

    close() {
        this._visible = false;
    }

    destroy() {
        this._widgets.clear();
        this._child = null;
        this._destroyed = true;
        this._visible = false;
    }
}); 