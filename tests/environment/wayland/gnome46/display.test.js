const { expect } = imports.chai;
const Extension = imports.extension;

describe('GNOME 46 Display Tests (Wayland)', () => {
    let extension;

    beforeEach(() => {
        extension = new Extension.Extension();
    });

    afterEach(() => {
        extension.cleanup();
    });

    it('should use new display manager in Wayland', () => {
        expect(extension._useNewDisplayManager).to.be.true;
    });

    it('should use new background manager in Wayland', () => {
        expect(extension._useNewBackgroundManager).to.be.true;
    });

    it('should handle Wayland-specific transformations with new API', () => {
        const offset = { x: 1, y: 1 };
        extension._applyPixelShift(offset);
        expect(extension._lastTransformationMethod).to.equal('new-wayland');
    });

    it('should use new brightness API in Wayland', () => {
        extension._setScreenDimming(50);
        expect(extension._lastBrightnessMethod).to.equal('new-wayland');
    });

    it('should handle Wayland-specific window effects with new API', () => {
        const window = { meta_window: { is_wayland_client: () => true } };
        extension._setWindowDimming(window, 50);
        expect(extension._lastWindowEffectMethod).to.equal('new-wayland');
    });
}); 