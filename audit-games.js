// =============================================================
// SPUNK.BET GAME INTEGRITY CHECKER
// Validates every game: functions, DOM, CSS, logic, visuals
// Auto-fixes known issues when possible
// =============================================================

const fs = require('fs');
const INDEX = '/Users/spunkart/spunk-bet/index.html';
const html = fs.readFileSync(INDEX, 'utf8');
let errors = [];
let fixes = [];
let fileContent = html;

// Extract all JS code
const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
const jsCode = scriptBlocks.map(b => b.replace(/<\/?script[^>]*>/gi, '')).join('\n');

// Extract all CSS code
const styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
const cssCode = styleBlocks.map(b => b.replace(/<\/?style[^>]*>/gi, '')).join('\n');

// =====================================================
// GAME REGISTRY — every game and what it needs
// =====================================================
const GAMES = {
  dice: {
    page: 'dice',
    functions: ['rollDice', 'updateDiceSlider'],
    elements: ['dice-bet', 'dice-result'],
    css: [],
    historyName: 'Dice',
  },
  coinflip: {
    page: 'coinflip',
    functions: ['flipCoin', 'pickSide'],
    elements: ['cf-bet', 'cf-result'],
    css: [],
    historyName: 'Coin Flip',
  },
  mines: {
    page: 'mines',
    functions: ['startMines', 'initMinesGrid', 'revealMine'],
    elements: ['mines-bet', 'mines-grid', 'mines-result'],
    css: ['.mine-cell'],
    historyName: 'Mines',
  },
  plinko: {
    page: 'plinko',
    functions: ['startPlinkoAnimLoop', 'drawPlinkoBoard'],
    elements: ['plinko-bet', 'plinko-canvas', 'plinko-result'],
    css: [],
    historyName: 'Plinko',
  },
  crash: {
    page: 'crash',
    functions: ['startCrash'],
    elements: ['crash-bet', 'crash-result'],
    css: [],
    historyName: 'Crash',
  },
  keno: {
    page: 'keno',
    functions: ['playKenoAnimated', 'initKenoGrid', 'toggleKenoCell', 'getKenoMultiplier', 'renderKenoPayoutTable'],
    elements: ['keno-bet', 'keno-grid', 'keno-result', 'keno-drawn-area', 'keno-selected-count', 'keno-payout-line'],
    css: ['.keno-cell', '.keno-cell.keno-hit', '.keno-cell.drawn.miss', '.keno-ball', '.keno-ball.hit', '.keno-ball.miss'],
    historyName: 'Keno',
  },
  wheel: {
    page: 'wheel',
    functions: ['spinWheel', 'drawWheel'],
    elements: ['wheel-bet', 'wheel-result'],
    css: [],
    historyName: 'Wheel',
  },
  limbo: {
    page: 'limbo',
    functions: ['playLimbo', 'updateLimboDisplay'],
    elements: ['limbo-bet', 'limbo-result'],
    css: [],
    historyName: 'Limbo',
  },
  hilo: {
    page: 'hilo',
    functions: ['startHiLo'],
    elements: ['hilo-bet', 'hilo-result'],
    css: [],
    historyName: 'HiLo',
  },
  tower: {
    page: 'tower',
    functions: ['startTower', 'initTowerGrid'],
    elements: ['tower-bet', 'tower-result', 'tower-grid'],
    css: ['.tower-cell'],
    historyName: 'Rune Tower',
  },
};

// =====================================================
// CHECK 1: Every game function exists
// =====================================================
for (const [game, cfg] of Object.entries(GAMES)) {
  for (const fn of cfg.functions) {
    const fnRegex = new RegExp('function\\s+' + fn + '\\s*\\(|(?:const|let|var)\\s+' + fn + '\\s*=');
    if (!fnRegex.test(jsCode)) {
      errors.push('GAME ' + game + ': missing function ' + fn + '()');
    }
  }
}

// =====================================================
// CHECK 2: Every game DOM element exists
// =====================================================
for (const [game, cfg] of Object.entries(GAMES)) {
  for (const el of cfg.elements) {
    if (!html.includes('id="' + el + '"')) {
      errors.push('GAME ' + game + ': missing DOM element id="' + el + '"');
    }
  }
}

// =====================================================
// CHECK 3: Every game page div exists
// =====================================================
for (const [game, cfg] of Object.entries(GAMES)) {
  if (!html.includes('id="' + cfg.page + '"')) {
    errors.push('GAME ' + game + ': missing page div id="' + cfg.page + '"');
  }
}

// =====================================================
// CHECK 4: CSS rules exist for game elements
// =====================================================
for (const [game, cfg] of Object.entries(GAMES)) {
  for (const sel of cfg.css) {
    if (!cssCode.includes(sel)) {
      errors.push('GAME ' + game + ': missing CSS rule for "' + sel + '"');
    }
  }
}

