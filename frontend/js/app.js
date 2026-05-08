/* ============================================
   APP.JS — TrendPulse Controller v5
   - Instant render: zero loading states on dashboard
   - All panels pre-filled with curated demo data
   - Live data updates panels silently in background
   - Chart always shows meaningful data
   ============================================ */

const State = {
  currentView: 'dashboard',
  loading: false,
  _loaded: {},
};

document.addEventListener('DOMContentLoaded', () => {
  setupNav(); setupTimeRange(); setupSearch(); loadSettings(); updateTimestamp(); loadDashboard();
});

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); switchView(item.dataset.view); });
  });
}

function switchView(view) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');
  const titles = {
    dashboard:'Dashboard', digital:'Digital Products Intelligence',
    topics:'Topic Explorer', products:'Product Intelligence',
    questions:'What People Ask', youtube:'YouTube Trends', news:'News & Headlines',
    github:'GitHub Trending', devto:'Developer Articles', crypto:'Crypto Intelligence',
    books:'Trending Books', jobs:'Remote Jobs', stackoverflow:'Stack Overflow', alerts:'Spike Alerts',
  };
  document.getElementById('pageTitle').textContent = titles[view] || view;
  State.currentView = view;
  const loaders = {
    digital:loadDigital, topics:loadTopics, products:loadProducts,
    questions:loadQuestions, youtube:loadYouTube, news:loadNews,
    github:loadGitHub, devto:loadDevTo, crypto:loadCrypto,
    books:loadBooks, jobs:loadJobs, stackoverflow:loadStackOverflow, alerts:loadAlerts,
  };
  if (loaders[view] && !State._loaded[view]) loaders[view]();
}

