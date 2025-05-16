'use strict';

/**
 * Base error class for the extension
 * @typedef {Object} ErrorOptions
 * @property {Error} [cause] - Original error that caused this error
 * @property {string} [context] - Context in which the error occurred
 * @property {Object} [metadata] - Additional error metadata
 * @property {boolean} [recoverable=false] - Whether the error is recoverable
 */
export class ExtensionError extends Error {
    // Private fields using modern JavaScript private field syntax
    #context;
    #metadata;
    #timestamp;
    #recoverable;
    #errorId;
    
    // Static initialization block for constants
    static {
        this.ERROR_LEVELS = Object.freeze({
            CRITICAL: 'critical',
            ERROR: 'error',
            WARNING: 'warning',
            INFO: 'info'
        });
    }
    
    /**
     * Create a new extension error
     * @param {string} message - Error message
     * @param {ErrorOptions} options - Error options
     */
    constructor(message, options = {}) {
        // Using ES2022 Error cause for better error chaining
        super(message, { cause: options.cause });
        this.name = 'ExtensionError';
        
        // Add rich error context and metadata using private fields
        this.#context = options.context ?? null;
        this.#metadata = options.metadata ?? {};
        this.#timestamp = new Date();
        this.#recoverable = options.recoverable ?? false;
        this.#errorId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Add level property for error classification
        this.level = options.level ?? ExtensionError.ERROR_LEVELS.ERROR;
    }
    
    /**
     * Get error context
     * @returns {string|null} Error context
     */
    get context() {
        return this.#context;
    }
    