// =====================================================
// CHECK 5: KENO — hit lighting integrity
// =====================================================

// CSS: .keno-cell.keno-hit must have glow + animation
if (!cssCode.includes('.keno-cell.keno-hit')) {
  errors.push('KENO: CSS rule .keno-cell.keno-hit is missing — hits wont glow');
}
const kenoHitCssMatch = cssCode.match(/\.keno-cell\.keno-hit[^{]*\{([^}]+)\}/);
if (kenoHitCssMatch) {
  const rule = kenoHitCssMatch[1];
  if (!rule.includes('box-shadow')) {
    errors.push('KENO: .keno-cell.keno-hit missing box-shadow — no glow on hits');
  }
  if (!rule.includes('animation') && !rule.includes('transform')) {
    errors.push('KENO: .keno-cell.keno-hit missing animation — hits dont animate');
  }
}

// kenoHitPulse keyframes
if (!cssCode.includes('@keyframes kenoHitPulse')) {
  errors.push('KENO: @keyframes kenoHitPulse animation missing');
}

// Ball hit styling
if (!cssCode.includes('.keno-ball.hit')) {
  errors.push('KENO: .keno-ball.hit CSS rule missing');
}
const ballHitMatch = cssCode.match(/\.keno-ball\.hit\s*\{([^}]+)\}/);
if (ballHitMatch && !ballHitMatch[1].includes('box-shadow')) {
  errors.push('KENO: .keno-ball.hit missing box-shadow — hit balls dont glow');
}

// playKenoAnimated must mark hits on cells
const kenoAnimFn = jsCode.match(/async function playKenoAnimated[\s\S]*?(?=\n(?:async )?function |\/\/ =====)/);
if (kenoAnimFn) {
  const fnCode = kenoAnimFn[0];
  if (!fnCode.includes("classList.add('keno-hit')") && !fnCode.includes("classList.add('hit')")) {
    errors.push('KENO: playKenoAnimated not adding hit class to cells');
  }
  // CRITICAL: selected class must be ensured
  if (!fnCode.includes("'selected'") && !fnCode.includes('.selected')) {
    errors.push('KENO: playKenoAnimated missing selected class on hits — GLOW WILL NOT SHOW');
    // AUTO-FIX
    if (fileContent.includes("cell.classList.add('hit');") && !fileContent.includes("if (!cell.classList.contains('selected'))")) {
      fileContent = fileContent.replace(
        /cell\.classList\.add\('hit'\);\n(\s+)\/\/ Force the selected/g,
        "cell.classList.add('hit');\n$1if (!cell.classList.contains('selected')) cell.classList.add('selected');\n$1// Force the selected"
      );
      if (fileContent !== html) {
        fixes.push('KENO: auto-added selected class assertion in playKenoAnimated');
      }
    }
  }
  // Checkmark on hits
  if (!fnCode.includes('\u2713') && !fnCode.includes('✓') && !fnCode.includes('\\u2713')) {
    errors.push('KENO: playKenoAnimated missing checkmark on hit cells');
  }
} else {
  errors.push('KENO: playKenoAnimated function not found');
}

// Also check non-animated playKeno
const kenoFn = jsCode.match(/async function playKeno\b[\s\S]*?(?=\n(?:async )?function |\/\/ =====)/);
if (kenoFn) {
  if (!kenoFn[0].includes("'selected'") && !kenoFn[0].includes('.selected')) {
    errors.push('KENO: playKeno() missing selected class on hits');
  }
}

// =====================================================
// CHECK 6: MINES — reveal states
// =====================================================
if (!cssCode.includes('.mine-cell')) {
  errors.push('MINES: .mine-cell CSS rule missing');
}
if (!jsCode.includes('revealMine')) {
  errors.push('MINES: revealMine function missing');
}

// =====================================================
// CHECK 7: All games show results
// =====================================================
for (const [game, cfg] of Object.entries(GAMES)) {
  const resultEl = cfg.elements.find(e => e.endsWith('-result'));
  if (resultEl && !jsCode.includes("'" + resultEl + "'") && !jsCode.includes('"' + resultEl + '"')) {
    errors.push('GAME ' + game + ': no reference to result element "' + resultEl + '"');
  }
}

// =====================================================
// CHECK 8: All games track history via addHistory
// =====================================================
for (const [game, cfg] of Object.entries(GAMES)) {
  const name = cfg.historyName;
  if (name && !jsCode.includes("addHistory('" + name + "'")) {
    errors.push('GAME ' + game + ': no addHistory("' + name + '") call — results not tracked');
  }
}

