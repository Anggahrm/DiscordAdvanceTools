const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const axios = require('axios');
const JSCloner = require('./cloner');
const AutoPoster = require('./autopost');
const ConfigManager = require('./config_manager');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Global instances
const configManager = new ConfigManager();
const autoPoster = new AutoPoster(io);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global variables
const activeCloners = new Map();

// Helper function to send message via webhook
const sendMessage = async (webhookUrl, message, enableMentions = false) => {
    try {
        const payload = {
            content: enableMentions ? `@everyone ${message}` : message
        };
        
        await axios.post(webhookUrl, payload);
        return true;
    } catch (error) {
        throw new Error(`Failed to send message: ${error.message}`);
    }
};

// ==================== UTILITY FUNCTIONS ====================

// Generic error handler for routes
const handleRouteError = (res, error, operation = 'operation') => {
    console.error(`${operation} error:`, error);
    res.status(500).json({ error: error.message });
};

// Generic success response
const sendSuccess = (res, data = {}, message = 'Success') => {
    res.json({ success: true, message, ...data });
};

// Generic error response
const sendError = (res, message, status = 400) => {
    res.status(status).json({ error: message });
};

// Config validation middleware
const validateConfig = (requiredFields = []) => {
    return (req, res, next) => {
        const config = configManager.getConfig();
        
        for (const field of requiredFields) {
            if (!config[field]) {
                return sendError(res, `${field.replace('_', ' ')} not configured. Please configure it in Settings.`);
            }
        }
        
        req.config = config;
        next();
    };
};

// Test Discord API connection
const testDiscordToken = async (token) => {
    try {
        // Try as user token first (no "Bot" prefix)
        const response = await axios.get('https://discord.com/api/v9/users/@me', {
            headers: { 
                'Authorization': token,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6ImVuLVVTIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMC4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTIwLjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjI1MzUxNiwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0='
            }
        });
        return { valid: true, message: `Connected as ${response.data.username} (User Token)` };
    } catch (userError) {
        // If user token fails, try as bot token
        try {
            const response = await axios.get('https://discord.com/api/v10/users/@me', {
                headers: { 'Authorization': `Bot ${token}` }
            });
            return { valid: true, message: `Connected as ${response.data.username} (Bot Token)` };
        } catch (botError) {
            return { valid: false, message: 'Invalid token (tried both user and bot token formats)' };
        }
    }
};

// Test webhook connection
const testWebhook = async (webhookUrl, message = 'Test message from Discord Advanced Tools') => {
    try {
        await axios.post(webhookUrl, { content: message });
        return { valid: true, message: 'Webhook test successful' };
    } catch (error) {
        return { valid: false, message: 'Webhook test failed' };
    }
};

// Helper function to render with layout
const renderWithLayout = (res, viewName, options = {}) => {
    const config = configManager.getConfig();
    
    res.render(viewName, { ...options, config }, (err, contentHtml) => {
        if (err) {
            console.error('Error rendering content:', err);
            return res.status(500).send('Error rendering page');
        }
        
        res.render('layout', {
            title: options.title || 'Discord Advanced Tools',
            headerTitle: 'Discord Advanced Tools',
            headerSubtitle: 'Advanced Discord automation and management tools',
            currentPage: options.currentPage || 'cloner',
            config,
            error: options.error || null,
            success: options.success || null,
            content: contentHtml
        });
    });
};

// ==================== MAIN ROUTES ====================

const pages = [
    { route: '/', view: 'cloner', title: 'Discord Server Cloner - Discord Advanced Tools', page: 'cloner' },
    { route: '/cloner', view: 'cloner', title: 'Discord Server Cloner - Discord Advanced Tools', page: 'cloner' },
    { route: '/autopost', view: 'autopost', title: 'Discord Auto Poster - Discord Advanced Tools', page: 'autopost' },
    { route: '/settings', view: 'settings', title: 'Settings - Discord Advanced Tools', page: 'settings' }
];

pages.forEach(({ route, view, title, page }) => {
    app.get(route, (req, res) => {
        renderWithLayout(res, view, { title, currentPage: page });
    });
});

// ==================== CLONER ROUTES ====================

