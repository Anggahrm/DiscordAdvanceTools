const express = require('express');
const axios = require('axios');
const ConfigManager = require('./config_manager');

class AutoPoster {
    constructor(io = null) {
        this.configManager = new ConfigManager();
        this.activeTimers = new Map();
        this.isRunning = false;
        this.io = io;
        this.stats = {
            messagesPosted: 0,
            errorsCount: 0,
            startTime: null,
            lastPost: null
        };
        this.options = {
            deleteAfter: false,
            useEmbed: false,
            mentionEveryone: false,
            randomInterval: false,
            minInterval: 30,
            maxInterval: 120
        };
        this.channels = []; // Array of channel IDs
        this.messages = []; // Array of messages for random selection
        this.interval = 60; // Default interval in minutes
        this.interval = 60; // Default interval in minutes
    }

    get config() {
        return this.configManager.getAutopostConfig();
    }

    async sendLog(message, channelId = null, success = true) {
        const logMessage = `[AutoPost] ${message}`;
        console.log(logMessage);
        
        // Emit log to frontend via Socket.IO
        if (this.io) {
            this.io.emit('autopostLog', {
                message: message,
                channelId: channelId,
                success: success,
                timestamp: new Date()
            });
        }

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
                console.error('[AutoPost] Webhook log error:', error.message);
            }
        }
    }

    async postToChannel(channelId) {
        if (!this.isRunning) return;

        try {
            const config = this.config;
            
            // Get random message from messages array
            let messageContent = '';
            if (this.messages.length > 0) {
                const randomIndex = Math.floor(Math.random() * this.messages.length);
                messageContent = this.messages[randomIndex];
            } else {
                messageContent = 'Auto post message';
            }

            if (this.options.mentionEveryone) {
                messageContent = `@everyone ${messageContent}`;
            }

            const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
            const headers = {
                'Authorization': config.token.trim(),
                'Content-Type': 'application/json'
            };

            let data;
            if (this.options.useEmbed) {
                data = {
                    embeds: [{
                        description: messageContent,
                        color: 0x00ff00,
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: 'Auto Posted by Discord Advanced Tools'
                        }
                    }]
                };
            } else {
                data = {
                    content: messageContent
                };
            }

            const response = await axios.post(url, data, { headers });
            
            if (response.status >= 200 && response.status < 300) {
                this.stats.messagesPosted++;
                this.stats.lastPost = new Date();
                
                await this.sendLog(`Message successfully sent to <#${channelId}>`, channelId, true);
                
                // Delete message after post if option is enabled
                if (this.options.deleteAfter && response.data && response.data.id) {
                    try {
                        const deleteUrl = `https://discord.com/api/v10/channels/${channelId}/messages/${response.data.id}`;
                        await axios.delete(deleteUrl, { headers });
                        await this.sendLog(`Message deleted from <#${channelId}>`, channelId, true);
                    } catch (deleteError) {
                        await this.sendLog(`Failed to delete message from <#${channelId}>: ${deleteError.message}`, channelId, false);
                    }
                }
                
                // Emit success event via Socket.IO
                if (this.io) {
                    const nextPostTime = this.getNextPostTime();
                    this.io.emit('autopostMessage', {
                        channelId: channelId,
                        message: messageContent,
                        timestamp: new Date(),
                        nextPost: Date.now() + nextPostTime,
                        stats: this.getStats()
                    });
                }
            }
        } catch (error) {
            this.stats.errorsCount++;
            const errorMsg = `Failed to send to <#${channelId}>: ${error.response?.status || 'Unknown'} ${error.response?.statusText || error.message}`;
            await this.sendLog(errorMsg, channelId, false);
            
            // Emit error event via Socket.IO
            if (this.io) {
                this.io.emit('autopostError', {
                    channelId: channelId,
                    error: error.message,
                    timestamp: new Date(),
                    stats: this.getStats()
                });
            }
        }
    }

    getNextPostTime() {
        if (this.options.randomInterval) {
            const minMs = this.options.minInterval * 60 * 1000;
            const maxMs = this.options.maxInterval * 60 * 1000;
            return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        } else {
            return (this.interval || 60) * 60 * 1000; // Default interval in milliseconds
        }
    }

    scheduleNextPost() {
        if (!this.isRunning) return;

        const nextPostTime = this.getNextPostTime();
        
        const timerId = setTimeout(() => {
            this.postToRandomChannel();
        }, nextPostTime);
        
        this.activeTimers.set('autopost', timerId);
    }

    postToRandomChannel() {
        if (!this.isRunning || this.channels.length === 0) return;

        // Select random channel
        const randomChannelIndex = Math.floor(Math.random() * this.channels.length);
        const selectedChannel = this.channels[randomChannelIndex];

        this.postToChannel(selectedChannel).then(() => {
            // Schedule next post
            this.scheduleNextPost();
        });
    }

    start() {
        if (this.isRunning) {
            console.log('[AutoPost] Already running');
            return;
        }

        if (this.channels.length === 0 || this.messages.length === 0) {
            console.log('[AutoPost] No channels or messages configured');
            return;
        }

        this.isRunning = true;
        this.stats.startTime = new Date();
        this.stats.messagesPosted = 0;
        this.stats.errorsCount = 0;
        
        console.log('[AutoPost] Starting auto posting...');
        this.sendLog(`Auto posting started for ${this.channels.length} channels with ${this.messages.length} messages`, null, true);

        // Start the posting cycle
        this.postToRandomChannel();

        // Emit started event via Socket.IO
        if (this.io) {
            this.io.emit('autopostStarted', {
                message: 'Auto posting started',
                timestamp: new Date(),
                stats: this.getStats()
            });
        }
    }

    stop() {
        if (!this.isRunning) {
            console.log('[AutoPost] Not running');
            return;
        }

        this.isRunning = false;
        console.log('[AutoPost] Stopping auto posting...');
        this.sendLog('Auto posting stopped', null, true);

        // Clear all active timers
        this.activeTimers.forEach(timerId => {
            clearTimeout(timerId);
        });
        this.activeTimers.clear();
        
        // Emit stopped event via Socket.IO
        if (this.io) {
            this.io.emit('autopostStopped', {
                message: 'Auto posting stopped',
                timestamp: new Date(),
                stats: this.getStats()
            });
        }
    }

    setChannels(channels) {
        this.channels = Array.isArray(channels) ? channels : [channels];
    }

    setMessages(messages) {
        this.messages = Array.isArray(messages) ? messages : [messages];
    }

    setInterval(interval) {
        this.interval = parseInt(interval) || 60;
    }

    async updateConfig(newConfig) {
        // Set channels and messages
        if (newConfig.channels) {
            this.setChannels(newConfig.channels);
        }
        
        if (newConfig.messages) {
            this.setMessages(newConfig.messages);
        }

        if (newConfig.interval) {
            this.setInterval(newConfig.interval);
        }

        // Update options if provided
        if (newConfig.options) {
            this.setOptions(newConfig.options);
        }
    }

    setOptions(options) {
        this.options = {
            deleteAfter: options.deleteAfter || false,
            useEmbed: options.useEmbed || false,
            mentionEveryone: options.mentionEveryone || false,
            randomInterval: options.randomInterval || false,
            minInterval: options.minInterval || 30,
            maxInterval: options.maxInterval || 120
        };
    }

    getStats() {
        return {
            messagesPosted: this.stats.messagesPosted,
            errorsCount: this.stats.errorsCount,
            startTime: this.stats.startTime,
            lastPost: this.stats.lastPost,
            runningTime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0
        };
    }

    getConfig() {
        return this.config;
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            activeChannels: this.channels.length,
            totalMessages: this.messages.length,
            runningTimers: this.activeTimers.size,
            options: this.options,
            stats: this.getStats(),
            channels: this.channels,
            messages: this.messages,
            interval: this.interval
        };
    }
}

module.exports = AutoPoster;