function setupTimeRange() {
  document.querySelectorAll('.tt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { if (input.value.trim().length > 2) performSearch(input.value.trim()); }, 700); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(timer); if (input.value.trim().length > 1) performSearch(input.value.trim()); } });
}

async function performSearch(query) {
  switchView('topics'); State._loaded['topics'] = true;
  const grid = document.getElementById('topicsGrid');
  if (!grid) return;
  grid.innerHTML = `<div class="loading-state full">Searching for <strong>"${escHtml(query)}"</strong>...</div>`;
  try {
    const [reddit, hn] = await Promise.all([
      API.getRedditSearch(query),
      API.getHNFeed('topstories', 30).then(r => r.filter(h => h.title.toLowerCase().includes(query.toLowerCase()))),
    ]);
    const all = [...reddit, ...hn].sort((a,b) => (b.score||0) - (a.score||0));
    grid.innerHTML = all.length
      ? `<div class="results-count">Found <strong>${all.length}</strong> results for "${escHtml(query)}"</div>` + all.slice(0,60).map(r => renderTopicCard({ name:r.title, category:guessCat(r.title), sources:[r.source], volume:formatNum(r.score||0), delta:'', url:r.url, meta:r.subreddit||r.source })).join('')
      : `<div class="loading-state full">No results found for "<strong>${escHtml(query)}</strong>"</div>`;
  } catch(e) { grid.innerHTML = `<div class="loading-state full">Search failed — try again</div>`; }
}

function openLink(url) { if (url && url !== '#') window.open(url, '_blank', 'noopener'); }
function buildLink(item) {
  if (item.url) return item.url;
  const q = item.term || item.text || item.name || '';
  return q ? `https://www.google.com/search?q=${encodeURIComponent(q)}` : '#';
}

function renderPulseWidget(items) {
  const el = document.getElementById('pulsePanels');
  if (!el) return;
  el.innerHTML = items.map(item => `
    <div class="pulse-card" onclick="openLink('${escAttr(item.url)}')">
      <div class="pulse-source" style="color:${item.color}">${escHtml(item.source)}</div>
      <div class="pulse-topic">${escHtml(item.topic.substring(0,60))}${item.topic.length>60?'...':''}</div>
      <div class="pulse-meta">${escHtml(item.meta)}</div>
      <div class="pulse-bar" style="background:${item.color};width:100%;opacity:0.4"></div>
      <div class="pulse-delta" style="color:${item.color}">${escHtml(item.delta)}</div>
    </div>
  `).join('');
  const ts = document.getElementById('pulseUpdated');
  if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

// ── CURATED DEMO DATA (always shown instantly) ────────────────────────

const DEMO_PH = [
  { title:'NotebookLM by Google',   url:'https://notebooklm.google.com', votes:1240 },
  { title:'Cursor AI Code Editor',  url:'https://cursor.sh',             votes:980  },
  { title:'Perplexity Pro',         url:'https://perplexity.ai',          votes:876  },
  { title:'Suno AI Music',          url:'https://suno.ai',               votes:821  },
  { title:'v0 by Vercel',           url:'https://v0.dev',                votes:754  },
  { title:'ElevenLabs Voice AI',    url:'https://elevenlabs.io',          votes:699  },
  { title:'Bolt.new',               url:'https://bolt.new',              votes:634  },
  { title:'Lovable AI',             url:'https://lovable.dev',           votes:589  },
];

const DEMO_CRYPTO = [
  { name:'Bitcoin',  symbol:'BTC', rank:1, url:'https://www.coingecko.com/en/coins/bitcoin' },
  { name:'Ethereum', symbol:'ETH', rank:2, url:'https://www.coingecko.com/en/coins/ethereum' },
  { name:'Solana',   symbol:'SOL', rank:5, url:'https://www.coingecko.com/en/coins/solana' },
  { name:'Pepe',     symbol:'PEPE',rank:28,url:'https://www.coingecko.com/en/coins/pepe' },
  { name:'Dogecoin', symbol:'DOGE',rank:8, url:'https://www.coingecko.com/en/coins/dogecoin' },
  { name:'XRP',      symbol:'XRP', rank:4, url:'https://www.coingecko.com/en/coins/ripple' },
  { name:'Sui',      symbol:'SUI', rank:18,url:'https://www.coingecko.com/en/coins/sui' },
  { name:'Hyperliquid',symbol:'HYPE',rank:22,url:'https://www.coingecko.com/en/coins/hyperliquid' },
];

const DEMO_PRODUCTS = [
  { name:'Notion Template',       score:95, url:'https://www.reddit.com/search/?q=notion+template' },
  { name:'ChatGPT Prompts',       score:92, url:'https://www.reddit.com/search/?q=chatgpt+prompts' },
  { name:'Canva Templates',       score:88, url:'https://www.reddit.com/search/?q=canva+templates' },
  { name:'Budget Tracker',        score:84, url:'https://www.reddit.com/search/?q=budget+tracker' },
  { name:'Workout Planner',       score:81, url:'https://www.reddit.com/search/?q=workout+planner' },
  { name:'Meal Prep Guide',       score:78, url:'https://www.reddit.com/search/?q=meal+prep+guide' },
  { name:'Social Media Templates',score:74, url:'https://www.reddit.com/search/?q=social+media+templates' },
  { name:'Resume Template',       score:71, url:'https://www.reddit.com/search/?q=resume+template' },
  { name:'AI Prompt Pack',        score:68, url:'https://www.reddit.com/search/?q=ai+prompts' },
  { name:'Habit Tracker PDF',     score:65, url:'https://www.reddit.com/search/?q=habit+tracker' },
];

const DEMO_QUESTIONS = [
  { text:'How do I start selling digital products?',          intent:'how',  source:'Reddit', score:3200, subreddit:'r/passive_income', url:'https://reddit.com/r/passive_income' },
  { text:'What side hustle makes the most money in 2025?',    intent:'what', source:'Reddit', score:4800, subreddit:'r/Entrepreneur',   url:'https://reddit.com/r/Entrepreneur' },
  { text:'How to make passive income with Notion templates?', intent:'how',  source:'Reddit', score:2900, subreddit:'r/SideProject',    url:'https://reddit.com/r/SideProject' },
  { text:'What digital products sell best on Etsy?',          intent:'what', source:'Reddit', score:3400, subreddit:'r/Etsy',           url:'https://reddit.com/r/Etsy' },
  { text:'How do I price my ebook?',                          intent:'how',  source:'Reddit', score:2100, subreddit:'r/KDP',            url:'https://reddit.com/r/KDP' },
  { text:'Is dropshipping still worth it in 2025?',           intent:'buy',  source:'Reddit', score:3800, subreddit:'r/ecommerce',      url:'https://reddit.com/r/ecommerce' },
  { text:'What AI tools actually save time?',                 intent:'what', source:'Reddit', score:5100, subreddit:'r/artificial',     url:'https://reddit.com/r/artificial' },
  { text:'How do I grow my Etsy shop to 1K sales?',           intent:'how',  source:'Reddit', score:2600, subreddit:'r/Etsy',           url:'https://reddit.com/r/Etsy' },
];

// Always-visible chart data (used when backend unavailable)
const DEMO_CHART = {
  labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  datasets: {
    google:  [4200, 5100, 4800, 6100, 7200, 6600, 8100],
    reddit:  [3100, 3600, 3200, 4500, 5100, 4700, 5800],
    youtube: [1800, 2100, 2000, 2700, 3200, 3000, 3600],
    news:    [900,  1100, 1050, 1400, 1700, 1500, 1900],
  }
};

// ── DASHBOARD ─────────────────────────────────────────────────────────
async function loadDashboard() {
  if (State.loading) return;
  State.loading = true; setRefreshSpinning(true);

  // ── STEP 1: Render everything instantly with curated demo data ──
  // Users see a full, populated dashboard within milliseconds
  const demoTrending = API.getDemoTrendingSearches();

  setMetric('m-signals',  '54.2K', 'm-signals-delta', '↑ Live signals active', 'up');
  setMetric('m-topics',   '80+',   'm-topics-delta',   'Across all platforms',  'up');
  setMetric('m-products', '48+',   'm-products-delta', 'In demand right now',   'up');
  setMetric('m-questions','80+',   'm-questions-delta','Being asked today',     'up');

  Charts.initPlatformChart(null);
  renderPulseWidget([
    { source:'Google',    color:'#00f5a0', topic:'AI productivity tools',      meta:'Search trend',         delta:'+41%', url:'https://trends.google.com/trends/explore?q=AI+productivity' },
    { source:'Hacker News',color:'#ff6314',topic:'Show HN: top projects',       meta:'Tech discussion',      delta:'842 pts', url:'https://news.ycombinator.com' },
    { source:'Wikipedia', color:'#4d9fff', topic:'Artificial Intelligence',      meta:'2.1M views today',    delta:'Trending', url:'https://en.wikipedia.org/wiki/Artificial_intelligence' },
    { source:'Reddit',    color:'#ff4500', topic:'Best side hustle ideas 2025',  meta:'r/Entrepreneur',       delta:'4.8K pts', url:'https://reddit.com/r/Entrepreneur' },
    { source:'Product Hunt',color:'#ff7a2f',topic:'NotebookLM by Google',       meta:'Today\'s top launch',  delta:'▲ 1,240', url:'https://notebooklm.google.com' },
    { source:'CoinGecko', color:'#ffd60a', topic:'Bitcoin (BTC)',               meta:'MCap Rank #1',         delta:'Trending', url:'https://www.coingecko.com/en/coins/bitcoin' },
  ]);

  renderDashList('trendingList',  demoTrending,    'google');
  renderDashList('phList',        DEMO_PH,         'ph');
  renderDashList('cryptoList',    DEMO_CRYPTO,     'crypto');
  renderDashList('productsList',  DEMO_PRODUCTS,   'product');
  renderDashList('questionsList', DEMO_QUESTIONS,  'question');
  // HN and Wiki get placeholders until live loads
  renderDashList('hnList',   [{title:'Loading Hacker News...',score:0,url:'https://news.ycombinator.com',comments:0}], 'hn');
  renderDashList('wikiList', [{title:'Loading Wikipedia...',views:0,url:'https://en.wikipedia.org'}], 'wiki');

  // ── STEP 2: Fetch live data in background, update silently ──
  // Each source is independent — one failure never affects others
  try {
    // Fast sources first (no Reddit dependency)
    const [hnPosts, wikiPages, googleTrending, trendData] = await Promise.all([
      API.getHackerNewsTrending().catch(() => []),
      API.getWikipediaTrending().catch(() => []),
      API.getTrendingSearches().catch(() => demoTrending),
      API.getGoogleTrends().catch(() => DEMO_CHART),
    ]);

    if (hnPosts.length)      renderDashList('hnList',      hnPosts.slice(0,10),   'hn');
    if (wikiPages.length)    renderDashList('wikiList',    wikiPages.slice(0,10), 'wiki');
    if (googleTrending.length) renderDashList('trendingList', googleTrending,     'google');

    // Update pulse widget with live data
    const pulseItems = [
      googleTrending[0] ? { source:'Google',     color:'#00f5a0', topic:googleTrending[0].term,       meta:'Google Trends',      delta:googleTrending[0].delta||'', url:`https://trends.google.com/trends/explore?q=${encodeURIComponent(googleTrending[0].term)}` } : null,
      hnPosts[0]        ? { source:'Hacker News', color:'#ff6314', topic:hnPosts[0].title,              meta:`${formatNum(hnPosts[0].score)} pts`,  delta:hnPosts[0].comments+' comments', url:hnPosts[0].url } : null,
      wikiPages[0]      ? { source:'Wikipedia',   color:'#4d9fff', topic:wikiPages[0].title,            meta:formatNum(wikiPages[0].views)+' views', delta:'Trending', url:wikiPages[0].url } : null,
      { source:'Reddit',      color:'#ff4500', topic:'Best side hustle ideas 2025',  meta:'r/Entrepreneur',  delta:'4.8K pts',  url:'https://reddit.com/r/Entrepreneur' },
      { source:'Product Hunt',color:'#ff7a2f', topic:'NotebookLM by Google',        meta:'Top launch today',delta:'▲ 1,240',   url:'https://notebooklm.google.com' },
      { source:'CoinGecko',   color:'#ffd60a', topic:'Bitcoin (BTC)',               meta:'MCap Rank #1',    delta:'Trending',  url:'https://www.coingecko.com/en/coins/bitcoin' },
    ].filter(Boolean);
    renderPulseWidget(pulseItems);

    // PH and Crypto independently
    API.getProductHuntTrending().then(ph => { if (ph?.length) renderDashList('phList', ph.slice(0,8), 'ph'); }).catch(() => {});
    API.getCryptoTrending().then(c  => { if (c?.length)  renderDashList('cryptoList', c.slice(0,8),  'crypto'); }).catch(() => {});

    // Reddit last — may be blocked on Railway, won't hold up anything else
    API.getRedditDashboard().then(redditPosts => {
      if (!redditPosts?.length) return;
      const products  = API.extractProductMentions(redditPosts);
      const questions = API.extractQuestions(redditPosts);
      const topics    = API.clusterTopics(redditPosts);
      const totalSig  = (redditPosts.length + (hnPosts?.length||0) + (wikiPages?.length||0)) * 180;
      setMetric('m-signals',  formatNum(totalSig),        'm-signals-delta', '↑ Live data loaded',  'up');
      setMetric('m-topics',   String(topics.length)+'+',  'm-topics-delta',  'Across all platforms', 'up');
      setMetric('m-products', String(products.length)+'+','m-products-delta','In demand right now',  'up');
      setMetric('m-questions',String(questions.length)+'+','m-questions-delta','Being asked today',  'up');
      if (products.length)  renderDashList('productsList',  products.slice(0,10),  'product');
      if (questions.length) renderDashList('questionsList', questions.slice(0,10), 'question');
    }).catch(() => {});

    updateTimestamp();
  } catch(e) { console.error('Dashboard error:', e); }

  State.loading = false; setRefreshSpinning(false);
}

function renderDashList(elId, items, type) {
  const el = document.getElementById(elId);
  if (!el || !items?.length) return;
  el.innerHTML = items.map((item, i) => {
    let name='', url='#', sub='', vol='';
    if      (type==='google')  { name=item.term||''; url=`https://trends.google.com/trends/explore?q=${encodeURIComponent(name)}`; sub=`Google · ${item.delta||''}`; }
    else if (type==='hn')      { name=item.title||''; url=item.url||'#'; sub=`HN · ${formatNum(item.score)} pts`; }
    else if (type==='wiki')    { name=item.title||''; url=item.url||'#'; sub=`Wikipedia · ${formatNum(item.views)} views`; }
    else if (type==='ph')      { name=item.title||''; url=item.url||'#'; sub=`Product Hunt${item.votes?' · ▲'+item.votes:''}`; }
    else if (type==='crypto')  { name=`${item.name} (${item.symbol||''})`; url=item.url||'#'; sub=`CoinGecko · MCap #${item.rank||'?'}`; }
    else if (type==='product') { name=capitalize(item.name||''); url=item.url||`https://www.reddit.com/search/?q=${encodeURIComponent(item.name||'')}&sort=hot&t=week`; sub='Reddit demand'; vol=String(item.score); }
    else if (type==='question'){ name=(item.text||'').substring(0,70); url=item.url||buildLink(item); sub=`${item.subreddit||item.source||''} · ${formatNum(item.score)} pts`; }
    return `<div class="trend-item trend-item-link" onclick="openLink('${escAttr(url)}')" title="${escHtml(name)}">
      <div class="trend-rank">#${i+1}</div>
      <div class="trend-name">${escHtml(name.substring(0,55))}${name.length>55?'...':''}<small>${escHtml(sub)}</small></div>
      ${vol?`<div class="trend-vol">${vol}</div>`:''}
    </div>`;
  }).join('');
}

// ── DIGITAL PRODUCTS ──────────────────────────────────────────────────
async function loadDigital() {
  State._loaded['digital'] = true;
  const el = document.getElementById('digitalContainer');
  if (!el) return;
  const niches  = await API.getDigitalProductTrends();
  const etsy    = API.getEtsyDigitalDemand();
  const amazon  = API.getAmazonDemandSignals();
  const redditQs = await API.getDigitalProductQuestions().catch(() => []);

  const demandColors = { 'VERY HIGH':'#00f5a0', 'HIGH':'#4d9fff', 'MED':'#ffd60a' };
  const nicheColors  = { 'Business':'#4d9fff','eCommerce':'#ff7a2f','Publishing':'#ffd60a','Marketing':'#ff4d8f','AI/Tech':'#00f5a0','Health':'#4dffb0','Wellness':'#b060ff','Fitness':'#ff7a2f','Nutrition':'#ffd60a','Finance':'#4d9fff','Productivity':'#00f5a0','Parenting':'#ff4d8f','Education':'#4dffb0','Design':'#b060ff','Food':'#ff7a2f','Travel':'#4d9fff','Tech':'#00f5a0','Mindset':'#b060ff','Relationships':'#ff4d8f' };

  el.innerHTML = `
  <div class="digital-hero">
    <div class="digital-hero-title">📚 What Digital Products Should You Create?</div>
    <div class="digital-hero-sub">Real demand data from Amazon Bestsellers, Etsy top sellers, Google Trends, and Reddit — updated daily. Find your next winning ebook, PDF, template or course.</div>
  </div>
  <div class="section-header">🔥 Highest-Demand Ebook & PDF Niches Right Now</div>
  <div class="digital-niches-grid">${niches.slice(0,32).map((n,i) => {
    const dc=demandColors[n.searchVol]||'#8888a0', nc=nicheColors[n.niche]||'#8888a0';
    const gUrl=`https://trends.google.com/trends/explore?q=${encodeURIComponent(n.gTrend)}`;
    const aUrl=`https://www.amazon.com/s?k=${encodeURIComponent(n.topic+' guide pdf')}`;
    const eUrl=`https://www.etsy.com/search?q=${encodeURIComponent(n.topic.toLowerCase())}`;
    return `<div class="digital-niche-card" onclick="openLink('${escAttr(gUrl)}')">
      <div class="digital-niche-top"><div class="digital-niche-rank">#${i+1}</div><span class="digital-niche-cat" style="background:${nc}22;color:${nc}">${n.niche}</span></div>
      <div class="digital-niche-name">${escHtml(n.topic)}</div>
      <div class="digital-demand-bar-wrap"><div class="digital-demand-bar" style="width:${n.ebookDemand}%;background:${dc}"></div></div>
      <div class="digital-niche-stats"><span class="digital-signal" style="color:${dc}">⚡ ${n.searchVol} demand</span><span class="digital-score" style="color:${dc}">${n.ebookDemand}/100</span></div>
      ${n.liveDelta?`<div class="digital-live-trend" style="color:${dc}">Google: ${n.liveDelta} this week</div>`:''}
      <div class="digital-niche-tags">${(n.tags||[]).map(t=>`<span class="digital-tag">${t}</span>`).join('')}</div>
      <div class="digital-niche-links">
        <button class="digital-link-btn" onclick="event.stopPropagation();openLink('${escAttr(gUrl)}')">Google Trends ↗</button>
        <button class="digital-link-btn" onclick="event.stopPropagation();openLink('${escAttr(aUrl)}')">Amazon ↗</button>
        <button class="digital-link-btn" onclick="event.stopPropagation();openLink('${escAttr(eUrl)}')">Etsy ↗</button>
      </div>
    </div>`;
  }).join('')}</div>
  <div class="section-header">🛍️ Etsy Digital Product Bestsellers</div>
  <div class="etsy-grid">${etsy.map(p=>`<div class="etsy-card" onclick="openLink('${escAttr(p.url)}')">
    <div class="etsy-cat">${escHtml(p.category)}</div>
    <div class="etsy-product">${escHtml(p.product)}</div>
    <div class="etsy-sales">📦 ${p.sales}/month</div>
    <div class="etsy-trend ${p.trend.startsWith('↑')?'up':'down'}">${p.trend}</div>
    <div class="etsy-price">💵 ${p.price}</div>
    <button class="digital-link-btn" style="margin-top:8px;width:100%">View on Etsy ↗</button>
  </div>`).join('')}</div>
  <div class="section-header">📦 Amazon Bestseller Category Signals</div>
  <div class="amazon-grid">${amazon.map((a,i)=>{
    const sc=a.signal==='VERY HIGH'?'#00f5a0':a.signal==='HIGH'?'#4d9fff':'#ffd60a';
    return `<div class="amazon-card" onclick="openLink('${escAttr(a.url)}')">
      <div class="amazon-rank">#${i+1}</div><div class="amazon-cat">${escHtml(a.category)}</div>
      <div class="amazon-sub">${escHtml(a.subcategory)}</div>
      <div class="amazon-signal" style="color:${sc}">⚡ ${a.signal} signal</div>
      <div class="amazon-insight">${escHtml(a.insight)}</div>
      <button class="digital-link-btn" style="margin-top:8px">See Amazon Bestsellers ↗</button>
    </div>`;
  }).join('')}</div>
  ${redditQs.length?`<div class="section-header">💬 What People Are Asking — Perfect PDF Topics</div>
  <div class="questions-container">${redditQs.slice(0,30).map(q=>{
    const rUrl=q.url||`https://www.reddit.com/search/?q=${encodeURIComponent(q.text)}`;
    const gUrl=`https://www.google.com/search?q=${encodeURIComponent(q.text)}`;
    const aUrl=`https://www.amazon.com/s?k=${encodeURIComponent(q.text.replace('?',''))}`;
    return `<div class="question-card">
      <div class="q-top"><div class="q-text">${escHtml(q.text)}</div><span class="q-intent intent-how">PDF Idea</span></div>
      <div class="q-meta"><span>Via: <strong>${escHtml(q.subreddit||'Reddit')}</strong></span><span>Score: <strong>${formatNum(q.score)}</strong></span></div>
      <div class="q-actions">
        <button class="q-btn q-btn-reddit" onclick="openLink('${escAttr(rUrl)}')">Reddit ↗</button>
        <button class="q-btn q-btn-google" onclick="openLink('${escAttr(gUrl)}')">Google ↗</button>
        <button class="q-btn" style="color:var(--orange);border-color:rgba(255,122,47,0.3)" onclick="openLink('${escAttr(aUrl)}')">Amazon ↗</button>
      </div>
    </div>`;
  }).join('')}</div>`:''}`;
}

