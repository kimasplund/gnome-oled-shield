'use strict';

// Import GJS environment setup
import '../gi-module-loader.js';

// Import the module to test
import ResourceManager from '../../lib/resourceManager.js';

describe('ResourceManager', () => {
    let resourceManager;
    
    beforeEach(() => {
        resourceManager = new ResourceManager();
    });
    
    it('should track resources', () => {
        // Create a resource
        const resource = { id: 1, name: 'test-resource' };
        
        // Track the resource with a cleanup function
        const id = resourceManager.track(
            resource,
            () => { resource.cleaned = true; },
            'test',
            { name: 'test-resource' }
        );
        
        // Verify that an ID was returned
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
        
        // Verify that the resource is tracked
        const trackedResources = resourceManager.getTrackedResourceCount();
        expect(trackedResources).toBe(1);
    });
    
    it('should cleanup resources when explicitly requested', async () => {
        // Create resources to track
        const resource1 = { id: 1, name: 'resource1' };
        const resource2 = { id: 2, name: 'resource2' };
        
        // Mock cleanup functions
        const cleanup1 = jasmine.createSpy('cleanup1');
        const cleanup2 = jasmine.createSpy('cleanup2');
        
        // Track the resources
        const id1 = resourceManager.track(resource1, cleanup1, 'test', { name: 'resource1' });
        const id2 = resourceManager.track(resource2, cleanup2, 'test', { name: 'resource2' });
        
        // Cleanup the first resource
        await resourceManager.cleanup(id1);
        
        // Verify that only the first cleanup function was called
        expect(cleanup1).toHaveBeenCalled();
        expect(cleanup2).not.toHaveBeenCalled();
        
        // Verify that the tracked resource count decreased
        expect(resourceManager.getTrackedResourceCount()).toBe(1);
    });
    
    it('should handle resource bundles', async () => {
        // Create a resource bundle
        const bundle = resourceManager.createBundle('test-bundle');
        
        // Create resources
        const resource1 = { id: 1, name: 'bundled-resource1' };
        const resource2 = { id: 2, name: 'bundled-resource2' };
        
        // Mock cleanup functions
        const cleanup1 = jasmine.createSpy('cleanup1');
        const cleanup2 = jasmine.createSpy('cleanup2');
        
        // Track the resources in the bundle
        bundle.track(resource1, cleanup1, 'test', { name: 'bundled-resource1' });
        bundle.track(resource2, cleanup2, 'test', { name: 'bundled-resource2' });
        
        // Verify that resources are tracked
        expect(resourceManager.getTrackedResourceCount()).toBe(2);
        
        // Destroy the bundle
        await bundle.destroy();
        
        // Verify that all cleanup functions were called
        expect(cleanup1).toHaveBeenCalled();
        expect(cleanup2).toHaveBeenCalled();
        
        // Verify that all resources were cleaned up
        expect(resourceManager.getTrackedResourceCount()).toBe(0);
    });
    
    it('should handle complex resource types', async () => {
        // Define resource types
        const RESOURCE_TYPES = {
            TIMEOUT: 'timeout',
            SIGNAL: 'signal',
            FILE: 'file'
        };
        
        // Create a bundle
        const bundle = resourceManager.createBundle('complex-bundle');
        
        // Mock various types of resources
        const timeoutId = 123;
        const signalId = 456;
        const fileResource = { path: '/tmp/test.txt' };
        
        // Mock cleanup functions
        const cleanupTimeout = jasmine.createSpy('cleanupTimeout');
        const cleanupSignal = jasmine.createSpy('cleanupSignal');
        const cleanupFile = jasmine.createSpy('cleanupFile');
        
        // Track different resource types
        bundle.track(
            { id: timeoutId },
            cleanupTimeout,
            RESOURCE_TYPES.TIMEOUT,
            { name: 'test-timeout' }
        );
        
        bundle.track(
            { id: signalId },
            cleanupSignal,
            RESOURCE_TYPES.SIGNAL,
            { name: 'test-signal' }
        );
        
        bundle.track(
            fileResource,
            cleanupFile,
            RESOURCE_TYPES.FILE,
            { name: 'test-file' }
        );
        
        // Verify resources are tracked
        expect(resourceManager.getTrackedResourceCount()).toBe(3);
        
        // Destroy the bundle
        await bundle.destroy();
        
        // Verify all cleanup functions were called
        expect(cleanupTimeout).toHaveBeenCalled();
        expect(cleanupSignal).toHaveBeenCalled();
        expect(cleanupFile).toHaveBeenCalled();
        
        // Verify that all resources were cleaned up
        expect(resourceManager.getTrackedResourceCount()).toBe(0);
    });
    
    it('should handle resource cleanup errors', async () => {
        // Create a resource
        const resource = { id: 1, name: 'error-resource' };
        
        // Create a cleanup function that throws an error
        const errorCleanup = jasmine.createSpy('errorCleanup').and.throwError('Cleanup failed');
        
        // Track the resource
        const id = resourceManager.track(resource, errorCleanup, 'test', { name: 'error-resource' });
        
        // Attempt to clean up the resource
        try {
            await resourceManager.cleanup(id);
            
            // The cleanup should still be considered successful even if the function threw
            expect(errorCleanup).toHaveBeenCalled();
            expect(resourceManager.getTrackedResourceCount()).toBe(0);
        } catch (error) {
            fail(`ResourceManager.cleanup() should handle errors gracefully: ${error}`);
        }
    });
    
    it('should allow cleanup by resource type', async () => {
        // Define resource types
        const RESOURCE_TYPES = {
            TIMEOUT: 'timeout',
            SIGNAL: 'signal'
        };
        
        // Create resources of different types
        const timeoutResource1 = { id: 1 };
        const timeoutResource2 = { id: 2 };
        const signalResource = { id: 3 };
        
        // Mock cleanup functions
        const cleanupTimeout1 = jasmine.createSpy('cleanupTimeout1');
        const cleanupTimeout2 = jasmine.createSpy('cleanupTimeout2');
        const cleanupSignal = jasmine.createSpy('cleanupSignal');
        
        // Track resources with different types
        resourceManager.track(timeoutResource1, cleanupTimeout1, RESOURCE_TYPES.TIMEOUT);
        resourceManager.track(timeoutResource2, cleanupTimeout2, RESOURCE_TYPES.TIMEOUT);
        resourceManager.track(signalResource, cleanupSignal, RESOURCE_TYPES.SIGNAL);
        
        // Clean up all timeout resources
        await resourceManager.cleanupByType(RESOURCE_TYPES.TIMEOUT);
        
        // Verify that only timeout cleanup functions were called
        expect(cleanupTimeout1).toHaveBeenCalled();
        expect(cleanupTimeout2).toHaveBeenCalled();
        expect(cleanupSignal).not.toHaveBeenCalled();
        
        // Verify that only signal resources remain
        expect(resourceManager.getTrackedResourceCount()).toBe(1);
    });
});