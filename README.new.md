# 🤖 Discord Tools Pro

A modern, web-based Discord server cloner and auto-poster tool with an advanced, responsive UI built with Bootstrap 5.

## ✨ Features

### 🚀 Server Cloning
- **Complete Server Replication**: Clone channels, categories, roles, permissions, emojis, and more
- **Message Cloning**: Optional message history cloning with customizable limits
- **Advanced Mapping**: Intelligent channel and role mapping with state persistence
- **Banner & Icon Support**: Clone server banners, icons, and other visual elements
- **Webhook Integration**: Clone channel webhooks for complete functionality

### 📢 Auto Posting
- **Multi-Channel Support**: Post to multiple channels with individual timers
- **Flexible Scheduling**: Custom intervals (hours, minutes, seconds)
- **Real-time Management**: Add, edit, and remove channels on-the-fly
- **Webhook Logging**: Optional webhook notifications for post activities

### 🎨 Modern Web Interface
- **Bootstrap 5 Integration**: Responsive, mobile-friendly design
- **Real-time Updates**: Live status indicators and progress tracking
- **Dark Discord Theme**: Consistent with Discord's visual style
- **Tabbed Navigation**: Organized interface with Dashboard, Auto Poster, Server Cloner, Settings, and Logs

## 🛠️ Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd DiscordServerCloner2.0
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure your Discord token**:
   - Edit `config.json` or use the web interface Settings tab
   - Add your Discord bot token

4. **Run the application**:
   ```bash
   python main.py
   ```

5. **Access the web interface**:
   - Open your browser and go to `http://localhost:5000`

## 📁 Project Structure

```
DiscordServerCloner2.0/
├── main.py                 # Main entry point
├── config.json            # Configuration file
├── requirements.txt       # Python dependencies
├── src/                   # Source code
│   ├── integrated_main.py # Flask web server and API
│   └── enhanced_cloner.py # Advanced cloning logic
└── web/                   # Web interface
    ├── static/
    │   ├── style.css      # Organized CSS with Bootstrap integration
    │   └── script.js      # Modern JavaScript with real-time features
    └── templates/
        └── index.html     # Bootstrap-based HTML template
```

## 🎯 Usage

### Web Interface
1. Navigate to `http://localhost:5000` after starting the application
2. Use the **Settings** tab to configure your Discord token
3. **Dashboard**: Monitor system status and quick actions
4. **Auto Poster**: Manage automated posting to multiple channels
5. **Server Cloner**: Clone entire Discord servers with advanced options
6. **Logs**: View real-time application logs

### Server Cloning
1. Go to the **Server Cloner** tab
2. Enter the source server ID (server to copy from)
3. Enter the target server ID (server to clone to)
4. Configure cloning options (messages, clear target, etc.)
5. Click **Start Cloning** and monitor progress

### Auto Posting
1. Go to the **Auto Poster** tab
2. Add channels with custom messages and intervals
3. Configure webhook settings if desired
4. Use the **Dashboard** to start/stop auto posting

## ⚙️ Configuration

The `config.json` file contains all settings:

```json
{
  "token": "your_discord_token",
  "webhook_url": "optional_webhook_url",
  "auto_post_channels": [],
  "copy_settings": {
    "categories": true,
    "channels": true,
    "roles": true,
    "emojis": true
  },
  "message_limit": 100,
  "clear_guild": true
}
```

## 🔧 Technical Details

- **Backend**: Python Flask with asyncio Discord API integration
- **Frontend**: Bootstrap 5 with custom Discord theming
- **Real-time**: WebSocket-like polling for live updates
- **Responsive**: Mobile-friendly design that works on all devices
- **Modern**: ES6+ JavaScript with async/await patterns

## 📝 Requirements

- Python 3.7+
- Discord bot token with appropriate permissions
- Modern web browser (Chrome, Firefox, Safari, Edge)

## ⚠️ Important Notes

- This tool requires a Discord bot token
- Ensure your bot has necessary permissions in both source and target servers
- Use responsibly and follow Discord's Terms of Service
- Large servers may take time to clone completely

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## 📄 License

This project is for educational purposes. Please respect Discord's Terms of Service and API rate limits.