app.post('/clone', validateConfig(['discord_token']), async (req, res) => {
    try {
        const { sourceGuildId, targetGuildId, options = {} } = req.body;
        
        if (!sourceGuildId || !targetGuildId) {
            return sendError(res, 'Source and target server IDs are required');
        }

        if (sourceGuildId === targetGuildId) {
            return sendError(res, 'Source and target servers cannot be the same');
        }

        const clonerId = Date.now().toString();
        
        // Parse boolean options from the options object
        const booleanFields = [
            'cloneRoles', 'cloneChannels', 'cloneCategories', 'clonePermissions',
            'cloneEmojis', 'cloneBans', 'cloneVoiceSettings', 'cloneServerSettings',
            'cloneServerInfo', 'cloneWebhooks', 'cloneMessages', 'preserveRoleHierarchy', 
            'skipBotChannels', 'deleteExisting'
        ];
        
        const cloneOptions = {};
        booleanFields.forEach(field => {
            cloneOptions[field] = options[field] === true || options[field] === 'true';
        });
        
        // Parse numeric options
        cloneOptions.maxConcurrentOps = parseInt(options.maxConcurrentOps) || 5;
        cloneOptions.delayBetweenOps = parseInt(options.delayBetweenOps || options.delay) || 500;
        cloneOptions.messageLimit = parseInt(options.maxMessages) || 50;
        
        // Ensure at least one option is enabled
        const hasAnyOption = booleanFields.some(field => cloneOptions[field]);
        if (!hasAnyOption) {
            // Set default options if none are enabled
            cloneOptions.cloneRoles = true;
            cloneOptions.cloneChannels = true;
            cloneOptions.cloneCategories = true;
            cloneOptions.cloneServerInfo = true;
        }
        
        console.log('Processed clone options:', cloneOptions);
        
        // Save options and start cloning
        await configManager.updateConfig({ cloner_options: cloneOptions });
        
        const jsCloner = new JSCloner(req.config.discord_token, sourceGuildId, targetGuildId, cloneOptions, io, clonerId);
        activeCloners.set(clonerId, jsCloner);
        
        // Start cloning asynchronously
        jsCloner.startCloning()
            .then(success => {
                io.emit('cloneComplete', { clonerId, success });
                activeCloners.delete(clonerId);
            })
            .catch(error => {
                io.emit('cloneError', { clonerId, error: error.message });
                activeCloners.delete(clonerId);
            });

        sendSuccess(res, { clonerId }, 'Cloning initiated successfully');
    } catch (error) {
        handleRouteError(res, error, 'Clone');
    }
});

app.get('/api/cloning/status', (req, res) => {
    try {
        const activeClonersArray = Array.from(activeCloners.entries()).map(([clonerId, cloner]) => ({
            clonerId,
            stats: cloner.stats,
            stopped: cloner.stopped,
            startTime: cloner.stats.startTime
        }));
        
        res.json({
            activeCloners: activeClonersArray,
            hasActiveCloners: activeClonersArray.length > 0
        });
    } catch (error) {
        handleRouteError(res, error, 'Get cloning status');
    }
});

// ==================== AUTO POSTER ROUTES ====================

app.post('/autopost/start', validateConfig(['discord_token', 'webhook_url']), async (req, res) => {
    try {
        const { channels, messages, interval, options } = req.body;
        
        // Validate input
        if (!channels || !Array.isArray(channels) || channels.length === 0) {
            return sendError(res, 'At least one channel ID is required');
        }
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return sendError(res, 'At least one message is required');
        }

        const intervalMinutes = parseInt(interval) || 60;
        if (intervalMinutes < 1) {
            return sendError(res, 'Interval must be at least 1 minute');
        }

        // Update autoPoster configuration
        const autopostConfig = {
            channels: channels,
            messages: messages,
            interval: intervalMinutes,
            options: options || {}
        };

        await autoPoster.updateConfig(autopostConfig);
        
        // Start the autoPoster
        autoPoster.start();

        sendSuccess(res, { 
            channels: channels,
            messages: messages,
            interval: intervalMinutes,
            options: options || {}
        }, 'Auto posting started');
    } catch (error) {
        handleRouteError(res, error, 'Auto post start');
    }
});

app.post('/autopost/stop', (req, res) => {
    try {
        // Stop the autoPoster
        autoPoster.stop();
        
        io.emit('autopostStopped', { message: 'Auto posting stopped' });
        sendSuccess(res, {}, 'Auto posting stopped successfully');
    } catch (error) {
        handleRouteError(res, error, 'Stop auto post');
    }
});

app.post('/autopost/test', validateConfig(['webhook_url']), async (req, res) => {
    try {
        const { message, enableMentions } = req.body;
        
        if (!message) {
            return sendError(res, 'Message is required');
        }

        await sendMessage(req.config.webhook_url, message, enableMentions === 'true');
        sendSuccess(res, {}, 'Test message sent successfully');
    } catch (error) {
        handleRouteError(res, error, 'Test message');
    }
});

app.get('/autopost/status', (req, res) => {
    const status = autoPoster.getStatus();
    
    res.json({
        isRunning: status.isRunning,
        activeChannels: status.activeChannels,
        totalMessages: status.totalMessages,
        runningTimers: status.runningTimers,
        options: status.options,
        stats: status.stats,
        channels: status.channels || [],
        messages: status.messages || [],
        interval: status.interval || 60,
        nextPost: status.isRunning ? Date.now() + autoPoster.getNextPostTime() : null
    });
});

