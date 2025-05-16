'use strict';

/**
 * Mock implementation of WeakRef for testing
 */
class MockWeakRef {
    constructor(target) {
        this.target = target;
    }
    
    deref() {
        return this.target;
    }
}

/**
 * Mock implementation of FinalizationRegistry for testing
 */
class MockFinalizationRegistry {
    constructor(callback) {
        this.callback = callback;
        this.entries = new Map();
    }
    
    register(target, heldValue, unregisterToken = null) {
        const key = Symbol('registration');
        this.entries.set(key, { target, heldValue, unregisterToken });
        return key;
    }
    
    unregister(unregisterToken) {
        for (const [key, entry] of this.entries.entries()) {
            if (entry.unregisterToken === unregisterToken) {
                this.entries.delete(key);
                break;
            }
        }
    }
    
    // Helper method for testing to simulate cleanup
    _simulateCleanup(key) {
        if (this.entries.has(key)) {
            const { heldValue } = this.entries.get(key);
            this.callback(heldValue);
            this.entries.delete(key);
        }
    }
    
    // Helper method to clear all entries
    _clear() {
        this.entries.clear();
    }
}

/**
 * Mock implementation of AbortController for testing
 */
class MockAbortController {
    constructor() {
        this.signal = new MockAbortSignal();
    }
    
    abort(reason) {
        this.signal._abort(reason);
    }
}

/**
 * Mock implementation of AbortSignal for testing
 */
class MockAbortSignal {
    constructor() {
        this.aborted = false;
        this.reason = undefined;
        this.listeners = new Map();
    }
    
    addEventListener(type, callback, options = {}) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        
        const handler = {
            callback,
            once: options.once || false
        };
        
        this.listeners.get(type).push(handler);
        
        // If already aborted, dispatch event immediately
        if (type === 'abort' && this.aborted) {
            this._dispatchEvent(new CustomEvent('abort'));
        }
    }
    
    removeEventListener(type, callback) {
        if (!this.listeners.has(type)) return;
        
        const handlers = this.listeners.get(type);
        const index = handlers.findIndex(handler => handler.callback === callback);
        
        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }
    
    _abort(reason) {
        if (this.aborted) return;
        
        this.aborted = true;
        this.reason = reason;
        
        this._dispatchEvent(new CustomEvent('abort'));
    }
    
    _dispatchEvent(event) {
        if (!this.listeners.has(event.type)) return;
        
        const handlers = [...this.listeners.get(event.type)];
        const oncers = [];
        
        for (let i = 0; i < handlers.length; i++) {
            const handler = handlers[i];
            
            handler.callback.call(this, event);
            
            if (handler.once) {
                oncers.push(i);
            }
        }
        
        // Remove once handlers in reverse order to avoid index shifting
        if (oncers.length > 0) {
            const handlersArray = this.listeners.get(event.type);
            
            for (let i = oncers.length - 1; i >= 0; i--) {
                handlersArray.splice(oncers[i], 1);
            }
        }
    }
}

/**
 * Mock implementation of CustomEvent for testing
 */
class CustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
    }
}

/**
 * Utility to wrap setTimeout for testing
 */
function timeout(callback, delay) {
    return setTimeout(callback, delay);
}

/**
 * Utility to wrap clearTimeout for testing
 */
function clearTimeoutFn(id) {
    return clearTimeout(id);
}

// Export all mocks
export {
    MockWeakRef,
    MockFinalizationRegistry,
    MockAbortController,
    MockAbortSignal,
    CustomEvent,
    timeout,
    clearTimeoutFn
}; 