    /**
     * Get error metadata
     * @returns {Object} Error metadata
     */
    get metadata() {
        return { ...this.#metadata }; // Return a copy to prevent modification
    }
    
    /**
     * Get error timestamp
     * @returns {Date} Error timestamp
     */
    get timestamp() {
        return new Date(this.#timestamp);
    }
    
    /**
     * Get whether error is recoverable
     * @returns {boolean} True if error is recoverable
     */
    get recoverable() {
        return this.#recoverable;
    }
    
    /**
     * Get error ID
     * @returns {string} Unique error ID
     */
    get errorId() {
        return this.#errorId;
    }
    
    /**
     * Format the error with additional context for logging
     * @returns {string} Formatted error message
     */
    format() {
        const contextInfo = this.#context ? ` (Context: ${this.#context})` : '';
        const causeInfo = this.cause ? `\n  Caused by: ${this.cause.message}` : '';
        const metadataInfo = Object.keys(this.#metadata).length > 0 
            ? `\n  Metadata: ${JSON.stringify(this.#metadata)}` 
            : '';
            
        return `${this.name}: ${this.message}${contextInfo}${causeInfo}${metadataInfo}`;
    }
    
    /**
     * Creates a structured object representation of the error
     * @returns {object} Structured error data
     */
    toStructured() {
        return {
            id: this.#errorId,
            name: this.name,
            message: this.message,
            context: this.#context,
            timestamp: this.#timestamp,
            metadata: { ...this.#metadata },
            recoverable: this.#recoverable,
            level: this.level,
            cause: this.cause ? {
                name: this.cause.name,
                message: this.cause.message,
                stack: this.cause.stack
            } : null
        };
    }
    
    /**
     * Create a derived error with additional context
     * @param {string} context - New context to add
     * @param {object} metadata - Additional metadata to add
     * @returns {ExtensionError} A new error with combined context
     */
    withContext(context, metadata = {}) {
        return new this.constructor(this.message, {
            cause: this.cause,
            context: context || this.#context,
            metadata: { ...this.#metadata, ...metadata },
            recoverable: this.#recoverable,
            level: this.level
        });
    }
    
    /**
     * Create a warning level version of this error
     * @returns {ExtensionError} A new error with warning level
     */
    asWarning() {
        return new this.constructor(this.message, {
            cause: this.cause,
            context: this.#context,
            metadata: this.#metadata,
            recoverable: true,
            level: ExtensionError.ERROR_LEVELS.WARNING
        });
    }
    
    /**
     * Create a critical level version of this error
     * @returns {ExtensionError} A new error with critical level
     */
    asCritical() {
        return new this.constructor(this.message, {
            cause: this.cause,
            context: this.#context,
            metadata: this.#metadata,
            recoverable: false,
            level: ExtensionError.ERROR_LEVELS.CRITICAL
        });
    }
}

/**
 * Error for component initialization failures
 */
export class ComponentInitError extends ExtensionError {
    // Private fields
    #componentName;
    
    /**
     * Create a new component initialization error
     * @param {string} componentName - Name of the component that failed
     * @param {ErrorOptions} options - Error options
     */
    constructor(componentName, options = {}) {
        super(`Failed to initialize component: ${componentName}`, {
            ...options,
            metadata: { 
                ...(options.metadata || {}),
                componentName 
            }
        });
        this.name = 'ComponentInitError';
        this.#componentName = componentName;
    }
    
    /**
     * Get the component name
     * @returns {string} Component name
     */
    get componentName() {
        return this.#componentName;
    }
    
    /**
     * Create a timeout error for component initialization
     * @param {string} componentName - Component name
     * @param {Error} [cause] - Original error
     * @returns {ComponentInitError} New component initialization timeout error
     */
    static timeout(componentName, cause) {
        return new ComponentInitError(componentName, {
            cause,
            context: 'timeout',
            metadata: { timeoutType: 'initialization' }
        });
    }
    
    /**
     * Create a dependency error for component initialization
     * @param {string} componentName - Component name
     * @param {string} dependencyName - Dependency name
     * @param {Error} [cause] - Original error
     * @returns {ComponentInitError} New component dependency error
     */
    static dependency(componentName, dependencyName, cause) {
        return new ComponentInitError(componentName, {
            cause,
            context: 'dependency',
            metadata: { dependencyName }
        });
    }
}

/**
 * Error for settings-related issues
 */
export class SettingsError extends ExtensionError {
    // Private fields
    #key;
    
    /**
     * Create a new settings error
     * @param {string} message - Error message
     * @param {string} key - Settings key
     * @param {ErrorOptions} options - Error options
     */
    constructor(message, key, options = {}) {
        super(message, {
            ...options,
            metadata: {
                ...(options.metadata || {}),
                key
            }
        });
        this.name = 'SettingsError';
        this.#key = key;
    }
    
    /**
     * Get the settings key
     * @returns {string} Settings key
     */
    get key() {
        return this.#key;
    }
    
    /**
     * Create a validation error for a specific settings key
     * @param {string} key - Settings key that failed validation
     * @param {string} type - Expected setting type
     * @param {Error} [cause] - Causing error
     * @returns {SettingsError} New settings validation error
     */
    static validation(key, type, cause) {
        return new SettingsError(
            `Failed to validate setting: ${key} (${type})`,
            key,
            {
                cause,
                context: 'validation',
                metadata: { type }
            }
        );
    }
    
    /**
     * Create a missing setting error
     * @param {string} key - Missing setting key
     * @returns {SettingsError} New missing setting error
     */
    static missing(key) {
        return new SettingsError(
            `Missing required setting: ${key}`,
            key,
            { context: 'validation' }
        );
    }
    
    /**
     * Create a settings schema error
     * @param {string} schemaId - Schema ID
     * @param {Error} [cause] - Causing error
     * @returns {SettingsError} New settings schema error
     */
    static schema(schemaId, cause) {
        return new SettingsError(
            `Failed to load settings schema: ${schemaId}`,
            'schema',
            {
                cause,
                context: 'schema',
                metadata: { schemaId }
            }
        );
    }
}

/**
 * Error for resource management issues
 */
export class ResourceError extends ExtensionError {
    // Private fields
    #resourceId;
    #resourceType;
    
    /**
     * Create a new resource error
     * @param {string} message - Error message
     * @param {string} resourceId - ID of the resource
     * @param {ErrorOptions} options - Error options
     */
    constructor(message, resourceId, options = {}) {
        super(message, {
            ...options,
            metadata: {
                ...(options.metadata || {}),
                resourceId
            }
        });
        this.name = 'ResourceError';
        this.#resourceId = resourceId;
        this.#resourceType = options.metadata?.resourceType ?? 'unknown';
    }
    
    /**
     * Get the resource ID
     * @returns {string} Resource ID
     */
    get resourceId() {
        return this.#resourceId;
    }
    
    /**
     * Get the resource type
     * @returns {string} Resource type
     */
    get resourceType() {
        return this.#resourceType;
    }
    
    /**
     * Create a resource cleanup error
     * @param {string} resourceId - Resource ID
     * @param {string} [resourceType] - Resource type
     * @param {Error} [cause] - Causing error
     * @returns {ResourceError} New resource cleanup error
     */
    static cleanup(resourceId, resourceType, cause) {
        return new ResourceError(
            `Failed to clean up resource: ${resourceId}`,
            resourceId,
            {
                cause,
                context: 'cleanup',
                recoverable: true,
                metadata: { resourceType }
            }
        );
    }
    
    /**
     * Create a resource allocation error
     * @param {string} resourceType - Type of resource
     * @param {Error} [cause] - Causing error
     * @returns {ResourceError} New resource allocation error
     */
    static allocation(resourceType, cause) {
        return new ResourceError(
            `Failed to allocate resource of type: ${resourceType}`,
            null,
            {
                cause,
                context: 'allocation',
                metadata: { resourceType }
            }
        );
    }
    
    /**
     * Create a resource limit error
     * @param {string} resourceType - Type of resource
     * @param {number} current - Current resource count
     * @param {number} limit - Resource limit
     * @returns {ResourceError} New resource limit error
     */
    static limit(resourceType, current, limit) {
        return new ResourceError(
            `Resource limit reached for ${resourceType}: ${current}/${limit}`,
            null,
            {
                context: 'limit',
                metadata: { resourceType, current, limit }
            }
        );
    }
}

/**
 * Error for signal handling issues
 */
export class SignalError extends ExtensionError {
    // Private fields
    #signalName;
    #signalId;
    
    /**
     * Create a new signal error
     * @param {string} message - Error message
     * @param {string} signalName - Name of the signal
     * @param {ErrorOptions} options - Error options
     */
    constructor(message, signalName, options = {}) {
        super(message, {
            ...options,
            metadata: {
                ...(options.metadata || {}),
                signalName
            }
        });
        this.name = 'SignalError';
        this.#signalName = signalName;
        this.#signalId = options.metadata?.signalId ?? null;
    }
    
    /**
     * Get the signal name
     * @returns {string} Signal name
     */
    get signalName() {
        return this.#signalName;
    }
    
    /**
     * Get the signal ID
     * @returns {string|null} Signal ID
     */
    get signalId() {
        return this.#signalId;
    }
    
    /**
     * Create a signal connection error
     * @param {string} signalName - Signal name
     * @param {object} target - Target object
     * @param {Error} [cause] - Causing error
     * @returns {SignalError} New signal connection error
     */
    static connection(signalName, target, cause) {
        return new SignalError(
            `Failed to connect signal: ${signalName}`,
            signalName,
            {
                cause,
                context: 'connection',
                metadata: {
                    targetType: target?.constructor?.name ?? 'unknown'
                }
            }
        );
    }
    
    /**
     * Create a signal disconnection error
     * @param {string} signalId - Signal ID
     * @param {Error} [cause] - Causing error
     * @returns {SignalError} New signal disconnection error
     */
    static disconnection(signalId, cause) {
        return new SignalError(
            `Failed to disconnect signal: ${signalId}`,
            'unknown',
            {
                cause,
                context: 'disconnection',
                metadata: { signalId }
            }
        );
    }
    
    /**
     * Create a signal emission error
     * @param {string} signalName - Signal name
     * @param {Error} [cause] - Causing error
     * @returns {SignalError} New signal emission error
     */
    static emission(signalName, cause) {
        return new SignalError(
            `Failed to emit signal: ${signalName}`,
            signalName,
            {
                cause,
                context: 'emission'
            }
        );
    }
}

/**
 * Error for display/monitor issues
 */
export class DisplayError extends ExtensionError {
    /**
     * Create a new display error
     * @param {string} message - Error message
     * @param {ErrorOptions} options - Error options
     */
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'DisplayError';
    }
    
    /**
     * Create a monitor detection error
     * @param {Error} [cause] - Causing error
     * @returns {DisplayError} New monitor detection error
     */
    static monitorDetection(cause) {
        return new DisplayError(
            'Failed to detect monitors',
            {
                cause,
                context: 'detection'
            }
        );
    }
    
    /**
     * Create a display configuration error
     * @param {string} configName - Configuration name
     * @param {Error} [cause] - Causing error
     * @returns {DisplayError} New display configuration error
     */
    static configuration(configName, cause) {
        return new DisplayError(
            `Failed to apply display configuration: ${configName}`,
            {
                cause,
                context: 'configuration',
                metadata: { configName }
            }
        );
    }
}

/**
 * Registry for tracking and analyzing errors
 */
export class ErrorRegistry {
    // Private fields
    #errors = new Map();
    #listeners = new Set();
    #patterns = new Map();
    #debug;
    #config = {
        maxErrors: 100,
        retentionTime: 30 * 60 * 1000 // 30 minutes
    };
    
    /**
     * Create a new error registry
     * @param {Function} debugFn - Debug logging function
     */
    constructor(debugFn) {
        this.#debug = debugFn || (() => {});
    }
    
    /**
     * Configure the error registry
     * @param {Object} config - Configuration options
     * @param {number} [config.maxErrors] - Maximum number of errors to keep
     * @param {number} [config.retentionTime] - Time in ms to keep errors
     */
    configure(config) {
        if (config.maxErrors !== undefined) {
            this.#config.maxErrors = Math.max(10, config.maxErrors);
        }
        
        if (config.retentionTime !== undefined) {
            this.#config.retentionTime = Math.max(60000, config.retentionTime);
        }
    }
    
    /**
     * Register an error
     * @param {Error} error - Error to register
     * @param {string} [context] - Error context
     * @returns {string|null} Error ID if registered
     */
    registerError(error, context) {
        try {
            // Convert to ExtensionError if not already
            const extError = error instanceof ExtensionError 
                ? error 
                : new ExtensionError(error.message, {
                    cause: error,
                    context
                });
                
            // Store error
            const errorId = extError.errorId;
            this.#errors.set(errorId, {
                error: extError,
                registered: new Date(),
                context,
                structured: extError.toStructured()
            });
            
            // Notify listeners
            this.#notifyListeners(extError);
            
            // Check patterns
            this.#checkErrorPatterns(extError);
            
            // Clean up old errors
            this.#cleanupOldErrors();
            
            return errorId;
        } catch (e) {
            this.#debug(`Error registering error: ${e.message}`);
            return null;
        }
    }
    
    /**
     * Add an error pattern to match against
     * @param {Object} pattern - Error pattern
     * @param {string} [pattern.namePattern] - Regex pattern for error name
     * @param {string} [pattern.messagePattern] - Regex pattern for error message
     * @param {string} [pattern.contextPattern] - Regex pattern for error context
     * @param {Function} callback - Callback when pattern matches
     * @returns {string} Pattern ID
     */
    addErrorPattern(pattern, callback) {
        const patternId = `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        this.#patterns.set(patternId, {
            ...pattern,
            callback
        });
        
        return patternId;
    }
    
    /**
     * Remove an error pattern
     * @param {string} patternId - Pattern ID to remove
     * @returns {boolean} True if pattern was removed
     */
    removeErrorPattern(patternId) {
        return this.#patterns.delete(patternId);
    }
    
    /**
     * Add an error listener
     * @param {Function} listener - Error listener function
     * @returns {string} Listener ID
     */
    addErrorListener(listener) {
        const listenerId = `listener-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        this.#listeners.add({
            id: listenerId,
            callback: listener
        });
        
