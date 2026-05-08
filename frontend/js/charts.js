/* ============================================
   CHARTS.JS — Fixed height, no growing canvas
   ============================================ */

const Charts = (() => {

  let volumeChart = null;
  let platformChart = null;

  const COLORS = {
    accent:  '#00f5a0',
    blue:    '#4d9fff',
    orange:  '#ff7a2f',
    pink:    '#ff4d8f',
    yellow:  '#ffd60a',
    text3:   '#55556a',
    grid:    'rgba(255,255,255,0.05)',
  };

  function initVolumeChart(data) {
    const ctx = document.getElementById('volumeChart');
    if (!ctx) return;

    // FIX: destroy old chart and reset canvas size before re-creating
    if (volumeChart) {
      volumeChart.destroy();
      volumeChart = null;
    }
    // Reset the canvas element to prevent size creep
    ctx.style.height = '200px';
    ctx.height = 200;

    const labels = data.labels || ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const ds = data.datasets || {};

    const legendEl = document.getElementById('chartLegend');
    if (legendEl) {
      legendEl.innerHTML = [
        { color: COLORS.accent,  label: 'Google' },
        { color: COLORS.blue,    label: 'Reddit' },
        { color: COLORS.orange,  label: 'YouTube' },
        { color: COLORS.yellow,  label: 'News' },
      ].map(l => `
        <div class="legend-item">
          <div class="legend-dot" style="background:${l.color};"></div>
          ${l.label}
        </div>
      `).join('');
    }

    volumeChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Google',
            data: ds.google || [],
            borderColor: COLORS.accent,
            backgroundColor: 'rgba(0,245,160,0.06)',
            fill: true, tension: 0.4, pointRadius: 3,
            borderWidth: 2, pointBackgroundColor: COLORS.accent,
          },
          {
            label: 'Reddit',
            data: ds.reddit || [],
            borderColor: COLORS.blue,
            backgroundColor: 'rgba(77,159,255,0.05)',
            fill: true, tension: 0.4, pointRadius: 3,
            borderWidth: 2, pointBackgroundColor: COLORS.blue,
          },
          {
            label: 'YouTube',
            data: ds.youtube || [],
            borderColor: COLORS.orange,
            backgroundColor: 'rgba(255,122,47,0.05)',
            fill: true, tension: 0.4, pointRadius: 3,
            borderWidth: 2, pointBackgroundColor: COLORS.orange,
          },
          {
            label: 'News',
            data: ds.news || [],
            borderColor: COLORS.yellow,
            backgroundColor: 'rgba(255,214,10,0.04)',
            fill: true, tension: 0.4, pointRadius: 3,
            borderWidth: 1.5,
            pointBackgroundColor: COLORS.yellow,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,  // wrapper div controls height, not canvas
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#18181f',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#e8e8f0',
            bodyColor: '#8888a0',
            padding: 12,
            callbacks: {
              label: c => ` ${c.dataset.label}: ${c.parsed.y.toLocaleString()}`,
            }
          }
        },
        scales: {
          x: {
            grid: { color: COLORS.grid },
            ticks: { color: COLORS.text3, font: { size: 11 }, maxRotation: 0 },
          },
          y: {
            grid: { color: COLORS.grid },
            ticks: {
              color: COLORS.text3, font: { size: 11 },
              callback: v => v >= 1000 ? (v/1000).toFixed(1)+'K' : v,
            },
          },
        },
      },
    });
  }

  function initPlatformChart(platformData) {
    const ctx = document.getElementById('platformChart');
    if (!ctx) return;

    if (platformChart) {
      platformChart.destroy();
      platformChart = null;
    }

    const platforms = platformData || [
      { name: 'Google Trends', pct: 38, color: COLORS.accent },
      { name: 'Reddit',        pct: 27, color: COLORS.blue },
      { name: 'YouTube',       pct: 20, color: COLORS.orange },
      { name: 'News',          pct: 11, color: COLORS.yellow },
      { name: 'Bluesky',       pct:  4, color: COLORS.pink },
    ];

    platformChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: platforms.map(p => p.name),
        datasets: [{
          data: platforms.map(p => p.pct),
          backgroundColor: platforms.map(p => p.color + '99'),
          borderColor: platforms.map(p => p.color),
          borderWidth: 1.5,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#18181f',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#e8e8f0',
            bodyColor: '#8888a0',
            callbacks: {
              label: c => ` ${c.label}: ${c.parsed}%`,
            }
          }
        },
      },
    });

    const listEl = document.getElementById('platformList');
    if (listEl) {
      listEl.innerHTML = platforms.map(p => `
        <div class="plat-row">
          <div class="plat-name" style="color:${p.color};">${p.name}</div>
          <div class="plat-bar-wrap">
            <div class="plat-bar" style="width:${p.pct}%;background:${p.color};"></div>
          </div>
          <div class="plat-pct" style="color:${p.color};">${p.pct}%</div>
        </div>
      `).join('');
    }
  }

  return { initVolumeChart, initPlatformChart };

})();
