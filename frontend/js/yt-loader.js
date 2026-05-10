/* yt-loader.js — overrides loadYouTube in app.js with proper thumbnail support */

function renderYouTubeCard(v) {
  const thumb = v.thumbnail || thumbnailFromYouTubeUrl(v.url) || '';
  const thumbSection = thumb
    ? '<div class="yt-thumb-wrap"><img src="' + escHtml(thumb) + '" class="yt-thumb" loading="lazy" alt="" onerror="this.parentElement.innerHTML=\'<div class=yt-thumb-ph>&#9654;</div>\'"></div>'
    : '<div class="yt-thumb-ph">&#9654;</div>';
  const stats = [
    v.views    ? '<span>&#128065; ' + formatNum(v.views)    + '</span>' : '',
    v.likes    ? '<span>&#10084; ' + formatNum(v.likes)     + '</span>' : '',
    v.comments ? '<span>&#128172; ' + formatNum(v.comments) + '</span>' : '',
  ].filter(Boolean).join('');
  const tags = (v.tags || []).length
    ? '<div class="yt-tags">' + v.tags.slice(0,3).map(function(t){ return '<span class="yt-tag">' + escHtml(t) + '</span>'; }).join('') + '</div>'
    : '';
  return '<div class="yt-card" onclick="openLink(\'' + escAttr(v.url) + '\')">'
    + thumbSection
    + '<div class="yt-body">'
    + '<div class="yt-title">' + escHtml(v.title || '') + '</div>'
    + '<div class="yt-channel">' + escHtml(v.channel || '') + '</div>'
    + '<div class="yt-stats">' + stats + '</div>'
    + tags
    + '</div></div>';
}

function thumbnailFromYouTubeUrl(url) {
  const match = String(url || '').match(/[?&]v=([^&]+)/);
  return match ? 'https://i.ytimg.com/vi/' + encodeURIComponent(match[1]) + '/hqdefault.jpg' : '';
}

// Override the loadYouTube function defined in app.js
// This runs after app.js loads so it replaces it cleanly
document.addEventListener('DOMContentLoaded', function() {
  // Replace the loadYouTube global with the fixed version
  window._loadYouTubeFixed = async function() {
    var el = document.getElementById('youtubeContainer');
    if (!el) return;
    el.innerHTML = '<div class="loading-state full">Loading YouTube trends across 6 categories...</div>';

    try {
      var results = await Promise.all([
        API.getYouTubeTrending('US', '0'),
        API.getYouTubeByCategory('26'), // How-to
        API.getYouTubeByCategory('28'), // Science & Tech
        API.getYouTubeByCategory('24'), // Entertainment
        API.getYouTubeByCategory('20'), // Gaming
        API.getYouTubeByCategory('10'), // Music
      ]);

      var seen = new Set();
      var all = [];
      results.forEach(function(arr) { arr.forEach(function(v) { all.push(v); }); });
      var unique = all.filter(function(v) {
        if (seen.has(v.url)) return false;
        seen.add(v.url);
        return true;
      }).sort(function(a, b) { return (b.views || 0) - (a.views || 0); });

      if (!unique.length) {
        el.innerHTML = '<div class="loading-state full">No videos loaded — your YouTube API key may need to be re-saved in &#9881; Update API Keys</div>';
        return;
      }

      el.innerHTML = '<div class="results-count">' + unique.length + ' trending videos across 6 categories</div>'
        + '<div class="yt-grid">' + unique.slice(0, 40).map(renderYouTubeCard).join('') + '</div>';
    } catch(e) {
      el.innerHTML = '<div class="loading-state full">Could not load YouTube data — try refreshing</div>';
    }
  };
});
