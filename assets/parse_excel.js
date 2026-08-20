/* 全站点看板 - 浏览器端 Excel 解析（US + EU 多站点支持） */
/* 依赖: SheetJS (xlsx.full.min.js) */
/*
  Excel 工作表命名规则：
  - 不带前缀的原始名称（大盘数据 / 竞对GMV和市占 / Brand_Share_Monitor）→ 自动归入 US
  - US_大盘数据 / US_竞对GMV和市占 / US_Brand_Share_Monitor  → US
  - EU5_大盘数据 等 → EU5
  - DE_大盘数据 / FR_大盘数据 / IT_ / ES_ / UK_ → 各国
  - {站点}_Custom → 自定义数据
*/
window.ALL_SITES = ['US', 'EU5', 'DE', 'FR', 'IT', 'ES', 'UK'];

window.parseExcelWorkbookMulti = function (wb) {
  var MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  var result = {
    countries: {},
    custom: {},
    availableCountries: []
  };

  var sheetNames = Object.keys(wb.Sheets);
  var siteSheetMap = {};

  sheetNames.forEach(function (sname) {
    var site = null;
    var type = null;

    // 检测站点前缀（EU5 需在 EU 之前匹配，避免 EU5_ 被 EU 截断）
    var prefixes = [
      { code: 'US',  prefix: 'US_' },
      { code: 'EU5', prefix: 'EU5_' },
      { code: 'DE',  prefix: 'DE_' },
      { code: 'FR',  prefix: 'FR_' },
      { code: 'IT',  prefix: 'IT_' },
      { code: 'ES',  prefix: 'ES_' },
      { code: 'UK',  prefix: 'UK_' },
    ];

    for (var i = 0; i < prefixes.length; i++) {
      if (sname.indexOf(prefixes[i].prefix) === 0) {
        site = prefixes[i].code;
        type = detectSheetType(sname.slice(prefixes[i].prefix.length));
        break;
      }
    }

    // 不带前缀 → 归入 US
    if (!site) {
      type = detectSheetType(sname);
      if (type) site = 'US';
    }

    if (site && type) {
      if (!siteSheetMap[site]) siteSheetMap[site] = {};
      siteSheetMap[site][type] = sname;
    }
  });

  function detectSheetType(name) {
    if (name.indexOf('大盘数据') >= 0) return 'market';
    if (name.indexOf('竞对') >= 0 || name.indexOf('GMV') >= 0) return 'competitor';
    if (name.indexOf('Brand_Share') >= 0 || name.indexOf('Brand') >= 0) return 'brand';
    if (name.indexOf('Custom') >= 0 || name.indexOf('自定义') >= 0) return 'custom';
    return null;
  }

  // 解析每个站点的数据
  Object.keys(siteSheetMap).forEach(function (site) {
    var sheets = siteSheetMap[site];
    var data = parseSingleSite(wb, sheets, MONTHS);
    if (data) {
      result.countries[site] = data;
      result.availableCountries.push(site);
    }
  });

  // 解析自定义数据
  sheetNames.forEach(function (sname) {
    var site = null;
    var allPrefixes = ['US_', 'EU5_', 'DE_', 'FR_', 'IT_', 'ES_', 'UK_'];
    for (var i = 0; i < allPrefixes.length; i++) {
      if (sname.indexOf(allPrefixes[i]) === 0) {
        var rest = sname.slice(allPrefixes[i].length);
        if (rest.indexOf('Custom') >= 0 || rest.indexOf('自定义') >= 0) {
          site = allPrefixes[i].slice(0, -1);
        }
        break;
      }
    }
    if (!site && (sname.indexOf('Custom') >= 0 || sname.indexOf('自定义') >= 0)) {
      site = 'US';
    }
    if (site) {
      var customData = parseCustomSheet(wb.Sheets[sname]);
      if (customData && customData.length > 0) {
        result.custom[site] = customData;
      }
    }
  });

  return result;
};

