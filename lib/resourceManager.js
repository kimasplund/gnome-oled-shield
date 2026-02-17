'use strict';

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import { ResourceError } from './errors.js';

const performance = { now: () => GLib.get_monotonic_time() / 1000 };
import { WeakRefImpl, FinalizationRegistryImpl, features } from './compatibility.js';

/**
 * Manages resources for automatic cleanup using WeakRef and FinalizationRegistry
 * Provides a centralized way to track and manage resource lifecycles
 */
export default class ResourceManager {
    // Private fields
    #registry;
    #resources = new Map();
    #resourceMeta = new Map(); // Separate map for metadata
    #debug;
    #metrics = {
        allocationCount: 0,
        cleanupCount: 0,
        errorCount: 0,
        resourcesByType: new Map(),
        timing: {
            allocation: [],
            cleanup: []
        }
    };
    #abortController = new AbortController();
    #cleanupQueue = [];
    #cleanupProcessing = false;
    #cleanupTimerId = null;
    
    /**
     * Resource types enum for better tracking
     */
    static RESOURCE_TYPES = Object.freeze({
        TIMEOUT: 'timeout',
        SIGNAL: 'signal', 
        SOURCE: 'source',
        ACTOR: 'actor',
        FILE: 'file',
        OBJECT: 'object',
        UNKNOWN: 'unknown'
    });
    
    /**
     * Cleanup priorities for ordered shutdown
     */
    static CLEANUP_PRIORITIES = Object.freeze({
        CRITICAL: 100,   // First to clean up
        HIGH: 75,        // Clean up early
        NORMAL: 50,      // Default priority
        LOW: 25,         // Clean up later
        DEFER: 0         // Clean up last
    });
    
    // Static initialization block
    static {
        // Default cleanup handlers by resource type
        this.DEFAULT_CLEANUP_HANDLERS = new Map([
            [this.RESOURCE_TYPES.TIMEOUT, (id) => {
                if (id) {
                    try {
                        return GLib.source_remove(id);
                    } catch (error) {
                        return false;
                    }
                }
                return false;
            }],
            [this.RESOURCE_TYPES.SIGNAL, (obj, id) => {
                if (obj && id) {
                    try {
                        obj.disconnect(id);
                        return true;
                    } catch (error) {
                        return false;
                    }
                }
                return false;
            }],
            [this.RESOURCE_TYPES.SOURCE, (source) => {
                if (source) {
                    try {
                        source.destroy();
                        return true;
                    } catch (error) {
                        return false;
                    }
                }
                return false;
            }],
            [this.RESOURCE_TYPES.ACTOR, (actor) => {
                if (actor) {
                    try {
                        actor.destroy();
                        return true;
                    } catch (error) {
                        return false;
                    }
                }
                return false;
            }],
            [this.RESOURCE_TYPES.FILE, (file) => {
                if (file) {
                    try {
                        if (typeof file.close === 'function') {
                            file.close();
                            return true;
                        }
                        return false;
                    } catch (error) {
                        return false;
                    }
                }
                return false;
            }]
        ]);
    }
    
    /**
     * Create a new resource manager
     * @param {Function} debugFn - Debug logging function
     */
    constructor(debugFn) {
        this.#debug = debugFn || (() => {});
        
        // Log compatibility status
        this.#debug(`ResourceManager using WeakRef: ${features.hasNativeWeakRef ? 'native' : 'polyfill'}, FinalizationRegistry: ${features.hasNativeFinalizationRegistry ? 'native' : 'polyfill'}`);
        
        // Create finalization registry for automatic cleanup using compatibility implementation
        this.#registry = new FinalizationRegistryImpl(this.#handleFinalization.bind(this));
        
        // Self-cleanup when the manager is garbage collected
        this.#abortController.signal.addEventListener('abort', () => {
            this.cleanupAll().catch(error => {
                this.#debug(`Error during cleanup: ${error.message}`);
            });
        });
    }
    
    /**
     * Track a resource for automatic cleanup
     * @param {object} resource - The resource to track
     * @param {Function} cleanupFn - Function to call for cleanup
     * @param {string} [type=RESOURCE_TYPES.UNKNOWN] - Type of resource
     * @param {object} [options] - Additional options 
     * @param {number} [options.priority=CLEANUP_PRIORITIES.NORMAL] - Cleanup priority
     * @param {string} [options.name] - Resource name for debugging
     * @param {boolean} [options.persistent=false] - If true, won't be auto-cleaned by FinalizationRegistry
     * @returns {string} Resource ID for manual cleanup
     */
    track(resource, cleanupFn, type = ResourceManager.RESOURCE_TYPES.UNKNOWN, options = {}) {
        const startTime = performance.now();
        
        try {
            if (!resource) {
                throw new Error('Cannot track null or undefined resource');
            }
            
            if (typeof cleanupFn !== 'function') {
                // Try to use default cleanup handler based on type
                const defaultHandler = ResourceManager.DEFAULT_CLEANUP_HANDLERS.get(type);
                if (!defaultHandler) {
                    throw new Error(`No cleanup function provided for resource type: ${type}`);
                }
                
                cleanupFn = defaultHandler.bind(null, resource);
            }
            
            // Generate unique ID for this resource
            const resourceId = `res-${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            
            // Store resource metadata
            const resourceMeta = {
                resourceRef: new WeakRefImpl(resource), // Use compatibility implementation
                cleanupFn,
                type,
                priority: options.priority ?? ResourceManager.CLEANUP_PRIORITIES.NORMAL,
                name: options.name ?? `${type}-${resourceId.substring(resourceId.lastIndexOf('-') + 1)}`,
                createdAt: new Date(),
                persistent: options.persistent ?? false,
                meta: options.meta ?? {}
            };
            
            this.#resources.set(resourceId, resourceMeta);
            
            // Register for cleanup when resource is garbage collected
            // Skip if resource is marked as persistent
            if (!resourceMeta.persistent) {
                this.#registry.register(resource, resourceId);
            }
            
            // Update tracking metrics
            this.#metrics.allocationCount++;
            this.#updateTypeMetrics(type, 1);
            
            this.#debug(`Tracked resource: ${resourceId} (${resourceMeta.name})`);
            
            const endTime = performance.now();
            this.#metrics.timing.allocation.push(endTime - startTime);
            
            return resourceId;
        } catch (error) {
            const endTime = performance.now();
            this.#metrics.timing.allocation.push(endTime - startTime);
            this.#metrics.errorCount++;
            
            this.#debug(`Error tracking resource: ${error.message}`);
            throw ResourceError.allocation(type, error);
        }
    }
    
    /**
     * Manually cleanup a tracked resource
     * @param {string} resourceId - ID of the resource to clean up
     * @returns {Promise<boolean>} True if successfully cleaned up
     */
    async cleanup(resourceId) {
        const startTime = performance.now();
        
        try {
            const success = await this.#cleanupResource(resourceId);
            
            // Clean up FinalizationRegistry reference as well
            this.#resources.delete(resourceId);
            
            const endTime = performance.now();
            this.#metrics.timing.cleanup.push(endTime - startTime);
            
            return success;
        } catch (error) {
            const endTime = performance.now();
            this.#metrics.timing.cleanup.push(endTime - startTime);
            this.#metrics.errorCount++;
            
            this.#debug(`Error cleaning up resource ${resourceId}: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Clean up all tracked resources
     * @returns {Promise<{success: number, failed: number}>} Results of cleanup
     */
    async cleanupAll() {
        // Get snapshot of resource IDs and sort by priority
        const resourceEntries = Array.from(this.#resources.entries())
            .sort(([, a], [, b]) => b.priority - a.priority);
        
        const results = {
            success: 0,
            failed: 0,
            byType: {}
        };
        
        // Use Promise.allSettled to handle all cleanups even if some fail
        await Promise.allSettled(
            resourceEntries.map(async ([id, meta]) => {
                try {
                    const success = await this.#cleanupResource(id);
                    
                    // Track results by type
                    results.byType[meta.type] = results.byType[meta.type] || { success: 0, failed: 0 };
                    
                    if (success) {
                        results.success++;
                        results.byType[meta.type].success++;
                    } else {
                        results.failed++;
                        results.byType[meta.type].failed++;
                    }
                    
                    // Remove from tracked resources
                    this.#resources.delete(id);
                } catch (error) {
                    results.failed++;
                    
                    // Track results by type
                    results.byType[meta.type] = results.byType[meta.type] || { success: 0, failed: 0 };
                    results.byType[meta.type].failed++;
                    
                    this.#debug(`Error in cleanupAll for ${id}: ${error.message}`);
                }
            })
        );
        
        this.#debug(`Cleanup complete: ${results.success} succeeded, ${results.failed} failed`);
        return results;
    }
    
    /**
     * Clean up resources by type
     * @param {string} type - Resource type to clean up
     * @returns {Promise<{success: number, failed: number}>} Results of cleanup
     */
    async cleanupByType(type) {
        // Get snapshot of resource IDs of the requested type
        const resourceIds = Array.from(this.#resources.entries())
            .filter(([, meta]) => meta.type === type)
            .map(([id]) => id);
            
        const results = {
            success: 0,
            failed: 0
        };
        
        // Clean up each resource
        await Promise.allSettled(
            resourceIds.map(async (id) => {
                try {
                    const success = await this.cleanup(id);
                    if (success) {
                        results.success++;
                    } else {
                        results.failed++;
                    }
                } catch (error) {
                    results.failed++;
                    this.#debug(`Error in cleanupByType for ${id}: ${error.message}`);
                }
            })
        );
        
        return results;
    }
    
    /**
     * Check if a resource exists
     * @param {string} resourceId - ID of the resource to check
     * @returns {boolean} True if the resource exists
     */
    hasResource(resourceId) {
        return this.#resources.has(resourceId);
    }
    
    /**
     * Get a list of all tracked resource IDs
     * @param {string} [type] - Optional type to filter by
     * @returns {Array<string>} Array of resource IDs
     */
    getResourceIds(type) {
        if (type) {
            return Array.from(this.#resources.entries())
                .filter(([, meta]) => meta.type === type)
                .map(([id]) => id);
        }
        
        return Array.from(this.#resources.keys());
    }
    
    /**
     * Get the number of tracked resources
     * @param {string} [type] - Optional type to get count for
     * @returns {number} Number of tracked resources
     */
    getResourceCount(type) {
        if (type) {
            return this.getResourceIds(type).length;
        }
        
        return this.#resources.size;
    }
    
    /**
     * Get performance metrics for resource operations
     * @returns {object} Performance metrics
     */
    getMetrics() {
        // Calculate average times
        const calcAverage = (arr) => {
            if (arr.length === 0) return 0;
            return arr.reduce((sum, time) => sum + time, 0) / arr.length;
        };
        
        // Convert Map to Object for easier consumption
        const typeMetrics = {};
        for (const [type, count] of this.#metrics.resourcesByType.entries()) {
            typeMetrics[type] = count;
        }
        
        return {
            allocationCount: this.#metrics.allocationCount,
            cleanupCount: this.#metrics.cleanupCount,
            errorCount: this.#metrics.errorCount,
            currentCount: this.#resources.size,
            byType: typeMetrics,
            averageTiming: {
                allocation: calcAverage(this.#metrics.timing.allocation),
                cleanup: calcAverage(this.#metrics.timing.cleanup)
            }
        };
    }
    
    /**
     * Update metrics for a resource type
     * @param {string} type - Resource type
     * @param {number} delta - Change in count
     * @private
     */
    #updateTypeMetrics(type, delta) {
        const currentCount = this.#metrics.resourcesByType.get(type) || 0;
        this.#metrics.resourcesByType.set(type, currentCount + delta);
    }
    
    /**
     * Synchronous handler for finalization registry
     * @param {string} resourceId - Resource ID to clean up
     * @private
     */
    #handleFinalization(resourceId) {
        this.#debug(`Finalization triggered for ${resourceId}`);
        
        // Get resource metadata
        const meta = this.#resources.get(resourceId);
        if (!meta) {
            return; // Already cleaned up
        }
        
        // Update metrics
        this.#metrics.cleanupCount++;
        this.#updateTypeMetrics(meta.type, -1);
        
        // Check if we need to clean up synchronously based on resource type and priority
        const needsSyncCleanup = meta.priority >= ResourceManager.CLEANUP_PRIORITIES.HIGH || 
            meta.type === ResourceManager.RESOURCE_TYPES.TIMEOUT || 
            meta.type === ResourceManager.RESOURCE_TYPES.SIGNAL;
            
        if (needsSyncCleanup) {
            // For critical resources, clean up synchronously
            try {
                this.#safeExecuteCleanupSync(meta.cleanupFn);
                this.#debug(`Synchronous cleanup for critical resource ${resourceId} (${meta.name})`);
            } catch (error) {
                this.#debug(`Error in synchronous cleanup for ${resourceId}: ${error.message}`);
                // Fall back to queued cleanup for retry
                this.#queueCleanup(resourceId, meta.cleanupFn);
            }
        } else {
            // Queue the actual cleanup for later
            this.#queueCleanup(resourceId, meta.cleanupFn);
        }
        
        // Remove from resources map immediately
        this.#resources.delete(resourceId);
    }
    
    /**
     * Queue a cleanup operation
     * @param {string} resourceId - Resource ID to clean up
     * @param {Function} cleanupFn - Cleanup function to execute
     * @private
     */
    #queueCleanup(resourceId, cleanupFn) {
        this.#cleanupQueue.push({ resourceId, cleanupFn });
        
        // Start processing the queue if not already
        if (!this.#cleanupProcessing) {
            this.#processCleanupQueue();
        }
    }
    
    /**
     * Process the cleanup queue
     * @private
     */
    #processCleanupQueue() {
        if (this.#cleanupQueue.length === 0) {
            this.#cleanupProcessing = false;
            return;
        }
        
        this.#cleanupProcessing = true;
        
        // Detect session type to adjust behavior
        const isWayland = typeof Meta !== 'undefined' && 
                           typeof Meta.is_wayland_compositor === 'function' && 
                           Meta.is_wayland_compositor();
                           
        // Process more items per batch and use higher priority in Wayland
        const batchSize = isWayland ? 20 : 10;
        const priority = isWayland ? GLib.PRIORITY_HIGH : GLib.PRIORITY_DEFAULT_IDLE;
        
        // Process a batch of cleanup operations
        const batch = this.#cleanupQueue.splice(0, batchSize);
        
        // Process each cleanup operation
        for (const { resourceId, cleanupFn } of batch) {
            try {
                this.#safeExecuteCleanupSync(cleanupFn);
                this.#debug(`Queued cleanup succeeded for ${resourceId}`);
            } catch (error) {
                this.#debug(`Error in cleanup queue for ${resourceId}: ${error.message}`);
            }
        }
        
        // Schedule the next batch with session-specific timing
        if (this.#cleanupQueue.length > 0) {
            this.#cleanupTimerId = GLib.idle_add(priority, () => {
                this.#processCleanupQueue();
                return GLib.SOURCE_REMOVE;
            });
        } else {
            this.#cleanupProcessing = false;
        }
    }
    
    /**
     * Safely execute a cleanup function synchronously
     * @param {Function} cleanupFn - Cleanup function
     * @param {object} [resource] - Resource to clean up
     * @returns {boolean} True if cleanup succeeded
     * @private
     */
    #safeExecuteCleanupSync(cleanupFn, resource) {
        try {
            if (typeof cleanupFn !== 'function') {
                return false;
            }
            
            // Call cleanup function with resource if provided
            const result = resource ? 
                cleanupFn(resource) : 
                cleanupFn();
                
            // Handle promise by queuing it but return immediately
            if (result instanceof Promise) {
                result.catch(error => {
                    this.#debug(`Error in async cleanup function: ${error.message}`);
                });
                return true; // Assume success for now
            }
            
            // Convert result to boolean
            return Boolean(result);
        } catch (error) {
            this.#debug(`Error in cleanup function: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Automatically cleanup a resource when it's garbage collected
     * Note: This method is kept for backward compatibility but no longer used directly
     * @param {string} resourceId - Resource ID
     * @private
     */
    #autoCleanupResource(resourceId) {
        this.#debug(`Legacy auto cleanup called for ${resourceId}`);
        this.#handleFinalization(resourceId);
    }
    
    /**
     * Internal method to clean up a resource
     * @param {string} resourceId - ID of the resource to clean up
     * @param {boolean} [skipDeref=false] - Skip dereferencing the resource
     * @returns {Promise<boolean>} True if successfully cleaned up
     * @private
     */
    async #cleanupResource(resourceId, skipDeref = false) {
        const startTime = performance.now();
        
        try {
            const meta = this.#resources.get(resourceId);
            
            // Early return with optional chaining
            if (!meta) {
                this.#debug(`Resource not found: ${resourceId}`);
                return false;
            }
            
            // Increment metrics
            this.#metrics.cleanupCount++;
            this.#updateTypeMetrics(meta.type, -1);
            
            // For auto-cleanup, resource is already gone, so just call cleanup
            if (skipDeref) {
                const result = await this.#safeExecuteCleanupSync(meta.cleanupFn);
                const endTime = performance.now();
                this.#metrics.timing.cleanup.push(endTime - startTime);
                return result;
            }
            
            // Get the resource from weak reference
            const resource = meta.resourceRef.deref();
            if (!resource) {
                this.#debug(`Resource already garbage collected: ${resourceId}`);
                this.#resources.delete(resourceId);
                return true;
            }
            
            // Call cleanup function
            const result = await this.#safeExecuteCleanupSync(meta.cleanupFn, resource);
            const endTime = performance.now();
            this.#metrics.timing.cleanup.push(endTime - startTime);
            
            if (result) {
                this.#debug(`Cleaned up resource: ${resourceId} (${meta.name})`);
            } else {
                this.#debug(`Failed to clean up resource: ${resourceId} (${meta.name})`);
            }
            
            return result;
        } catch (error) {
            const endTime = performance.now();
            this.#metrics.timing.cleanup.push(endTime - startTime);
            this.#metrics.errorCount++;
            
            this.#debug(`Error cleaning up resource ${resourceId}: ${error.message}`);
            throw ResourceError.cleanup(resourceId, error);
        }
    }
    
    /**
     * Add custom resource type
     * @param {string} typeName - Name of the resource type
     * @param {Function} [defaultHandler] - Default cleanup handler
     * @returns {string} The resource type name
     */
    static defineResourceType(typeName, defaultHandler) {
        if (!typeName || typeof typeName !== 'string') {
            throw new Error('Resource type name must be a non-empty string');
        }
        
        // Add to RESOURCE_TYPES (can't modify frozen object, so return existing)
        if (Object.values(ResourceManager.RESOURCE_TYPES).includes(typeName)) {
            return typeName;
        }
        
        // Add default handler if provided
        if (typeof defaultHandler === 'function') {
            ResourceManager.DEFAULT_CLEANUP_HANDLERS.set(typeName, defaultHandler);
        }
        
        return typeName;
    }
    
    /**
     * Create a resource bundle for grouped cleanup
     * @returns {ResourceBundle} A new resource bundle
     */
    createBundle() {
        return new ResourceBundle(this);
    }
    
    /**
     * Destroy the resource manager and clean up all resources
     */
    destroy() {
        // Cancel any pending cleanup timers
        if (this.#cleanupTimerId) {
            GLib.source_remove(this.#cleanupTimerId);
            this.#cleanupTimerId = null;
        }
        
        // Process any remaining cleanup queue items immediately
        while (this.#cleanupQueue.length > 0) {
            const { resourceId, cleanupFn } = this.#cleanupQueue.shift();
            try {
                this.#safeExecuteCleanupSync(cleanupFn);
            } catch (error) {
                this.#debug(`Error in final cleanup for ${resourceId}: ${error.message}`);
            }
        }
        
        // Abort controller for other cleanup
        this.#abortController.abort('ResourceManager destroyed');
    }
}

/**
 * Bundle of resources that can be cleaned up together
 * Useful for grouping related resources
 */
export class ResourceBundle {
    // Private fields
    #manager;
    #resourceIds = new Set();
    #name;
    #destroyed = false;
    
    /**
     * Create a new resource bundle
     * @param {ResourceManager} manager - Resource manager
     * @param {string} [name] - Optional name for debugging
     */
    constructor(manager, name = null) {
        this.#manager = manager;
        this.#name = name || `Bundle-${Date.now()}`;
    }
    
    /**
     * Track a resource in this bundle
     * @param {object} resource - The resource to track
     * @param {Function} cleanupFn - Function to call for cleanup
     * @param {string} [type=RESOURCE_TYPES.UNKNOWN] - Type of resource
     * @param {object} [options] - Additional options
     * @returns {string} Resource ID
     */
    track(resource, cleanupFn, type = ResourceManager.RESOURCE_TYPES.UNKNOWN, options = {}) {
        if (this.#destroyed) {
            throw new Error('Cannot add resources to a destroyed bundle');
        }
        
        // Track in the manager
        const resourceId = this.#manager.track(resource, cleanupFn, type, {
            ...options,
            meta: { 
                ...options.meta,
                bundleName: this.#name
            }
        });
        
        // Add to our local tracking
        this.#resourceIds.add(resourceId);
        
        return resourceId;
    }
    
    /**
     * Clean up all resources in this bundle
     * @returns {Promise<{success: number, failed: number}>} Results of cleanup
     */
    async cleanup() {
        if (this.#destroyed) {
            return { success: 0, failed: 0 };
        }
        
        // Get snapshot of resource IDs
        const resourceIds = [...this.#resourceIds];
        
        const results = {
            success: 0,
            failed: 0
        };
        
        // Clean up each resource
        await Promise.allSettled(
            resourceIds.map(async (id) => {
                try {
                    const success = await this.#manager.cleanup(id);
                    if (success) {
                        results.success++;
                    } else {
                        results.failed++;
                    }
                    
                    // Remove from our tracking
                    this.#resourceIds.delete(id);
                } catch (error) {
                    results.failed++;
                }
            })
        );
        
        return results;
    }
    
    /**
     * Get the number of resources in this bundle
     * @returns {number} Number of resources
     */
    get size() {
        return this.#resourceIds.size;
    }
    
    /**
     * Get the name of this bundle
     * @returns {string} Bundle name
     */
    get name() {
        return this.#name;
    }
    
    /**
     * Destroy this bundle and clean up all resources
     * @returns {Promise<{success: number, failed: number}>} Results of cleanup
     */
    async destroy() {
        if (this.#destroyed) {
            return { success: 0, failed: 0 };
        }
        
        const results = await this.cleanup();
        this.#destroyed = true;
        
        return results;
    }
} 