'use strict';

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';

/**
 * Mock enums for Adwaita
 * @namespace
 */

/**
 * Orientation enum for widget orientation
 */
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

/**
 * Alignment enum for widget alignment
 */
export const Align = {
    FILL: 0,
    START: 1,
    END: 2,
    CENTER: 3,
    BASELINE: 4
};

/**
 * Position type enum for widget positioning
 */
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

/**
 * Mock implementation of Adw.PreferencesWindow
 */
@GObject.registerClass({
    GTypeName: 'MockAdwPreferencesWindow',
    Properties: {
        'visible-page': GObject.ParamSpec.object(
            'visible-page',
            'Visible Page',
            'Currently visible preferences page',
            GObject.ParamFlags.READWRITE,
            GObject.Object
        ),
    },
    Signals: {
        'close-request': {},
    }
})
export class PreferencesWindow extends GObject.Object {
    // Private fields
    #pages = [];
    #visiblePage = null;
    
    constructor(params = {}) {
        super(params);
    }
    
    /**
     * Add a page to the preferences window
     * @param {PreferencesPage} page - The page to add
     */
    add(page) {
        try {
            if (page) {
                this.#pages.push(page);
                
                // If this is the first page, make it visible
                if (this.#pages.length === 1 && !this.#visiblePage) {
                    this.#visiblePage = page;
                    this.notify('visible-page');
                }
            }
        } catch (error) {
            console.error('[MOCK] Error adding page:', error.message);
        }
    }
    
