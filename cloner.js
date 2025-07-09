const axios = require('axios');

class JSCloner {
    constructor(token, sourceServerId, targetServerId, options, io, clonerId) {
        this.token = token.trim();
        this.sourceServerId = sourceServerId;
        this.targetServerId = targetServerId;
        
        // Set default options
        this.options = {
            cloneRoles: true,
            cloneChannels: true,
            cloneCategories: true,
            clonePermissions: true,
            cloneEmojis: false,
            cloneBans: false,
            cloneVoiceSettings: true,
            cloneServerSettings: true,
            cloneServerInfo: true,
            cloneWebhooks: false,
            cloneMessages: false,
            preserveRoleHierarchy: true,
            skipBotChannels: false,
            maxConcurrentOps: 5,
            delayBetweenOps: 300, // Reduced default delay
            ...options
        };
        
        // Extract delay settings for easy access
        this.baseDelay = this.options.delayBetweenOps || 300;
        this.roleDelay = Math.max(this.baseDelay, 200); // Minimum 200ms for roles
        this.channelDelay = Math.max(this.baseDelay * 0.8, 150); // Slightly faster for channels
        this.categoryDelay = Math.max(this.baseDelay * 0.8, 150); // Slightly faster for categories
        
        // Debug log options
        console.log('Cloner options received:', options);
        console.log('Final cloner options:', this.options);
        
        this.io = io;
        this.clonerId = clonerId;
        this.stopped = false;
        this.isUserToken = !token.startsWith('Bot ');
        this.stats = {
            rolesCloned: 0,
            categoriesCloned: 0,
            textChannelsCloned: 0,
            voiceChannelsCloned: 0,
            messagesCloned: 0,
            emojisCloned: 0,
            webhooksCloned: 0,
            errors: 0,
            startTime: null,
            progress: 0,
            lastMessage: '',
            lastUpdate: null
        };
        
        // Store cloned items for mapping
        this.roleMap = new Map(); // sourceRoleId -> targetRoleId
        this.categoryMap = new Map(); // sourceCategoryId -> targetCategoryId
        this.channelMap = new Map(); // sourceChannelId -> targetChannelId
        
        this.api = axios.create({
            baseURL: 'https://discord.com/api/v10',
            headers: {
                'Authorization': this.token,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            }
        });
    }

    async startCloning() {
        try {
            this.stats.startTime = Date.now();
            this.emitProgress('Validating Discord token...', 0);

            const userInfo = await this.validateToken();
            this.emitProgress(`Connected as: ${userInfo.username}`, 5);

            if (this.isUserToken) {
                this.emitLog('WARNING: Using user token - some features may be limited or unavailable');
                this.emitLog('   • Role management may not work without proper permissions');
                this.emitLog('   • Some server settings might be restricted');
            }

            this.emitProgress('Accessing servers...', 10);
            const [sourceGuild, targetGuild] = await Promise.all([
                this.getGuild(this.sourceServerId),
                this.getGuild(this.targetServerId)
            ]);

            this.emitProgress(`Found servers: ${sourceGuild.name} → ${targetGuild.name}`, 15);
            await this.cloneServer(sourceGuild, targetGuild);
            this.emitProgress('Cloning completed successfully!', 100);
            return true;

        } catch (error) {
            console.error('JS Cloning error:', error);
            this.emitError(error.message);
            return false;
        }
    }

    async validateToken() {
        try {
            const response = await this.api.get('/users/@me');
            return response.data;
        } catch (error) {
            if (error.response?.status === 401) {
                throw new Error('Invalid Discord user token. Please check your token and try again. Make sure you\'re using a valid user token, not a bot token.');
            }
            throw new Error(`Token validation failed: ${error.message}`);
        }
    }

    async getGuild(guildId) {
        try {
            // Validate guild ID format
            if (!guildId || !/^\d{17,19}$/.test(guildId.toString())) {
                throw new Error(`Invalid guild ID format: ${guildId}. Guild IDs should be 17-19 digit numbers.`);
            }
            
            this.emitLog(`Accessing guild: ${guildId}`);
            const response = await this.api.get(`/guilds/${guildId}`);
            this.emitLog(`Successfully accessed guild: ${response.data.name} (${response.data.id})`);
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const errorData = error.response?.data;
            
            if (status === 400) {
                throw new Error(`Bad request for server ${guildId}. Check the server ID format. ${errorData?.message || ''}`);
            } else if (status === 403) {
                throw new Error(`Access denied to server ${guildId}. Make sure you have proper permissions.`);
            } else if (status === 404) {
                throw new Error(`Server ${guildId} not found. Check the server ID.`);
            }
            throw new Error(`Failed to access server ${guildId}: ${errorData?.message || error.message}`);
        }
    }

