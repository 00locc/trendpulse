# ============================================================
# TrendPulse — Full Stack Server
# Routes blocked APIs through Python to bypass IP restrictions
# ============================================================

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import logging
import requests
import time

logging.basicConfig(level=logging.INFO)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend')
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)

# Rotating user agents to avoid blocks
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]
_ua_index = 0
def get_ua():
    global _ua_index
    ua = USER_AGENTS[_ua_index % len(USER_AGENTS)]
    _ua_index += 1
    return ua

def safe_get(url, headers=None, timeout=8, retries=2):
    """GET with retries and rotating user agent."""
    h = {'User-Agent': get_ua(), 'Accept': 'application/json'}
    if headers:
        h.update(headers)
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=h, timeout=timeout)
            if r.status_code == 429:
                time.sleep(1.5 * (attempt + 1))
                continue
            return r
        except Exception as e:
            logging.warning(f'Attempt {attempt+1} failed for {url}: {e}')
            if attempt < retries - 1:
                time.sleep(1)
    return None

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
    return send_from_directory(FRONTEND_DIR, 'landing.html')

@app.route('/dashboard')
@app.route('/dashboard.html')
def serve_dashboard():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    full = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, 'index.html')


# ── PROXY: REDDIT ─────────────────────────────────────────────
@app.route('/api/reddit')
def proxy_reddit():
    subreddit = request.args.get('sub', 'all')
    limit     = request.args.get('limit', '20')
    url = f'https://www.reddit.com/r/{subreddit}/hot.json?limit={limit}&t=day'
    r = safe_get(url, headers={'Accept': 'application/json'})
    if not r or not r.ok:
        return jsonify([])
    try:
        data = r.json()
        posts = []
        cutoff = time.time() - 72 * 3600
        for child in data.get('data', {}).get('children', []):
            p = child['data']
            if p.get('created_utc', 0) < cutoff and p.get('score', 0) < 300:
                continue
            posts.append({
                'source':    'Reddit',
                'title':     p.get('title', ''),
                'subreddit': p.get('subreddit_name_prefixed', ''),
                'score':     p.get('score', 0),
                'comments':  p.get('num_comments', 0),
                'url':       f"https://reddit.com{p.get('permalink', '')}",
                'created':   p.get('created_utc', 0),
            })
        return jsonify(posts)
    except Exception as e:
        logging.error(f'Reddit proxy error: {e}')
        return jsonify([])


# ── PROXY: CRYPTO TRENDING ────────────────────────────────────
@app.route('/api/crypto/trending')
def proxy_crypto_trending():
    r = safe_get('https://api.coingecko.com/api/v3/search/trending')
    if not r or not r.ok:
        return jsonify(_demo_crypto_trending())
    try:
        data = r.json()
        coins = []
        for c in data.get('coins', []):
            item = c.get('item', {})
            coins.append({
                'source': 'CoinGecko',
                'name':   item.get('name', ''),
                'symbol': item.get('symbol', ''),
                'rank':   item.get('market_cap_rank', 0),
                'url':    f"https://www.coingecko.com/en/coins/{item.get('id', '')}",
            })
        return jsonify(coins if coins else _demo_crypto_trending())
    except Exception as e:
        logging.error(f'Crypto trending error: {e}')
        return jsonify(_demo_crypto_trending())


# ── PROXY: CRYPTO PRICES ──────────────────────────────────────
@app.route('/api/crypto/prices')
def proxy_crypto_prices():
    ids = 'bitcoin,ethereum,solana,cardano,dogecoin,ripple,polkadot,chainlink,uniswap,avalanche-2'
    url = f'https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true'
    r = safe_get(url)
    if not r or not r.ok:
        return jsonify(_demo_crypto_prices())
    try:
        data = r.json()
        prices = []
        for coin_id, v in data.items():
            prices.append({
                'source': 'CoinGecko',
                'name':   coin_id.replace('-', ' ').title(),
                'price':  v.get('usd', 0),
                'change': round(v.get('usd_24h_change', 0), 2),
                'mcap':   v.get('usd_market_cap', 0),
                'url':    f'https://www.coingecko.com/en/coins/{coin_id}',
            })
        return jsonify(prices if prices else _demo_crypto_prices())
    except Exception as e:
        logging.error(f'Crypto prices error: {e}')
        return jsonify(_demo_crypto_prices())


