import os
import sys
import json
import time
import threading
import asyncio
from flask import Flask, render_template, request, redirect, jsonify
import requests

try:
  import discord
  from discord import Client, Intents
  from enhanced_cloner import EnhancedCloner
except ImportError as e:
  print(f"Missing dependency: {e}")
  print("Please install requirements manually:")
  print("pip install -r requirements.txt")
  sys.exit(1)

# Flask app for Auto-post functionality
app = Flask(__name__, template_folder='../web/templates', static_folder='../web/static')
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config.json")
posting_active = False
cloning_active = False
cloning_progress = {"status": "Ready", "progress": 0, "current_step": ""}

# Discord client
try:
  client = Client(intents=Intents.all())
except Exception as e:
  print("> Failed to create Discord client: ", e)

# Load configuration
with open(CONFIG_PATH, "r") as json_file:
  data = json.load(json_file)

# Global variables for cloner
current_guild_from = None
current_guild_to = None

# Auto-post functions
def send_log(message, channel_id=None, success=True):
    if data.get("use_webhook") and data.get("webhook_url"):
        try:
            now = time.strftime("%d %B %Y  %I:%M:%S %p")
            embed = {
                "title": "🎁 Auto Post Discord 🎁",
                "description": "> **Details Info**",
                "color": 65280 if success else 16711680,
                "fields": [
                    {
                        "name": "🟢 Status Log",
                        "value": "> Success" if success else "> Failed"
                    },
                    {
                        "name": "🕴 Username",
                        "value": "> <@me>"
                    },
                    {
                        "name": "🕓 Date Time",
                        "value": f"> {now}"
                    },
                    {
                        "name": "📺 Channel Target",
                        "value": f"> <#{channel_id}>" if channel_id else "> Unknown"
                    },
                    {
                        "name": "✅ Status Message",
                        "value": f"> {message}"
                    }
                ],
                "image": {
                    "url": "https://cdn.discordapp.com/attachments/1222659397477097572/1226427380985126922/image.png"
                },
                "footer": {
                    "text": "Auto Post By Lantas Continental + Discord Cloner"
                }
            }

            payload = {"embeds": [embed]}
            requests.post(data["webhook_url"], json=payload)

        except Exception as e:
            print(f"[LOG ERROR] {e}")

def post_to_channel(ch):
    while posting_active:
        try:
            url = f"https://discord.com/api/v10/channels/{ch['id']}/messages"
            headers = {
                "Authorization": data["token"].strip(),
                "Content-Type": "application/json"
            }
            request_data = {
                "content": ch["message"]
            }
            res = requests.post(url, headers=headers, json=request_data)
            if res.status_code in [200, 204]:
                send_log(f"Pesan berhasil dikirim ke <#{ch['id']}>.", ch['id'], True)
                print(f"✅ Message sent to channel {ch['id']}")
            else:
                send_log(f"Gagal kirim ke <#{ch['id']}>: [{res.status_code}] {res.text}", ch['id'], False)
                print(f"❌ Failed to send message to channel {ch['id']}: {res.status_code}")
        except Exception as e:
            send_log(f"Error kirim ke <#{ch['id']}>: {e}", ch['id'], False)
            print(f"❌ Error sending to channel {ch['id']}: {e}")
        
        time.sleep(ch["interval"])

def auto_post():
    for ch in data.get("auto_post_channels", []):
        threading.Thread(target=post_to_channel, args=(ch,), daemon=True).start()

# Cloner functions for web interface
async def clone_server(INPUT_GUILD_ID, GUILD):
    global cloning_active, cloning_progress
    start_time = time.time()
    guild_from = client.get_guild(int(INPUT_GUILD_ID))
    guild_to = client.get_guild(int(GUILD))
    
    cloning_progress = {"status": "Running", "progress": 10, "current_step": "Initializing guilds"}
    print(f"\n🚀 Starting Enhanced Discord Server Cloning...")
    print(f"📥 Source: {guild_from.name} (ID: {guild_from.id})")
    print(f"📤 Target: {guild_to.name} (ID: {guild_to.id})")
    
    # Choose cloning method
    use_enhanced = data.get("use_enhanced_cloner", True)
    
    if use_enhanced:
        print("🔥 Using Enhanced Cloner")
        cloning_progress = {"status": "Running", "progress": 20, "current_step": "Starting enhanced cloning"}
        enhanced_cloner = EnhancedCloner(guild_from, guild_to, data)
        await enhanced_cloner.clone_server_enhanced()
    
    elapsed = round(time.time() - start_time, 2)
    cloning_progress = {"status": "Completed", "progress": 100, "current_step": f"Completed in {elapsed}s"}
    cloning_active = False
    print(f"\n✅ Cloning completed in {elapsed} seconds")

@client.event
async def on_ready():
  if current_guild_from and current_guild_to:
    await clone_server(current_guild_from, current_guild_to)

