'use strict';

// Import GJS environment setup
import '../gi-module-loader.js';

// Import necessary modules
import SignalManager from '../../lib/signalManager.js';
import GObject from '../mocks/gobject.js';

describe('SignalManager', () => {
    let signalManager;
    let emitter;
    
    // Helper function to create an emitter object
    function createEmitter() {
        // Create a simple GObject-based signal emitter
        const EmitterClass = GObject.registerClass({
            Properties: {
                'test-property': {
                    default: 'initial'
                }
            },
            Signals: {
                'test-signal': {},
                'other-signal': {}
            }
        });
        
        return new EmitterClass();
    }
    
    beforeEach(() => {
        signalManager = new SignalManager();
        emitter = createEmitter();
    });
    
    it('should connect signals', () => {
        // Create a spy for the signal handler
        const handler = jasmine.createSpy('signalHandler');
        
        // Connect to the signal
        const id = signalManager.connect(emitter, 'test-signal', handler);
        
        // Verify connection was successful
        expect(id).toBeDefined();
        expect(typeof id).toBe('number');
        
        // Emit the signal
        emitter.emit('test-signal', 'test-arg');
        
        // Verify the handler was called
        expect(handler).toHaveBeenCalled();
        expect(handler).toHaveBeenCalledWith('test-arg');
    });
    
    it('should disconnect signals by ID', async () => {
        // Create a spy for the signal handler
        const handler = jasmine.createSpy('signalHandler');
        
        // Connect to the signal
        const id = signalManager.connect(emitter, 'test-signal', handler);
        
        // Disconnect the signal
        await signalManager.disconnect(id);
        
        // Emit the signal
        emitter.emit('test-signal', 'test-arg');
        
        // Verify the handler was not called
        expect(handler).not.toHaveBeenCalled();
    });
    
    it('should disconnect signals by object', async () => {
        // Create spies for signal handlers
        const handler1 = jasmine.createSpy('signalHandler1');
        const handler2 = jasmine.createSpy('signalHandler2');
        
        // Connect to different signals on the same object
        signalManager.connect(emitter, 'test-signal', handler1);
        signalManager.connect(emitter, 'other-signal', handler2);
        
        // Disconnect all signals for the emitter
        await signalManager.disconnectByObject(emitter);
        
        // Emit both signals
        emitter.emit('test-signal', 'test-arg1');
        emitter.emit('other-signal', 'test-arg2');
        
        // Verify neither handler was called
        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).not.toHaveBeenCalled();
    });
    
    it('should disconnect signals by tag', async () => {
        // Create spies for signal handlers
        const handler1 = jasmine.createSpy('signalHandler1');
        const handler2 = jasmine.createSpy('signalHandler2');
        const handler3 = jasmine.createSpy('signalHandler3');
        
        // Connect signals with different tags
        signalManager.connect(emitter, 'test-signal', handler1, 'group1');
        signalManager.connect(emitter, 'other-signal', handler2, 'group1');
        signalManager.connect(emitter, 'test-signal', handler3, 'group2');
        
        // Disconnect signals with tag 'group1'
        await signalManager.disconnectByTag('group1');
        
        // Emit both signals
        emitter.emit('test-signal', 'test-arg1');
        emitter.emit('other-signal', 'test-arg2');
        
        // Verify that only handlers from group1 were disconnected
        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).not.toHaveBeenCalled();
        expect(handler3).toHaveBeenCalled();
    });
    
    it('should handle property change signals', () => {
        // Create a spy for the property change handler
        const handler = jasmine.createSpy('propertyHandler');
        
        // Connect to the property change signal
        signalManager.connect(emitter, 'notify::test-property', handler);
        
        // Change the property
        emitter.set_property('test-property', 'new-value');
        
        // Verify the handler was called
        expect(handler).toHaveBeenCalled();
    });
    
    it('should handle connect_after', () => {
        // Create spies for signal handlers
        const normalHandler = jasmine.createSpy('normalHandler');
        const afterHandler = jasmine.createSpy('afterHandler');
        
        // Track call order
        let normalCalled = false;
        let afterCalled = false;
        
        normalHandler.and.callFake(() => {
            normalCalled = true;
            expect(afterCalled).toBe(false);
        });
        
        afterHandler.and.callFake(() => {
            afterCalled = true;
            expect(normalCalled).toBe(true);
        });
        
        // Connect handlers
        signalManager.connect(emitter, 'test-signal', normalHandler);
        signalManager.connectAfter(emitter, 'test-signal', afterHandler);
        
        // Emit the signal
        emitter.emit('test-signal');
        
        // Verify both handlers were called
        expect(normalHandler).toHaveBeenCalled();
        expect(afterHandler).toHaveBeenCalled();
    });
    
    it('should handle multiple connections to the same signal', () => {
        // Create spies for signal handlers
        const handler1 = jasmine.createSpy('handler1');
        const handler2 = jasmine.createSpy('handler2');
        
        // Connect multiple handlers to the same signal
        signalManager.connect(emitter, 'test-signal', handler1);
        signalManager.connect(emitter, 'test-signal', handler2);
        
        // Emit the signal
        emitter.emit('test-signal', 'test-arg');
        
        // Verify both handlers were called
        expect(handler1).toHaveBeenCalledWith('test-arg');
        expect(handler2).toHaveBeenCalledWith('test-arg');
    });
    
    it('should track signal connection statistics', () => {
        // Connect several signals
        signalManager.connect(emitter, 'test-signal', () => {});
        signalManager.connect(emitter, 'test-signal', () => {});
        signalManager.connect(emitter, 'other-signal', () => {});
        
        // Get statistics
        const stats = signalManager.getStatistics();
        
        // Verify statistics
        expect(stats.totalConnections).toBe(3);
        expect(stats.activeConnections).toBe(3);
        expect(stats.disconnectedConnections).toBe(0);
        
        // Verify signal patterns
        expect(stats.signalPatterns['test-signal']).toBe(2);
        expect(stats.signalPatterns['other-signal']).toBe(1);
    });
    
    it('should support one-time signal connections', async () => {
        // Create a spy for the signal handler
        const handler = jasmine.createSpy('oneTimeHandler');
        
        // Connect a one-time signal handler
        const id = signalManager.connectOnce(emitter, 'test-signal', handler);
        
        // Emit the signal twice
        emitter.emit('test-signal', 'first-call');
        emitter.emit('test-signal', 'second-call');
        
        // Verify the handler was called only once
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('first-call');
    });
});