const { expect } = imports.chai;
const Extension = imports.extension;

describe('GNOME 47 Display Tests (X11)', () => {
    let extension;

    beforeEach(() => {
        extension = new Extension.Extension();
    });

    afterEach(() => {
        extension.cleanup();
    });

    it('should use new display manager', () => {
        expect(extension._useNewDisplayManager).to.be.true;
    });

    it('should use new background manager', () => {
        expect(extension._useNewBackgroundManager).to.be.true;
    });

    it('should use portal API', () => {
        expect(extension._usePortalAPI).to.be.true;
    });

    it('should use new window effects API', () => {
        const window = { meta_window: {} };
        extension._setWindowDimming(window, 50);
        expect(extension._lastWindowEffectMethod).to.equal('new');
    });

    it('should use new transformation API with portal support', () => {
        const displayManager = extension._getDisplayManager();
        expect(displayManager).to.be.instanceOf(DisplayManager.DisplayManager);
        expect(displayManager.hasPortalSupport).to.be.true;
    });
}); 