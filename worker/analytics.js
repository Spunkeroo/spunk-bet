/**
 * Spunk.Bet Analytics Worker
 * Cloudflare Worker + KV for real cross-user analytics
 *
 * SETUP:
 * 1. Go to dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Paste this code
 * 3. Go to Settings → Variables → KV Namespace Bindings
 * 4. Create KV namespace "SPUNK_ANALYTICS" and bind it as "ANALYTICS"
 * 5. Add custom domain or use the workers.dev URL
 * 6. Update WORKER_URL in index.html to your worker URL
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'POST' && url.pathname === '/track') {
        return await handleTrack(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/stats') {
        return await handleStats(request, env);
      }
      if (request.method === 'GET' && url.pathname === '/stats/admin') {
        return await handleAdminStats(request, env);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: 'Internal error' }, 500);
    }
  }
};

// ===== TRACK EVENTS =====
async function handleTrack(request, env) {
  const body = await request.json().catch(() => ({}));
  const event = body.event;
  if (!event) return json({ error: 'Missing event' }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const hour = new Date().getUTCHours();
  const weekStart = getWeekStart();

  // Extract visitor info from headers
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const country = request.headers.get('CF-IPCountry') || '??';
  const ua = request.headers.get('User-Agent') || '';
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  const device = isMobile ? 'mobile' : 'desktop';

  // Hash IP for privacy (no raw IPs stored)
  const visitorId = await hashString(ip + today);
  const weeklyVisitorId = await hashString(ip + weekStart);

  const KV = env.ANALYTICS;

  // ===== Event handlers =====
  if (event === 'visit') {
    // Daily unique visitors
    const dailyKey = `uv:${today}`;
    const dailySet = await getSet(KV, dailyKey);
    const isNewDaily = !dailySet.has(visitorId);
    if (isNewDaily) {
      dailySet.add(visitorId);
      await KV.put(dailyKey, JSON.stringify([...dailySet]), { expirationTtl: 90 * 86400 });
    }

    // Weekly unique visitors
    const weeklyKey = `uv:week:${weekStart}`;
    const weeklySet = await getSet(KV, weeklyKey);
    if (!weeklySet.has(weeklyVisitorId)) {
      weeklySet.add(weeklyVisitorId);
      await KV.put(weeklyKey, JSON.stringify([...weeklySet]), { expirationTtl: 90 * 86400 });
    }

    // Total page views (not unique)
    await increment(KV, `pv:${today}`);
    await increment(KV, 'pv:total');

    // Hourly distribution
    await increment(KV, `hour:${today}:${hour}`);

    // Country stats
    await increment(KV, `country:${today}:${country}`);
    await increment(KV, `country:total:${country}`);

    // Device stats
    await increment(KV, `device:${today}:${device}`);

    // Referrer tracking
    const ref = body.ref || '';
    if (ref) {
      await increment(KV, `ref:${today}:${ref}`);
      await increment(KV, `ref:total:${ref}`);
    }

    // Page tracking
    const page = body.page || 'home';
    await increment(KV, `page:${today}:${page}`);

    return json({ ok: true, new_visitor: isNewDaily });
  }

  if (event === 'game_play') {
    const game = body.game || 'unknown';
    const bet = body.bet || 0;
    const result = body.result || '';

    await increment(KV, `games:${today}:${game}`);
    await increment(KV, `games:total:${game}`);
    await increment(KV, 'games:total:all');
    await increment(KV, `games:${today}:all`);

    // Track wager volume
    await incrementBy(KV, `wager:${today}`, bet);
    await incrementBy(KV, 'wager:total', bet);

    // Track wins
    if (result === 'win') {
      await increment(KV, `wins:${today}:${game}`);
      await increment(KV, 'wins:total');
    }

    return json({ ok: true });
  }

  if (event === 'faucet_claim') {
    await increment(KV, `faucet:${today}`);
    await increment(KV, 'faucet:total');
    return json({ ok: true });
  }

  if (event === 'wallet_connect') {
    await increment(KV, `wallet:${today}`);
    await increment(KV, 'wallet:total');
    return json({ ok: true });
  }

  if (event === 'share') {
    const platform = body.platform || 'x';
    await increment(KV, `share:${today}:${platform}`);
    await increment(KV, 'share:total');
    return json({ ok: true });
  }

  if (event === 'referral_click') {
    const code = body.code || '';
    if (code) {
      await increment(KV, `refclick:${today}:${code}`);
      await increment(KV, `refclick:total:${code}`);
    }
    await increment(KV, `refclick:${today}`);
    return json({ ok: true });
  }

  return json({ ok: true });
}

// ===== PUBLIC STATS (safe to expose) =====
async function handleStats(request, env) {
  const KV = env.ANALYTICS;
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStart();

  const [
    todayUV, weekUV, todayPV, totalPV,
    todayGames, totalGames, todayWager, totalWager,
    todayFaucet, totalFaucet, totalShares, totalWallets
  ] = await Promise.all([
    getSet(KV, `uv:${today}`).then(s => s.size),
    getSet(KV, `uv:week:${weekStart}`).then(s => s.size),
    getNum(KV, `pv:${today}`),
    getNum(KV, 'pv:total'),
    getNum(KV, `games:${today}:all`),
    getNum(KV, 'games:total:all'),
    getNum(KV, `wager:${today}`),
    getNum(KV, 'wager:total'),
    getNum(KV, `faucet:${today}`),
    getNum(KV, 'faucet:total'),
    getNum(KV, 'share:total'),
    getNum(KV, 'wallet:total'),
  ]);

  return json({
    today: {
      unique_visitors: todayUV,
      page_views: todayPV,
      games_played: todayGames,
      wager_volume: todayWager,
      faucet_claims: todayFaucet,
    },
    week: {
      unique_visitors: weekUV,
    },
    all_time: {
      total_page_views: totalPV,
      total_games: totalGames,
      total_wagered: totalWager,
      total_faucet_claims: totalFaucet,
      total_shares: totalShares,
      total_wallet_connects: totalWallets,
    },
    timestamp: new Date().toISOString(),
  });
}

// ===== ADMIN STATS (detailed breakdown) =====
async function handleAdminStats(request, env) {
  const KV = env.ANALYTICS;
  const today = new Date().toISOString().slice(0, 10);

  // Get last 7 days of data
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const [uv, pv, games, wager, faucet] = await Promise.all([
      getSet(KV, `uv:${d}`).then(s => s.size),
      getNum(KV, `pv:${d}`),
      getNum(KV, `games:${d}:all`),
      getNum(KV, `wager:${d}`),
      getNum(KV, `faucet:${d}`),
    ]);
    days.push({ date: d, unique_visitors: uv, page_views: pv, games_played: games, wager_volume: wager, faucet_claims: faucet });
  }

  // Game breakdown for today
  const gameTypes = ['coinflip', 'dice', 'mines', 'crash', 'limbo', 'keno', 'wheel', 'plinko', 'hilo', 'tower'];
  const gameStats = {};
  for (const g of gameTypes) {
    gameStats[g] = {
      today: await getNum(KV, `games:${today}:${g}`),
      total: await getNum(KV, `games:total:${g}`),
    };
  }

  // Top countries today
  const countries = {};
  const countryKeys = await KV.list({ prefix: `country:${today}:` });
  for (const key of countryKeys.keys) {
    const country = key.name.split(':').pop();
    countries[country] = await getNum(KV, key.name);
  }

  // Device breakdown today
  const devices = {
    mobile: await getNum(KV, `device:${today}:mobile`),
    desktop: await getNum(KV, `device:${today}:desktop`),
  };

  // Hourly distribution today
  const hourly = {};
  for (let h = 0; h < 24; h++) {
    hourly[h] = await getNum(KV, `hour:${today}:${h}`);
  }

  return json({
    daily: days,
    games: gameStats,
    countries,
    devices,
    hourly,
    timestamp: new Date().toISOString(),
  });
}

// ===== HELPERS =====
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function getSet(KV, key) {
  try {
    const val = await KV.get(key);
    return new Set(val ? JSON.parse(val) : []);
  } catch { return new Set(); }
}

async function getNum(KV, key) {
  try {
    const val = await KV.get(key);
    return val ? parseInt(val) || 0 : 0;
  } catch { return 0; }
}

async function increment(KV, key) {
  const current = await getNum(KV, key);
  await KV.put(key, String(current + 1), { expirationTtl: 365 * 86400 });
}

async function incrementBy(KV, key, amount) {
  const current = await getNum(KV, key);
  await KV.put(key, String(current + amount), { expirationTtl: 365 * 86400 });
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function getWeekStart() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff)).toISOString().slice(0, 10);
}
