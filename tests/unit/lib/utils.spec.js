// Mock utilities module
const utils = {
    formatTime: (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    },
    
    checkIsOled: (display) => {
        if (!display) return false;
        return display.toLowerCase().includes('oled');
    }
};

describe('Utils', () => {
    describe('formatTime', () => {
        it('should format seconds to mm:ss correctly', () => {
            expect(utils.formatTime(65)).toBe('1:05');
            expect(utils.formatTime(3600)).toBe('60:00');
            expect(utils.formatTime(0)).toBe('0:00');
        });
    });
    
    describe('checkIsOled', () => {
        it('should detect OLED displays correctly', () => {
            expect(utils.checkIsOled('Samsung OLED Display')).toBe(true);
            expect(utils.checkIsOled('Dell LCD Monitor')).toBe(false);
            // If display is null, checkIsOled should return false
            expect(utils.checkIsOled(null)).toBe(false);
        });
    });
}); 