# ── PROXY: HACKER NEWS ───────────────────────────────────────
@app.route('/api/hn')
def proxy_hn():
    feed  = request.args.get('feed', 'topstories')
    count = int(request.args.get('count', '20'))
    r = safe_get(f'https://hacker-news.firebaseio.com/v0/{feed}.json')
    if not r or not r.ok:
        return jsonify(_demo_hn())
    try:
        ids = r.json()[:count]
        items = []
        for id_ in ids:
            ir = safe_get(f'https://hacker-news.firebaseio.com/v0/item/{id_}.json', timeout=4)
            if ir and ir.ok:
                s = ir.json()
                if s and s.get('title'):
                    items.append({
                        'source':   'Hacker News',
                        'title':    s.get('title', ''),
                        'score':    s.get('score', 0),
                        'comments': s.get('descendants', 0),
                        'by':       s.get('by', ''),
                        'url':      s.get('url') or f"https://news.ycombinator.com/item?id={s.get('id')}",
                        'created':  s.get('time', 0),
                    })
        return jsonify(items if items else _demo_hn())
    except Exception as e:
        logging.error(f'HN error: {e}')
        return jsonify(_demo_hn())


# ── PROXY: WIKIPEDIA ─────────────────────────────────────────
@app.route('/api/wikipedia')
def proxy_wikipedia():
    from datetime import datetime, timedelta
    d = datetime.now() - timedelta(days=1)
    url = f"https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/{d.year}/{d.month:02d}/{d.day:02d}"
    r = safe_get(url)
    if not r or not r.ok:
        return jsonify([])
    try:
        data = r.json()
        skip = ['Main_Page', 'Special:', 'Wikipedia:', 'Portal:', 'Help:', 'File:']
        articles = []
        for a in (data.get('items', [{}])[0].get('articles', []))[:25]:
            if any(a['article'].startswith(s) for s in skip):
                continue
            articles.append({
                'source': 'Wikipedia',
                'title':  a['article'].replace('_', ' '),
                'views':  a['views'],
                'url':    f"https://en.wikipedia.org/wiki/{a['article']}",
            })
        return jsonify(articles)
    except Exception as e:
        logging.error(f'Wikipedia error: {e}')
        return jsonify([])


# ── GOOGLE TRENDS ────────────────────────────────────────────
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
        df = df.drop(columns=['isPartial'], errors='ignore')
        labels   = [str(d.date()) for d in df.index.tolist()]
        datasets = {kw: df[kw].tolist() for kw in kw_list if kw in df.columns}
        return jsonify({'labels': labels, 'datasets': datasets, 'keywords': kw_list})
    except Exception as e:
        logging.error(f'Trends error: {e}')
        return jsonify(_demo_trends())


@app.route('/api/trending')
def get_trending_searches():
    country = request.args.get('country', 'united_states')
    if not PYTRENDS_OK:
        return jsonify(_demo_trending())
    try:
        df = pytrends.trending_searches(pn=country)
        trends = [
            {'term': str(row[0]), 'volume': max(1, 100 - i), 'delta': f'+{max(5, 60 - i*3)}%', 'rank': i + 1}
            for i, row in df.iterrows()
        ]
        return jsonify(trends[:20] if trends else _demo_trending())
    except Exception as e:
        logging.error(f'Trending error: {e}')
        return jsonify(_demo_trending())


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
        return jsonify({'top': [], 'rising': []})


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
        {'term': 'ChatGPT alternatives',     'volume': 35, 'delta': '+62%', 'rank': 7},
        {'term': 'notion templates',         'volume': 19, 'delta': '+88%', 'rank': 8},
        {'term': 'canva templates',          'volume': 18, 'delta': '+72%', 'rank': 9},
        {'term': 'amazon kdp',               'volume': 17, 'delta': '+65%', 'rank': 10},
    ]

