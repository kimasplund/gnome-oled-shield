const { expect } = imports.chai;
const Extension = imports.extension;

describe('GNOME 45 Display Tests (X11)', () => {
    let extension;

    beforeEach(() => {
        extension = new Extension.Extension();
    });

    afterEach(() => {
        extension.cleanup();
    });

    it('should use legacy display manager', () => {
        expect(extension._useNewDisplayManager).to.be.false;
    });

    it('should use legacy background manager', () => {
        expect(extension._useNewBackgroundManager).to.be.false;
    });

    it('should use legacy transformation for pixel shift', () => {
        const displayManager = extension._getDisplayManager();
        expect(displayManager).to.be.instanceOf(Meta.MonitorManager);
    });
}); 