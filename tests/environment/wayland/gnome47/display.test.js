const { expect } = imports.chai;
const Extension = imports.extension;

describe('GNOME 47 Display Tests (Wayland)', () => {
    let extension;

    beforeEach(() => {
        extension = new Extension.Extension();
    });

    afterEach(() => {
        extension.cleanup();
    });

    it('should use new display manager with portal support in Wayland', () => {
        expect(extension._useNewDisplayManager).to.be.true;
        expect(extension._usePortalAPI).to.be.true;
    });

    it('should use new background manager with portal support', () => {
        expect(extension._useNewBackgroundManager).to.be.true;
        const bgManager = extension._getBackgroundManager();
        expect(bgManager.hasPortalSupport).to.be.true;
    });

    it('should handle Wayland-specific transformations with portal API', () => {
        const offset = { x: 1, y: 1 };
        extension._applyPixelShift(offset);
        expect(extension._lastTransformationMethod).to.equal('portal-wayland');
    });

    it('should use portal API for brightness control', () => {
        extension._setScreenDimming(50);
        expect(extension._lastBrightnessMethod).to.equal('portal');
    });

    it('should handle Wayland-specific window effects with portal API', () => {
        const window = { meta_window: { is_wayland_client: () => true } };
        extension._setWindowDimming(window, 50);
        expect(extension._lastWindowEffectMethod).to.equal('portal-wayland');
    });

    it('should use portal API for screen recording protection', () => {
        extension._initScreenProtection();
        expect(extension._lastScreenProtectionMethod).to.equal('portal');
    });
}); 