// 解析单个站点数据
function parseSingleSite(wb, sheets, MONTHS) {
  var out = {
    months: MONTHS,
    market: { units: {}, gms: {} },
    mammotion: { units: {}, gms: {}, share_u: {}, share_g: {} },
    competitor: {},
    ranking: {}
  };
  var hasData = false;

  function cell(ws, r, c) {
    var addr = XLSX.utils.encode_cell({ r: r, c: c });
    var x = ws[addr];
    if (!x) return undefined;
    return x.v;
  }
  function num(v) { return (typeof v === 'number') ? v : (v == null ? null : (isNaN(+v) ? null : +v)); }
  function readActualsUntilNone(ws, rowIdx, startCol, maxN, skipNone) {
    maxN = maxN || 12;
    var vals = [];
    for (var c = startCol; c < startCol + maxN; c++) {
      var v = num(cell(ws, rowIdx, c));
      if (v === null || v === 0) {
        if (skipNone) { vals.push(null); continue; }
        break;
      }
      vals.push(v);
    }
    if (skipNone) { while (vals.length && vals[vals.length - 1] === null) vals.pop(); }
    return vals;
  }
  function findLabelRow(ws, col, kw, startR, endR) {
    startR = startR || 0; endR = endR || 40;
    for (var r = startR; r <= endR; r++) {
      var cv = cell(ws, r, col);
      if (cv != null && String(cv).indexOf(kw) >= 0) return r;
    }
    return -1;
  }

  // 大盘数据
  if (sheets.market && wb.Sheets[sheets.market]) {
    var ws = wb.Sheets[sheets.market];
    var metricDefs = [
      { key: 'units', labelCol: 0, baseCol: 2, totalCol: 1 },
      { key: 'gms', labelCol: 15, baseCol: 17, totalCol: 16 }
    ];
    metricDefs.forEach(function (md) {
      ['2024','2025','2026'].forEach(function (yr) {
        var r = findLabelRow(ws, md.labelCol, yr);
        if (r < 0) return;
        out.market[md.key][yr] = readActualsUntilNone(ws, r + 1, md.baseCol);
        out.market[md.key][yr + '_total'] = num(cell(ws, r, md.totalCol));
        if (yr === '2026') {
          var yr2 = findLabelRow(ws, md.labelCol, 'YOY-大盘');
          if (yr2 >= 0) out.market[md.key]['yoy'] = readActualsUntilNone(ws, yr2, md.baseCol);
        }
        hasData = true;
      });
    });

    var mmDefs = [
      { key: 'units', labelCol: 0, baseCol: 2, totalCol: 1 },
      { key: 'gms', labelCol: 15, baseCol: 17, totalCol: 16 }
    ];
    mmDefs.forEach(function (md) {
      ['2024','2025','2026'].forEach(function (yr) {
        var r = findLabelRow(ws, md.labelCol, yr, 11);
        if (r < 0) return;
        out.mammotion[md.key][yr] = readActualsUntilNone(ws, r + 1, md.baseCol);
        out.mammotion[md.key][yr + '_total'] = num(cell(ws, r, md.totalCol));
        hasData = true;
      });
    });

    var shDefs = [
      { key: 'share_u', labelCol: 0, baseCol: 2, yearCol: 1 },
      { key: 'share_g', labelCol: 15, baseCol: 17, yearCol: 16 }
    ];
    shDefs.forEach(function (sd) {
      ['2024','2025','2026'].forEach(function (yr) {
        var r = findLabelRow(ws, sd.labelCol, yr, 21);
        if (r < 0) return;
        // 市占数据使用 skipNone=true，因为年度市占格可能为空(2026年)
        out.mammotion[sd.key][yr] = readActualsUntilNone(ws, r, sd.baseCol, 12, true);
        var ys = num(cell(ws, r, sd.yearCol));
        if (ys !== null) out.mammotion[sd.key][yr + '_year'] = ys;
      });
    });
  }

  // 竞对GMV和市占
  var brands = ['ANTHBOT','ECOVACS','eufy','Husqvarna','Mammotion','Mowrator','NAVIMOW','SUNSEEKER','WORX','YARBO'];
  if (sheets.competitor && wb.Sheets[sheets.competitor]) {
    ws = wb.Sheets[sheets.competitor];
    var shareRows = [], gmvRows = [];
    for (var r = 2; r < 60; r++) {
      var ym = cell(ws, r, 0);
      if (ym == null) break;
      ym = parseInt(ym, 10);
      if (isNaN(ym)) continue;
      var sr = { ym: ym }, gr = { ym: ym };
      for (var i = 0; i < brands.length; i++) {
        sr[brands[i]] = num(cell(ws, r, 1 + i)) || 0;
        gr[brands[i]] = num(cell(ws, r, 14 + i)) || 0;
      }
      sr['大盘'] = num(cell(ws, r, 11));
      shareRows.push(sr); gmvRows.push(gr);
      hasData = true;
    }
    out.competitor.brands = brands;
    out.competitor.share = shareRows;
    out.competitor.gmv = gmvRows;
    out.competitor.ytd_25_share = num(cell(ws, 2, 26));
    out.competitor.ytd_26_share = num(cell(ws, 3, 26));
  }

  // 品牌YTD排名
  if (sheets.brand && wb.Sheets[sheets.brand]) {
    ws = wb.Sheets[sheets.brand];
    var yu = [], yg = [];
    for (var r = 1; r < 200; r++) {
      var b1 = cell(ws, r, 0), u = num(cell(ws, r, 1));
      var b2 = cell(ws, r, 2), g = num(cell(ws, r, 3));
      if (b1 != null && u != null) yu.push({ brand: b1, units: u });
      if (b2 != null && g != null) yg.push({ brand: b2, gms: g });
      if (b1 == null && b2 == null) break;
    }
    out.ranking.ytd_units = yu;
    out.ranking.ytd_gms = yg;
    if (yu.length > 0 || yg.length > 0) hasData = true;
  }

  return hasData ? out : null;
}

// 解析自定义工作表
function parseCustomSheet(ws) {
  var rows = [];
  if (!ws || !ws['!ref']) return rows;
  var range = XLSX.utils.decode_range(ws['!ref']);
  if (range.e.r < 1) return rows;

  var headers = [];
  for (var c = range.s.c; c <= range.e.c; c++) {
    var addr = XLSX.utils.encode_cell({ r: 0, c: c });
    var cell = ws[addr];
    headers.push(cell ? String(cell.v) : ('列' + (c + 1)));
  }

  for (var r = 1; r <= range.e.r; r++) {
    var row = {};
    var hasVal = false;
    for (var c = 0; c < headers.length; c++) {
      var addr = XLSX.utils.encode_cell({ r: r, c: c });
      var cell = ws[addr];
      var v = cell ? cell.v : null;
      row[headers[c]] = v;
      if (v != null && v !== '') hasVal = true;
    }
    if (hasVal) rows.push(row);
  }

  rows._headers = headers;
  return rows;
}
