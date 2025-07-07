const express = require('express');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const PythonClonerWrapper = require('./python_cloner/wrapper');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global variables
const activeCloners = new Map();

// Routes
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Discord Server Cloner',
        error: null,
        success: null
    });
});

app.post('/clone', async (req, res) => {
    const { token, sourceServerId, targetServerId, options } = req.body;
    
    if (!token || !sourceServerId || !targetServerId) {
        return res.render('index', {
            title: 'Discord Server Cloner',
            error: 'All fields are required',
            success: null
        });
    }

    if (sourceServerId === targetServerId) {
        return res.render('index', {
            title: 'Discord Server Cloner',
            error: 'Source and target servers cannot be the same',
            success: null
        });
    }

    const clonerId = Date.now().toString();
    
    try {
        // Detect token type
        const cleanToken = token.trim();
        const isUserToken = !cleanToken.startsWith('Bot ') && 
                           !cleanToken.startsWith('Bearer ') &&
                           cleanToken.split('.').length === 3 &&
                           cleanToken.length > 50;
        
        if (isUserToken) {
            // Use Python cloner for user tokens
            const pythonCloner = new PythonClonerWrapper(io, clonerId);
            activeCloners.set(clonerId, pythonCloner);
            
            io.emit('cloning-log', { 
                clonerId, 
                message: '⚠️ Using USER TOKEN - This violates Discord ToS and may result in account ban!',
                level: 'WARNING'
            });
            
            io.emit('cloning-log', { 
                clonerId, 
                message: '🐍 Using Python backend for user token support...',
                level: 'INFO'
            });
            
            pythonCloner.startCloning(cleanToken, sourceServerId, targetServerId, options)
                .then(success => {
                    activeCloners.delete(clonerId);
                })
                .catch(error => {
                    io.emit('cloning-error', { clonerId, message: error.message });
                    activeCloners.delete(clonerId);
                });
        } else {
            // Use Discord.js for bot tokens
            const cloner = new ServerCloner(token, sourceServerId, targetServerId, options, io, clonerId);
            activeCloners.set(clonerId, cloner);
            
            io.emit('cloning-log', { 
                clonerId, 
                message: '🤖 Using BOT TOKEN - Recommended and ToS compliant',
                level: 'INFO'
            });
            
            io.emit('cloning-log', { 
                clonerId, 
                message: '⚡ Using Node.js/Discord.js backend...',
                level: 'INFO'
            });
            
            cloner.startCloning().then(success => {
                if (success) {
                    io.emit('cloning-complete', { clonerId, success: true });
                } else {
                    io.emit('cloning-complete', { clonerId, success: false });
                }
                activeCloners.delete(clonerId);
            }).catch(error => {
                io.emit('cloning-error', { clonerId, message: error.message });
                activeCloners.delete(clonerId);
            });
        }

        res.json({ success: true, clonerId, tokenType: isUserToken ? 'user' : 'bot' });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.post('/verify-token', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ success: false, error: 'Token is required' });
    }

    try {
        const cleanToken = token.trim();
        const isUserToken = !cleanToken.startsWith('Bot ') && 
                           !cleanToken.startsWith('Bearer ') &&
                           cleanToken.split('.').length === 3 &&
                           cleanToken.length > 50;
        
        if (isUserToken) {
            // Use Python cloner for verification
            const pythonCloner = new PythonClonerWrapper(io, 'verify');
            const result = await pythonCloner.verifyToken(cleanToken);
            
            if (result.success) {
                return res.json({
                    success: true,
                    tokenType: 'user',
                    username: result.username,
                    guilds: result.guilds,
                    warning: 'User token detected - This violates Discord ToS!'
                });
            } else {
                return res.json({ success: false, error: result.error });
            }
        } else {
            // Use Discord.js for bot token verification
            const client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.MessageContent
                ]
            });

            try {
                await client.login(cleanToken);
                const user = client.user;
                const guilds = client.guilds.cache.map(guild => ({
                    id: guild.id,
                    name: guild.name,
                    icon: guild.iconURL()
                }));
                
                await client.destroy();
                
                return res.json({
                    success: true,
                    tokenType: 'bot',
                    username: user.username,
                    guilds: guilds
                });
            } catch (error) {
                await client.destroy().catch(() => {});
                if (error.code === 'TokenInvalid') {
                    return res.json({ success: false, error: 'Invalid bot token' });
                }
                return res.json({ success: false, error: error.message });
            }
        }
    } catch (error) {
        return res.json({ success: false, error: error.message });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
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

class ServerCloner {
    constructor(token, sourceServerId, targetServerId, options, io, clonerId) {
        this.token = token;
        this.sourceServerId = sourceServerId;
        this.targetServerId = targetServerId;
        this.options = options || {};
        this.io = io;
        this.clonerId = clonerId;
        this.client = null;
        this.stopped = false;
        this.stats = {
            rolesCloned: 0,
            categoriesCloned: 0,
            textChannelsCloned: 0,
            voiceChannelsCloned: 0,
            messagesCloned: 0,
            errors: 0,
            startTime: null,
            progress: 0
        };
    }

    async startCloning() {
        try {
            this.stats.startTime = Date.now();
            this.emitProgress('Validating Discord token...', 0);

            // Validate token format
            if (!this.token || this.token.trim() === '') {
                throw new Error('Discord token is required');
            }

            // Remove common prefixes if user accidentally included them
            let cleanToken = this.token.trim();
            if (cleanToken.startsWith('Bot ')) {
                cleanToken = cleanToken.substring(4);
            }
            if (cleanToken.startsWith('Bearer ')) {
                cleanToken = cleanToken.substring(7);
            }

            // Basic token format validation
            if (cleanToken.length < 50) {
                throw new Error('Invalid token format. Discord tokens are typically 59+ characters long.');
            }

            this.token = cleanToken;
            this.emitProgress('Connecting to Discord...', 5);

            // Only bot tokens are supported by Discord.js
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.MessageContent
                ]
            });

            try {
                await this.client.login(this.token);
                this.emitProgress('Connected to Discord successfully', 10);
            } catch (loginError) {
                if (loginError.code === 'TokenInvalid') {
                    throw new Error('Invalid Discord bot token. Please check your token and try again. Only BOT tokens are supported, not user tokens.');
                }
                if (loginError.message.includes('privileged intent')) {
                    throw new Error('Bot is missing required privileged intents. Please enable Message Content Intent in Discord Developer Portal.');
                }
                throw new Error(`Discord login failed: ${loginError.message}`);
            }

            // Get source and target guilds
            let sourceGuild, targetGuild;
            
            try {
                this.emitProgress('Accessing source server...', 15);
                sourceGuild = await this.client.guilds.fetch(this.sourceServerId);
                if (!sourceGuild) {
                    throw new Error(`Could not access source server (ID: ${this.sourceServerId}). Make sure the bot is added to this server with proper permissions.`);
                }
                this.emitLog(`Source server found: ${sourceGuild.name}`);
            } catch (error) {
                if (error.code === 'Unknown Guild') {
                    throw new Error(`Source server not found (ID: ${this.sourceServerId}). Make sure the server ID is correct and the bot is added to this server.`);
                }
                throw new Error(`Failed to access source server: ${error.message}`);
            }

            try {
                this.emitProgress('Accessing target server...', 20);
                targetGuild = await this.client.guilds.fetch(this.targetServerId);
                if (!targetGuild) {
                    throw new Error(`Could not access target server (ID: ${this.targetServerId}). Make sure the bot is added to this server with proper permissions.`);
                }
                this.emitLog(`Target server found: ${targetGuild.name}`);
            } catch (error) {
                if (error.code === 'Unknown Guild') {
                    throw new Error(`Target server not found (ID: ${this.targetServerId}). Make sure the server ID is correct and the bot is added to this server.`);
                }
                throw new Error(`Failed to access target server: ${error.message}`);
            }

            // Check bot permissions
            const sourcePermissions = sourceGuild.members.me?.permissions;
            const targetPermissions = targetGuild.members.me?.permissions;

            if (!sourcePermissions?.has(PermissionsBitField.Flags.Administrator) && 
                (!sourcePermissions?.has(PermissionsBitField.Flags.ManageRoles) || 
                 !sourcePermissions?.has(PermissionsBitField.Flags.ManageChannels))) {
                throw new Error(`Bot lacks sufficient permissions in source server "${sourceGuild.name}". Please ensure the bot has Administrator permission or at least Manage Roles and Manage Channels permissions.`);
            }

            if (!targetPermissions?.has(PermissionsBitField.Flags.Administrator) && 
                (!targetPermissions?.has(PermissionsBitField.Flags.ManageRoles) || 
                 !targetPermissions?.has(PermissionsBitField.Flags.ManageChannels))) {
                throw new Error(`Bot lacks sufficient permissions in target server "${targetGuild.name}". Please ensure the bot has Administrator permission or at least Manage Roles and Manage Channels permissions.`);
            }

            this.emitProgress(`Found servers: ${sourceGuild.name} → ${targetGuild.name}`, 25);

            // Start cloning process
            await this.cloneServer(sourceGuild, targetGuild);

            this.emitProgress('Cloning completed successfully!', 100);
            return true;

        } catch (error) {
            console.error('Cloning error:', error);
            this.emitError(error.message);
            return false;
        } finally {
            if (this.client) {
                this.client.destroy();
            }
        }
    }

    async cloneServer(sourceGuild, targetGuild) {
        const steps = [];
        
        if (this.options.cloneRoles) steps.push('roles');
        if (this.options.cloneCategories) steps.push('categories');
        if (this.options.cloneChannels) steps.push('channels');
        if (this.options.cloneMessages) steps.push('messages');

        const totalSteps = steps.length;
        let currentStep = 0;

        // Update server info
        if (this.options.cloneServerInfo) {
            await this.cloneServerInfo(sourceGuild, targetGuild);
            this.emitProgress('Server info updated', 20);
        }

        // Clone roles
        if (this.options.cloneRoles && !this.stopped) {
            await this.cloneRoles(sourceGuild, targetGuild);
            currentStep++;
            this.emitProgress(`Roles cloned (${currentStep}/${totalSteps})`, 20 + (currentStep * 20));
        }

        // Clone categories
        if (this.options.cloneCategories && !this.stopped) {
            await this.cloneCategories(sourceGuild, targetGuild);
            currentStep++;
            this.emitProgress(`Categories cloned (${currentStep}/${totalSteps})`, 20 + (currentStep * 20));
        }

        // Clone channels
        if (this.options.cloneChannels && !this.stopped) {
            await this.cloneChannels(sourceGuild, targetGuild);
            currentStep++;
            this.emitProgress(`Channels cloned (${currentStep}/${totalSteps})`, 20 + (currentStep * 20));
        }

        // Clone messages
        if (this.options.cloneMessages && !this.stopped) {
            await this.cloneMessages(sourceGuild, targetGuild);
            currentStep++;
            this.emitProgress(`Messages cloned (${currentStep}/${totalSteps})`, 20 + (currentStep * 20));
        }
    }

    async cloneServerInfo(sourceGuild, targetGuild) {
        try {
            const updates = {};
            
            if (sourceGuild.name !== targetGuild.name) {
                updates.name = sourceGuild.name;
            }

            if (sourceGuild.icon && sourceGuild.icon !== targetGuild.icon) {
                updates.icon = sourceGuild.iconURL({ format: 'png', size: 1024 });
            }

            if (Object.keys(updates).length > 0) {
                await targetGuild.edit(updates);
                this.emitLog('Server info updated');
            }
        } catch (error) {
            this.emitError(`Failed to update server info: ${error.message}`);
            this.stats.errors++;
        }
    }

    async cloneRoles(sourceGuild, targetGuild) {
        try {
            const sourceRoles = sourceGuild.roles.cache
                .filter(role => !role.managed && role.name !== '@everyone')
                .sort((a, b) => a.position - b.position);

            // Delete existing roles (except @everyone and managed roles)
            const targetRoles = targetGuild.roles.cache
                .filter(role => !role.managed && role.name !== '@everyone');
            
            for (const role of targetRoles.values()) {
                try {
                    await role.delete();
                    await this.delay(500); // Rate limiting
                } catch (error) {
                    this.emitError(`Failed to delete role: ${error.message}`);
                }
            }

            // Create new roles
            for (const sourceRole of sourceRoles.values()) {
                if (this.stopped) break;
                
                try {
                    await targetGuild.roles.create({
                        name: sourceRole.name,
                        color: sourceRole.color,
                        hoist: sourceRole.hoist,
                        mentionable: sourceRole.mentionable,
                        permissions: sourceRole.permissions,
                        position: sourceRole.position
                    });
                    
                    this.stats.rolesCloned++;
                    this.emitLog(`Role created: ${sourceRole.name}`);
                    await this.delay(1000); // Rate limiting
                } catch (error) {
                    this.emitError(`Failed to create role ${sourceRole.name}: ${error.message}`);
                    this.stats.errors++;
                }
            }
        } catch (error) {
            this.emitError(`Role cloning failed: ${error.message}`);
            this.stats.errors++;
        }
    }

    async cloneCategories(sourceGuild, targetGuild) {
        try {
            const sourceCategories = sourceGuild.channels.cache
                .filter(channel => channel.type === 4) // Category
                .sort((a, b) => a.position - b.position);

            // Delete existing categories
            const targetCategories = targetGuild.channels.cache
                .filter(channel => channel.type === 4);
            
            for (const category of targetCategories.values()) {
                try {
                    await category.delete();
                    await this.delay(500);
                } catch (error) {
                    this.emitError(`Failed to delete category: ${error.message}`);
                }
            }

            // Create new categories
            for (const sourceCategory of sourceCategories.values()) {
                if (this.stopped) break;
                
                try {
                    await targetGuild.channels.create({
                        name: sourceCategory.name,
                        type: 4, // Category
                        position: sourceCategory.position,
                        permissionOverwrites: sourceCategory.permissionOverwrites.cache
                    });
                    
                    this.stats.categoriesCloned++;
                    this.emitLog(`Category created: ${sourceCategory.name}`);
                    await this.delay(1000);
                } catch (error) {
                    this.emitError(`Failed to create category ${sourceCategory.name}: ${error.message}`);
                    this.stats.errors++;
                }
            }
        } catch (error) {
            this.emitError(`Category cloning failed: ${error.message}`);
            this.stats.errors++;
        }
    }

    async cloneChannels(sourceGuild, targetGuild) {
        try {
            // Get all non-category channels
            const sourceChannels = sourceGuild.channels.cache
                .filter(channel => channel.type !== 4)
                .sort((a, b) => a.position - b.position);

            // Delete existing channels
            const targetChannels = targetGuild.channels.cache
                .filter(channel => channel.type !== 4);
            
            for (const channel of targetChannels.values()) {
                try {
                    await channel.delete();
                    await this.delay(500);
                } catch (error) {
                    this.emitError(`Failed to delete channel: ${error.message}`);
                }
            }

            // Create new channels
            for (const sourceChannel of sourceChannels.values()) {
                if (this.stopped) break;
                
                try {
                    const channelData = {
                        name: sourceChannel.name,
                        type: sourceChannel.type,
                        position: sourceChannel.position,
                        permissionOverwrites: sourceChannel.permissionOverwrites.cache
                    };

                    // Find parent category if exists
                    if (sourceChannel.parent) {
                        const targetCategory = targetGuild.channels.cache
                            .find(c => c.type === 4 && c.name === sourceChannel.parent.name);
                        if (targetCategory) {
                            channelData.parent = targetCategory;
                        }
                    }

                    // Add type-specific properties
                    if (sourceChannel.type === 0) { // Text channel
                        channelData.topic = sourceChannel.topic;
                        channelData.nsfw = sourceChannel.nsfw;
                        channelData.rateLimitPerUser = sourceChannel.rateLimitPerUser;
                        this.stats.textChannelsCloned++;
                    } else if (sourceChannel.type === 2) { // Voice channel
                        channelData.bitrate = sourceChannel.bitrate;
                        channelData.userLimit = sourceChannel.userLimit;
                        this.stats.voiceChannelsCloned++;
                    }

                    await targetGuild.channels.create(channelData);
                    this.emitLog(`Channel created: ${sourceChannel.name}`);
                    await this.delay(1000);
                } catch (error) {
                    this.emitError(`Failed to create channel ${sourceChannel.name}: ${error.message}`);
                    this.stats.errors++;
                }
            }
        } catch (error) {
            this.emitError(`Channel cloning failed: ${error.message}`);
            this.stats.errors++;
        }
    }

    async cloneMessages(sourceGuild, targetGuild) {
        try {
            const messageLimit = parseInt(this.options.messageLimit) || 50;
            const sourceTextChannels = sourceGuild.channels.cache
                .filter(channel => channel.type === 0);

            for (const sourceChannel of sourceTextChannels.values()) {
                if (this.stopped) break;

                const targetChannel = targetGuild.channels.cache
                    .find(c => c.name === sourceChannel.name && c.type === 0);

                if (!targetChannel) continue;

                try {
                    const messages = await sourceChannel.messages.fetch({ limit: messageLimit });
                    const messageArray = Array.from(messages.values()).reverse();

                    for (const message of messageArray) {
                        if (this.stopped) break;

                        try {
                            let content = `**${message.author.displayName}** (${message.createdAt.toLocaleString()})\n`;
                            
                            if (message.content) {
                                content += message.content;
                            }

                            if (message.attachments.size > 0) {
                                content += '\n\n**Attachments:**\n';
                                message.attachments.forEach(attachment => {
                                    content += `${attachment.url}\n`;
                                });
                            }

                            if (content.length > 2000) {
                                content = content.substring(0, 1997) + '...';
                            }

                            await targetChannel.send(content);
                            this.stats.messagesCloned++;
                            await this.delay(1000); // Rate limiting for messages
                        } catch (error) {
                            this.emitError(`Failed to clone message: ${error.message}`);
                            this.stats.errors++;
                        }
                    }

                    this.emitLog(`Messages cloned for channel: ${sourceChannel.name}`);
                } catch (error) {
                    this.emitError(`Failed to fetch messages from ${sourceChannel.name}: ${error.message}`);
                    this.stats.errors++;
                }
            }
        } catch (error) {
            this.emitError(`Message cloning failed: ${error.message}`);
            this.stats.errors++;
        }
    }

    emitProgress(message, progress) {
        this.stats.progress = progress;
        this.io.emit('cloning-progress', {
            clonerId: this.clonerId,
            message,
            progress,
            stats: this.stats
        });
    }

    emitLog(message) {
        this.io.emit('cloning-log', {
            clonerId: this.clonerId,
            message,
            timestamp: new Date().toISOString()
        });
    }

    emitError(message) {
        this.stats.errors++;
        this.io.emit('cloning-error', {
            clonerId: this.clonerId,
            message,
            timestamp: new Date().toISOString()
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        this.stopped = true;
        if (this.client) {
            this.client.destroy();
        }
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Discord Server Cloner Web UI running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to access the interface`);
});
