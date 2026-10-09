/**
 * NASTA Coin - Telegram Mini App Game Engine & WebApp Controller
 * Official TON Blockchain Tap-to-Earn & Cloud Mining
 */

(function () {
  'use strict';

  // --- Telegram WebApp SDK Initialization ---
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try {
      tg.expand();
      tg.ready();
      if (tg.setHeaderColor) tg.setHeaderColor('#070A12');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#070A12');
    } catch (e) {
      console.warn('Telegram WebApp SDK setup notice:', e);
    }
  }

  // --- Audio / Haptic Feedback Helper ---
  let hapticsEnabled = true;
  function triggerHaptic(type = 'impact', style = 'medium') {
    if (!hapticsEnabled) return;
    if (tg?.HapticFeedback) {
      if (type === 'impact') {
        tg.HapticFeedback.impactOccurred(style);
      } else if (type === 'notification') {
        tg.HapticFeedback.notificationOccurred(style);
      } else if (type === 'selection') {
        tg.HapticFeedback.selectionChanged();
      }
    } else if (navigator.vibrate) {
      navigator.vibrate(style === 'heavy' ? 25 : 12);
    }
  }

  // --- Treasury Constants ---
  const OWNER_TONKEEPER_ADDRESS = "UQCEkkk4CCNo48fudDqX12UDxnSehnEHd-UFWzP5zH9w-hIT";
  const NASTA_USD_PRICE = 0.024;
  const TON_USD_PRICE = 5.50;

  // --- Storage Key ---
  const STORAGE_KEY = 'nasta_coin_user_state_v1';

  // --- Default State ---
  const defaultState = {
    username: tg?.initDataUnsafe?.user?.username ? '@' + tg.initDataUnsafe.user.username : (tg?.initDataUnsafe?.user?.first_name || '@nasta_pioneer'),
    balance: 0.0,
    energy: 30,
    maxEnergy: 30,
    cooldownEndTime: null, // Timestamp (ms) when 30-min cooldown ends
    lastEnergyTick: Date.now(),
    tapMultiplier: 1,
    turboActive: false,
    miningSpeedPerHour: 0,
    normalMinersCount: 0,
    highMinersCount: 0,
    ultraMinersCount: 0,
    totalMined: 0.0,
    currentStreak: 0,
    lastStreakClaimTime: 0,
    connectedTonWallet: null,
    tonBalance: 0.0,
    usdtBalance: 0.0,
    totalTaps: 0,
    frensCount: 0,
    frensEarned: 0.0,
    referralCode: 'NASTA-' + Math.floor(1000 + Math.random() * 9000) + 'X',
    usedTxHashes: [],
    completedTasks: []
  };

  // Load persistent state
  let state = { ...defaultState };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      state = { ...defaultState, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Error loading saved state:', e);
  }

  // Ensure 30 taps pool & sync active cooldown
  state.maxEnergy = 30;
  if (typeof state.energy !== 'number' || isNaN(state.energy)) {
    state.energy = 30;
  }
  const initNow = Date.now();
  if (state.cooldownEndTime) {
    if (initNow >= state.cooldownEndTime) {
      // Cooldown completed while user was away
      state.cooldownEndTime = null;
      state.energy = 30;
    } else {
      // Cooldown still active: 30 taps accumulate over 30 mins (1 per 60s)
      const totalCdMs = 30 * 60 * 1000;
      const remainingMs = state.cooldownEndTime - initNow;
      const elapsedMs = Math.max(0, totalCdMs - remainingMs);
      state.energy = Math.min(30, Math.floor(elapsedMs / 60000));
    }
  } else {
    // If energy was clamped to 10 in previous version and not in cooldown, top up or clamp between 0 and 30
    if (state.energy < 0) state.energy = 0;
    if (state.energy > 30) state.energy = 30;
  }

  let cloudSaveTimeout = null;
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}

    // Cloud sync with Telegram CloudStorage across all user devices (Phone, PC, Web)
    if (tg?.CloudStorage) {
      if (cloudSaveTimeout) clearTimeout(cloudSaveTimeout);
      cloudSaveTimeout = setTimeout(() => {
        try {
          const serialized = JSON.stringify(state);
          tg.CloudStorage.setItem(STORAGE_KEY, serialized, (err, stored) => {
            if (err) console.warn('Telegram CloudStorage setItem notice:', err);
          });
        } catch (e) {}
      }, 500);
    }
  }

  function syncCloudStorage() {
    if (!tg?.CloudStorage) return;
    try {
      tg.CloudStorage.getItem(STORAGE_KEY, (err, value) => {
        if (!err && value) {
          try {
            const cloudState = JSON.parse(value);
            if (cloudState && typeof cloudState.balance === 'number') {
              let updated = false;

              // Adopt higher balance so user never loses earned coins across devices
              if (cloudState.balance > state.balance) {
                state.balance = cloudState.balance;
                updated = true;
              } else if (state.balance > cloudState.balance) {
                saveState();
              }

              if ((cloudState.miningSpeedPerHour || 0) > (state.miningSpeedPerHour || 0)) {
                state.miningSpeedPerHour = cloudState.miningSpeedPerHour;
                updated = true;
              }
              if ((cloudState.currentStreak || 0) > (state.currentStreak || 0)) {
                state.currentStreak = cloudState.currentStreak;
                state.lastStreakClaimTime = cloudState.lastStreakClaimTime;
                updated = true;
              }
              if (Array.isArray(cloudState.completedTasks) && cloudState.completedTasks.length > state.completedTasks.length) {
                state.completedTasks = Array.from(new Set([...state.completedTasks, ...cloudState.completedTasks]));
                updated = true;
              }
              if (cloudState.connectedTonWallet && !state.connectedTonWallet) {
                state.connectedTonWallet = cloudState.connectedTonWallet;
                updated = true;
              }

              if (updated) {
                try {
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                } catch(e) {}
                updateUI();
                if (typeof renderTasks === 'function') renderTasks();
              }
            }
          } catch (e) {
            console.warn('Telegram CloudStorage parse notice:', e);
          }
        } else if (!value && state.balance > 0) {
          // First time opening with local progress, push to cloud
          saveState();
        }
      });
    } catch (e) {
      console.warn('Telegram CloudStorage init notice:', e);
    }
  }

  // --- Task Definitions ---
  const tasksConfig = [
    {
      id: 'task_ad',
      title: 'Watch Rewarded Ad (+5 $NASTA)',
      desc: 'Watch short video sponsor to earn 5 coins each time. Unlimited!',
      reward: 5,
      icon: '📺',
      action: 'ad'
    },
    {
      id: 'task_streak',
      title: 'Daily Check-in (10 $NASTA)',
      desc: 'Claim your consecutive daily reward every 24 hours.',
      reward: 10,
      icon: '🔥',
      action: 'streak'
    },
    {
      id: 'task_tg_channel',
      title: 'Join Official NASTA Telegram',
      desc: 'Subscribe to @NASTACoin channel for official news.',
      reward: 500,
      icon: '📢',
      link: 'https://t.me/NASTACoin',
      action: 'link'
    },
    {
      id: 'task_youtube',
      title: 'Subscribe to NASTA YouTube',
      desc: 'Watch & subscribe to the NASTA official YouTube channel.',
      reward: 500,
      icon: '▶️',
      link: 'https://youtube.com/@NASTACoin',
      action: 'link'
    },
    {
      id: 'task_twitter',
      title: 'Follow NASTA on X (Twitter)',
      desc: 'Follow @NASTA_TON on X and turn on notification bell.',
      reward: 500,
      icon: '🐦',
      link: 'https://x.com/NASTA_TON',
      action: 'link'
    },
    {
      id: 'task_invite_frens',
      title: 'Invite 3 Frens (+1,000 $NASTA)',
      desc: 'Share your referral link with 3 friends to claim extra bonus.',
      reward: 1000,
      icon: '👥',
      action: 'frens'
    },
    {
      id: 'task_ton_wallet',
      title: 'Connect TON Crypto Wallet',
      desc: 'Link your Tonkeeper or Telegram @wallet to prepare for airdrop.',
      reward: 1000,
      icon: '💎',
      action: 'wallet'
    },
    {
      id: 'task_multisig',
      title: 'Verify Multi-Sig Security Vault',
      desc: 'Enable 2-of-3 multi-signature verification protection.',
      reward: 500,
      icon: '🛡️',
      action: 'multisig'
    }
  ];

  // 7 Days Streak Rewards
  const streakRewards = [
    { day: 1, reward: 10 },
    { day: 2, reward: 50 },
    { day: 3, reward: 150 },
    { day: 4, reward: 400 },
    { day: 5, reward: 1000 },
    { day: 6, reward: 2500 },
    { day: 7, reward: 10000 }
  ];

  // --- DOM Elements ---
  const balanceDisplay = document.getElementById('balanceDisplay');
  const balanceUsdDisplay = document.getElementById('balanceUsdDisplay');
  const energyText = document.getElementById('energyText');
  const maxEnergyText = document.getElementById('maxEnergyText');
  const energyFill = document.getElementById('energyFill');
  const usernameDisplay = document.getElementById('usernameDisplay');
  const userAvatar = document.getElementById('userAvatar');
  const headerLeagueBadge = document.getElementById('headerLeagueBadge');
  const currentLeagueName = document.getElementById('currentLeagueName');
  const leagueCurrentPoints = document.getElementById('leagueCurrentPoints');
  const leagueMaxPoints = document.getElementById('leagueMaxPoints');
  const leagueProgressFill = document.getElementById('leagueProgressFill');
  const tapArena = document.getElementById('tapArena');
  const coinWrapper = document.getElementById('coinWrapper');
  const nastaCoin = document.getElementById('nastaCoin');
  const turboBoostBtn = document.getElementById('turboBoostBtn');
  const coinCooldownOverlay = document.getElementById('coinCooldownOverlay');
  const coinCdTimer = document.getElementById('coinCdTimer');
  const cooldownBadge = document.getElementById('cooldownBadge');
  const cooldownTimerText = document.getElementById('cooldownTimerText');
  
  // Mining DOM
  const turbineBlades = document.getElementById('turbineBlades');
  const miningSpeedDisplay = document.getElementById('miningSpeedDisplay');
  const totalMinedDisplay = document.getElementById('totalMinedDisplay');
  const claimMiningBtn = document.getElementById('claimMiningBtn');
  const normalOwnedCount = document.getElementById('normalOwnedCount');
  const highOwnedCount = document.getElementById('highOwnedCount');
  const ultraOwnedCount = document.getElementById('ultraOwnedCount');
  
  // Wallet DOM
  const walletNastaBalance = document.getElementById('walletNastaBalance');
  const walletNastaUsd = document.getElementById('walletNastaUsd');
  const walletTonBalance = document.getElementById('walletTonBalance');
  const walletUsdtBalance = document.getElementById('walletUsdtBalance');
  const walletStatusTitle = document.getElementById('walletStatusTitle');
  const walletStatusDesc = document.getElementById('walletStatusDesc');
  const connectWalletBtn = document.getElementById('connectWalletBtn');
  const userReceiveAddress = document.getElementById('userReceiveAddress');

  // Modals
  const tonkeeperModal = document.getElementById('tonkeeperModal');
  const streakModal = document.getElementById('streakModal');
  const receiveModal = document.getElementById('receiveModal');
  const swapModal = document.getElementById('swapModal');
  const notifModal = document.getElementById('notifModal');
  const toastPopup = document.getElementById('toastPopup');
  const toastMessage = document.getElementById('toastMessage');

  // Helper: Format Number
  function formatNumber(num) {
    return Math.floor(num).toLocaleString('en-US');
  }

  // Helper: Show Toast
  function showToast(msg, icon = '✨') {
    if (!toastPopup) return;
    toastMessage.textContent = msg;
    document.getElementById('toastIcon').textContent = icon;
    toastPopup.classList.add('show');
    setTimeout(() => {
      toastPopup.classList.remove('show');
    }, 2400);
  }

  // --- League Progression System ---
  const leagues = [
    { name: 'Bronze Pioneer', max: 5000 },
    { name: 'Silver Pioneer', max: 25000 },
    { name: 'Gold Pioneer', max: 100000 },
    { name: 'Platinum Elite', max: 500000 },
    { name: 'Diamond Legend', max: 2000000 },
    { name: 'Master Whale', max: 10000000 }
  ];

  function getLeague(balance) {
    for (let l of leagues) {
      if (balance < l.max) return l;
    }
    return leagues[leagues.length - 1];
  }

  // --- UI Update Renderer ---
  function updateUI() {
    // 1. Balance
    balanceDisplay.textContent = formatNumber(state.balance);
    const usd = (state.balance * NASTA_USD_PRICE).toFixed(2);
    balanceUsdDisplay.textContent = `≈ $${usd} USD`;

    // 2. League
    const currentLg = getLeague(state.balance);
    headerLeagueBadge.textContent = currentLg.name;
    currentLeagueName.textContent = currentLg.name;
    leagueCurrentPoints.textContent = formatNumber(state.balance);
    leagueMaxPoints.textContent = formatNumber(currentLg.max);
    const pct = Math.min(100, Math.max(5, (state.balance / currentLg.max) * 100));
    leagueProgressFill.style.width = pct + '%';

    // 3. Energy & Cooldown Status
    energyText.textContent = state.energy;
    maxEnergyText.textContent = state.maxEnergy;
    const energyPct = Math.min(100, Math.max(0, (state.energy / state.maxEnergy) * 100));
    energyFill.style.width = energyPct + '%';

    const currentEpoch = Date.now();
    const isCdActive = Boolean(state.cooldownEndTime && currentEpoch < state.cooldownEndTime);

    if (isCdActive) {
      const remainingSec = Math.max(0, Math.ceil((state.cooldownEndTime - currentEpoch) / 1000));
      const mm = Math.floor(remainingSec / 60);
      const ss = remainingSec % 60;
      const formattedTime = `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`;

      if (coinCooldownOverlay) coinCooldownOverlay.style.display = 'flex';
      if (coinCdTimer) coinCdTimer.textContent = formattedTime;
      if (cooldownBadge) cooldownBadge.style.display = 'inline-flex';
      if (cooldownTimerText) cooldownTimerText.textContent = formattedTime;
      if (coinWrapper) coinWrapper.classList.add('cooldown');
    } else {
      if (coinCooldownOverlay) coinCooldownOverlay.style.display = 'none';
      if (cooldownBadge) cooldownBadge.style.display = 'none';
      if (coinWrapper) coinWrapper.classList.remove('cooldown');
    }

    // 4. Mining
    miningSpeedDisplay.textContent = `+${state.miningSpeedPerHour} / hr`;
    totalMinedDisplay.textContent = `${formatNumber(state.totalMined)} $NASTA`;
    normalOwnedCount.textContent = state.normalMinersCount;
    highOwnedCount.textContent = state.highMinersCount;
    ultraOwnedCount.textContent = state.ultraMinersCount;

    if (state.miningSpeedPerHour > 0) {
      turbineBlades.classList.add('fast');
    } else {
      turbineBlades.classList.remove('fast');
    }

    // 5. Wallet
    walletNastaBalance.textContent = formatNumber(state.balance);
    walletNastaUsd.textContent = `≈ $${usd}`;
    walletTonBalance.textContent = state.tonBalance.toFixed(2);
    walletUsdtBalance.textContent = state.usdtBalance.toFixed(2);

    if (state.connectedTonWallet) {
      walletStatusTitle.textContent = 'TON Wallet Connected ✅';
      walletStatusDesc.textContent = `${state.connectedTonWallet.substring(0, 8)}...${state.connectedTonWallet.substring(state.connectedTonWallet.length - 6)}`;
      connectWalletBtn.textContent = 'Wallet Connected';
      connectWalletBtn.classList.remove('btn-primary');
      connectWalletBtn.classList.add('btn-outline');
      userReceiveAddress.textContent = state.connectedTonWallet;
    }

    // 6. User Meta
    usernameDisplay.textContent = state.username;
    if (!userAvatar.querySelector('img')) {
      userAvatar.textContent = state.username.replace('@', '').charAt(0).toUpperCase() || 'N';
    }

    // 7. Referrals
    const refLink = `https://t.me/NASTA_Coin_bot?start=ref_${state.referralCode}`;
    const refInput = document.getElementById('referralLinkInput');
    if (refInput) refInput.value = refLink;
    const frensCountEl = document.getElementById('totalFrensCount');
    if (frensCountEl) frensCountEl.textContent = state.frensCount;
    const frensRewardEl = document.getElementById('totalFrenRewards');
    if (frensRewardEl) frensRewardEl.textContent = `${formatNumber(state.frensEarned)} $NASTA`;

    // 8. Leaderboard score
    const myRankScore = document.getElementById('myRankScore');
    if (myRankScore) myRankScore.textContent = `${formatNumber(state.balance)} $NASTA`;

    // 9. Sync Daily Streak status
    if (typeof updateStreakUIElements === 'function') {
      updateStreakUIElements();
    }

    saveState();
  }

  // --- Coin Tap Mechanics & 30-Min Cooldown System ---
  function handleCoinTap(event) {
    const currentEpoch = Date.now();

    // Check if 30-minute cooldown is active
    if (state.cooldownEndTime && currentEpoch < state.cooldownEndTime) {
      const remainingSec = Math.max(0, Math.ceil((state.cooldownEndTime - currentEpoch) / 1000));
      const mm = Math.floor(remainingSec / 60);
      const ss = remainingSec % 60;
      const formattedTime = `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`;
      triggerHaptic('notification', 'warning');
      showToast(`⏳ Cooldown active! Wait ${formattedTime}`, '⏳');
      return;
    }

    // Check if energy is empty
    if (state.energy <= 0) {
      if (!state.cooldownEndTime) {
        state.cooldownEndTime = Date.now() + 30 * 60 * 1000;
        updateUI();
      }
      triggerHaptic('notification', 'warning');
      showToast('30 Coins earned! 30-min Cooldown started ⏳', '⏳');
      return;
    }

    // Decrement energy & increment balance (1 tap = 1 coin)
    const tapGain = state.turboActive ? (state.tapMultiplier * 2) : state.tapMultiplier;
    state.energy -= 1;
    state.balance += tapGain;
    state.totalTaps += 1;

    // Trigger 30-min cooldown when all 30 taps are used (30 coins earned)
    if (state.energy <= 0) {
      state.energy = 0;
      state.cooldownEndTime = Date.now() + 30 * 60 * 1000; // 30 minutes Cooldown
      triggerHaptic('notification', 'warning');
      showToast('🎉 30 Coins earned! 30-min Cooldown started ⏳', '⏳');
    } else {
      triggerHaptic('impact', 'medium');
    }

    // Tap coordinate calculation
    const rect = coinWrapper.getBoundingClientRect();
    let clientX, clientY;

    if (event && event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if (event && typeof event.clientX === 'number') {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = rect.left + rect.width / 2;
      clientY = rect.top + rect.height / 2;
    }

    // 3D tilt calculation
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = (clientX - centerX) / (rect.width / 2);
    const deltaY = (clientY - centerY) / (rect.height / 2);

    const tiltX = -deltaY * 18;
    const tiltY = deltaX * 18;

    nastaCoin.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(0.96)`;
    setTimeout(() => {
      nastaCoin.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
    }, 90);

    // Spawn floating number
    spawnFloatingNumber(clientX, clientY, `+${tapGain}`);

    updateUI();
  }

  function spawnFloatingNumber(x, y, text) {
    const floatEl = document.createElement('div');
    floatEl.className = 'tap-floating-number';
    floatEl.textContent = text;
    floatEl.style.left = `${x}px`;
    floatEl.style.top = `${y}px`;
    document.body.appendChild(floatEl);

    setTimeout(() => {
      floatEl.remove();
    }, 850);
  }

  // Attach tap handlers (Touch & Click)
  coinWrapper.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (state.cooldownEndTime && Date.now() < state.cooldownEndTime) {
      handleCoinTap(e);
      return;
    }
    // Handle multi-touch
    for (let i = 0; i < e.touches.length; i++) {
      if (state.energy > 0) {
        handleCoinTap({
          touches: [e.touches[i]],
          clientX: e.touches[i].clientX,
          clientY: e.touches[i].clientY
        });
      }
    }
  }, { passive: false });

  coinWrapper.addEventListener('mousedown', (e) => {
    handleCoinTap(e);
  });

  // --- Turbo Boost ---
  turboBoostBtn.addEventListener('click', () => {
    if (state.turboActive) return;
    state.turboActive = true;
    turboBoostBtn.style.opacity = '0.5';
    showToast('Turbo Boost 2X Activated! 🔥', '🔥');
    triggerHaptic('notification', 'success');

    setTimeout(() => {
      state.turboActive = false;
      turboBoostBtn.style.opacity = '1';
      showToast('Turbo Boost Ended', '⚡');
    }, 15000);
  });

  // --- Energy Recharge & Passive Mining Tickers ---
  setInterval(() => {
    let changed = false;
    const currentTime = Date.now();

    // 1. Cooldown & Tap Accumulation (30 min = 30 taps -> 1 tap per 60s)
    if (state.cooldownEndTime) {
      if (currentTime >= state.cooldownEndTime) {
        // 30 min Cooldown has completed!
        state.cooldownEndTime = null;
        state.energy = 30;
        changed = true;
        showToast('⚡ Cooldown ended! 30 Taps ready!', '⚡');
        triggerHaptic('notification', 'success');
      } else {
        // Still in cooldown: 30 taps accumulate over 30 mins (1 tap per 60,000 ms)
        const totalCdMs = 30 * 60 * 1000;
        const remainingMs = state.cooldownEndTime - currentTime;
        const elapsedMs = Math.max(0, totalCdMs - remainingMs);
        const accumulated = Math.min(30, Math.floor(elapsedMs / 60000));
        if (state.energy !== accumulated) {
          state.energy = accumulated;
        }
        changed = true; // Refresh countdown display every second
      }
    } else {
      // Not in cooldown: if energy < 30, accumulate 1 tap every 60 seconds (30 taps in 30 mins)
      if (state.energy < state.maxEnergy) {
        if (!state.lastEnergyTick) state.lastEnergyTick = currentTime;
        if (currentTime - state.lastEnergyTick >= 60000) {
          const added = Math.floor((currentTime - state.lastEnergyTick) / 60000);
          state.energy = Math.min(state.maxEnergy, state.energy + added);
          state.lastEnergyTick = currentTime;
          changed = true;
        }
      } else {
        state.lastEnergyTick = currentTime;
      }
    }

    // 2. Passive Cloud Mining (+speed / 3600 per sec)
    if (state.miningSpeedPerHour > 0) {
      const perSec = state.miningSpeedPerHour / 3600;
      state.balance += perSec;
      state.totalMined += perSec;
      changed = true;
    }

    if (changed) {
      updateUI();
    }
  }, 1000);

  // Claim Mining yield button
  claimMiningBtn.addEventListener('click', () => {
    if (state.totalMined < 1) {
      showToast('Mining in progress! Check back soon.', '⚡');
      return;
    }
    triggerHaptic('notification', 'success');
    showToast(`Claimed mining yield! 💎`, '💎');
  });

  // --- Tonkeeper Payment Modal & Flow ---
  let selectedPlan = null;
  const buyPlanBtns = document.querySelectorAll('.buy-plan-btn');
  const modalPlanSummary = document.getElementById('modalPlanSummary');
  const openTonkeeperLink = document.getElementById('openTonkeeperLink');
  const txHashInput = document.getElementById('txHashInput');
  const verifyTxBtn = document.getElementById('verifyTxBtn');

  buyPlanBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.getAttribute('data-plan');
      const priceUsdt = parseFloat(btn.getAttribute('data-price'));
      const priceTon = parseFloat(btn.getAttribute('data-ton'));
      const speed = parseInt(btn.getAttribute('data-speed'));

      selectedPlan = { plan, priceUsdt, priceTon, speed };

      modalPlanSummary.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:var(--primary-cyan); font-size:15px;">${plan} Speed Upgrade</strong>
            <div style="font-size:11px; color:var(--text-muted);">+${speed} $NASTA / hr (Permanent)</div>
          </div>
          <div style="text-align:right;">
            <strong style="color:var(--accent-gold); font-size:16px;">${priceTon} TON</strong>
            <div style="font-size:11px; color:var(--text-muted);">(${priceUsdt} USDT)</div>
          </div>
        </div>
      `;

      // Generate Tonkeeper deep link
      const nanoTon = Math.round(priceTon * 1_000_000_000);
      const comment = encodeURIComponent(`NASTA Mining ${plan}`);
      const tonkeeperDeepLink = `ton://transfer/${OWNER_TONKEEPER_ADDRESS}?amount=${nanoTon}&text=${comment}`;
      openTonkeeperLink.href = tonkeeperDeepLink;

      txHashInput.value = '';
      tonkeeperModal.classList.add('active');
      triggerHaptic('selection');
    });
  });

  document.getElementById('closeTonModalBtn').addEventListener('click', () => {
    tonkeeperModal.classList.remove('active');
  });

  // Anti-fraud On-Chain Tx Verification simulation
  verifyTxBtn.addEventListener('click', () => {
    const hash = txHashInput.value.trim();
    if (!hash || hash.length < 10) {
      triggerHaptic('notification', 'error');
      showToast('Please paste a valid TON Transaction Hash!', '⚠️');
      return;
    }

    if (state.usedTxHashes.includes(hash)) {
      triggerHaptic('notification', 'error');
      showToast('This Transaction Hash has already been used!', '❌');
      return;
    }

    // Success verification
    verifyTxBtn.disabled = true;
    verifyTxBtn.textContent = 'Verifying on TON Blockchain...';

    setTimeout(() => {
      verifyTxBtn.disabled = false;
      verifyTxBtn.innerHTML = '<span>🛡️</span> Verify & Activate Speed';
      
      state.usedTxHashes.push(hash);
      state.miningSpeedPerHour += selectedPlan.speed;

      if (selectedPlan.plan === 'NORMAL') state.normalMinersCount += 1;
      else if (selectedPlan.plan === 'HIGH') state.highMinersCount += 1;
      else if (selectedPlan.plan === 'ULTRA') state.ultraMinersCount += 1;

      tonkeeperModal.classList.remove('active');
      triggerHaptic('notification', 'success');
      showToast(`Speed Activated: +${selectedPlan.speed} NASTA/hr! 🚀`, '✅');
      updateUI();
    }, 1200);
  });

  // Copy Owner Address
  const copyAddressBtn = document.getElementById('copyAddressBtn');
  if (copyAddressBtn) {
    copyAddressBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(OWNER_TONKEEPER_ADDRESS);
      showToast('Owner address copied to clipboard!', '📋');
      triggerHaptic('selection');
    });
  }

  const modalCopyAddressBtn = document.getElementById('modalCopyAddressBtn');
  if (modalCopyAddressBtn) {
    modalCopyAddressBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(OWNER_TONKEEPER_ADDRESS);
      showToast('Address copied!', '📋');
      triggerHaptic('selection');
    });
  }

  // --- Daily Streak System (Strict 24-Hour Cooldown) ---
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

  const openStreakModalBtn = document.getElementById('openStreakModalBtn');
  const streakDaysGrid = document.getElementById('streakDaysGrid');
  const currentStreakDayNum = document.getElementById('currentStreakDayNum');
  const claimStreakBtn = document.getElementById('claimStreakBtn');
  const streakTimerNotice = document.getElementById('streakTimerNotice');
  const streakNextDayNotice = document.getElementById('streakNextDayNotice');
  const streakLiveTimer = document.getElementById('streakLiveTimer');

  function getStreakStatus() {
    const now = Date.now();
    const lastClaim = Number(state.lastStreakClaimTime) || 0;
    const timeSinceLastClaim = now - lastClaim;

    // Never claimed before
    if (lastClaim === 0 || !state.currentStreak || state.currentStreak === 0) {
      return {
        canClaim: true,
        nextDay: 1,
        remainingMs: 0,
        isStreakBroken: false
      };
    }

    // Claimed within last 24 hours -> STRICT 24-HOUR COOLDOWN
    if (timeSinceLastClaim < ONE_DAY_MS) {
      const nextDay = (state.currentStreak % 7) + 1;
      return {
        canClaim: false,
        nextDay: nextDay,
        remainingMs: ONE_DAY_MS - timeSinceLastClaim,
        isStreakBroken: false
      };
    }

    // Between 24 hours and 48 hours -> Can claim next day!
    if (timeSinceLastClaim <= TWO_DAYS_MS) {
      const nextDay = (state.currentStreak % 7) + 1;
      return {
        canClaim: true,
        nextDay: nextDay,
        remainingMs: 0,
        isStreakBroken: false
      };
    }

    // Missed over 48 hours -> Streak resets back to Day 1
    return {
      canClaim: true,
      nextDay: 1,
      remainingMs: 0,
      isStreakBroken: true
    };
  }

  function formatStreakDuration(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  let streakCountdownInterval = null;

  function renderStreakModal() {
    if (!streakDaysGrid) return;
    const status = getStreakStatus();
    streakDaysGrid.innerHTML = '';

    if (currentStreakDayNum) currentStreakDayNum.textContent = status.nextDay;
    if (streakNextDayNotice) streakNextDayNotice.textContent = status.nextDay;

    streakRewards.forEach(item => {
      const box = document.createElement('div');
      const isClaimed = !status.isStreakBroken && (item.day <= state.currentStreak);
      const isNextTarget = item.day === status.nextDay;

      box.className = `streak-day-box ${isClaimed ? 'claimed' : ''} ${isNextTarget ? 'current' : ''}`;
      
      let icon = '🎁';
      if (isClaimed) {
        icon = '✅';
      } else if (isNextTarget && status.canClaim) {
        icon = '🔥';
      } else if (!status.canClaim && item.day > state.currentStreak) {
        icon = '🔒';
      }

      box.innerHTML = `
        <div class="streak-day-title">Day ${item.day}</div>
        <div class="streak-day-icon">${icon}</div>
        <div class="streak-day-reward">+${formatNumber(item.reward)}</div>
      `;
      streakDaysGrid.appendChild(box);
    });

    updateStreakUIElements(status);
  }

  function updateStreakUIElements(status) {
    if (!status) status = getStreakStatus();
    const nextReward = streakRewards.find(r => r.day === status.nextDay)?.reward || 10;
    const timeFormatted = formatStreakDuration(status.remainingMs);

    if (claimStreakBtn) {
      if (status.canClaim) {
        claimStreakBtn.disabled = false;
        claimStreakBtn.classList.remove('btn-disabled');
        claimStreakBtn.classList.add('btn-gold');
        claimStreakBtn.innerHTML = `<span>🔥</span> Claim Day ${status.nextDay} Reward (+${formatNumber(nextReward)} $NASTA)`;
      } else {
        claimStreakBtn.disabled = true;
        claimStreakBtn.classList.add('btn-disabled');
        claimStreakBtn.classList.remove('btn-gold');
        claimStreakBtn.innerHTML = `<span>⏳</span> Day ${status.nextDay} Unlocks in ${timeFormatted}`;
      }
    }

    if (streakTimerNotice) {
      if (status.canClaim) {
        streakTimerNotice.style.display = 'none';
      } else {
        streakTimerNotice.style.display = 'flex';
        if (streakLiveTimer) streakLiveTimer.textContent = timeFormatted;
        if (streakNextDayNotice) streakNextDayNotice.textContent = status.nextDay;
      }
    }

    if (openStreakModalBtn) {
      if (status.canClaim) {
        openStreakModalBtn.textContent = '🔥 Claim Ready';
        openStreakModalBtn.classList.add('btn-gold');
      } else {
        openStreakModalBtn.textContent = '⏳ Streak Active';
        openStreakModalBtn.classList.remove('btn-gold');
      }
    }
  }

  function openStreakModal() {
    renderStreakModal();
    if (streakModal) streakModal.classList.add('active');

    if (streakCountdownInterval) clearInterval(streakCountdownInterval);
    streakCountdownInterval = setInterval(() => {
      if (!streakModal || !streakModal.classList.contains('active')) {
        clearInterval(streakCountdownInterval);
        streakCountdownInterval = null;
        return;
      }
      const curStatus = getStreakStatus();
      updateStreakUIElements(curStatus);
      if (curStatus.canClaim) {
        renderStreakModal();
      }
    }, 1000);
  }

  if (openStreakModalBtn) openStreakModalBtn.addEventListener('click', openStreakModal);

  const closeStreakModalBtn = document.getElementById('closeStreakModalBtn');
  if (closeStreakModalBtn) {
    closeStreakModalBtn.addEventListener('click', () => {
      if (streakModal) streakModal.classList.remove('active');
      if (streakCountdownInterval) {
        clearInterval(streakCountdownInterval);
        streakCountdownInterval = null;
      }
    });
  }

  if (claimStreakBtn) {
    claimStreakBtn.addEventListener('click', () => {
      const status = getStreakStatus();

      // STRICT PROTECTION: Block claim if 24 hours have not elapsed
      if (!status.canClaim) {
        triggerHaptic('notification', 'warning');
        const timeStr = formatStreakDuration(status.remainingMs);
        showToast(`⏳ Already claimed today! Next reward unlocks in ${timeStr}`, '⏳');
        return;
      }

      const targetDay = status.nextDay;
      const rewardItem = streakRewards.find(r => r.day === targetDay) || { day: 1, reward: 10 };

      state.currentStreak = targetDay;
      state.lastStreakClaimTime = Date.now();
      state.balance += rewardItem.reward;

      saveState();
      triggerHaptic('notification', 'success');
      showToast(`🎉 Day ${targetDay} Streak Claimed (+${formatNumber(rewardItem.reward)} NASTA)! Next in 24 hours.`, '🔥');

      renderStreakModal();
      renderTasks();
      updateUI();
    });
  }

  // --- Tasks Render & Claim ---
  const tasksContainer = document.getElementById('tasksListContainer');
  function renderTasks() {
    if (!tasksContainer) return;
    tasksContainer.innerHTML = '';

    tasksConfig.forEach(task => {
      let isDone = state.completedTasks.includes(task.id);
      let btnLabel = isDone ? 'Claimed ✓' : 'Claim';
      let btnDisabled = isDone;

      if (task.id === 'task_streak') {
        const streakStat = getStreakStatus();
        if (!streakStat.canClaim) {
          isDone = true;
          btnLabel = '⏳ Check Timer';
          btnDisabled = false;
        } else {
          isDone = false;
          btnLabel = 'Claim 🔥';
          btnDisabled = false;
        }
      } else if (task.action === 'ad') {
        isDone = false;
        btnLabel = 'Watch 📺';
        btnDisabled = false;
      }

      const card = document.createElement('div');
      card.className = 'task-item';

      card.innerHTML = `
        <div class="task-icon">${task.icon}</div>
        <div class="task-info">
          <div class="task-title">${task.title}</div>
          <div class="task-desc">${task.desc}</div>
        </div>
        <button class="btn btn-sm ${isDone ? 'btn-outline' : 'btn-primary'} task-claim-btn" data-task-id="${task.id}" ${btnDisabled ? 'disabled' : ''}>
          ${btnLabel}
        </button>
      `;

      card.querySelector('.task-claim-btn').addEventListener('click', () => {
        handleTaskClick(task);
      });

      tasksContainer.appendChild(card);
    });
  }

  function handleTaskClick(task) {
    if (task.action === 'streak') {
      openStreakModal();
      return;
    }

    if (state.completedTasks.includes(task.id)) return;

    if (task.action === 'link' && task.link) {
      if (tg?.openLink) {
        tg.openLink(task.link);
      } else {
        window.open(task.link, '_blank');
      }
    } else if (task.action === 'ad') {
      showRewardedAdFlow(task.reward || 5);
      return;
    }

    // Complete task
    state.completedTasks.push(task.id);
    state.balance += task.reward;
    triggerHaptic('notification', 'success');
    showToast(`Claimed +${task.reward} $NASTA! 🎁`, '🎉');
    renderTasks();
    updateUI();
  }

  // --- Rewarded Ads System (Adsgram & Web Rewarded Video Player) ---
  // You can set your real Adsgram Block ID from https://adsgram.ai here:
  const DEFAULT_ADSGRAM_BLOCK_ID = "YOUR_ADSGRAM_BLOCK_ID";
  let adsgramController = null;

  try {
    if (window.Adsgram && DEFAULT_ADSGRAM_BLOCK_ID !== "YOUR_ADSGRAM_BLOCK_ID") {
      adsgramController = window.Adsgram.init({ blockId: DEFAULT_ADSGRAM_BLOCK_ID });
    }
  } catch (e) {
    console.warn("Adsgram initialization notice:", e);
  }

  const rewardedAdModal = document.getElementById('rewardedAdModal');
  const closeAdModalBtn = document.getElementById('closeAdModalBtn');
  const adTimerFill = document.getElementById('adTimerFill');
  const adCountdownText = document.getElementById('adCountdownText');
  const claimAdRewardBtn = document.getElementById('claimAdRewardBtn');
  let adInterval = null;

  function showRewardedAdFlow(rewardAmount = 5) {
    // 1. If Adsgram SDK is configured with a real Block ID inside Telegram:
    if (adsgramController) {
      showToast('Loading Telegram Rewarded Ad...', '📺');
      adsgramController.show().then((result) => {
        state.balance += rewardAmount;
        saveState();
        triggerHaptic('notification', 'success');
        showToast(`🎉 +${rewardAmount} $NASTA Coins Earned from Ad!`, '💎');
        updateUI();
      }).catch((result) => {
        triggerHaptic('notification', 'warning');
        showToast('Ad was skipped or unavailable. Watch full ad for 5 NASTA!', '⚠️');
      });
      return;
    }

    // 2. Interactive Video Ad Player Fallback (works 100% in browsers & Telegram)
    if (!rewardedAdModal) {
      state.balance += rewardAmount;
      saveState();
      showToast(`+${rewardAmount} $NASTA Coins from Ad! ✨`, '🎉');
      triggerHaptic('notification', 'success');
      updateUI();
      return;
    }

    let secondsLeft = 5;
    if (closeAdModalBtn) closeAdModalBtn.style.display = 'none';
    if (claimAdRewardBtn) claimAdRewardBtn.style.display = 'none';
    if (adTimerFill) adTimerFill.style.width = '0%';
    if (adCountdownText) adCountdownText.textContent = `${secondsLeft}s`;

    rewardedAdModal.classList.add('active');
    triggerHaptic('selection');

    if (adInterval) clearInterval(adInterval);
    adInterval = setInterval(() => {
      secondsLeft -= 1;
      const progressPct = ((5 - secondsLeft) / 5) * 100;
      if (adTimerFill) adTimerFill.style.width = `${progressPct}%`;
      if (adCountdownText) adCountdownText.textContent = `${secondsLeft}s`;

      if (secondsLeft <= 0) {
        clearInterval(adInterval);
        adInterval = null;
        if (adCountdownText) adCountdownText.textContent = 'Completed! ✅';
        if (closeAdModalBtn) closeAdModalBtn.style.display = 'block';
        if (claimAdRewardBtn) {
          claimAdRewardBtn.style.display = 'block';
          claimAdRewardBtn.innerHTML = `<span>🎉</span> Claim +${rewardAmount} $NASTA Coin`;
        }
        triggerHaptic('notification', 'success');
      }
    }, 1000);
  }

  if (closeAdModalBtn) {
    closeAdModalBtn.addEventListener('click', () => {
      if (rewardedAdModal) rewardedAdModal.classList.remove('active');
      if (adInterval) clearInterval(adInterval);
    });
  }

  if (claimAdRewardBtn) {
    claimAdRewardBtn.addEventListener('click', () => {
      state.balance += 5;
      saveState();
      triggerHaptic('notification', 'success');
      showToast('+5 $NASTA Coins Claimed! 📺', '🎉');
      if (rewardedAdModal) rewardedAdModal.classList.remove('active');
      updateUI();
    });
  }

  const watchAdQuickBtn = document.getElementById('watchAdQuickBtn');
  if (watchAdQuickBtn) {
    watchAdQuickBtn.addEventListener('click', () => {
      showRewardedAdFlow(5);
    });
  }

  // --- Referral Sharing ---
  const copyRefBtn = document.getElementById('copyRefBtn');
  if (copyRefBtn) {
    copyRefBtn.addEventListener('click', () => {
      const link = document.getElementById('referralLinkInput').value;
      navigator.clipboard.writeText(link);
      showToast('Referral link copied! Share with friends 👥', '📋');
      triggerHaptic('selection');
    });
  }

  const shareTelegramBtn = document.getElementById('shareTelegramBtn');
  if (shareTelegramBtn) {
    shareTelegramBtn.addEventListener('click', () => {
      const link = document.getElementById('referralLinkInput').value;
      const text = encodeURIComponent('🚀 Join NASTA Coin ($NASTA) on TON Blockchain! Mine crypto, tap, and earn free tokens with me.');
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${text}`;

      if (tg?.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
      } else {
        window.open(shareUrl, '_blank');
      }
    });
  }

  // --- Wallet Actions ---
  connectWalletBtn.addEventListener('click', () => {
    if (state.connectedTonWallet) {
      showToast('Tonkeeper Wallet already connected!', '💎');
      return;
    }

    // Connect wallet simulation
    connectWalletBtn.textContent = 'Connecting Tonkeeper...';
    setTimeout(() => {
      const mockAddr = 'UQAf9x4...' + Math.random().toString(36).substring(2, 8).toUpperCase() + 'K42M';
      state.connectedTonWallet = mockAddr;
      state.tonBalance = 1.50;
      state.usdtBalance = 10.0;
      triggerHaptic('notification', 'success');
      showToast('Tonkeeper Wallet Connected! 💎', '✅');
      updateUI();
    }, 1000);
  });

  document.getElementById('receiveBtn').addEventListener('click', () => {
    receiveModal.classList.add('active');
    triggerHaptic('selection');
  });

  document.getElementById('closeReceiveModalBtn').addEventListener('click', () => {
    receiveModal.classList.remove('active');
  });

  document.getElementById('copyReceiveAddressBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(userReceiveAddress.textContent);
    showToast('Receiving address copied! 📋', '📋');
    triggerHaptic('selection');
  });

  document.getElementById('swapBtn').addEventListener('click', () => {
    swapModal.classList.add('active');
    triggerHaptic('selection');
  });

  document.getElementById('closeSwapModalBtn').addEventListener('click', () => {
    swapModal.classList.remove('active');
  });

  document.getElementById('executeSwapBtn').addEventListener('click', () => {
    const pay = parseFloat(document.getElementById('swapPayAmount').value) || 0;
    if (pay <= 0 || pay > state.balance) {
      showToast('Insufficient $NASTA balance to swap!', '⚠️');
      return;
    }
    const receivedTon = pay / 229.35;
    state.balance -= pay;
    state.tonBalance += receivedTon;
    swapModal.classList.remove('active');
    triggerHaptic('notification', 'success');
    showToast(`Swapped ${pay} NASTA for ${receivedTon.toFixed(2)} TON! 🔄`, '✅');
    updateUI();
  });

  document.getElementById('sendBtn').addEventListener('click', () => {
    showToast('Send feature: connect external wallet to broadcast on TON', '↗️');
  });

  document.getElementById('withdrawBtn').addEventListener('click', () => {
    if (!state.connectedTonWallet) {
      showToast('Connect TON wallet first to withdraw!', '⚠️');
      return;
    }
    showToast('Withdrawal request queued for Multi-Sig Sentinel approval! 🛡️', '🏦');
  });

  // --- Notifications Modal ---
  document.getElementById('notifBtn').addEventListener('click', () => {
    notifModal.classList.add('active');
    document.getElementById('notifBadge').style.display = 'none';
    triggerHaptic('selection');
  });

  document.getElementById('closeNotifModalBtn').addEventListener('click', () => {
    notifModal.classList.remove('active');
  });

  // --- Haptics Toggle ---
  const hapticToggleBtn = document.getElementById('hapticToggleBtn');
  const hapticIcon = document.getElementById('hapticIcon');
  hapticToggleBtn.addEventListener('click', () => {
    hapticsEnabled = !hapticsEnabled;
    hapticIcon.textContent = hapticsEnabled ? '📳' : '🔇';
    showToast(hapticsEnabled ? 'Haptics: Enabled' : 'Haptics: Muted', '📳');
  });

  // --- Leaderboard Population ---
  const mockLeaders = [
    { rank: 4, name: '@crypto_bengal', score: '98,400' },
    { rank: 5, name: '@ton_miner_bd', score: '84,100' },
    { rank: 6, name: '@nasta_holder_99', score: '62,800' },
    { rank: 7, name: '@blockchain_sam', score: '45,300' },
    { rank: 8, name: '@ton_community', score: '38,900' },
    { rank: 9, name: '@speed_miner_x', score: '29,400' },
    { rank: 10, name: '@pioneer_alpha', score: '21,500' }
  ];

  const leaderboardList = document.getElementById('leaderboardList');
  if (leaderboardList) {
    mockLeaders.forEach(item => {
      const row = document.createElement('div');
      row.className = 'leader-row';
      row.innerHTML = `
        <span class="leader-rank">#${item.rank}</span>
        <span class="leader-name">${item.name}</span>
        <span class="leader-score">${item.score} $NASTA</span>
      `;
      leaderboardList.appendChild(row);
    });
  }

  // --- Bottom Navigation Tab Switcher ---
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanels = document.querySelectorAll('.tab-panel');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');

      navItems.forEach(n => n.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const panel = document.getElementById(targetTab);
      if (panel) panel.classList.add('active');

      triggerHaptic('selection');
    });
  });

    // --- Video Opening Intro Controller ---
    const splashScreen = document.getElementById('splashScreen');
    const introVideo = document.getElementById('introVideo');
    const toggleAudioBtn = document.getElementById('toggleAudioBtn');
    const audioIcon = document.getElementById('audioIcon');
    const audioText = document.getElementById('audioText');
    const skipIntroBtn = document.getElementById('skipIntroBtn');
    const splashProgressFill = document.getElementById('splashProgressFill');
    const splashStatusText = document.getElementById('splashStatusText');
    const splashPercentText = document.getElementById('splashPercentText');

    let introCompleted = false;

    function finishIntro() {
      if (introCompleted) return;
      introCompleted = true;
      if (introVideo) {
        try { introVideo.pause(); } catch(e){}
      }
      triggerHaptic('notification', 'success');
      if (splashScreen) {
        splashScreen.classList.add('hidden');
        setTimeout(() => {
          splashScreen.style.display = 'none';
        }, 650);
      }
    }

    // Toggle Audio
    if (toggleAudioBtn && introVideo) {
      toggleAudioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        introVideo.muted = !introVideo.muted;
        if (audioIcon) audioIcon.textContent = introVideo.muted ? '🔇' : '🔊';
        if (audioText) audioText.textContent = introVideo.muted ? 'Unmute' : 'Mute';
        triggerHaptic('selection');
      });
    }

    // Skip Button
    if (skipIntroBtn) {
      skipIntroBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        finishIntro();
      });
    }

    // Video Playback Events
    if (introVideo) {
      introVideo.addEventListener('ended', () => {
        finishIntro();
      });

      introVideo.addEventListener('timeupdate', () => {
        if (introVideo.duration > 0) {
          const pct = Math.min(100, Math.round((introVideo.currentTime / introVideo.duration) * 100));
          if (splashProgressFill) splashProgressFill.style.width = pct + '%';
          if (splashPercentText) splashPercentText.textContent = pct + '%';

          if (pct >= 85) {
            if (splashStatusText) splashStatusText.textContent = 'Ready! Welcome to NASTA.';
          } else if (pct >= 45) {
            if (splashStatusText) splashStatusText.textContent = 'Syncing TON Blockchain Rig...';
          }
        }
      });

      // Try autoplay
      introVideo.play().catch((err) => {
        console.log('Video autoplay note:', err);
      });

      // Safety timeout so user is never stuck
      setTimeout(() => {
        if (!introCompleted && (!introVideo.currentTime || introVideo.paused)) {
          finishIntro();
        }
      }, 15000);
    } else {
      setTimeout(finishIntro, 2000);
    }

    // Initial Run
    renderTasks();
    updateUI();
    syncCloudStorage();

  })();

