// Firebase Data Usage Monitor
// Add this to your existing JavaScript code

class FirebaseDataMonitor {
    constructor() {
        this.totalDownloaded = 0;
        this.sessionDownloaded = 0;
        this.downloadHistory = [];
        this.startTime = Date.now();
        this.originalRef = null;
        this.originalOn = null;
        this.isMonitoring = false;
    }

    // Initialize monitoring
    init() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.loadStoredData();
        this.interceptFirebaseOperations();
        this.createMonitoringUI();
        this.startPeriodicSave();
    }

    // Load previously stored data usage
    loadStoredData() {
        const stored = localStorage.getItem('firebase_data_usage');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.totalDownloaded = data.totalDownloaded || 0;
                this.downloadHistory = data.downloadHistory || [];
            } catch (e) {
                console.warn('Failed to load stored data usage:', e);
            }
        }
    }

    // Save data usage to localStorage
    saveDataUsage() {
        const data = {
            totalDownloaded: this.totalDownloaded,
            downloadHistory: this.downloadHistory.slice(-100), // Keep last 100 entries
            lastUpdated: Date.now()
        };
        localStorage.setItem('firebase_data_usage', JSON.stringify(data));
    }

    // Intercept Firebase database operations
    interceptFirebaseOperations() {
        const self = this;
        
        // Store original methods
        if (firebase.database.Reference) {
            const originalRef = firebase.database.Reference.prototype;
            this.originalOn = originalRef.on;
            
            // Override the 'on' method to monitor data downloads
            originalRef.on = function(eventType, callback, cancelCallbackOrContext, context) {
                const wrappedCallback = function(snapshot) {
                    if (snapshot && snapshot.val) {
                        const data = snapshot.val();
                        const dataSize = self.estimateDataSize(data);
                        self.recordDownload(dataSize, eventType, snapshot.key);
                    }
                    
                    // Call original callback
                    if (typeof callback === 'function') {
                        callback.apply(this, arguments);
                    }
                };
                
                // Call original method with wrapped callback
                return self.originalOn.call(this, eventType, wrappedCallback, cancelCallbackOrContext, context);
            };
        }
    }

    // Estimate data size in bytes
    estimateDataSize(data) {
        if (!data) return 0;
        
        try {
            const jsonString = JSON.stringify(data);
            // UTF-8 encoding estimation
            return new Blob([jsonString]).size;
        } catch (e) {
            console.warn('Failed to estimate data size:', e);
            return 0;
        }
    }

    // Record a download event
    recordDownload(bytes, eventType, key) {
        this.totalDownloaded += bytes;
        this.sessionDownloaded += bytes;
        
        this.downloadHistory.push({
            timestamp: Date.now(),
            bytes: bytes,
            eventType: eventType,
            key: key || 'unknown'
        });
        
        // Keep only last 100 entries
        if (this.downloadHistory.length > 100) {
            this.downloadHistory.shift();
        }
        
        this.updateMonitoringUI();
    }

    // Create monitoring UI
    createMonitoringUI() {
        const monitorDiv = document.createElement('div');
        monitorDiv.id = 'firebase-data-monitor';
        monitorDiv.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            z-index: 9999;
            max-width: 250px;
            cursor: pointer;
            transition: opacity 0.3s;
        `;
        
        monitorDiv.innerHTML = `
            <div><strong>📊 Firebase Data Usage</strong></div>
            <div>Session: <span id="session-usage">0 B</span></div>
            <div>Total: <span id="total-usage">0 B</span></div>
            <div>Downloads: <span id="download-count">0</span></div>
            <div style="font-size: 10px; margin-top: 5px;">Click to toggle details</div>
        `;
        
        document.body.appendChild(monitorDiv);
        
        // Add click handler for toggle
        monitorDiv.addEventListener('click', () => {
            this.toggleDetailedView();
        });
        
        // Make it draggable
        this.makeDraggable(monitorDiv);
        
        this.updateMonitoringUI();
    }

    // Update monitoring UI
    updateMonitoringUI() {
        const sessionUsage = document.getElementById('session-usage');
        const totalUsage = document.getElementById('total-usage');
        const downloadCount = document.getElementById('download-count');
        
        if (sessionUsage) sessionUsage.textContent = this.formatBytes(this.sessionDownloaded);
        if (totalUsage) totalUsage.textContent = this.formatBytes(this.totalDownloaded);
        if (downloadCount) downloadCount.textContent = this.downloadHistory.length;
    }

    // Toggle detailed view
    toggleDetailedView() {
        const existingDetails = document.getElementById('firebase-monitor-details');
        if (existingDetails) {
            existingDetails.remove();
            return;
        }
        
        const detailsDiv = document.createElement('div');
        detailsDiv.id = 'firebase-monitor-details';
        detailsDiv.style.cssText = `
            position: fixed;
            top: 50px;
            left: 10px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 11px;
            z-index: 9999;
            max-width: 400px;
            max-height: 400px;
            overflow-y: auto;
        `;
        
        const recentDownloads = this.downloadHistory.slice(-10).reverse();
        const detailsHTML = `
            <div><strong>📈 Recent Downloads</strong></div>
            <div style="margin: 10px 0;">
                <div>Session Duration: ${this.formatDuration(Date.now() - this.startTime)}</div>
                <div>Avg per Download: ${this.formatBytes(this.totalDownloaded / Math.max(1, this.downloadHistory.length))}</div>
            </div>
            <div style="border-top: 1px solid #333; padding-top: 10px;">
                ${recentDownloads.map(download => `
                    <div style="margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.1); border-radius: 3px;">
                        <div>${new Date(download.timestamp).toLocaleTimeString()}</div>
                        <div>Size: ${this.formatBytes(download.bytes)}</div>
                        <div>Type: ${download.eventType}</div>
                        <div>Key: ${download.key}</div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 10px; text-align: center;">
                <button onclick="firebaseMonitor.exportData()" style="background: #333; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">Export Data</button>
                <button onclick="firebaseMonitor.resetData()" style="background: #d32f2f; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-left: 5px;">Reset</button>
            </div>
        `;
        
        detailsDiv.innerHTML = detailsHTML;
        document.body.appendChild(detailsDiv);
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (detailsDiv.parentNode) {
                detailsDiv.remove();
            }
        }, 10000);
    }

    // Make element draggable
    makeDraggable(element) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        element.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(element.style.left || '10px');
            startTop = parseInt(element.style.top || '10px');
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            element.style.left = (startLeft + deltaX) + 'px';
            element.style.top = (startTop + deltaY) + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // Format bytes to human readable
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Format duration
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    // Export data usage statistics
    exportData() {
        const data = {
            totalDownloaded: this.totalDownloaded,
            sessionDownloaded: this.sessionDownloaded,
            downloadHistory: this.downloadHistory,
            sessionDuration: Date.now() - this.startTime,
            exportedAt: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `firebase-data-usage-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Reset data usage statistics
    resetData() {
        if (confirm('Are you sure you want to reset all data usage statistics?')) {
            this.totalDownloaded = 0;
            this.sessionDownloaded = 0;
            this.downloadHistory = [];
            this.startTime = Date.now();
            localStorage.removeItem('firebase_data_usage');
            this.updateMonitoringUI();
        }
    }

    // Start periodic save
    startPeriodicSave() {
        setInterval(() => {
            this.saveDataUsage();
        }, 30000); // Save every 30 seconds
    }

    // Get current statistics
    getStats() {
        return {
            totalDownloaded: this.totalDownloaded,
            sessionDownloaded: this.sessionDownloaded,
            downloadCount: this.downloadHistory.length,
            sessionDuration: Date.now() - this.startTime,
            averagePerDownload: this.totalDownloaded / Math.max(1, this.downloadHistory.length)
        };
    }
}

// Initialize the monitor
const firebaseMonitor = new FirebaseDataMonitor();

// Auto-initialize when Firebase is ready
document.addEventListener('DOMContentLoaded', function() {
    // Wait for Firebase to be initialized
    setTimeout(() => {
        if (typeof firebase !== 'undefined' && firebase.database) {
            firebaseMonitor.init();
        }
    }, 1000);
});

// Alternative method: Monitor network requests
class NetworkDataMonitor {
    constructor() {
        this.totalNetworkUsage = 0;
        this.requests = [];
    }

    init() {
        this.interceptXHR();
        this.interceptFetch();
        this.createNetworkUI();
    }

    interceptXHR() {
        const self = this;
        const originalXHR = XMLHttpRequest.prototype.open;
        
        XMLHttpRequest.prototype.open = function(method, url) {
            this.addEventListener('load', function() {
                if (url.includes('firebaseio.com') || url.includes('firebase')) {
                    const size = this.responseText ? this.responseText.length : 0;
                    self.recordNetworkRequest(method, url, size);
                }
            });
            
            return originalXHR.apply(this, arguments);
        };
    }

    interceptFetch() {
        const self = this;
        const originalFetch = window.fetch;
        
        window.fetch = function(url, options) {
            return originalFetch.apply(this, arguments).then(response => {
                if (typeof url === 'string' && (url.includes('firebaseio.com') || url.includes('firebase'))) {
                    const clonedResponse = response.clone();
                    clonedResponse.text().then(text => {
                        self.recordNetworkRequest('GET', url, text.length);
                    });
                }
                return response;
            });
        };
    }

    recordNetworkRequest(method, url, size) {
        this.totalNetworkUsage += size;
        this.requests.push({
            timestamp: Date.now(),
            method: method,
            url: url,
            size: size
        });
        
        // Keep only last 50 requests
        if (this.requests.length > 50) {
            this.requests.shift();
        }
    }

    createNetworkUI() {
        // Add network monitoring to existing UI or create separate
        console.log('Network monitoring initialized');
    }
}

// Usage examples and additional utilities
const DataUsageUtils = {
    // Calculate Firebase pricing estimate (based on current pricing)
    estimateCost(bytes) {
        const gbUsed = bytes / (1024 * 1024 * 1024);
        const costPerGB = 0.10; // USD per GB (approximate)
        return gbUsed * costPerGB;
    },

    // Check if approaching Firebase limits
    checkLimits(bytes) {
        const limits = {
            spark: 1024 * 1024 * 1024, // 1GB for free tier
            blaze: Infinity // No limit for pay-as-you-go
        };
        
        return {
            sparkUsagePercent: (bytes / limits.spark) * 100,
            isApproachingLimit: bytes > limits.spark * 0.8
        };
    },

    // Generate usage report
    generateReport(stats) {
        return {
            summary: {
                totalDownloaded: firebaseMonitor.formatBytes(stats.totalDownloaded),
                sessionDownloaded: firebaseMonitor.formatBytes(stats.sessionDownloaded),
                averagePerDownload: firebaseMonitor.formatBytes(stats.averagePerDownload),
                estimatedCost: this.estimateCost(stats.totalDownloaded).toFixed(4) + ' USD'
            },
            recommendations: this.getOptimizationRecommendations(stats)
        };
    },

    // Get optimization recommendations
    getOptimizationRecommendations(stats) {
        const recommendations = [];
        
        if (stats.averagePerDownload > 100 * 1024) { // > 100KB per download
            recommendations.push('Consider using more specific database queries to reduce data transfer');
        }
        
        if (stats.downloadCount > 100) {
            recommendations.push('High number of downloads detected. Consider implementing caching');
        }
        
        return recommendations;
    }
};

// Console commands for debugging
console.log('Firebase Data Monitor loaded. Use these commands:');
console.log('firebaseMonitor.getStats() - Get current statistics');
console.log('firebaseMonitor.exportData() - Export usage data');
console.log('firebaseMonitor.resetData() - Reset all statistics');
console.log('DataUsageUtils.generateReport(firebaseMonitor.getStats()) - Generate usage report');
