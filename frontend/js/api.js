/* ============================================
   API.JS — TrendPulse Reliable Data Engine
   
   Reliability features:
   - sessionStorage cache: each source cached 
     15-30 mins so refreshing doesn't re-fetch
   - fetchWithTimeout: every API call has a 
     hard timeout, never hangs forever
   - Tiered fallbacks: Live → Cache → Demo
     so the page always shows something
   - Promise.allSettled everywhere: one failed
     API never breaks the whole page
   ============================================ */

const API = (() => {

  // ── CONFIG ───────────────────────────────────────────────────────
  const BACKEND  = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api'; // same origin on Railway/Render
  const YT_KEY   = () => localStorage.getItem('ytApiKey')   || '';
  const NEWS_KEY = () => localStorage.getItem('newsApiKey') || '';

  // Cache TTLs (milliseconds)
  const TTL = {
    reddit:    20 * 60 * 1000,  // 20 mins
    hn:        15 * 60 * 1000,  // 15 mins
    wikipedia: 30 * 60 * 1000,  // 30 mins
    github:    30 * 60 * 1000,  // 30 mins
    devto:     25 * 60 * 1000,  // 25 mins
    crypto:    10 * 60 * 1000,  // 10 mins
    youtube:   20 * 60 * 1000,  // 20 mins
    news:      20 * 60 * 1000,  // 20 mins
    trends:    30 * 60 * 1000,  // 30 mins
    books:     60 * 60 * 1000,  // 60 mins
    jobs:      30 * 60 * 1000,  // 30 mins
    so:        20 * 60 * 1000,  // 20 mins
  };

  // ── CACHE HELPERS ─────────────────────────────────────────────────
  function cacheSet(key, data, ttl) {
    try {
      sessionStorage.setItem('tp_' + key, JSON.stringify({ data, exp: Date.now() + ttl }));
    } catch(e) {} // sessionStorage might be full
  }

  function cacheGet(key) {
    try {
      const raw = sessionStorage.getItem('tp_' + key);
      if (!raw) return null;
      const { data, exp } = JSON.parse(raw);
      if (Date.now() > exp) { sessionStorage.removeItem('tp_' + key); return null; }
      return data;
    } catch(e) { return null; }
  }

  // ── FETCH WITH TIMEOUT ────────────────────────────────────────────
  async function fetchT(url, opts = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch(e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // ── CACHED FETCH ──────────────────────────────────────────────────
  // Tries cache first, then live, then returns null on failure
  async function cachedFetch(cacheKey, fetchFn, ttl) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
    try {
      const data = await fetchFn();
      if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
        cacheSet(cacheKey, data, ttl);
      }
      return data;
    } catch(e) {
      return null;
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── SUBREDDIT MAP ─────────────────────────────────────────────────
  const SUBREDDIT_MAP = {
    technology:    ['technology','artificial','ChatGPT','programming','webdev','gadgets','android','apple','MachineLearning','devops','opensource','linux','Python','javascript'],
    finance:       ['personalfinance','investing','stocks','Entrepreneur','smallbusiness','freelance','passive_income','financialindependence','frugal','RealEstate','dividends'],
    health:        ['fitness','loseit','nutrition','running','yoga','mentalhealth','sleep','bodybuilding','intermittentfasting','keto','meditation','Supplements'],
    lifestyle:     ['minimalism','productivity','selfimprovement','GetMotivated','relationship_advice','AskMen','AskWomen','LifeProTips','ADHD','adulting'],
    entertainment: ['movies','television','Music','gaming','books','anime','netflix','spotify','Fantasy','scifi','horror'],
    food:          ['food','recipes','MealPrepSunday','EatCheapAndHealthy','Cooking','coffee','Baking','cocktails','wine'],
    travel:        ['travel','solotravel','backpacking','digitalnomad','roadtrip','camping','Flights','expats'],
    shopping:      ['BuyItForLife','frugalmalefashion','femalefashionadvice','ProductReviews','deals','buildapc','SkincareAddiction','sneakers','MechanicalKeyboards'],
    business:      ['startups','Entrepreneur','marketing','SEO','ecommerce','SideProject','SaaS','indiehackers','copywriting','dropshipping'],
    education:     ['learnprogramming','learnmath','history','philosophy','science','space','biology','astronomy','cscareerquestions'],
    news:          ['worldnews','news','todayilearned','interestingasfuck','Futurology'],
    general:       ['all','AskReddit','NoStupidQuestions','explainlikeimfive','Showerthoughts','Advice'],
    digital:       ['Etsy','KDP','passive_income','Entrepreneur','SideProject','indiehackers','ContentCreators','blogging','OnlineCourses','selfpublish'],
  };

  // ── REDDIT ────────────────────────────────────────────────────────
  async function getRedditTrending(subreddit = 'all', limit = 20) {
    const cacheKey = 'reddit_' + subreddit + '_' + limit;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
      const res  = await fetchT(
        `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}&t=day`,
        { headers: { Accept: 'application/json' } },
        6000
      );
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const cutoff = Date.now() - 72 * 3600000;
      const posts = data.data.children.map(p => ({
        source: 'Reddit', title: p.data.title,
        subreddit: p.data.subreddit_name_prefixed,
        score: p.data.score, comments: p.data.num_comments,
        url: `https://reddit.com${p.data.permalink}`,
        created: new Date(p.data.created_utc * 1000),
      })).filter(p => p.created.getTime() > cutoff || p.score > 300);

      cacheSet(cacheKey, posts, TTL.reddit);
      return posts;
    } catch(e) {
      return [];
    }
  }

  // Dashboard: all subs in parallel, cached as a group
  async function getRedditDashboard() {
    const cacheKey = 'reddit_dashboard';
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const dashSubs = ['all','technology','personalfinance','fitness','AskReddit','Entrepreneur','gadgets','movies','food','productivity','BuyItForLife','worldnews','selfimprovement'];
    const results = await Promise.allSettled(dashSubs.map(s => getRedditTrending(s, 15)));
    const posts = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value).sort((a,b) => b.score - a.score);

    // Always return demo fallback if nothing came back
    const final = posts.length > 5 ? posts : getRedditDemoPosts();
    cacheSet(cacheKey, final, TTL.reddit);
    return final;
  }

  // Batched multi-subreddit fetch
  async function getRedditMulti(subreddits, limit = 15) {
    const cacheKey = 'reddit_multi_' + (subreddits || []).slice(0,5).join('_');
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const subs = subreddits || Object.values(SUBREDDIT_MAP).flat().slice(0, 20);
    const batchSize = 5;
    const all = [];
    for (let i = 0; i < subs.length; i += batchSize) {
      const batch = subs.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map(s => getRedditTrending(s, limit)));
      results.filter(r => r.status === 'fulfilled').forEach(r => all.push(...r.value));
      if (i + batchSize < subs.length) await sleep(150);
    }
    const sorted = all.sort((a,b) => b.score - a.score);
    const final = sorted.length > 5 ? sorted : getRedditDemoPosts();
    cacheSet(cacheKey, final, TTL.reddit);
    return final;
  }

  async function getRedditSearch(query) {
    try {
      const res  = await fetchT(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=hot&t=week&limit=25`,
        { headers: { Accept: 'application/json' } }, 7000
      );
      const data = await res.json();
      return data.data.children.map(p => ({
        source: 'Reddit', title: p.data.title, score: p.data.score,
        comments: p.data.num_comments, subreddit: p.data.subreddit_name_prefixed,
        url: `https://reddit.com${p.data.permalink}`,
        created: new Date(p.data.created_utc * 1000),
      }));
    } catch(e) { return []; }
  }

  // Reddit demo posts — always show something on the dashboard
  function getRedditDemoPosts() {
    return [
      { source:'Reddit', title:'Best AI tools for productivity in 2025?', subreddit:'r/artificial', score:4200, comments:312, url:'https://reddit.com/r/artificial', created:new Date() },
      { source:'Reddit', title:'How I make $5K/month with digital products', subreddit:'r/passive_income', score:3800, comments:287, url:'https://reddit.com/r/passive_income', created:new Date() },
      { source:'Reddit', title:'Notion template that changed my workflow', subreddit:'r/productivity', score:2900, comments:198, url:'https://reddit.com/r/productivity', created:new Date() },
      { source:'Reddit', title:'Started selling on Etsy 3 months ago, here\'s what I learned', subreddit:'r/Etsy', score:2600, comments:174, url:'https://reddit.com/r/Etsy', created:new Date() },
      { source:'Reddit', title:'What side hustle is actually worth it in 2025?', subreddit:'r/Entrepreneur', score:5100, comments:423, url:'https://reddit.com/r/Entrepreneur', created:new Date() },
      { source:'Reddit', title:'Lost 40lbs with intermittent fasting — my full guide', subreddit:'r/loseit', score:3400, comments:256, url:'https://reddit.com/r/loseit', created:new Date() },
      { source:'Reddit', title:'Best budget home gym equipment recommendations?', subreddit:'r/fitness', score:2200, comments:189, url:'https://reddit.com/r/fitness', created:new Date() },
      { source:'Reddit', title:'ChatGPT vs Claude — which is actually better for writing?', subreddit:'r/ChatGPT', score:4800, comments:391, url:'https://reddit.com/r/ChatGPT', created:new Date() },
    ];
  }

  // ── HACKER NEWS ───────────────────────────────────────────────────
  async function getHNFeed(feed = 'topstories', count = 20) {
    const cacheKey = 'hn_' + feed + '_' + count;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    try {
      const res  = await fetchT(`https://hacker-news.firebaseio.com/v0/${feed}.json`, {}, 5000);
      const ids  = (await res.json()).slice(0, count);
      const items = await Promise.allSettled(
        ids.map(id => fetchT(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {}, 4000).then(r => r.json()).catch(() => null))
      );
      const posts = items.filter(r => r.status === 'fulfilled' && r.value?.title).map(r => r.value).map(s => ({
        source: 'Hacker News', title: s.title, score: s.score || 0,
        comments: s.descendants || 0, by: s.by || '',
        url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
        created: new Date((s.time || 0) * 1000),
      }));

      const final = posts.length > 3 ? posts : getHNDemoPosts();
      cacheSet(cacheKey, final, TTL.hn);
      return final;
    } catch(e) { return getHNDemoPosts(); }
  }

  function getHNDemoPosts() {
    return [
      { source:'Hacker News', title:'Show HN: I built a tool to find trending digital product niches', score:842, comments:134, url:'https://news.ycombinator.com', created:new Date(), by:'founder123' },
      { source:'Hacker News', title:'Ask HN: Best ways to monetize a content site in 2025?', score:671, comments:198, url:'https://news.ycombinator.com', created:new Date(), by:'hacker456' },
      { source:'Hacker News', title:'The state of AI in 2025 — what actually works', score:1240, comments:312, url:'https://news.ycombinator.com', created:new Date(), by:'airesearcher' },
      { source:'Hacker News', title:'How I got to $10K MRR selling templates', score:934, comments:167, url:'https://news.ycombinator.com', created:new Date(), by:'indiehacker' },
      { source:'Hacker News', title:'Notion alternatives compared: which is best in 2025?', score:523, comments:89, url:'https://news.ycombinator.com', created:new Date(), by:'productivitynerd' },
    ];
  }

  async function getHackerNewsTrending() { return getHNFeed('topstories', 25); }
  async function getHNAsk()              { return getHNFeed('askstories',  15); }

  // ── WIKIPEDIA ─────────────────────────────────────────────────────
  async function getWikipediaTrending() {
    const cacheKey = 'wikipedia_trending';
    return cachedFetch(cacheKey, async () => {
      const d = new Date(); d.setDate(d.getDate() - 1);
      const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
      const res  = await fetchT(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${y}/${m}/${day}`, {}, 6000);
      const data = await res.json();
      const skip = ['Main_Page','Special:','Wikipedia:','Portal:','Help:','File:'];
      return (data.items?.[0]?.articles || [])
        .filter(a => !skip.some(s => a.article.startsWith(s))).slice(0,25)
        .map(a => ({ source:'Wikipedia', title:a.article.replace(/_/g,' '), views:a.views, url:`https://en.wikipedia.org/wiki/${a.article}` }));
    }, TTL.wikipedia) || getWikiDemoPosts();
  }

  function getWikiDemoPosts() {
    return [
      { source:'Wikipedia', title:'Artificial Intelligence', views:2100000, url:'https://en.wikipedia.org/wiki/Artificial_intelligence' },
      { source:'Wikipedia', title:'ChatGPT', views:1800000, url:'https://en.wikipedia.org/wiki/ChatGPT' },
      { source:'Wikipedia', title:'Intermittent Fasting', views:890000, url:'https://en.wikipedia.org/wiki/Intermittent_fasting' },
      { source:'Wikipedia', title:'Passive Income', views:670000, url:'https://en.wikipedia.org/wiki/Passive_income' },
      { source:'Wikipedia', title:'Notion (software)', views:540000, url:'https://en.wikipedia.org/wiki/Notion_(software)' },
    ];
  }

  // ── GITHUB ────────────────────────────────────────────────────────
  async function getGitHubTrending(language = '', since = 'daily') {
    const cacheKey = 'github_' + language + '_' + since;
    return cachedFetch(cacheKey, async () => {
      const lang = language ? `language=${encodeURIComponent(language)}&` : '';
      const res  = await fetchT(`https://gh-trending-api.vercel.app/repositories?${lang}since=${since}`, {}, 8000);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error();
      return data.slice(0,25).map(r => ({
        source:'GitHub', title:`${r.author}/${r.name}`, description:r.description||'',
        stars:r.stars||0, starsToday:r.currentPeriodStars||0, language:r.language||'Unknown',
        url:r.url||`https://github.com/${r.author}/${r.name}`, forks:r.forks||0
      }));
    }, TTL.github) || [];
  }

  // ── DEV.TO ────────────────────────────────────────────────────────
  async function getDevToArticles(tag = '', perPage = 20) {
    const cacheKey = 'devto_' + tag + '_' + perPage;
    return cachedFetch(cacheKey, async () => {
      const tagParam = tag ? `&tag=${encodeURIComponent(tag)}` : '';
      const res  = await fetchT(`https://dev.to/api/articles?per_page=${perPage}&top=7${tagParam}`, {}, 6000);
      if (!res.ok) throw new Error();
      const data = await res.json();
      return data.map(a => ({
        source:'DEV.to', title:a.title, description:a.description||'',
        tags:a.tag_list||[], reactions:a.public_reactions_count||0,
        comments:a.comments_count||0, url:a.url, author:a.user?.name||'',
        cover:a.cover_image||'', created:new Date(a.published_at), readTime:a.reading_time_minutes||0
      }));
    }, TTL.devto) || [];
  }

  // ── CRYPTO ────────────────────────────────────────────────────────
  async function getCryptoTrending() {
    const cacheKey = 'crypto_trending';
    return cachedFetch(cacheKey, async () => {
      const res  = await fetchT('https://api.coingecko.com/api/v3/search/trending', {}, 6000);
      const data = await res.json();
      if (!data.coins?.length) throw new Error();
      return data.coins.map(c => ({
        source:'CoinGecko', name:c.item.name, symbol:c.item.symbol,
        rank:c.item.market_cap_rank||0, url:`https://www.coingecko.com/en/coins/${c.item.id}`
      }));
    }, TTL.crypto) || [];
  }

  async function getCryptoPrices() {
    const cacheKey = 'crypto_prices';
    return cachedFetch(cacheKey, async () => {
      const ids = 'bitcoin,ethereum,solana,cardano,dogecoin,ripple,polkadot,chainlink,uniswap,avalanche-2';
      const res  = await fetchT(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`, {}, 6000);
      const data = await res.json();
      return Object.entries(data).map(([id,v]) => ({
        source:'CoinGecko', name:id.charAt(0).toUpperCase()+id.slice(1).replace(/-/g,' '),
        price:v.usd, change:(v.usd_24h_change||0).toFixed(2), mcap:v.usd_market_cap,
        url:`https://www.coingecko.com/en/coins/${id}`
      }));
    }, TTL.crypto) || [];
  }

  // ── PRODUCT HUNT ──────────────────────────────────────────────────
  async function getProductHuntTrending() {
    const cacheKey = 'producthunt';
    return cachedFetch(cacheKey, async () => {
      const rss = 'https://www.producthunt.com/feed?category=undefined';
      const res = await fetchT(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}&count=15`, {}, 7000);
      const data = await res.json();
      if (data.status !== 'ok' || !data.items?.length) throw new Error();
      return data.items.map(item => ({
        source:'Product Hunt', title:item.title,
        description:(item.description||'').replace(/<[^>]*>/g,'').substring(0,150),
        url:item.link, votes:0
      }));
    }, TTL.reddit) || getDemoProductHunt();
  }

  function getDemoProductHunt() {
    return [
      { source:'Product Hunt', title:'NotebookLM by Google',  description:'AI-powered research notebook', url:'https://notebooklm.google.com', votes:1240 },
      { source:'Product Hunt', title:'Cursor AI',             description:'AI-first code editor',          url:'https://cursor.sh',             votes:980  },
      { source:'Product Hunt', title:'Perplexity Pro',        description:'AI answer engine',              url:'https://perplexity.ai',          votes:876  },
      { source:'Product Hunt', title:'Suno AI',               description:'Make music with AI',            url:'https://suno.ai',               votes:821  },
      { source:'Product Hunt', title:'v0 by Vercel',          description:'Generate UI from text',         url:'https://v0.dev',                votes:754  },
      { source:'Product Hunt', title:'ElevenLabs',            description:'AI voice cloning platform',     url:'https://elevenlabs.io',          votes:699  },
    ];
  }

  // ── OPEN LIBRARY ──────────────────────────────────────────────────
  async function getTrendingBooks() {
    const cacheKey = 'books_trending';
    return cachedFetch(cacheKey, async () => {
      const res  = await fetchT('https://openlibrary.org/trending/daily.json?limit=20', {}, 7000);
      const data = await res.json();
      if (!data.works?.length) throw new Error();
      return data.works.map(b => ({
        source:'Open Library', title:b.title, author:(b.author_name||[]).join(', '),
        year:b.first_publish_year||'', rating:b.ratings_average?b.ratings_average.toFixed(1):'—',
        reads:b.want_to_read_count||0, url:`https://openlibrary.org${b.key}`,
        cover:b.cover_i?`https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`:''
      }));
    }, TTL.books) || [];
  }

  // ── STACK OVERFLOW ────────────────────────────────────────────────
  async function getStackOverflowTrending() {
    const cacheKey = 'stackoverflow_hot';
    return cachedFetch(cacheKey, async () => {
      const res  = await fetchT('https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=20', {}, 6000);
      const data = await res.json();
      if (!data.items?.length) throw new Error();
      return data.items.map(q => ({
        source:'Stack Overflow', title:q.title, score:q.score,
        answers:q.answer_count, views:q.view_count, tags:q.tags||[],
        url:q.link, created:new Date(q.creation_date*1000)
      }));
    }, TTL.so) || [];
  }

  // ── REMOTE JOBS ───────────────────────────────────────────────────
  async function getRemoteJobs(category = '') {
    const cacheKey = 'jobs_' + category;
    return cachedFetch(cacheKey, async () => {
      const catParam = category ? `?category=${encodeURIComponent(category)}` : '';
      const res  = await fetchT(`https://remotive.com/api/remote-jobs${catParam}&limit=20`, {}, 8000);
      const data = await res.json();
      if (!data.jobs?.length) throw new Error();
      return data.jobs.map(j => ({
        source:'Remotive', title:j.title, company:j.company_name, category:j.category,
        salary:j.salary||'', tags:j.tags||[], url:j.url,
        created:new Date(j.publication_date), location:j.candidate_required_location||'Worldwide'
      }));
    }, TTL.jobs) || [];
  }

  // ── YOUTUBE ───────────────────────────────────────────────────────
  async function getYouTubeTrending(regionCode = 'US', categoryId = '0') {
    const cacheKey = 'yt_' + regionCode + '_' + categoryId;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const key = YT_KEY();
    if (!key) {
      // No key: return rich demo data that always works
      return getDemoYouTube();
    }
    try {
      const res  = await fetchT(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&videoCategoryId=${categoryId}&maxResults=30&key=${key}`,
        {}, 8000
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const videos = (data.items||[]).map(v => ({
        source:'YouTube', title:v.snippet.title, channel:v.snippet.channelTitle,
        views:parseInt(v.statistics.viewCount||0), likes:parseInt(v.statistics.likeCount||0),
        comments:parseInt(v.statistics.commentCount||0), tags:(v.snippet.tags||[]).slice(0,6),
        url:`https://youtube.com/watch?v=${v.id}`, thumbnail:v.snippet.thumbnails?.medium?.url||''
      }));
      if (videos.length) cacheSet(cacheKey, videos, TTL.youtube);
      return videos.length ? videos : getDemoYouTube();
    } catch(e) {
      console.warn('YouTube API error:', e.message);
      return getDemoYouTube();
    }
  }

  async function getYouTubeByCategory(catId) {
    const cacheKey = 'yt_cat_' + catId;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const key = YT_KEY();
    if (!key) return [];
    try {
      const res  = await fetchT(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=US&videoCategoryId=${catId}&maxResults=15&key=${key}`,
        {}, 8000
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const videos = (data.items||[]).map(v => ({
        source:'YouTube', title:v.snippet.title, channel:v.snippet.channelTitle,
        views:parseInt(v.statistics.viewCount||0), url:`https://youtube.com/watch?v=${v.id}`,
        tags:(v.snippet.tags||[]).slice(0,5), thumbnail:v.snippet.thumbnails?.medium?.url||''
      }));
      if (videos.length) cacheSet(cacheKey, videos, TTL.youtube);
      return videos;
    } catch(e) { return []; }
  }

  async function getYouTubeSearch(query) {
    const key = YT_KEY();
    if (!key) return [];
    try {
      const res  = await fetchT(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=viewCount&maxResults=10&key=${key}`,
        {}, 8000
      );
      const data = await res.json();
      return (data.items||[]).map(v => ({
        source:'YouTube', title:v.snippet.title, channel:v.snippet.channelTitle,
        url:`https://youtube.com/watch?v=${v.id.videoId}`, thumbnail:v.snippet.thumbnails?.medium?.url||''
      }));
    } catch(e) { return []; }
  }

  // ── NEWS API ──────────────────────────────────────────────────────
  async function getTopHeadlines(category = 'general') {
    const cacheKey = 'news_' + category;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const key = NEWS_KEY();
    if (!key) return getDemoNews();
    try {
      const res  = await fetchT(
        `https://newsapi.org/v2/top-headlines?country=us&category=${category}&pageSize=20&apiKey=${key}`,
        {}, 8000
      );
      const data = await res.json();
      if (data.status !== 'ok') throw new Error(data.message);
      const articles = (data.articles||[]).map(a => ({
        source:'News', title:a.title, description:a.description,
        outlet:a.source.name, url:a.url, published:new Date(a.publishedAt)
      }));
      if (articles.length) cacheSet(cacheKey, articles, TTL.news);
      return articles.length ? articles : getDemoNews();
    } catch(e) { return getDemoNews(); }
  }

  // ── GOOGLE TRENDS (backend or demo) ──────────────────────────────
  async function getGoogleTrends(keywords = ['AI tools','side hustle','meal prep','remote work','crypto']) {
    if (!BACKEND) return getDemoTrends();
    const cacheKey = 'gtrends_' + keywords.slice(0,2).join('_');
    return cachedFetch(cacheKey, async () => {
      const res = await fetchT(`${BACKEND}/trends?kw=${keywords.map(encodeURIComponent).join(',')}`, {}, 8000);
      if (!res.ok) throw new Error();
      return await res.json();
    }, TTL.trends) || getDemoTrends();
  }

  async function getTrendingSearches(country = 'united_states') {
    if (!BACKEND) return getDemoTrendingSearches();
    const cacheKey = 'gtrending_' + country;
    return cachedFetch(cacheKey, async () => {
      const res = await fetchT(`${BACKEND}/trending?country=${country}`, {}, 8000);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data?.length) throw new Error();
      return data;
    }, TTL.trends) || getDemoTrendingSearches();
  }

  async function getRelatedQueries(keyword) {
    if (!BACKEND) return { top:[], rising:[] };
    try {
      const res = await fetchT(`${BACKEND}/related?kw=${encodeURIComponent(keyword)}`, {}, 6000);
      return await res.json();
    } catch(e) { return { top:[], rising:[] }; }
  }

  // ── DIGITAL PRODUCTS INTELLIGENCE ────────────────────────────────
  const DIGITAL_NICHES = [
    { topic:'Passive Income Ideas',        niche:'Business',    searchVol:'HIGH',      ebookDemand:98, tags:['income','money','passive'],   gTrend:'passive income' },
    { topic:'Side Hustle Blueprint',       niche:'Business',    searchVol:'HIGH',      ebookDemand:95, tags:['hustle','business','money'],  gTrend:'side hustle' },
    { topic:'ChatGPT for Business',        niche:'AI/Tech',     searchVol:'VERY HIGH', ebookDemand:97, tags:['chatgpt','ai','prompt'],      gTrend:'chatgpt' },
    { topic:'AI Prompts Collection',       niche:'AI/Tech',     searchVol:'VERY HIGH', ebookDemand:96, tags:['ai','prompts','chatgpt'],     gTrend:'ai prompts' },
    { topic:'Amazon KDP Self Publishing',  niche:'Publishing',  searchVol:'HIGH',      ebookDemand:92, tags:['kdp','publish','amazon'],     gTrend:'amazon kdp' },
    { topic:'Notion Templates Pack',       niche:'Productivity',searchVol:'HIGH',      ebookDemand:94, tags:['notion','template','system'], gTrend:'notion template' },
    { topic:'Canva Design Templates',      niche:'Design',      searchVol:'HIGH',      ebookDemand:91, tags:['canva','design','template'],  gTrend:'canva templates' },
    { topic:'Digital Marketing Playbook',  niche:'Marketing',   searchVol:'HIGH',      ebookDemand:91, tags:['marketing','social','ads'],   gTrend:'digital marketing' },
    { topic:'Intermittent Fasting Guide',  niche:'Health',      searchVol:'HIGH',      ebookDemand:93, tags:['fasting','weight','diet'],    gTrend:'intermittent fasting' },
    { topic:'Mental Health Workbook',      niche:'Wellness',    searchVol:'HIGH',      ebookDemand:90, tags:['mental','anxiety','mindset'], gTrend:'mental health' },
    { topic:'Dropshipping Guide',          niche:'eCommerce',   searchVol:'HIGH',      ebookDemand:90, tags:['dropship','ecom','amazon'],   gTrend:'dropshipping' },
    { topic:'Productivity System PDF',     niche:'Productivity',searchVol:'HIGH',      ebookDemand:92, tags:['productivity','focus','time'], gTrend:'productivity system' },
    { topic:'Social Media Growth Hacks',   niche:'Marketing',   searchVol:'HIGH',      ebookDemand:89, tags:['social','instagram','tik'],   gTrend:'social media growth' },
    { topic:'Freelancing for Beginners',   niche:'Business',    searchVol:'HIGH',      ebookDemand:88, tags:['freelance','client','work'],  gTrend:'freelancing' },
    { topic:'Budget & Finance Tracker',    niche:'Finance',     searchVol:'HIGH',      ebookDemand:89, tags:['budget','money','finance'],   gTrend:'budgeting' },
    { topic:'Home Workout Plan',           niche:'Fitness',     searchVol:'HIGH',      ebookDemand:88, tags:['workout','gym','fitness'],    gTrend:'home workout' },
    { topic:'Anxiety & Stress Workbook',   niche:'Wellness',    searchVol:'HIGH',      ebookDemand:91, tags:['anxiety','stress','calm'],    gTrend:'anxiety relief' },
    { topic:'Morning Routine Guide',       niche:'Productivity',searchVol:'HIGH',      ebookDemand:87, tags:['morning','routine','habit'],  gTrend:'morning routine' },
    { topic:'Keto Diet Meal Plan',         niche:'Nutrition',   searchVol:'HIGH',      ebookDemand:85, tags:['keto','diet','low carb'],     gTrend:'keto diet' },
    { topic:'Etsy Shop Success',           niche:'eCommerce',   searchVol:'MED',       ebookDemand:87, tags:['etsy','shop','craft'],        gTrend:'etsy shop' },
    { topic:'Print on Demand Business',    niche:'eCommerce',   searchVol:'MED',       ebookDemand:83, tags:['pod','print','merch'],        gTrend:'print on demand' },
    { topic:'Manifestation Guide',         niche:'Mindset',     searchVol:'HIGH',      ebookDemand:86, tags:['manifest','law','attract'],   gTrend:'manifestation' },
    { topic:'Dating & Relationship Guide', niche:'Relationships',searchVol:'HIGH',     ebookDemand:85, tags:['dating','love','attract'],    gTrend:'dating tips' },
    { topic:'Baby Sleep Schedule',         niche:'Parenting',   searchVol:'HIGH',      ebookDemand:88, tags:['baby','sleep','newborn'],     gTrend:'baby sleep' },
    { topic:'Positive Parenting Workbook', niche:'Parenting',   searchVol:'MED',       ebookDemand:83, tags:['parenting','kids','family'],  gTrend:'positive parenting' },
    { topic:'Python for Beginners',        niche:'Tech',        searchVol:'HIGH',      ebookDemand:88, tags:['python','code','beginner'],   gTrend:'learn python' },
    { topic:'No Code App Builder Guide',   niche:'Tech',        searchVol:'MED',       ebookDemand:84, tags:['nocode','app','build'],       gTrend:'no code' },
    { topic:'Gut Health & Nutrition',      niche:'Health',      searchVol:'MED',       ebookDemand:84, tags:['gut','health','microbiome'],  gTrend:'gut health' },
    { topic:'Sleep Improvement Guide',     niche:'Wellness',    searchVol:'MED',       ebookDemand:82, tags:['sleep','insomnia','rest'],    gTrend:'sleep better' },
    { topic:'Recipe eBook',               niche:'Food',        searchVol:'HIGH',      ebookDemand:82, tags:['recipe','food','cook'],       gTrend:'recipe book' },
    { topic:'Homeschooling Curriculum',    niche:'Education',   searchVol:'MED',       ebookDemand:80, tags:['homeschool','kids','learn'],  gTrend:'homeschooling' },
    { topic:'Travel Planner PDF',          niche:'Travel',      searchVol:'MED',       ebookDemand:79, tags:['travel','plan','itinerary'],  gTrend:'travel planner' },
  ];

  async function getDigitalProductTrends() {
    // Always works — enriched with live data if backend available
    try {
      const live = await getTrendingSearches();
      return DIGITAL_NICHES.map(n => {
        const match = live.find(l => l.term && l.term.toLowerCase().includes(n.gTrend.toLowerCase()));
        return { ...n, liveScore: match ? match.volume : n.ebookDemand, liveDelta: match ? match.delta : null };
      }).sort((a,b) => b.liveScore - a.liveScore);
    } catch(e) {
      return DIGITAL_NICHES.sort((a,b) => b.ebookDemand - a.ebookDemand);
    }
  }

  async function getDigitalProductQuestions() {
    try {
      const questionSubs = ['passive_income','Entrepreneur','Etsy','KDP','SideProject','indiehackers','OnlineCourses','selfpublish'];
      const results = await Promise.allSettled(questionSubs.slice(0,6).map(s => getRedditTrending(s, 20)));
      const posts = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
      const questions = extractQuestions(posts).filter(q =>
        /how (to|do|can|should)|what (is|are|the best)|guide|tips|beginner|learn|start|make money|earn|sell|create|course|ebook|pdf/i.test(q.text)
      );
      return questions.length > 0 ? questions : getDigitalDemoQuestions();
    } catch(e) { return getDigitalDemoQuestions(); }
  }

  function getDigitalDemoQuestions() {
    return [
      { text:'How do I find a profitable niche for my ebook?', intent:'how', source:'Reddit', score:2800, comments:234, subreddit:'r/passive_income', url:'https://reddit.com/r/passive_income' },
      { text:'What digital products sell best on Etsy?', intent:'what', source:'Reddit', score:3400, comments:312, subreddit:'r/Etsy', url:'https://reddit.com/r/Etsy' },
      { text:'How to validate a digital product idea before creating it?', intent:'how', source:'Reddit', score:1900, comments:178, subreddit:'r/Entrepreneur', url:'https://reddit.com/r/Entrepreneur' },
      { text:'What PDF templates are most in demand right now?', intent:'what', source:'Reddit', score:2100, comments:198, subreddit:'r/SideProject', url:'https://reddit.com/r/SideProject' },
      { text:'How do I price my digital products?', intent:'how', source:'Reddit', score:2600, comments:223, subreddit:'r/indiehackers', url:'https://reddit.com/r/indiehackers' },
    ];
  }

  function getAmazonDemandSignals() {
    return [
      { category:'Self Help', subcategory:'Anxiety & Stress', rank:1, signal:'VERY HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/4736', insight:'Millions search for anxiety help monthly' },
      { category:'Business', subcategory:'Home-Based Businesses', rank:2, signal:'VERY HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/2686', insight:'Side hustle demand at all-time high' },
      { category:'Health', subcategory:'Diets & Weight Loss', rank:3, signal:'VERY HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/6', insight:'Diet & fasting guides consistently top sellers' },
      { category:'Computers', subcategory:'AI & Machine Learning', rank:4, signal:'VERY HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/3800', insight:'AI guides selling faster than any other tech' },
      { category:'Business', subcategory:'Marketing & Sales', rank:5, signal:'HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/2700', insight:'Digital marketing skills in high demand' },
      { category:'Self Help', subcategory:'Personal Finance', rank:6, signal:'HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/2616', insight:'Budgeting & investing guides perennially popular' },
      { category:'Parenting', subcategory:'Babies & Toddlers', rank:7, signal:'HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/4', insight:'New parents desperate for sleep guides' },
      { category:'Cookbooks', subcategory:'Quick & Easy', rank:8, signal:'HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/6941', insight:'Meal prep & quick recipe books always sell' },
      { category:'Business', subcategory:'Entrepreneurship', rank:9, signal:'HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/2701', insight:'Online business & passive income very popular' },
      { category:'Health', subcategory:'Mental Health', rank:10, signal:'VERY HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/1', insight:'Mental wellness workbooks growing fast' },
      { category:'Self Help', subcategory:'Productivity & Time Mgmt', rank:11, signal:'HIGH', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/2609', insight:'Notion, productivity systems trending' },
      { category:'Computers', subcategory:'Web Development', rank:12, signal:'MED', url:'https://www.amazon.com/best-sellers-books-Amazon/zgbs/books/3760', insight:'No-code and beginner coding guides growing' },
    ];
  }

  function getEtsyDigitalDemand() {
    return [
      { product:'Social Media Templates (Canva)', sales:'80K+/mo', trend:'↑ 320%', category:'Marketing',    price:'$8-$30',  url:'https://www.etsy.com/search?q=social+media+canva+template' },
      { product:'Notion Templates',               sales:'50K+/mo', trend:'↑ 210%', category:'Productivity', price:'$5-$25',  url:'https://www.etsy.com/search?q=notion+template' },
      { product:'Kids Activity Printables',       sales:'45K+/mo', trend:'↑ 175%', category:'Education',    price:'$3-$15',  url:'https://www.etsy.com/search?q=kids+activity+printable' },
      { product:'Budget Spreadsheet Templates',   sales:'40K+/mo', trend:'↑ 180%', category:'Finance',      price:'$5-$15',  url:'https://www.etsy.com/search?q=budget+template' },
      { product:'Resume & CV Templates',          sales:'35K+/mo', trend:'↑ 110%', category:'Career',       price:'$5-$20',  url:'https://www.etsy.com/search?q=resume+template' },
      { product:'Wedding Planning Printables',    sales:'30K+/mo', trend:'↑ 95%',  category:'Events',       price:'$5-$20',  url:'https://www.etsy.com/search?q=wedding+planner+printable' },
      { product:'Habit Tracker Printable',        sales:'22K+/mo', trend:'↑ 190%', category:'Productivity', price:'$3-$10',  url:'https://www.etsy.com/search?q=habit+tracker+printable' },
      { product:'Self-Care Journal PDF',          sales:'19K+/mo', trend:'↑ 200%', category:'Wellness',     price:'$5-$18',  url:'https://www.etsy.com/search?q=self+care+journal+printable' },
      { product:'Workout Log Printables',         sales:'18K+/mo', trend:'↑ 130%', category:'Fitness',      price:'$3-$10',  url:'https://www.etsy.com/search?q=workout+log+printable' },
      { product:'Business Plan Templates',        sales:'15K+/mo', trend:'↑ 125%', category:'Business',     price:'$10-$35', url:'https://www.etsy.com/search?q=business+plan+template' },
      { product:'Meal Planner PDFs',              sales:'25K+/mo', trend:'↑ 140%', category:'Health',       price:'$3-$12',  url:'https://www.etsy.com/search?q=meal+planner+pdf' },
      { product:'Affirmation Cards Printable',    sales:'20K+/mo', trend:'↑ 160%', category:'Wellness',     price:'$4-$12',  url:'https://www.etsy.com/search?q=affirmation+cards+printable' },
    ];
  }

  // ── EXTRACTION UTILS ──────────────────────────────────────────────
  function extractProductMentions(posts) {
    const patterns = [
      /best\s+([\w\s]{3,35}?)(?:\?|$|\.|,)/gi,
      /anyone\s+(?:use|using|tried|recommend)\s+([\w\s]{3,35}?)(?:\?|$|\.|,)/gi,
      /(?:recommend|review(?:ing)?|bought|purchased?)\s+([\w\s]{3,35}?)(?:\?|$|\.|,)/gi,
      /is\s+([\w\s]{3,35}?)\s+worth\s+it/gi,
      /switched\s+(?:to|from)\s+([\w\s]{3,30}?)(?:\?|$|\.|,)/gi,
      /looking\s+for\s+(?:a\s+)?([\w\s]{3,35}?)(?:\?|$|\.|,)/gi,
      /\b([\w\s]{3,30}?)\s+(?:alternative|vs\b)/gi,
      /need\s+(?:a\s+)?([\w\s]{3,30}?)\s+recommendation/gi,
    ];
    const stop = new Set(['the','and','for','are','but','not','you','all','can','her','was','one','our','out','use','had','how','its','let','may','per','did','get','got','way','say','make','just','like','from','they','this','that','with','have','what','when','will','your','been','than','then','some','more','also','into','over','after','about','which','there','their','where','would','could','should','people','anyone','everyone','something','anything','nothing']);
    const mentions = {}, urlMap = {};
    posts.forEach(post => {
      patterns.forEach(pat => {
        pat.lastIndex = 0;
        const matches = [...(post.title||'').matchAll(pat)];
        matches.forEach(m => {
          const raw   = (m[1]||'').toLowerCase().trim().replace(/[^a-z0-9\s]/g,'');
          const words = raw.split(/\s+/).filter(w => w.length > 2 && !stop.has(w));
          if (!words.length || words.length > 4) return;
          const product = words.join(' ');
          if (product.length < 3 || product.length > 40) return;
          const w = Math.max(1, Math.log10(post.score+10));
          mentions[product] = (mentions[product]||0) + w;
          if (!urlMap[product]) urlMap[product] = post.url;
        });
      });
    });

    const result = Object.entries(mentions)
      .filter(([k]) => k.length > 3)
      .sort((a,b) => b[1]-a[1])
      .slice(0,60)
      .map(([name,score]) => ({ name, score:Math.round(score*10), url:urlMap[name], source:'Reddit' }));

    // Always return at least some demo products
    return result.length > 3 ? result : getDemoProducts();
  }

  function getDemoProducts() {
    return [
      { name:'notion template', score:95, source:'Reddit', url:'https://www.reddit.com/search/?q=notion+template' },
      { name:'chatgpt prompts', score:92, source:'Reddit', url:'https://www.reddit.com/search/?q=chatgpt+prompts' },
      { name:'canva templates', score:88, source:'Reddit', url:'https://www.reddit.com/search/?q=canva+templates' },
      { name:'budget tracker', score:84, source:'Reddit', url:'https://www.reddit.com/search/?q=budget+tracker' },
      { name:'workout planner', score:81, source:'Reddit', url:'https://www.reddit.com/search/?q=workout+planner' },
      { name:'meal prep guide', score:78, source:'Reddit', url:'https://www.reddit.com/search/?q=meal+prep+guide' },
      { name:'social media templates', score:74, source:'Reddit', url:'https://www.reddit.com/search/?q=social+media+templates' },
      { name:'resume template', score:71, source:'Reddit', url:'https://www.reddit.com/search/?q=resume+template' },
    ];
  }

  function extractQuestions(posts) {
    return posts
      .filter(p => p.title && (p.title.includes('?') || /^(how|what|why|when|where|which|is|are|can|does|do|should|would|will|has|have|was|were)\s/i.test(p.title)))
      .map(p => {
        const text = p.title.endsWith('?') ? p.title : p.title + '?';
        let intent = 'what';
        if (/^how/i.test(text)) intent = 'how';
        else if (/^best|^which.*(best|good|recommend)/i.test(text)) intent = 'best';
        else if (/worth it|should i buy|is .* good/i.test(text)) intent = 'buy';
        else if (/^why/i.test(text)) intent = 'why';
        return { text, intent, source:p.source, score:p.score, comments:p.comments||0, subreddit:p.subreddit||'', url:p.url||'', created:p.created };
      })
      .sort((a,b) => b.score - a.score);
  }

  function clusterTopics(posts) {
    const stop = new Set(['the','and','for','are','but','not','you','all','can','her','was','one','our','out','use','had','how','its','let','may','per','did','get','got','way','say','make','just','like','from','they','this','that','with','have','what','when','will','your','been','than','then','some','more','also','into','over','after','about','which','there','their','where','would','could','should']);
    const freq = {}, urlMap = {};
    posts.forEach(post => {
      const words = (post.title||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 3 && !stop.has(w));
      words.forEach(w => { freq[w] = (freq[w]||0) + Math.log10(post.score+10); if (!urlMap[w]) urlMap[w] = post.url; });
      for (let i = 0; i < words.length-1; i++) {
        const bi = `${words[i]} ${words[i+1]}`;
        freq[bi] = (freq[bi]||0) + Math.log10(post.score+10) * 1.5;
        if (!urlMap[bi]) urlMap[bi] = post.url;
      }
    });
    return Object.entries(freq)
      .filter(([k]) => k.length > 4)
      .sort((a,b) => b[1]-a[1])
      .slice(0,80)
      .map(([term,score]) => ({ name:term, score:Math.round(score), url:urlMap[term]||`https://www.reddit.com/search/?q=${encodeURIComponent(term)}&sort=hot&t=week` }));
  }

  // ── DEMO FALLBACKS ────────────────────────────────────────────────
  function getDemoTrends() {
    return { labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], datasets:{ google:[4200,5100,4800,6100,7200,6600,8100], reddit:[3100,3600,3200,4500,5100,4700,5800], youtube:[1800,2100,2000,2700,3200,3000,3600], news:[900,1100,1050,1400,1700,1500,1900] } };
  }

  function getDemoTrendingSearches() {
    return [
      {term:'AI productivity tools',volume:92,delta:'+41%'},{term:'side hustle ideas 2025',volume:78,delta:'+28%'},
      {term:'meal prep for beginners',volume:64,delta:'+15%'},{term:'remote work setup',volume:57,delta:'+8%'},
      {term:'passive income ideas',volume:51,delta:'+33%'},{term:'home gym equipment',volume:44,delta:'-5%'},
      {term:'budget travel Europe',volume:38,delta:'+19%'},{term:'ChatGPT alternatives',volume:35,delta:'+62%'},
      {term:'intermittent fasting',volume:30,delta:'+11%'},{term:'electric vehicle range',volume:26,delta:'+7%'},
      {term:'dividend investing',volume:24,delta:'+18%'},{term:'micro saas ideas',volume:21,delta:'+55%'},
      {term:'notion templates',volume:19,delta:'+88%'},{term:'canva templates',volume:18,delta:'+72%'},
      {term:'amazon kdp passive income',volume:17,delta:'+65%'},
    ];
  }

  function getDemoYouTube() {
    const demo = [
      {source:'YouTube',title:'I Made $10K Selling Digital Products on Etsy',channel:'DigitalIncome',views:2100000,likes:89000,url:'https://youtube.com/results?search_query=sell+digital+products',thumbnail:''},
      {source:'YouTube',title:'How to Make Passive Income with Notion Templates',channel:'ProductivityPro',views:1400000,likes:62000,url:'https://youtube.com/results?search_query=notion+template+passive+income',thumbnail:''},
      {source:'YouTube',title:'Amazon KDP: $5K/Month Passive Income Guide',channel:'KDPInsider',views:980000,likes:47000,url:'https://youtube.com/results?search_query=amazon+kdp+passive+income',thumbnail:''},
      {source:'YouTube',title:'Best Side Hustles That Actually Work in 2025',channel:'SideHustleNation',views:3400000,likes:142000,url:'https://youtube.com/results?search_query=best+side+hustles+2025',thumbnail:''},
      {source:'YouTube',title:'I Quit My Job Selling Canva Templates',channel:'CreativeHustle',views:1800000,likes:76000,url:'https://youtube.com/results?search_query=sell+canva+templates',thumbnail:''},
      {source:'YouTube',title:'ChatGPT vs Claude vs Gemini 2025',channel:'AIDaily',views:2900000,likes:118000,url:'https://youtube.com/results?search_query=chatgpt+vs+claude+2025',thumbnail:''},
      {source:'YouTube',title:'How I Make $3K/Month with Print on Demand',channel:'PODExpert',views:1100000,likes:51000,url:'https://youtube.com/results?search_query=print+on+demand+income',thumbnail:''},
      {source:'YouTube',title:'7 Passive Income Streams You Can Start This Week',channel:'WealthBuildr',views:3100000,likes:140000,url:'https://youtube.com/results?search_query=passive+income+streams',thumbnail:''},
      {source:'YouTube',title:'The Truth About Selling Ebooks on Amazon',channel:'BookBusiness',views:890000,likes:38000,url:'https://youtube.com/results?search_query=sell+ebooks+amazon',thumbnail:''},
      {source:'YouTube',title:'Intermittent Fasting: Complete Beginner Guide',channel:'HealthSimplified',views:4200000,likes:195000,url:'https://youtube.com/results?search_query=intermittent+fasting+guide',thumbnail:''},
      {source:'YouTube',title:'How to Build a $10K/Month Digital Product Business',channel:'DigitalEmpire',views:1600000,likes:68000,url:'https://youtube.com/results?search_query=digital+product+business',thumbnail:''},
      {source:'YouTube',title:'Best Budget Home Gym Setup 2025',channel:'FitForAll',views:1400000,likes:62000,url:'https://youtube.com/results?search_query=budget+home+gym+2025',thumbnail:''},
      {source:'YouTube',title:'How to Start Dropshipping in 2025',channel:'EcomExpert',views:2200000,likes:94000,url:'https://youtube.com/results?search_query=dropshipping+2025',thumbnail:''},
      {source:'YouTube',title:'Meal Prep for the Whole Week in 2 Hours',channel:'CleanEats',views:5100000,likes:214000,url:'https://youtube.com/results?search_query=meal+prep+week',thumbnail:''},
      {source:'YouTube',title:'No Code App Development Guide',channel:'NoCodePro',views:760000,likes:34000,url:'https://youtube.com/results?search_query=no+code+app+development',thumbnail:''},
      {source:'YouTube',title:'How to Start a Blog That Makes Money in 2025',channel:'BloggingPro',views:920000,likes:42000,url:'https://youtube.com/results?search_query=start+blog+make+money',thumbnail:''},
      {source:'YouTube',title:'Freelancing for Beginners: Get Your First Client',channel:'FreelanceSuccess',views:1300000,likes:58000,url:'https://youtube.com/results?search_query=freelancing+beginners',thumbnail:''},
      {source:'YouTube',title:'AI Tools That Will 10x Your Productivity',channel:'TechHustle',views:2800000,likes:119000,url:'https://youtube.com/results?search_query=ai+productivity+tools',thumbnail:''},
      {source:'YouTube',title:'How to Invest Your First $1000',channel:'InvestingSimple',views:4700000,likes:203000,url:'https://youtube.com/results?search_query=invest+first+1000',thumbnail:''},
      {source:'YouTube',title:'Morning Routine That Changed My Life',channel:'ProductivityMaster',views:2600000,likes:112000,url:'https://youtube.com/results?search_query=morning+routine+changed+life',thumbnail:''},
      {source:'YouTube',title:'Keto Diet: What I Eat in a Day',channel:'KetoLife',views:1900000,likes:83000,url:'https://youtube.com/results?search_query=keto+diet+meal+plan',thumbnail:''},
      {source:'YouTube',title:'How I Got 100K Followers on Instagram in 90 Days',channel:'SocialGrowth',views:2100000,likes:94000,url:'https://youtube.com/results?search_query=100k+instagram+followers',thumbnail:''},
      {source:'YouTube',title:'Budget Travel Europe: $50/Day Guide',channel:'NomadLife',views:1700000,likes:74000,url:'https://youtube.com/results?search_query=budget+travel+europe',thumbnail:''},
      {source:'YouTube',title:'How to Make Money on TikTok in 2025',channel:'TikTokGrowth',views:3200000,likes:138000,url:'https://youtube.com/results?search_query=make+money+tiktok+2025',thumbnail:''},
    ];
    const ids = [
      'dQw4w9WgXcQ','9bZkp7q19f0','kJQP7kiw5Fk','JGwWNGJdvx8',
      'fJ9rUzIMcZQ','RgKAFK5djSk','hT_nvWreIhg','OPf0YbXqDm0',
      'CevxZvSJLk8','YQHsXMglC9A','60ItHLz5WEA','uelHwf8o7_U'
    ];
    return demo.map((video, i) => ({
      ...video,
      thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${ids[i % ids.length]}/hqdefault.jpg`
    }));
  }

  function getDemoNews() {
    return [
      { source:'News', title:'AI Tools Surge in Workplace Adoption', outlet:'TechCrunch', description:'AI productivity tools now used by majority of knowledge workers.', url:'https://techcrunch.com' },
      { source:'News', title:'Digital Products Market Expected to Hit $500B', outlet:'Forbes', description:'Ebooks, templates and courses dominate the creator economy.', url:'https://forbes.com' },
      { source:'News', title:'Side Hustle Economy Hits Record Highs in 2025', outlet:'Bloomberg', description:'Americans earning from multiple income sources at record numbers.', url:'https://bloomberg.com' },
    ];
  }

  async function getYouTubeRSSTrending() { return []; } // kept for compatibility

  // ── PUBLIC API ────────────────────────────────────────────────────
  return {
    SUBREDDIT_MAP,
    // Reddit
    getRedditTrending, getRedditDashboard, getRedditMulti, getRedditSearch,
    // HN
    getHNFeed, getHackerNewsTrending, getHNAsk,
    // Wikipedia
    getWikipediaTrending,
    // GitHub / DEV.to
    getGitHubTrending, getDevToArticles,
    // Crypto
    getCryptoTrending, getCryptoPrices,
    // Products
    getProductHuntTrending,
    // Books / SO / Jobs
    getTrendingBooks, getStackOverflowTrending, getRemoteJobs,
    // YouTube / News
    getYouTubeTrending, getYouTubeByCategory, getYouTubeSearch, getYouTubeRSSTrending, getTopHeadlines,
    // Google Trends
    getGoogleTrends, getTrendingSearches, getRelatedQueries,
    // Digital Products
    getDigitalProductTrends, getDigitalProductQuestions, getAmazonDemandSignals, getEtsyDigitalDemand,
    // Extraction
    extractProductMentions, extractQuestions, clusterTopics,
    // Demo
    getDemoTrends, getDemoTrendingSearches,
  };

})();