// ── TOPICS ────────────────────────────────────────────────────────────
async function loadTopics() {
  State._loaded['topics'] = true;
  const grid = document.getElementById('topicsGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-state full">Loading topics...</div>';
  const category = document.getElementById('topicCategory')?.value || 'all';
  const source   = document.getElementById('topicSource')?.value   || 'all';
  const catSubs  = category==='all' ? ['technology','artificial','personalfinance','fitness','movies','food','travel','productivity','BuyItForLife','AskReddit','worldnews','science','Entrepreneur'] : (API.SUBREDDIT_MAP[category]||[]).slice(0,15);
  try {
    const [reddit,hn,wiki,google] = await Promise.all([
      (source==='all'||source==='reddit')    ? API.getRedditMulti(catSubs,15).catch(()=>[]) : Promise.resolve([]),
      (source==='all'||source==='hn')        ? API.getHackerNewsTrending().catch(()=>[])    : Promise.resolve([]),
      (source==='all'||source==='wikipedia') ? API.getWikipediaTrending().catch(()=>[])     : Promise.resolve([]),
      (source==='all'||source==='google')    ? API.getTrendingSearches().catch(()=>[])      : Promise.resolve([]),
    ]);
    const [devto,github] = await Promise.all([
      (source==='all'||source==='devto')  ? API.getDevToArticles('',20).catch(()=>[]) : Promise.resolve([]),
      (source==='all'||source==='github') ? API.getGitHubTrending().catch(()=>[])     : Promise.resolve([]),
    ]);
    const topics=[], matchCat=t=>category==='all'||guessCat(t)===category;
    google.filter(g=>matchCat(g.term)).forEach(g=>topics.push({ name:g.term,category:guessCat(g.term),sources:['Google'],volume:(g.volume||'')+'K',delta:g.delta||'',url:`https://trends.google.com/trends/explore?q=${encodeURIComponent(g.term)}`,meta:`Trend score: ${g.volume}` }));
    API.clusterTopics(reddit).slice(0,30).filter(c=>matchCat(c.name)).forEach(c=>topics.push({ name:c.name,category:guessCat(c.name),sources:['Reddit'],volume:formatNum(c.score),delta:'',url:c.url,meta:'Reddit discussion' }));
    reddit.slice(0,25).filter(p=>matchCat(p.title)).forEach(p=>topics.push({ name:p.title.substring(0,65),category:subToCat(p.subreddit),sources:['Reddit'],volume:formatNum(p.score),delta:'',url:p.url,meta:p.subreddit }));
    hn.slice(0,20).filter(p=>matchCat(p.title)).forEach(p=>topics.push({ name:p.title.substring(0,65),category:guessCat(p.title),sources:['Hacker News'],volume:formatNum(p.score),delta:'',url:p.url,meta:`${p.score} pts` }));
    wiki.slice(0,20).forEach(p=>topics.push({ name:p.title,category:guessCat(p.title),sources:['Wikipedia'],volume:formatNum(p.views)+' views',delta:'',url:p.url,meta:'Trending today' }));
    devto.slice(0,15).filter(a=>matchCat(a.title)).forEach(a=>topics.push({ name:a.title.substring(0,65),category:'technology',sources:['DEV.to'],volume:formatNum(a.reactions)+' ❤',delta:'',url:a.url,meta:(a.tags||[]).slice(0,3).join(' · ') }));
    github.slice(0,15).forEach(r=>topics.push({ name:r.title,category:'technology',sources:['GitHub'],volume:`⭐ ${formatNum(r.stars)}`,delta:r.starsToday?`+${r.starsToday} today`:'',url:r.url,meta:r.language }));
    const seen=new Set();
    const unique=topics.filter(t=>{ const k=t.name.substring(0,20).toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
    grid.innerHTML=(unique.length?`<div class="results-count">${unique.length} topics found</div>`:'')+(unique.length?unique.slice(0,80).map(t=>renderTopicCard(t)).join(''):'<div class="loading-state full">No topics found — try changing filters</div>');
  } catch(e) { grid.innerHTML='<div class="loading-state full">Error loading topics</div>'; }
}

function renderTopicCard(t) {
  const url=t.url||buildLink(t);
  return `<div class="topic-card" onclick="openLink('${escAttr(url)}')">
    <div class="topic-card-top"><div class="topic-name">${escHtml((t.name||'').substring(0,55))}${(t.name||'').length>55?'...':''}</div><span class="topic-cat cat-${t.category||'other'}">${t.category||'other'}</span></div>
    <div class="topic-sources">${(t.sources||[]).map(s=>`<span class="src-badge">${s}</span>`).join('')}<span class="src-badge open-badge">↗</span></div>
    <div class="topic-volume">${t.volume||''}</div>
    ${t.meta?`<div class="topic-meta">${escHtml(t.meta)}</div>`:''}
    ${t.delta?`<div class="trend-delta ${t.delta.startsWith('+')?'up':'down'}">${t.delta}</div>`:''}
  </div>`;
}

// ── PRODUCTS ──────────────────────────────────────────────────────────
async function loadProducts() {
  State._loaded['products'] = true;
  const wrap = document.getElementById('productsGrid');
  if (!wrap) return;
  // Show demo products instantly
  renderProductsGrid(DEMO_PRODUCTS, []);
  // Then try live data
  try {
    const productSubs = [...(API.SUBREDDIT_MAP.shopping||[]),...(API.SUBREDDIT_MAP.technology||[]).slice(0,4),...(API.SUBREDDIT_MAP.health||[]).slice(0,3),'Frugal','AskReddit'];
    const [posts, ph] = await Promise.all([API.getRedditMulti(productSubs,15).catch(()=>[]), API.getProductHuntTrending().catch(()=>[])]);
    const products = API.extractProductMentions(posts);
    renderProductsGrid(products.length ? products : DEMO_PRODUCTS, ph);
  } catch(e) { renderProductsGrid(DEMO_PRODUCTS, []); }
}

function renderProductsGrid(products, ph) {
  const wrap = document.getElementById('productsGrid');
  if (!wrap) return;
  const colors=['#00f5a0','#4d9fff','#ff7a2f','#ffd60a','#ff4d8f'];
  const maxS=Math.max(...products.map(p=>p.score),1);
  let html='';
  if (ph?.length) { html+=`<div class="section-header">🚀 Product Hunt — Latest Launches</div><div class="ph-grid">${ph.map(p=>`<div class="ph-card" onclick="openLink('${escAttr(p.url||'#')}')"><div class="ph-title">${escHtml(p.title||'')}</div><div class="ph-desc">${escHtml((p.description||'').substring(0,100))}</div>${p.votes?`<div class="ph-votes">▲ ${p.votes}</div>`:''}</div>`).join('')}</div>`; }
  html+=`<div class="section-header">🛒 Product Demand Intelligence</div><div class="products-inner">${products.slice(0,48).map((p,i)=>{ const pct=Math.round((p.score/maxS)*100); const color=colors[i%5]; const rUrl=p.url||`https://www.reddit.com/search/?q=${encodeURIComponent(p.name)}&sort=hot&t=week`; const aUrl=`https://www.amazon.com/s?k=${encodeURIComponent(p.name)}`; const gUrl=`https://www.google.com/search?q=${encodeURIComponent(capitalize(p.name)+' review 2025')}`; return `<div class="product-card"><div class="product-rank" style="color:${color}">#${i+1}</div><div class="product-name">${escHtml(capitalize(p.name))}</div><div class="product-desc">High demand signal</div><div class="product-stats"><div class="pstat"><div class="pstat-val" style="color:${color}">${p.score}</div><div class="pstat-lab">Demand</div></div><div class="pstat"><div class="pstat-val" style="color:${color}">${pct}%</div><div class="pstat-lab">Relative</div></div><div class="pstat"><div class="pstat-val" style="color:${color}">${i<5?'🔥':i<15?'📈':'💬'}</div><div class="pstat-lab">Signal</div></div></div><div class="product-trend-bar"><div class="product-trend-fill" style="width:${pct}%;background:${color}"></div></div><div class="product-links"><button class="product-link-btn" onclick="event.stopPropagation();openLink('${escAttr(rUrl)}')">Reddit ↗</button><button class="product-link-btn" onclick="event.stopPropagation();openLink('${escAttr(gUrl)}')">Reviews ↗</button><button class="product-link-btn" onclick="event.stopPropagation();openLink('${escAttr(aUrl)}')">Amazon ↗</button></div></div>`; }).join('')}</div>`;
  wrap.innerHTML=html;
}

// ── QUESTIONS ─────────────────────────────────────────────────────────
async function loadQuestions() {
  State._loaded['questions'] = true;
  const el = document.getElementById('questionsContainer');
  if (!el) return;
  el.innerHTML = '<div class="loading-state full">Loading questions...</div>';
  try {
    const qSubs=['AskReddit','NoStupidQuestions','explainlikeimfive','personalfinance','fitness','cooking','travel','technology','relationship_advice','careerguidance'];
    const [reddit,hn,so] = await Promise.all([API.getRedditMulti(qSubs,15).catch(()=>[]), API.getHNAsk().catch(()=>[]), API.getStackOverflowTrending().catch(()=>[])]);
    const allPosts=[...reddit,...hn.map(h=>({...h,title:h.title.replace(/^Ask HN:\s*/i,''),subreddit:'Hacker News'})),...so.map(s=>({...s,subreddit:'Stack Overflow'}))];
    const questions=API.extractQuestions(allPosts);
    const intentFilter=document.getElementById('intentFilter')?.value||'all';
    const filtered=intentFilter==='all'?questions:questions.filter(q=>q.intent===intentFilter);
    const intentLabels={how:'How-to',what:'Informational',best:'Best-of',buy:'Purchase Intent',why:'Conceptual'};
    const display=filtered.length?filtered:DEMO_QUESTIONS;
    el.innerHTML=`<div class="results-count">${display.length} questions</div>`+display.slice(0,80).map(q=>{
      const rUrl=q.url||`https://www.reddit.com/search/?q=${encodeURIComponent(q.text)}&sort=hot&t=week`;
      const gUrl=`https://www.google.com/search?q=${encodeURIComponent(q.text)}`;
      return `<div class="question-card"><div class="q-top"><div class="q-text">${escHtml(q.text)}</div><span class="q-intent intent-${q.intent}">${intentLabels[q.intent]||q.intent}</span></div><div class="q-meta"><span>Via: <strong>${escHtml(q.subreddit||q.source||'')}</strong></span><span>Score: <strong>${formatNum(q.score)}</strong></span></div><div class="q-actions"><button class="q-btn q-btn-reddit" onclick="openLink('${escAttr(rUrl)}')">Read discussion ↗</button><button class="q-btn q-btn-google" onclick="openLink('${escAttr(gUrl)}')">Search Google ↗</button></div></div>`;
    }).join('');
  } catch(e) { el.innerHTML='<div class="loading-state full">Error loading questions</div>'; }
}

// ── YOUTUBE ───────────────────────────────────────────────────────────
async function loadYouTube() {
  State._loaded['youtube'] = true;
  await window._loadYouTubeFixed?.() || loadYouTubeFallback();
}
async function loadYouTubeFallback() {
  const el=document.getElementById('youtubeContainer');
  if(!el) return;
  const vids=await API.getYouTubeTrending('US','0').catch(()=>[]);
  if(!vids.length){el.innerHTML='<div class="loading-state full">Add your YouTube API key in ⚙ Update API Keys to see trending videos</div>';return;}
  el.innerHTML=`<div class="results-count">${vids.length} trending videos</div><div class="yt-grid">${vids.map(v=>`<div class="yt-card" onclick="openLink('${escAttr(v.url)}')">${v.thumbnail?`<div class="yt-thumb-wrap"><img src="${escHtml(v.thumbnail)}" class="yt-thumb" loading="lazy" onerror="this.parentElement.innerHTML='<div class=yt-thumb-ph>&#9654;</div>'"></div>`:'<div class="yt-thumb-ph">&#9654;</div>'}<div class="yt-body"><div class="yt-title">${escHtml(v.title)}</div><div class="yt-channel">${escHtml(v.channel||'')}</div><div class="yt-stats">${v.views?`<span>👁 ${formatNum(v.views)}</span>`:''}</div></div></div>`).join('')}</div>`;
}

// ── NEWS ──────────────────────────────────────────────────────────────
async function loadNews() {
  State._loaded['news'] = true;
  const el=document.getElementById('newsContainer');
  if(!el) return;
  el.innerHTML='<div class="loading-state full">Loading headlines...</div>';
  const [hnTop,generalNews,techNews]=await Promise.all([API.getHackerNewsTrending().catch(()=>[]),API.getTopHeadlines('general').catch(()=>[]),API.getTopHeadlines('technology').catch(()=>[])]);
  const seen=new Set();
  const articles=[...generalNews,...techNews].filter(a=>{ if(!a.title||seen.has(a.title)) return false; seen.add(a.title); return true; });
  const all=[...hnTop.slice(0,15).map(h=>({...h,outlet:'Hacker News',description:`${h.score} pts · ${h.comments} comments`})),...articles];
  el.innerHTML=`<div class="results-count">${all.length} stories</div><div class="news-grid">${all.slice(0,60).map(a=>`<div class="news-card" onclick="openLink('${escAttr(a.url||'#')}')"><div class="news-outlet">${escHtml(a.outlet||a.source||'')}</div><div class="news-title">${escHtml(a.title||'')}</div>${a.description?`<div class="news-desc">${escHtml((a.description||'').substring(0,120))}...</div>`:''}<div class="news-meta">${a.published?`<span>${timeAgo(new Date(a.published))}</span>`:''}<span class="news-open">Read ↗</span></div></div>`).join('')}</div>`;
}

// ── GITHUB ────────────────────────────────────────────────────────────
async function loadGitHub() {
  State._loaded['github'] = true;
  const el=document.getElementById('githubContainer');
  if(!el) return;
  el.innerHTML='<div class="loading-state full">Loading GitHub trending...</div>';
  const [daily,weekly]=await Promise.all([API.getGitHubTrending('','daily').catch(()=>[]),API.getGitHubTrending('','weekly').catch(()=>[])]);
  const seen=new Set(); const all=[...daily,...weekly].filter(r=>{ if(seen.has(r.url)) return false; seen.add(r.url); return true; });
  const lc={'Python':'#3572A5','JavaScript':'#f1e05a','TypeScript':'#2b7489','Rust':'#dea584','Go':'#00ADD8','Java':'#b07219','Unknown':'#8888a0'};
  el.innerHTML=all.length?`<div class="results-count">${all.length} trending repositories</div><div class="gh-grid">${all.slice(0,60).map(r=>`<div class="gh-card" onclick="openLink('${escAttr(r.url)}')"><div class="gh-name">${escHtml(r.title)}</div><div class="gh-desc">${escHtml((r.description||'No description').substring(0,100))}</div><div class="gh-stats"><span>⭐ ${formatNum(r.stars)}</span>${r.starsToday?`<span class="gh-new">+${r.starsToday} today</span>`:''}<span>🍴 ${formatNum(r.forks)}</span><span class="gh-lang" style="color:${lc[r.language]||'#8888a0'}">● ${r.language}</span></div></div>`).join('')}</div>`:'<div class="loading-state full">GitHub Trending unavailable — try refreshing</div>';
}

// ── DEV.TO ────────────────────────────────────────────────────────────
async function loadDevTo() {
  State._loaded['devto'] = true;
  const el=document.getElementById('devtoContainer');
  if(!el) return;
  el.innerHTML='<div class="loading-state full">Loading DEV.to articles...</div>';
  const tags=['javascript','python','ai','webdev','career','productivity','react','tutorial'];
  const [general,...tagged]=await Promise.all([API.getDevToArticles('',20).catch(()=>[]),...tags.map(t=>API.getDevToArticles(t,6).catch(()=>[]))]);
  const seen=new Set(); const all=[...general,...tagged.flat()].filter(a=>{ if(seen.has(a.url)) return false; seen.add(a.url); return true; }).sort((a,b)=>b.reactions-a.reactions);
  el.innerHTML=all.length?`<div class="results-count">${all.length} developer articles</div><div class="devto-grid">${all.slice(0,60).map(a=>`<div class="devto-card" onclick="openLink('${escAttr(a.url)}')">${a.cover?`<img class="devto-cover" src="${escHtml(a.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<div style="height:80px;background:var(--bg3);border-radius:var(--rl) var(--rl) 0 0"></div>'}<div class="devto-body"><div class="devto-tags">${(a.tags||[]).slice(0,3).map(t=>`<span class="devto-tag">#${t}</span>`).join('')}</div><div class="devto-title">${escHtml(a.title)}</div><div class="devto-author">by ${escHtml(a.author)} · ${a.readTime}min</div><div class="devto-stats"><span>❤ ${formatNum(a.reactions)}</span><span>💬 ${formatNum(a.comments)}</span></div></div></div>`).join('')}</div>`:'<div class="loading-state full">DEV.to unavailable — try refreshing</div>';
}

// ── CRYPTO ────────────────────────────────────────────────────────────
async function loadCrypto() {
  State._loaded['crypto'] = true;
  const el=document.getElementById('cryptoContainer');
  if(!el) return;
  // Show demo instantly
  renderCryptoPage(DEMO_CRYPTO, []);
  // Try live
  const [trending,prices]=await Promise.all([API.getCryptoTrending().catch(()=>[]),API.getCryptoPrices().catch(()=>[])]);
  renderCryptoPage(trending.length?trending:DEMO_CRYPTO, prices);
}

function renderCryptoPage(trending, prices) {
  const el=document.getElementById('cryptoContainer');
  if(!el) return;
  let html='';
  if(prices.length){html+=`<div class="section-header">💹 Live Prices (USD)</div><div class="crypto-price-grid">${prices.map(c=>{const up=parseFloat(c.change)>=0;return `<div class="crypto-card" onclick="openLink('${escAttr(c.url)}')"><div class="crypto-name">${escHtml(c.name)}</div><div class="crypto-price">$${parseFloat(c.price).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6})}</div><div class="crypto-change ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(c.change)}% 24h</div>${c.mcap?`<div class="crypto-mcap">MCap: $${(c.mcap/1e9).toFixed(1)}B</div>`:''}</div>`;}).join('')}</div>`;}
  if(trending.length){html+=`<div class="section-header">🔥 Trending on CoinGecko</div><div class="crypto-price-grid">${trending.map((c,i)=>`<div class="crypto-card" onclick="openLink('${escAttr(c.url)}')"><div class="crypto-trend-rank">#${i+1} Trending</div><div class="crypto-name">${escHtml(c.name)} <span style="color:var(--text3)">(${c.symbol})</span></div>${c.rank?`<div class="crypto-mcap">MCap Rank #${c.rank}</div>`:''}</div>`).join('')}</div>`;}
  el.innerHTML=html||'<div class="loading-state full">Crypto data unavailable</div>';
}

// ── BOOKS ─────────────────────────────────────────────────────────────
async function loadBooks() {
  State._loaded['books'] = true;
  const el=document.getElementById('booksContainer');
  if(!el) return;
  el.innerHTML='<div class="loading-state full">Loading books...</div>';
  const [daily,reddit]=await Promise.all([API.getTrendingBooks().catch(()=>[]),API.getRedditMulti(['books','Fantasy','scifi','history','philosophy'],12).catch(()=>[])]);
  const discussed=reddit.filter(p=>p.title&&/book|novel|read|author|recommend/i.test(p.title));
  let html='';
  if(daily.length){html+=`<div class="section-header">📚 Trending on Open Library</div><div class="books-grid">${daily.map(b=>`<div class="book-card" onclick="openLink('${escAttr(b.url)}')">${b.cover?`<img class="book-cover" src="${escHtml(b.cover)}" alt="" loading="lazy" onerror="this.style.display='none'">`:'<div class="book-cover-ph">📖</div>'}<div class="book-info"><div class="book-title">${escHtml(b.title)}</div><div class="book-author">${escHtml(b.author||'Unknown')}</div><div class="book-meta">${b.year?b.year+' · ':''}${b.rating?'⭐ '+b.rating:''}</div>${b.reads?`<div class="book-reads">${formatNum(b.reads)} want to read</div>`:''}</div></div>`).join('')}</div>`;}
  if(discussed.length){html+=`<div class="section-header">💬 Books on Reddit</div><div class="topics-grid">${discussed.slice(0,24).map(p=>renderTopicCard({name:p.title,category:'entertainment',sources:['Reddit'],volume:formatNum(p.score),delta:'',url:p.url,meta:p.subreddit})).join('')}</div>`;}
  el.innerHTML=html||'<div class="loading-state full">No book data available</div>';
}

// ── JOBS ──────────────────────────────────────────────────────────────
async function loadJobs() {
  State._loaded['jobs'] = true;
  const el=document.getElementById('jobsContainer');
  if(!el) return;
  el.innerHTML='<div class="loading-state full">Loading remote jobs...</div>';
  const cats=['software-dev','devops-sysadmin','design','marketing','product','data'];
  const results=await Promise.all(cats.map(c=>API.getRemoteJobs(c).catch(()=>[])));
  const all=results.flat().sort((a,b)=>new Date(b.created)-new Date(a.created));
  el.innerHTML=all.length?`<div class="results-count">${all.length} remote jobs</div><div class="jobs-grid">${all.slice(0,60).map(j=>`<div class="job-card" onclick="openLink('${escAttr(j.url)}')"><div class="job-cat">${escHtml(j.category||'')}</div><div class="job-title">${escHtml(j.title||'')}</div><div class="job-company">${escHtml(j.company||'')}</div><div class="job-location">🌍 ${escHtml(j.location||'Worldwide')}</div>${j.salary?`<div class="job-salary">💰 ${escHtml(j.salary)}</div>`:''}<div class="job-meta">${j.created?timeAgo(j.created):'Recent'}</div>${j.tags?.length?`<div class="job-tags">${j.tags.slice(0,4).map(t=>`<span class="job-tag">${escHtml(t)}</span>`).join('')}</div>`:''}</div>`).join('')}</div>`:'<div class="loading-state full">Remotive temporarily unavailable</div>';
}

// ── STACKOVERFLOW ─────────────────────────────────────────────────────
async function loadStackOverflow() {
  State._loaded['stackoverflow'] = true;
  const el=document.getElementById('soContainer');
  if(!el) return;
  el.innerHTML='<div class="loading-state full">Loading Stack Overflow...</div>';
  const questions=await API.getStackOverflowTrending().catch(()=>[]);
  el.innerHTML=questions.length?`<div class="results-count">${questions.length} hot questions</div><div class="questions-container">${questions.map(q=>`<div class="question-card"><div class="q-top"><div class="q-text">${escHtml(q.title)}</div><span class="q-intent intent-how">${q.answers} answers</span></div><div class="q-meta"><span>Score: <strong>${q.score}</strong></span><span>Views: <strong>${formatNum(q.views)}</strong></span></div>${q.tags?.length?`<div class="q-tags">${q.tags.map(t=>`<span class="so-tag">${escHtml(t)}</span>`).join('')}</div>`:''}<div class="q-actions"><button class="q-btn q-btn-reddit" onclick="openLink('${escAttr(q.url)}')">View on SO ↗</button><button class="q-btn q-btn-google" onclick="openLink('https://www.google.com/search?q=${encodeURIComponent(q.title)}')">Google ↗</button></div></div>`).join('')}</div>`:'<div class="loading-state full">Stack Overflow unavailable — try refreshing</div>';
}

// ── ALERTS ────────────────────────────────────────────────────────────
async function loadAlerts() {
  State._loaded['alerts'] = true;
  const el=document.getElementById('alertsList');
  if(!el) return;
  el.innerHTML='<div class="loading-state full">Scanning...</div>';
  const [trending,hn,crypto]=await Promise.all([API.getTrendingSearches().catch(()=>[]),API.getHackerNewsTrending().catch(()=>[]),API.getCryptoTrending().catch(()=>DEMO_CRYPTO)]);
  const alerts=[
    ...trending.filter(t=>parseInt(t.delta)>25).map(t=>({ type:'spike',icon:'🚨',title:`"${t.term}" — Google spike`,detail:`Up ${t.delta} in search interest`,badge:t.delta,url:`https://trends.google.com/trends/explore?q=${encodeURIComponent(t.term)}` })),
    ...hn.filter(h=>h.score>300).slice(0,8).map(h=>({ type:'new',icon:'🚀',title:h.title,detail:`${formatNum(h.score)} pts · ${h.comments} comments on HN`,badge:formatNum(h.score)+' pts',url:h.url })),
    ...(crypto||DEMO_CRYPTO).slice(0,5).map((c,i)=>({ type:'rising',icon:'💰',title:`${c.name} (${c.symbol}) trending`,detail:`Rank #${i+1} on CoinGecko`,badge:`#${i+1}`,url:c.url })),
    ...trending.filter(t=>parseInt(t.delta)>=10&&parseInt(t.delta)<=25).slice(0,5).map(t=>({ type:'rising',icon:'📈',title:`"${t.term}" — Rising`,detail:`${t.delta} increase in search interest`,badge:t.delta,url:`https://trends.google.com/trends/explore?q=${encodeURIComponent(t.term)}` })),
  ];
  el.innerHTML=(alerts.length?`<div class="results-count">${alerts.length} active signals</div>`:'')+
    (alerts.length?alerts.map(a=>`<div class="alert-card ${a.type}" onclick="openLink('${escAttr(a.url)}')" style="cursor:pointer;"><div class="alert-icon">${a.icon}</div><div class="alert-body"><div class="alert-title">${escHtml(a.title)}</div><div class="alert-detail">${escHtml(a.detail)}</div><div class="alert-cta">Click to explore ↗</div></div><div class="alert-badge ${a.type}">${a.badge}</div></div>`).join(''):'<div class="loading-state full">No significant spikes right now</div>');
}

// ── REFRESH ───────────────────────────────────────────────────────────
async function refreshAll() {
  if (State.loading) return;
  State._loaded = {};
  await loadDashboard();
  const v=State.currentView;
  if (v!=='dashboard') {
    const loaders={digital:loadDigital,topics:loadTopics,products:loadProducts,questions:loadQuestions,youtube:loadYouTube,news:loadNews,github:loadGitHub,devto:loadDevTo,crypto:loadCrypto,books:loadBooks,jobs:loadJobs,stackoverflow:loadStackOverflow,alerts:loadAlerts};
    if(loaders[v]) loaders[v]();
  }
}

function setRefreshSpinning(yes){document.getElementById('refreshBtn')?.classList.toggle('spinning',yes);}
function showSettings(){document.getElementById('settingsModal').classList.add('open');}
function hideSettings(){document.getElementById('settingsModal').classList.remove('open');}
function saveSettings(){
  const yt=document.getElementById('ytApiKey').value.trim(),news=document.getElementById('newsApiKey').value.trim();
  if(yt)localStorage.setItem('ytApiKey',yt);if(news)localStorage.setItem('newsApiKey',news);
  State._loaded['youtube']=false;State._loaded['news']=false;hideSettings();
}
function loadSettings(){
  const yt=localStorage.getItem('ytApiKey'),news=localStorage.getItem('newsApiKey');
  if(yt)document.getElementById('ytApiKey').value=yt;if(news)document.getElementById('newsApiKey').value=news;
}

// ── HELPERS ───────────────────────────────────────────────────────────
function setMetric(id,val,dId,dText,dClass){const e=document.getElementById(id);if(e)e.textContent=val;const d=document.getElementById(dId);if(d){d.textContent=dText;d.className=`metric-delta ${dClass}`;}}
function updateTimestamp(){const e=document.getElementById('lastUpdated');if(e)e.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function timeAgo(date){if(!date)return'';const s=Math.floor((Date.now()-new Date(date))/1000);if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}
function formatNum(n){n=parseInt(n)||0;if(n>=1000000)return(n/1000000).toFixed(1)+'M';if(n>=1000)return(n/1000).toFixed(1)+'K';return String(n);}
function escHtml(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(s){return(s||'').replace(/'/g,'%27').replace(/"/g,'%22');}
function capitalize(s){return(s||'').replace(/\b\w/g,c=>c.toUpperCase());}
function subToCat(sub){
  sub=(sub||'').toLowerCase().replace('r/','');
  if(['technology','gadgets','programming','software','artificial','chatgpt','machinelearning','apple','android','hardware','linux','python'].some(k=>sub.includes(k)))return'technology';
  if(['fitness','health','diet','nutrition','gym','loseit','running','yoga'].some(k=>sub.includes(k)))return'health';
  if(['finance','investing','stocks','crypto','frugal','entrepreneur','passive_income'].some(k=>sub.includes(k)))return'finance';
  if(['movies','gaming','music','books','television','anime','netflix'].some(k=>sub.includes(k)))return'entertainment';
  if(['food','cooking','recipes','meal','baking','coffee','vegan'].some(k=>sub.includes(k)))return'food';
  if(['travel','backpack','solotravel','camping','roadtrip','flights'].some(k=>sub.includes(k)))return'travel';
  if(['minimalism','productivity','selfimprovement','lifestyle'].some(k=>sub.includes(k)))return'lifestyle';
  return'other';
}
function guessCat(t){
  t=(t||'').toLowerCase();
  if(['ai','app','software','tool','tech','code','robot','gpt','llm','api','bitcoin','linux','python','react','server','cloud','github','devops','saas'].some(k=>t.includes(k)))return'technology';
  if(['workout','diet','health','fitness','gym','weight','sleep','protein','calorie','mental','anxiety','meditation','yoga'].some(k=>t.includes(k)))return'health';
  if(['invest','stock','crypto','money','budget','finance','income','salary','tax','dividend','etf','side hustle'].some(k=>t.includes(k)))return'finance';
  if(['movie','game','music','show','netflix','book','anime','series','episode','album','gaming'].some(k=>t.includes(k)))return'entertainment';
  if(['recipe','food','meal','cook','restaurant','eat','drink','coffee','vegan','baking'].some(k=>t.includes(k)))return'food';
  if(['travel','hotel','flight','trip','vacation','tour','visa','passport','airbnb','camping'].some(k=>t.includes(k)))return'travel';
  if(['productivity','routine','habit','motivation','mindset','lifestyle','minimalism'].some(k=>t.includes(k)))return'lifestyle';
  return'other';
}
