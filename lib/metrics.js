'use strict';

import GLib from 'gi://GLib';

const performance = { now: () => GLib.get_monotonic_time() / 1000 };

/**
 * Performance metrics tracking and telemetry class
 * Provides methods to track timings, operations, and resource usage
 */
class Metrics {
    // Private fields
    #enabled = false;
    #counters = new Map();
    #timers = new Map();
    #gauge = new Map();
    #histograms = new Map();
    #activeTimers = new Map();
    #frameTimeResults = [];
    #frameTimings = [];
    #frameTimeoutId = null;
    #maxSamples = 100;
    #callbacks = new Set();
    #abortController = new AbortController();
    
    // Static init block
    static {
        this.MetricTypes = Object.freeze({
            COUNTER: 'counter',
            GAUGE: 'gauge',
            HISTOGRAM: 'histogram',
            TIMER: 'timer'
        });
        
        this.HistogramBuckets = Object.freeze({
            LATENCY: [0, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
            FRAME_TIMES: [0, 16.7, 33.3, 50, 100, 250, 500, 1000]
        });
    }
    
    /**
     * Create new metrics instance
     * @param {boolean} [enabled=false] - Whether metrics are initially enabled
     */
    constructor(enabled = false) {
        this.#enabled = enabled;
        
        // Initialize default histograms
        this.#initializeHistograms();
        
        // Setup cleanup when instance is destroyed
        this.#abortController.signal.addEventListener('abort', () => {
            this.#stopFrameWatching();
            this.#callbacks.clear();
        });
    }
    
    /**
     * Initialize default histograms with predefined buckets
     * @private
     */
    #initializeHistograms() {
        // Frame time histogram
        this.#histograms.set('frame_time', {
            buckets: Metrics.HistogramBuckets.FRAME_TIMES,
            counts: new Array(Metrics.HistogramBuckets.FRAME_TIMES.length + 1).fill(0),
            sum: 0,
            count: 0,
            min: Infinity,
            max: 0
        });
        
        // Timer durations histogram
        this.#histograms.set('timer_duration', {
            buckets: Metrics.HistogramBuckets.LATENCY,
            counts: new Array(Metrics.HistogramBuckets.LATENCY.length + 1).fill(0),
            sum: 0,
            count: 0,
            min: Infinity,
            max: 0
        });
    }
    
    /**
     * Enable/disable metrics collection
     * @param {boolean} enabled - Whether metrics should be enabled
     */
    setEnabled(enabled) {
        this.#enabled = Boolean(enabled);
        
        // When disabling, stop any active frame watching
        if (!this.#enabled) {
            this.#stopFrameWatching();
        }
    }
    
    /**
     * Check if metrics are enabled
     * @returns {boolean} Whether metrics are enabled
     */
    isEnabled() {
        return this.#enabled;
    }
    
    /**
     * Increment a counter
     * @param {string} name - Counter name
     * @param {number} [value=1] - Value to increment by
     * @param {Object} [labels={}] - Labels to attach to this counter
     * @returns {number} New counter value
     */
    incrementCounter(name, value = 1, labels = {}) {
        if (!this.#enabled) {
            return 0;
        }
        
        const key = this.#formatMetricKey(name, labels);
        const currentValue = this.#counters.get(key) ?? 0;
        const newValue = currentValue + value;
        
        this.#counters.set(key, newValue);
        this.#notifyCallbacks(Metrics.MetricTypes.COUNTER, name, newValue, labels);
        
        return newValue;
    }
    
    /**
     * Set a gauge value
     * @param {string} name - Gauge name
     * @param {number} value - Value to set
     * @param {Object} [labels={}] - Labels to attach to this gauge
     * @returns {number} Set value
     */
    setGauge(name, value, labels = {}) {
        if (!this.#enabled) {
            return value;
        }
        
        const key = this.#formatMetricKey(name, labels);
        this.#gauge.set(key, value);
        this.#notifyCallbacks(Metrics.MetricTypes.GAUGE, name, value, labels);
        
        return value;
    }
    
    /**
     * Create and start a timer
     * @param {string} name - Timer name
     * @param {Object} [labels={}] - Labels to attach to this timer
     * @returns {Object} Timer object with stop() method
     */
    startTimer(name, labels = {}) {
        const startTime = performance.now();
        let hasEnded = false;
        let timerLabels = { ...labels };
        
        const timerId = `${name}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Store the active timer reference
        this.#activeTimers.set(timerId, {
            name,
            startTime,
            labels: timerLabels
        });
        
        // Create the timer object
        const timer = {
            /**
             * Add labels to the timer
             * @param {Object} additionalLabels - Labels to add
             * @returns {Object} This timer object
             */
            addLabels: (additionalLabels = {}) => {
                if (hasEnded) return timer; // Don't modify ended timers
                
                timerLabels = {
                    ...timerLabels,
                    ...additionalLabels
                };
                
                // Update stored labels
                const activeTimer = this.#activeTimers.get(timerId);
                if (activeTimer) {
                    activeTimer.labels = timerLabels;
                }
                
                return timer;
            },
            
            /**
             * Stop the timer and record results
             * @returns {number} Timer duration in ms
             */
            stop: () => {
                if (hasEnded) return 0;
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                // Mark as ended to prevent double stops
                hasEnded = true;
                
                // Remove from active timers
                this.#activeTimers.delete(timerId);
                
                // Only record if metrics are enabled
                if (this.#enabled) {
                    this.#recordTimer(name, duration, timerLabels);
                }
                
                return duration;
            }
        };
        
        return timer;
    }
    
    /**
     * Add a timing value to a histogram
     * @param {string} name - Histogram name
     * @param {number} value - Value to add
     * @param {Object} [labels={}] - Labels to attach
     */
    observeHistogram(name, value, labels = {}) {
        if (!this.#enabled || value < 0) {
            return;
        }
        
        // Get existing histogram or create new one
        let histogram = this.#histograms.get(name);
        if (!histogram) {
            // If no explicit buckets, use latency buckets by default
            histogram = {
                buckets: Metrics.HistogramBuckets.LATENCY,
                counts: new Array(Metrics.HistogramBuckets.LATENCY.length + 1).fill(0),
                sum: 0,
                count: 0,
                min: Infinity,
                max: 0
            };
            this.#histograms.set(name, histogram);
        }
        
        // Increment the appropriate bucket
        let bucketIndex = histogram.buckets.findIndex(bucket => value <= bucket);
        if (bucketIndex === -1) {
            // If value exceeds all buckets, use the overflow bucket
            bucketIndex = histogram.buckets.length;
        }
        
        histogram.counts[bucketIndex]++;
        histogram.sum += value;
        histogram.count++;
        histogram.min = Math.min(histogram.min, value);
        histogram.max = Math.max(histogram.max, value);
        
        // Notify callbacks
        this.#notifyCallbacks(Metrics.MetricTypes.HISTOGRAM, name, value, labels);
    }
    
    /**
     * Start tracking frame times
     * @param {number} [sampleRate=60] - How many frames to sample per second
     */
    startFrameWatching(sampleRate = 60) {
        if (!this.#enabled || this.#frameTimeoutId !== null) {
            return;
        }
        
        let lastTimestamp = 0;
        const interval = Math.floor(1000 / sampleRate);
        
        // Frame callback
        const frameCallback = () => {
            if (!this.#enabled) {
                this.#stopFrameWatching();
                return;
            }
            
            const now = performance.now();
            
            // Calculate frame time if we have a previous timestamp
            if (lastTimestamp > 0) {
                const frameTime = now - lastTimestamp;
                this.#recordFrameTime(frameTime);
            }
            
            lastTimestamp = now;
            
            // Schedule next frame
            this.#frameTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
                frameCallback();
                return GLib.SOURCE_REMOVE; // Don't repeat automatically
            });
        };
        
        // Start the first frame
        frameCallback();
    }
    
    /**
     * Stop frame time tracking
     */
    stopFrameWatching() {
        this.#stopFrameWatching();
    }
    
    /**
     * Add a callback for when metrics change
     * @param {Function} callback - Function called with metric updates
     * @returns {string} Callback ID for removal
     */
    addCallback(callback) {
        if (typeof callback !== 'function') {
            return null;
        }
        
        const id = `callback-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        this.#callbacks.add({
            id,
            callback
        });
        
        return id;
    }
    
    /**
     * Remove a metrics callback
     * @param {string} id - Callback ID to remove
     * @returns {boolean} Whether callback was removed
     */
    removeCallback(id) {
        for (const cb of this.#callbacks) {
            if (cb.id === id) {
                this.#callbacks.delete(cb);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Get all collected metrics
     * @returns {Object} Metrics data
     */
    getMetrics() {
        // Convert maps to objects for easier serialization
        const counters = Object.fromEntries(this.#counters);
        const gauges = Object.fromEntries(this.#gauge);
        
        // Process timer data
        const timers = {};
        for (const [key, samples] of this.#timers.entries()) {
            if (samples.length === 0) continue;
            
            // Calculate stats
            const sum = samples.reduce((acc, val) => acc + val, 0);
            const avg = sum / samples.length;
            const min = Math.min(...samples);
            const max = Math.max(...samples);
            
            // Sort for percentiles
            const sorted = [...samples].sort((a, b) => a - b);
            const p50 = sorted[Math.floor(sorted.length * 0.5)];
            const p90 = sorted[Math.floor(sorted.length * 0.9)];
            const p99 = sorted[Math.floor(sorted.length * 0.99)];
            
            timers[key] = {
                count: samples.length,
                min,
                max,
                avg,
                p50,
                p90,
                p99
            };
        }
        
        // Process histogram data
        const histograms = {};
        for (const [name, data] of this.#histograms.entries()) {
            histograms[name] = {
                buckets: data.buckets,
                counts: data.counts,
                sum: data.sum,
                count: data.count,
                min: data.min === Infinity ? 0 : data.min,
                max: data.max
            };
        }
        
        // Frame time data
        const frameTimeStats = this.#calculateFrameTimeStats();
        
        return {
            counters,
            gauges,
            timers,
            histograms,
            frameTimeStats,
            activeTimers: this.#activeTimers.size,
            enabled: this.#enabled,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Reset all collected metrics
     */
    reset() {
        this.#counters.clear();
        this.#timers.clear();
        this.#gauge.clear();
        this.#histograms.clear();
        this.#activeTimers.clear();
        this.#frameTimeResults = [];
        this.#frameTimings = [];
        
        // Re-initialize default histograms
        this.#initializeHistograms();
    }
    
    /**
     * Stop frame watching
     * @private
     */
    #stopFrameWatching() {
        if (this.#frameTimeoutId !== null) {
            GLib.source_remove(this.#frameTimeoutId);
            this.#frameTimeoutId = null;
        }
    }
    
    /**
     * Record a timer result
     * @param {string} name - Timer name
     * @param {number} duration - Duration in ms
     * @param {Object} labels - Associated labels
     * @private
     */
    #recordTimer(name, duration, labels = {}) {
        // Use core name without labels for the histogram
        this.observeHistogram('timer_duration', duration, { 
            timer_name: name,
            ...labels
        });
        
        // Store the timer with its full key including labels
        const key = this.#formatMetricKey(name, labels);
        
        // Initialize array if needed
        if (!this.#timers.has(key)) {
            this.#timers.set(key, []);
        }
        
        const samples = this.#timers.get(key);
        
        // Add new sample and limit array size
        samples.push(duration);
        if (samples.length > this.#maxSamples) {
            samples.shift();
        }
        
        // Notify callbacks
        this.#notifyCallbacks(Metrics.MetricTypes.TIMER, name, duration, labels);
    }
    
    /**
     * Record a frame time measurement
     * @param {number} frameTime - Frame time in ms
     * @private
     */
    #recordFrameTime(frameTime) {
        // Add to raw data
        this.#frameTimings.push({
            time: frameTime,
            timestamp: Date.now()
        });
        
        // Limit array size
        if (this.#frameTimings.length > this.#maxSamples) {
            this.#frameTimings.shift();
        }
        
        // Update histogram
        this.observeHistogram('frame_time', frameTime);
        
        // Calculate FPS (1000 / frameTime)
        const fps = frameTime > 0 ? 1000 / frameTime : 0;
        
        // Add to results
        this.#frameTimeResults.push({
            frameTime,
            fps,
            timestamp: Date.now()
        });
        
        // Limit array size
        if (this.#frameTimeResults.length > this.#maxSamples) {
            this.#frameTimeResults.shift();
        }
        
        // Update FPS gauge
        this.setGauge('current_fps', Math.round(fps * 10) / 10);
    }
    
    /**
     * Calculate frame time statistics
     * @returns {Object} Frame time statistics
     * @private
     */
    #calculateFrameTimeStats() {
        if (this.#frameTimeResults.length === 0) {
            return {
                count: 0,
                avgFps: 0,
                avgFrameTime: 0,
                minFrameTime: 0,
                maxFrameTime: 0,
                p50FrameTime: 0,
                p90FrameTime: 0,
                p99FrameTime: 0,
                fpsStability: 100
            };
        }
        
        // Extract times and FPS values
        const frameTimes = this.#frameTimeResults.map(r => r.frameTime);
        const fpsValues = this.#frameTimeResults.map(r => r.fps);
        
        // Calculate statistics
        const sum = frameTimes.reduce((acc, val) => acc + val, 0);
        const avgFrameTime = sum / frameTimes.length;
        const avgFps = 1000 / avgFrameTime;
        
        // Sort for percentiles
        const sortedTimes = [...frameTimes].sort((a, b) => a - b);
        const p50FrameTime = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
        const p90FrameTime = sortedTimes[Math.floor(sortedTimes.length * 0.9)] || 0;
        const p99FrameTime = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;
        
        // FPS stability (how consistent frame times are)
        const fpsVariance = fpsValues.reduce((acc, fps) => {
            const diff = fps - avgFps;
            return acc + diff * diff;
        }, 0) / fpsValues.length;
        
        // Convert variance to a 0-100 stability score (higher is better)
        // Using a formula that gives 100 for perfect stability and decreases as variance increases
        const fpsStability = Math.max(0, Math.min(100, 100 / (1 + Math.sqrt(fpsVariance) / 5)));
        
        return {
            count: frameTimes.length,
            avgFps: Math.round(avgFps * 10) / 10,
            avgFrameTime: Math.round(avgFrameTime * 100) / 100,
            minFrameTime: Math.min(...frameTimes),
            maxFrameTime: Math.max(...frameTimes),
            p50FrameTime,
            p90FrameTime,
            p99FrameTime,
            fpsStability: Math.round(fpsStability)
        };
    }
    
    /**
     * Format a metric key by combining the name and labels
     * @param {string} name - Metric name
     * @param {Object} labels - Label key-value pairs
     * @returns {string} Formatted metric key
     * @private
     */
    #formatMetricKey(name, labels = {}) {
        if (!labels || Object.keys(labels).length === 0) {
            return name;
        }
        
        // Sort label keys for consistent ordering
        const sortedLabels = Object.entries(labels)
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
            
        // Build label string
        const labelString = sortedLabels
            .map(([key, value]) => `${key}="${String(value).replace(/"/g, '\\"')}"`)
            .join(',');
            
        return `${name}{${labelString}}`;
    }
    
    /**
     * Notify metric update callbacks
     * @param {string} type - Metric type
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     * @param {Object} labels - Metric labels
     * @private
     */
    #notifyCallbacks(type, name, value, labels = {}) {
        if (this.#callbacks.size === 0) {
            return;
        }
        
        const update = {
            type,
            name,
            value,
            labels,
            timestamp: Date.now()
        };
        
        for (const cb of this.#callbacks) {
            try {
                cb.callback(update);
            } catch (error) {
                console.error(`Error in metrics callback: ${error.message}`);
            }
        }
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        this.stopFrameWatching();
        this.#abortController.abort('Metrics destroyed');
    }
}