        return listenerId;
    }
    
    /**
     * Remove an error listener
     * @param {string} listenerId - Listener ID to remove
     * @returns {boolean} True if listener was removed
     */
    removeErrorListener(listenerId) {
        for (const listener of this.#listeners) {
            if (listener.id === listenerId) {
                this.#listeners.delete(listener);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Check error against patterns
     * @param {ExtensionError} error - Error to check
     * @private
     */
    #checkErrorPatterns(error) {
        for (const [patternId, pattern] of this.#patterns.entries()) {
            try {
                let matches = true;
                
                if (pattern.namePattern && 
                    !new RegExp(pattern.namePattern).test(error.name)) {
                    matches = false;
                }
                
                if (matches && pattern.messagePattern && 
                    !new RegExp(pattern.messagePattern).test(error.message)) {
                    matches = false;
                }
                
                if (matches && pattern.contextPattern && 
                    !new RegExp(pattern.contextPattern).test(error.context)) {
                    matches = false;
                }
                
                if (matches && typeof pattern.callback === 'function') {
                    pattern.callback(error, patternId);
                }
            } catch (e) {
                this.#debug(`Error checking pattern ${patternId}: ${e.message}`);
            }
        }
    }
    
    /**
     * Notify listeners about a new error
     * @param {ExtensionError} error - Error to notify about
     * @private
     */
    #notifyListeners(error) {
        for (const listener of this.#listeners) {
            try {
                listener.callback(error);
            } catch (e) {
                this.#debug(`Error in listener ${listener.id}: ${e.message}`);
            }
        }
    }
    
    /**
     * Clean up old errors
     * @private
     */
    #cleanupOldErrors() {
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - this.#config.retentionTime);
        
        // Clean up by age
        for (const [errorId, entry] of this.#errors.entries()) {
            if (entry.registered < cutoffTime) {
                this.#errors.delete(errorId);
            }
        }
        
        // Clean up by count
        if (this.#errors.size > this.#config.maxErrors) {
            // Get errors sorted by age (oldest first)
            const sortedErrors = Array.from(this.#errors.entries())
                .sort((a, b) => a[1].registered - b[1].registered);
                
            // Delete oldest errors until we're under the limit
            const deleteCount = this.#errors.size - this.#config.maxErrors;
            for (let i = 0; i < deleteCount; i++) {
                if (sortedErrors[i]) {
                    this.#errors.delete(sortedErrors[i][0]);
                }
            }
        }
    }
    
    /**
     * Get a specific error by ID
     * @param {string} errorId - Error ID to retrieve
     * @returns {Error|null} The error or null if not found
     */
    getError(errorId) {
        return this.#errors.get(errorId)?.error ?? null;
    }
    
    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getStatistics() {
        const stats = {
            total: this.#errors.size,
            byName: {},
            byLevel: {},
            byContext: {},
            byAge: {
                lastMinute: 0,
                lastHour: 0,
                older: 0
            },
            byRecoverability: {
                recoverable: 0,
                nonRecoverable: 0
            }
        };
        
        const now = new Date();
        const lastMinute = new Date(now.getTime() - 60 * 1000);
        const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
        
        for (const [, entry] of this.#errors.entries()) {
            const { error, registered } = entry;
            
            // Count by name
            stats.byName[error.name] = (stats.byName[error.name] || 0) + 1;
            
            // Count by level
            stats.byLevel[error.level] = (stats.byLevel[error.level] || 0) + 1;
            
            // Count by context
            if (error.context) {
                stats.byContext[error.context] = (stats.byContext[error.context] || 0) + 1;
            }
            
            // Count by age
            if (registered > lastMinute) {
                stats.byAge.lastMinute++;
            } else if (registered > lastHour) {
                stats.byAge.lastHour++;
            } else {
                stats.byAge.older++;
            }
            
            // Count by recoverability
            if (error.recoverable) {
                stats.byRecoverability.recoverable++;
            } else {
                stats.byRecoverability.nonRecoverable++;
            }
        }
        
        return stats;
    }
    
    /**
     * Find errors matching criteria
     * @param {Object} filters - Filters to apply
     * @param {string} [filters.namePattern] - Regex pattern for error name
     * @param {string} [filters.messagePattern] - Regex pattern for error message
     * @param {string} [filters.contextPattern] - Regex pattern for error context
     * @param {string} [filters.level] - Error level
     * @param {Object} options - Search options
     * @param {number} [options.limit=10] - Maximum number of errors to return
     * @param {boolean} [options.newest=true] - Sort by newest first
     * @returns {Array<Object>} Matching error entries
     */
    findErrors(filters = {}, options = {}) {
        const limit = options.limit ?? 10;
        const newest = options.newest ?? true;
        
        let results = [];
        
        // Build filter functions
        const nameFilter = filters.namePattern 
            ? (error) => new RegExp(filters.namePattern).test(error.name)
            : null;
            
        const messageFilter = filters.messagePattern
            ? (error) => new RegExp(filters.messagePattern).test(error.message)
            : null;
            
        const contextFilter = filters.contextPattern
            ? (error) => new RegExp(filters.contextPattern).test(error.context ?? '')
            : null;
            
        const levelFilter = filters.level
            ? (error) => error.level === filters.level
            : null;
            
        // Apply filters
        for (const [errorId, entry] of this.#errors.entries()) {
            const { error } = entry;
            
            if (nameFilter && !nameFilter(error)) continue;
            if (messageFilter && !messageFilter(error)) continue;
            if (contextFilter && !contextFilter(error)) continue;
            if (levelFilter && !levelFilter(error)) continue;
            
            results.push({
                id: errorId,
                ...entry.structured,
                registered: entry.registered
            });
        }
        
        // Sort results
        results.sort((a, b) => {
            return newest 
                ? b.registered - a.registered 
                : a.registered - b.registered;
        });
        
        // Apply limit
        return results.slice(0, limit);
    }
    
    /**
     * Clear all errors
     */
    clearErrors() {
        this.#errors.clear();
    }
}

// Create and export error registry singleton
export const errorRegistry = new ErrorRegistry(
    (...args) => console.debug('[ErrorRegistry]', ...args)
); 