    async apiRequest(method, endpoint, data = null) {
        try {
            const response = await this.api.request({ method, url: endpoint, data });
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const statusText = error.response?.statusText;
            const errorData = error.response?.data;
            
            let errorMessage = `Failed to ${method.toUpperCase()} ${endpoint}`;
            
            if (status) {
                errorMessage += ` (${status} ${statusText})`;
                
                if (status === 401) {
                    errorMessage += ' - Invalid user token or token expired';
                } else if (status === 403) {
                    errorMessage += ' - Access denied. User may not have permissions or not be in the server';
                } else if (status === 404) {
                    errorMessage += ' - Resource not found';
                } else if (status === 429) {
                    errorMessage += ' - Rate limited';
                }
                
                if (errorData?.message) {
                    errorMessage += `: ${errorData.message}`;
                }
            } else {
                errorMessage += `: ${error.message}`;
            }
            
            throw new Error(errorMessage);
        }
    }

    async cloneServer(sourceGuild, targetGuild) {
        const steps = [];
        
        // Define cloning steps in proper order
        if (this.options.cloneServerInfo) steps.push({ name: 'Server Info', fn: () => this.cloneServerInfo(sourceGuild, targetGuild) });
        if (this.options.cloneRoles) steps.push({ name: 'Roles', fn: () => this.cloneRoles(sourceGuild.id, targetGuild.id) });
        if (this.options.cloneCategories) steps.push({ name: 'Categories', fn: () => this.cloneCategories(sourceGuild.id, targetGuild.id) });
        if (this.options.cloneChannels) steps.push({ name: 'Channels', fn: () => this.cloneChannels(sourceGuild.id, targetGuild.id) });
        if (this.options.cloneEmojis) steps.push({ name: 'Emojis', fn: () => this.cloneEmojis(sourceGuild.id, targetGuild.id) });
        if (this.options.cloneWebhooks) steps.push({ name: 'Webhooks', fn: () => this.cloneWebhooks(sourceGuild.id, targetGuild.id) });
        if (this.options.cloneMessages) steps.push({ name: 'Messages', fn: () => this.cloneMessages(sourceGuild.id, targetGuild.id) });

        for (let i = 0; i < steps.length; i++) {
            if (this.stopped) break;
            
            this.emitLog(`\nStarting ${steps[i].name} cloning...`);
            try {
                await steps[i].fn();
                this.emitLog(`${steps[i].name} cloning completed successfully`);
            } catch (error) {
                this.emitError(`${steps[i].name} cloning failed: ${error.message}`);
            }
            
            this.emitProgress(`${steps[i].name} processed (${i + 1}/${steps.length})`, 15 + ((i + 1) * (85 / steps.length)));
        }
    }

    async cloneServerInfo(sourceGuild, targetGuild) {
        try {
            this.emitLog('Starting server information cloning...');
            this.emitLog('Analyzing server settings and information...');
            const updates = {};
            
            // Clone server name
            if (sourceGuild.name !== targetGuild.name) {
                updates.name = sourceGuild.name;
                this.emitLog(`Setting server name to: ${sourceGuild.name}`);
            } else {
                this.emitLog('Server name is already the same, skipping...');
            }

            // Clone server icon
            if (sourceGuild.icon && sourceGuild.icon !== targetGuild.icon) {
                try {
                    this.emitLog('Downloading server icon...');
                    const iconUrl = `https://cdn.discordapp.com/icons/${sourceGuild.id}/${sourceGuild.icon}.png?size=512`;
                    const iconResponse = await axios.get(iconUrl, { responseType: 'arraybuffer' });
                    updates.icon = `data:image/png;base64,${Buffer.from(iconResponse.data).toString('base64')}`;
                    this.emitLog('Server icon downloaded and encoded successfully');
                } catch (iconError) {
                    this.emitError(`Failed to download server icon: ${iconError.message}`);
                }
            } else {
                this.emitLog('Server icon is already the same or not available, skipping...');
            }

            // Clone server banner
            if (sourceGuild.banner && sourceGuild.banner !== targetGuild.banner) {
                try {
                    this.emitLog('Downloading server banner...');
                    const bannerUrl = `https://cdn.discordapp.com/banners/${sourceGuild.id}/${sourceGuild.banner}.png?size=512`;
                    const bannerResponse = await axios.get(bannerUrl, { responseType: 'arraybuffer' });
                    updates.banner = `data:image/png;base64,${Buffer.from(bannerResponse.data).toString('base64')}`;
                    this.emitLog('Server banner downloaded and encoded successfully');
                } catch (bannerError) {
                    this.emitError(`Failed to download server banner: ${bannerError.message}`);
                }
            } else {
                this.emitLog('Server banner is already the same or not available, skipping...');
            }

            // Clone other server settings
            if (sourceGuild.description !== targetGuild.description) {
                updates.description = sourceGuild.description;
                this.emitLog(`Setting server description`);
            }

            if (sourceGuild.verification_level !== targetGuild.verification_level) {
                updates.verification_level = sourceGuild.verification_level;
                this.emitLog(`Setting verification level to: ${sourceGuild.verification_level}`);
            }

            if (sourceGuild.default_message_notifications !== targetGuild.default_message_notifications) {
                updates.default_message_notifications = sourceGuild.default_message_notifications;
                this.emitLog(`Setting notification level to: ${sourceGuild.default_message_notifications}`);
            }

            if (sourceGuild.explicit_content_filter !== targetGuild.explicit_content_filter) {
                updates.explicit_content_filter = sourceGuild.explicit_content_filter;
                this.emitLog(`Setting content filter to: ${sourceGuild.explicit_content_filter}`);
            }

            if (Object.keys(updates).length > 0) {
                this.emitLog(`Applying ${Object.keys(updates).length} server updates...`);
                await this.api.patch(`/guilds/${targetGuild.id}`, updates);
                this.emitLog('Server information updated successfully');
            } else {
                this.emitLog('No server information changes needed - all settings are already identical');
            }

        } catch (error) {
            if (error.response?.status === 403) {
                this.emitError('Unable to update server info. User may not have "Manage Server" permission.');
                this.emitLog('Skipping server info update due to insufficient permissions...');
                return;
            }
            this.emitError(`Failed to update server info: ${error.response?.data?.message || error.message}`);
            this.stats.errors++;
        }
    }

