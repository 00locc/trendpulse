/* twitter.js — Free Twitter/X data via multiple sources, no API key */

// ── SOURCE 1: Twitter search via RSS2JSON + Nitter ────────────────────
// Nitter is a free open-source Twitter frontend that exposes RSS feeds
async function getTwitterTrending() {
  const cacheKey = 'tp_twitter';
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const { data, exp } = JSON.parse(raw);
      if (Date.now() < exp) return data;
    }
  } catch(e) {}

  // Try Nitter RSS via rss2json (free tier: 10K requests/day)
  const queries = [
    'AI tools make money',
    'passive income digital products',
    'side hustle 2025',
    'ChatGPT prompt productivity',
    'sell ebooks online',
  ];

  const results = [];

  for (const q of queries) {
    try {
      const nitterFeed = `https://nitter.poast.org/search/rss?q=${encodeURIComponent(q)}&f=tweets`;
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(nitterFeed)}&count=8`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(6000) });
      const data = await res.json();
      if (data.status === 'ok' && data.items?.length) {
        data.items.forEach(item => {
          results.push({
            source: 'Twitter/X',
            title: (item.title || '').substring(0, 140),
            url: (item.link || '').replace(/nitter\.[^/]+/, 'twitter.com'),
            author: item.author || '',
            published: new Date(item.pubDate),
          });
        });
      }
    } catch(e) {}
  }

  const final = results.length > 0 ? results : getTwitterDemo();

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({
      data: final,
      exp: Date.now() + 15 * 60 * 1000 // 15 min cache
    }));
  } catch(e) {}

  return final;
}

// ── SOURCE 2: Twitter trending topics via trends24.in RSS ─────────────
// trends24.in tracks Twitter trending topics publicly, no key needed
async function getTwitterTrendingTopics() {
  const cacheKey = 'tp_twitter_topics';
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const { data, exp } = JSON.parse(raw);
      if (Date.now() < exp) return data;
    }
  } catch(e) {}

  try {
    // Use rss2json to parse trends24 feed
    const feed = 'https://trends24.in/united-states/rss';
    const url  = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}&count=20`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(7000) });
    const data = await res.json();

    if (data.status !== 'ok' || !data.items?.length) throw new Error();

    const topics = data.items.map(item => ({
      source: 'Twitter/X',
      title: item.title || '',
      url: `https://twitter.com/search?q=${encodeURIComponent(item.title || '')}&src=trend_click`,
      published: new Date(item.pubDate),
      score: 0,
    }));

    sessionStorage.setItem(cacheKey, JSON.stringify({ data: topics, exp: Date.now() + 20 * 60 * 1000 }));
    return topics;
  } catch(e) {
    return getTwitterTrendingDemo();
  }
}

function getTwitterDemo() {
  return [
    { source:'Twitter/X', title:'Everyone talking about AI replacing jobs — here\'s what\'s actually happening', url:'https://twitter.com/search?q=AI+jobs', author:'@techinsider', published:new Date() },
    { source:'Twitter/X', title:'My Notion template just hit 10K downloads on Gumroad 🤯 Here\'s the template:', url:'https://twitter.com/search?q=notion+template+gumroad', author:'@productivitypro', published:new Date() },
    { source:'Twitter/X', title:'Side hustle that made me $5K last month: selling digital planners on Etsy', url:'https://twitter.com/search?q=digital+planners+etsy', author:'@digitalcreator', published:new Date() },
    { source:'Twitter/X', title:'ChatGPT prompt that writes entire ebooks in 20 minutes (thread 🧵)', url:'https://twitter.com/search?q=chatgpt+ebook+prompt', author:'@aitools', published:new Date() },
    { source:'Twitter/X', title:'Passive income update: $2,340 from PDFs this month. What I sell:', url:'https://twitter.com/search?q=passive+income+pdf', author:'@passiveincome', published:new Date() },
    { source:'Twitter/X', title:'No code tools that are actually replacing developers in 2025:', url:'https://twitter.com/search?q=no+code+tools+2025', author:'@nocodehq', published:new Date() },
    { source:'Twitter/X', title:'How I went from 0 to $10K/month selling templates (step by step):', url:'https://twitter.com/search?q=selling+templates+income', author:'@templatebiz', published:new Date() },
    { source:'Twitter/X', title:'The AI tools I use every day to 10x my productivity:', url:'https://twitter.com/search?q=AI+productivity+tools', author:'@productivityhacks', published:new Date() },
  ];
}

function getTwitterTrendingDemo() {
  return [
    { source:'Twitter/X', title:'#AITools', url:'https://twitter.com/search?q=%23AITools&src=trend_click' },
    { source:'Twitter/X', title:'#SideHustle', url:'https://twitter.com/search?q=%23SideHustle&src=trend_click' },
    { source:'Twitter/X', title:'#PassiveIncome', url:'https://twitter.com/search?q=%23PassiveIncome&src=trend_click' },
    { source:'Twitter/X', title:'#ChatGPT', url:'https://twitter.com/search?q=%23ChatGPT&src=trend_click' },
    { source:'Twitter/X', title:'#DigitalProducts', url:'https://twitter.com/search?q=%23DigitalProducts&src=trend_click' },
    { source:'Twitter/X', title:'#MakeMoneyOnline', url:'https://twitter.com/search?q=%23MakeMoneyOnline&src=trend_click' },
  ];
}

// ── RENDER TWITTER PANEL ──────────────────────────────────────────────
async function loadTwitterPanel() {
  const el = document.getElementById('twitterPanel');
  if (!el) return;

  // Show demo immediately
  renderTwitterList(getTwitterDemo());

  // Try live data
  const [tweets, topics] = await Promise.all([
    getTwitterTrending().catch(() => []),
    getTwitterTrendingTopics().catch(() => []),
  ]);

  const combined = [...topics, ...tweets];
  if (combined.length) renderTwitterList(combined);
}

function renderTwitterList(items) {
  const el = document.getElementById('twitterPanel');
  if (!el) return;

  el.innerHTML = items.slice(0, 12).map((item, i) => {
    const name = item.title || '';
    const url  = item.url  || '#';
    const sub  = item.author
      ? `${item.author} · Twitter/X`
      : `Twitter/X trending`;
    return `<div class="trend-item trend-item-link" onclick="openLink('${(url||'').replace(/'/g,'%27')}')" title="${(name||'').replace(/"/g,'&quot;')}">
      <div class="trend-rank">#${i+1}</div>
      <div class="trend-name">
        ${(name||'').substring(0,55).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}${name.length>55?'...':''}
        <small>${sub}</small>
      </div>
    </div>`;
  }).join('');
}
