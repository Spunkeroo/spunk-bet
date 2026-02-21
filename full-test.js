// Full end-to-end test of game functions
const { webcrypto } = require('crypto');
global.crypto = webcrypto;

const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Extract ALL script blocks
const allScripts = [];
let re = /<script(?:\s+type="([^"]*)")?\s*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html)) !== null) {
  const type = m[1] || 'text/javascript';
  if (type === 'application/ld+json') continue; // Skip JSON-LD
  if (m[2].trim().length > 0) allScripts.push(m[2]);
}

console.log('Found', allScripts.length, 'JS script blocks');
console.log('Sizes:', allScripts.map(s => s.length));

// Combine all JS
const combinedJS = allScripts.join('\n;\n');

// Full DOM mock
const domStore = {};
const mockEl = (id) => ({
  _id: id, className: '', textContent: '', innerHTML: '', value: '1000',
  style: new Proxy({}, { set: () => true, get: (t, p) => p === 'setProperty' ? () => {} : '' }),
  classList: {
    _classes: new Set(),
    add: function() { for (const c of arguments) this._classes.add(c); },
    remove: function() { for (const c of arguments) this._classes.delete(c); },
    toggle: function(c, force) { if (force === undefined) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); } else if (force) this._classes.add(c); else this._classes.delete(c); },
    contains: function(c) { return this._classes.has(c); },
  },
  dataset: {}, disabled: false, checked: false,
  appendChild: function() {}, removeChild: function() {},
  querySelector: function() { return mockEl('sub'); },
  querySelectorAll: function() { return []; },
  scrollLeft: 0, onclick: null, oninput: null,
  offsetWidth: 800, offsetHeight: 600, width: 800, height: 600,
  getContext: function() {
    return new Proxy({}, { get: (t, p) => {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop: () => {} });
      if (typeof t[p] === 'function') return t[p];
      return () => {};
    }, set: () => true });
  },
  addEventListener: function() {},
  getBoundingClientRect: function() { return { top: 0, left: 0, width: 800, height: 600 }; },
  parentElement: null,
  children: [],
  focus: function() {},
  blur: function() {},
  remove: function() {},
  parentNode: { removeChild: function() {} },
});

global.document = {
  getElementById: (id) => { if (!domStore[id]) domStore[id] = mockEl(id); return domStore[id]; },
  querySelectorAll: (sel) => {
    if (sel === '.keno-cell') return Array.from({length: 40}, (_, i) => { const e = mockEl('keno-cell-'+i); e.dataset = {}; return e; });
    if (sel === '.mine-cell') return Array.from({length: 25}, (_, i) => { const e = mockEl('mine-'+i); e.dataset = { index: String(i) }; return e; });
    if (sel === '.game-card') return [];
    if (sel === '.nav-tab') return Array.from({length: 5}, () => mockEl('tab'));
    if (sel === '.page') return [];
    if (sel.includes('tower-cell')) return [];
    if (sel.includes('keno-payout-slot')) return [];
    return [];
  },
  querySelector: (sel) => mockEl('qs'),
  createElement: (tag) => mockEl(tag),
  addEventListener: () => {},
  body: mockEl('body'),
};
global.location = { protocol: 'https:', hostname: 'spunk.bet', host: 'spunk.bet', pathname: '/', search: '', href: 'https://spunk.bet/', hash: '', replace: () => {} };
global.dataLayer = [];
global.gtag = function() { dataLayer.push(arguments); };
global.fetchLiveStats = async function() { return null; };
global.trackEvent = function() {};
global.trackPageView = function() {};
global.trackGamePlay = function() {};
global.window = { open: () => {}, scrollTo: () => {}, onerror: null, addEventListener: () => {}, location: global.location, innerWidth: 1200, matchMedia: () => ({ matches: false }) };
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k,v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
global.sessionStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k,v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
global.navigator = { clipboard: { writeText: () => Promise.resolve() }, userAgent: 'test' };
global.requestAnimationFrame = (cb) => { setTimeout(cb, 16); return 1; };
global.cancelAnimationFrame = () => {};
global.performance = { now: () => Date.now() };
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;
global.setInterval = () => 0;
global.clearInterval = () => {};
global.TextEncoder = TextEncoder;
global.Uint8Array = Uint8Array;
global.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
global.Image = class { set src(v) { if (this.onerror) this.onerror(); } set onload(v) {} set onerror(v) { this._onerror = v; } get onerror() { return this._onerror; } };
global.alert = () => {};
global.confirm = () => true;
global.prompt = () => '';
global.console = console;
global.XMLHttpRequest = class {};
global.MutationObserver = class { observe() {} disconnect() {} };
global.IntersectionObserver = class { observe() {} disconnect() {} };
global.ResizeObserver = class { observe() {} disconnect() {} };
global.getComputedStyle = () => new Proxy({}, { get: (t, p) => p === 'getPropertyValue' ? () => '#ff5f1f' : '#ff5f1f' });