    async cloneRoles(sourceGuildId, targetGuildId) {
        try {
            this.emitLog('Starting role cloning process...');
            this.emitLog('Step 1: Fetching roles from both servers...');
            let sourceRoles, targetRoles;
            
            try {
                // Use direct API calls instead of apiRequest for better error handling
                const [sourceResponse, targetResponse] = await Promise.all([
                    this.api.get(`/guilds/${sourceGuildId}/roles`),
                    this.api.get(`/guilds/${targetGuildId}/roles`)
                ]);
                sourceRoles = sourceResponse.data;
                targetRoles = targetResponse.data;
                
                this.emitLog(`Step 2: Successfully fetched ${sourceRoles.length} roles from source server and ${targetRoles.length} roles from target server`);
            } catch (error) {
                const status = error.response?.status;
                const errorData = error.response?.data;
                
                if (status === 403) {
                    this.emitError('Unable to access roles. User tokens may not have permission to manage roles in this server.');
                    this.emitLog('Skipping role cloning due to insufficient permissions...');
                    return;
                } else if (status === 400) {
                    this.emitError(`Bad request when fetching roles: ${errorData?.message || error.message}`);
                    throw error;
                } else if (status === 404) {
                    this.emitError('Server not found when fetching roles. Check server IDs.');
                    throw error;
                }
                throw error; // Re-throw other errors
            }

            // Filter out managed roles and @everyone, reverse to maintain hierarchy
            const sourceFiltered = sourceRoles
                .filter(r => !r.managed && r.name !== '@everyone')
                .sort((a, b) => b.position - a.position); // Sort by position descending like the Python version
            
            const targetFiltered = targetRoles.filter(r => !r.managed && r.name !== '@everyone');

            this.emitLog(`Step 3: Filtered ${sourceFiltered.length} cloneable roles from source (skipped ${sourceRoles.length - sourceFiltered.length} managed/system roles)`);
            this.emitLog(`Step 4: Found ${targetFiltered.length} existing roles to delete in target server`);

            // Delete existing roles one by one with proper rate limiting
            if (targetFiltered.length > 0) {
                this.emitLog(`Step 5: Starting deletion of ${targetFiltered.length} existing roles...`);
                let deletedCount = 0;
                
                for (const role of targetFiltered) {
                    if (this.stopped) break;
                    
                    try {
                        this.emitLog(`Deleting role: ${role.name} (${deletedCount + 1}/${targetFiltered.length})`);
                        await this.api.delete(`/guilds/${targetGuildId}/roles/${role.id}`);
                        deletedCount++;
                        this.emitLog(`Successfully deleted role: ${role.name} (${deletedCount}/${targetFiltered.length})`);
                        
                        // Wait longer between deletions to avoid rate limits
                        await this.delay(800);
                    } catch (error) {
                        if (error.response?.status === 429) {
                            const retryAfter = (error.response.headers['retry-after'] || 5) * 1000;
                            this.emitLog(`Rate limited during role deletion, waiting ${retryAfter/1000}s...`);
                            await this.delay(retryAfter);
                            
                            // Retry the deletion
                            try {
                                this.emitLog(`Retrying deletion of role: ${role.name}`);
                                await this.api.delete(`/guilds/${targetGuildId}/roles/${role.id}`);
                                deletedCount++;
                                this.emitLog(`Successfully deleted role (retry): ${role.name} (${deletedCount}/${targetFiltered.length})`);
                                await this.delay(1000); // Wait even longer after retry
                            } catch (retryError) {
                                this.emitError(`Failed to delete role after retry: ${role.name}`);
                            }
                        } else if (error.response?.status === 403) {
                            this.emitLog(`Skipping role deletion (no permission): ${role.name}`);
                        } else {
                            this.emitError(`Failed to delete role ${role.name}: ${error.message}`);
                        }
                    }
                }
                this.emitLog(`Step 6: Completed role deletion: ${deletedCount}/${targetFiltered.length} roles deleted`);
            } else {
                this.emitLog('Step 5: No existing roles to delete in target server');
            }

            // Create new roles with optimized delay
            this.emitLog(`Step 7: Starting creation of ${sourceFiltered.length} new roles...`);
            for (let i = 0; i < sourceFiltered.length; i++) {
                if (this.stopped) break;
                
                const role = sourceFiltered[i];
                try {
                    const roleData = {
                        name: role.name,
                        permissions: role.permissions.toString(),
                        color: role.color,
                        hoist: role.hoist,
                        mentionable: role.mentionable
                    };
                    
                    this.emitLog(`Creating role: "${role.name}" (${i + 1}/${sourceFiltered.length}) - Position: ${role.position}`);
                    const newRole = await this.api.post(`/guilds/${targetGuildId}/roles`, roleData);
                    this.emitLog(`Successfully created role: "${role.name}" (${i + 1}/${sourceFiltered.length})`);
                    this.stats.rolesCloned++;
                    
                    // Store mapping for later use
                    this.roleMap.set(role.id, newRole.data.id);
                    
                    // Adaptive delay based on server response and remaining roles
                    const adaptiveDelay = sourceFiltered.length > 10 ? this.roleDelay * 1.5 : this.roleDelay * 2;
                    await this.delay(adaptiveDelay);
                } catch (error) {
                    if (error.response?.status === 403) {
                        this.emitError(`Cannot create role ${role.name} - insufficient permissions or role hierarchy issue`);
                    } else if (error.response?.status === 429) {
                        // Rate limit hit, wait longer
                        const retryAfter = error.response.headers['retry-after'] || 5;
                        this.emitLog(`Rate limited during role creation, waiting ${retryAfter} seconds...`);
                        await this.delay(retryAfter * 1000);
                        i--; // Retry this role
                    } else {
                        this.emitError(`Failed to create role ${role.name}: ${error.message}`);
                        this.stats.errors++;
                    }
                }
            }

            this.emitLog(`Step 8: Role cloning completed successfully! Created ${this.stats.rolesCloned}/${sourceFiltered.length} roles`);

        } catch (error) {
            this.emitError(`Role cloning failed: ${error.message}`);
            this.stats.errors++;
        }
    }

