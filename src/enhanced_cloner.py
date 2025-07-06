"""
Enhanced Discord Server Cloner 
Combining basic cloner with advanced features from itskekoff/discord-server-copy
"""

import discord
import asyncio
import aiohttp
import json
import time
from collections import deque
from colorama import Fore, init, Style

class EnhancedCloner:
    def __init__(self, guild_from: discord.Guild, guild_to: discord.Guild, config: dict):
        self.guild_from = guild_from
        self.guild_to = guild_to
        self.config = config
        
        # Advanced mapping system like itskekoff
        self.mappings = {
            "roles": {},
            "categories": {},
            "channels": {},
            "webhooks": {},
            "emojis": {},
            "stickers": {}
        }
        
        # Message queue for cloning
        self.message_queue = deque()
        self.processing_messages = False
        
        # Rate limiting
        self.delay = 0.5
        self.webhook_delay = 0.65
        
    def log(self, message, type="info"):
        colors = {
            'info': Fore.CYAN,
            'success': Fore.GREEN,
            'error': Fore.RED,
            'warning': Fore.YELLOW
        }
        color = colors.get(type, Fore.WHITE)
        print(f"{color}[{type.upper()}]{Style.RESET_ALL} {message}")

    async def save_state(self, filename="clone_state.json"):
        """Save cloning progress"""
        state = {
            "guild_from_id": self.guild_from.id,
            "guild_to_id": self.guild_to.id,
            "mappings": {
                "roles": {str(k): v.id for k, v in self.mappings["roles"].items()},
                "categories": {str(k): v.id for k, v in self.mappings["categories"].items()},
                "channels": {str(k): v.id for k, v in self.mappings["channels"].items()},
                "emojis": {str(k): v.id for k, v in self.mappings["emojis"].items()}
            },
            "timestamp": time.time()
        }
        
        with open(filename, "w") as f:
            json.dump(state, f, indent=2)
        self.log(f"State saved to {filename}", "success")

    async def clone_server_enhanced(self):
        """Enhanced server cloning with advanced features"""
        start_time = time.time()
        
        try:
            # 1. Clone server info (icon, banner, name)
            await self.clone_server_info()
            
            # 2. Clear target server if requested
            if self.config.get("clear_guild", True):
                await self.clear_target_server()
            
            # 3. Clone roles with mapping
            if self.config["copy_settings"]["roles"]:
                await self.clone_roles_enhanced()
            
            # 4. Clone categories with mapping
            if self.config["copy_settings"]["categories"]:
                await self.clone_categories_enhanced()
            
            # 5. Clone channels with mapping
            if self.config["copy_settings"]["channels"]:
                await self.clone_channels_enhanced()
            
            # 6. Clone emojis and stickers
            if self.config["copy_settings"]["emojis"]:
                await self.clone_emojis_enhanced()
                
            # 7. Clone messages if enabled
            if self.config.get("clone_messages", False):
                await self.clone_messages()
            
            # 8. Save final state
            await self.save_state("final_clone_state.json")
            
            elapsed = round(time.time() - start_time, 2)
            self.log(f"Enhanced cloning completed in {elapsed} seconds", "success")
            
        except Exception as e:
            self.log(f"Error during enhanced cloning: {e}", "error")
            await self.save_state("error_clone_state.json")

    async def clone_server_info(self):
        """Clone server icon, banner, and name"""
        try:
            # Clone name
            await self.guild_to.edit(name=self.guild_from.name)
            self.log(f"Server name changed to: {self.guild_from.name}", "success")
            
            # Clone icon
            if self.guild_from.icon:
                async with aiohttp.ClientSession() as session:
                    async with session.get(str(self.guild_from.icon.url)) as resp:
                        icon_data = await resp.read()
                        await self.guild_to.edit(icon=icon_data)
                        self.log("Server icon cloned", "success")
            
            # Clone banner (if available)
            if self.guild_from.banner and "BANNER" in self.guild_from.features:
                async with aiohttp.ClientSession() as session:
                    async with session.get(str(self.guild_from.banner.url)) as resp:
                        banner_data = await resp.read()
                        await self.guild_to.edit(banner=banner_data)
                        self.log("Server banner cloned", "success")
                        
        except Exception as e:
            self.log(f"Error cloning server info: {e}", "error")

    async def clear_target_server(self):
        """Clear target server channels and roles"""
        try:
            # Delete all channels except default
            channels = [ch for ch in self.guild_to.channels if ch.name not in ["general", "General"]]
            for channel in channels:
                try:
                    await channel.delete()
                    await asyncio.sleep(self.delay)
                except:
                    pass
            
            # Delete all roles except @everyone and bot roles
            roles = [r for r in self.guild_to.roles if not r.is_default() and not r.managed]
            for role in roles:
                try:
                    await role.delete()
                    await asyncio.sleep(self.delay)
                except:
                    pass
                    
            self.log("Target server cleared", "success")
            
        except Exception as e:
            self.log(f"Error clearing target server: {e}", "error")

    async def clone_roles_enhanced(self):
        """Clone roles with advanced mapping system"""
        roles = [role for role in self.guild_from.roles if role.name != "@everyone"]
        roles.reverse()  # Start from highest role
        
        for role in roles:
            try:
                new_role = await self.guild_to.create_role(
                    name=role.name,
                    permissions=role.permissions,
                    colour=role.colour,
                    hoist=role.hoist,
                    mentionable=role.mentionable
                )
                
                # Map old role to new role
                self.mappings["roles"][role.id] = new_role
                self.log(f"Created role: {role.name}", "success")
                await asyncio.sleep(self.delay)
                
            except Exception as e:
                self.log(f"Error creating role {role.name}: {e}", "error")

    async def clone_categories_enhanced(self):
        """Clone categories with permission mapping"""
        categories = [ch for ch in self.guild_from.channels if isinstance(ch, discord.CategoryChannel)]
        
        for category in categories:
            try:
                # Map permissions to new roles
                overwrites = {}
                for role, permissions in category.overwrites.items():
                    if isinstance(role, discord.Role) and role.id in self.mappings["roles"]:
                        overwrites[self.mappings["roles"][role.id]] = permissions
                
                new_category = await self.guild_to.create_category(
                    name=category.name,
                    overwrites=overwrites,
                    position=category.position
                )
                
                # Map old category to new category
                self.mappings["categories"][category.id] = new_category
                self.log(f"Created category: {category.name}", "success")
                await asyncio.sleep(self.delay)
                
            except Exception as e:
                self.log(f"Error creating category {category.name}: {e}", "error")

    async def clone_channels_enhanced(self):
        """Clone channels with advanced features"""
        channels = [ch for ch in self.guild_from.channels 
                   if not isinstance(ch, discord.CategoryChannel)]
        
        for channel in channels:
            try:
                # Get category mapping
                category = None
                if channel.category_id and channel.category_id in self.mappings["categories"]:
                    category = self.mappings["categories"][channel.category_id]
                
                # Map permissions
                overwrites = {}
                for role, permissions in channel.overwrites.items():
                    if isinstance(role, discord.Role) and role.id in self.mappings["roles"]:
                        overwrites[self.mappings["roles"][role.id]] = permissions
                
                # Create appropriate channel type
                if isinstance(channel, discord.TextChannel):
                    new_channel = await self.guild_to.create_text_channel(
                        name=channel.name,
                        category=category,
                        topic=channel.topic,
                        slowmode_delay=channel.slowmode_delay,
                        nsfw=channel.nsfw,
                        overwrites=overwrites,
                        position=channel.position
                    )
                elif isinstance(channel, discord.VoiceChannel):
                    new_channel = await self.guild_to.create_voice_channel(
                        name=channel.name,
                        category=category,
                        bitrate=channel.bitrate,
                        user_limit=channel.user_limit,
                        overwrites=overwrites,
                        position=channel.position
                    )
                else:
                    continue
                
                # Map old channel to new channel
                self.mappings["channels"][channel.id] = new_channel
                self.log(f"Created channel: {channel.name}", "success")
                await asyncio.sleep(self.delay)
                
            except Exception as e:
                self.log(f"Error creating channel {channel.name}: {e}", "error")

    async def clone_emojis_enhanced(self):
        """Clone emojis with limit checking"""
        emoji_limit = self.guild_to.emoji_limit - len(self.guild_to.emojis) - 5  # Safety margin
        cloned_count = 0
        
        for emoji in self.guild_from.emojis:
            if cloned_count >= emoji_limit:
                self.log("Emoji limit reached", "warning")
                break
                
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(str(emoji.url)) as resp:
                        emoji_data = await resp.read()
                        
                new_emoji = await self.guild_to.create_custom_emoji(
                    name=emoji.name,
                    image=emoji_data
                )
                
                self.mappings["emojis"][emoji.id] = new_emoji
                self.log(f"Created emoji: {emoji.name}", "success")
                cloned_count += 1
                await asyncio.sleep(self.delay)
                
            except Exception as e:
                self.log(f"Error creating emoji {emoji.name}: {e}", "error")

    async def clone_messages(self):
        """Clone messages using webhook system (like itskekoff)"""
        if not self.config.get("clone_messages", False):
            return
            
        self.log("Starting message cloning...", "info")
        message_limit = self.config.get("message_limit", 100)
        
        # Populate message queue
        await self.populate_message_queue(message_limit)
        
        if not self.message_queue:
            self.log("No messages to clone", "warning")
            return
        
        self.log(f"Found {len(self.message_queue)} messages to clone", "info")
        self.processing_messages = True
        
        # Process messages
        while self.message_queue:
            try:
                channel_id, message = self.message_queue.popleft()
                new_channel = self.mappings["channels"].get(channel_id)
                
                if new_channel:
                    await self.clone_single_message(new_channel, message)
                    await asyncio.sleep(self.webhook_delay)
                    
            except Exception as e:
                self.log(f"Error cloning message: {e}", "error")
        
        self.processing_messages = False
        self.log("Message cloning completed", "success")

    async def populate_message_queue(self, limit: int):
        """Populate message queue from source channels"""
        for channel_id, new_channel in self.mappings["channels"].items():
            try:
                original_channel = self.guild_from.get_channel(channel_id)
                if not isinstance(original_channel, discord.TextChannel):
                    continue
                
                async for message in original_channel.history(limit=limit):
                    self.message_queue.append((channel_id, message))
                    
            except Exception as e:
                self.log(f"Error fetching messages from {channel_id}: {e}", "error")

    async def clone_single_message(self, channel: discord.TextChannel, message: discord.Message):
        """Clone a single message using webhook"""
        try:
            # Create or get webhook
            webhook = await self.get_or_create_webhook(channel)
            if not webhook:
                return
            
            # Prepare message content
            content = message.content or ""
            
            # Replace mentions in content
            content = await self.replace_mentions(content)
            
            # Get author info
            author = message.author
            avatar_url = str(author.display_avatar.url) if author.display_avatar else None
            username = f"{author.display_name}"
            
            # Send via webhook
            await webhook.send(
                content=content,
                username=username,
                avatar_url=avatar_url,
                embeds=message.embeds[:10],  # Discord limit
                wait=False
            )
            
        except Exception as e:
            self.log(f"Error cloning message: {e}", "error")

    async def get_or_create_webhook(self, channel: discord.TextChannel):
        """Get existing webhook or create new one"""
        try:
            # Check if webhook already exists
            if channel.id in self.mappings["webhooks"]:
                return self.mappings["webhooks"][channel.id]
            
            # Create new webhook
            webhook = await channel.create_webhook(name="Enhanced Cloner")
            self.mappings["webhooks"][channel.id] = webhook
            
            return webhook
            
        except Exception as e:
            self.log(f"Error creating webhook for {channel.name}: {e}", "error")
            return None

    async def replace_mentions(self, content: str):
        """Replace old mentions with new ones"""
        # Replace role mentions
        for old_role_id, new_role in self.mappings["roles"].items():
            content = content.replace(f"<@&{old_role_id}>", f"<@&{new_role.id}>")
        
        # Replace channel mentions
        for old_channel_id, new_channel in self.mappings["channels"].items():
            content = content.replace(f"<#{old_channel_id}>", f"<#{new_channel.id}>")
        
        return content

    async def cleanup_webhooks(self):
        """Clean up created webhooks"""
        for webhook in self.mappings["webhooks"].values():
            try:
                await webhook.delete()
            except:
                pass
        self.log("Webhooks cleaned up", "success")
