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
        `🚀 Welcome to the official *NASTA Coin ($NASTA)* Ecosystem on TON Blockchain!\n\n` +
        `🌟 *What you can do in NASTA Coin:*\n` +
        `🪙 *Tap Arena:* Tap the coin to mine $NASTA in-game tokens\n` +
        `🎰 *Lucky Arcade:* Spin the Fortune Wheel for daily boosters & jackpots\n` +
        `⚡ *Hardware Lab:* Upgrade Multi-Tap, Energy Capacity & Auto-Mining Bot\n` +
        `⛏️ *Cloud Mining:* Activate 24/7 passive yield on TON infrastructure\n` +
        `👥 *Frens Tribe:* Invite friends to build your mining guild\n` +
        `💎 *TON Wallet:* Connect Tonkeeper or Telegram @wallet for Season 1 Airdrop\n\n` +
        `👇 Tap the button below to launch the Mini App!`;

      const options = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🪙 Launch NASTA Coin App',
                web_app: { url: WEB_APP_URL }
              }
            ],
            [
              { text: '📖 Game Guide', callback_data: 'cmd_help' },
              { text: '🗺️ Roadmap', callback_data: 'cmd_roadmap' }
            ],
            [
              { text: '📜 Fair Play Rules', callback_data: 'cmd_rules' }
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
      sendHelpMessage(msg.chat.id);
    });

    // /roadmap command
    bot.onText(/\/roadmap/, (msg) => {
      sendRoadmapMessage(msg.chat.id);
    });

    // /rules command
    bot.onText(/\/rules/, (msg) => {
      sendRulesMessage(msg.chat.id);
    });

    // /stats command
    bot.onText(/\/stats/, (msg) => {
      const chatId = msg.chat.id;
      const statsText = `📊 *NASTA Coin Ecosystem Status:*\n\n` +
        `• Ticker: *$NASTA*\n` +
        `• Network: *The Open Network (TON)*\n` +
        `• Phase: *Season 1 Community Fair Distribution*\n` +
        `• Core Features: *Tap Arena, Lucky Wheel, Hardware Lab, Cloud Mining*\n` +
        `• Contract: *Verified TON Jetton Smart Contract (TGE Phase)*\n\n` +
        `Stay active daily to maximize your Season 1 airdrop points!`;
      
      bot.sendMessage(chatId, statsText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🪙 Open Mini App', web_app: { url: WEB_APP_URL } }]
          ]
        }
      });
    });

    // Handle Inline Callbacks
    bot.on('callback_query', (query) => {
      const chatId = query.message?.chat?.id;
      const data = query.data;
      bot.answerCallbackQuery(query.id).catch(() => {});

      if (!chatId) return;
      if (data === 'cmd_help') sendHelpMessage(chatId);
      else if (data === 'cmd_roadmap') sendRoadmapMessage(chatId);
      else if (data === 'cmd_rules') sendRulesMessage(chatId);
    });

    function sendHelpMessage(chatId) {
      const helpText = `📖 *NASTA Coin — Player Guide & FAQs*\n\n` +
        `*1. How to Mine $NASTA Points?*\n` +
        `Open the Mini App and tap the central coin in the Tap Arena. Each tap consumes 1 energy and gives points.\n\n` +
        `*2. Lucky Arcade (Fortune Wheel)*\n` +
        `Spin the wheel every 12 hours for instant bonuses, energy refills, or 2X multipliers.\n\n` +
        `*3. Hardware Upgrades*\n` +
        `Spend mined $NASTA to level up Multi-Tap, Max Energy, and Auto-Mining Bot.\n\n` +
        `*4. Daily Streak*\n` +
        `Check in every 24 hours to claim escalating streak bonuses from Day 1 to Day 7.\n\n` +
        `*5. TON Wallet Linking*\n` +
        `Link your Tonkeeper or Telegram @wallet to prepare your address for the Season 1 Airdrop.`;

      bot.sendMessage(chatId, helpText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🪙 Play Now', web_app: { url: WEB_APP_URL } }]
          ]
        }
      });
    }

    function sendRoadmapMessage(chatId) {
      const roadmapText = `🗺️ *NASTA Coin Project Roadmap:*\n\n` +
        `*Phase 1: Genesis & Community Mining (Current)*\n` +
        `• Telegram Mini App & Tap Engine Launch\n` +
        `• Lucky Fortune Wheel Mini-Game\n` +
        `• Hardware Lab Upgrades & Cloud Mining Yield\n` +
        `• TON Connect Multi-Wallet Integration\n\n` +
        `*Phase 2: Ecosystem Expansion*\n` +
        `• Guilds & Community Mining Tournaments\n` +
        `• On-chain Snapshot for Active Pioneers\n` +
        `• Security Audit & Smart Contract Verification\n\n` +
        `*Phase 3: TGE & DEX Listing*\n` +
        `• Official $NASTA Token Minting on TON\n` +
        `• Community Airdrop Distribution\n` +
        `• DeDust & STON.fi DEX Liquidity Pool Launch`;

      bot.sendMessage(chatId, roadmapText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🪙 Launch App', web_app: { url: WEB_APP_URL } }]
          ]
        }
      });
    }

    function sendRulesMessage(chatId) {
      const rulesText = `📜 *NASTA Fair Play & Community Rules:*\n\n` +
        `1. One account per Telegram user.\n` +
        `2. Emulators, click-bots, and automated scripts are strictly prohibited and flagged by our anti-cheat heuristics.\n` +
        `3. Only legitimate, active community members will be eligible for the Season 1 Airdrop.\n` +
        `4. Respect community guidelines and enjoy the game!`;

      bot.sendMessage(chatId, rulesText, { parse_mode: 'Markdown' });
    }

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