    /**
     * Get all pages in the preferences window
     * @returns {Array<PreferencesPage>} The pages
     */
    get_pages() {
        return [...this.#pages];
    }
    
    /**
     * Get the currently visible page
     * @returns {PreferencesPage|null} The visible page or null
     */
    get_visible_page() {
        return this.#visiblePage;
    }
    
    /**
     * Set the currently visible page
     * @param {PreferencesPage} page - The page to make visible
     */
    set_visible_page(page) {
        if (this.#pages.includes(page) && this.#visiblePage !== page) {
            this.#visiblePage = page;
            this.notify('visible-page');
        }
    }
    
    /**
     * Close the preferences window
     */
    close() {
        this.emit('close-request');
    }
    
    /**
     * Destroy the preferences window
     */
    destroy() {
        this.#pages = [];
        this.#visiblePage = null;
    }
}

/**
 * Mock implementation of Adw.PreferencesPage
 */
@GObject.registerClass({
    GTypeName: 'MockAdwPreferencesPage',
    Properties: {
        'title': GObject.ParamSpec.string(
            'title',
            'Title',
            'Page title',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'icon-name': GObject.ParamSpec.string(
            'icon-name',
            'Icon Name',
            'Page icon name',
            GObject.ParamFlags.READWRITE,
            ''
        ),
    }
})
export class PreferencesPage extends GObject.Object {
    // Private fields
    #groups = [];
    #title = '';
    #iconName = '';
    
    constructor(params = {}) {
        super(params);
        
        if (params.title) {
            this.#title = params.title;
        }
        
        if (params['icon-name']) {
            this.#iconName = params['icon-name'];
        }
    }
    
    /**
     * Add a group to the preferences page
     * @param {PreferencesGroup} group - The group to add
     */
    add(group) {
        try {
            if (group) {
                this.#groups.push(group);
            }
        } catch (error) {
            console.error('[MOCK] Error adding group:', error.message);
        }
    }
    
    /**
     * Get all groups in the preferences page
     * @returns {Array<PreferencesGroup>} The groups
     */
    get_groups() {
        return [...this.#groups];
    }
    
    /**
     * Get the page title
     * @returns {string} The title
     */
    get_title() {
        return this.#title;
    }
    
    /**
     * Set the page title
     * @param {string} title - The new title
     */
    set_title(title) {
        if (this.#title !== title) {
            this.#title = title ?? '';
            this.notify('title');
        }
    }
    
    /**
     * Get the page icon name
     * @returns {string} The icon name
     */
    get_icon_name() {
        return this.#iconName;
    }
    
    /**
     * Set the page icon name
     * @param {string} iconName - The new icon name
     */
    set_icon_name(iconName) {
        if (this.#iconName !== iconName) {
            this.#iconName = iconName ?? '';
            this.notify('icon-name');
        }
    }
    
    /**
     * Destroy the preferences page
     */
    destroy() {
        this.#groups = [];
    }
}

/**
 * Mock implementation of Adw.PreferencesGroup
 */
@GObject.registerClass({
    GTypeName: 'MockAdwPreferencesGroup',
    Properties: {
        'title': GObject.ParamSpec.string(
            'title',
            'Title',
            'Group title',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'description': GObject.ParamSpec.string(
            'description',
            'Description',
            'Group description',
            GObject.ParamFlags.READWRITE,
            ''
        ),
    }
})
export class PreferencesGroup extends GObject.Object {
    // Private fields
    #rows = [];
    #title = '';
    #description = '';
    
    constructor(params = {}) {
        super(params);
        
        if (params.title) {
            this.#title = params.title;
        }
        
        if (params.description) {
            this.#description = params.description;
        }
    }
    
    /**
     * Add a row to the preferences group
     * @param {PreferencesRow} row - The row to add
     */
    add(row) {
        try {
            if (row) {
                this.#rows.push(row);
            }
        } catch (error) {
            console.error('[MOCK] Error adding row:', error.message);
        }
    }
    
    /**
     * Get all rows in the preferences group
     * @returns {Array<PreferencesRow>} The rows
     */
    get_rows() {
        return [...this.#rows];
    }
    
    /**
     * Get the group title
     * @returns {string} The title
     */
    get_title() {
        return this.#title;
    }
    
    /**
     * Set the group title
     * @param {string} title - The new title
     */
    set_title(title) {
        if (this.#title !== title) {
            this.#title = title ?? '';
            this.notify('title');
        }
    }
    
    /**
     * Get the group description
     * @returns {string} The description
     */
    get_description() {
        return this.#description;
    }
    
    /**
     * Set the group description
     * @param {string} description - The new description
     */
    set_description(description) {
        if (this.#description !== description) {
            this.#description = description ?? '';
            this.notify('description');
        }
    }
    
    /**
     * Destroy the preferences group
     */
    destroy() {
        this.#rows = [];
    }
}

/**
 * Mock implementation of Adw.ActionRow
 */
@GObject.registerClass({
    GTypeName: 'MockAdwActionRow',
    Properties: {
        'title': GObject.ParamSpec.string(
            'title',
            'Title',
            'Row title',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'subtitle': GObject.ParamSpec.string(
            'subtitle',
            'Subtitle',
            'Row subtitle',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'activatable': GObject.ParamSpec.boolean(
            'activatable',
            'Activatable',
            'Whether the row is activatable',
            GObject.ParamFlags.READWRITE,
            true
        ),
    },
    Signals: {
        'activated': {}
    }
})
export class ActionRow extends GObject.Object {
    // Private fields
    #suffixes = [];
    #title = '';
    #subtitle = '';
    #activatable = true;
    
    constructor(params = {}) {
        super(params);
        
        if (params.title) {
            this.#title = params.title;
        }
        
        if (params.subtitle) {
            this.#subtitle = params.subtitle;
        }
        
        if (params.activatable !== undefined) {
            this.#activatable = Boolean(params.activatable);
        }
    }
    
    /**
     * Add a suffix widget to the row
     * @param {GObject.Object} widget - The widget to add
     */
    add_suffix(widget) {
        try {
            if (widget) {
                this.#suffixes.push(widget);
            }
        } catch (error) {
            console.error('[MOCK] Error adding suffix:', error.message);
        }
    }
    
    /**
     * Get all suffix widgets
     * @returns {Array<GObject.Object>} The suffix widgets
     */
    get_suffixes() {
        return [...this.#suffixes];
    }
    
    /**
     * Get the row title
     * @returns {string} The title
     */
    get_title() {
        return this.#title;
    }
    
    /**
     * Set the row title
     * @param {string} title - The new title
     */
    set_title(title) {
        if (this.#title !== title) {
            this.#title = title ?? '';
            this.notify('title');
        }
    }
    
    /**
     * Get the row subtitle
     * @returns {string} The subtitle
     */
    get_subtitle() {
        return this.#subtitle;
    }
    
    /**
     * Set the row subtitle
     * @param {string} subtitle - The new subtitle
     */
    set_subtitle(subtitle) {
        if (this.#subtitle !== subtitle) {
            this.#subtitle = subtitle ?? '';
            this.notify('subtitle');
        }
    }
    
    /**
     * Check if the row is activatable
     * @returns {boolean} Whether the row is activatable
     */
    get_activatable() {
        return this.#activatable;
    }
    
    /**
     * Set whether the row is activatable
     * @param {boolean} activatable - Whether the row should be activatable
     */
    set_activatable(activatable) {
        const value = Boolean(activatable);
        if (this.#activatable !== value) {
            this.#activatable = value;
            this.notify('activatable');
        }
    }
    
    /**
     * Activate the row
     */
    activate() {
        if (this.#activatable) {
            this.emit('activated');
            return true;
        }
        return false;
    }
    
    /**
     * Destroy the action row
     */
    destroy() {
        this.#suffixes = [];
    }
}

/**
 * Mock implementation of Adw.Adjustment
 */
@GObject.registerClass({
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
    Signals: {
        'value-changed': {}
    }
})
export class Adjustment extends GObject.Object {
    // Private fields
    #value = 0;
    #lower = 0;
    #upper = 100;
    #stepIncrement = 1;
    
    constructor(params = {}) {
        super(params);
        
        // Initialize with provided values
        this.#value = params.value ?? 0;
        this.#lower = params.lower ?? 0;
        this.#upper = params.upper ?? 100;
        this.#stepIncrement = params.step_increment ?? 1;
        
        // Ensure value is within bounds
        this.#value = Math.max(this.#lower, Math.min(this.#upper, this.#value));
    }
    
    /**
     * Get the current value
     * @returns {number} The current value
     */
    get_value() {
        return this.#value;
    }
    
    /**
     * Set the current value
     * @param {number} value - The new value
     */
    set_value(value) {
        const newValue = Math.max(this.#lower, Math.min(this.#upper, value));
        
        if (this.#value !== newValue) {
            this.#value = newValue;
            this.notify('value');
            this.emit('value-changed');
        }
    }
    
    /**
     * Get the lower bound
     * @returns {number} The lower bound
     */
    get_lower() {
        return this.#lower;
    }
    
    /**
     * Set the lower bound
     * @param {number} lower - The new lower bound
     */
    set_lower(lower) {
        if (this.#lower !== lower) {
            this.#lower = lower;
            
            // Ensure value is still within bounds
            if (this.#value < this.#lower) {
                this.set_value(this.#lower);
            }
            
            this.notify('lower');
        }
    }
    
    /**
     * Get the upper bound
     * @returns {number} The upper bound
     */
    get_upper() {
        return this.#upper;
    }
    
    /**
     * Set the upper bound
     * @param {number} upper - The new upper bound
     */
    set_upper(upper) {
        if (this.#upper !== upper) {
            this.#upper = upper;
            
            // Ensure value is still within bounds
            if (this.#value > this.#upper) {
                this.set_value(this.#upper);
            }
            
            this.notify('upper');
        }
    }
    
    /**
     * Get the step increment
     * @returns {number} The step increment
     */
    get_step_increment() {
        return this.#stepIncrement;
    }
    
    /**
     * Set the step increment
     * @param {number} step - The new step increment
     */
    set_step_increment(step) {
        if (this.#stepIncrement !== step && step > 0) {
            this.#stepIncrement = step;
            this.notify('step-increment');
        }
    }
    
    /**
     * Emit the value-changed signal
     */
    emit_value_changed() {
        this.emit('value-changed');
    }
}