    async cloneCategories(sourceGuildId, targetGuildId) {
        try {
            this.emitLog('Starting category cloning process...');
            this.emitLog('Fetching channel data from both servers...');
            const [sourceChannelsResponse, targetChannelsResponse] = await Promise.all([
                this.api.get(`/guilds/${sourceGuildId}/channels`),
                this.api.get(`/guilds/${targetGuildId}/channels`)
            ]);

            const sourceChannels = sourceChannelsResponse.data;
            const targetChannels = targetChannelsResponse.data;

            const sourceCategories = sourceChannels
                .filter(c => c.type === 4)
                .sort((a, b) => a.position - b.position);
            const targetCategories = targetChannels.filter(c => c.type === 4);

            this.emitLog(`Fetched ${sourceChannels.length} channels from source server and ${targetChannels.length} channels from target server`);
            this.emitLog(`Found ${sourceCategories.length} categories to clone, ${targetCategories.length} categories to delete`);
            this.emitLog(`Found ${targetCategories.length} existing categories to delete in target server`);

            // Delete existing categories one by one with proper rate limiting
            if (targetCategories.length > 0) {
                this.emitLog(`Starting deletion of ${targetCategories.length} existing categories...`);
                let deletedCount = 0;
                
                for (const cat of targetCategories) {
                    if (this.stopped) break;
                    
                    try {
                        await this.api.delete(`/channels/${cat.id}`);
                        deletedCount++;
                        this.emitLog(`Deleted category: "${cat.name}" (${deletedCount}/${targetCategories.length})`);
                        await this.delay(600); // Wait between deletions
                    } catch (error) {
                        if (error.response?.status === 429) {
                            const retryAfter = (error.response.headers['retry-after'] || 3) * 1000;
                            this.emitLog(`Rate limited during category deletion, waiting ${retryAfter/1000}s...`);
                            await this.delay(retryAfter);
                            
                            // Retry the deletion
                            try {
                                await this.api.delete(`/channels/${cat.id}`);
                                deletedCount++;
                                this.emitLog(`Deleted category (retry): "${cat.name}" (${deletedCount}/${targetCategories.length})`);
                                await this.delay(800);
                            } catch (retryError) {
                                this.emitError(`Failed to delete category after retry: ${cat.name}`);
                            }
                        } else {
                            this.emitError(`Failed to delete category ${cat.name}: ${error.message}`);
                        }
                    }
                }
                this.emitLog(`Completed category deletion: ${deletedCount}/${targetCategories.length} categories deleted`);
            }

            // Create new categories with optimized delay
            this.emitLog(`Starting creation of ${sourceCategories.length} new categories...`);
            for (let i = 0; i < sourceCategories.length; i++) {
                const cat = sourceCategories[i];
                if (this.stopped) break;
                try {
                    // Map permission overwrites to target guild roles
                    const mappedOverwrites = [];
                    if (cat.permission_overwrites) {
                        for (const overwrite of cat.permission_overwrites) {
                            if (overwrite.type === 0) { // Role overwrite
                                const targetRoleId = this.roleMap.get(overwrite.id);
                                if (targetRoleId) {
                                    mappedOverwrites.push({
                                        ...overwrite,
                                        id: targetRoleId
                                    });
                                }
                            } else if (overwrite.type === 1) { // User overwrite
                                mappedOverwrites.push(overwrite); // Keep user overwrites as-is
                            }
                        }
                    }

                    const catData = {
                        name: cat.name,
                        type: 4,
                        position: cat.position,
                        permission_overwrites: mappedOverwrites
                    };
                    
                    const newCategory = await this.api.post(`/guilds/${targetGuildId}/channels`, catData);
                    this.emitLog(`Created category: ${cat.name} (${i + 1}/${sourceCategories.length})`);
                    this.stats.categoriesCloned++;
                    
                    // Store mapping for channels
                    this.categoryMap.set(cat.id, newCategory.data.id);
                    
                    await this.delay(this.categoryDelay * 1.5); // Use longer delay
                } catch (error) {
                    if (error.response?.status === 429) {
                        const retryAfter = error.response.headers['retry-after'] || 3;
                        this.emitLog(`Rate limited, waiting ${retryAfter} seconds...`);
                        await this.delay(retryAfter * 1000);
                        i--; // Retry this category
                    } else {
                        this.emitError(`Failed to create category ${cat.name}: ${error.message}`);
                        this.stats.errors++;
                    }
                }
            }

            this.emitLog(`Category cloning completed. Created ${this.stats.categoriesCloned} categories`);

        } catch (error) {
            const status = error.response?.status;
            if (status === 403) {
                this.emitError('Unable to manage channels. User may not have permission to create/delete channels.');
                this.emitLog('Skipping category cloning due to insufficient permissions...');
                return;
            } else if (status === 400) {
                this.emitError(`Bad request when managing categories: ${error.response?.data?.message || error.message}`);
            }
            throw error;
        }
    }

