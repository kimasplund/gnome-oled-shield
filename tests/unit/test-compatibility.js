'use strict';

// Import GJS environment setup
import '../gi-module-loader.js';

// Import the module to test
import {
    WeakRefImpl,
    FinalizationRegistryImpl,
    allSettled,
    AbortControllerImpl,
    features,
    nullishAssign,
    orAssign,
    andAssign
} from '../../lib/compatibility.js';

describe('Compatibility Module', () => {
    it('should provide WeakRef implementation', () => {
        // Create a WeakRef
        const obj = { test: 'value' };
        const ref = new WeakRefImpl(obj);
        
        // Verify the object can be dereferenced
        const dereferenced = ref.deref();
        expect(dereferenced).toBe(obj);
        expect(dereferenced.test).toBe('value');
        
        // Test error handling
        expect(() => new WeakRefImpl(null)).toThrow();
        expect(() => new WeakRefImpl(undefined)).toThrow();
        expect(() => new WeakRefImpl(123)).toThrow();
    });
    
    it('should provide FinalizationRegistry implementation', () => {
        // Create a cleanup callback
        const cleanup = jasmine.createSpy('cleanup');
        
        // Create a registry
        const registry = new FinalizationRegistryImpl(cleanup);
        
        // Register an object
        const obj = { test: 'value' };
        const token = { unregister: true };
        registry.register(obj, 'cleanup-value', token);
        
        // Test unregister
        registry.unregister(token);
        
        // Test error handling
        expect(() => new FinalizationRegistryImpl(null)).toThrow();
        expect(() => new FinalizationRegistryImpl(undefined)).toThrow();
        expect(() => new FinalizationRegistryImpl('not-a-function')).toThrow();
        expect(() => registry.register(null, 'value')).toThrow();
        
        // Cleanup
        registry.destroy();
    });
    
    it('should provide Promise.allSettled implementation', async () => {
        // Create some test promises
        const promise1 = Promise.resolve('success');
        const promise2 = Promise.reject('failure');
        const promise3 = Promise.resolve(42);
        
        // Use the allSettled implementation
        const results = await allSettled([promise1, promise2, promise3]);
        
        // Verify the results
        expect(results.length).toBe(3);
        
        expect(results[0].status).toBe('fulfilled');
        expect(results[0].value).toBe('success');
        
        expect(results[1].status).toBe('rejected');
        expect(results[1].reason).toBe('failure');
        
        expect(results[2].status).toBe('fulfilled');
        expect(results[2].value).toBe(42);
    });
    
    it('should provide AbortController implementation', () => {
        // Create an AbortController
        const controller = new AbortControllerImpl();
        
        // Verify it has a signal
        expect(controller.signal).toBeDefined();
        expect(controller.signal.aborted).toBe(false);
        
        // Add an event listener
        const abortHandler = jasmine.createSpy('abortHandler');
        controller.signal.addEventListener('abort', abortHandler);
        
        // Abort the controller
        controller.abort('test-reason');
        
        // Verify the signal was aborted
        expect(controller.signal.aborted).toBe(true);
        expect(controller.signal.reason).toBe('test-reason');
        
        // Verify the listener was called (may be async)
        setTimeout(() => {
            expect(abortHandler).toHaveBeenCalled();
        }, 10);
        
        // Add a listener after abort
        const lateHandler = jasmine.createSpy('lateHandler');
        controller.signal.addEventListener('abort', lateHandler);
        
        // Verify it gets called too
        setTimeout(() => {
            expect(lateHandler).toHaveBeenCalled();
        }, 10);
    });
    
    it('should provide feature detection', () => {
        // Verify feature detection results are available
        expect(features).toBeDefined();
        expect(typeof features.hasNativeWeakRef).toBe('boolean');
        expect(typeof features.hasNativeFinalizationRegistry).toBe('boolean');
        expect(typeof features.hasNativePromiseAllSettled).toBe('boolean');
        expect(typeof features.hasNativeAbortController).toBe('boolean');
        expect(typeof features.hasNativeLogicalAssignment).toBe('boolean');
    });
    
    it('should provide logical assignment helper functions', () => {
        // Test nullishAssign
        const obj1 = { a: null };
        nullishAssign(obj1, 'a', 'value');
        expect(obj1.a).toBe('value');

        const obj2 = { a: 'existing' };
        nullishAssign(obj2, 'a', 'value');
        expect(obj2.a).toBe('existing');

        // Test orAssign
        const obj3 = { a: false };
        orAssign(obj3, 'a', 'value');
        expect(obj3.a).toBe('value');

        const obj4 = { a: 'existing' };
        orAssign(obj4, 'a', 'value');
        expect(obj4.a).toBe('existing');

        // Test andAssign
        const obj5 = { a: true };
        andAssign(obj5, 'a', 'value');
        expect(obj5.a).toBe('value');

        const obj6 = { a: false };
        andAssign(obj6, 'a', 'value');
        expect(obj6.a).toBe(false);
    });
});