// ==================== SETTINGS ROUTES ====================

app.get('/api/config', (req, res) => {
    try {
        res.json(configManager.getConfig());
    } catch (error) {
        handleRouteError(res, error, 'Config get');
    }
});

app.post('/settings/save', async (req, res) => {
    try {
        const configData = req.body;
        
        if (!configData.discord_token) {
            return sendError(res, 'Discord token is required');
        }
        
        await configManager.saveConfig(configData);
        sendSuccess(res, { config: configManager.getConfig() }, 'Settings saved successfully');
    } catch (error) {
        handleRouteError(res, error, 'Settings save');
    }
});

app.post('/settings/test', async (req, res) => {
    try {
        const config = configManager.getConfig();
        const results = {};
        
        if (config.discord_token) {
            results.token = await testDiscordToken(config.discord_token);
        }
        
        if (config.webhook_url) {
            results.webhook = await testWebhook(config.webhook_url);
        }
        
        res.json(results);
    } catch (error) {
        handleRouteError(res, error, 'Settings test');
    }
});

// ==================== MISSING ROUTES ====================

// Test token route
app.post('/test-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.json({ valid: false, message: 'No token provided' });
        }
        
        const result = await testDiscordToken(token);
        res.json(result);
    } catch (error) {
        res.json({ valid: false, message: 'Token test failed' });
    }
});

// Test webhook route
app.post('/test-webhook', async (req, res) => {
    try {
        const { webhookUrl } = req.body;
        
        if (!webhookUrl) {
            return res.json({ valid: false, message: 'No webhook URL provided' });
        }
        
        const result = await testWebhook(webhookUrl, 'Test message from Discord Advanced Tools');
        res.json(result);
    } catch (error) {
        res.json({ valid: false, message: 'Webhook test failed' });
    }
});

// Settings routes
app.get('/settings', (req, res) => {
    try {
        res.json(configManager.getConfig());
    } catch (error) {
        handleRouteError(res, error, 'Settings get');
    }
});

app.post('/settings', async (req, res) => {
    try {
        const configData = req.body;
        
        await configManager.saveConfig(configData);
        sendSuccess(res, { config: configManager.getConfig() }, 'Settings saved successfully');
    } catch (error) {
        handleRouteError(res, error, 'Settings save');
    }
});

// System info route
app.get('/system-info', (req, res) => {
    try {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        res.json({
            nodeVersion: process.version,
            uptime: formatUptime(uptime),
            memoryUsage: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
            activeConnections: io.sockets.sockets.size || 0
        });
    } catch (error) {
        handleRouteError(res, error, 'System info');
    }
});

// Helper function for uptime formatting
const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${secs}s`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
};

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

    socket.on('start-js-cloning', async (data) => {
        try {
            const { token, sourceGuildId, targetGuildId, options } = data;
            
            if (!token || !sourceGuildId || !targetGuildId) {
                socket.emit('cloning-error', { message: 'Token, source server ID, and target server ID are required' });
                return;
            }

            if (sourceGuildId === targetGuildId) {
                socket.emit('cloning-error', { message: 'Source and target servers cannot be the same' });
                return;
            }

            const clonerId = Date.now().toString();
            
            // Create cloner instance
            const jsCloner = new JSCloner(token, sourceGuildId, targetGuildId, options, io, clonerId);
            activeCloners.set(clonerId, jsCloner);
            
            // Notify client that cloning started
            socket.emit('js-cloning-started', { clonerId });
            
            // Start cloning asynchronously
            jsCloner.startCloning()
                .then(success => {
                    io.emit('js-cloning-completed', { clonerId, success });
                    activeCloners.delete(clonerId);
                })
                .catch(error => {
                    io.emit('js-cloning-completed', { clonerId, success: false, error: error.message });
                    activeCloners.delete(clonerId);
                });

        } catch (error) {
            socket.emit('cloning-error', { message: error.message });
        }
    });

    socket.on('stop-js-cloning', (data) => {
        const { clonerId } = data;
        if (activeCloners.has(clonerId)) {
            const cloner = activeCloners.get(clonerId);
            cloner.stop();
            activeCloners.delete(clonerId);
            socket.emit('js-cloning-stopped', { clonerId });
        }
    });

    socket.on('stop-cloning', (data) => {
        const { clonerId } = data;
        if (activeCloners.has(clonerId)) {
            const cloner = activeCloners.get(clonerId);
            cloner.stop();
            activeCloners.delete(clonerId);
            socket.emit('cloning-stopped', { clonerId });
        }
    });
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Discord Advanced Tools running on port ${PORT}`);
    console.log(`Server Cloner: http://localhost:${PORT}/`);
    console.log(`Auto Poster: http://localhost:${PORT}/autopost`);
    console.log(`Settings: http://localhost:${PORT}/settings`);
});

module.exports = app;
