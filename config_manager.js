const fs = require('fs').promises;
const path = require('path');

class ConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, 'app_config.json');
        this.config = {
            discord_token: '',
            webhook_url: '',
            channel_ids: [],
            saved_channels: {},
            max_retries: 3,
            rate_limit_delay: 1000,
            enable_logging: false,
            auto_reconnect: true,
            cloner_options: {
                clone_roles: true,
                clone_channels: true,
                clone_categories: true,
                clone_permissions: true,
                clone_emojis: false,
                clone_bans: false,
                clone_voice_settings: true,
                clone_server_settings: true,
                clone_invites: false,
                preserve_role_hierarchy: true,
                skip_bot_channels: false,
                max_concurrent_operations: 5,
                delay_between_operations: 500
            },
            autopost_options: {
                default_interval: 60,
                enable_random_delay: true,
                max_random_delay: 300,
                enable_mentions: false,
                auto_retry_failed: true,
                max_retry_attempts: 3,
                enable_message_variations: false,
                message_variations: []
            }
        };
        this.loadConfig();
    }

    async loadConfig() {
        try {
            const data = await fs.readFile(this.configPath, 'utf8');
            const loadedConfig = JSON.parse(data);
            
            // Merge with default config to ensure all properties exist
            this.config = { ...this.config, ...loadedConfig };
        } catch (error) {
            console.log('[Config] Creating new config file');
            await this.saveConfig();
        }
    }

    async saveConfig(newConfig = null) {
        try {
            if (newConfig) {
                this.config = { ...this.config, ...newConfig };
            }
            await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 4));
            console.log('[Config] Configuration saved successfully');
        } catch (error) {
            console.error('[Config] Error saving config:', error);
        }
    }

    getConfig() {
        return this.config;
    }

    async updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        await this.saveConfig();
        return this.config;
    }

    async clearConfig() {
        this.config = {
            discord_token: '',
            webhook_url: '',
            channel_ids: [],
            saved_channels: {},
            max_retries: 3,
            rate_limit_delay: 1000,
            enable_logging: false,
            auto_reconnect: true,
            cloner_options: {
                clone_roles: true,
                clone_channels: true,
                clone_categories: true,
                clone_permissions: true,
                clone_emojis: false,
                clone_bans: false,
                clone_voice_settings: true,
                clone_server_settings: true,
                clone_invites: false,
                preserve_role_hierarchy: true,
                skip_bot_channels: false,
                max_concurrent_operations: 5,
                delay_between_operations: 500
            },
            autopost_options: {
                default_interval: 60,
                enable_random_delay: true,
                max_random_delay: 300,
                enable_mentions: false,
                auto_retry_failed: true,
                max_retry_attempts: 3,
                enable_message_variations: false,
                message_variations: []
            }
        };
        await this.saveConfig();
        return this.config;
    }

    // New methods for managing multiple channel IDs
    async addChannelId(channelId, channelName = '') {
        if (!this.config.channel_ids.includes(channelId)) {
            this.config.channel_ids.push(channelId);
            if (channelName) {
                this.config.saved_channels[channelId] = channelName;
            }
            await this.saveConfig();
        }
        return this.config;
    }

    async removeChannelId(channelId) {
        this.config.channel_ids = this.config.channel_ids.filter(id => id !== channelId);
        delete this.config.saved_channels[channelId];
        await this.saveConfig();
        return this.config;
    }

    getSavedChannels() {
        return this.config.saved_channels || {};
    }

    getChannelIds() {
        return this.config.channel_ids || [];
    }

    // Methods for cloner options
    async updateClonerOptions(options) {
        this.config.cloner_options = { ...this.config.cloner_options, ...options };
        await this.saveConfig();
        return this.config.cloner_options;
    }

    getClonerOptions() {
        return this.config.cloner_options || {};
    }

    // Methods for autopost options
    async updateAutopostOptions(options) {
        this.config.autopost_options = { ...this.config.autopost_options, ...options };
        await this.saveConfig();
        return this.config.autopost_options;
    }

    getAutopostOptions() {
        return this.config.autopost_options || {};
    }

    // Message variations management
    async addMessageVariation(message) {
        if (!this.config.autopost_options.message_variations) {
            this.config.autopost_options.message_variations = [];
        }
        if (!this.config.autopost_options.message_variations.includes(message)) {
            this.config.autopost_options.message_variations.push(message);
            await this.saveConfig();
        }
        return this.config.autopost_options.message_variations;
    }

    async removeMessageVariation(message) {
        if (this.config.autopost_options.message_variations) {
            this.config.autopost_options.message_variations = 
                this.config.autopost_options.message_variations.filter(msg => msg !== message);
            await this.saveConfig();
        }
        return this.config.autopost_options.message_variations;
    }

    // Legacy methods for backward compatibility
    getAutopostConfig() {
        return {
            token: this.config.discord_token,
            webhookUrl: this.config.webhook_url,
            useWebhook: !!this.config.webhook_url
        };
    }

    getClonerConfig() {
        return {
            token: this.config.discord_token,
            webhookUrl: this.config.webhook_url,
            useWebhook: !!this.config.webhook_url
        };
    }

    async updateAutopostConfig(updates) {
        const mappedUpdates = {};
        if (updates.token) mappedUpdates.discord_token = updates.token;
        if (updates.webhookUrl) mappedUpdates.webhook_url = updates.webhookUrl;
        return await this.updateConfig(mappedUpdates);
    }

    async updateClonerConfig(updates) {
        const mappedUpdates = {};
        if (updates.token) mappedUpdates.discord_token = updates.token;
        if (updates.webhookUrl) mappedUpdates.webhook_url = updates.webhookUrl;
        return await this.updateConfig(mappedUpdates);
    }
}

module.exports = ConfigManager;