    async cloneChannels(sourceGuildId, targetGuildId) {
        try {
            this.emitLog('Starting channel cloning process...');
            this.emitLog('Fetching channel data from both servers...');
            const [sourceChannelsResponse, targetChannelsResponse] = await Promise.all([
                this.api.get(`/guilds/${sourceGuildId}/channels`),
                this.api.get(`/guilds/${targetGuildId}/channels`)
            ]);

            const sourceChannels = sourceChannelsResponse.data;
            const targetChannels = targetChannelsResponse.data;

            const sourceNonCats = sourceChannels
                .filter(c => c.type !== 4)
                .sort((a, b) => a.position - b.position);
            const targetNonCats = targetChannels.filter(c => c.type !== 4);

            this.emitLog(`Found ${sourceNonCats.length} channels to clone, ${targetNonCats.length} channels to delete`);

            // Delete existing channels one by one with proper rate limiting
            if (targetNonCats.length > 0) {
                this.emitLog('Deleting existing channels...');
                for (const ch of targetNonCats) {
                    if (this.stopped) break;
                    
                    try {
                        await this.api.delete(`/channels/${ch.id}`);
                        this.emitLog(`Deleted channel: ${ch.name}`);
                        await this.delay(400); // Wait between deletions
                    } catch (error) {
                        if (error.response?.status === 429) {
                            const retryAfter = (error.response.headers['retry-after'] || 3) * 1000;
                            this.emitLog(`Rate limited during channel deletion, waiting ${retryAfter/1000}s...`);
                            await this.delay(retryAfter);
                            
                            // Retry the deletion
                            try {
                                await this.api.delete(`/channels/${ch.id}`);
                                this.emitLog(`Deleted channel (retry): ${ch.name}`);
                                await this.delay(600);
                            } catch (retryError) {
                                this.emitError(`Failed to delete channel after retry: ${ch.name}`);
                            }
                        } else {
                            this.emitError(`Failed to delete channel ${ch.name}: ${error.message}`);
                        }
                    }
                }
            }

            // Create new channels with optimized delay
            this.emitLog('Creating new channels...');
            for (let i = 0; i < sourceNonCats.length; i++) {
                const ch = sourceNonCats[i];
                if (this.stopped) break;
                try {
                    // Map permission overwrites
                    const mappedOverwrites = [];
                    if (ch.permission_overwrites) {
                        for (const overwrite of ch.permission_overwrites) {
                            if (overwrite.type === 0) { // Role overwrite
                                const targetRoleId = this.roleMap.get(overwrite.id);
                                if (targetRoleId) {
                                    mappedOverwrites.push({
                                        ...overwrite,
                                        id: targetRoleId
                                    });
                                }
                            } else if (overwrite.type === 1) { // User overwrite
                                mappedOverwrites.push(overwrite);
                            }
                        }
                    }

                    const channelData = {
                        name: ch.name,
                        type: ch.type,
                        position: ch.position,
                        permission_overwrites: mappedOverwrites
                    };

                    // Map parent category
                    if (ch.parent_id) {
                        const targetCategoryId = this.categoryMap.get(ch.parent_id);
                        if (targetCategoryId) {
                            channelData.parent_id = targetCategoryId;
                        }
                    }

                    // Type-specific properties
                    if (ch.type === 0) { // Text channel
                        Object.assign(channelData, {
                            topic: ch.topic,
                            nsfw: ch.nsfw,
                            rate_limit_per_user: ch.rate_limit_per_user
                        });
                    } else if (ch.type === 2) { // Voice channel
                        Object.assign(channelData, {
                            bitrate: ch.bitrate,
                            user_limit: ch.user_limit
                        });
                    }

                    const newChannel = await this.api.post(`/guilds/${targetGuildId}/channels`, channelData);
                    this.emitLog(`Created ${ch.type === 0 ? 'text' : 'voice'} channel: ${ch.name} (${i + 1}/${sourceNonCats.length})`);
                    
                    // Store mapping
                    this.channelMap.set(ch.id, newChannel.data.id);
                    
                    if (ch.type === 0) this.stats.textChannelsCloned++;
                    else if (ch.type === 2) this.stats.voiceChannelsCloned++;
                    
                    await this.delay(this.channelDelay * 1.5); // Use longer delay
                } catch (error) {
                    if (error.response?.status === 429) {
                        const retryAfter = error.response.headers['retry-after'] || 3;
                        this.emitLog(`Rate limited, waiting ${retryAfter} seconds...`);
                        await this.delay(retryAfter * 1000);
                        i--; // Retry this channel
                    } else {
                        this.emitError(`Failed to create channel ${ch.name}: ${error.message}`);
                        this.stats.errors++;
                    }
                }
            }

            this.emitLog(`Channel cloning completed. Created ${this.stats.textChannelsCloned + this.stats.voiceChannelsCloned} channels`);

        } catch (error) {
            const status = error.response?.status;
            if (status === 403) {
                this.emitError('Unable to manage channels. User may not have permission to create/delete channels.');
                this.emitLog('Skipping channel cloning due to insufficient permissions...');
                return;
            } else if (status === 400) {
                this.emitError(`Bad request when managing channels: ${error.response?.data?.message || error.message}`);
            }
            throw error;
        }
    }

