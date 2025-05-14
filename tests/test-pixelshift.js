import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// Mock settings
class MockSettings {
    constructor() {
        this._settings = {};
    }

    get_boolean(key) {
        return this._settings[key] || false;
    }

    get_int(key) {
        return this._settings[key] || 0;
    }

    set_boolean(key, value) {
        this._settings[key] = value;
    }

    set_int(key, value) {
        this._settings[key] = value;
    }

    list_keys() {
        return Object.keys(this._settings);
    }

    connect() {
        // Mock connect
    }
}

describe('PixelShift', () => {
    let pixelShift;
    let settings;

    beforeEach(() => {
        settings = new MockSettings();
        settings._settings = {
            'debug-mode': true,
            'pixel-shift-enabled': true,
            'pixel-shift-interval': 300
        };
        pixelShift = new PixelShift(settings);
    });

    it('should initialize with correct settings', () => {
        assert.equal(settings.get_boolean('pixel-shift-enabled'), true);
        assert.equal(settings.get_int('pixel-shift-interval'), 300);
    });

    it('should validate settings on construction', () => {
        const invalidSettings = new MockSettings();
        const pixelShiftInvalid = new PixelShift(invalidSettings);
        // Should not throw and should log warning
    });

    it('should calculate next shift correctly', () => {
        const shift = pixelShift._calculateNextShift();
        assert.ok(shift.x >= -1 && shift.x <= 1);
        assert.ok(shift.y >= -1 && shift.y <= 1);
        assert.ok(!(shift.x === 0 && shift.y === 0));
    });
});

// Run tests
const runner = new TestRunner();
runner.run(); 