def _demo_crypto_trending():
    return [
        {'source':'CoinGecko','name':'Bitcoin','symbol':'BTC','rank':1,'url':'https://www.coingecko.com/en/coins/bitcoin'},
        {'source':'CoinGecko','name':'Ethereum','symbol':'ETH','rank':2,'url':'https://www.coingecko.com/en/coins/ethereum'},
        {'source':'CoinGecko','name':'Solana','symbol':'SOL','rank':5,'url':'https://www.coingecko.com/en/coins/solana'},
        {'source':'CoinGecko','name':'Dogecoin','symbol':'DOGE','rank':8,'url':'https://www.coingecko.com/en/coins/dogecoin'},
        {'source':'CoinGecko','name':'Chainlink','symbol':'LINK','rank':15,'url':'https://www.coingecko.com/en/coins/chainlink'},
        {'source':'CoinGecko','name':'Avalanche','symbol':'AVAX','rank':12,'url':'https://www.coingecko.com/en/coins/avalanche'},
        {'source':'CoinGecko','name':'Uniswap','symbol':'UNI','rank':20,'url':'https://www.coingecko.com/en/coins/uniswap'},
    ]

def _demo_crypto_prices():
    return [
        {'source':'CoinGecko','name':'Bitcoin','price':67420,'change':2.34,'mcap':1320000000000,'url':'https://www.coingecko.com/en/coins/bitcoin'},
        {'source':'CoinGecko','name':'Ethereum','price':3521,'change':1.87,'mcap':423000000000,'url':'https://www.coingecko.com/en/coins/ethereum'},
        {'source':'CoinGecko','name':'Solana','price':178,'change':3.21,'mcap':82000000000,'url':'https://www.coingecko.com/en/coins/solana'},
        {'source':'CoinGecko','name':'Cardano','price':0.62,'change':-0.84,'mcap':21000000000,'url':'https://www.coingecko.com/en/coins/cardano'},
        {'source':'CoinGecko','name':'Dogecoin','price':0.18,'change':4.12,'mcap':25000000000,'url':'https://www.coingecko.com/en/coins/dogecoin'},
        {'source':'CoinGecko','name':'Ripple','price':0.58,'change':1.23,'mcap':32000000000,'url':'https://www.coingecko.com/en/coins/ripple'},
    ]

def _demo_hn():
    return [
        {'source':'Hacker News','title':'Show HN: TrendPulse — find trending digital product niches','score':842,'comments':134,'url':'https://news.ycombinator.com','created':0,'by':'founder'},
        {'source':'Hacker News','title':'Ask HN: Best ways to monetize a content site in 2025?','score':671,'comments':198,'url':'https://news.ycombinator.com','created':0,'by':'hacker'},
        {'source':'Hacker News','title':'The state of AI tools in 2025','score':1240,'comments':312,'url':'https://news.ycombinator.com','created':0,'by':'airesearcher'},
        {'source':'Hacker News','title':'How I got to $10K MRR selling templates','score':934,'comments':167,'url':'https://news.ycombinator.com','created':0,'by':'indiehacker'},
        {'source':'Hacker News','title':'Notion alternatives compared: which is best in 2025?','score':523,'comments':89,'url':'https://news.ycombinator.com','created':0,'by':'productivitynerd'},
    ]


# ── START ─────────────────────────────────────────────────────
if __name__ == '__main__':
    port  = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('RAILWAY_ENVIRONMENT') is None
    print(f'\n{"="*50}\n  TrendPulse on port {port}\n{"="*50}\n')
    app.run(host='0.0.0.0', port=port, debug=debug)
