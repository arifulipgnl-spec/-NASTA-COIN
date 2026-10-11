const https = require('https');

module.exports = async (req, res) => {
  // Allow health check / verification on GET
  if (req.method !== 'POST') {
    return res.status(200).json({
      status: 'active',
      app: 'NASTA Coin Telegram Webhook',
      time: new Date().toISOString()
    });
  }

  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error('BOT_TOKEN environment variable is missing.');
    return res.status(500).json({ error: 'BOT_TOKEN is not configured in Vercel' });
  }

  const update = req.body;
  if (!update || !update.message) {
    return res.status(200).json({ ok: true, note: 'No message to handle' });
  }

  const message = update.message;
  const chatId = message.chat.id;
  const text = message.text || '';
  const firstName = message.from?.first_name || 'Pioneer';

  // Determine Web App URL dynamically from host or env
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const webAppUrl = process.env.WEB_APP_URL || `${proto}://${host}`;

  // Handle commands
  let replyText = '';
  let replyButtons = [];

  if (text.startsWith('/start')) {
    replyText = `👋 Hello, *${firstName}*!\n\n` +
      `🚀 Welcome to the official *NASTA Coin ($NASTA)* Ecosystem on TON Blockchain!\n\n` +
      `🌟 *Core Features:*\n` +
      `🪙 *Tap Arena:* Mine in-game $NASTA points\n` +
      `🎰 *Lucky Arcade:* Spin the Fortune Wheel for daily boosts\n` +
      `⚡ *Hardware Lab:* Upgrade Multi-Tap, Capacity & Auto-Mining Bot\n` +
      `⛏️ *Cloud Mining:* 24/7 passive yield on TON\n` +
      `💎 *TON Wallet:* Connect Tonkeeper & prepare for Season 1 Airdrop\n\n` +
      `👇 Tap below to launch the Mini App!`;

    replyButtons = [
      [{ text: '🪙 Launch NASTA Coin App', web_app: { url: webAppUrl } }],
      [
        { text: '📖 Game Guide', callback_data: 'cmd_help' },
        { text: '🗺️ Roadmap', callback_data: 'cmd_roadmap' }
      ]
    ];
  } else if (text.startsWith('/help')) {
    replyText = `📖 *NASTA Coin — Quick Guide:*\n\n` +
      `• *Tap Arena:* Tap to mine points. 1 tap = 1 energy.\n` +
      `• *Lucky Wheel:* Free spins daily in the Arcade.\n` +
      `• *Hardware Lab:* Upgrade Multi-Tap & Energy capacity with earned points.\n` +
      `• *Wallet:* Link Tonkeeper to register your airdrop address.`;
    replyButtons = [
      [{ text: '🪙 Launch App', web_app: { url: webAppUrl } }]
    ];
  } else if (text.startsWith('/roadmap')) {
    replyText = `🗺️ *NASTA Coin Roadmap:*\n\n` +
      `• *Phase 1:* Tap Arena & Fortune Wheel Arcade (Active)\n` +
      `• *Phase 2:* Community Airdrop Snapshot & Guild Tournaments\n` +
      `• *Phase 3:* $NASTA Token Minting & DEX Liquidity on TON`;
    replyButtons = [
      [{ text: '🪙 Launch App', web_app: { url: webAppUrl } }]
    ];
  } else if (text.startsWith('/stats')) {
    replyText = `📊 *NASTA Coin Status:*\n\n` +
      `• Token: *$NASTA*\n` +
      `• Network: *The Open Network (TON)*\n` +
      `• Phase: *Season 1 Community Airdrop*`;
    replyButtons = [
      [{ text: '🪙 Launch App', web_app: { url: webAppUrl } }]
    ];
  } else {
    replyText = `👋 Hello! Tap below to launch NASTA Coin or send /help for instructions.`;
    replyButtons = [
      [{ text: '🪙 Launch NASTA Coin App', web_app: { url: webAppUrl } }]
    ];
  }

  const payload = JSON.stringify({
    chat_id: chatId,
    text: replyText,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: replyButtons
    }
  });

    const telegramReq = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (telegramRes) => {
        let data = '';
        telegramRes.on('data', chunk => { data += chunk; });
        telegramRes.on('end', () => {
          res.status(200).json({ ok: true });
        });
      }
    );

    telegramReq.on('error', (err) => {
      console.error('Telegram API error:', err);
      res.status(200).json({ ok: false, error: err.message });
    });

    telegramReq.write(payload);
    telegramReq.end();
};

