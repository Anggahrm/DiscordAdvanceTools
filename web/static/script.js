// Discord Tools JavaScript Functions - Modern API Integration
class DiscordTools {
    constructor() {
        this.config = {};
        this.isAutoPosting = false;
        this.isCloning = false;
        this.statusUpdateInterval = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadConfig();
        this.updateStatus();
        this.startStatusUpdates();
    }

    setupEventListeners() {
        // Bootstrap tab switching - listen for Bootstrap tab events
        document.querySelectorAll('button[data-bs-toggle="pill"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                const tabId = e.target.getAttribute('data-bs-target').substring(1);
                this.onTabShown(tabId);
            });
        });

        // Auto-save config on input changes (but not switches - they have their own handlers)
        document.querySelectorAll('.auto-save:not(.form-switch)').forEach(input => {
            input.addEventListener('change', () => this.autoSaveConfig());
        });

        // Bootstrap switches (form-check-input)
        document.querySelectorAll('.form-check-input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.autoSaveConfig());
        });

        // Copy to clipboard
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.copyToClipboard(e.target.dataset.copy));
        });

        // Real-time form submissions
        this.setupFormSubmissions();
    }

    setupFormSubmissions() {
        // Channel management forms
        const addChannelForm = document.getElementById('addChannelForm');
        if (addChannelForm) {
            addChannelForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addChannel();
            });
        }

        // Server cloner form
        const clonerForm = document.getElementById('serverClonerForm');
        if (clonerForm) {
            clonerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.startCloning();
            });
        }
    }

    startStatusUpdates() {
        // Update status every 2 seconds
        this.statusUpdateInterval = setInterval(() => {
            this.updateStatus();
        }, 2000);
    }

    async updateStatus() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            // Update statistics display
            updateStatistics(status);
            
            // Update auto-post status
            const autopostStatus = document.getElementById('autopost-status');
            if (autopostStatus) {
                autopostStatus.className = `status-indicator ${status.auto_posting ? 'status-online' : 'status-offline'}`;
                autopostStatus.innerHTML = `<div class="status-dot"></div>${status.auto_posting ? 'Running' : 'Stopped'}`;
            }

            // Update cloning status
            const cloningStatus = document.getElementById('cloning-status');
            if (cloningStatus) {
                const isCloning = status.cloning;
                cloningStatus.className = `status-indicator ${isCloning ? 'status-idle' : 'status-offline'}`;
                cloningStatus.innerHTML = `<div class="status-dot"></div>${isCloning ? 'Cloning...' : 'Ready'}`;
                
                // Update progress if cloning
                if (isCloning && status.cloning_progress) {
                    this.updateCloningProgress(status.cloning_progress);
                }
            }

            // Update configuration status
            const configStatus = document.getElementById('config-status');
            if (configStatus) {
                const isConfigured = status.token_set && status.webhook_set;
                configStatus.className = `status-indicator ${isConfigured ? 'status-online' : 'status-dnd'}`;
                const statusText = document.getElementById('config-status-text');
                if (statusText) {
                    statusText.textContent = isConfigured ? 'Ready' : 'Incomplete';
                }
            }

            // Update toggle button
            const toggleBtn = document.getElementById('toggle-autopost');
            if (toggleBtn) {
                toggleBtn.innerHTML = status.auto_posting ? 
                    '<i class="bi bi-stop-fill me-2"></i>Stop Auto Post' : 
                    '<i class="bi bi-rocket-takeoff me-2"></i>Start Auto Post';
                toggleBtn.className = `btn ${status.auto_posting ? 'btn-danger' : 'btn-success'}`;
            }

            this.isAutoPosting = status.auto_posting;
            this.isCloning = status.cloning;

        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    updateCloningProgress(progress) {
        const progressContainer = document.getElementById('cloning-progress');
        if (progressContainer) {
            progressContainer.innerHTML = `
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress.progress}%"></div>
                </div>
                <p class="progress-text">${progress.current_step} (${progress.progress}%)</p>
            `;
        }
    }

    onTabShown(tabId) {
        // Load tab-specific data when Bootstrap tab is shown
        if (tabId === 'logs') {
            this.loadLogs();
        } else if (tabId === 'auto-poster') {
            this.updateChannelList();
        }

        // Update URL without page reload
        history.pushState(null, null, `#${tabId}`);
    }

    switchTab(tabName) {
        // Use Bootstrap's tab API to switch tabs programmatically
        const targetTab = document.querySelector(`button[data-bs-target="#${tabName}"]`);
        if (targetTab) {
            const bsTab = new bootstrap.Tab(targetTab);
            bsTab.show();
        }
    }

    toggleSwitch(switchEl) {
        // Toggle the visual state
        switchEl.classList.toggle('active');
        const isActive = switchEl.classList.contains('active');
        
        // Find the associated hidden input
        const parentCheck = switchEl.closest('.form-check');
        if (parentCheck) {
            const hiddenInput = parentCheck.querySelector('input[type="hidden"]');
            if (hiddenInput) {
                hiddenInput.value = isActive ? 'true' : 'false';
                
                // Immediately save the configuration
                this.saveToggleConfig(hiddenInput.name, isActive);
            }
        }
    }

    async saveToggleConfig(fieldName, value) {
        try {
            // Build the config update based on field name
            let configUpdate = {};
            
            if (fieldName.startsWith('copy_')) {
                // Handle copy_settings nested structure
                const setting = fieldName.replace('copy_', '');
                configUpdate = {
                    copy_settings: {
                        ...this.config.copy_settings,
                        [setting]: value
                    }
                };
            } else {
                // Handle regular settings
                configUpdate[fieldName] = value;
            }
            
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(configUpdate)
            });

            const result = await response.json();
            if (result.success) {
                // Update local config silently without reload
                if (fieldName.startsWith('copy_')) {
                    const setting = fieldName.replace('copy_', '');
                    if (!this.config.copy_settings) this.config.copy_settings = {};
                    this.config.copy_settings[setting] = value;
                } else {
                    this.config[fieldName] = value;
                }
                
                // Show brief success notification
                this.showNotification(`${fieldName.replace('_', ' ')} updated`, 'success', 2000);
            } else {
                this.showNotification('Failed to save setting', 'error');
                // Revert the toggle if save failed
                this.revertToggle(fieldName);
            }
        } catch (error) {
            console.error('Save toggle error:', error);
            this.showNotification('Error saving setting', 'error');
            // Revert the toggle if save failed
            this.revertToggle(fieldName);
        }
    }

    revertToggle(fieldName) {
        // Find and revert the toggle if save failed
        const input = document.querySelector(`input[name="${fieldName}"]`);
        if (input) {
            const formSwitch = input.closest('.form-check')?.querySelector('.form-switch');
            if (formSwitch) {
                const currentValue = input.value === 'true';
                input.value = (!currentValue).toString();
                
                if (!currentValue) {
                    formSwitch.classList.add('active');
                } else {
                    formSwitch.classList.remove('active');
                }
            }
        }
    }

    async autoSaveConfig() {
        try {
            const formData = this.gatherConfigData();
            const response = await fetch('/save-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();
            if (result.success) {
                this.showNotification('Configuration saved automatically', 'success');
            } else {
                this.showNotification('Failed to save configuration', 'error');
            }
        } catch (error) {
            console.error('Auto-save error:', error);
        }
    }

    gatherConfigData() {
        const data = {};
        
        // Gather all auto-save form inputs
        document.querySelectorAll('.auto-save').forEach(input => {
            const name = input.name || input.id;
            if (name) {
                if (input.type === 'checkbox') {
                    data[name] = input.checked;
                } else {
                    data[name] = input.value;
                }
            }
        });

        // Gather all form check inputs (Bootstrap switches)
        document.querySelectorAll('.form-check-input[type="checkbox"]').forEach(checkbox => {
            const name = checkbox.name || checkbox.id;
            if (name) {
                data[name] = checkbox.checked;
            }
        });

        return data;
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            this.config = await response.json();
            this.updateUI();
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    updateUI() {
        // Update regular form fields from config
        Object.keys(this.config).forEach(key => {
            // Try to find by name first, then by data-config attribute
            let element = document.querySelector(`[name="${key}"]`) || 
                         document.querySelector(`[data-config="${key}"]`) ||
                         document.querySelector(`#${key}`);
            
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = this.config[key];
                } else {
                    element.value = this.config[key] || '';
                }
            }
        });

        // Update channel list
        this.updateChannelList();
        
        // Update settings display
        this.updateSettingsDisplay();
    }

    updateChannelList() {
        const channelList = document.getElementById('channel-list');
        if (!channelList) return;

        const channels = this.config.auto_post_channels || [];
        
        if (channels.length === 0) {
            channelList.innerHTML = '<p class="no-channels">No channels configured. Add a channel to get started.</p>';
            return;
        }

        channelList.innerHTML = channels.map((channel, index) => 
            this.createChannelCard(channel, index)
        ).join('');
    }

    createChannelCard(channel, index) {
        const interval = this.formatInterval(channel.interval);
        return `
            <div class="channel-card" data-index="${index}">
                <div class="channel-header">
                    <h4>📺 Channel ${channel.id}</h4>
                    <div class="channel-actions">
                        <button class="btn btn-sm btn-warning" onclick="discordTools.editChannel(${index})">
                            ✏️ Edit
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="discordTools.removeChannel(${index})">
                            🗑️ Remove
                        </button>
                    </div>
                </div>
                <div class="channel-content">
                    <p><strong>Channel ID:</strong> <code>${channel.id}</code></p>
                    <p><strong>Interval:</strong> <span class="interval-badge">${interval}</span></p>
                    <p><strong>Message:</strong></p>
                    <div class="message-preview">${this.escapeHtml(channel.message)}</div>
                </div>
            </div>
        `;
    }

    formatInterval(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        let result = [];
        if (hours > 0) result.push(`${hours}h`);
        if (minutes > 0) result.push(`${minutes}m`);
        if (secs > 0) result.push(`${secs}s`);

        return result.join(' ') || '0s';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async addChannel() {
        const channelId = document.getElementById('channel-id')?.value.trim();
        const message = document.getElementById('channel-message')?.value.trim();
        const hours = parseInt(document.getElementById('interval-hours')?.value) || 0;
        const minutes = parseInt(document.getElementById('interval-minutes')?.value) || 0;
        const seconds = parseInt(document.getElementById('interval-seconds')?.value) || 0;

        if (!channelId || !message) {
            this.showNotification('Please fill in both Channel ID and Message', 'error');
            return;
        }

        const interval = hours * 3600 + minutes * 60 + seconds;
        if (interval <= 0) {
            this.showNotification('Please set a valid interval', 'error');
            return;
        }

        try {
            const response = await fetch('/api/channels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: channelId,
                    message: message,
                    interval: interval
                })
            });

            const result = await response.json();
            if (result.success) {
                this.showNotification('Channel added successfully', 'success');
                this.clearChannelForm();
                this.loadConfig(); // Refresh data
            } else {
                this.showNotification(result.message || 'Failed to add channel', 'error');
            }
        } catch (error) {
            this.showNotification('Error adding channel', 'error');
            console.error('Add channel error:', error);
        }
    }

    clearChannelForm() {
        const fields = ['channel-id', 'channel-message', 'interval-hours', 'interval-minutes', 'interval-seconds'];
        fields.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.value = '';
        });
    }

    async removeChannel(index) {
        if (!confirm('Are you sure you want to remove this channel?')) return;

        const channels = this.config.auto_post_channels || [];
        const channel = channels[index];
        
        if (!channel) return;

        try {
            const response = await fetch(`/api/channels?id=${channel.id}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            if (result.success) {
                this.showNotification('Channel removed successfully', 'success');
                this.loadConfig(); // Refresh data
            } else {
                this.showNotification(result.message || 'Failed to remove channel', 'error');
            }
        } catch (error) {
            this.showNotification('Error removing channel', 'error');
            console.error('Remove channel error:', error);
        }
    }

    editChannel(index) {
        const channels = this.config.auto_post_channels || [];
        const channel = channels[index];
        
        if (!channel) return;

        // Fill form with channel data
        const channelIdEl = document.getElementById('channel-id');
        const messageEl = document.getElementById('channel-message');
        const hoursEl = document.getElementById('interval-hours');
        const minutesEl = document.getElementById('interval-minutes');
        const secondsEl = document.getElementById('interval-seconds');

        if (channelIdEl) channelIdEl.value = channel.id;
        if (messageEl) messageEl.value = channel.message;
        
        const hours = Math.floor(channel.interval / 3600);
        const minutes = Math.floor((channel.interval % 3600) / 60);
        const seconds = channel.interval % 60;
        
        if (hoursEl) hoursEl.value = hours;
        if (minutesEl) minutesEl.value = minutes;
        if (secondsEl) secondsEl.value = seconds;

        // Change button to update mode
        const addBtn = document.querySelector('#addChannelForm button[type="submit"]');
        if (addBtn) {
            addBtn.textContent = 'Update Channel';
            addBtn.dataset.editing = index;
        }

        // Scroll to form
        const form = document.getElementById('addChannelForm');
        if (form) {
            form.scrollIntoView({ behavior: 'smooth' });
        }
    }

    async toggleAutoPost() {
        try {
            const endpoint = this.isAutoPosting ? '/stop-autopost' : '/start-autopost';
            const response = await fetch(endpoint, { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showNotification(result.message || 'Auto-post toggled', 'success');
                this.updateStatus(); // This will update the UI
            }
        } catch (error) {
            console.error('Error toggling auto-post:', error);
            this.showNotification('Error toggling auto-post', 'error');
        }
    }

    async testWebhook() {
        try {
            const response = await fetch('/test-webhook', { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Webhook test successful!', 'success');
            } else {
                this.showNotification(result.message || 'Webhook test failed', 'error');
            }
        } catch (error) {
            this.showNotification('Error testing webhook', 'error');
            console.error('Webhook test error:', error);
        }
    }

    async startCloning() {
        const guildFrom = document.getElementById('guild-from')?.value.trim();
        const guildTo = document.getElementById('guild-to')?.value.trim();

        if (!guildFrom || !guildTo) {
            this.showNotification('Please enter both source and target server IDs', 'error');
            return;
        }

        // Get values from the form switches with correct names
        const cloneMessagesInput = document.querySelector('input[name="clone_messages"]');
        const clearGuildInput = document.querySelector('input[name="clear_guild"]');

        const cloningData = {
            guild_from: guildFrom,
            guild_to: guildTo,
            use_enhanced: true, // Always use enhanced cloner
            clone_messages: cloneMessagesInput ? cloneMessagesInput.value === 'true' : false,
            clear_guild: clearGuildInput ? clearGuildInput.value === 'true' : true,
            message_limit: parseInt(document.getElementById('message-limit')?.value) || 100
        };

        try {
            const response = await fetch('/clone-server', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(cloningData)
            });

            const result = await response.json();
            if (result.success) {
                this.showNotification('Server cloning started!', 'success');
                this.switchTab('logs'); // Switch to logs tab to see progress
            } else {
                this.showNotification(result.message || 'Failed to start cloning', 'error');
            }
        } catch (error) {
            this.showNotification('Error starting server cloning', 'error');
            console.error('Cloning error:', error);
        }
    }

    async loadLogs() {
        try {
            const response = await fetch('/api/logs');
            const logs = await response.json();
            
            const logContainer = document.getElementById('log-container');
            if (logContainer) {
                logContainer.innerHTML = logs.map(log => 
                    `<div class="log-entry log-${log.type}">
                        <span class="log-time">${new Date(log.timestamp * 1000).toLocaleString()}</span>
                        <span class="log-message">${this.escapeHtml(log.message)}</span>
                    </div>`
                ).join('');
                
                // Auto-scroll to bottom
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    }

    updateSettingsDisplay() {
        // Update switch states based on config
        const settingsTab = document.getElementById('settings');
        if (settingsTab && this.config) {
            // Update copy_settings switches
            if (this.config.copy_settings) {
                Object.keys(this.config.copy_settings).forEach(key => {
                    const switchEl = settingsTab.querySelector(`input[name="copy_${key}"]`);
                    if (switchEl) {
                        const value = this.config.copy_settings[key];
                        switchEl.value = value ? 'true' : 'false';
                        
                        // Update the visual switch
                        const formSwitch = switchEl.closest('.form-check')?.querySelector('.form-switch');
                        if (formSwitch) {
                            if (value) {
                                formSwitch.classList.add('active');
                            } else {
                                formSwitch.classList.remove('active');
                            }
                        }
                    }
                });
            }
            
            // Update other settings (only clear_guild now)
            ['clear_guild'].forEach(key => {
                const switchEl = settingsTab.querySelector(`input[name="${key}"]`);
                if (switchEl && this.config.hasOwnProperty(key)) {
                    const value = this.config[key];
                    switchEl.value = value ? 'true' : 'false';
                    
                    // Update the visual switch
                    const formSwitch = switchEl.closest('.form-check')?.querySelector('.form-switch');
                    if (formSwitch) {
                        if (value) {
                            formSwitch.classList.add('active');
                        } else {
                            formSwitch.classList.remove('active');
                        }
                    }
                }
            });
        }
    }

    updateClonerSwitches() {
        // Update server cloner tab switches based on config
        const clonerTab = document.getElementById('server-cloner');
        if (clonerTab && this.config) {
            // Update clone_messages switch
            const cloneMessagesInput = clonerTab.querySelector('input[name="clone_messages"]');
            if (cloneMessagesInput) {
                const value = this.config.clone_messages || false;
                cloneMessagesInput.value = value ? 'true' : 'false';
                
                const formSwitch = cloneMessagesInput.closest('.form-check')?.querySelector('.form-switch');
                if (formSwitch) {
                    if (value) {
                        formSwitch.classList.add('active');
                    } else {
                        formSwitch.classList.remove('active');
                    }
                }
            }
            
            // Update clear_guild switch
            const clearGuildInput = clonerTab.querySelector('input[name="clear_guild"]');
            if (clearGuildInput) {
                const value = this.config.clear_guild !== false; // Default to true
                clearGuildInput.value = value ? 'true' : 'false';
                
                const formSwitch = clearGuildInput.closest('.form-check')?.querySelector('.form-switch');
                if (formSwitch) {
                    if (value) {
                        formSwitch.classList.add('active');
                    } else {
                        formSwitch.classList.remove('active');
                    }
                }
            }
            
            // Update message limit input
            const messageLimitInput = clonerTab.querySelector('#message-limit');
            if (messageLimitInput) {
                messageLimitInput.value = this.config.message_limit || 100;
            }
        }
    }

    async exportConfig() {
        try {
            const response = await fetch('/api/export-config');
            const config = await response.json();
            
            const dataStr = JSON.stringify(config, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `discord-tools-config-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            this.showNotification('Configuration exported successfully', 'success');
        } catch (error) {
            this.showNotification('Error exporting configuration', 'error');
            console.error('Export error:', error);
        }
    }

    async importConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const config = JSON.parse(text);
                
                const response = await fetch('/api/import-config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(config)
                });
                
                const result = await response.json();
                if (result.success) {
                    this.showNotification('Configuration imported successfully', 'success');
                    this.loadConfig(); // Refresh data
                } else {
                    this.showNotification(result.message || 'Failed to import configuration', 'error');
                }
            } catch (error) {
                this.showNotification('Error importing configuration - invalid file', 'error');
                console.error('Import error:', error);
            }
        };
        
        input.click();
    }

    async resetConfig() {
        if (!confirm('Are you sure you want to reset all configuration to defaults? This cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch('/api/reset-config', { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Configuration reset to defaults', 'success');
                this.loadConfig(); // Refresh data
            } else {
                this.showNotification(result.message || 'Failed to reset configuration', 'error');
            }
        } catch (error) {
            this.showNotification('Error resetting configuration', 'error');
            console.error('Reset error:', error);
        }
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.showNotification('Failed to copy to clipboard', 'error');
        });
    }

    showNotification(message, type = 'info', duration = 5000) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">
                    ${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;

        // Add to page
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1000; max-width: 400px;';
            document.body.appendChild(container);
        }

        container.appendChild(notification);

        // Auto-remove after specified duration
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.opacity = '0';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }

    // Utility methods
    refreshPage() {
        window.location.reload();
    }

    saveConfigManually() {
        const configData = this.gatherConfigData();
        
        // Add additional form data
        const tokenEl = document.querySelector('[name="token"]');
        const webhookEl = document.querySelector('[name="webhook_url"]');
        const useWebhookEl = document.querySelector('[name="use_webhook"]');
        
        if (tokenEl) configData.token = tokenEl.value;
        if (webhookEl) configData.webhook_url = webhookEl.value;
        if (useWebhookEl) configData.use_webhook = useWebhookEl.checked;

        fetch('/save-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(configData)
        }).then(response => response.json())
        .then(result => {
            if (result.success) {
                this.showNotification('Configuration saved successfully', 'success');
                this.loadConfig();
            } else {
                this.showNotification('Failed to save configuration', 'error');
            }
        }).catch(error => {
            console.error('Save error:', error);
            this.showNotification('Error saving configuration', 'error');
        });
    }

    async saveSettingsConfig() {
        try {
            const settingsData = this.gatherSettingsData();
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settingsData)
            });

            const result = await response.json();
            if (result.success) {
                this.showNotification('Settings saved successfully', 'success');
                this.config = { ...this.config, ...settingsData }; // Update local config
            } else {
                this.showNotification('Failed to save settings', 'error');
            }
        } catch (error) {
            console.error('Settings save error:', error);
            this.showNotification('Error saving settings', 'error');
        }
    }

    gatherSettingsData() {
        const data = {};
        
        // Gather settings from switches and inputs in the settings tab
        const settingsTab = document.getElementById('settings');
        if (settingsTab) {
            // Initialize copy_settings structure
            data.copy_settings = {};
            
            // Gather hidden inputs with names
            settingsTab.querySelectorAll('input[type="hidden"][name]').forEach(input => {
                const name = input.name;
                const value = input.value === 'true' || input.value === true;
                
                // Handle copy_settings nested structure
                if (name.startsWith('copy_')) {
                    const setting = name.replace('copy_', '');
                    data.copy_settings[setting] = value;
                } else {
                    data[name] = value;
                }
            });
            
            // Gather regular inputs with names
            settingsTab.querySelectorAll('input[type="text"], input[type="number"], input[type="password"]').forEach(input => {
                if (input.name) {
                    if (input.type === 'number') {
                        data[input.name] = parseInt(input.value) || 0;
                    } else {
                        data[input.name] = input.value;
                    }
                }
            });
        }
        
        return data;
    }

    // Toggle Token Visibility
    toggleTokenVisibility() {
        const tokenInput = document.getElementById('discord-token');
        const toggleIcon = document.getElementById('token-toggle-icon');
        
        if (tokenInput.type === 'password') {
            tokenInput.type = 'text';
            toggleIcon.className = 'bi bi-eye-slash';
        } else {
            tokenInput.type = 'password';
            toggleIcon.className = 'bi bi-eye';
        }
    }

    // Toggle Setting Function
    toggleSetting(settingId) {
        const checkbox = document.getElementById(settingId);
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            // Trigger change event to save config
            checkbox.dispatchEvent(new Event('change'));
            this.updateClonePreview();
        }
    }

    // Update Clone Preview based on settings
    updateClonePreview() {
        const settings = {
            categories: document.getElementById('copyCategories')?.checked || false,
            channels: document.getElementById('copyChannels')?.checked || false,
            roles: document.getElementById('copyRoles')?.checked || false,
            emojis: document.getElementById('copyEmojis')?.checked || false
        };

        // Update clone preview items
        this.updateCloneItem('categories-item', settings.categories);
        this.updateCloneItem('roles-item', settings.roles);
        this.updateCloneItem('emojis-item', settings.emojis);
        
        // Messages item is controlled by clone messages switch
        const cloneMessages = document.getElementById('cloneMessagesSwitch')?.checked || false;
        this.updateCloneItem('messages-item', cloneMessages);
    }

    updateCloneItem(itemId, enabled) {
        const item = document.getElementById(itemId);
        if (item) {
            if (enabled) {
                item.classList.remove('disabled');
                item.classList.add('enabled');
                item.querySelector('.clone-item-status').textContent = 'Enabled';
            } else {
                item.classList.remove('enabled');
                item.classList.add('disabled');
                item.querySelector('.clone-item-status').textContent = 'Disabled';
            }
        }
    }

    // Update Statistics Display
    updateStatistics(stats) {
        // Update token status
        const tokenStat = document.getElementById('token-stat');
        const tokenText = document.getElementById('token-status-text');
        if (stats.token_set) {
            tokenStat?.classList.add('active');
            if (tokenText) tokenText.textContent = '✅';
        } else {
            tokenStat?.classList.remove('active');
            if (tokenText) tokenText.textContent = '❌';
        }

        // Update webhook status
        const webhookStat = document.getElementById('webhook-stat');
        const webhookText = document.getElementById('webhook-status-text');
        if (stats.webhook_set) {
            webhookStat?.classList.add('active');
            if (webhookText) webhookText.textContent = '✅';
        } else {
            webhookStat?.classList.remove('active');
            if (webhookText) webhookText.textContent = '❌';
        }

        // Update active channels
        const channelsText = document.getElementById('active-channels');
        if (channelsText) channelsText.textContent = stats.active_channels || 0;

        // Update system status
        const statusText = document.getElementById('system-status');
        if (statusText) {
            if (stats.auto_posting) {
                statusText.textContent = 'Running';
                statusText.parentElement.classList.add('active');
            } else if (stats.cloning) {
                statusText.textContent = 'Cloning';
                statusText.parentElement.classList.add('active');
            } else {
                statusText.textContent = 'Ready';
                statusText.parentElement.classList.remove('active');
            }
        }
    }

    // Validate Token
    async validateToken() {
        const tokenInput = document.getElementById('discord-token');
        const tokenStatus = document.getElementById('token-status');
        const statusIcon = tokenStatus?.querySelector('.token-status-icon');
        const statusText = tokenStatus?.querySelector('span');
        
        if (!tokenInput.value.trim()) {
            tokenStatus?.classList.remove('valid', 'invalid');
            tokenStatus?.classList.add('unknown');
            if (statusIcon) statusIcon.className = 'bi bi-question-circle token-status-icon';
            if (statusText) statusText.textContent = 'Token validation pending';
            return;
        }

        // Basic token format validation
        if (tokenInput.value.length < 50) {
            tokenStatus?.classList.remove('valid', 'unknown');
            tokenStatus?.classList.add('invalid');
            if (statusIcon) statusIcon.className = 'bi bi-x-circle token-status-icon';
            if (statusText) statusText.textContent = 'Invalid token format';
            return;
        }

        tokenStatus?.classList.remove('invalid', 'unknown');
        tokenStatus?.classList.add('valid');
        if (statusIcon) statusIcon.className = 'bi bi-check-circle token-status-icon';
        if (statusText) statusText.textContent = 'Token format valid';
    }

    // Initialize when page loads
    static init() {
        let discordTools;
        document.addEventListener('DOMContentLoaded', () => {
            discordTools = new DiscordTools();
            
            // Handle initial tab from URL hash
            const hash = window.location.hash.substring(1);
            if (hash && document.getElementById(hash)) {
                discordTools.switchTab(hash);
            }
            
            // Add keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    switch(e.key) {
                        case 's':
                            e.preventDefault();
                            discordTools.saveConfigManually();
                            break;
                        case 'r':
                            e.preventDefault();
                            discordTools.refreshPage();
                            break;
                    }
                }
            });

            // Initialize token validation on input
            const tokenInput = document.getElementById('discord-token');
            if (tokenInput) {
                tokenInput.addEventListener('input', discordTools.validateToken);
                discordTools.validateToken(); // Initial validation
            }

            // Initialize clone preview
            discordTools.updateClonePreview();
            
            // Add change listeners for clone message toggle
            const cloneMessagesSwitch = document.getElementById('cloneMessagesSwitch');
            if (cloneMessagesSwitch) {
                cloneMessagesSwitch.addEventListener('change', discordTools.updateClonePreview);
            }
        });

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            const hash = window.location.hash.substring(1);
            if (hash && discordTools && document.getElementById(hash)) {
                discordTools.switchTab(hash);
            }
        });

        // Global utility functions for inline event handlers
        window.toggleToken = function() {
            const tokenInput = document.getElementById('token');
            if (tokenInput) {
                tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
            }
        };

        // Export for external access
        window.discordTools = discordTools;
    }
}

// Initialize the application
DiscordTools.init();
