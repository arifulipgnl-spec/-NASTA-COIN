require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Web App root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'NASTA Coin Telegram Mini App',
    token: '$NASTA',
    blockchain: 'TON'
  });
});

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 NASTA Coin Web Server running on port ${PORT}`);
  console.log(`🌐 Local Web App URL: http://localhost:${PORT}`);
  console.log(`===================================================`);
});

// --- Telegram Bot Logic ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || `http://localhost:${PORT}`;

if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN_FROM_BOTFATHER') {
  try {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(BOT_TOKEN, { polling: true });

    console.log('🤖 Telegram Bot is connected and listening for messages...');

    // /start command
    bot.onText(/\/start(.*)/, (msg, match) => {
      const chatId = msg.chat.id;
      const firstName = msg.from.first_name || 'Pioneer';
      const refCode = match[1] ? match[1].trim() : '';

      let welcomeText = `👋 Hello, *${firstName}*!\n\n` +
        `🚀 Welcome to *NASTA Coin ($NASTA)* Ecosystem on TON Blockchain!\n\n` +
        `🪙 *Tap to Earn:* Mine $NASTA tokens by tapping the coin.\n` +
        `⚡ *Cloud Mining:* Activate 24h passive mining on TON.\n` +
        `👥 *Invite Frens:* Earn up to +25,000 $NASTA per referral.\n` +
        `💎 *TON Wallet:* Connect Tonkeeper & prepare for token launch!\n\n` +
        `👇 Tap the button below to start playing now!`;

      const options = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🪙 Play NASTA Coin ($NASTA)',
                web_app: { url: WEB_APP_URL }
              }
            ],
            [
              { text: '📢 Official Channel', url: 'https://t.me/NASTACoin' },
              { text: '💬 Community Group', url: 'https://t.me/NASTACommunity' }
            ],
            [
              { text: '🌐 Official Website', url: 'https://nastacoin.org' }
            ]
          ]
        }
      };

      const introVideoPath = path.join(__dirname, 'public', 'assets', 'intro.mp4');
      const coinImagePath = path.join(__dirname, 'public', 'assets', 'coin.png');
      const mediaOptions = {
        caption: welcomeText,
        parse_mode: 'Markdown',
        reply_markup: options.reply_markup
      };

      if (require('fs').existsSync(introVideoPath)) {
        bot.sendVideo(chatId, introVideoPath, mediaOptions).catch(() => {
          if (require('fs').existsSync(coinImagePath)) {
            bot.sendPhoto(chatId, coinImagePath, mediaOptions).catch(() => {
              bot.sendMessage(chatId, welcomeText, options);
            });
          } else {
            bot.sendMessage(chatId, welcomeText, options);
          }
        });
      } else if (require('fs').existsSync(coinImagePath)) {
        bot.sendPhoto(chatId, coinImagePath, mediaOptions).catch(() => {
          bot.sendMessage(chatId, welcomeText, options);
        });
      } else {
        bot.sendMessage(chatId, welcomeText, options);
      }
    });

    // /help command
    bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      const helpText = `📖 *NASTA Coin Bot Commands:*\n\n` +
        `/start - Launch NASTA Coin Mini App\n` +
        `/help - Show this guide\n` +
        `/stats - Check your miner stats\n\n` +
        `For support, contact @NASTASupport.`;
      
      bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    // /stats command
    bot.onText(/\/stats/, (msg) => {
      const chatId = msg.chat.id;
      const statsText = `📊 *NASTA Network Stats:*\n\n` +
        `• Token: *$NASTA*\n` +
        `• Blockchain: *TON (The Open Network)*\n` +
        `• Total Holders: *1,200,000+*\n` +
        `• Status: *Airdrop & Mining Phase*`;
      
      bot.sendMessage(chatId, statsText, { parse_mode: 'Markdown' });
    });

    // Handle bot errors gracefully
    bot.on('polling_error', (error) => {
      console.warn('Telegram polling warning:', error.message);
    });

  } catch (err) {
    console.error('Failed to initialize Telegram Bot:', err.message);
  }
} else {
  console.log(`ℹ️ [NOTE]: BOT_TOKEN is not set in .env yet.`);
  console.log(`👉 You can still open the web app at http://localhost:${PORT}`);
  console.log(`👉 To connect the Telegram Bot:`);
  console.log(`   1. Open Telegram and search @BotFather`);
  console.log(`   2. Send /newbot to create a bot and copy the API Token`);
  console.log(`   3. Create a .env file with: BOT_TOKEN=your_token_here`);
  console.log(`   4. Restart this server.`);
}
