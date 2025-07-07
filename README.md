# Discord Server Cloner - Web UI

Discord Server Cloner dengan antarmuka web yang modern dan mudah digunakan. Aplikasi ini memungkinkan Anda untuk mengkloning server Discord dengan berbagai opsi kustomisasi.

## ⚠️ TOKEN SUPPORT - HYBRID SOLUTION

**🎉 GOOD NEWS: Aplikasi ini sekarang mendukung KEDUA jenis token!**

### Yang Didukung:
- ✅ **Bot Token**: Discord.js backend (Recommended & ToS compliant)
- ✅ **User Token**: Python backend (Self-bot, melanggar ToS)

### Auto-Detection:
Aplikasi secara otomatis mendeteksi jenis token dan menggunakan backend yang sesuai:
- 🤖 **Bot Token** → Node.js + Discord.js
- 👤 **User Token** → Python + aiohttp

### ⚠️ WARNING untuk User Token:
- Melanggar Discord Terms of Service
- Berisiko akun di-ban permanen
- Discord aktif mendeteksi self-bot
- **GUNAKAN DENGAN SANGAT HATI-HATI!**

Lihat [HYBRID_GUIDE.md](./HYBRID_GUIDE.md) untuk dokumentasi lengkap.

## Fitur

✨ **Antarmuka Web Modern**
- UI yang responsif dan mudah digunakan
- Real-time progress monitoring
- Live logs dan statistik
- Dark/Light theme support

🔧 **Opsi Kloning Lengkap**
- Clone server info (nama dan icon)
- Clone roles dan permissions
- Clone categories
- Clone text dan voice channels
- Clone messages (dengan limit)

📊 **Monitoring Real-time**
- Progress bar dengan persentase
- Statistik live (roles, channels, messages)
- Log aktivitas real-time
- Error handling dan reporting

🚀 **Teknologi Modern**
- Node.js + Express
- Socket.IO untuk real-time updates
- Bootstrap 5 untuk UI
- Discord.js v14

## Instalasi

### Prasyarat
- Node.js 16+ 
- NPM atau Yarn
- Discord Bot Token dengan permission Administrator

### Langkah Instalasi

1. **Clone repository**
   ```bash
   git clone <repository-url>
   cd DiscordAdvanceTools
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env sesuai kebutuhan
   ```

4. **Jalankan aplikasi**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Akses aplikasi**
   Buka browser dan kunjungi `http://localhost:3000`

## Cara Penggunaan

### 1. Setup Discord Bot

1. Pergi ke [Discord Developer Portal](https://discord.com/developers/applications)
2. Buat aplikasi baru dan bot
3. Copy bot token
4. Invite bot ke kedua server dengan permission Administrator

### 2. Mendapatkan Server ID

1. Aktifkan Developer Mode di Discord settings
2. Klik kanan pada nama server
3. Pilih "Copy ID"
4. Paste ID di field yang sesuai

### 3. Mulai Cloning

1. Masukkan bot token
2. Masukkan Source Server ID (server yang akan dikloning)
3. Masukkan Target Server ID (server tujuan - harus kosong)
4. Pilih opsi cloning yang diinginkan
5. Klik "Start Cloning"
6. Monitor progress secara real-time

## Opsi Cloning

| Opsi | Deskripsi |
|------|-----------|
| **Server Info** | Clone nama server dan icon |
| **Roles** | Clone semua roles dan permissions |
| **Categories** | Clone kategori channel |
| **Channels** | Clone text dan voice channels |
| **Messages** | Clone pesan recent (max 100 per channel) |

## API Endpoints

### POST /clone
Memulai proses cloning

**Body:**
```json
{
  "token": "bot-token",
  "sourceServerId": "source-server-id",
  "targetServerId": "target-server-id",
  "options": {
    "cloneServerInfo": true,
    "cloneRoles": true,
    "cloneCategories": true,
    "cloneChannels": true,
    "cloneMessages": false,
    "messageLimit": 50
  }
}
```

## Socket Events

### Client → Server
- `stop-cloning`: Menghentikan proses cloning

### Server → Client
- `cloning-progress`: Update progress cloning
- `cloning-log`: Log aktivitas
- `cloning-error`: Error messages
- `cloning-complete`: Cloning selesai
- `cloning-stopped`: Cloning dihentikan

## Struktur Project

```
DiscordAdvanceTools/
├── index.js              # Main server file
├── package.json          # Dependencies
├── .env.example          # Environment template
├── README.md             # Documentation
├── views/
│   └── index.ejs         # Main web interface
└── public/               # Static assets
```

## Rate Limiting

Aplikasi ini menggunakan delay untuk menghindari Discord rate limiting:
- Roles: 1 detik per role
- Categories: 1 detik per category  
- Channels: 1 detik per channel
- Messages: 1 detik per message

## Troubleshooting

### Error: "Could not access one or both servers"
- Pastikan bot token valid
- Pastikan bot ada di kedua server
- Pastikan bot memiliki permission Administrator

### Error: "Same server"
- Source dan target server ID tidak boleh sama

### Rate Limiting
- Aplikasi akan otomatis handle rate limiting
- Proses mungkin lambat untuk server besar

### Bot Permissions
Bot memerlukan permissions berikut:
- Administrator (recommended)
- Manage Roles
- Manage Channels
- Manage Server
- Send Messages
- Read Message History

## ⚠️ PENTING: Token Support

**Aplikasi ini HANYA mendukung BOT TOKEN, TIDAK mendukung user token.**

### Mengapa User Token Tidak Didukung?
- Discord.js v14+ tidak mendukung user token (self-bot)
- Melanggar Discord Terms of Service
- Berisiko akun di-ban permanen
- Library Discord.js secara eksplisit memblokir user token

### Yang Didukung:
- ✅ **Bot Token**: Token resmi dari Discord Developer Portal
- ❌ **User Token**: Token dari akun user (self-bot)

Lihat [USER_TOKEN_INFO.md](./USER_TOKEN_INFO.md) untuk penjelasan lengkap.

## Kontribusi

Kontribusi selalu diterima! Silakan:
1. Fork repository
2. Buat feature branch
3. Commit changes
4. Push ke branch
5. Buat Pull Request

## Lisensi

MIT License - lihat file LICENSE untuk detail.

## Disclaimer

⚠️ **Peringatan:**
- Tool ini hanya untuk tujuan edukasi dan backup
- Pastikan Anda memiliki permission untuk mengkloning server
- Respect Discord Terms of Service
- Gunakan dengan bijak dan bertanggung jawab

## Support

Jika mengalami masalah atau memiliki pertanyaan:
1. Cek dokumentasi di atas
2. Buat issue di GitHub
3. Pastikan menyertakan log error

---

Made with ❤️ for Discord community
