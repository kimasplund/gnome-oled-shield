const { expect } = imports.chai;
const Extension = imports.extension;

describe('GNOME 46 Display Tests (X11)', () => {
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

    it('should not use portal API', () => {
        expect(extension._usePortalAPI).to.be.false;
    });

    it('should use new transformation API for pixel shift', () => {
        const displayManager = extension._getDisplayManager();
        expect(displayManager).to.be.instanceOf(DisplayManager.DisplayManager);
    });

    it('should use new brightness API', () => {
        extension._setScreenDimming(50);
        // Verify the new API was called
        expect(extension._lastBrightnessMethod).to.equal('new');
    });
}); 