    async cloneMessages(sourceGuildId, targetGuildId) {
        const messageLimit = parseInt(this.options.messageLimit) || 50;
        this.emitLog(`Preparing to clone up to ${messageLimit} messages per channel...`);
        
        this.emitLog('Fetching channels from both servers...');
        const [sourceChannelsResponse, targetChannelsResponse] = await Promise.all([
            this.api.get(`/guilds/${sourceGuildId}/channels`),
            this.api.get(`/guilds/${targetGuildId}/channels`)
        ]);

        const sourceChannels = sourceChannelsResponse.data;
        const targetChannels = targetChannelsResponse.data;

        const sourceTextChannels = sourceChannels.filter(c => c.type === 0);
        this.emitLog(`Found ${sourceTextChannels.length} text channels in source server to clone messages from`);

        let totalCloned = 0;
        let totalChannelsProcessed = 0;
        
        for (let i = 0; i < sourceTextChannels.length; i++) {
            if (this.stopped) break;
            
            const sourceChannel = sourceTextChannels[i];
            const targetChannel = targetChannels.find(c => c.name === sourceChannel.name && c.type === 0);
            
            if (!targetChannel) {
                this.emitLog(`WARNING: Target channel not found for: "${sourceChannel.name}", skipping...`);
                continue;
            }

            try {
                this.emitLog(`Fetching messages from channel: "${sourceChannel.name}" (${i + 1}/${sourceTextChannels.length})`);
                const response = await this.api.get(`/channels/${sourceChannel.id}/messages?limit=${messageLimit}`);
                const messages = response.data.reverse();

                this.emitLog(`Found ${messages.length} messages in "${sourceChannel.name}", starting clone process...`);
                let clonedInChannel = 0;

                for (const msg of messages) {
                    if (this.stopped) break;
                    
                    try {
                        let content = `**${msg.author.username}** (${new Date(msg.timestamp).toLocaleString()})\n`;
                        if (msg.content) content += msg.content;
                        if (msg.attachments?.length > 0) {
                            content += '\n\n**Attachments:**\n';
                            msg.attachments.forEach(att => content += `${att.url}\n`);
                        }

                        if (content.length > 2000) content = content.substring(0, 1997) + '...';

                        await this.api.post(`/channels/${targetChannel.id}/messages`, { content });
                        this.stats.messagesCloned++;
                        clonedInChannel++;
                        totalCloned++;
                        
                        if (clonedInChannel % 10 === 0 || clonedInChannel === messages.length) {
                            this.emitLog(`Progress: ${clonedInChannel}/${messages.length} messages cloned in "${sourceChannel.name}"`);
                            this.emitStats();
                        }
                        
                        await this.delay(1500);
                    } catch (error) {
                        if (error.response?.status === 429) {
                            const retryAfter = (error.response.headers['retry-after'] || 5) * 1000;
                            this.emitLog(`Rate limited during message cloning, waiting ${retryAfter/1000}s...`);
                            await this.delay(retryAfter);
                        } else {
                            this.emitError(`Failed to clone message: ${error.message}`);
                            this.stats.errors++;
                        }
                    }
                }

                totalChannelsProcessed++;
                this.emitLog(`Completed "${sourceChannel.name}": ${clonedInChannel}/${messages.length} messages cloned - Progress: ${totalChannelsProcessed}/${sourceTextChannels.length} channels done`);
                this.emitStats();
            } catch (error) {
                this.emitError(`Failed to fetch messages from "${sourceChannel.name}": ${error.message}`);
                this.stats.errors++;
            }
        }
        
        this.emitLog(`Message cloning completed. Cloned ${totalCloned} total messages from ${totalChannelsProcessed} channels`);
    }

