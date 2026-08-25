/* 全站点看板 - 图表逻辑（支持站点切换 + 货币动态切换 $/€） */
window.DashboardCharts = (function () {
  var registry = [];
  var customRegistry = [];
  var STYLE = {};
  var CUR = '$';  // 当前货币符号，默认 $
  var CUR_NAME = 'USD';

  function readStyle() {
    var s = getComputedStyle(document.documentElement);
    STYLE = {
      accent: s.getPropertyValue('--accent').trim(),
      accent2: s.getPropertyValue('--accent2').trim(),
      ink: s.getPropertyValue('--ink').trim(),
      muted: s.getPropertyValue('--muted').trim(),
      rule: s.getPropertyValue('--rule').trim(),
      bg2: s.getPropertyValue('--bg2').trim(),
      pos: s.getPropertyValue('--pos').trim(),
      neg: s.getPropertyValue('--neg').trim()
    };
  }

  function brandPalette() {
    var s = getComputedStyle(document.documentElement);
    var p = [];
    for (var i = 1; i <= 10; i++) p.push(s.getPropertyValue('--brand' + i).trim() || STYLE.muted);
    return p;
  }

  function init(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    el.innerHTML = '';
    el.removeAttribute('_echarts_instance_');
    var c = echarts.init(el, null, { renderer: 'svg' });
    registry.push(c);
    return c;
  }

  function tip(extra) {
    var cfg = Object.assign({
      trigger: 'axis', axisPointer: { type: 'shadow' },
      backgroundColor: STYLE.bg2, borderColor: STYLE.rule, borderWidth: 1,
      textStyle: { color: STYLE.ink, fontSize: 12 }, appendToBody: true
    }, extra || {});
    // 提取 valueFormatter（如有），改用自定义 formatter 实现降序排列
    var vf = cfg.valueFormatter;
    delete cfg.valueFormatter;
    cfg.formatter = function (params) {
      if (!params || !params.length) return '';
      var sorted = params.slice().sort(function (a, b) {
        var va = Array.isArray(a.value) ? a.value[a.value.length - 1] : a.value;
        var vb = Array.isArray(b.value) ? b.value[b.value.length - 1] : b.value;
        return (vb || 0) - (va || 0);
      });
      var html = '<strong>' + (sorted[0].axisValueLabel || sorted[0].name || '') + '</strong><br/>';
      sorted.forEach(function (p) {
        var v = Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
        var formatted = vf ? vf(v) : (v == null ? '-' : v);
        html += p.marker + p.seriesName + ':&nbsp;&nbsp;' + formatted + '<br/>';
      });
      return html;
    };
    return cfg;
  }
  function axisBase() {
    return {
      axisLine: { lineStyle: { color: STYLE.rule } },
      axisLabel: { color: STYLE.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: STYLE.rule, type: 'dashed' } },
      axisTick: { show: false }
    };
  }
  function ymLabel(ym) { var s = String(ym); return s.slice(0, 4) + '.' + s.slice(4); }
  function pad(arr, n) { var a = arr.slice(); while (a.length < n) a.push(null); return a; }
  function fmtMoney(v) { return v == null ? '-' : CUR + (v / 1e6).toFixed(2) + 'M'; }

  // 更新货币显示（HTML 中带 id 的标题/表头）
  function updateCurrencyLabels() {
    var gmsTitle = document.getElementById('gms-title');
    if (gmsTitle) gmsTitle.textContent = '大盘月度销额趋势（' + CUR_NAME + '）';
    var rankGmsTitle = document.getElementById('rank-gms-title');
    if (rankGmsTitle) rankGmsTitle.textContent = 'YTD 销额 TOP 15';
    var tblGmsCur = document.getElementById('tbl-gms-cur');
    if (tblGmsCur) tblGmsCur.textContent = 'YTD销额(' + CUR_NAME + ')';
    var tblTitle = document.getElementById('tbl-title');
    if (tblTitle) tblTitle.textContent = '品牌 YTD 销额明细表';
  }

  function renderKPI(D) {
    var box = document.getElementById('kpi-grid'); if (!box) return;
    var U = D.market.units, G = D.market.gms;
    var u26 = U['2026'] || [], g26 = G['2026'] || [];
    var u25 = U['2025'] || [], g25 = G['2025'] || [];
    // 销额和销量独立计算月数，避免一方为空导致全部清零
    var nG = Math.min(g26.length, g25.length);
    var nU = Math.min(u26.length, u25.length);
    var sumG26 = g26.slice(0, nG).reduce(function (a, b) { return a + (b || 0); }, 0);
    var sumG25 = g25.slice(0, nG).reduce(function (a, b) { return a + (b || 0); }, 0);
    var sumU26 = u26.slice(0, nU).reduce(function (a, b) { return a + (b || 0); }, 0);
    var sumU25 = u25.slice(0, nU).reduce(function (a, b) { return a + (b || 0); }, 0);
    var gmsYoY = sumG25 > 0 ? (sumG26 / sumG25 - 1) : 0;
    var unitsYoY = sumU25 > 0 ? (sumU26 / sumU25 - 1) : 0;
    var g26Total = G['2026_total'] || sumG26;
    var g25Total = G['2025_total'] || 0;
    var g24Total = G['2024_total'] || 0;
    var yoy25 = g24Total > 0 ? (g25Total / g24Total - 1) : 0;
    // KPI 显示用月数：优先销额月数
    var n = nG || nU;

    var mmYtd = D.competitor.ytd_26_share;
    var mmYtd25 = D.competitor.ytd_25_share;

    var rows = D.competitor.share || [];
    var last = rows[rows.length - 1] || {};
    var brands = D.competitor.brands || [];
    var sortedB = brands.map(function (b) { return { b: b, v: last[b] || 0 }; }).sort(function (a, b) { return b.v - a.v; });

    var yg = D.ranking.ytd_gms || [];
    var topG = yg[0] || { brand: '-', gms: 0 };
    var topG2 = yg[1] || {}, topG3 = yg[2] || {};

    function kpi(label, value, delta, deltaClass, sub) {
      return '<div class="kpi"><div class="label">' + label + '</div>' +
        '<div class="value">' + value + '</div>' +
        '<div class="delta ' + deltaClass + '">' + delta + '</div>' +
        '<div class="sub-text">' + sub + '</div></div>';
    }
    function kpiAlt(label, value, delta, deltaClass, sub) {
      return '<div class="kpi alt"><div class="label">' + label + '</div>' +
        '<div class="value">' + value + '</div>' +
        '<div class="delta ' + deltaClass + '">' + delta + '</div>' +
        '<div class="sub-text">' + sub + '</div></div>';
    }
    var ds = function (v) { return v >= 0 ? 'pos' : 'neg'; };
    var arr = function (v) { return v >= 0 ? '↑ ' : '↓ '; };

    box.innerHTML =
      kpi('大盘 YTD 销额 (' + n + '月累计)', CUR + (sumG26 / 1e6).toFixed(1) + '<span class="unit">M</span>',
        arr(gmsYoY) + 'YOY ' + (gmsYoY * 100).toFixed(1) + '%', ds(gmsYoY),
        '去年同期 ' + CUR + (sumG25 / 1e6).toFixed(1) + 'M') +
      kpi('大盘 YTD 销量 (' + n + '月累计)', (sumU26).toLocaleString() + '<span class="unit">台</span>',
        arr(unitsYoY) + 'YOY ' + (unitsYoY * 100).toFixed(1) + '%', ds(unitsYoY),
        '去年同期 ' + sumU25.toLocaleString() + '台') +
      kpiAlt('上一年度全年大盘销额', CUR + (g25Total / 1e6).toFixed(1) + '<span class="unit">M</span>',
        arr(yoy25) + 'vs 前年 ' + (yoy25 * 100).toFixed(1) + '%', ds(yoy25),
        '前年全年 ' + CUR + (g24Total / 1e6).toFixed(1) + 'M') +
      kpiAlt('Mammotion YTD 销额市占', (mmYtd ? (mmYtd * 100).toFixed(0) : '-') + '%',
        (mmYtd != null && mmYtd25 != null ? (arr(mmYtd - mmYtd25) + 'vs 去年同期 ' + Math.abs((mmYtd - mmYtd25) * 100).toFixed(0) + 'pp') : '-'),
        (mmYtd != null && mmYtd25 != null ? ds(mmYtd - mmYtd25) : 'neutral'),
        '去年同期 ' + (mmYtd25 ? (mmYtd25 * 100).toFixed(0) + '%' : '-')) +
      kpi('最新月(' + ymLabel(last.ym || '') + ')市占 TOP1', (sortedB[0] ? sortedB[0].b : '-'),
        (sortedB[0] ? (sortedB[0].v * 100).toFixed(1) + '%' : '-'), 'pos',
        (sortedB[1] ? sortedB[1].b + ' ' + (sortedB[1].v * 100).toFixed(1) + '%' : '') +
        (sortedB[2] ? ' / ' + sortedB[2].b + ' ' + (sortedB[2].v * 100).toFixed(1) + '%' : '')) +
      kpi('YTD 销额 TOP1 品牌', (topG.brand || '-'), (topG.gms ? CUR + (topG.gms / 1e6).toFixed(1) + 'M' : '-'), 'pos',
        (topG2.brand ? topG2.brand + ' ' + CUR + (topG2.gms / 1e6).toFixed(1) + 'M' : '') +
        (topG3.brand ? ' / ' + topG3.brand + ' ' + CUR + (topG3.gms / 1e6).toFixed(1) + 'M' : ''));
  }

  function chartUnitsTrend(D) {
    var c = init('chart-units-trend'); if (!c) return;
    c.setOption({
      animation: false,
      tooltip: tip({ valueFormatter: function (v) { return v == null ? '-' : v + ' 台'; } }),
      legend: { data: ['2024年', '2025年', '2026年'], top: 0, right: 10, textStyle: { color: STYLE.muted, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
      grid: { top: 36, left: 48, right: 20, bottom: 30 },
      xAxis: Object.assign({ type: 'category', data: D.months, boundaryGap: false }, axisBase(), { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value', name: '台' }, axisBase()),
      series: [
        { name: '2024年', type: 'line', data: pad(D.market.units['2024'] || [], 12), smooth: true, lineStyle: { width: 2, color: STYLE.muted }, itemStyle: { color: STYLE.muted }, symbol: 'circle', symbolSize: 5 },
        { name: '2025年', type: 'line', data: pad(D.market.units['2025'] || [], 12), smooth: true, lineStyle: { width: 2.5, color: STYLE.accent }, itemStyle: { color: STYLE.accent }, symbol: 'circle', symbolSize: 5 },
        { name: '2026年', type: 'line', data: pad(D.market.units['2026'] || [], 12), smooth: true, lineStyle: { width: 2.5, color: STYLE.accent2 }, itemStyle: { color: STYLE.accent2 }, symbol: 'circle', symbolSize: 6, areaStyle: { color: STYLE.accent2 + '22' } }
      ]
    });
  }

  function chartGmsTrend(D) {
    var c = init('chart-gms-trend'); if (!c) return;
    c.setOption({
      animation: false,
      tooltip: tip({ valueFormatter: fmtMoney }),
      legend: { data: ['2024年', '2025年', '2026年'], top: 0, right: 10, textStyle: { color: STYLE.muted, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
      grid: { top: 36, left: 58, right: 20, bottom: 30 },
      xAxis: Object.assign({ type: 'category', data: D.months, boundaryGap: false }, axisBase(), { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value', name: CUR_NAME, axisLabel: { formatter: function (v) { return CUR + (v / 1e6).toFixed(0) + 'M'; } } }, axisBase()),
      series: [
        { name: '2024年', type: 'line', data: pad(D.market.gms['2024'] || [], 12), smooth: true, lineStyle: { width: 2, color: STYLE.muted }, itemStyle: { color: STYLE.muted }, symbol: 'circle', symbolSize: 5 },
        { name: '2025年', type: 'line', data: pad(D.market.gms['2025'] || [], 12), smooth: true, lineStyle: { width: 2.5, color: STYLE.accent }, itemStyle: { color: STYLE.accent }, symbol: 'circle', symbolSize: 5 },
        { name: '2026年', type: 'line', data: pad(D.market.gms['2026'] || [], 12), smooth: true, lineStyle: { width: 2.5, color: STYLE.accent2 }, itemStyle: { color: STYLE.accent2 }, symbol: 'circle', symbolSize: 6, areaStyle: { color: STYLE.accent2 + '22' } }
      ]
    });
  }

  function chartYoY(D) {
    var c = init('chart-yoy'); if (!c) return;
    var n = Math.min((D.market.units.yoy || []).length, (D.market.gms.yoy || []).length);
    var ym = D.months.slice(0, n);
    c.setOption({
      animation: false,
      tooltip: tip({ valueFormatter: function (v) { return v == null ? '-' : (v * 100).toFixed(0) + '%'; } }),
      legend: { data: ['销量YOY', '销额YOY'], top: 0, right: 10, textStyle: { color: STYLE.muted, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
      grid: { top: 36, left: 48, right: 20, bottom: 30 },
      xAxis: Object.assign({ type: 'category', data: ym }, axisBase(), { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value', name: '同比', axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + '%'; } } }, axisBase()),
      series: [
        { name: '销量YOY', type: 'bar', data: D.market.units.yoy || [], barWidth: 18, itemStyle: { color: STYLE.accent, borderRadius: [3, 3, 0, 0] } },
        { name: '销额YOY', type: 'bar', data: D.market.gms.yoy || [], barWidth: 18, itemStyle: { color: STYLE.accent2, borderRadius: [3, 3, 0, 0] } }
      ]
    });
  }

  function chartShareTrend(D) {
    var c = init('chart-share-trend'); if (!c) return;
    var rows = D.competitor.share || [];
    var xLabels = rows.map(function (r) { return ymLabel(r.ym); });
    var brands = D.competitor.brands || [];
    var colors = brandPalette();
    var last = rows[rows.length - 1] || {};
    var ranked = brands.map(function (b, i) { return { b: b, i: i, v: last[b] || 0 }; }).sort(function (a, b) { return b.v - a.v; });
    var series = brands.map(function (b, i) {
      var rk = ranked.findIndex(function (x) { return x.b === b; });
      var isTop = rk < 5;
      return {
        name: b, type: 'line', smooth: true, symbol: 'none', emphasis: { focus: 'series' },
        data: rows.map(function (r) { var v = r[b]; return v != null ? +(v * 100).toFixed(1) : null; }),
        lineStyle: { width: isTop ? 3 : 1.5, color: colors[i] }, itemStyle: { color: colors[i] }, z: isTop ? 10 : 1
      };
    });
    c.setOption({
      animation: false,
      tooltip: tip({ trigger: 'axis', valueFormatter: function (v) { return v == null ? '-' : v.toFixed(1) + '%'; } }),
      legend: { data: brands, top: 0, type: 'scroll', textStyle: { color: STYLE.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 8, pageIconColor: STYLE.accent, pageTextStyle: { color: STYLE.muted } },
      grid: { top: 40, left: 44, right: 20, bottom: 30 },
      xAxis: Object.assign({ type: 'category', data: xLabels, boundaryGap: false, axisLabel: { rotate: 35, fontSize: 10, color: STYLE.muted, interval: 0 } }, axisBase(), { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value', name: '市占%', axisLabel: { formatter: function (v) { return v + '%'; } } }, axisBase()),
      series: series
    });
  }

  function chartGmvTrend(D) {
    var c = init('chart-gmv-trend'); if (!c) return;
    var rows = D.competitor.gmv || [];
    var xLabels = rows.map(function (r) { return ymLabel(r.ym); });
    var brands = D.competitor.brands || [];
    var colors = brandPalette();
    var last = rows[rows.length - 1] || {};
    var ranked = brands.map(function (b, i) { return { b: b, i: i, v: last[b] || 0 }; }).sort(function (a, b) { return b.v - a.v; });
    var series = brands.map(function (b, i) {
      var rk = ranked.findIndex(function (x) { return x.b === b; });
      var isTop = rk < 5;
      return {
        name: b, type: 'line', smooth: true, symbol: 'none', emphasis: { focus: 'series' },
        data: rows.map(function (r) { return r[b] ? r[b] : null; }),
        lineStyle: { width: isTop ? 3 : 1.5, color: colors[i] }, itemStyle: { color: colors[i] }, z: isTop ? 10 : 1
      };
    });
    c.setOption({
      animation: false,
      tooltip: tip({ trigger: 'axis', valueFormatter: fmtMoney }),
      legend: { data: brands, top: 0, type: 'scroll', textStyle: { color: STYLE.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
      grid: { top: 40, left: 58, right: 20, bottom: 30 },
      xAxis: Object.assign({ type: 'category', data: xLabels, boundaryGap: false, axisLabel: { rotate: 35, fontSize: 10, color: STYLE.muted, interval: 0 } }, axisBase(), { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value', name: CUR_NAME, axisLabel: { formatter: function (v) { return CUR + (v / 1e6).toFixed(0) + 'M'; } } }, axisBase()),
      series: series
    });
  }

  function chartGmvLatest(D) {
    var c = init('chart-gmv-latest'); if (!c) return;
    var rows = D.competitor.gmv || [];
    var last = rows[rows.length - 1] || {};
    var brands = D.competitor.brands || [];
    var data = brands.map(function (b) { return { name: b, value: last[b] ? last[b] : 0 }; });
    data.sort(function (a, b) { return a.value - b.value; });
    c.setOption({
      animation: false,
      tooltip: tip({ valueFormatter: fmtMoney }),
      grid: { top: 10, left: 80, right: 55, bottom: 20 },
      xAxis: Object.assign({ type: 'value', axisLabel: { formatter: function (v) { return CUR + (v / 1e6).toFixed(1) + 'M'; } } }, axisBase()),
      yAxis: Object.assign({ type: 'category', data: data.map(function (d) { return d.name; }) }, axisBase(), { axisLabel: { color: STYLE.ink, fontWeight: 600, fontSize: 11 }, splitLine: { show: false } }),
      series: [{
        type: 'bar', data: data.map(function (d) { return { value: d.value, itemStyle: { color: d.name === 'Mammotion' ? STYLE.accent2 : STYLE.accent, borderRadius: [0, 3, 3, 0] } }; }),
        barWidth: 16, label: { show: true, position: 'right', formatter: function (p) { return CUR + (p.value / 1e6).toFixed(1) + 'M'; }, color: STYLE.ink, fontSize: 11, fontWeight: 600 }
      }]
    });
  }

  function chartRankUnits(D) {
    var c = init('chart-rank-units'); if (!c) return;
    var list = (D.ranking.ytd_units || []).slice(0, 15).slice().reverse();
    c.setOption({
      animation: false,
      tooltip: tip({ valueFormatter: function (v) { return v + ' 台'; } }),
      grid: { top: 10, left: 110, right: 50, bottom: 20 },
      xAxis: Object.assign({ type: 'value' }, axisBase()),
      yAxis: Object.assign({ type: 'category', data: list.map(function (d) { return d.brand; }) }, axisBase(), { axisLabel: { color: STYLE.ink, fontWeight: 600, fontSize: 11 }, splitLine: { show: false } }),
      series: [{
        type: 'bar', data: list.map(function (d) { return { value: d.units, itemStyle: { color: d.brand === 'Mammotion' ? STYLE.accent2 : STYLE.accent, borderRadius: [0, 3, 3, 0] } }; }),
        barWidth: 14, label: { show: true, position: 'right', formatter: '{c} 台', color: STYLE.ink, fontSize: 11, fontWeight: 600 }
      }]
    });
  }

  function chartRankGms(D) {
    var c = init('chart-rank-gms'); if (!c) return;
    var list = (D.ranking.ytd_gms || []).slice(0, 15).slice().reverse();
    c.setOption({
      animation: false,
      tooltip: tip({ valueFormatter: fmtMoney }),
      grid: { top: 10, left: 110, right: 60, bottom: 20 },
      xAxis: Object.assign({ type: 'value', axisLabel: { formatter: function (v) { return CUR + (v / 1e6).toFixed(0) + 'M'; } } }, axisBase()),
      yAxis: Object.assign({ type: 'category', data: list.map(function (d) { return d.brand; }) }, axisBase(), { axisLabel: { color: STYLE.ink, fontWeight: 600, fontSize: 11 }, splitLine: { show: false } }),
      series: [{
        type: 'bar', data: list.map(function (d) { return { value: d.gms, itemStyle: { color: d.brand === 'Mammotion' ? STYLE.accent2 : STYLE.accent, borderRadius: [0, 3, 3, 0] } }; }),
        barWidth: 14, label: { show: true, position: 'right', formatter: function (p) { return CUR + (p.value / 1e6).toFixed(1) + 'M'; }, color: STYLE.ink, fontSize: 11, fontWeight: 600 }
      }]
    });
  }

  function chartMmDual(D, siteName) {
    var c = init('chart-mm-dual'); if (!c) return;
    var labels = [], unitsData = [], shareData = [];
    var ms = D.months; var i;
    // 非US站点从5月开始，US从1月开始
    var startIdx = (siteName === 'US') ? 0 : 4;
    // 2024年从 startIdx 开始，2025/2026 从1月开始
    for (i = startIdx; i < 12; i++) {
      var u = (D.mammotion.units['2024'] || [])[i];
      var s = (D.mammotion.share_g['2024'] || [])[i];
      if (u != null || s != null) { labels.push('24年' + ms[i]); unitsData.push(u != null ? u : null); shareData.push(s != null ? s : null); }
    }
    for (i = 0; i < 12; i++) {
      var u2 = (D.mammotion.units['2025'] || [])[i];
      var s2 = (D.mammotion.share_g['2025'] || [])[i];
      if (u2 != null || s2 != null) { labels.push('25年' + ms[i]); unitsData.push(u2 != null ? u2 : null); shareData.push(s2 != null ? s2 : null); }
    }
    for (i = 0; i < 12; i++) {
      var u3 = (D.mammotion.units['2026'] || [])[i];
      var s3 = (D.mammotion.share_g['2026'] || [])[i];
      if (u3 != null || s3 != null) { labels.push('26年' + ms[i]); unitsData.push(u3 != null ? u3 : null); shareData.push(s3 != null ? s3 : null); }
    }
    c.setOption({
      animation: false, tooltip: tip({}), legend: { data: ['销量(台)', '销额市占'], top: 0, right: 10, textStyle: { color: STYLE.muted, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
      grid: { top: 36, left: 48, right: 52, bottom: 60 },
      xAxis: Object.assign({ type: 'category', data: labels, axisLabel: { rotate: 45, fontSize: 9, color: STYLE.muted, interval: 0 } }, axisBase(), { splitLine: { show: false } }),
      yAxis: [
        Object.assign({ type: 'value', name: '台', position: 'left' }, axisBase()),
        Object.assign({ type: 'value', name: '市占%', position: 'right', axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + '%'; } } }, axisBase())
      ],
      series: [
        { name: '销量(台)', type: 'bar', data: unitsData, barWidth: '55%', itemStyle: { color: STYLE.accent + 'aa', borderRadius: [3, 3, 0, 0] } },
        { name: '销额市占', type: 'line', yAxisIndex: 1, data: shareData, smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2.5, color: STYLE.accent2 }, itemStyle: { color: STYLE.accent2 } }
      ]
    });
  }

  function chartMmShare(D) {
    var c = init('chart-mm-share'); if (!c) return;
    c.setOption({
      animation: false, tooltip: tip({ valueFormatter: function (v) { return v == null ? '-' : (v * 100).toFixed(1) + '%'; } }),
      legend: { data: ['2024年', '2025年', '2026年'], top: 0, right: 10, textStyle: { color: STYLE.muted, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
      grid: { top: 36, left: 48, right: 20, bottom: 30 },
      xAxis: Object.assign({ type: 'category', data: D.months, boundaryGap: false }, axisBase(), { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value', name: '市占', axisLabel: { formatter: function (v) { return (v * 100).toFixed(0) + '%'; } } }, axisBase()),
      series: [
        { name: '2024年', type: 'line', data: pad(D.mammotion.share_g['2024'] || [], 12), smooth: true, lineStyle: { width: 2, color: STYLE.muted }, itemStyle: { color: STYLE.muted }, symbol: 'circle', symbolSize: 5 },
        { name: '2025年', type: 'line', data: pad(D.mammotion.share_g['2025'] || [], 12), smooth: true, lineStyle: { width: 2.5, color: STYLE.accent }, itemStyle: { color: STYLE.accent }, symbol: 'circle', symbolSize: 5 },
        { name: '2026年', type: 'line', data: pad(D.mammotion.share_g['2026'] || [], 12), smooth: true, lineStyle: { width: 2.5, color: STYLE.accent2 }, itemStyle: { color: STYLE.accent2 }, symbol: 'circle', symbolSize: 6, areaStyle: { color: STYLE.accent2 + '22' } }
      ]
    });
  }

  function renderTable(D) {
    var tbody = document.querySelector('#tbl-gms tbody'); if (!tbody) return;
    tbody.innerHTML = '';
    var list = D.ranking.ytd_gms || [];
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="5">无数据</td></tr>'; return; }
    var total = list.reduce(function (s, d) { return s + d.gms; }, 0);
    var maxG = list[0].gms;
    list.forEach(function (d, idx) {
      var pct = (d.gms / total * 100);
      var tr = document.createElement('tr');
      var isMM = d.brand === 'Mammotion';
      var barW = Math.max(2, (d.gms / maxG * 120));
      tr.innerHTML =
        '<td class="rank">' + (idx + 1) + '</td>' +
        '<td class="brand' + (isMM ? ' hl' : '') + '">' + d.brand + '</td>' +
        '<td>' + CUR + d.gms.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</td>' +
        '<td>' + pct.toFixed(1) + '%</td>' +
        '<td><span class="bar-cell" style="width:' + barW + 'px;' + (isMM ? 'background:' + STYLE.accent2 : '') + '"></span></td>';
      tbody.appendChild(tr);
    });
  }

  function renderInsights(D) {
    var rows = D.competitor.share || [];
    var last = rows[rows.length - 1] || {};
    var brands = D.competitor.brands || [];
    var sortedB = brands.map(function (b) { return { b: b, v: last[b] || 0 }; }).sort(function (a, b) { return b.v - a.v; });

    var el1 = document.getElementById('insight-trend'); if (el1) {
      var g26 = D.market.gms['2026'] || [], g25 = D.market.gms['2025'] || [];
      var n = Math.min(g26.length, g25.length);
      var s26 = g26.slice(0, n).reduce(function (a, b) { return a + b; }, 0);
      var s25 = g25.slice(0, n).reduce(function (a, b) { return a + b; }, 0);
      var u26 = (D.market.units['2026'] || []).slice(0, n).reduce(function (a, b) { return a + b; }, 0);
      var u25 = (D.market.units['2025'] || []).slice(0, n).reduce(function (a, b) { return a + b; }, 0);
      var gY = s25 > 0 ? (s26 / s25 - 1) * 100 : 0;
      var uY = u25 > 0 ? (u26 / u25 - 1) * 100 : 0;
      el1.innerHTML = '<strong>趋势洞察：</strong>类目销额保持' + (gY >= 0 ? '增长' : '下滑') + '，YTD销额YOY ' + (gY >= 0 ? '+' : '') + gY.toFixed(1) + '%，' + (Math.abs(gY - uY) > 5 ? (gY > uY ? '远超' : '低于') : '接近') + '销量增速（' + (uY >= 0 ? '+' : '') + uY.toFixed(1) + '%）。5-7月为传统旺季。';
    }
    var el2 = document.getElementById('insight-comp'); if (el2) {
      el2.innerHTML = '<strong>竞争格局：</strong>' + (sortedB[0] ? sortedB[0].b + ' 最新月市占 ' + (sortedB[0].v * 100).toFixed(1) + '% 跃居第一；' : '') +
        (sortedB[1] ? sortedB[1].b + ' ' + (sortedB[1].v * 100).toFixed(1) + '%；' : '') +
        'Mammotion 市占 ' + ((last['Mammotion'] || 0) * 100).toFixed(1) + '%。';
    }
    var el3 = document.getElementById('insight-rank'); if (el3) {
      var yg = D.ranking.ytd_gms || [], yu = D.ranking.ytd_units || [];
      el3.innerHTML = '<strong>排名洞察：</strong>销额维度 ' + (yg[0] ? yg[0].brand + ' 以' + CUR + (yg[0].gms / 1e6).toFixed(1) + 'M居首' : '-') +
        '，但销量维度 ' + (yu[0] ? yu[0].brand + '（' + yu[0].units + '台）领先' : '-') +
        '，反映<strong>定价策略差异</strong>。';
    }
    var el4 = document.getElementById('insight-mm'); if (el4) {
      var y26 = D.mammotion.share_g['2026_year'] || (D.competitor.ytd_26_share);
      var y24 = D.mammotion.share_g['2024_year'];
      el4.innerHTML = '<strong>Mammotion 分析：</strong>Mammotion 销额市占' + (y24 ? '从2024年' + (y24 * 100).toFixed(0) + '%' : '') +
        (y26 != null ? '至 YTD ' + (y26 * 100).toFixed(0) + '%' : '') +
        (y24 && y26 != null ? '（' + ((y26 - y24) * 100).toFixed(0) + 'pp）' : '') +
        '。需关注<strong>新品节奏与价格带防守</strong>。';
    }
  }

  // 自定义板块专用 init（使用 customRegistry，不干扰主图表）
  function initCustom(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    el.innerHTML = '';
    el.removeAttribute('_echarts_instance_');
    var c = echarts.init(el, null, { renderer: 'svg' });
    customRegistry.push(c);
    return c;
  }

  // 自定义板块
  function renderCustomChart(rows, headers) {
    var c = initCustom('chart-custom'); if (!c) return;
    var numCols = [], textCols = [];
    headers.forEach(function (h) {
      var allNum = rows.every(function (r) { return r[h] == null || !isNaN(+r[h]); });
      if (allNum && rows.some(function (r) { return r[h] != null && +r[h] !== 0; })) numCols.push(h);
      else textCols.push(h);
    });
    var xCol = textCols[0] || headers[0];
    var xData = rows.map(function (r, i) { var v = r[xCol]; return v != null ? String(v) : '行' + (i + 1); });
    var series = numCols.map(function (col, idx) {
      var colors = [STYLE.accent, STYLE.accent2, '#7c3aed', '#0d9488', '#dc2626'];
      return { name: col, type: 'bar', data: rows.map(function (r) { var v = r[col]; return v != null ? +v : null; }), barWidth: '50%', itemStyle: { color: colors[idx % colors.length], borderRadius: [3, 3, 0, 0] } };
    });
    c.setOption({
      animation: false, tooltip: tip({ trigger: 'axis' }),
      legend: { data: numCols, top: 0, right: 10, textStyle: { color: STYLE.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 8 },
      grid: { top: 36, left: 58, right: 20, bottom: 60 },
      xAxis: Object.assign({ type: 'category', data: xData, axisLabel: { rotate: 30, fontSize: 10, color: STYLE.muted, interval: 0 } }, axisBase(), { splitLine: { show: false } }),
      yAxis: Object.assign({ type: 'value' }, axisBase()),
      series: series.length ? series : [{ type: 'bar', data: [] }]
    });
  }

  function renderCustomTable(rows, headers) {
    var thead = document.querySelector('#tbl-custom thead'); var tbody = document.querySelector('#tbl-custom tbody');
    if (!thead || !tbody) return;
    thead.innerHTML = '<tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';
    tbody.innerHTML = '';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.innerHTML = headers.map(function (h) {
        var v = r[h]; if (v == null) return '<td>-</td>';
        if (typeof v === 'number' || !isNaN(+v)) { var n = +v; if (Math.abs(n) >= 1e6) return '<td>' + CUR + (n / 1e6).toFixed(2) + 'M</td>'; if (Math.abs(n) >= 1e3) return '<td>' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</td>'; return '<td>' + n.toFixed(2) + '</td>'; }
        return '<td>' + v + '</td>';
      }).join('');
      tbody.appendChild(tr);
    });
  }


  // 非季节性产品：大盘规模走势图（静态数据）
    function chartNsTrend() {
    var el = document.getElementById('chart-ns-trend');
    if (!el) return;
    el.innerHTML = '';
    el.removeAttribute('_echarts_instance_');
    var c = echarts.init(el, null, { renderer: 'svg' });
    registry.push(c);
    var years = ['2024', '2025', '2026*'];
    c.setOption({
      animation: false,
      tooltip: tip({ valueFormatter: function (v) { return v == null ? '-' : v.toFixed(0); } }),
      legend: { data: ['Total GMS', '3P Total', 'CN 3P'], top: 0, right: 10, textStyle: { color: STYLE.muted, fontSize: 12 }, itemWidth: 14, itemHeight: 8 },
      grid: { top: 36, left: 48, right: 30, bottom: 40 },
      xAxis: Object.assign({ type: 'category', data: years, axisLabel: { fontSize: 13, fontWeight: 600, color: STYLE.ink } }, axisBase()),
      yAxis: Object.assign({ type: 'value', name: '相对指数 (2025=100)', axisLabel: { formatter: function (v) { return v; } } }, axisBase()),
      series: [
        { name: 'Total GMS', type: 'bar', data: [72, 100, 60], barWidth: 28, itemStyle: { color: STYLE.accent, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', formatter: '{c}', color: STYLE.ink, fontSize: 12, fontWeight: 600 } },
        { name: '3P Total', type: 'bar', data: [45, 55, 40], barWidth: 28, itemStyle: { color: STYLE.accent2, borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', formatter: '{c}', color: STYLE.ink, fontSize: 12, fontWeight: 600 } },
        { name: 'CN 3P', type: 'bar', data: [35, 48, 38], barWidth: 28, itemStyle: { color: '#7c5cbd', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', formatter: '{c}', color: STYLE.ink, fontSize: 12, fontWeight: 600 } }
      ]
    });
  }


  // 图1：月度净订单量同比对比
    function chartNsOrders() {
    var el = document.getElementById('chart-ns-orders');
    if (!el) return;
    el.innerHTML = '';
    el.removeAttribute('_echarts_instance_');
    var c = echarts.init(el, null, { renderer: 'svg' });
    registry.push(c);
    var months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    c.setOption({
      animation: false,
      tooltip: tip({ trigger: 'axis', valueFormatter: function(v) { return v == null ? '-' : v.toFixed(0); } }),
      legend: { data: ['2024','2025','2026*'], top: 0, right: 10, textStyle: { color: STYLE.muted, fontSize: 12 }, itemWidth: 14, itemHeight: 8 },
      grid: { top: 36, left: 50, right: 30, bottom: 30 },
      xAxis: Object.assign({ type: 'category', data: months, axisLabel: { fontSize: 12, color: STYLE.ink } }, axisBase()),
      yAxis: Object.assign({ type: 'value', name: '估算指数', axisLabel: { formatter: function(v) { return v; } } }, axisBase()),
      series: [
        { name: '2024', type: 'line', data: [30,32,33,34,35,55,60,30,28,64,65,50], smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { color: '#4472C4', width: 2.5 }, itemStyle: { color: '#4472C4' } },
        { name: '2025', type: 'line', data: [32,33,34,35,36,58,62,31,29,66,68,52], smooth: true, symbol: 'diamond', symbolSize: 6, lineStyle: { color: '#FFC000', width: 2.5, type: 'dashed' }, itemStyle: { color: '#FFC000' } },
        { name: '2026*', type: 'line', data: [33,34,35,36,37,55,50,null,null,null,null,null], smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { color: '#7030A0', width: 2.5, type: 'dotted' }, itemStyle: { color: '#7030A0' } }
      ]
    });
  }

  // 图2：品牌份额变化趋势
    function chartNsBrandShare() {
    var el = document.getElementById('chart-ns-brandshare');
    if (!el) return;
    el.innerHTML = '';
    el.removeAttribute('_echarts_instance_');
    var c = echarts.init(el, null, { renderer: 'svg' });
    registry.push(c);
    var yms = ['2024.05','2024.06','2024.07','2024.08','2024.09','2024.10','2024.11','2024.12','2025.01','2025.02','2025.03','2025.04','2025.05','2025.06','2025.07'];
    var palette = ['#4472C4','#ED7D31','#A5A5A5','#FFC000','#7030A0','#5B9BD5','#C0C0C0'];
    var brands = ['roborock','iRobot','eufy','ECOVACS','dreame','Shark','其他'];
    var data = {
      'roborock': [30,33,35,32,30,33,35,32,30,29,28,29,30,31,30],
      'iRobot':   [32,28,25,22,20,18,16,15,14,14,13,13,13,14,13],
      'eufy':     [20,18,15,12,10,9,8,8,7,7,7,7,7,7,7],
      'ECOVACS':  [8,9,10,9,8,7,7,6,6,6,6,6,6,6,6],
      'dreame':   [3,4,5,6,7,8,9,10,10,11,11,11,11,11,11],
      'Shark':    [10,9,9,10,10,9,9,10,10,9,9,10,10,9,9],
      '其他':      [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]
    };
    c.setOption({
      animation: false,
      tooltip: tip({ trigger: 'axis', valueFormatter: function(v) { return v == null ? '-' : v.toFixed(1) + '%'; } }),
      legend: { data: brands, top: 0, right: 10, textStyle: { color: STYLE.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 8, itemGap: 8 },
      grid: { top: 36, left: 50, right: 30, bottom: 40 },
      xAxis: Object.assign({ type: 'category', data: yms, axisLabel: { fontSize: 10, color: STYLE.muted, rotate: 35 } }, axisBase()),
      yAxis: Object.assign({ type: 'value', name: '份额(%)', axisLabel: { formatter: function(v) { return v + '%'; } } }, axisBase()),
      series: brands.map(function(b, i) {
        return { name: b, type: 'line', data: data[b], smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { color: palette[i], width: 2.5 }, itemStyle: { color: palette[i] } };
      })
    });
  }

  function renderAll(D, currency, currencyName, siteName) {
    readStyle();
    CUR = currency || '$';
    CUR_NAME = currencyName || 'USD';
    updateCurrencyLabels();
    registry.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    registry = [];
    renderKPI(D); chartUnitsTrend(D); chartGmsTrend(D); chartYoY(D);
    chartShareTrend(D); chartGmvTrend(D); chartGmvLatest(D);
    chartRankUnits(D); chartRankGms(D); chartMmDual(D, siteName); chartMmShare(D);
    renderTable(D); renderInsights(D);
    chartNsTrend();
    chartNsOrders();
    chartNsBrandShare();
    // 渲染后延迟 resize，确保所有图表填满容器宽度
    setTimeout(function () { registry.forEach(function (c) { try { c.resize(); } catch (e) {} }); }, 50);
  }

  function renderCustom(rows, currency) {
    readStyle();
    CUR = currency || '$';
    customRegistry.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    customRegistry = [];
    if (!rows || rows.length === 0) {
      var ph = document.getElementById('custom-placeholder'); if (ph) ph.style.display = '';
      var cc = document.getElementById('custom-content'); if (cc) cc.style.display = 'none';
      var cs = document.getElementById('custom-section'); if (cs) cs.classList.remove('has-data');
      return;
    }
    var ph2 = document.getElementById('custom-placeholder'); if (ph2) ph2.style.display = 'none';
    var cc2 = document.getElementById('custom-content'); if (cc2) cc2.style.display = '';
    var cs2 = document.getElementById('custom-section'); if (cs2) cs2.classList.add('has-data');
    var headers = rows._headers || Object.keys(rows[0]);
    renderCustomChart(rows, headers); renderCustomTable(rows, headers);
  }

  function resizeAll() { registry.forEach(function (c) { try { c.resize(); } catch (e) {} }); customRegistry.forEach(function (c) { try { c.resize(); } catch (e) {} }); }

  return { renderAll: renderAll, renderCustom: renderCustom, resizeAll: resizeAll };
})();