// =====================================================
// CHECK 9: Provably fair exists
// =====================================================
if (!jsCode.includes('function fairRandom') && !jsCode.includes('fairRandom =')) {
  errors.push('CRITICAL: fairRandom function missing — provably fair broken');
}

// =====================================================
// CHECK 10: Game pages accessible via openGame or showPage
// =====================================================
for (const [game, cfg] of Object.entries(GAMES)) {
  // Check game page is linked somewhere in the HTML (game card, nav, etc.)
  if (!html.includes("openGame('" + cfg.page + "')") && !html.includes('openGame("' + cfg.page + '")') &&
      !html.includes("showPage('" + cfg.page + "')") && !html.includes('showPage("' + cfg.page + '")')) {
    errors.push('GAME ' + game + ': no link to open game page "' + cfg.page + '"');
  }
}

// =====================================================
// CHECK 11: Share functions + @SpunkArt13
// =====================================================
const shareFns = ['shareWinOnX', 'shareReferralOnX', 'shareBigWinOnX', 'shareStreakOnX', 'shareDailySpinOnX', 'sharePrizeOnX'];
for (const fn of shareFns) {
  if (!jsCode.includes('function ' + fn)) {
    errors.push('SHARE: function ' + fn + ' missing');
  }
}
const tweetSection = jsCode.match(/TWEET_TEMPLATES[\s\S]*?\];/);
if (tweetSection && !tweetSection[0].includes('@SpunkArt13')) {
  errors.push('SHARE: Tweet templates missing @SpunkArt13 tag');
}

// =====================================================
// CHECK 12: Faucet + daily spin
// =====================================================
if (!jsCode.includes('function claimFaucet')) errors.push('FAUCET: claimFaucet missing');
if (!html.includes('id="daily-spin-btn"')) errors.push('DAILY SPIN: button missing');
if (!jsCode.includes('function openDailySpin')) errors.push('DAILY SPIN: openDailySpin missing');

// =====================================================
// CHECK 13: Wallet connect
// =====================================================
for (const fn of ['connectXverse', 'connectUnisat', 'connectMagicEden', 'onWalletConnected']) {
  if (!jsCode.includes('function ' + fn)) {
    errors.push('WALLET: function ' + fn + ' missing');
  }
}

// =====================================================
// CHECK 14: Analytics
// =====================================================
if (!jsCode.includes('spunkbet_analytics')) errors.push('ANALYTICS: tracking missing');
if (!jsCode.includes('spunkStats')) errors.push('ANALYTICS: spunkStats missing');

// =====================================================
// CHECK 15: Bet validation — all games must check min bet
// =====================================================
if (!jsCode.includes('getBet')) {
  errors.push('CRITICAL: getBet function missing — bet validation broken');
}

// =====================================================
// CHECK 16: Balance update calls after game
// =====================================================
if (!jsCode.includes('function updateBalance')) {
  errors.push('CRITICAL: updateBalance function missing');
}
if (!jsCode.includes('function saveState')) {
  errors.push('CRITICAL: saveState function missing');
}

// =====================================================
// CHECK 17: Prize wallet scanning system
// =====================================================
if (!jsCode.includes('PRIZE_WALLET')) {
  errors.push('PRIZES: PRIZE_WALLET constant missing');
}
if (!jsCode.includes('scanPrizeWallet')) {
  errors.push('PRIZES: scanPrizeWallet function missing');
}
if (!jsCode.includes('renderPrizes')) {
  errors.push('PRIZES: renderPrizes function missing');
}
if (!html.includes('id="prize-grid"')) {
  errors.push('PRIZES: prize-grid DOM element missing');
}
// Check fallback API exists
if (!jsCode.includes('api.hiro.so') && !jsCode.includes('ordinals.com')) {
  errors.push('PRIZES: no fallback API for prize scanning — will fail on ME rate limit');
}
// Check prize caching
if (!jsCode.includes('spunkbet_prizes')) {
  errors.push('PRIZES: no localStorage caching — prizes wont persist through rate limits');
}
// Check auto-scan interval
if (!jsCode.includes('setInterval(scanPrizeWallet')) {
  errors.push('PRIZES: no auto-scan interval set');
}

// =====================================================
// APPLY FIXES
// =====================================================
if (fixes.length > 0 && fileContent !== html) {
  fs.writeFileSync(INDEX, fileContent);
}

// Output
console.log(JSON.stringify({
  errors,
  fixes,
  gamesChecked: Object.keys(GAMES).length,
  functionsChecked: Object.values(GAMES).reduce((a, g) => a + g.functions.length, 0),
  elementsChecked: Object.values(GAMES).reduce((a, g) => a + g.elements.length, 0),
}));