    async cloneEmojis(sourceGuildId, targetGuildId) {
        try {
            this.emitLog('Starting emoji cloning...');
            const [sourceEmojisResponse, targetEmojisResponse] = await Promise.all([
                this.api.get(`/guilds/${sourceGuildId}/emojis`),
                this.api.get(`/guilds/${targetGuildId}/emojis`)
            ]);

            const sourceEmojis = sourceEmojisResponse.data;
            const targetEmojis = targetEmojisResponse.data;

            this.emitLog(`Found ${sourceEmojis.length} emojis to clone, ${targetEmojis.length} emojis to delete`);

            // Delete existing emojis first
            for (const emoji of targetEmojis) {
                if (this.stopped) break;
                try {
                    await this.api.delete(`/guilds/${targetGuildId}/emojis/${emoji.id}`);
                    this.emitLog(`Deleted emoji: ${emoji.name}`);
                    await this.delay(300);
                } catch (error) {
                    this.emitError(`Failed to delete emoji ${emoji.name}: ${error.message}`);
                }
            }

            // Create new emojis
            for (const emoji of sourceEmojis) {
                if (this.stopped) break;
                try {
                    // Download emoji image
                    const emojiUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;
                    this.emitLog(`Downloading emoji: ${emoji.name}`);
                    
                    const imageResponse = await axios.get(emojiUrl, { responseType: 'arraybuffer' });
                    const imageBase64 = `data:image/${emoji.animated ? 'gif' : 'png'};base64,${Buffer.from(imageResponse.data).toString('base64')}`;

                    const emojiData = {
                        name: emoji.name,
                        image: imageBase64,
                        roles: emoji.roles || []
                    };

                    await this.api.post(`/guilds/${targetGuildId}/emojis`, emojiData);
                    this.emitLog(`Created emoji: ${emoji.name}`);
                    this.stats.emojisCloned++;
                    
                    await this.delay(1000); // Longer delay for emoji creation
                } catch (error) {
                    if (error.response?.status === 403) {
                        this.emitError(`Cannot create emoji ${emoji.name} - insufficient permissions or emoji limit reached`);
                    } else if (error.response?.status === 400) {
                        this.emitError(`Cannot create emoji ${emoji.name} - invalid emoji data or name conflict`);
                    } else {
                        this.emitError(`Failed to create emoji ${emoji.name}: ${error.message}`);
                    }
                    this.stats.errors++;
                }
            }

            this.emitLog(`Emoji cloning completed. Created ${this.stats.emojisCloned} emojis`);

        } catch (error) {
            const status = error.response?.status;
            if (status === 403) {
                this.emitError('Unable to manage emojis. User may not have permission to manage emojis in this server.');
                this.emitLog('Skipping emoji cloning due to insufficient permissions...');
                return;
            } else if (status === 400) {
                this.emitError(`Bad request when managing emojis: ${error.response?.data?.message || error.message}`);
            }
            throw error;
        }
    }

