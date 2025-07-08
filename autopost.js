const express = require('express');
const axios = require('axios');
const ConfigManager = require('./config_manager');

class AutoPoster {
    constructor(io = null) {
        this.configManager = new ConfigManager();
        this.activeTimers = new Map();
        this.isRunning = false;
        this.io = io;
    }

    get config() {
        return this.configManager.getAutopostConfig();
    }

    async sendLog(message, channelId = null, success = true) {
        const config = this.config;
        if (config.useWebhook && config.webhookUrl) {
            try {
                const now = new Date().toLocaleString('en-US', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });

                const embed = {
                    title: '🎁 Auto Post Discord 🎁',
                    description: '> **Details Info**',
                    color: success ? 65280 : 16711680,
                    fields: [
                        {
                            name: '🟢 Status Log',
                            value: `> ${success ? 'Success' : 'Failed'}`
                        },
                        {
                            name: '🕴 Username',
                            value: '> <@me>'
                        },
                        {
                            name: '🕓 Date Time',
                            value: `> ${now}`
                        },
                        {
                            name: '📺 Channel Target',
                            value: channelId ? `> <#${channelId}>` : '> Unknown'
                        },
                        {
                            name: '✅ Status Message',
                            value: `> ${message}`
                        }
                    ],
                    image: {
                        url: 'https://cdn.discordapp.com/attachments/1222659397477097572/1226427380985126922/image.png'
                    },
                    footer: {
                        text: 'Auto Post By Discord Advanced Tools'
                    }
                };

                await axios.post(config.webhookUrl, {
                    embeds: [embed]
                });
            } catch (error) {
                console.error('[AutoPost] Log error:', error.message);
            }
        }
    }

    async postToChannel(channel) {
        if (!this.isRunning) return;

        try {
            const config = this.config;
            const url = `https://discord.com/api/v10/channels/${channel.id}/messages`;
            const headers = {
                'Authorization': config.token.trim(),
                'Content-Type': 'application/json'
            };
            const data = {
                content: channel.message
            };

            const response = await axios.post(url, data, { headers });
            
            if (response.status >= 200 && response.status < 300) {
                await this.sendLog(`Message successfully sent to <#${channel.id}>`, channel.id, true);
                console.log(`[AutoPost] Message sent to channel ${channel.id}`);
                
                // Emit success event via Socket.IO
                if (this.io) {
                    this.io.emit('autopostMessage', {
                        channelId: channel.id,
                        message: channel.message,
                        timestamp: new Date(),
                        nextPost: Date.now() + (channel.interval * 1000)
                    });
                }
            }
        } catch (error) {
            const errorMsg = `Failed to send to <#${channel.id}>: ${error.response?.status || 'Unknown'} ${error.response?.statusText || error.message}`;
            await this.sendLog(errorMsg, channel.id, false);
            console.error(`[AutoPost] Error posting to ${channel.id}:`, error.message);
            
            // Emit error event via Socket.IO
            if (this.io) {
                this.io.emit('autopostError', {
                    channelId: channel.id,
                    message: channel.message,
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }

        // Schedule next post
        if (this.isRunning && channel.interval > 0) {
            const timerId = setTimeout(() => {
                this.postToChannel(channel);
            }, channel.interval * 1000);
            
            this.activeTimers.set(channel.id, timerId);
        }
    }

    start() {
        if (this.isRunning) {
            console.log('[AutoPost] Already running');
            return;
        }

        this.isRunning = true;
        console.log('[AutoPost] Starting auto posting...');

        // Start posting for each channel
        const config = this.config;
        config.channels.forEach(channel => {
            if (channel.interval > 0) {
                // Post immediately then schedule repeats
                this.postToChannel(channel);
            }
        });
    }

    stop() {
        if (!this.isRunning) {
            console.log('[AutoPost] Not running');
            return;
        }

        this.isRunning = false;
        console.log('[AutoPost] Stopping auto posting...');

        // Clear all active timers
        this.activeTimers.forEach(timerId => {
            clearTimeout(timerId);
        });
        this.activeTimers.clear();
        
        // Emit stopped event via Socket.IO
        if (this.io) {
            this.io.emit('autopostStopped', {
                message: 'Auto posting stopped',
                timestamp: new Date()
            });
        }
    }

    async addChannel(channelId, message, interval) {
        await this.configManager.addChannel(channelId, message, interval);
    }

    async removeChannel(channelId) {
        await this.configManager.removeChannel(channelId);
        
        // Stop timer for this channel
        if (this.activeTimers.has(channelId)) {
            clearTimeout(this.activeTimers.get(channelId));
            this.activeTimers.delete(channelId);
        }
    }

    async updateConfig(newConfig) {
        await this.configManager.updateAutopostConfig(newConfig);
    }

    getConfig() {
        return this.config;
    }

    getStatus() {
        const config = this.config;
        return {
            isRunning: this.isRunning,
            activeChannels: config.channels.length,
            runningTimers: this.activeTimers.size
        };
    }
}

module.exports = AutoPoster;
