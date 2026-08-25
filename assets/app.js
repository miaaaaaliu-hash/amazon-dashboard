/* 全站点看板 - 应用编排：站点切换 + 数据加载 + 拖拽刷新 + 在线同步 */

/* ============================================================
   ★ 在线数据源配置 ★
   将下面的 URL 替换为你的 data.json 在线地址即可启用同步。
   - 留空 '' → 使用内嵌数据 + Excel 拖拽（离线模式）
   - 填写 URL → 每次打开自动拉取最新数据（在线模式）
   支持的托管：GitHub Gist raw URL、GitHub Pages、
   阿里云 OSS / 腾讯 COS 公开链接、任何 CORS 允许的 JSON URL
   ============================================================ */
var DATA_SOURCE_URL = 'https://gist.githubusercontent.com/miaaaaaliu-hash/eacf576016095d87eb32cb1358217553/raw/data.json';

(function () {
  // 站点顺序：US → EU5 → DE → FR → IT → ES → UK
  var SITES = ['US', 'EU5', 'DE', 'FR', 'IT', 'ES', 'UK'];

  var SITE_INFO = {
    US:  { name: '美国',     currency: '$',  currencyName: 'USD', color: 'var(--c-us)',  border: false },
    EU5: { name: 'EU5合计',  currency: '€',  currencyName: 'EUR', color: 'var(--c-eu5)', border: false },
    DE:  { name: '德国',     currency: '€',  currencyName: 'EUR', color: 'var(--c-de)',  border: true },
    FR:  { name: '法国',     currency: '€',  currencyName: 'EUR', color: 'var(--c-fr)',  border: false },
    IT:  { name: '意大利',   currency: '€',  currencyName: 'EUR', color: 'var(--c-it)',  border: false },
    ES:  { name: '西班牙',   currency: '€',  currencyName: 'EUR', color: 'var(--c-es)',  border: false },
    UK:  { name: '英国',     currency: '£',  currencyName: 'GBP', color: 'var(--c-uk)',  border: false }
  };

  var store = {
    currentSite: 'US',
    countries: {},
    custom: {},
    availableSites: []
  };

  var statusEl = document.getElementById('data-status');
  var dropEl = document.getElementById('dropzone');
  var countryBar = document.getElementById('country-bar');

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'status-pill ' + (kind || '');
  }

  function fmtPeriod(D) {
    var rows = (D.competitor && D.competitor.share) || [];
    if (!rows.length) return '—';
    var first = String(rows[0].ym), last = String(rows[rows.length - 1].ym);
    return first.slice(0, 4) + '.' + first.slice(4) + ' — ' + last.slice(0, 4) + '.' + last.slice(4);
  }

  // 渲染站点选择器
  function renderSiteTabs() {
    if (!countryBar) return;
    var html = '<span class="cb-label">切换站点：</span>';
    SITES.forEach(function (site) {
      var info = SITE_INFO[site] || {};
      var hasData = store.availableSites.indexOf(site) >= 0;
      var isActive = store.currentSite === site;
      var dotStyle = 'background:' + (info.color || 'var(--muted)');
      if (info.border) dotStyle += ';border:1px solid #ccc';
      html += '<span class="country-tab' + (isActive ? ' active' : '') + (!hasData ? ' empty' : '') + '"' +
        ' data-site="' + site + '"' +
        (hasData ? '' : ' title="暂无数据，拖入Excel后自动激活"') + '>' +
        '<span class="dot" style="' + dotStyle + '"></span>' +
        (info.name || site) +
        (hasData ? '' : ' <span class="count">(空)</span>') +
        '</span>';
    });
    countryBar.innerHTML = html;

    var tabs = countryBar.querySelectorAll('.country-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (tab.classList.contains('empty')) return;
        var site = tab.getAttribute('data-site');
        switchSite(site);
      });
    });
  }

  // 切换站点
  function switchSite(site) {
    store.currentSite = site;
    var D = store.countries[site];
    var info = SITE_INFO[site] || {};
    // 非季节性产品大盘趋势一览：仅 US 显示
    var nsSection = document.getElementById('nonseasonal-section');
    if (nsSection) nsSection.style.display = (site === 'US') ? '' : 'none';
    if (!D) {
      setStatus('当前站点 ' + (info.name || site) + ' 暂无数据', 'warn');
      return;
    }
    // 渲染主看板（传入货币信息和站点名称）
    DashboardCharts.renderAll(D, info.currency, info.currencyName, site);
    // 渲染自定义板块
    var customData = store.custom[site];
    DashboardCharts.renderCustom(customData, info.currency);
    // 更新选择器高亮
    renderSiteTabs();
    setStatus((info.name || site) + ' · ' + (info.currencyName || '') + ' · 数据区间：' + fmtPeriod(D), 'ok');
    // 延迟 resize 确保图表填满容器
    setTimeout(function () { DashboardCharts.resizeAll(); }, 150);
  }

  // 应用多站点数据
  function applyMultiSiteData(result, source) {
    if (!result || !result.countries) {
      setStatus('未检测到有效数据', 'error');
      return;
    }

    Object.keys(result.countries).forEach(function (site) {
      store.countries[site] = result.countries[site];
      if (store.availableSites.indexOf(site) < 0) {
        store.availableSites.push(site);
      }
    });
    if (result.custom) {
      Object.keys(result.custom).forEach(function (site) {
        store.custom[site] = result.custom[site];
      });
    }

    renderSiteTabs();

    // 自动选择第一个可用站点
    var firstAvailable = null;
    for (var i = 0; i < SITES.length; i++) {
      if (store.availableSites.indexOf(SITES[i]) >= 0) {
        firstAvailable = SITES[i];
        break;
      }
    }

    if (firstAvailable) {
      switchSite(firstAvailable);
    } else {
      setStatus('未检测到有效数据，请检查Excel工作表命名', 'error');
    }
  }

  // 在线拉取数据
  function fetchOnlineData() {
    return new Promise(function (resolve, reject) {
      if (!DATA_SOURCE_URL) { reject(new Error('未配置 DATA_SOURCE_URL')); return; }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', DATA_SOURCE_URL + (DATA_SOURCE_URL.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now(), true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (e) { reject(e); }
        } else {
          reject(new Error('HTTP ' + xhr.status));
        }
      };
      xhr.onerror = function () { reject(new Error('网络错误')); };
      xhr.timeout = 10000;
      xhr.ontimeout = function () { reject(new Error('请求超时')); };
      xhr.send();
    });
  }

  // 启动：优先在线拉取，失败则回退内嵌数据
  function bootstrap() {
    var refreshBtn = document.getElementById('refresh-btn');

    if (DATA_SOURCE_URL) {
      if (refreshBtn) refreshBtn.style.display = '';
      setStatus('正在从在线数据源拉取…', 'loading');
      fetchOnlineData().then(function (data) {
        if (data && data.countries && Object.keys(data.countries).length > 0) {
          applyMultiSiteData(data, '在线数据');
          var ts = data.updatedAt ? ' · 更新于 ' + data.updatedAt : '';
          setStatus('✓ 在线数据已加载' + ts, 'ok');
        } else {
          loadEmbeddedOrWait();
        }
      }).catch(function (err) {
        console.warn('在线拉取失败：', err.message);
        setStatus('⚠ 在线拉取失败，使用离线数据：' + err.message, 'warn');
        loadEmbeddedOrWait();
      });
    } else {
      loadEmbeddedOrWait();
    }
  }

  // 回退：从内嵌数据加载
  function loadEmbeddedOrWait() {
    if (typeof __EMBEDDED_DATA__ !== 'undefined' && __EMBEDDED_DATA__) {
      var data = (typeof __EMBEDDED_DATA__ === 'string') ? JSON.parse(__EMBEDDED_DATA__) : __EMBEDDED_DATA__;
      if (data.countries && Object.keys(data.countries).length > 0) {
        applyMultiSiteData(data, '内置数据');
      } else if (data.market) {
        store.countries['US'] = data;
        store.availableSites = ['US'];
        renderSiteTabs();
        switchSite('US');
      } else {
        renderSiteTabs();
        setStatus('等待数据 · 请拖入 Excel 文件', 'warn');
      }
    } else {
      renderSiteTabs();
      setStatus('等待数据 · 请拖入 Excel 文件', 'warn');
    }
  }

  // 拖拽 Excel 刷新
  function handleFile(file) {
    if (!/\.xlsx?$/i.test(file.name)) { setStatus('请拖入 .xlsx 文件', 'error'); return; }
    setStatus('正在解析 ' + file.name + ' …', 'loading');
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, { type: 'array' });
        var result = window.parseExcelWorkbookMulti(wb);
        applyMultiSiteData(result, file.name);
      } catch (err) {
        console.error(err);
        setStatus('解析失败：' + err.message, 'error');
      }
    };
    reader.onerror = function () { setStatus('文件读取失败', 'error'); };
    reader.readAsArrayBuffer(file);
  }

  if (dropEl) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove('over'); });
    });
    dropEl.addEventListener('drop', function (e) {
      var files = e.dataTransfer.files;
      if (files && files.length) handleFile(files[0]);
    });
    var fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files.length) handleFile(e.target.files[0]);
      });
    }
  }

  // 绑定在线刷新按钮
  var refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', function () {
    if (!DATA_SOURCE_URL) { setStatus('未配置在线数据源 URL', 'error'); return; }
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ 拉取中…';
    setStatus('正在从在线数据源拉取最新数据…', 'loading');
    fetchOnlineData().then(function (data) {
      if (data && data.countries && Object.keys(data.countries).length > 0) {
        store.countries = {};
        store.custom = {};
        store.availableSites = [];
        applyMultiSiteData(data, '在线刷新');
        var ts = data.updatedAt ? ' · 更新于 ' + data.updatedAt : '';
        setStatus('✓ 数据已刷新' + ts, 'ok');
      } else {
        setStatus('在线数据为空', 'warn');
      }
    }).catch(function (err) {
      setStatus('刷新失败：' + err.message, 'error');
    }).then(function () {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 在线刷新';
    });
  });

  window.addEventListener('resize', function () { DashboardCharts.resizeAll(); });

  if (window.echarts) { bootstrap(); }
  else { window.addEventListener('load', bootstrap); }
})();
