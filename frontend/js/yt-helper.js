// YouTube render helper — called from loadYouTube
function renderYouTubeCard(v) {
  const thumb = v.thumbnail || thumbnailFromYouTubeUrl(v.url) || '';
  const thumbSection = thumb
    ? `<div class="yt-thumb-wrap"><img src="${escHtml(thumb)}" class="yt-thumb" loading="lazy" alt="" onerror="this.parentElement.innerHTML='<div class=yt-thumb-ph>&#9654;</div>'"></div>`
    : `<div class="yt-thumb-ph">&#9654;</div>`;
  const stats = [
    v.views    ? `<span>&#128065; ${formatNum(v.views)}</span>`   : '',
    v.likes    ? `<span>&#10084; ${formatNum(v.likes)}</span>`    : '',
    v.comments ? `<span>&#128172; ${formatNum(v.comments)}</span>`: '',
  ].filter(Boolean).join('');
  const tags = v.tags?.length
    ? `<div class="yt-tags">${v.tags.slice(0,3).map(t => `<span class="yt-tag">${escHtml(t)}</span>`).join('')}</div>`
    : '';
  return `<div class="yt-card" onclick="openLink('${escAttr(v.url)}')">
    ${thumbSection}
    <div class="yt-body">
      <div class="yt-title">${escHtml(v.title || '')}</div>
      <div class="yt-channel">${escHtml(v.channel || '')}</div>
      <div class="yt-stats">${stats}</div>
      ${tags}
    </div>
  </div>`;
}

function thumbnailFromYouTubeUrl(url) {
  const match = String(url || '').match(/[?&]v=([^&]+)/);
  return match ? `https://i.ytimg.com/vi/${encodeURIComponent(match[1])}/hqdefault.jpg` : '';
}
