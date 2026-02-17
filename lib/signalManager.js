'use strict';

import GLib from 'gi://GLib';
import { SignalError } from './errors.js';

const performance = { now: () => GLib.get_monotonic_time() / 1000 };

/**
 * Advanced signal manager for GObject connections
 * Uses WeakRef and FinalizationRegistry for automatic signal cleanup
 */
export default class SignalManager {
    // Private fields
    #registry;
    #signals = new Map();
    #debug;
    #metrics = {
        connectionCount: 0,
        disconnectionCount: 0,
        errorCount: 0,
        timing: {
            connect: [],
            disconnect: []
        }
    };
    #concurrencyLimit = 10;
    #signalPatterns = new Map();
    #autoReconnectSignals = new Set();
    #signalGroups = new Map();
    #abortController = new AbortController();
    
    // Static initialization block for constants
    static {
        /**
         * Maximum signal connections by target type
         * @type {Map<string, number>}
         */
        this.MAX_SIGNALS_BY_TYPE = new Map([
            ['default', 100],
            ['settings', 20],
            ['actor', 50],
            ['widget', 30],
            ['display', 15]
        ]);
        
        /**
         * Signal priorities for processing
         * @readonly
         * @enum {number}
         */
        this.PRIORITIES = Object.freeze({
            HIGH: 2,
            NORMAL: 1,
            LOW: 0
        });
        
        /**
         * Status of a signal connection
         * @readonly
         * @enum {string}
         */
        this.STATUS = Object.freeze({
            ACTIVE: 'active',
            DISCONNECTED: 'disconnected',
            PENDING: 'pending',
            ERROR: 'error'
        });
    }
    
    /**
     * Create a new signal manager
     * @param {Function} debugFn - Debug logging function
     */
    constructor(debugFn) {
        this.#debug = debugFn || (() => {});
        
        // Create finalization registry for automatic cleanup
        this.#registry = new FinalizationRegistry((signalId) => {
            this.#debug(`Auto cleanup for signal: ${signalId}`);
            this.#cleanupSignal(signalId);
        });
        
        // Set up abort controller
        this.#abortController.signal.addEventListener('abort', () => {
            this.disconnectAll().catch(error => {
                this.#debug(`Error during disconnectAll: ${error.message}`);
            });
        });
    }
    
    /**
     * Connect a signal and track it
     * @param {object} object - The object to connect the signal to
     * @param {string} signalName - The name of the signal
     * @param {Function} callback - The callback function
     * @param {string|object} [userData=null] - Optional group ID or metadata
     * @param {object} [options={}] - Additional options
     * @param {boolean} [options.autoReconnect=false] - Whether to auto-reconnect on disconnect
     * @param {number} [options.priority=PRIORITIES.NORMAL] - Connection priority
     * @returns {string} The signal ID
     * @throws {SignalError} If the signal cannot be connected
     */
    connect(object, signalName, callback, userData = null, options = {}) {
        try {
            const startTime = performance.now();
            
            if (!object || typeof object.connect !== 'function') {
                throw SignalError.connection(signalName, object, 
                    new Error('Invalid object for signal connection')
                );
            }
            
            // Generate a unique ID for this signal
            const signalId = `${object.constructor?.name ?? 'Unknown'}-${signalName}-${Date.now()}`;
            
            // Check signal limits by type
            const objectType = this.#getObjectType(object);
            const maxSignals = SignalManager.MAX_SIGNALS_BY_TYPE.get(objectType) ?? 
                               SignalManager.MAX_SIGNALS_BY_TYPE.get('default');
                               
            const currentCount = this.#countSignalsByType(objectType);
            if (currentCount >= maxSignals) {
                throw SignalError.connection(signalName, object,
                    new Error(`Signal limit reached for type ${objectType}: ${currentCount}/${maxSignals}`)
                );
            }
            
            // Connect the signal
            const handleId = object.connect(signalName, callback);
            
            // Store weak references to allow garbage collection
            const signalData = {
                objectRef: new WeakRef(object),
                handleId,
                signalName,
                userData,
                objectType,
                connectedAt: new Date(),
                status: SignalManager.STATUS.ACTIVE,
                autoReconnect: options.autoReconnect ?? this.#autoReconnectSignals.has(signalName),
                priority: options.priority ?? SignalManager.PRIORITIES.NORMAL,
                callCount: 0,
                lastCall: null
            };
            
            this.#signals.set(signalId, signalData);
            
            // Register for auto cleanup if object is garbage collected
            this.#registry.register(object, signalId);
            
            // Add to signal group if userData is string (group ID)
            if (typeof userData === 'string' && userData) {
                this.#addToSignalGroup(userData, signalId);
            }
            
            // Check if this matches any signal patterns
            this.#checkSignalPatterns(object, signalName, signalId);
            
            // Track performance
            const endTime = performance.now();
            this.#recordTiming('connect', endTime - startTime);
            this.#metrics.connectionCount++;
            
            this.#debug(`Connected signal: ${signalId} (${signalName})`);
            return signalId;
        } catch (error) {
            const errorMessage = error instanceof SignalError 
                ? error.message 
                : `Error connecting signal ${signalName}: ${error.message}`;
                
            this.#debug(errorMessage);
            this.#metrics.errorCount++;
            throw new SignalError(errorMessage, signalName, { cause: error });
        }
    }
    
    /**
     * Disconnect a signal by ID
     * @param {string} signalId - The signal ID to disconnect
     * @returns {Promise<boolean>} True if successfully disconnected
     */
    async disconnect(signalId) {
        try {
            const startTime = performance.now();
            
            const result = await this.#cleanupSignal(signalId);
            
            // Track performance
            const endTime = performance.now();
            this.#recordTiming('disconnect', endTime - startTime);
            
            if (result) {
                this.#metrics.disconnectionCount++;
            }
            
            return result;
        } catch (error) {
            this.#debug(`Error disconnecting signal ${signalId}: ${error.message}`);
            this.#metrics.errorCount++;
            return false;
        }
    }
    
    /**
     * Add a signal pattern for automatic management
     * @param {RegExp} objectPattern - Pattern to match object constructor name
     * @param {RegExp} signalPattern - Pattern to match signal name
     * @param {Function} callback - Callback when pattern matches (gets notified of connections)
     * @returns {string} Pattern ID that can be used to remove the pattern
     */
    addSignalPattern(objectPattern, signalPattern, callback) {
        if (!(objectPattern instanceof RegExp) || 
            !(signalPattern instanceof RegExp) || 
            typeof callback !== 'function') {
            throw new Error('Invalid parameters for signal pattern');
        }
        
        const patternId = `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        this.#signalPatterns.set(patternId, {
            objectPattern,
            signalPattern,
            callback
        });
        
        // Check existing signals against this new pattern
        for (const [signalId, data] of this.#signals.entries()) {
            if (data.status !== SignalManager.STATUS.ACTIVE) continue;
            
            const object = data.objectRef.deref();
            if (!object) continue;
            
            const objectName = object.constructor?.name ?? 'Unknown';
            
            if (objectPattern.test(objectName) && signalPattern.test(data.signalName)) {
                try {
                    callback({
                        signalId,
                        objectName,
                        signalName: data.signalName,
                        type: 'existing'
                    });
                } catch (error) {
                    this.#debug(`Error in signal pattern callback: ${error.message}`);
                }
            }
        }
        
        return patternId;
    }
    
    /**
     * Remove a signal pattern
     * @param {string} patternId - The pattern ID to remove
     * @returns {boolean} True if pattern was removed
     */
    removeSignalPattern(patternId) {
        return this.#signalPatterns.delete(patternId);
    }
    
    /**
     * Mark signal names for auto-reconnect if they disconnect
     * @param {string|Array<string>} signalNames - Signal name(s) to auto-reconnect
     */
    enableAutoReconnect(signalNames) {
        const names = Array.isArray(signalNames) ? signalNames : [signalNames];
        for (const name of names) {
            this.#autoReconnectSignals.add(name);
            
            // Update existing signals
            for (const [, data] of this.#signals.entries()) {
                if (data.signalName === name) {
                    data.autoReconnect = true;
                }
            }
        }
    }
    
    /**
     * Disable auto-reconnect for signal names
     * @param {string|Array<string>} signalNames - Signal name(s) to stop auto-reconnecting
     */
    disableAutoReconnect(signalNames) {
        const names = Array.isArray(signalNames) ? signalNames : [signalNames];
        for (const name of names) {
            this.#autoReconnectSignals.delete(name);
            
            // Update existing signals
            for (const [, data] of this.#signals.entries()) {
                if (data.signalName === name) {
                    data.autoReconnect = false;
                }
            }
        }
    }
    
    /**
     * Create a signal group for managing multiple signals together
     * @param {string} groupId - Group identifier
     * @param {object} [options={}] - Group options
     * @param {boolean} [options.clearOnDisconnect=false] - Whether to remove signals from group when disconnected
     * @returns {string} The group ID
     */
    createSignalGroup(groupId, options = {}) {
        if (!groupId || typeof groupId !== 'string') {
            throw new Error('Group ID must be a non-empty string');
        }
        
        // Use provided ID or generate a new one
        const finalGroupId = this.#signalGroups.has(groupId)
            ? `${groupId}-${Date.now()}`
            : groupId;
            
        this.#signalGroups.set(finalGroupId, {
            signals: new Set(),
            createdAt: new Date(),
            clearOnDisconnect: options.clearOnDisconnect ?? false,
            meta: {}
        });
        
        return finalGroupId;
    }
    
    /**
     * Add a signal to a group
     * @param {string} groupId - Group identifier
     * @param {string} signalId - Signal identifier
     * @returns {boolean} True if signal was added to the group
     * @private
     */
    #addToSignalGroup(groupId, signalId) {
        // Create group if it doesn't exist
        if (!this.#signalGroups.has(groupId)) {
            this.createSignalGroup(groupId);
        }
        
        const group = this.#signalGroups.get(groupId);
        group.signals.add(signalId);
        
        return true;
    }
    
    /**
     * Disconnect all signals in a group
     * @param {string} groupId - Group identifier
     * @returns {Promise<{success: number, failed: number}>} Success/failure counts
     */
    async disconnectGroup(groupId) {
        const group = this.#signalGroups.get(groupId);
        if (!group) {
            return { success: 0, failed: 0 };
        }
        
        const signalIds = [...group.signals];
        const results = {
            success: 0,
            failed: 0
        };
        
        // Use Promise.allSettled to handle all disconnections even if some fail
        await Promise.allSettled(
            signalIds.map(async (id) => {
                try {
                    const success = await this.disconnect(id);
                    if (success) {
                        results.success++;
                    } else {
                        results.failed++;
                    }
                    
                    if (group.clearOnDisconnect) {
                        group.signals.delete(id);
                    }
                } catch (error) {
                    results.failed++;
                    this.#debug(`Error in disconnectGroup for ${id}: ${error.message}`);
                }
            })
        );
        
        // If all signals were disconnected and cleared, remove the group
        if (group.clearOnDisconnect && group.signals.size === 0) {
            this.#signalGroups.delete(groupId);
        }
        
        return results;
    }
    
    /**
     * Get detailed information about a signal
     * @param {string} signalId - Signal ID to get information for
     * @returns {object|null} Signal information or null if not found
     */
    getSignalInfo(signalId) {
        const data = this.#signals.get(signalId);
        if (!data) return null;
        
        const object = data.objectRef.deref();
        const objectValid = !!object;
        
        return {
            id: signalId,
            signalName: data.signalName,
            objectType: data.objectType,
            objectValid,
            objectClassName: object?.constructor?.name ?? 'Unknown',
            connectedAt: data.connectedAt,
            status: data.status,
            autoReconnect: data.autoReconnect,
            handleId: data.handleId,
            callCount: data.callCount,
            lastCall: data.lastCall
        };
    }
    
    /**
     * Iterator for active signals
     * @yields {object} Signal information
     */
    *activeSignals() {
        for (const [signalId, data] of this.#signals.entries()) {
            if (data.status !== SignalManager.STATUS.ACTIVE) continue;
            
            const object = data.objectRef.deref();
            if (!object) continue;
            
            yield {
                id: signalId,
                signalName: data.signalName,
                object,
                objectType: data.objectType,
                handleId: data.handleId,
                userData: data.userData
            };
        }
    }
    
    /**
     * Process signals with a callback function
     * @param {Function} callback - Function to call for each signal
     * @param {object} [options={}] - Processing options
     * @param {string} [options.filter] - Filter signals by signal name pattern
     * @param {string} [options.objectType] - Filter signals by object type
     * @param {boolean} [options.onlyActive=true] - Only process active signals
     * @param {AbortSignal} [options.signal] - AbortSignal for cancellation
     * @returns {Promise<{processed: number, errors: number}>} Results with counts
     */
    async processSignals(callback, options = {}) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        const filter = options.filter ? new RegExp(options.filter) : null;
        const objectType = options.objectType;
        const onlyActive = options.onlyActive ?? true;
        const signal = options.signal ?? this.#abortController.signal;
        const concurrency = options.concurrency ?? this.#concurrencyLimit;
        
        // Get all signals matching our criteria
        const matchingSignals = [];
        
        for (const [signalId, data] of this.#signals.entries()) {
            // Skip if not active (when onlyActive is true)
            if (onlyActive && data.status !== SignalManager.STATUS.ACTIVE) {
                continue;
            }
            
            // Skip if signal name doesn't match filter
            if (filter && !filter.test(data.signalName)) {
                continue;
            }
            
            // Skip if object type doesn't match
            if (objectType && data.objectType !== objectType) {
                continue;
            }
            
            // Get the object reference
            const object = data.objectRef.deref();
            if (!object) continue;
            
            matchingSignals.push({
                id: signalId,
                data,
                object
            });
        }
        
        // Sort by priority if provided
        if (options.prioritized) {
            matchingSignals.sort((a, b) => b.data.priority - a.data.priority);
        }
        
        const results = {
            processed: 0,
            errors: 0,
            results: []
        };
        
        // Process in batches for concurrency control
        for (let i = 0; i < matchingSignals.length; i += concurrency) {
            if (signal.aborted) {
                break;
            }
            
            const batch = matchingSignals.slice(i, i + concurrency);
            
            // Process this batch in parallel
            const batchResults = await Promise.allSettled(
                batch.map(async ({ id, data, object }) => {
                    if (signal.aborted) {
                        throw new Error('Operation aborted');
                    }
                    
                    try {
                        const result = await callback({
                            id,
                            signalName: data.signalName,
                            object,
                            objectType: data.objectType,
                            handleId: data.handleId,
                            userData: data.userData,
                            status: data.status
                        });
                        
                        return { id, success: true, result };
                    } catch (error) {
                        return { id, success: false, error };
                    }
                })
            );
            
            // Process results
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    const value = result.value;
                    if (value.success) {
                        results.processed++;
                        results.results.push(value);
                    } else {
                        results.errors++;
                        this.#debug(`Error processing signal ${value.id}: ${value.error?.message}`);
                    }
                } else {
                    results.errors++;
                    this.#debug(`Error in processSignals: ${result.reason?.message}`);
                }
            }
            
            // Small pause to allow the event loop to run
            if (i + concurrency < matchingSignals.length) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        return results;
    }
    
    /**
     * Find signals matching criteria
     * @param {object} [criteria={}] - Search criteria
     * @param {string|RegExp} [criteria.signalName] - Signal name or pattern
     * @param {string} [criteria.objectType] - Object type
     * @param {Function} [criteria.objectMatcher] - Function to match the object
     * @param {string} [criteria.status] - Signal status
     * @returns {Array<string>} Array of matching signal IDs
     */
    findSignals(criteria = {}) {
        const matches = [];
        
        const signalPattern = criteria.signalName instanceof RegExp 
            ? criteria.signalName 
            : (typeof criteria.signalName === 'string' ? new RegExp(criteria.signalName) : null);
            
        for (const [signalId, data] of this.#signals.entries()) {
            // Match by signal name
            if (signalPattern && !signalPattern.test(data.signalName)) {
                continue;
            }
            
            // Match by object type
            if (criteria.objectType && data.objectType !== criteria.objectType) {
                continue;
            }
            
            // Match by status
            if (criteria.status && data.status !== criteria.status) {
                continue;
            }
            
            // Match by object matcher function
            if (typeof criteria.objectMatcher === 'function') {
                const object = data.objectRef.deref();
                if (!object || !criteria.objectMatcher(object)) {
                    continue;
                }
            }
            
            matches.push(signalId);
        }
        
        return matches;
    }
    
    /**
     * Disconnect all tracked signals
     * @param {object} [options={}] - Options for disconnection
     * @param {boolean} [options.ignoreErrors=true] - Whether to ignore errors
     * @returns {Promise<{success: number, failed: number}>} Results with counts
     */
    async disconnectAll(options = {}) {
        const ignoreErrors = options.ignoreErrors ?? true;
        
        // Get snapshot of all signal IDs
        const signalIds = [...this.#signals.keys()];
        
        const results = {
            success: 0,
            failed: 0
        };
        
        // Use Promise.allSettled to handle all disconnections even if some fail
        const disconnectPromises = signalIds.map(async (id) => {
            try {
                const success = await this.disconnect(id);
                return success ? 'success' : 'failed';
            } catch (error) {
                if (!ignoreErrors) {
                    throw error;
                }
                return 'failed';
            }
        });
        
        const disconnectResults = await Promise.allSettled(disconnectPromises);
        
        // Count successes and failures
        for (const result of disconnectResults) {
            if (result.status === 'fulfilled') {
                if (result.value === 'success') {
                    results.success++;
                } else {
                    results.failed++;
                }
            } else {
                results.failed++;
            }
        }
        
        // Clear signal groups
        this.#signalGroups.clear();
        
        return results;
    }
    
    /**
     * Disconnect signals by object
     * @param {object} object - Object whose signals should be disconnected
     * @returns {Promise<{success: number, failed: number}>} Results with counts
     */
    async disconnectByObject(object) {
        if (!object) {
            return { success: 0, failed: 0 };
        }
        
        const signalIds = [];
        
        // Find all signals for this object
        for (const [signalId, data] of this.#signals.entries()) {
            const signalObject = data.objectRef.deref();
            if (signalObject === object) {
                signalIds.push(signalId);
            }
        }
        
        if (signalIds.length === 0) {
            return { success: 0, failed: 0 };
        }
        
        // Disconnect all found signals
        const results = {
            success: 0,
            failed: 0
        };
        
        await Promise.allSettled(
            signalIds.map(async (id) => {
                try {
                    const success = await this.disconnect(id);
                    if (success) {
                        results.success++;
                    } else {
                        results.failed++;
                    }
                } catch (error) {
                    results.failed++;
                }
            })
        );
        
        return results;
    }
    
    /**
     * Get performance metrics
     * @returns {object} Performance metrics
     */
    getPerformanceMetrics() {
        // Calculate average times
        const calculateAverage = (arr) => {
            if (arr.length === 0) return 0;
            return arr.reduce((sum, time) => sum + time, 0) / arr.length;
        };
        
        return {
            connectAvgTime: calculateAverage(this.#metrics.timing.connect),
            disconnectAvgTime: calculateAverage(this.#metrics.timing.disconnect),
            connectionCount: this.#metrics.connectionCount,
            disconnectionCount: this.#metrics.disconnectionCount,
            errorCount: this.#metrics.errorCount,
            activeCount: this.#countActiveSignals()
        };
    }
    
    /**
     * Get statistics about tracked signals
     * @returns {object} Signal statistics
     */
    getStatistics() {
        const stats = {
            total: this.#signals.size,
            active: 0,
            disconnected: 0,
            byObjectType: {},
            bySignalName: {},
            groups: this.#signalGroups.size,
            patterns: this.#signalPatterns.size,
            autoReconnect: this.#autoReconnectSignals.size
        };
        
        // Count by status and type
        for (const data of this.#signals.values()) {
            if (data.status === SignalManager.STATUS.ACTIVE) {
                stats.active++;
            } else if (data.status === SignalManager.STATUS.DISCONNECTED) {
                stats.disconnected++;
            }
            
            // Count by object type
            const type = data.objectType;
            stats.byObjectType[type] = (stats.byObjectType[type] || 0) + 1;
            
            // Count by signal name
            const name = data.signalName;
            stats.bySignalName[name] = (stats.bySignalName[name] || 0) + 1;
        }
        
        return stats;
    }
    
    /**
     * Clean up a signal and remove it from tracking
     * @param {string} signalId - Signal ID to clean up
     * @returns {Promise<boolean>} True if successfully cleaned up
     * @private
     */
    async #cleanupSignal(signalId) {
        try {
            const data = this.#signals.get(signalId);
            if (!data) {
                return false;
            }
            
            // Get the object from weak reference
            const object = data.objectRef.deref();
            
            // If object exists and signal is active, disconnect it
            if (object && data.status === SignalManager.STATUS.ACTIVE) {
                try {
                    object.disconnect(data.handleId);
                } catch (error) {
                    this.#debug(`Error disconnecting signal ${signalId}: ${error.message}`);
                }
            }
            
            // Mark as disconnected
            data.status = SignalManager.STATUS.DISCONNECTED;
            
            // Remove from groups
            for (const group of this.#signalGroups.values()) {
                group.signals.delete(signalId);
            }
            
            // Remove from tracking
            this.#signals.delete(signalId);
            
            return true;
        } catch (error) {
            this.#debug(`Error cleaning up signal ${signalId}: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Get the type of an object for categorization
     * @param {object} object - Object to get type of
     * @returns {string} Object type
     * @private
     */
    #getObjectType(object) {
        const constructor = object.constructor?.name ?? '';
        
        if (constructor.includes('Settings')) return 'settings';
        if (constructor.includes('Actor')) return 'actor';
        if (constructor.includes('Widget')) return 'widget';
        if (constructor.includes('Display') || constructor.includes('Monitor')) return 'display';
        
        return 'default';
    }
    
    /**
     * Count signals by object type
     * @param {string} type - Object type to count
     * @returns {number} Number of signals of the given type
     * @private
     */
    #countSignalsByType(type) {
        let count = 0;
        
        for (const data of this.#signals.values()) {
            if (data.objectType === type && data.status === SignalManager.STATUS.ACTIVE) {
                count++;
            }
        }
        
        return count;
    }
    
    /**
     * Count active signals
     * @returns {number} Number of active signals
     * @private
     */
    #countActiveSignals() {
        let count = 0;
        
        for (const data of this.#signals.values()) {
            if (data.status === SignalManager.STATUS.ACTIVE) {
                count++;
            }
        }
        
        return count;
    }
    
    /**
     * Check signal against registered patterns
     * @param {object} object - Signal object
     * @param {string} signalName - Signal name
     * @param {string} signalId - Signal ID
     * @private
     */
    #checkSignalPatterns(object, signalName, signalId) {
        const objectName = object.constructor?.name ?? 'Unknown';
        
        // Check all patterns
        for (const [patternId, pattern] of this.#signalPatterns.entries()) {
            if (pattern.objectPattern.test(objectName) && pattern.signalPattern.test(signalName)) {
                try {
                    pattern.callback({
                        signalId,
                        objectName,
                        signalName,
                        type: 'new'
                    });
                } catch (error) {
                    this.#debug(`Error in signal pattern callback: ${error.message}`);
                }
            }
        }
    }
    
    /**
     * Record timing for performance tracking
     * @param {string} operation - Operation name (connect/disconnect)
     * @param {number} duration - Operation duration in ms
     * @private
     */
    #recordTiming(operation, duration) {
        const timings = this.#metrics.timing[operation];
        if (!timings) return;
        
        timings.push(duration);
        
        // Keep only the last 20 measurements
        if (timings.length > 20) {
            timings.shift();
        }
    }
    
    /**
     * Clean up resources and disconnect all signals
     */
    destroy() {
        this.#abortController.abort('SignalManager destroyed');
    }
} 