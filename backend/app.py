# ============================================================
# TrendPulse — Full Stack Server
# Serves frontend + Google Trends API
# Works locally AND on Railway/Render
# ============================================================

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import logging

logging.basicConfig(level=logging.INFO)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend')
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)

try:
    from pytrends.request import TrendReq
    pytrends = TrendReq(hl='en-US', tz=360)
    PYTRENDS_OK = True
    print('✓ pytrends loaded')
except Exception as e:
    PYTRENDS_OK = False
    print(f'pytrends unavailable: {e}')


# ── SERVE FRONTEND ────────────────────────────────────────────
@app.route('/')
def serve_index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    full = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, 'index.html')


# ── GOOGLE TRENDS: Interest over time ────────────────────────
@app.route('/api/trends')
def get_trends():
    if not PYTRENDS_OK:
        return jsonify(_demo_trends())
    raw_kw    = request.args.get('kw', 'AI tools,side hustle,meal prep')
    kw_list   = [k.strip() for k in raw_kw.split(',')][:5]
    timeframe = request.args.get('tf', 'today 1-m')
    geo       = request.args.get('geo', '')
    try:
        pytrends.build_payload(kw_list, cat=0, timeframe=timeframe, geo=geo)
        df = pytrends.interest_over_time()
        if df.empty:
            return jsonify(_demo_trends())
        df     = df.drop(columns=['isPartial'], errors='ignore')
        labels = [str(d.date()) for d in df.index.tolist()]
        datasets = {kw: df[kw].tolist() for kw in kw_list if kw in df.columns}
        return jsonify({'labels': labels, 'datasets': datasets, 'keywords': kw_list})
    except Exception as e:
        logging.error(f'Trends error: {e}')
        return jsonify(_demo_trends())


# ── GOOGLE TRENDS: Trending searches ─────────────────────────
@app.route('/api/trending')
def get_trending_searches():
    if not PYTRENDS_OK:
        return jsonify(_demo_trending())
    country = request.args.get('country', 'united_states')
    try:
        df = pytrends.trending_searches(pn=country)
        trends = [
            {'term': str(row[0]), 'volume': max(1, 100 - i), 'delta': f'+{max(5, 60 - i*3)}%', 'rank': i + 1}
            for i, row in df.iterrows()
        ]
        return jsonify(trends[:20])
    except Exception as e:
        logging.error(f'Trending error: {e}')
        return jsonify(_demo_trending())


# ── GOOGLE TRENDS: Related queries ───────────────────────────
@app.route('/api/related')
def get_related_queries():
    if not PYTRENDS_OK:
        return jsonify({'top': [], 'rising': []})
    kw = request.args.get('kw', 'AI tools')
    try:
        pytrends.build_payload([kw], timeframe='today 1-m')
        related = pytrends.related_queries()
        result  = {'top': [], 'rising': []}
        if kw in related:
            top_df    = related[kw].get('top')
            rising_df = related[kw].get('rising')
            if top_df    is not None: result['top']    = top_df.head(10).to_dict('records')
            if rising_df is not None: result['rising'] = rising_df.head(10).to_dict('records')
        return jsonify(result)
    except Exception as e:
        logging.error(f'Related error: {e}')
        return jsonify({'top': [], 'rising': []})


# ── HEALTH CHECK ─────────────────────────────────────────────
@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'pytrends': PYTRENDS_OK})


# ── DEMO FALLBACKS ────────────────────────────────────────────
def _demo_trends():
    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return {
        'labels': days,
        'datasets': {
            'AI tools':    [42, 51, 48, 61, 72, 66, 81],
            'side hustle': [31, 36, 32, 45, 51, 47, 58],
            'meal prep':   [18, 21, 20, 27, 32, 30, 36],
        }
    }

def _demo_trending():
    return [
        {'term': 'AI productivity tools',   'volume': 92, 'delta': '+41%', 'rank': 1},
        {'term': 'side hustle ideas',        'volume': 78, 'delta': '+28%', 'rank': 2},
        {'term': 'meal prep for beginners',  'volume': 64, 'delta': '+15%', 'rank': 3},
        {'term': 'remote work setup',        'volume': 57, 'delta': '+8%',  'rank': 4},
        {'term': 'passive income ideas',     'volume': 51, 'delta': '+33%', 'rank': 5},
        {'term': 'home gym equipment',       'volume': 44, 'delta': '-5%',  'rank': 6},
        {'term': 'budget travel Europe',     'volume': 38, 'delta': '+19%', 'rank': 7},
        {'term': 'ChatGPT alternatives',     'volume': 35, 'delta': '+62%', 'rank': 8},
        {'term': 'intermittent fasting',     'volume': 30, 'delta': '+11%', 'rank': 9},
        {'term': 'electric vehicle range',   'volume': 26, 'delta': '+7%',  'rank': 10},
        {'term': 'notion templates',         'volume': 19, 'delta': '+88%', 'rank': 11},
        {'term': 'canva templates',          'volume': 18, 'delta': '+72%', 'rank': 12},
        {'term': 'amazon kdp',               'volume': 17, 'delta': '+65%', 'rank': 13},
        {'term': 'micro saas ideas',         'volume': 15, 'delta': '+55%', 'rank': 14},
        {'term': 'print on demand',          'volume': 14, 'delta': '+48%', 'rank': 15},
    ]


# ── START SERVER ──────────────────────────────────────────────
if __name__ == '__main__':
    # Railway sets PORT env variable — use it, fallback to 5000 locally
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('RAILWAY_ENVIRONMENT') is None  # debug only locally
    print(f'\n{"="*50}')
    print(f'  TrendPulse running on port {port}')
    print(f'  Frontend: http://localhost:{port}')
    print(f'{"="*50}\n')
    app.run(host='0.0.0.0', port=port, debug=debug)
