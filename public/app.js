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

  // --- Storage Key ---
  const STORAGE_KEY = 'nasta_coin_user_state_v2';

  // --- Default State ---
  const defaultState = {
    username: tg?.initDataUnsafe?.user?.username ? '@' + tg.initDataUnsafe.user.username : (tg?.initDataUnsafe?.user?.first_name || '@nasta_pioneer'),
    balance: 0.0,
    energy: 30,
    maxEnergy: 30,
    cooldownEndTime: null, // Timestamp (ms) when cooldown ends
    lastEnergyTick: Date.now(),
    tapMultiplier: 1,
    turboActive: false,
    // Hardware Lab Boosters
    multitapLevel: 1,
    tankLevel: 1,
    rechargeLevel: 1,
    autoBotLevel: 0,
    turbineLevel: 0,
    lastOfflineCheck: Date.now(),
    // Arcade / Lucky Fortune Wheel
    spinsAvailable: 3,
    lastSpinResetTime: Date.now(),
    // Mining Rig
    miningSpeedPerHour: 0,
    normalMinersCount: 0,
    highMinersCount: 0,
    ultraMinersCount: 0,
    totalMined: 0.0,
    currentStreak: 0,
    lastStreakClaimTime: 0,
    connectedTonWallet: null,
    connectedWalletName: null,
    walletUpdatedAt: 0,
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

  // Ensure energy capacity reflects Hardware Lab upgrades & sync active cooldown
  const currentTankLevel = Math.max(1, parseInt(state.tankLevel, 10) || 1);
  state.maxEnergy = 30 + (currentTankLevel - 1) * 10;
  if (typeof state.energy !== 'number' || isNaN(state.energy)) {
    state.energy = state.maxEnergy;
  }
  const initNow = Date.now();
  const recLvl = Math.max(1, parseInt(state.rechargeLevel, 10) || 1);
  const cdMinutes = Math.max(10, 30 - (recLvl - 1) * 5);
  const totalCdMs = cdMinutes * 60 * 1000;

  if (state.cooldownEndTime) {
    if (initNow >= state.cooldownEndTime) {
      // Cooldown completed while user was away
      state.cooldownEndTime = null;
      state.energy = state.maxEnergy;
    } else {
      // Cooldown still active: calculate accumulated taps
      const remainingMs = state.cooldownEndTime - initNow;
      const elapsedMs = Math.max(0, totalCdMs - remainingMs);
      const secPerTap = (cdMinutes * 60) / state.maxEnergy;
      state.energy = Math.min(state.maxEnergy, Math.floor(elapsedMs / (secPerTap * 1000)));
    }
  } else {
    if (state.energy < 0) state.energy = 0;
    if (state.energy > state.maxEnergy) state.energy = state.maxEnergy;
  }

  // --- High-Performance Debounced State Persistence ---
  let localSaveTimeout = null;
  let cloudSaveTimeout = null;

  function saveState(immediate = false) {
    const doLocalSave = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {}
    };

    if (immediate) {
      if (localSaveTimeout) clearTimeout(localSaveTimeout);
      localSaveTimeout = null;
      doLocalSave();
    } else {
      if (!localSaveTimeout) {
        localSaveTimeout = setTimeout(() => {
          localSaveTimeout = null;
          doLocalSave();
        }, 250);
      }
    }

    // Cloud sync with Telegram CloudStorage across all user devices (Phone, PC, Web)
    if (tg?.CloudStorage) {
      const doCloudSave = () => {
        try {
          const serialized = JSON.stringify(state);
          tg.CloudStorage.setItem(STORAGE_KEY, serialized, (err, stored) => {
            if (err) console.warn('Telegram CloudStorage setItem notice:', err);
          });
        } catch (e) {}
      };

      if (immediate) {
        if (cloudSaveTimeout) clearTimeout(cloudSaveTimeout);
        cloudSaveTimeout = null;
        doCloudSave();
      } else {
        if (cloudSaveTimeout) clearTimeout(cloudSaveTimeout);
        cloudSaveTimeout = setTimeout(doCloudSave, 500);
      }
    }
  }

  // Flush state immediately when app unloads or backgrounded
  window.addEventListener('beforeunload', () => saveState(true));
  window.addEventListener('pagehide', () => saveState(true));

  function syncCloudStorage() {
    if (!tg?.CloudStorage) return;

    // 1. First Priority: Check dedicated wallet key (never affected by coin taps or balance race conditions)
    try {
      tg.CloudStorage.getItem('nasta_user_wallet_v1', (err, wValue) => {
        if (!err && wValue) {
          try {
            const wData = JSON.parse(wValue);
            if (wData && wData.address) {
              if (state.connectedTonWallet !== wData.address) {
                state.connectedTonWallet = wData.address;
                state.connectedWalletName = wData.name || 'TON Wallet';
                state.walletUpdatedAt = wData.updatedAt || Date.now();
                try {
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                } catch(e) {}
                updateUI();
              }
            }
          } catch(e) {}
        }
      });
    } catch(e) {}

    // 2. Second: Check main STORAGE_KEY
    try {
      tg.CloudStorage.getItem(STORAGE_KEY, (err, value) => {
        if (!err && value) {
          try {
            const cloudState = JSON.parse(value);
            if (cloudState) {
              let updated = false;

              // Adopt higher balance so user never loses earned coins across devices
              if (typeof cloudState.balance === 'number' && cloudState.balance > state.balance) {
                state.balance = cloudState.balance;
                updated = true;
              }

              // Cross-device connected wallet sync:
              // If cloud has a connected wallet and local doesn't, OR cloud's wallet is newer/different
              if (cloudState.connectedTonWallet) {
                const cloudWalletTime = Number(cloudState.walletUpdatedAt) || 0;
                const localWalletTime = Number(state.walletUpdatedAt) || 0;
                if (!state.connectedTonWallet || cloudWalletTime >= localWalletTime || state.connectedTonWallet !== cloudState.connectedTonWallet) {
                  state.connectedTonWallet = cloudState.connectedTonWallet;
                  state.connectedWalletName = cloudState.connectedWalletName || 'TON Wallet';
                  state.walletUpdatedAt = Math.max(cloudWalletTime, localWalletTime, Date.now());
                  updated = true;
                }
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

              if (updated) {
                try {
                  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                } catch(e) {}
                updateUI();
                if (typeof renderTasks === 'function') renderTasks();
              }

              // If local had higher balance, sync the updated merged state back to cloud
              if (state.balance > (cloudState.balance || 0) || (state.connectedTonWallet && !cloudState.connectedTonWallet)) {
                saveState();
              }
            }
          } catch (e) {
            console.warn('Telegram CloudStorage parse notice:', e);
          }
        } else if (!value && (state.balance > 0 || state.connectedTonWallet)) {
          // First time opening with local progress, push to cloud immediately
          saveState(true);
        }
      });
    } catch (e) {
      console.warn('Telegram CloudStorage init notice:', e);
    }
  }

  // Cross-device auto-sync when user returns or focuses window
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      syncCloudStorage();
    }
  });
  window.addEventListener('focus', () => {
    syncCloudStorage();
  });

  // --- Task Definitions ---
  const tasksConfig = [
    {
      id: 'task_streak',
      title: 'Daily Check-in (10-10,000 $NASTA)',
      desc: 'Claim your consecutive daily reward every 24 hours.',
      reward: 10,
      icon: '🔥',
      action: 'streak'
    },
    {
      id: 'task_youtube',
      title: 'Subscribe to NASTA YouTube',
      desc: 'Watch & subscribe to the official NASTA YouTube channel.',
      reward: 500,
      icon: '▶️',
      action: 'link',
      link: 'https://www.youtube.com/@nastacoin'
    },
    {
      id: 'task_spin',
      title: 'Lucky Wheel Challenger',
      desc: 'Spin the Fortune Wheel in the Arcade today.',
      reward: 150,
      icon: '🎰',
      action: 'arcade'
    },
    {
      id: 'task_upgrade',
      title: 'Hardware Lab Engineer',
      desc: 'Level up any booster in the Hardware Lab.',
      reward: 200,
      icon: '⚡',
      action: 'lab'
    },
    {
      id: 'task_tap30',
      title: 'Pioneer Tapper (30 Taps)',
      desc: 'Mine 30 coins in the Tap Arena.',
      reward: 100,
      icon: '👆',
      action: 'tap'
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
      id: 'task_invite_frens',
      title: 'Invite a Fren (+1,000 $NASTA)',
      desc: 'Share your referral link with a friend to grow your guild.',
      reward: 1000,
      icon: '👥',
      action: 'frens'
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
    if (balanceUsdDisplay) balanceUsdDisplay.textContent = '⚡ Season 1 Airdrop Mining';

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
    if (normalOwnedCount) normalOwnedCount.textContent = state.normalMinersCount;
    if (highOwnedCount) highOwnedCount.textContent = state.highMinersCount;
    if (ultraOwnedCount) ultraOwnedCount.textContent = state.ultraMinersCount;

    if (state.miningSpeedPerHour > 0) {
      turbineBlades.classList.add('fast');
    } else {
      turbineBlades.classList.remove('fast');
    }

    // 5. Wallet
    if (walletNastaBalance) walletNastaBalance.textContent = formatNumber(state.balance);
    if (walletNastaUsd) walletNastaUsd.textContent = 'Season 1 Airdrop Points';
    if (walletTonBalance) walletTonBalance.textContent = state.tonBalance.toFixed(2);
    if (walletUsdtBalance) walletUsdtBalance.textContent = state.usdtBalance.toFixed(2);

    if (state.connectedTonWallet) {
      walletStatusTitle.textContent = `${state.connectedWalletName || 'TON Wallet'} Connected ✅`;
      walletStatusDesc.textContent = `${state.connectedTonWallet.substring(0, 10)}...${state.connectedTonWallet.substring(state.connectedTonWallet.length - 8)}`;
      connectWalletBtn.textContent = 'Manage / Switch Wallet';
      connectWalletBtn.classList.remove('btn-primary');
      connectWalletBtn.classList.add('btn-outline');
      userReceiveAddress.textContent = state.connectedTonWallet;
    } else {
      walletStatusTitle.textContent = 'Connect TON Crypto Wallet';
      walletStatusDesc.textContent = 'Connect your Telegram @wallet, Tonkeeper, Tonhub or any other TON wallet for $NASTA withdrawals.';
      connectWalletBtn.innerHTML = '<span>🔗</span> Connect Wallet';
      connectWalletBtn.classList.add('btn-primary');
      connectWalletBtn.classList.remove('btn-outline');
      userReceiveAddress.textContent = 'No wallet connected yet';
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

    // 10. Sync Hardware Lab button states
    if (typeof renderHardwareUpgrades === 'function') {
      renderHardwareUpgrades();
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
      const cdMinutes = Math.max(10, 30 - ((state.rechargeLevel || 1) - 1) * 5);
      if (!state.cooldownEndTime) {
        state.cooldownEndTime = Date.now() + cdMinutes * 60 * 1000;
        updateUI();
      }
      triggerHaptic('notification', 'warning');
      showToast(`Energy empty! Wait cooldown or tap ⚡ Refill!`, '⏳');
      return;
    }

    // Decrement energy & increment balance (1 tap = 1 coin * multiplier)
    const tapGain = state.turboActive ? (state.tapMultiplier * 2) : state.tapMultiplier;
    state.energy -= 1;
    state.balance += tapGain;
    state.totalTaps += 1;

    // Trigger cooldown when energy reaches 0
    if (state.energy <= 0) {
      state.energy = 0;
      const cdMinutes = Math.max(10, 30 - ((state.rechargeLevel || 1) - 1) * 5);
      state.cooldownEndTime = Date.now() + cdMinutes * 60 * 1000;
      triggerHaptic('notification', 'warning');
      showToast(`⚡ Energy empty! Cooldown active or tap Refill ⚡`, '⏳');
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

    floatEl.addEventListener('animationend', () => {
      floatEl.remove();
    }, { once: true });

    setTimeout(() => {
      if (floatEl.parentNode) floatEl.remove();
    }, 900);
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

    // 1. Cooldown & Tap Accumulation
    const recLvl = state.rechargeLevel || 1;
    const cdMinutes = Math.max(10, 30 - (recLvl - 1) * 5);
    const totalCdMs = cdMinutes * 60 * 1000;

    if (state.cooldownEndTime) {
      if (currentTime >= state.cooldownEndTime) {
        state.cooldownEndTime = null;
        state.energy = state.maxEnergy;
        changed = true;
        showToast(`⚡ Energy restored to 100% (${state.maxEnergy} Taps)!`, '⚡');
        triggerHaptic('notification', 'success');
      } else {
        const remainingMs = state.cooldownEndTime - currentTime;
        const elapsedMs = Math.max(0, totalCdMs - remainingMs);
        const secPerTap = (cdMinutes * 60) / state.maxEnergy;
        const accumulated = Math.min(state.maxEnergy, Math.floor((elapsedMs / 1000) / secPerTap));
        if (state.energy !== accumulated) {
          state.energy = accumulated;
        }
        changed = true;
      }
    } else {
      if (state.energy < state.maxEnergy) {
        if (!state.lastEnergyTick) state.lastEnergyTick = currentTime;
        const rechargeIntervalMs = Math.max(20000, 60000 / recLvl);
        if (currentTime - state.lastEnergyTick >= rechargeIntervalMs) {
          const added = Math.floor((currentTime - state.lastEnergyTick) / rechargeIntervalMs);
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

  // --- Hardware Lab In-Game Boosters System ---
  const upgradesConfig = {
    multitap: {
      name: 'Multi-Tap Power',
      maxLevel: 5,
      costs: [0, 200, 500, 1200, 3000, 0],
      getEffect: lvl => `Lvl ${lvl} (${lvl}x Tap)`
    },
    tank: {
      name: 'Energy Tank',
      maxLevel: 5,
      costs: [0, 300, 800, 1800, 4000, 0],
      caps: [0, 30, 60, 100, 150, 200],
      getEffect: lvl => `Lvl ${lvl} (${[0, 30, 60, 100, 150, 200][lvl]} Max)`
    },
    recharge: {
      name: 'Fast Cooling',
      maxLevel: 4,
      costs: [0, 500, 1500, 3500, 0],
      getEffect: lvl => `Lvl ${lvl} (${lvl === 1 ? 'Standard' : lvl === 2 ? '1.5x Speed' : lvl === 3 ? '2x Speed' : '3x Speed'})`
    },
    bot: {
      name: 'Auto-Tap Bot',
      maxLevel: 3,
      costs: [1000, 2500, 5000, 0],
      getEffect: lvl => lvl === 0 ? 'Locked' : `Lvl ${lvl} (Mines up to ${lvl}h offline)`
    },
    turbine: {
      name: 'Turbine Overclock',
      maxLevel: 5,
      costs: [750, 1800, 3800, 7500, 15000, 0],
      speeds: [25, 50, 100, 200, 500],
      getEffect: lvl => lvl === 0 ? 'Lvl 0 (+0/hr)' : `Lvl ${lvl} (+${[25, 50, 100, 200, 500][lvl - 1]}/hr)`
    }
  };

  function renderHardwareUpgrades() {
    // 1. Multitap
    const mtLvl = state.multitapLevel || 1;
    const mtCost = upgradesConfig.multitap.costs[mtLvl] || 0;
    const mtLevelEl = document.getElementById('levelMultitap');
    const mtCostEl = document.getElementById('costMultitap');
    const mtBtn = document.getElementById('buyUpgradeMultitap');
    if (mtLevelEl) mtLevelEl.textContent = upgradesConfig.multitap.getEffect(mtLvl);
    if (mtCostEl) mtCostEl.textContent = mtLvl >= 5 ? 'MAX' : formatNumber(mtCost);
    if (mtBtn) mtBtn.disabled = mtLvl >= 5 || state.balance < mtCost;

    // 2. Tank
    const tankLvl = state.tankLevel || 1;
    const tankCost = upgradesConfig.tank.costs[tankLvl] || 0;
    const tankLevelEl = document.getElementById('levelTank');
    const tankCostEl = document.getElementById('costTank');
    const tankBtn = document.getElementById('buyUpgradeTank');
    if (tankLevelEl) tankLevelEl.textContent = upgradesConfig.tank.getEffect(tankLvl);
    if (tankCostEl) tankCostEl.textContent = tankLvl >= 5 ? 'MAX' : formatNumber(tankCost);
    if (tankBtn) tankBtn.disabled = tankLvl >= 5 || state.balance < tankCost;

    // 3. Recharge
    const recLvl = state.rechargeLevel || 1;
    const recCost = upgradesConfig.recharge.costs[recLvl] || 0;
    const recLevelEl = document.getElementById('levelRecharge');
    const recCostEl = document.getElementById('costRecharge');
    const recBtn = document.getElementById('buyUpgradeRecharge');
    if (recLevelEl) recLevelEl.textContent = upgradesConfig.recharge.getEffect(recLvl);
    if (recCostEl) recCostEl.textContent = recLvl >= 4 ? 'MAX' : formatNumber(recCost);
    if (recBtn) recBtn.disabled = recLvl >= 4 || state.balance < recCost;

    // 4. Auto-Bot
    const botLvl = state.autoBotLevel || 0;
    const botCost = upgradesConfig.bot.costs[botLvl] || 0;
    const botLevelEl = document.getElementById('levelBot');
    const botCostEl = document.getElementById('costBot');
    const botBtn = document.getElementById('buyUpgradeBot');
    if (botLevelEl) botLevelEl.textContent = upgradesConfig.bot.getEffect(botLvl);
    if (botCostEl) botCostEl.textContent = botLvl >= 3 ? 'MAX' : formatNumber(botCost);
    if (botBtn) botBtn.disabled = botLvl >= 3 || state.balance < botCost;

    // 5. Turbine Overclock
    const turbLvl = state.turbineLevel || 0;
    const turbCost = upgradesConfig.turbine.costs[turbLvl] || 0;
    const turbLevelEl = document.getElementById('levelTurbine');
    const turbCostEl = document.getElementById('costTurbine');
    const turbBtn = document.getElementById('buyUpgradeTurbine');
    if (turbLevelEl) turbLevelEl.textContent = upgradesConfig.turbine.getEffect(turbLvl);
    if (turbCostEl) turbCostEl.textContent = turbLvl >= 5 ? 'MAX' : formatNumber(turbCost);
    if (turbBtn) turbBtn.disabled = turbLvl >= 5 || state.balance < turbCost;
  }

  function handleUpgradePurchase(type) {
    if (type === 'multitap') {
      const curLvl = state.multitapLevel || 1;
      if (curLvl >= 5) return;
      const cost = upgradesConfig.multitap.costs[curLvl];
      if (state.balance < cost) {
        showToast('Insufficient $NASTA points! Tap coin to earn more.', '⚠️');
        return;
      }
      state.balance -= cost;
      state.multitapLevel = curLvl + 1;
      state.tapMultiplier = state.multitapLevel;
      triggerHaptic('notification', 'success');
      showToast(`Multi-Tap Upgraded to Level ${state.multitapLevel}! 👆`, '🎉');
    } else if (type === 'tank') {
      const curLvl = state.tankLevel || 1;
      if (curLvl >= 5) return;
      const cost = upgradesConfig.tank.costs[curLvl];
      if (state.balance < cost) {
        showToast('Insufficient $NASTA points!', '⚠️');
        return;
      }
      state.balance -= cost;
      state.tankLevel = curLvl + 1;
      state.maxEnergy = upgradesConfig.tank.caps[state.tankLevel];
      state.energy = Math.min(state.maxEnergy, state.energy + 25);
      triggerHaptic('notification', 'success');
      showToast(`Energy Tank Upgraded to ${state.maxEnergy} Max! ⚡`, '🎉');
    } else if (type === 'recharge') {
      const curLvl = state.rechargeLevel || 1;
      if (curLvl >= 4) return;
      const cost = upgradesConfig.recharge.costs[curLvl];
      if (state.balance < cost) {
        showToast('Insufficient $NASTA points!', '⚠️');
        return;
      }
      state.balance -= cost;
      state.rechargeLevel = curLvl + 1;
      triggerHaptic('notification', 'success');
      showToast(`Fast Cooling Upgraded to Level ${state.rechargeLevel}! 🔋`, '🎉');
    } else if (type === 'bot') {
      const curLvl = state.autoBotLevel || 0;
      if (curLvl >= 3) return;
      const cost = upgradesConfig.bot.costs[curLvl];
      if (state.balance < cost) {
        showToast('Insufficient $NASTA points!', '⚠️');
        return;
      }
      state.balance -= cost;
      state.autoBotLevel = curLvl + 1;
      triggerHaptic('notification', 'success');
      showToast(`Auto-Tap Bot Level ${state.autoBotLevel} Activated! 🤖`, '🎉');
    } else if (type === 'turbine') {
      const curLvl = state.turbineLevel || 0;
      if (curLvl >= 5) return;
      const cost = upgradesConfig.turbine.costs[curLvl];
      if (state.balance < cost) {
        showToast('Insufficient $NASTA points!', '⚠️');
        return;
      }
      state.balance -= cost;
      state.turbineLevel = curLvl + 1;
      state.miningSpeedPerHour += 25;
      triggerHaptic('notification', 'success');
      showToast(`Turbine Speed +25/hr Activated! 🚀`, '🎉');
    }

    saveState();
    updateUI();
    renderHardwareUpgrades();
  }

  // Attach upgrade button click listeners
  ['buyUpgradeMultitap', 'buyUpgradeTank', 'buyUpgradeRecharge', 'buyUpgradeBot', 'buyUpgradeTurbine'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        const upgradeType = btn.getAttribute('data-upgrade');
        handleUpgradePurchase(upgradeType);
      });
    }
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
      } else if (task.action === 'link') {
        if (!isDone) {
          btnLabel = task.id === 'task_youtube' ? 'Subscribe ▶️' : 'Start ↗';
          btnDisabled = false;
        }
      }

      const card = document.createElement('div');
      card.className = 'task-item';

      card.innerHTML = `
        <div class="task-icon">${task.icon}</div>
        <div class="task-info">
          <div class="task-title">${task.title}</div>
          <div class="task-desc">${task.desc}</div>
          <div class="task-reward">+${Number(task.reward).toLocaleString()} $NASTA</div>
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

    if (task.action === 'arcade') {
      const arcadeNav = document.querySelector('.nav-item[data-tab="tab-arcade"]');
      if (arcadeNav) arcadeNav.click();
    } else if (task.action === 'lab') {
      const labNav = document.querySelector('.nav-item[data-tab="tab-mining"]');
      if (labNav) labNav.click();
    } else if (task.action === 'tap') {
      const tapNav = document.querySelector('.nav-item[data-tab="tab-tap"]');
      if (tapNav) tapNav.click();
    } else if (task.action === 'frens') {
      const frensNav = document.querySelector('.nav-item[data-tab="tab-referrals"]');
      if (frensNav) frensNav.click();
    } else if (task.action === 'wallet') {
      const walletModal = document.getElementById('walletSelectModal');
      if (walletModal) walletModal.classList.add('active');
    } else if (task.action === 'link' && task.link) {
      try {
        if (tg && typeof tg.openLink === 'function') {
          tg.openLink(task.link);
        } else {
          window.open(task.link, '_blank');
        }
      } catch (err) {
        window.open(task.link, '_blank');
      }
    }

    // Complete task & reward
    state.completedTasks.push(task.id);
    state.balance += task.reward;
    triggerHaptic('notification', 'success');
    showToast(`Claimed +${task.reward} $NASTA! 🎁`, '🎉');
    renderTasks();
    updateUI();
  }

  // ===================================================================
  // 1. OFFICIAL ADSGRAM REWARDED ADS CONTROLLER (100% POLICY COMPLIANT)
  // ===================================================================
  const DEFAULT_ADSGRAM_BLOCK_ID = "50487";
  let adsgramController = null;

  function getAdsgramController() {
    if (!adsgramController && window.Adsgram && DEFAULT_ADSGRAM_BLOCK_ID) {
      try {
        adsgramController = window.Adsgram.init({ blockId: DEFAULT_ADSGRAM_BLOCK_ID });
      } catch (e) {
        console.warn("Adsgram initialization notice:", e);
      }
    }
    return adsgramController;
  }

  // Pre-initialize Adsgram on startup
  try {
    if (window.Adsgram && DEFAULT_ADSGRAM_BLOCK_ID) {
      adsgramController = window.Adsgram.init({ blockId: DEFAULT_ADSGRAM_BLOCK_ID });
    }
  } catch (e) {}

  function showRewardedAdFlow(onRewardSuccess, reason = 'bonus') {
    const controller = getAdsgramController();

    if (controller) {
      showToast('Loading sponsor video...', '📺');
      controller.show().then((result) => {
        triggerHaptic('notification', 'success');
        if (typeof onRewardSuccess === 'function') {
          onRewardSuccess();
        }
      }).catch((result) => {
        triggerHaptic('notification', 'warning');
        console.warn("Adsgram result notice:", result);
        if (result && result.done) {
          // User completed ad
          if (typeof onRewardSuccess === 'function') onRewardSuccess();
        } else if (result && (result.error || result.description)) {
          showToast('No sponsor video available right now. Please try again soon!', 'ℹ️');
        } else {
          showToast('Video closed early. Watch full ad to claim reward!', '⚠️');
        }
      });
      return;
    }

    // Friendly offline notice when testing outside Telegram
    showToast('Sponsor video network initializing. Please try again shortly!', '📺');
  }

  // --- Energy Refill Booster Handler ---
  const refillEnergyBtn = document.getElementById('refillEnergyBtn');
  if (refillEnergyBtn) {
    refillEnergyBtn.addEventListener('click', () => {
      if (state.energy >= state.maxEnergy && !state.cooldownEndTime) {
        showToast(`Energy is already full! (⚡ ${state.maxEnergy}/${state.maxEnergy})`, '⚡');
        triggerHaptic('notification', 'warning');
        return;
      }

      showRewardedAdFlow(() => {
        state.energy = state.maxEnergy;
        state.cooldownEndTime = null;
        saveState();
        updateUI();
        triggerHaptic('notification', 'success');
        showToast(`⚡ Energy 100% Refilled (${state.maxEnergy} Taps)!`, '🎉');
      }, 'energy_refill');
    });
  }

  // ===================================================================
  // 2. LUCKY FORTUNE WHEEL ARCADE ENGINE
  // ===================================================================
  const wheelSectors = [
    { label: '+100', sub: '$NASTA', color: '#00e5ff', textCol: '#070a12', type: 'coins', amount: 100 },
    { label: 'Refill', sub: '⚡ 100%', color: '#f59e0b', textCol: '#070a12', type: 'energy', amount: 30 },
    { label: '+250', sub: '$NASTA', color: '#8b5cf6', textCol: '#ffffff', type: 'coins', amount: 250 },
    { label: '2X Boost', sub: '🔥 15m', color: '#ef4444', textCol: '#ffffff', type: 'turbo', amount: 15 },
    { label: '+500', sub: '$NASTA', color: '#00e5ff', textCol: '#070a12', type: 'coins', amount: 500 },
    { label: '+1 Ticket', sub: '🎟️ Spin', color: '#10b981', textCol: '#070a12', type: 'ticket', amount: 1 },
    { label: 'JACKPOT', sub: '🌟 1,000', color: '#fcd34d', textCol: '#070a12', type: 'coins', amount: 1000 },
    { label: '+50', sub: '$NASTA', color: '#0284c7', textCol: '#ffffff', type: 'coins', amount: 50 }
  ];

  const wheelCanvas = document.getElementById('wheelCanvas');
  const wheelCenterSpinBtn = document.getElementById('wheelCenterSpinBtn');
  const spinWheelBtn = document.getElementById('spinWheelBtn');
  const buySpinCoinBtn = document.getElementById('buySpinCoinBtn');
  const watchAdSpinBtn = document.getElementById('watchAdSpinBtn');
  const spinsAvailableCount = document.getElementById('spinsAvailableCount');
  const spinResetTimer = document.getElementById('spinResetTimer');
  const spinPrizeModal = document.getElementById('spinPrizeModal');
  const prizeModalIcon = document.getElementById('prizeModalIcon');
  const prizeModalTitle = document.getElementById('prizeModalTitle');
  const prizeModalDesc = document.getElementById('prizeModalDesc');
  const closePrizeModalBtn = document.getElementById('closePrizeModalBtn');

  let isWheelSpinning = false;
  let currentWheelAngle = 0;

  function drawWheel(angleOffset = 0) {
    if (!wheelCanvas) return;
    const ctx = wheelCanvas.getContext('2d');
    const width = wheelCanvas.width;
    const height = wheelCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width / 2 - 10;
    const numSlices = wheelSectors.length;
    const arc = (2 * Math.PI) / numSlices;

    ctx.clearRect(0, 0, width, height);

    // Draw Outer Rim Glow
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#0e1526';
    ctx.shadowColor = 'rgba(0, 229, 255, 0.4)';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.restore();

    // Draw Slices
    for (let i = 0; i < numSlices; i++) {
      const slice = wheelSectors[i];
      const startAngle = i * arc + angleOffset;
      const endAngle = startAngle + arc;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();

      // Border between slices
      ctx.strokeStyle = '#070a12';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Text and Icons
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startAngle + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = slice.textCol;
      ctx.font = 'bold 13px Outfit, sans-serif';
      ctx.fillText(slice.label, radius - 18, 0);

      ctx.font = 'bold 10px Outfit, sans-serif';
      ctx.fillStyle = slice.textCol;
      ctx.fillText(slice.sub, radius - 18, 14);
      ctx.restore();

      ctx.restore();
    }

    // Outer Rim Pins
    for (let i = 0; i < numSlices * 2; i++) {
      const pinAngle = i * (Math.PI / numSlices) + angleOffset;
      const px = centerX + (radius + 2) * Math.cos(pinAngle);
      const py = centerY + (radius + 2) * Math.sin(pinAngle);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
    }
  }

  function updateArcadeUI() {
    if (spinsAvailableCount) {
      spinsAvailableCount.textContent = state.spinsAvailable || 0;
    }
    if (spinWheelBtn) {
      const avail = state.spinsAvailable || 0;
      if (avail > 0) {
        spinWheelBtn.disabled = false;
        spinWheelBtn.innerHTML = `<span>🎯</span> Spin the Wheel (${avail} Free)`;
        spinWheelBtn.classList.remove('btn-disabled');
      } else {
        spinWheelBtn.disabled = false;
        spinWheelBtn.innerHTML = `<span>🪙</span> Spin for 100 $NASTA`;
        spinWheelBtn.classList.remove('btn-disabled');
      }
    }

    // 12-hour reset countdown
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    const now = Date.now();
    const elapsed = now - (state.lastSpinResetTime || now);
    if (elapsed >= TWELVE_HOURS_MS) {
      state.spinsAvailable = 3;
      state.lastSpinResetTime = now;
      saveState();
    }
    const remainMs = Math.max(0, TWELVE_HOURS_MS - (now - (state.lastSpinResetTime || now)));
    const hh = String(Math.floor(remainMs / 3600000)).padStart(2, '0');
    const mm = String(Math.floor((remainMs % 3600000) / 60000)).padStart(2, '0');
    const ss = String(Math.floor((remainMs % 60000) / 1000)).padStart(2, '0');
    if (spinResetTimer) spinResetTimer.textContent = `${hh}:${mm}:${ss}`;
  }

  function spinWheel() {
    if (isWheelSpinning) return;

    // Check if free spin available or spend 100 $NASTA
    if ((state.spinsAvailable || 0) <= 0) {
      if (state.balance < 100) {
        showToast('Need 100 $NASTA points to spin! Or watch a sponsor video.', '⚠️');
        triggerHaptic('notification', 'warning');
        return;
      }
      state.balance -= 100;
      showToast('Spent 100 $NASTA for Fortune Spin! 🎯', '🪙');
    } else {
      state.spinsAvailable -= 1;
    }

    isWheelSpinning = true;
    if (spinWheelBtn) spinWheelBtn.disabled = true;
    triggerHaptic('impact', 'heavy');

    const winningIndex = Math.floor(Math.random() * wheelSectors.length);
    const winningSector = wheelSectors[winningIndex];

    const numSlices = wheelSectors.length;
    const arc = (2 * Math.PI) / numSlices;
    const sliceCenterAngle = winningIndex * arc + arc / 2;
    const extraRotations = (5 + Math.floor(Math.random() * 3)) * (2 * Math.PI);
    const targetAngle = extraRotations + (1.5 * Math.PI - sliceCenterAngle);

    const startTime = Date.now();
    const spinDuration = 4000;
    const startAngle = currentWheelAngle;

    function animateWheel() {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / spinDuration);
      const easeOut = 1 - Math.pow(1 - progress, 3);

      currentWheelAngle = startAngle + (targetAngle - startAngle) * easeOut;
      drawWheel(currentWheelAngle);

      if (progress < 1) {
        requestAnimationFrame(animateWheel);
      } else {
        isWheelSpinning = false;
        applyWheelPrize(winningSector);
        updateArcadeUI();
        updateUI();
      }
    }

    requestAnimationFrame(animateWheel);
  }

  function applyWheelPrize(sector) {
    triggerHaptic('notification', 'success');

    if (sector.type === 'coins') {
      state.balance += sector.amount;
      showPrizeModal('🌟', `+${sector.amount} $NASTA Won!`, `You won +${sector.amount} $NASTA Points from the Lucky Wheel!`);
    } else if (sector.type === 'energy') {
      state.energy = state.maxEnergy;
      state.cooldownEndTime = null;
      showPrizeModal('⚡', 'Full Energy Refill!', `Your tap pool is instantly restored to 100% (${state.maxEnergy} Taps)!`);
    } else if (sector.type === 'turbo') {
      state.turboActive = true;
      showPrizeModal('🔥', '2X Tap Booster Activated!', `Enjoy double earnings on every tap for the next 15 minutes!`);
      setTimeout(() => {
        state.turboActive = false;
        updateUI();
      }, 15 * 60 * 1000);
    } else if (sector.type === 'ticket') {
      state.spinsAvailable = (state.spinsAvailable || 0) + 1;
      showPrizeModal('🎟️', 'Extra Free Spin Ticket!', `You won +1 free spin ticket! Spin again right now.`);
    }

    saveState();
    updateUI();
  }

  function showPrizeModal(icon, title, desc) {
    if (prizeModalIcon) prizeModalIcon.textContent = icon;
    if (prizeModalTitle) prizeModalTitle.textContent = title;
    if (prizeModalDesc) prizeModalDesc.textContent = desc;
    if (spinPrizeModal) spinPrizeModal.classList.add('active');
  }

  if (closePrizeModalBtn) {
    closePrizeModalBtn.addEventListener('click', () => {
      if (spinPrizeModal) spinPrizeModal.classList.remove('active');
    });
  }

  // Wheel Buttons
  if (spinWheelBtn) spinWheelBtn.addEventListener('click', spinWheel);
  if (wheelCenterSpinBtn) wheelCenterSpinBtn.addEventListener('click', spinWheel);

  if (buySpinCoinBtn) {
    buySpinCoinBtn.addEventListener('click', () => {
      if (state.balance < 100) {
        showToast('Insufficient $NASTA points! Tap coin to earn more.', '⚠️');
        return;
      }
      state.balance -= 100;
      state.spinsAvailable = (state.spinsAvailable || 0) + 1;
      saveState();
      updateArcadeUI();
      updateUI();
      showToast('Purchased +1 Spin Ticket with 100 $NASTA! 🎟️', '🎉');
      triggerHaptic('notification', 'success');
    });
  }

  if (watchAdSpinBtn) {
    watchAdSpinBtn.addEventListener('click', () => {
      showRewardedAdFlow(() => {
        state.spinsAvailable = (state.spinsAvailable || 0) + 1;
        saveState();
        updateArcadeUI();
        showToast('🎟️ +1 Free Spin Ticket Earned from Sponsor Video!', '🎉');
      }, 'wheel_ticket');
    });
  }

  // Initial Wheel Canvas Render
  setTimeout(() => {
    drawWheel(0);
    updateArcadeUI();
    renderHardwareUpgrades();
    checkOfflineEarnings();
  }, 200);

  // Periodic Arcade Timer Ticker
  setInterval(updateArcadeUI, 1000);

  // ===================================================================
  // 3. AUTO-MINING BOT OFFLINE EARNINGS CHECK
  // ===================================================================
  function checkOfflineEarnings() {
    const botLvl = state.autoBotLevel || 0;
    if (botLvl <= 0) return;

    const now = Date.now();
    const lastCheck = state.lastOfflineCheck || now;
    const elapsedMs = now - lastCheck;
    if (elapsedMs < 60000) return; // Under 1 minute

    const maxHours = botLvl;
    const maxOfflineMs = maxHours * 3600 * 1000;
    const effectiveMs = Math.min(elapsedMs, maxOfflineMs);
    const minutes = Math.floor(effectiveMs / 60000);
    const coinsEarned = Math.floor(minutes * (botLvl * 6));

    if (coinsEarned > 0) {
      const offlineModal = document.getElementById('offlineEarningsModal');
      const offlineTokensEl = document.getElementById('offlineEarnedTokens');
      const claimBtn = document.getElementById('claimOfflineEarnedBtn');

      if (offlineTokensEl) offlineTokensEl.textContent = formatNumber(coinsEarned);
      if (offlineModal) offlineModal.classList.add('active');

      if (claimBtn) {
        claimBtn.onclick = () => {
          state.balance += coinsEarned;
          state.lastOfflineCheck = Date.now();
          saveState();
          updateUI();
          if (offlineModal) offlineModal.classList.remove('active');
          showToast(`Claimed +${formatNumber(coinsEarned)} $NASTA from Auto-Bot! 🤖`, '🎉');
          triggerHaptic('notification', 'success');
        };
      }
    }
    state.lastOfflineCheck = now;
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

  // --- Multi-Wallet Modal Logic ---
  const walletSelectModal = document.getElementById('walletSelectModal');
  const closeWalletSelectModalBtn = document.getElementById('closeWalletSelectModalBtn');
  const activeWalletBanner = document.getElementById('activeWalletBanner');
  const activeWalletTitle = document.getElementById('activeWalletTitle');
  const activeWalletShortAddr = document.getElementById('activeWalletShortAddr');
  const disconnectWalletBtn = document.getElementById('disconnectWalletBtn');
  const customTonAddressInput = document.getElementById('customTonAddressInput');
  const pasteAddressBtn = document.getElementById('pasteAddressBtn');
  const confirmCustomWalletBtn = document.getElementById('confirmCustomWalletBtn');
  const walletProviderItems = document.querySelectorAll('.wallet-provider-item');

  function openWalletSelectModal() {
    if (!walletSelectModal) return;
    triggerHaptic('selection');

    if (state.connectedTonWallet) {
      if (activeWalletBanner) activeWalletBanner.style.display = 'block';
      if (activeWalletTitle) activeWalletTitle.textContent = state.connectedWalletName || 'TON Wallet';
      if (activeWalletShortAddr) {
        const addr = state.connectedTonWallet;
        activeWalletShortAddr.textContent = `${addr.substring(0, 10)}...${addr.substring(addr.length - 8)}`;
      }
    } else {
      if (activeWalletBanner) activeWalletBanner.style.display = 'none';
    }

    if (customTonAddressInput) {
      customTonAddressInput.value = state.connectedTonWallet || '';
    }

    walletSelectModal.classList.add('active');
  }

  function closeWalletSelectModal() {
    if (walletSelectModal) walletSelectModal.classList.remove('active');
  }

  if (connectWalletBtn) {
    connectWalletBtn.addEventListener('click', openWalletSelectModal);
  }

  if (closeWalletSelectModalBtn) {
    closeWalletSelectModalBtn.addEventListener('click', closeWalletSelectModal);
  }

  // Handle Provider Selection (Telegram Wallet, Tonkeeper, Tonhub, MyTonWallet, Other)
  walletProviderItems.forEach(item => {
    item.addEventListener('click', () => {
      const walletName = item.getAttribute('data-name') || 'TON Wallet';
      triggerHaptic('selection');

      const existingAddr = state.connectedTonWallet || '';
      const promptMsg = `Enter your ${walletName} address (UQ... or EQ...):`;
      const inputAddr = prompt(promptMsg, existingAddr);

      if (inputAddr !== null) {
        const clean = inputAddr.trim();
        if (clean.length < 10) {
          showToast('Please enter a valid TON address!', '⚠️');
          return;
        }
        setConnectedWallet(clean, walletName);
      }
    });
  });

  // Paste from clipboard
  if (pasteAddressBtn && customTonAddressInput) {
    pasteAddressBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          customTonAddressInput.value = text.trim();
          showToast('Address pasted from clipboard!', '📋');
        }
      } catch (e) {
        showToast('Please paste manually into the input', '✍️');
      }
    });
  }

  // Confirm custom address
  if (confirmCustomWalletBtn && customTonAddressInput) {
    confirmCustomWalletBtn.addEventListener('click', () => {
      const addr = customTonAddressInput.value.trim();
      if (!addr || addr.length < 10) {
        triggerHaptic('notification', 'error');
        showToast('Please enter a valid TON address (UQ... or EQ...)!', '⚠️');
        return;
      }
      setConnectedWallet(addr, 'Custom TON Wallet');
    });
  }

  // Disconnect wallet
  if (disconnectWalletBtn) {
    disconnectWalletBtn.addEventListener('click', () => {
      state.connectedTonWallet = null;
      state.connectedWalletName = null;
      state.walletUpdatedAt = Date.now();
      saveState(true);
      if (tg?.CloudStorage) {
        try {
          tg.CloudStorage.removeItem('nasta_user_wallet_v1', () => {});
        } catch (e) {}
      }
      triggerHaptic('notification', 'warning');
      showToast('TON Wallet Disconnected', '🔌');
      closeWalletSelectModal();
      updateUI();
    });
  }

  function setConnectedWallet(address, providerName) {
    state.connectedTonWallet = address;
    state.connectedWalletName = providerName;
    state.walletUpdatedAt = Date.now();
    if (state.tonBalance === 0) state.tonBalance = 1.25;
    if (state.usdtBalance === 0) state.usdtBalance = 5.0;
    
    // Immediate cross-device cloud sync
    saveState(true);

    // Save under isolated dedicated key in Telegram CloudStorage
    if (tg?.CloudStorage) {
      try {
        const walletPayload = JSON.stringify({
          address: address,
          name: providerName,
          updatedAt: state.walletUpdatedAt
        });
        tg.CloudStorage.setItem('nasta_user_wallet_v1', walletPayload, (err) => {
          if (err) console.warn('Dedicated wallet cloud save notice:', err);
        });
      } catch (e) {}
    }

    triggerHaptic('notification', 'success');
    showToast(`${providerName} Connected! 💎`, '✅');
    closeWalletSelectModal();
    updateUI();
  }

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

    // --- Video Opening Intro Controller (Zero Popups, 100% Clean Fullscreen) ---
    const splashScreen = document.getElementById('splashScreen');
    const introVideo = document.getElementById('introVideo');
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

    // Invisible global un-mute listener: If mobile blocks audio at 0s, any touch instantly unmutes with zero popups
    const silentUnmuteOnTouch = () => {
      if (introVideo && introVideo.muted) {
        introVideo.muted = false;
        introVideo.volume = 1.0;
      }
    };
    window.addEventListener('click', silentUnmuteOnTouch, { passive: true });
    window.addEventListener('touchstart', silentUnmuteOnTouch, { passive: true });

    // Video Playback Events
    if (introVideo) {
      introVideo.muted = false;
      introVideo.volume = 1.0;

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

      // Try autoplay with sound directly
      const playPromise = introVideo.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.log('Mobile autoplay policy: video starting muted, unmuting on touch:', err);
          introVideo.muted = true;
          introVideo.play().catch(e => {});
        });
      }

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

