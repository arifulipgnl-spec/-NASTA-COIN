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

  // Handle /start command
  if (text.startsWith('/start')) {
    const welcomeText = `👋 Hello, *${firstName}*!\n\n` +
      `🚀 Welcome to *NASTA Coin ($NASTA)* Ecosystem on TON Blockchain!\n\n` +
      `🪙 *Tap to Earn:* Mine $NASTA tokens by tapping the coin.\n` +
      `⚡ *Cloud Mining:* Activate 24h passive mining on TON.\n` +
      `👥 *Invite Frens:* Earn up to +25,000 $NASTA per referral.\n` +
      `💎 *TON Wallet:* Connect Tonkeeper & prepare for token launch!\n\n` +
      `👇 Tap the button below to start playing now!`;

    const payload = JSON.stringify({
      chat_id: chatId,
      text: welcomeText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🪙 Play NASTA Coin ($NASTA)',
              web_app: { url: webAppUrl }
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
    return;
  }

  // Fallback response for other messages
  return res.status(200).json({ ok: true });
};