    async cloneWebhooks(sourceGuildId, targetGuildId) {
        try {
            this.emitLog('Starting webhook cloning...');
            
            // Get all channels from both guilds to iterate through
            const [sourceChannelsResponse, targetChannelsResponse] = await Promise.all([
                this.api.get(`/guilds/${sourceGuildId}/channels`),
                this.api.get(`/guilds/${targetGuildId}/channels`)
            ]);

            const sourceChannels = sourceChannelsResponse.data.filter(c => c.type === 0); // Text channels only
            const targetChannels = targetChannelsResponse.data.filter(c => c.type === 0);

            let totalWebhooks = 0;
            let clonedWebhooks = 0;

            // Get webhooks from all source channels
            for (const sourceChannel of sourceChannels) {
                if (this.stopped) break;
                
                try {
                    const webhooksResponse = await this.api.get(`/channels/${sourceChannel.id}/webhooks`);
                    const webhooks = webhooksResponse.data;
                    
                    if (webhooks.length > 0) {
                        totalWebhooks += webhooks.length;
                        this.emitLog(`Found ${webhooks.length} webhooks in channel: ${sourceChannel.name}`);
                        
                        // Find corresponding target channel
                        const targetChannel = targetChannels.find(c => c.name === sourceChannel.name);
                        if (!targetChannel) {
                            this.emitLog(`WARNING: Target channel not found for: ${sourceChannel.name}, skipping webhooks...`);
                            continue;
                        }

                        // Clone each webhook
                        for (const webhook of webhooks) {
                            if (this.stopped) break;
                            
                            try {
                                let avatarData = null;
                                
                                // Download webhook avatar if exists
                                if (webhook.avatar) {
                                    try {
                                        const avatarUrl = `https://cdn.discordapp.com/avatars/${webhook.id}/${webhook.avatar}.png`;
                                        const avatarResponse = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
                                        avatarData = `data:image/png;base64,${Buffer.from(avatarResponse.data).toString('base64')}`;
                                    } catch (avatarError) {
                                        this.emitLog(`WARNING: Failed to download avatar for webhook ${webhook.name}: ${avatarError.message}`);
                                    }
                                }

                                const webhookData = {
                                    name: webhook.name || 'Cloned Webhook',
                                    avatar: avatarData
                                };

                                await this.api.post(`/channels/${targetChannel.id}/webhooks`, webhookData);
                                this.emitLog(`Created webhook: ${webhook.name} in ${targetChannel.name}`);
                                this.stats.webhooksCloned++;
                                clonedWebhooks++;
                                
                                await this.delay(1000);
                            } catch (error) {
                                if (error.response?.status === 403) {
                                    this.emitError(`Cannot create webhook ${webhook.name} - insufficient permissions`);
                                } else if (error.response?.status === 400) {
                                    this.emitError(`Cannot create webhook ${webhook.name} - invalid webhook data`);
                                } else {
                                    this.emitError(`Failed to create webhook ${webhook.name}: ${error.message}`);
                                }
                                this.stats.errors++;
                            }
                        }
                    }
                } catch (error) {
                    if (error.response?.status === 403) {
                        this.emitLog(`WARNING: Cannot access webhooks in channel ${sourceChannel.name} - insufficient permissions`);
                    } else {
                        this.emitError(`Failed to get webhooks from ${sourceChannel.name}: ${error.message}`);
                    }
                }
            }

            this.emitLog(`Webhook cloning completed. Found ${totalWebhooks} webhooks, created ${clonedWebhooks} webhooks`);

        } catch (error) {
            const status = error.response?.status;
            if (status === 403) {
                this.emitError('Unable to manage webhooks. User may not have permission to manage webhooks in this server.');
                this.emitLog('Skipping webhook cloning due to insufficient permissions...');
                return;
            } else if (status === 400) {
                this.emitError(`Bad request when managing webhooks: ${error.response?.data?.message || error.message}`);
            }
            throw error;
        }
    }

    // Generic bulk delete with rate limiting and retry
    async bulkDelete(items, type, deleteFunc, delay = 1000) {
        for (const item of items) {
            if (this.stopped) break;
            await this.executeWithRetry(
                () => deleteFunc(item),
                `Deleting ${type}: ${item.name}`,
                delay
            );
        }
    }

    // Generic bulk create with rate limiting and retry
    async bulkCreate(items, type, createFunc, delay = 1500) {
        for (let i = 0; i < items.length; i++) {
            if (this.stopped) break;
            await this.executeWithRetry(
                () => createFunc(items[i], i),
                `Creating ${type}: ${items[i].name} (${i + 1}/${items.length})`,
                delay
            );
            this.emitStats();
        }
        this.emitLog(`${type.charAt(0).toUpperCase() + type.slice(1)} cloning completed. Created ${items.length} ${type}s`);
    }

    // Generic function to handle rate limiting and retries
    async executeWithRetry(operation, logMessage, delay = 1000) {
        this.emitLog(logMessage);
        try {
            await operation();
            await this.delay(delay);
        } catch (error) {
            if (error.response?.status === 429) {
                const retryAfter = (error.response.headers['retry-after'] || 3) * 1000;
                this.emitLog(`Rate limited, waiting ${retryAfter/1000}s before retry...`);
                await this.delay(retryAfter);
                try {
                    await operation();
                } catch (retryError) {
                    this.emitError(`${logMessage} failed after retry: ${retryError.message}`);
                    this.stats.errors++;
                }
            } else {
                this.emitError(`${logMessage} failed: ${error.message}`);
                this.stats.errors++;
            }
        }
    }

    // Emit functions
    emitProgress(message, progress) {
        this.stats.progress = progress;
        this.stats.lastMessage = message;
        this.stats.lastUpdate = Date.now();
        this.io.emit('cloneProgress', {
            clonerId: this.clonerId,
            message,
            progress,
            lastMessage: message,
            rolesCloned: this.stats.rolesCloned,
            categoriesCloned: this.stats.categoriesCloned,
            textChannelsCloned: this.stats.textChannelsCloned,
            voiceChannelsCloned: this.stats.voiceChannelsCloned,
            messagesCloned: this.stats.messagesCloned,
            emojisCloned: this.stats.emojisCloned,
            webhooksCloned: this.stats.webhooksCloned,
            errors: this.stats.errors
        });
    }

    emitLog(message) {
        this.io.emit('cloneLog', {
            clonerId: this.clonerId,
            message,
            timestamp: new Date().toISOString()
        });
    }

    emitError(message) {
        this.stats.errors++;
        this.io.emit('cloneError', {
            clonerId: this.clonerId,
            error: message,
            timestamp: new Date().toISOString()
        });
    }

    emitStats() {
        this.io.emit('cloning-stats', {
            clonerId: this.clonerId,
            stats: this.stats
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        this.stopped = true;
    }
}

module.exports = JSCloner;