// Load only the main game JS (largest block), skip analytics scripts
let mainJS = allScripts[allScripts.length - 1];
// Convert let/const to var so they become global in eval
mainJS = mainJS.replace(/^(let|const) /gm, 'var ');
mainJS = mainJS.replace(/\n(let|const) /g, '\nvar ');
try {
  (0, eval)(mainJS); // indirect eval = global scope
  console.log('\nMAIN JS LOADED SUCCESSFULLY (' + mainJS.length + ' chars)\n');
} catch(e) {
  console.error('\nJS LOAD ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
}

// Test games
async function runTests() {
  // Init
  balance = 100000;
  updateBalance();

  try { await initProvablyFair(); } catch(e) { console.log('PF init caught:', e.message); }
  console.log('pfState:', pfState.serverSeed ? 'VALID' : 'EMPTY', 'nonce:', pfState.nonce);

  const tests = [
    { name: 'Coin Flip', fn: flipCoin, pre: () => { cfSide = 'heads'; domStore['cf-bet'] = mockEl('cf-bet'); domStore['cf-bet'].value = '1000'; } },
    { name: 'Dice', fn: rollDice, pre: () => { domStore['dice-bet'] = mockEl('dice-bet'); domStore['dice-bet'].value = '1000'; domStore['dice-slider'] = mockEl('dice-slider'); domStore['dice-slider'].value = '50'; } },
    { name: 'Limbo', fn: playLimbo, pre: () => { domStore['limbo-bet'] = mockEl('limbo-bet'); domStore['limbo-bet'].value = '1000'; domStore['limbo-target'] = mockEl('limbo-target'); domStore['limbo-target'].value = '2'; } },
    { name: 'Keno', fn: playKenoAnimated, pre: () => { kenoSelected = new Set([1,2,3,4,5]); domStore['keno-bet'] = mockEl('keno-bet'); domStore['keno-bet'].value = '1000'; } },
    { name: 'Plinko', fn: dropPlinko, pre: () => { domStore['plinko-bet'] = mockEl('plinko-bet'); domStore['plinko-bet'].value = '1000'; } },
  ];

  let allPassed = true;
  for (const test of tests) {
    console.log('--- Testing', test.name, '---');
    let passed = true;

    for (let play = 1; play <= 3; play++) {
      balance = 100000;
      test.pre();
      const bBefore = balance;

      try {
        await test.fn();
        // Wait for setTimeout callbacks
        await new Promise(r => setTimeout(r, 1200));
        console.log('  Play', play + ':', 'balance', bBefore, '->', balance, (balance !== bBefore ? 'CHANGED' : 'NO CHANGE'));
      } catch(e) {
        console.error('  Play', play + ':', 'ERROR -', e.message);
        passed = false;
      }
    }

    // Check guard flag is reset
    const guardFlags = {
      'Coin Flip': () => coinFlipping,
      'Dice': () => diceRolling,
      'Limbo': () => limboPlaying,
      'Keno': () => kenoPlaying,
      'Plinko': () => plinkoDropping,
    };
    const flagFn = guardFlags[test.name];
    if (flagFn) {
      const flagValue = flagFn();
      if (flagValue) {
        console.error('  GUARD FLAG STUCK:', test.name, '= true');
        passed = false;
      } else {
        console.log('  Guard flag: reset OK');
      }
    }

    console.log('  Result:', passed ? 'PASS' : 'FAIL');
    if (!passed) allPassed = false;
  }

  console.log('\n=== OVERALL:', allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED', '===');
}

runTests().catch(e => console.error('FATAL:', e));
