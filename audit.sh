#!/bin/bash
# =============================================================
# SPUNK.BET SITE AUDIT — Runs every 30 minutes
# Checks: site uptime, HTML, JS syntax, assets, games integrity,
#         CSS rules, DOM elements, functions, and auto-fixes
# =============================================================

REPO="/Users/spunkart/spunk-bet"
LOG="/Users/spunkart/spunk-bet/audit.log"
INDEX="$REPO/index.html"
SITE_URL="https://spunk.bet"
FIXED=0
ERRORS=0

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

log() { echo "[$(timestamp)] $1" >> "$LOG"; }
log_err() { echo "[$(timestamp)] ERROR: $1" >> "$LOG"; ERRORS=$((ERRORS + 1)); }
log_fix() { echo "[$(timestamp)] FIXED: $1" >> "$LOG"; FIXED=$((FIXED + 1)); }

# Keep log file under 5000 lines
if [ -f "$LOG" ]; then
  LINES=$(wc -l < "$LOG" | tr -d ' ')
  if [ "$LINES" -gt 5000 ]; then
    tail -2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
fi

log "========== AUDIT START =========="

# --- 1. Check site is live ---
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  log "Site UP (HTTP $HTTP_CODE)"
else
  log_err "Site returned HTTP $HTTP_CODE"
fi

# --- 2. Check index.html exists and is not empty ---
if [ ! -f "$INDEX" ]; then
  log_err "index.html missing!"
elif [ ! -s "$INDEX" ]; then
  log_err "index.html is empty!"
else
  SIZE=$(wc -c < "$INDEX" | tr -d ' ')
  log "index.html size: ${SIZE} bytes"
  if [ "$SIZE" -lt 10000 ]; then
    log_err "index.html suspiciously small (${SIZE} bytes) — possible corruption"
  fi
fi

# --- 3. Check DOCTYPE ---
FIRST_LINE=$(head -1 "$INDEX")
if ! echo "$FIRST_LINE" | grep -qi "doctype"; then
  log_err "Missing DOCTYPE declaration"
fi

