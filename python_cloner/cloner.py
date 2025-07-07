import aiohttp
import asyncio
import time
import json
import sys
import os
from typing import Optional, Callable

class Logger:
    def __init__(self, debug_callback=None):
        self.debug_callback = debug_callback
    
    def add(self, message: str):
        if self.debug_callback:
            # Use the callback if available (for wrapper integration)
            self.debug_callback(message, "INFO")
        else:
            # Fallback for standalone usage
            print(f"[INFO] {message}", flush=True)
    
    def error(self, message: str):
        if self.debug_callback:
            # Use the callback if available (for wrapper integration)
            self.debug_callback(message, "ERROR")
        else:
            # Fallback for standalone usage
            print(f"[ERROR] {message}", flush=True)

class PythonCloner:
    def __init__(self, debug_callback=None):
        self.logger = Logger(debug_callback)
        self.total_roles = 0
        self.total_channels = 0
        self.total_messages = 0
        self.roles_created = 0
        self.channels_created = 0
        self.messages_copied = 0
        self.errors = 0
        self.start_time = None
        self.channel_map = {}
        self.role_map = {}
        self.progress_callback = None
        self.stats_callback = None
        self.stats = {
            "roles_created": 0,
            "categories_created": 0,
            "text_channels_created": 0,
            "voice_channels_created": 0,
            "messages_cloned": 0,
            "errors": 0,
            "start_time": None,
            "elapsed_time": 0
        }
        self.progress_steps = {}

    def set_progress_callback(self, callback: Callable[[float], None]):
        """Set callback for progress updates"""
        self.progress_callback = callback

    def set_stats_callback(self, callback: Callable[[dict], None]):
        """Set callback for stats updates"""
        self.stats_callback = callback

    def _update_progress(self, progress: float):
        """Update progress via callback"""
        if self.progress_callback:
            self.progress_callback(progress)

    def _update_stats(self):
        """Update stats via callback"""
        if self.stats_callback:
            self.stats_callback(self.get_stats())

    def _increment_error(self):
        """Increment error count and update stats"""
        self.errors += 1
        self.stats["errors"] = self.errors
        self._update_stats()

    def _safe_log(self, message: str, level: str = "INFO"):
        """Thread-safe logging wrapper"""
        try:
            if level == "ERROR":
                self.logger.error(message)
            else:
                self.logger.add(message)
        except Exception:
            pass

    async def verify_token(self, token: str) -> dict:
        """Verify Discord token and get user info"""
        try:
            headers = {
                "Authorization": token,
                "Content-Type": "application/json"
            }
            
            connector = aiohttp.TCPConnector(force_close=True)
            async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
                # Verify user info
                async with session.get("https://discord.com/api/v10/users/@me") as response:
                    if response.status == 401:
                        return {"success": False, "error": "Invalid Discord token"}
                    elif response.status != 200:
                        error_data = await response.text()
                        return {"success": False, "error": f"API Error ({response.status}): {error_data}"}
                    
                    user_data = await response.json()
                    username = user_data.get("username", "Unknown")
                    
                    # Get user guilds
                    async with session.get("https://discord.com/api/v10/users/@me/guilds") as guilds_response:
                        if guilds_response.status != 200:
                            error_data = await guilds_response.text()
                            return {"success": False, "error": f"API Error ({guilds_response.status}): {error_data}"}
                        
                        guilds_data = await guilds_response.json()
                        guilds = []
                        for guild in guilds_data:
                            guilds.append({
                                'id': guild.get('id'),
                                'name': guild.get('name'),
                                'icon': guild.get('icon')
                            })
                        
                        return {
                            "success": True,
                            "guilds": guilds,
                            "username": username
                        }
                        
        except Exception as e:
            return {"success": False, "error": f"Connection error: {str(e)}"}

    async def start_clone(self, token: str, source_id: str, dest_id: str, options: dict = None) -> bool:
        """Start the cloning process using REST API with user token"""
        try:
            self.start_time = time.time()
            self.stats["start_time"] = self.start_time
            
            if options is None:
                options = {
                    "clone_roles": True,
                    "clone_categories": True,
                    "clone_text_channels": True,
                    "clone_voice_channels": True,
                    "clone_messages": False,
                    "messages_limit": 0
                }
            
            headers = {
                "Authorization": token,
                "Content-Type": "application/json"
            }
            
            connector = aiohttp.TCPConnector(force_close=True)
            async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
                self._safe_log(f"Starting clone from {source_id} to {dest_id}")
                self._update_progress(0.0)
                
                # Get source guild data
                source_url = f"https://discord.com/api/v10/guilds/{source_id}"
                async with session.get(source_url) as response:
                    if response.status != 200:
                        raise Exception(f"Cannot access source server: {response.status}")
                    source_guild = await response.json()
                    self._safe_log(f"Source server: {source_guild.get('name')}")
                
                # Get destination guild data
                dest_url = f"https://discord.com/api/v10/guilds/{dest_id}"
                async with session.get(dest_url) as response:
                    if response.status != 200:
                        raise Exception(f"Cannot access destination server: {response.status}")
                    dest_guild = await response.json()
                    self._safe_log(f"Destination server: {dest_guild.get('name')}")
                
                # Get roles data
                roles_data = []
                if options.get("clone_roles", True):
                    roles_url = f"https://discord.com/api/v10/guilds/{source_id}/roles"
                    async with session.get(roles_url) as response:
                        if response.status == 200:
                            all_roles = await response.json()
                            roles_data = [r for r in all_roles if r.get("name") != "@everyone"]
                            self.total_roles = len(roles_data)
                            self._safe_log(f"Found {self.total_roles} roles to clone")
                
                # Get channels data
                categories_data = []
                text_channels_data = []
                voice_channels_data = []
                
                channels_url = f"https://discord.com/api/v10/guilds/{source_id}/channels"
                async with session.get(channels_url) as response:
                    if response.status == 200:
                        all_channels = await response.json()
                        categories_data = [c for c in all_channels if c.get("type") == 4]
                        text_channels_data = [c for c in all_channels if c.get("type") == 0]
                        voice_channels_data = [c for c in all_channels if c.get("type") == 2]
                        
                        total_channels = 0
                        if options.get("clone_categories", True):
                            total_channels += len(categories_data)
                        if options.get("clone_text_channels", True):
                            total_channels += len(text_channels_data)
                        if options.get("clone_voice_channels", True):
                            total_channels += len(voice_channels_data)
                        
                        self.total_channels = total_channels
                        self._safe_log(f"Found {self.total_channels} channels to clone")
                
                # Setup progress steps
                self.progress_steps = {
                    "edit_guild": 0.05,
                    "delete_roles": 0.15,
                    "create_roles": 0.30,
                    "delete_channels": 0.40,
                    "create_categories": 0.50,
                    "create_channels": 0.70,
                    "copy_messages": 1.0
                }
                
                # Start cloning process
                
                # 1. Edit guild basic info
                await self._edit_guild_rest(dest_guild, source_guild, session)
                self._update_progress(self.progress_steps["edit_guild"])
                
                # 2. Clone roles
                if options.get("clone_roles", True) and roles_data:
                    await self._delete_existing_roles_rest(dest_guild, session)
                    self._update_progress(self.progress_steps["delete_roles"])
                    
                    await self._create_roles_rest(dest_guild, roles_data, session)
                    self._update_progress(self.progress_steps["create_roles"])
                
                # 3. Clone channels
                if any([options.get("clone_categories", True), 
                       options.get("clone_text_channels", True), 
                       options.get("clone_voice_channels", True)]):
                    await self._delete_existing_channels_rest(dest_guild, session)
                    self._update_progress(self.progress_steps["delete_channels"])
                    
                    if options.get("clone_categories", True) and categories_data:
                        await self._create_categories_rest(dest_guild, categories_data, session)
                        self._update_progress(self.progress_steps["create_categories"])
                    
                    if (options.get("clone_text_channels", True) and text_channels_data) or \
                       (options.get("clone_voice_channels", True) and voice_channels_data):
                        await self._create_channels_rest(
                            dest_guild,
                            text_channels_data if options.get("clone_text_channels", True) else [],
                            voice_channels_data if options.get("clone_voice_channels", True) else [],
                            session
                        )
                        self._update_progress(self.progress_steps["create_channels"])
                
                # 4. Copy messages (if enabled)
                if options.get("clone_messages", False):
                    self._safe_log("Message copying with user tokens is not implemented yet")
                    # This would require more complex implementation
                
                self._update_progress(1.0)
                elapsed = time.time() - self.start_time
                self.stats["elapsed_time"] = elapsed
                self._update_stats()  # Final stats update
                self._safe_log(f"Cloning completed successfully in {elapsed:.2f} seconds")
                return True
                
        except Exception as e:
            self._safe_log(f"Critical error during cloning: {str(e)}", "ERROR")
            return False

    async def _edit_guild_rest(self, guild_to, guild_from, session):
        """Edit basic server settings using REST API"""
        self._safe_log("Starting server modification...")
        try:
            await session.patch(f"https://discord.com/api/v10/guilds/{guild_to.get('id')}", json={
                "name": guild_from.get('name')
            })
            self._safe_log(f"Server name updated to: {guild_from.get('name')}")
        except Exception as e:
            self._increment_error()
            self._safe_log(f"Error modifying server: {str(e)}", "ERROR")

    async def _delete_existing_roles_rest(self, guild_to, session):
        """Delete existing roles using REST API"""
        self._safe_log("Deleting existing roles...")
        try:
            # Get current roles
            roles_url = f"https://discord.com/api/v10/guilds/{guild_to.get('id')}/roles"
            async with session.get(roles_url) as response:
                if response.status == 200:
                    roles = await response.json()
                    for role in roles:
                        if role.get("name") != "@everyone":
                            try:
                                await session.delete(f"https://discord.com/api/v10/guilds/{guild_to.get('id')}/roles/{role.get('id')}")
                                await asyncio.sleep(0.5)  # Rate limit prevention
                            except Exception as e:
                                self._safe_log(f"Error deleting role {role.get('name')}: {str(e)}", "ERROR")
        except Exception as e:
            self._safe_log(f"Error deleting roles: {str(e)}", "ERROR")

    async def _create_roles_rest(self, guild_to, roles_data, session):
        """Create new roles using REST API"""
        self._safe_log("Creating new roles...")
        for role in roles_data:
            try:
                payload = {
                    "name": role.get('name'),
                    "permissions": str(role.get('permissions', 0)),
                    "color": role.get('color', 0),
                    "hoist": role.get('hoist', False),
                    "mentionable": role.get('mentionable', False)
                }
                
                async with session.post(f"https://discord.com/api/v10/guilds/{guild_to.get('id')}/roles", json=payload) as resp:
                    if resp.status == 200 or resp.status == 201:
                        created = await resp.json()
                        self.role_map[role.get('id')] = created.get('id')
                        self.roles_created += 1
                        self.stats["roles_created"] = self.roles_created
                        self._update_stats()
                        self._safe_log(f"Role created ({self.roles_created}/{self.total_roles}): {role.get('name')}")
                    elif resp.status == 429:  # Rate limit
                        rate_limit_data = await resp.json()
                        retry_after = rate_limit_data.get('retry_after', 5)
                        self._safe_log(f"Rate limit hit when creating role {role.get('name')}. Waiting {retry_after} seconds...", "ERROR")
                        await asyncio.sleep(retry_after)
                        continue
                    else:
                        self._increment_error()
                        self._safe_log(f"Error creating role {role.get('name')}: {resp.status}", "ERROR")
                
                await asyncio.sleep(0.5)  # Rate limit prevention
            except Exception as e:
                self._increment_error()
                self._safe_log(f"Error creating role {role.get('name')}: {str(e)}", "ERROR")

    async def _delete_existing_channels_rest(self, guild_to, session):
        """Delete existing channels using REST API"""
        self._safe_log("Deleting existing channels...")
        try:
            channels_url = f"https://discord.com/api/v10/guilds/{guild_to.get('id')}/channels"
            async with session.get(channels_url) as response:
                if response.status == 200:
                    channels = await response.json()
                    for channel in channels:
                        try:
                            await session.delete(f"https://discord.com/api/v10/channels/{channel.get('id')}")
                            await asyncio.sleep(0.5)
                        except Exception as e:
                            self._safe_log(f"Error deleting channel {channel.get('name')}: {str(e)}", "ERROR")
        except Exception as e:
            self._safe_log(f"Error deleting channels: {str(e)}", "ERROR")

    async def _create_categories_rest(self, guild_to, categories_data, session):
        """Create categories using REST API"""
        self._safe_log("Creating categories...")
        for category in categories_data:
            try:
                payload = {
                    "name": category.get('name'),
                    "type": 4,  # Category type
                    "position": category.get('position', 0)
                }
                
                async with session.post(f"https://discord.com/api/v10/guilds/{guild_to.get('id')}/channels", json=payload) as response:
                    if response.status == 200 or response.status == 201:
                        created = await response.json()
                        self.channel_map[category.get('id')] = created.get('id')
                        self.stats["categories_created"] += 1
                        self._update_stats()
                        self._safe_log(f"Category created: {category.get('name')}")
                    elif response.status == 429:  # Rate limit
                        rate_limit_data = await response.json()
                        retry_after = rate_limit_data.get('retry_after', 5)
                        self._safe_log(f"Rate limit hit when creating category {category.get('name')}. Waiting {retry_after} seconds...", "ERROR")
                        await asyncio.sleep(retry_after)
                        continue
                    else:
                        self._increment_error()
                        self._safe_log(f"Error creating category {category.get('name')}: {response.status}", "ERROR")
                
                await asyncio.sleep(1.0)  # Longer delay for categories
            except Exception as e:
                self._increment_error()
                self._safe_log(f"Error creating category {category.get('name')}: {str(e)}", "ERROR")

    async def _create_channels_rest(self, guild_to, text_channels_data, voice_channels_data, session):
        """Create channels using REST API"""
        # Create text channels
        for channel in text_channels_data:
            try:
                category_id = None
                if channel.get('parent_id') and channel.get('parent_id') in self.channel_map:
                    category_id = self.channel_map[channel.get('parent_id')]
                
                payload = {
                    "name": channel.get('name'),
                    "type": 0,  # Text channel
                    "topic": channel.get('topic'),
                    "position": channel.get('position', 0),
                    "parent_id": category_id,
                    "nsfw": channel.get('nsfw', False)
                }
                
                async with session.post(f"https://discord.com/api/v10/guilds/{guild_to.get('id')}/channels", json=payload) as response:
                    if response.status == 200 or response.status == 201:
                        self.channels_created += 1
                        self.stats["text_channels_created"] += 1
                        self._update_stats()
                        self._safe_log(f"Text channel created ({self.channels_created}/{self.total_channels}): {channel.get('name')}")
                    elif response.status == 429:  # Rate limit
                        rate_limit_data = await response.json()
                        retry_after = rate_limit_data.get('retry_after', 5)
                        self._safe_log(f"Rate limit hit when creating channel {channel.get('name')}. Waiting {retry_after} seconds...", "ERROR")
                        await asyncio.sleep(retry_after)
                        continue
                    else:
                        self._increment_error()
                        self._safe_log(f"Error creating text channel {channel.get('name')}: {response.status}", "ERROR")
                
                await asyncio.sleep(2.0)  # Rate limit prevention
            except Exception as e:
                self._increment_error()
                self._safe_log(f"Error creating text channel {channel.get('name')}: {str(e)}", "ERROR")

        # Create voice channels
        for channel in voice_channels_data:
            try:
                category_id = None
                if channel.get('parent_id') and channel.get('parent_id') in self.channel_map:
                    category_id = self.channel_map[channel.get('parent_id')]
                
                payload = {
                    "name": channel.get('name'),
                    "type": 2,  # Voice channel
                    "position": channel.get('position', 0),
                    "parent_id": category_id,
                    "user_limit": channel.get('user_limit', 0),
                    "bitrate": channel.get('bitrate', 64000)
                }
                
                async with session.post(f"https://discord.com/api/v10/guilds/{guild_to.get('id')}/channels", json=payload) as response:
                    if response.status == 200 or response.status == 201:
                        self.channels_created += 1
                        self.stats["voice_channels_created"] += 1
                        self._update_stats()
                        self._safe_log(f"Voice channel created ({self.channels_created}/{self.total_channels}): {channel.get('name')}")
                    elif response.status == 429:  # Rate limit
                        rate_limit_data = await response.json()
                        retry_after = rate_limit_data.get('retry_after', 5)
                        self._safe_log(f"Rate limit hit when creating channel {channel.get('name')}. Waiting {retry_after} seconds...", "ERROR")
                        await asyncio.sleep(retry_after)
                        continue
                    else:
                        self._increment_error()
                        self._safe_log(f"Error creating voice channel {channel.get('name')}: {response.status}", "ERROR")
                
                await asyncio.sleep(2.0)  # Rate limit prevention
            except Exception as e:
                self._increment_error()
                self._safe_log(f"Error creating voice channel {channel.get('name')}: {str(e)}", "ERROR")

    def get_stats(self) -> dict:
        """Return cloning statistics"""
        current_time = time.time()
        if self.start_time:
            self.stats["elapsed_time"] = current_time - self.start_time
        return self.stats


async def main():
    """CLI interface for testing"""
    if len(sys.argv) < 4:
        print("Usage: python cloner.py <token> <source_server_id> <dest_server_id>", flush=True)
        sys.exit(1)
    
    token = sys.argv[1]
    source_id = sys.argv[2]
    dest_id = sys.argv[3]
    
    cloner = PythonCloner()
    
    print("Verifying token...", flush=True)
    verification = await cloner.verify_token(token)
    if not verification["success"]:
        print(f"Token verification failed: {verification['error']}", flush=True)
        sys.exit(1)
    
    print(f"Logged in as: {verification['username']}", flush=True)
    print(f"Found {len(verification['guilds'])} servers", flush=True)
    
    print("Starting clone...", flush=True)
    success = await cloner.start_clone(token, source_id, dest_id)
    
    if success:
        print("Clone completed successfully!", flush=True)
    else:
        print("Clone failed!", flush=True)
    
    print(f"Final stats: {cloner.get_stats()}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