// Export a singleton instance
export const metrics = new Metrics();

/**
 * Create a new metrics instance
 * @param {boolean} [enabled=false] - Whether metrics are enabled by default
 * @returns {Metrics} New metrics instance
 */
export function createMetrics(enabled = false) {
    return new Metrics(enabled);
}

/**
 * Measure execution time of a function
 * @param {Function} fn - Function to measure
 * @param {string} [name='function_execution'] - Timer name
 * @param {Object} [labels={}] - Timer labels
 * @returns {any} Function result
 */
export function measure(fn, name = 'function_execution', labels = {}) {
    const timer = metrics.startTimer(name, labels);
    
    try {
        const result = fn();
        
        // Handle async functions (Promises)
        if (result instanceof Promise) {
            return result.finally(() => timer.stop());
        }
        
        timer.stop();
        return result;
    } catch (error) {
        // Add error information to timer before stopping
        timer.addLabels({ error: true, error_type: error.name });
        timer.stop();
        
        throw error;
    }
}

/**
 * Create an async function measuring decorator
 * @param {string} [name] - Timer name (defaults to function name)
 * @param {Object} [labels={}] - Timer labels
 * @returns {Function} Decorator function
 */
export function timed(name, labels = {}) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const timerName = name || propertyKey || 'anonymous_function';
        
        descriptor.value = function(...args) {
            const timer = metrics.startTimer(timerName, {
                ...labels,
                class: target.constructor?.name
            });
            
            try {
                const result = originalMethod.apply(this, args);
                
                // Handle async functions
                if (result instanceof Promise) {
                    return result.finally(() => timer.stop());
                }
                
                timer.stop();
                return result;
            } catch (error) {
                timer.addLabels({ error: true, error_type: error.name });
                timer.stop();
                throw error;
            }
        };
        
        return descriptor;
    };
} 