# Flask routes for Auto-post web interface
@app.route("/", methods=["GET"])
def index():
    return render_template('index.html', config=data)

@app.route("/api/config", methods=["GET"])
def get_config():
    return jsonify(data)

@app.route("/api/status", methods=["GET"])
def get_status():
    return jsonify({
        "auto_posting": posting_active,
        "cloning": cloning_active,
        "cloning_progress": cloning_progress,
        "active_channels": len(data.get("auto_post_channels", [])),
        "token_set": bool(data.get("token")),
        "webhook_set": bool(data.get("webhook_url"))
    })

@app.route("/save-config", methods=["POST"])
def save():
    global data
    form_data = request.get_json() if request.is_json else request.form
    
    # Update basic settings
    for key in ["token", "webhook_url", "use_webhook", "use_enhanced_cloner", 
                "clone_messages", "clear_guild", "message_limit"]:
        if key in form_data:
            if key in ["use_webhook", "use_enhanced_cloner", "clone_messages", "clear_guild"]:
                data[key] = bool(form_data.get(key))
            elif key == "message_limit":
                try:
                    data[key] = int(form_data.get(key, 100))
                except:
                    data[key] = 100
            else:
                data[key] = form_data.get(key, "").strip()
    
    # Update copy settings if provided
    if "copy_settings" in form_data:
        data["copy_settings"] = form_data["copy_settings"]
    
    # Save config
    with open(CONFIG_PATH, "w") as f:
        json.dump(data, f, indent=4)
    
    if request.is_json:
        return jsonify({"success": True, "message": "Configuration saved successfully"})
    return redirect("/")

@app.route("/api/channels", methods=["GET", "POST", "PUT", "DELETE"])
def manage_channels():
    global data
    
    if "auto_post_channels" not in data:
        data["auto_post_channels"] = []
    
    if request.method == "GET":
        return jsonify(data["auto_post_channels"])
    
    elif request.method == "POST":
        # Add new channel
        channel_data = request.get_json()
        channel_id = channel_data.get("id")
        message = channel_data.get("message")
        interval = channel_data.get("interval", 3600)
        
        if channel_id and message:
            data["auto_post_channels"].append({
                "id": channel_id,
                "message": message,
                "interval": interval
            })
            with open(CONFIG_PATH, "w") as f:
                json.dump(data, f, indent=4)
            return jsonify({"success": True, "message": "Channel added successfully"})
        
        return jsonify({"success": False, "message": "Missing channel ID or message"}), 400
    
    elif request.method == "PUT":
        # Edit channel
        channel_data = request.get_json()
        channel_id = channel_data.get("id")
        
        for ch in data["auto_post_channels"]:
            if ch["id"] == channel_id:
                ch["message"] = channel_data.get("message", ch["message"])
                ch["interval"] = channel_data.get("interval", ch["interval"])
                with open(CONFIG_PATH, "w") as f:
                    json.dump(data, f, indent=4)
                return jsonify({"success": True, "message": "Channel updated successfully"})
        
        return jsonify({"success": False, "message": "Channel not found"}), 404
    
    elif request.method == "DELETE":
        # Remove channel
        channel_id = request.args.get("id")
        original_count = len(data["auto_post_channels"])
        data["auto_post_channels"] = [ch for ch in data["auto_post_channels"] if ch["id"] != channel_id]
        
        if len(data["auto_post_channels"]) < original_count:
            with open(CONFIG_PATH, "w") as f:
                json.dump(data, f, indent=4)
            return jsonify({"success": True, "message": "Channel removed successfully"})
        
        return jsonify({"success": False, "message": "Channel not found"}), 404

@app.route("/load-config", methods=["POST"])
def load():
    global data
    with open(CONFIG_PATH, "r") as f:
        data = json.load(f)
    if request.is_json:
        return jsonify({"success": True, "config": data})
    return redirect("/")

@app.route("/start-autopost", methods=["POST"])
def start_autopost():
    global posting_active
    if not posting_active:
        posting_active = True
        threading.Thread(target=auto_post, daemon=True).start()
        print("🚀 Auto-post started!")
    
    if request.is_json:
        return jsonify({"success": True, "message": "Auto-post started", "active": posting_active})
    return redirect("/")

@app.route("/stop-autopost", methods=["POST"])
def stop_autopost():
    global posting_active
    posting_active = False
    print("🛑 Auto-post stopped!")
    
    if request.is_json:
        return jsonify({"success": True, "message": "Auto-post stopped", "active": posting_active})
    return redirect("/")

@app.route("/test-webhook", methods=["POST"])
def test_webhook():
    try:
        send_log("Test webhook log berhasil dikirim.")
        if request.is_json:
            return jsonify({"success": True, "message": "Webhook test successful"})
        return redirect("/")
    except Exception as e:
        if request.is_json:
            return jsonify({"success": False, "message": f"Webhook test failed: {str(e)}"})
        return redirect("/")

