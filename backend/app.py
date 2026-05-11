# ============================================================
# TrendPulse — Full Stack Server with Auth
# Flask + Supabase PostgreSQL + JWT Auth
# ============================================================

from flask import Flask, jsonify, request, send_from_directory, redirect
from flask_cors import CORS
import os
import logging
import jwt
import bcrypt
import psycopg2
import psycopg2.extras
import requests
import secrets
from urllib.parse import urlencode
from datetime import datetime, timedelta
from functools import wraps

logging.basicConfig(level=logging.INFO)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend')
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app, supports_credentials=True)

# ── ENV VARS ──────────────────────────────────────────────────
def clean_env(name, default=''):
    return os.environ.get(name, default).strip().strip('"').strip("'")

DATABASE_URL = clean_env('DATABASE_URL')
JWT_SECRET   = clean_env('JWT_SECRET', 'fallback-secret-change-this')
GOOGLE_CLIENT_ID = clean_env('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = clean_env('GOOGLE_CLIENT_SECRET')

# ── DATABASE ──────────────────────────────────────────────────
def get_db():
    try:
        if not DATABASE_URL:
            logging.error('DATABASE_URL is empty or not set')
            return None
        url = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
        # Try with SSL first, fallback without
        try:
            conn = psycopg2.connect(url, sslmode='require', connect_timeout=10)
        except Exception:
            conn = psycopg2.connect(url, connect_timeout=10)
        return conn
    except Exception as e:
        logging.error(f'DB connection error: {e}')
        return None

def init_db():
    conn = get_db()
    if not conn:
        logging.error('Could not connect to database')
        return
    try:
        cur = conn.cursor()
        # Users table
        cur.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW()
            )
        ''')
        # Saves table — stores anything a user bookmarks
        cur.execute('''
            CREATE TABLE IF NOT EXISTS saves (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(500) NOT NULL,
                url VARCHAR(1000),
                data JSONB,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        ''')
        conn.commit()
        cur.close()
        conn.close()
        logging.info('✓ Database tables ready')
    except Exception as e:
        logging.error(f'DB init error: {e}')
        conn.close()

# ── JWT HELPERS ───────────────────────────────────────────────
def create_token(user_id, email):
    payload = {
        'user_id': user_id,
        'email': email,
        'exp': datetime.utcnow() + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

def create_oauth_state():
    payload = {
        'nonce': secrets.token_urlsafe(16),
        'exp': datetime.utcnow() + timedelta(minutes=10)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

def get_base_url():
    configured = os.environ.get('PUBLIC_BASE_URL', '').rstrip('/')
    if configured:
        return configured
    forwarded_proto = request.headers.get('X-Forwarded-Proto')
    scheme = forwarded_proto or request.scheme
    return f'{scheme}://{request.host}'

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'error': 'No token provided'}), 401
        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            request.user_id = data['user_id']
            request.user_email = data['email']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated

# ── SERVE FRONTEND ────────────────────────────────────────────
@app.route('/')
def serve_landing():
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
    return send_from_directory(FRONTEND_DIR, 'landing.html')

# ── AUTH ROUTES ───────────────────────────────────────────────
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    email    = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()
    name     = (data.get('name') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database unavailable'}), 500

    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Check if email exists
        cur.execute('SELECT id FROM users WHERE email = %s', (email,))
        if cur.fetchone():
            return jsonify({'error': 'Email already registered'}), 409

        # Hash password
        pw_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # Insert user
        cur.execute(
            'INSERT INTO users (email, password_hash, name) VALUES (%s, %s, %s) RETURNING id, email, name',
            (email, pw_hash, name)
        )
        user = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        token = create_token(user['id'], user['email'])
        return jsonify({
            'token': token,
            'user': { 'id': user['id'], 'email': user['email'], 'name': user['name'] }
        }), 201

    except Exception as e:
        logging.error(f'Register error: {e}')
        conn.close()
        return jsonify({'error': 'Registration failed'}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    email    = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database unavailable'}), 500

    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute('SELECT * FROM users WHERE email = %s', (email,))
        user = cur.fetchone()
        cur.close()
        conn.close()

        if not user:
            return jsonify({'error': 'Invalid email or password'}), 401

        if not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return jsonify({'error': 'Invalid email or password'}), 401

        token = create_token(user['id'], user['email'])
        return jsonify({
            'token': token,
            'user': { 'id': user['id'], 'email': user['email'], 'name': user['name'] }
        })

    except Exception as e:
        logging.error(f'Login error: {e}')
        conn.close()
        return jsonify({'error': 'Login failed'}), 500


@app.route('/api/auth/me', methods=['GET'])
@token_required
def get_me():
    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database unavailable'}), 500
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute('SELECT id, email, name, created_at FROM users WHERE id = %s', (request.user_id,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        if not user:
            return jsonify({'error': 'User not found'}), 404
        return jsonify({ 'user': dict(user) })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

# ── SAVES ROUTES ──────────────────────────────────────────────
@app.route('/api/auth/google', methods=['GET'])
def google_login():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return redirect('/dashboard?auth=login&auth_error=google_not_configured')

    redirect_uri = f'{get_base_url()}/api/auth/google/callback'
    params = {
        'client_id': GOOGLE_CLIENT_ID,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
        'scope': 'openid email profile',
        'access_type': 'online',
        'prompt': 'select_account',
        'state': create_oauth_state(),
    }
    return redirect('https://accounts.google.com/o/oauth2/v2/auth?' + urlencode(params))


@app.route('/api/auth/google/callback', methods=['GET'])
def google_callback():
    if request.args.get('error'):
        return redirect('/dashboard?auth=login&auth_error=google_cancelled')

    code = request.args.get('code')
    state = request.args.get('state')
    if not code or not state:
        return redirect('/dashboard?auth=login&auth_error=google_missing_code')

    try:
        jwt.decode(state, JWT_SECRET, algorithms=['HS256'])
    except Exception:
        return redirect('/dashboard?auth=login&auth_error=google_invalid_state')

    try:
        token_res = requests.post(
            'https://oauth2.googleapis.com/token',
            data={
                'code': code,
                'client_id': GOOGLE_CLIENT_ID,
                'client_secret': GOOGLE_CLIENT_SECRET,
                'redirect_uri': f'{get_base_url()}/api/auth/google/callback',
                'grant_type': 'authorization_code',
            },
            timeout=10,
        )
        token_res.raise_for_status()
        access_token = token_res.json().get('access_token')
        user_res = requests.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=10,
        )
        user_res.raise_for_status()
        profile = user_res.json()
        email = (profile.get('email') or '').strip().lower()
        name = (profile.get('name') or email.split('@')[0]).strip()
        google_sub = profile.get('sub') or ''
        if not email:
            raise ValueError('Google account did not return an email')
    except Exception as e:
        logging.error(f'Google OAuth error: {e}')
        return redirect('/dashboard?auth=login&auth_error=google_failed')

    conn = get_db()
    if not conn:
        return redirect('/dashboard?auth=login&auth_error=db_unavailable')
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute('SELECT id, email, name FROM users WHERE email = %s', (email,))
        user = cur.fetchone()
        if not user:
            pw_hash = bcrypt.hashpw(f'google:{google_sub}:{secrets.token_urlsafe(24)}'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            cur.execute(
                'INSERT INTO users (email, password_hash, name) VALUES (%s, %s, %s) RETURNING id, email, name',
                (email, pw_hash, name)
            )
            user = cur.fetchone()
            conn.commit()
        cur.close()
        conn.close()
        token = create_token(user['id'], user['email'])
        return f"""
        <!doctype html>
        <html><head><title>Signing in...</title></head>
        <body>
          <script>
            localStorage.setItem('tp_token', {token!r});
            window.location.href = '/dashboard';
          </script>
          Signing you in...
        </body></html>
        """
    except Exception as e:
        logging.error(f'Google user upsert error: {e}')
        conn.close()
        return redirect('/dashboard?auth=login&auth_error=google_user_failed')


@app.route('/api/saves', methods=['GET'])
@token_required
def get_saves():
    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database unavailable'}), 500
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            'SELECT * FROM saves WHERE user_id = %s ORDER BY created_at DESC',
            (request.user_id,)
        )
        saves = cur.fetchall()
        cur.close()
        conn.close()
        return jsonify({ 'saves': [dict(s) for s in saves] })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/saves', methods=['POST'])
@token_required
def add_save():
    data  = request.get_json()
    title = (data.get('title') or '').strip()
    stype = (data.get('type') or 'topic').strip()
    url   = (data.get('url') or '').strip()
    extra = data.get('data') or {}
    notes = (data.get('notes') or '').strip()

    if not title:
        return jsonify({'error': 'Title required'}), 400

    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database unavailable'}), 500
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        import json
        cur.execute(
            'INSERT INTO saves (user_id, type, title, url, data, notes) VALUES (%s, %s, %s, %s, %s, %s) RETURNING *',
            (request.user_id, stype, title, url, json.dumps(extra), notes)
        )
        save = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({ 'save': dict(save) }), 201
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/saves/<int:save_id>', methods=['DELETE'])
@token_required
def delete_save(save_id):
    conn = get_db()
    if not conn:
        return jsonify({'error': 'Database unavailable'}), 500
    try:
        cur = conn.cursor()
        cur.execute(
            'DELETE FROM saves WHERE id = %s AND user_id = %s',
            (save_id, request.user_id)
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({ 'deleted': True })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/saves/<int:save_id>', methods=['PATCH'])
@token_required
def update_save(save_id):
    data  = request.get_json()
    notes = (data.get('notes') or '').strip()
    conn  = get_db()
    if not conn:
        return jsonify({'error': 'Database unavailable'}), 500
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            'UPDATE saves SET notes = %s WHERE id = %s AND user_id = %s RETURNING *',
            (notes, save_id, request.user_id)
        )
        save = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({ 'save': dict(save) })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

# ── GOOGLE TRENDS ─────────────────────────────────────────────
try:
    from pytrends.request import TrendReq
    pytrends = TrendReq(hl='en-US', tz=360)
    PYTRENDS_OK = True
    print('✓ pytrends loaded')
except Exception as e:
    PYTRENDS_OK = False
    print(f'pytrends unavailable: {e}')

@app.route('/api/trends')
def get_trends():
    if not PYTRENDS_OK:
        return jsonify(_demo_trends())
    raw_kw    = request.args.get('kw', 'AI tools,side hustle,meal prep')
    kw_list   = [k.strip() for k in raw_kw.split(',')][:5]
    timeframe = request.args.get('tf', 'today 1-m')
    try:
        pytrends.build_payload(kw_list, cat=0, timeframe=timeframe, geo='')
        df = pytrends.interest_over_time()
        if df.empty:
            return jsonify(_demo_trends())
        df     = df.drop(columns=['isPartial'], errors='ignore')
        labels = [str(d.date()) for d in df.index.tolist()]
        datasets = {kw: df[kw].tolist() for kw in kw_list if kw in df.columns}
        return jsonify({'labels': labels, 'datasets': datasets})
    except Exception as e:
        logging.error(f'Trends error: {e}')
        return jsonify(_demo_trends())

@app.route('/api/trending')
def get_trending():
    if not PYTRENDS_OK:
        return jsonify(_demo_trending())
    country = request.args.get('country', 'united_states')
    try:
        df = pytrends.trending_searches(pn=country)
        trends = [
            {'term': str(row[0]), 'volume': max(1, 100 - i), 'delta': f'+{max(5, 60 - i*3)}%', 'rank': i+1}
            for i, row in df.iterrows()
        ]
        return jsonify(trends[:20])
    except Exception as e:
        return jsonify(_demo_trending())

@app.route('/api/related')
def get_related():
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
    db_ok = False
    db_error = ''
    try:
        conn = get_db()
        if conn:
            conn.close()
            db_ok = True
        else:
            db_error = 'get_db() returned None'
    except Exception as e:
        db_error = str(e)
    return jsonify({
        'status': 'ok',
        'pytrends': PYTRENDS_OK,
        'db': db_ok,
        'db_error': db_error,
        'db_url_set': bool(DATABASE_URL),
        'db_url_prefix': DATABASE_URL[:20] + '...' if DATABASE_URL else 'NOT SET',
        'google_client_id_set': bool(GOOGLE_CLIENT_ID),
        'google_client_id_suffix': GOOGLE_CLIENT_ID[-28:] if GOOGLE_CLIENT_ID else 'NOT SET',
        'google_secret_set': bool(GOOGLE_CLIENT_SECRET),
        'public_base_url': get_base_url()
    })

def _demo_trends():
    return { 'labels': ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], 'datasets': { 'AI tools': [42,51,48,61,72,66,81], 'side hustle': [31,36,32,45,51,47,58], 'meal prep': [18,21,20,27,32,30,36] } }

def _demo_trending():
    return [
        {'term':'AI productivity tools','volume':92,'delta':'+41%','rank':1},
        {'term':'side hustle ideas','volume':78,'delta':'+28%','rank':2},
        {'term':'meal prep for beginners','volume':64,'delta':'+15%','rank':3},
        {'term':'passive income ideas','volume':51,'delta':'+33%','rank':4},
        {'term':'notion templates','volume':44,'delta':'+88%','rank':5},
        {'term':'canva templates','volume':38,'delta':'+72%','rank':6},
        {'term':'amazon kdp','volume':35,'delta':'+65%','rank':7},
        {'term':'chatgpt prompts','volume':30,'delta':'+55%','rank':8},
        {'term':'print on demand','volume':26,'delta':'+48%','rank':9},
        {'term':'digital products etsy','volume':22,'delta':'+40%','rank':10},
    ]

# ── START ─────────────────────────────────────────────────────
init_db()

if __name__ == '__main__':
    port  = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('RAILWAY_ENVIRONMENT') is None
    print(f'\n{"="*50}\n  TrendPulse running on port {port}\n{"="*50}\n')
    app.run(host='0.0.0.0', port=port, debug=debug)