# --- 4. JS syntax check via Node ---
JS_RESULT=$(node -e "
  const fs = require('fs');
  const html = fs.readFileSync('$INDEX', 'utf8');
  const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  let errors = [];
  scripts.forEach((block, i) => {
    const code = block.replace(/<\/?script[^>]*>/gi, '');
    if (code.trim().length === 0) return;
    try { new Function(code); }
    catch(e) { errors.push('Block ' + (i+1) + ': ' + e.message); }
  });
  if (errors.length === 0) console.log('OK');
  else console.log('FAIL:' + errors.join('|'));
" 2>&1)

if [ "$JS_RESULT" = "OK" ]; then
  log "JavaScript syntax: OK"
else
  log_err "JavaScript syntax: $JS_RESULT"
fi

# --- 5. Check for broken local assets ---
ASSET_RESULT=$(node -e "
  const fs = require('fs');
  const path = require('path');
  const html = fs.readFileSync('$INDEX', 'utf8');
  const refs = html.match(/(?:src|href)=['\"][^'\"]+['\"/]/gi) || [];
  let missing = [];
  refs.forEach(m => {
    const url = m.replace(/^(?:src|href)=['\"]/, '').replace(/['\"].*$/, '');
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('mailto:')) return;
    if (!/\.(png|jpg|jpeg|svg|ico|gif|webp|css|js)$/i.test(url)) return;
    const fullPath = path.resolve('$REPO', url.replace(/^\//, ''));
    if (!fs.existsSync(fullPath)) missing.push(url);
  });
  if (missing.length === 0) console.log('OK');
  else console.log('MISSING:' + missing.join(','));
" 2>&1)

if [ "$ASSET_RESULT" = "OK" ]; then
  log "Local assets: OK"
else
  log_err "Assets $ASSET_RESULT"
fi

# --- 6. Check CNAME file ---
if [ -f "$REPO/CNAME" ]; then
  CNAME_VAL=$(tr -d '[:space:]' < "$REPO/CNAME")
  if [ "$CNAME_VAL" = "spunk.bet" ]; then
    log "CNAME: OK"
  else
    log_err "CNAME wrong: '$CNAME_VAL'"
    echo "spunk.bet" > "$REPO/CNAME"
    log_fix "CNAME restored to spunk.bet"
  fi
else
  log_err "CNAME file missing"
  echo "spunk.bet" > "$REPO/CNAME"
  log_fix "CNAME file recreated"
fi

# --- 7. Performance check ---
TOTAL_SIZE=$(wc -c < "$INDEX" | tr -d ' ')
if [ "$TOTAL_SIZE" -gt 500000 ]; then
  log_err "index.html over 500KB ($TOTAL_SIZE bytes)"
elif [ "$TOTAL_SIZE" -gt 300000 ]; then
  log "Warning: index.html ${TOTAL_SIZE} bytes — getting large"
else
  log "File size OK (${TOTAL_SIZE} bytes)"
fi

# --- 8. Check HTTPS redirect is in place ---
HTTPS_CHECK=$(grep -c "location.protocol !== 'https:'" "$INDEX" 2>/dev/null || echo 0)
if [ "$HTTPS_CHECK" -lt 1 ]; then
  log_err "HTTPS redirect missing from index.html"
fi

# --- 9. Prize wallet API check ---
PRIZE_WALLET="bc1p27l6s82w5dek9yffjtlyj58ue2sndxm6zszpcz9zcwqpd4v86n9s5l37xm"
PRIZE_RESULT=$(curl -s --max-time 10 "https://api.hiro.so/ordinals/v1/inscriptions?address=${PRIZE_WALLET}&limit=1" 2>/dev/null)
PRIZE_TOTAL=$(echo "$PRIZE_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.total||0)}catch(e){console.log(-1)}" 2>/dev/null)
if [ "$PRIZE_TOTAL" = "-1" ]; then
  log "Prize wallet API: unreachable (will retry next cycle)"
elif [ "$PRIZE_TOTAL" = "0" ]; then
  log "Prize wallet: 0 ordinals — wallet empty, prizes need restocking"
else
  log "Prize wallet: $PRIZE_TOTAL ordinal(s) available for prizes"
fi

# --- 10. GAME INTEGRITY CHECKS (via external Node script) ---
GAME_RESULT=$(node "$REPO/audit-games.js" 2>&1)

GAME_ERRORS=$(echo "$GAME_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.errors.length)}catch(e){console.log(-1)}" 2>/dev/null)
GAME_FIXES=$(echo "$GAME_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.fixes.length)}catch(e){console.log(0)}" 2>/dev/null)
GAMES_CHECKED=$(echo "$GAME_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.gamesChecked)}catch(e){console.log(0)}" 2>/dev/null)
FNS_CHECKED=$(echo "$GAME_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.functionsChecked)}catch(e){console.log(0)}" 2>/dev/null)
ELS_CHECKED=$(echo "$GAME_RESULT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.elementsChecked)}catch(e){console.log(0)}" 2>/dev/null)

if [ "$GAME_ERRORS" = "-1" ]; then
  log_err "Game integrity check failed to run"
  log "Raw output: $GAME_RESULT"
elif [ "$GAME_ERRORS" = "0" ]; then
  log "Game integrity: ALL OK ($GAMES_CHECKED games, $FNS_CHECKED functions, $ELS_CHECKED elements)"
else
  log_err "Game integrity: $GAME_ERRORS issue(s) found"
  echo "$GAME_RESULT" | node -e "
    try {
      const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      d.errors.forEach(e => console.log('GAME_ERR:' + e));
      d.fixes.forEach(f => console.log('GAME_FIX:' + f));
    } catch(e) {}
  " 2>/dev/null | while read -r line; do
    if echo "$line" | grep -q "^GAME_FIX:"; then
      log_fix "${line#GAME_FIX:}"
    else
      log_err "${line#GAME_ERR:}"
    fi
  done
fi

# Track auto-fixes from game checks
if [ "$GAME_FIXES" -gt 0 ] 2>/dev/null; then
  FIXED=$((FIXED + GAME_FIXES))
fi

# --- 11. Auto-commit fixes if any were made ---
cd "$REPO"
if [ "$FIXED" -gt 0 ]; then
  CHANGES=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  if [ "$CHANGES" -gt 0 ]; then
    git add -A
    git commit -m "Auto-audit: fixed $FIXED issue(s)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
    git push
    log "Auto-committed and pushed $FIXED fix(es)"
  fi
fi

# --- 12. Summary ---
log "AUDIT COMPLETE: $ERRORS error(s), $FIXED fix(es)"
log "========== AUDIT END ============"
log ""
