const { expect } = imports.chai;
const Extension = imports.extension;

describe('GNOME 45 Display Tests (Wayland)', () => {
    let extension;

    beforeEach(() => {
        extension = new Extension.Extension();
    });

    afterEach(() => {
        extension.cleanup();
    });

    it('should use legacy display manager in Wayland', () => {
        expect(extension._useNewDisplayManager).to.be.false;
    });

    it('should use legacy background manager in Wayland', () => {
        expect(extension._useNewBackgroundManager).to.be.false;
    });

    it('should handle Wayland-specific transformations', () => {
        const offset = { x: 1, y: 1 };
        extension._applyPixelShift(offset);
        expect(extension._lastTransformationMethod).to.equal('legacy-wayland');
    });

    it('should handle Wayland-specific window effects', () => {
        const window = { meta_window: { is_wayland_client: () => true } };
        extension._setWindowDimming(window, 50);
        expect(extension._lastWindowEffectMethod).to.equal('legacy-wayland');
    });
}); 