@app.route("/clone-server", methods=["POST"])
def clone_server_route():
    global current_guild_from, current_guild_to, data, cloning_active
    
    if cloning_active:
        if request.is_json:
            return jsonify({"success": False, "message": "Cloning already in progress"})
        return redirect("/")
    
    form_data = request.get_json() if request.is_json else request.form
    
    current_guild_from = form_data.get("guild_from")
    current_guild_to = form_data.get("guild_to")
    
    if not current_guild_from or not current_guild_to:
        if request.is_json:
            return jsonify({"success": False, "message": "Missing source or target server ID"})
        return redirect("/")
    
    # Update enhanced cloner settings
    data["use_enhanced_cloner"] = bool(form_data.get("use_enhanced", True))
    data["clone_messages"] = bool(form_data.get("clone_messages", False))
    data["clear_guild"] = bool(form_data.get("clear_guild", True))
    
    try:
        data["message_limit"] = int(form_data.get("message_limit", 100))
    except:
        data["message_limit"] = 100
    
    # Save updated config
    with open(CONFIG_PATH, "w") as f:
        json.dump(data, f, indent=4)
    
    # Start cloning in background
    cloning_active = True
    threading.Thread(target=start_cloning, daemon=True).start()
    
    if request.is_json:
        return jsonify({"success": True, "message": "Cloning started", "guild_from": current_guild_from, "guild_to": current_guild_to})
    return redirect("/")

@app.route("/api/logs", methods=["GET"])
def get_logs():
    # This would return recent logs - for now return a placeholder
    logs = [
        {"timestamp": time.time(), "type": "info", "message": "System initialized"},
        {"timestamp": time.time() - 60, "type": "success", "message": "Configuration loaded"},
        {"timestamp": time.time() - 120, "type": "warning", "message": "Token validation pending"}
    ]
    return jsonify(logs)

@app.route("/api/export-config", methods=["GET"])
def export_config():
    return jsonify(data)

@app.route("/api/import-config", methods=["POST"])
def import_config():
    global data
    try:
        imported_data = request.get_json()
        # Validate basic structure
        if not isinstance(imported_data, dict):
            return jsonify({"success": False, "message": "Invalid config format"}), 400
        
        data.update(imported_data)
        with open(CONFIG_PATH, "w") as f:
            json.dump(data, f, indent=4)
        
        return jsonify({"success": True, "message": "Configuration imported successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Import failed: {str(e)}"}), 400

@app.route("/api/reset-config", methods=["POST"])
def reset_config():
    global data
    try:
        # Reset to default configuration
        default_config = {
            "token": "",
            "prefix": "!",
            "logs": True,
            "use_enhanced_cloner": True,
            "clone_messages": False,
            "message_limit": 100,
            "clear_guild": True,
            "copy_settings": {
                "categories": True,
                "channels": True,
                "roles": True,
                "permissions": True,
                "emojis": True
            },
            "use_webhook": False,
            "webhook_url": "",
            "auto_post_channels": []
        }
        
        data = default_config
        with open(CONFIG_PATH, "w") as f:
            json.dump(data, f, indent=4)
        
        return jsonify({"success": True, "message": "Configuration reset to defaults"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Reset failed: {str(e)}"}), 400

@app.route("/api/config", methods=["POST"])
def update_config():
    global data
    try:
        config_data = request.get_json()
        
        # Update the data dictionary with new config
        for key, value in config_data.items():
            data[key] = value
        
        # Save to file
        with open(CONFIG_PATH, "w") as f:
            json.dump(data, f, indent=4)
        
        return jsonify({"success": True, "message": "Configuration updated successfully"})
    except Exception as e:
        return jsonify({"success": False, "message": f"Error updating configuration: {str(e)}"}), 500

def start_cloning():
    global current_guild_from, current_guild_to, cloning_active, cloning_progress
    try:
        cloning_progress = {"status": "Starting", "progress": 0, "current_step": "Initializing client"}
        client.run(data["token"], bot=False)
    except Exception as e:
        print(f"Error during cloning: {e}")
        cloning_active = False
        cloning_progress = {"status": "Error", "progress": 0, "current_step": f"Error: {str(e)}"}

def update_cloning_progress(step, progress=None):
    global cloning_progress
    cloning_progress["current_step"] = step
    if progress is not None:
        cloning_progress["progress"] = progress
    print(f"🔄 {step} ({cloning_progress['progress']}%)")

def main():
    print("🤖 Discord Tools Pro - Modern Web Interface")
    print("=" * 50)
    print("🌐 Starting Advanced Web Interface...")
    print("� Open your browser and visit: http://localhost:5000")
    print("✨ Features: Enhanced Cloner, Auto-Poster, Real-time UI")
    print("🛑 Press Ctrl+C to stop")
    print("=" * 50)
    
    try:
        app.run(debug=False, host="0.0.0.0", port=5000)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")

if __name__ == "__main__":
    main()
