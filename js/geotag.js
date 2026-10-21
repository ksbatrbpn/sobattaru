/* SOBAT TARU — Foto & PDF Geotag (diadaptasi dari Bale Ruang NTB v3)
   Kamera layar penuh dengan akurasi GPS langsung, arah kompas, cap koordinat pada foto,
   hingga 4 foto per laporan, foto dari galeri (data GPS EXIF), dan laporan PDF A4 yang rapi. */
(function () {
  'use strict';
  var MAX_PHOTOS = 4, GOOD = 10, FAIR = 30;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch (e) { return ''; } }

  // ---------- Koordinat ----------
  // TM-3 DGN95 (k0 0,9999, FE 200.000, FN 1.500.000). Pulau Sumbawa = zona 50.2, selain itu 50.1.
  function tm3(lon, lat, regency) {
    var name = String(regency || '').trim().toLowerCase().replace(/^(kabupaten|kab\.)\s*/, ''),
      east = ['sumbawa barat', 'sumbawa', 'dompu', 'bima', 'kota bima'].indexOf(name) >= 0 || lon >= 117,
      zone = east ? '50.2' : '50.1', cm = east ? 118.5 : 115.5, a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = .9999,
      phi = lat * Math.PI / 180, lam = (lon - cm) * Math.PI / 180, sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi),
      n = a / Math.sqrt(1 - e2 * sin * sin), t = tan * tan, c = ep2 * cos * cos, A = cos * lam, e4 = e2 * e2, e6 = e4 * e2,
      m = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) - (35 * e6 / 3072) * Math.sin(6 * phi));
    return { zone: zone,
      x: r3(200000 + k0 * n * (A + (1 - t + c) * Math.pow(A, 3) / 6 + (5 - 18 * t + t * t + 72 * c - 58 * ep2) * Math.pow(A, 5) / 120)),
      y: r3(1500000 + k0 * (m + n * tan * (A * A / 2 + (5 - t + 9 * c + 4 * c * c) * Math.pow(A, 4) / 24 + (61 - 58 * t + t * t + 600 * c - 330 * ep2) * Math.pow(A, 6) / 720))) };
  }
  function dms(v, pos, neg) { var h = v < 0 ? neg : pos, a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60; return d + '°' + pad(m) + "'" + s.toFixed(2).replace('.', ',') + '"' + h; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function idNum(n) { return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
  var DIRS = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
  // Kompas HP mengacu ke utara magnetis; dikoreksi deklinasi magnetis NTB (± 1° ke timur, perkiraan WMM 2025)
  // sehingga arah yang dicatat mengacu ke UTARA SEJATI (utara geografis).
  var DECL = 1.0, EXACT_TOL = 2;
  function toTrue(mag) { return ((mag + DECL) % 360 + 360) % 360; }
  var CARD = ['Utara', 'Timur', 'Selatan', 'Barat'];
  function exactCardinal(h) { if (h == null) return null; var k = Math.round(h / 90) % 4, d = Math.abs(((h - k * 90) + 540) % 360 - 180); return d <= EXACT_TOL ? CARD[k] : null; }
  function dirName(h) { return DIRS[Math.round(((h % 360) + 360) % 360 / 45) % 8]; }
  function accClass(acc) { return acc == null ? 'none' : acc <= GOOD ? 'good' : acc <= FAIR ? 'fair' : 'poor'; }
  function accText(acc) { return acc == null ? 'GPS tidak tersedia' : '± ' + Math.max(1, Math.round(acc)) + ' m'; }

  // ---------- Administrasi (data batas desa NTB, cadangan alamat internet) ----------
  function inRing(pt, ring) { var x = pt[0], y = pt[1], hit = false; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) { var a = ring[i], b = ring[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit; } return hit; }
  function contains(g, lon, lat) { var ps = g && g.type === 'Polygon' ? [g.coordinates] : g && g.type === 'MultiPolygon' ? g.coordinates : []; for (var p = 0; p < ps.length; p++) { var r = ps[p] || []; if (!r.length || !inRing([lon, lat], r[0])) continue; var hole = false; for (var h = 1; h < r.length; h++) if (inRing([lon, lat], r[h])) { hole = true; break; } if (!hole) return true; } return false; }
  function adminAt(lon, lat) {
    var local = typeof window.ntbAdminLookup === 'function'
      ? window.ntbAdminLookup(lon, lat, contains).then(function (fs) { var a = fs && fs[0] && fs[0].properties; return a ? { village: a.WADMKD || a.DESA || a.NAMOBJ || '', district: a.WADMKC || a.KECAMATAN || '', regency: a.WADMKK || a.KAB_KOTA || '', province: a.WADMPR || 'Nusa Tenggara Barat', source: 'Batas Desa/Kelurahan NTB' } : null; }).catch(function () { return null; })
      : Promise.resolve(null);
    return local.then(function (r) {
      if (r && r.village) return r;
      var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=16&lat=' + lat + '&lon=' + lon;
      return Promise.race([fetch(url, { headers: { 'Accept-Language': 'id' } }).then(function (x) { return x.json(); }), new Promise(function (_, rej) { setTimeout(rej, 7000); })])
        .then(function (d) { var a = d.address || {}; return { village: a.village || a.hamlet || a.suburb || a.neighbourhood || '', district: a.city_district || a.district || a.subdistrict || a.town || '', regency: a.county || a.city || '', province: a.state || '', source: 'OpenStreetMap' }; })
        .catch(function () { return { village: '', district: '', regency: '', province: '', source: '' }; });
    });
  }
  // ---------- Elevasi (meter di atas permukaan laut) ----------
  // Undulasi geoid EGM96 wilayah Indonesia (95–141 BT, 11 LS–6 LU, grid 0,5°, satuan desimeter).
  var GEOID_B64 = 'Iv4y/kv+af53/nz+kf6h/rL+zv7i/vH+/f4I/x3/Nf9F/1j/dv+a/6z/t/+w/63/t//C/8v/1//o//T//v8NABsAJAAyADcALgApACsAOgBIAFcAbAB7AIYAkgCdAKsAsADAAOQA/AAPAR8BIgEjASwBKgE4AVgBcAGHAaABtgHJAdYB4AHmAekB9AEIAhkCIgIvAjoCRQJNAk8CSwJQAloCZwJvAmwCcgJ2An4CiQKPApQClwKVApsCKf47/lD+Zf53/oH+l/6p/rj+1f7u/v3+CP8S/yX/QP9U/2f/gf+l/77/1v/P/7r/vf+//8L/yf/W/9v/3P/t/wQAFAAjAC4AOwBCAEMATwBUAF4AcAB8AIcAlACfALMAxQDqAB4BKgEmASkBHAEKARwBJwEpATwBVgFyAY0BqgHDAdcB5gHwAfUB/wEOAhwCJgIzAj8CSwJYAlwCWQJfAmcCeAJ/AngCegJ/AocCkAKbAqUCqAKiAqsCK/5D/lP+ZP5+/ov+nv6x/sD+2/71/gv/GP8i/zD/Sv9g/3X/j/+u/8T/1//R/7n/sv+w/77/zf/b/+T/6v/6/wkAHwAwAD8AYQBwAGYAZwBuAHkAiQCYAKMArwDBAOgAEAFAAWwBbwFQAS0BEAH7AA0BMQFNAVEBSwFWAWkBhAGkAcAB0wHlAfIB+wEKAhoCKQI2AkICTQJbAmICZAJpAnQChwKJAoICggKJApACmAKjAq0CtAKzArwCMf5N/lP+Zv6J/pr+rf6+/sz+4/78/hT/KP84/0T/W/9w/4L/l/+t/7z/v/+1/6r/sf/A/9j/6//8/wQAEwAhAB8ALQBKAGQAhgCbAJoAnwC0AMwA4QDvAP0AAgEHASoBVAF9AY0BgwFgATcBGgEJARMBOwFtAX8BcgFnAWABYQFzAYYBmAGzAdIB5wH6AQwCIQIyAjwCSQJcAmUCZwJsAnwCkQKSAo8CjwKWAp8CpgKrArYCwALAAsYCN/5T/lf+aP6K/qX+vf7N/tn+7f4D/xn/Mv9J/1j/bv9//4v/nP+l/6L/n/+m/7T/xf/W/+T/8P8KACUASABoAHIAfwCbALkA0ADkAPIA/QATASQBMwFBAVwBXgFNAVYBaAGBAY0BiAF3AWsBWgFIAUMBVgF1AZEBpAGnAaIBkQF2AVoBVQFyAZoBtgHRAewBBQIgAjMCQgJWAmQCbAJ1AoUClgKbApkCmQKcAqMCrAKxAroCwQLDAsoCO/5P/lr+bv6P/q7+yf7d/ur+/P4O/yH/Of9S/2T/eP+H/5D/lv+R/4j/lP+u/8H/0f/q/xIAOgBlAIsArQDJANgA4QDuAAcBGAEnATsBQwFYAV0BWgFfAXMBfwF8AYIBiAGQAZsBngGTAZEBlAGXAYkBjwGjAbEBwQHJAdEBwwGeAXIBYAFzAYkBmgGyAdAB5gH8ARoCOAJWAmcCcQJ+Ao8CmgKeAqECowKmAqkCsgK9AsICwgLFAssCQP5O/lz+fP6f/rP+0P7q/vn+Dv8d/y//Rf9d/23/df98/4D/hv+I/4v/mP+8/+b/EwBLAHwAoAC/ANUA6wD3AP0AAwEJASQBMAE4AUwBSgFUAVEBTwFZAWMBbAFwAXEBdQF3AXsBfgF7AYYBnQGzAbEBuQHFAccBygHTAdwB1gHIAbMBpgGhAaEBtgHHAcsB0wHjAf4BJQJOAmYCeAKJApgCoAKgAqgCrAKrAq8CswK6AsECxgLLAtICQv5U/mT+h/6u/rv+2P75/gv/Jf8z/0H/Uf9o/3H/b/91/4L/kf+P/5b/rf/3/1UAlwDDAMwAzgDcAO0AAAH+APgA/wAIARkBJgEvAUEBSwFXAVsBZwF3AYEBhgGMAYoBgQF3AYEBlwGqAboBxwHHAcEBygHNAdMB2gHkAecB4wHgAdoB2AHSAcQByAHQAcsBxgHTAegBDAI8AmACfwKVAp0CoQKlAq8CtQK1ArYCuQK+AsUCzALRAtgCQ/5f/nP+iP6u/sT+3v4B/xf/OP9I/0//WP9l/2v/dP+K/5z/o/+c/8T/AwBMAJ0AyQDbANkA2ADfAOcA9AD4APoABwEXASUBNwFFAVABYgFwAX0BiwGQAZgBnwGtAbgBugGwAbwB1wHqAeYB4QHiAdsB3wHmAfEB9gH4AfcB9gH1Ae4B7wH0Ae8B3gHFAa4BogG0Ac0B6AEbAlQCdQKNAp8CowKpArQCugK7ArgCuQK9AsYC0gLYAt0CRf5j/oD+lv66/s7+5v4H/yH/Rv9Y/1z/W/9b/2v/hv+X/57/tP/c/xgAUwB7AKUAvADBAMoA0gDcAOcA8wAEAQ8BGQEpATgBRgFWAWQBcwGDAZIBnQGkAa8BugHFAc4B1QHNAdoB4wHqAesB6AH8AfoB8gH5AQQCDAIMAg0CDwIOAggCBAIAAgICAALYAZYBbAGHAbkB2AH2ASsCXwKCApgCogKqArcCuwLBAsMCvwLCAssC1QLbAt8CTP5t/ov+pP7H/tf+8f4Q/yn/SP9Z/1z/Wf9i/4P/mf+X/57/2P8lAEwAbQCMAKkAugDEANQA4QDvAPsABwETARwBKQE3AUYBVAFjAXMBgAGPAZwBpgGxAbkBxwHQAdMB2AHaAfIB8gHqAf0BAgIMAgkCDAIiAigCJwIiAh4CHQIgAh4CFwIQAg0CCAL1AasBXQFsAbQB+QENAg0CPwJ/ApUCoAKoArUCvQLBAr0CtgK/As0C2QLjAuoCV/5+/pr+rP7Q/uf+AP8d/zT/SP9S/07/Wv98/6D/rP+n/8X/FgBYAHAAhwCbAK4AvwDPAN0A6wD6AAYBEwEgASsBNwFBAU4BXQFrAXsBjgGfAagBswG+AcYB1AHeAd8B6QH9AQgC/gH3ARECJQIkAiICKQI5AjICLgIxAi8CMgI3AjoCMwIqAiQCFQIOAs0BdgGBAcEBEwJEAicCLwJ8Ap4CngKlArgCxgLHAr4CvQLEAs8C3QL0Ag8DYf6D/qP+tf7X/vT+Dv8t/0D/SP9E/0f/a/+P/6f/v//Y/wkATABzAIQAkwCfALQAxQDWAOUA8gAAAQ8BFgEhATEBPAFKAVoBaQF6AYsBmwGrAboBwwHLAdUB1AHXAeEB9wEaAhwCFAIYAigCOwI+AjsCLgIuAjACMwI8Aj8CRgJDAkMCQQI2Ai4CLAIkAukBsAHBAekBGAJLAkYCPgJ+AqMCnAKjArECuwK5ArUCvgLMAuQC9gIHAysDb/6N/q3+wf7h/gH/Hf82/0v/Tf9B/1n/hf+b/7j/6P8gAFIAawB6AIwAmQCoALsAzADdAOsA+QAEARMBHQEpATcBRAFTAWMBcwGHAZkBpgGyAccB1QHdAeQB2gHQAd4B/QEeAikCIQIoAj4CSwJPAkcCKQIlAjYCOwJBAkYCRgJGAkcCQgJHAkQCRgI6AhUCAwIGAg8CLgJbAmwCawKJAqgCswK8AsUC3wLzAv4CDQMSAxMDCwMIAyADef6V/rX+z/7r/g7/Jv81/0b/Q/9F/3L/mP+u/+T/IABKAGUAcQB+AI4AmACsAMEA1gDkAO8A/wAOARsBJgEyAUABUAFhAXQBgwGVAaQBrQG3AcsB4QHtAfMB8AHhAeEB/gEhAjcCLQI+AmUCYAJWAlECNwIwAkQCSQJHAk0CSgJMAlUCTwJYAk8CQwJCAj4CNgImAiECUgKMAp0CnAKiArwC4QL0AgQDKAM9AzcDMgMqAxQDBQMFAxMDgf6Z/rz+2v7v/hH/Kv8u/y3/Nf9Z/4f/oP/E/wYAQABVAGEAcgCBAI4AmwCxAMYA1wDmAPMAAwESASIBLwE9AU0BXgFuAYEBjQGdAaYBrAG/AdcB6wH6AQYCCgIEAvoBGQJIAk4CPwJaAnsCbAJhAlwCQwI6AkkCTgJOAlkCXgJTAlcCYAJjAlYCTAJXAlsCPgIrAjYCcwKkAqoCtAK4ArwCzQLhAgEDLANBAy0DEwMGA/UC9wL4Av4Cjv6n/sf+5f71/hL/Kv8i/x7/Pv9q/4D/nv/h/yoATABUAGQAeQCIAJQAowC3AMkA2gDtAPsACgEZASkBOgFGAVQBZQF3AYgBlgGkAa8BtgHDAdwB9QEAAg4CGgIZAgkCMAJtAl8CTAJkAncCZgJQAkMCOQJDAlICVgJYAlgCWgJMAj0CQwJRAlUCVQJXAlUCSgJbAnsCoQKtAqkCrwK2Aq8CqAKzAtcC/wITAw0DAwP8AvECBAMJAwgDlv6x/s3+6P73/gv/Gv8b/y//T/9k/3//vf8MAD0ARQBMAF8AdgCMAJgApAC4AMoA2wDxAAABEQEiATIBQQFNAVsBbAF9AYwBmgGmAbgBwgHIAd4B+gEGAhUCGQIPAgkCOwJ7An0CcQJwAnECXgJIAkQCRAJJAlQCXwJsAm4CaQJeAjgCHQI1AlICYgJvAncCfwKWAqsCuQKzAqkCqwK+AsECtgKyAsEC0gLWAtkC3wLkAt4C8AL3Au4CnP64/tP+7v76/gH/Cv8s/1L/Vv9h/47/3v8hADMAOgBNAF8AdACKAJkAqQC8AM4A3wDwAAEBEgElATgBRgFTAWQBdwGKAZwBqAG1AcMBzgHcAe8B/wEIAhYCDgIAAg0COQJfAn4CjwKFAnwCZAJaAmcCZgJkAmQCbgJ6An8CcQJnAmUCUQJgAn4ClQKpArACsQK6AsICxwLDArgCuQLLAtECzgLRAtsC4ALiAu0C8gLhAsoCyALKAscCo/68/tb+9f78/vf+Df9H/17/VP9z/7H/9P8bACgAOgBOAF0AcgCEAJgAqgC+AM8A3wDuAAEBFAEpATwBSwFaAW0BgQGSAaYBsgHCAdEB2gHrAQICEwIQAhUCFgIKAg4CLQJLAnMCgAJ8ApIChwJuAmgCWAJEAi8CKQIsAiwCIQIwAmwCjAKcAq4CvAK9AsACyQLXAuAC4QLtAv0C+QLqAuMC3wLpAvMC8gLuAuoC5QLKAr8CygLPAtMCpf7C/tr+8/7y/vH+Hv9T/1r/Yv+J/8j//P8NACEANQBLAF0AbgCAAJYAqAC9AM4A3ADuAAQBFQEtAUIBUgFfAXEBiAGdAbkBxQHRAeIB7QH2AQgCGQIXAhoCJQIaAgsCKQJOAmsCaAJjAn4ChAJuAl4CLQL1Ac0BtgG5AccB3QEhAnICpgLBAsQC0QLUAtsC4wLmAv0CEwMbAx8DCwPuAvAC7wLqAuIC1ALLArwCtgK1AsEC0QLVAtgCqv7K/tn+5/7p/v/+Nf9e/2r/f/+i/9D/9v8HAB8ALABDAFcAagB/AJMApQC5AMkA2wDwAAUBFgExAUcBVgFkAXYBiQGeAbgBygHaAfABAAIIAhECHAIcAhsCKAIfAgoCHQI3AkcCUgJhAnECegJiAkMCEALpAdUBsgGkAbcB/AFtAqECtQLPAsgC2wLyAvsC+ALnAvECCwMGA/MC5QLoAvUC6gLNArcCqQKmAqYCrQK8AskC0ALWAtoCq/7M/tj+1/7d/g7/Qv9q/4P/lP+4/9j/7P/+/xQAKABAAFIAaAB9AJAAogC1AMgA3ADxAAQBGQEwAUIBUwFjAXQBhAGYAaoBxgHfAfYBDgIeAiQCJAIiAiMCIQIQAgoCGAIuAkcCVQJkAnMCdwJTAjECGwIkAh8C/AHUAdQBLwKuAtcC0gLbAt8C7wL+AgMD+wLnAtcC4ALiAuAC2gLaAtACuwKoAqYCrAKyAr0CwgLIAs0C0gLUAtMCqP7J/tP+y/7l/iL/Rv9q/43/of++/9H/4//6/xAAJQA0AEUAXQBzAIoAmwCvAMcA2wDtAAABFAEpATsBUQFjAXQBhgGcAawBxAHdAfcBEQIkAi8CNQI1AjcCKAIaAioCJAIeAkMCaAJ7AnwCcwJXAk4CUQJ4AoACXQIlAhECSAKpAucC5QLaAucC8gLuAu0C7gLuAuYC6QLkAuQC2ALHArYCsQK3ArsCvgLAAsQCxgLJAsoCzQLOAs0Cn/66/r/+xv7//jD/Q/9g/4n/qv+9/8v/4P/5/w4AIAAtAD8AVgBrAIEAlQCpAMAA1ADnAPwADgEgATIBSAFcAW8BggGXAakBvQHTAfABDQIhAjACRQJGAkECQAJBAkkCMAIXAjQCZQKAAoEChQJ3AngCeAKcArgCpQJuAkkCTQKOAsgCyALLAtQC3QLdAt4C5wLuAugC7ALoAuMC2wLRAsYCxALCAsMCxQLFAsQCxgLFAsUCxQLFAsUCj/6f/q7+zP79/hv/Nv9c/4r/sf+6/8f/3f/0/wgAGQAtAD8AUwBnAHsAjgCjALgAzgDhAPMABAEWASoBPAFRAWYBeQGMAZ8BsQHAAdkBAAIcAigCQwJNAkoCUgJJAj0CJwIVAiwCUQJnAmICYwJaAmQCbgKGAqoCuwKWAmUCRgJnApsCqgK+ArYCvQLRAt8C6ALpAukC6wLqAuMC2ALRAssCywLIAsgCxgLCAr8CwAK+Ar0CvgK+Ar4Ce/6b/r/+3v7y/gL/Lv9o/5f/tv+8/8X/2f/t//7/EAAmADkATABgAHUAhQCaALEAxgDZAOcA+AAJARwBLAFDAVcBaQF9AY0BnQGrAcMB8AEVAiICMgI9AkICRgI7Ai8CGwIOAiECNAJLAk0CTgJSAlwCbAKBAp4CwAKoAm0CMwIyAngCqwLCArUCugLUAuAC5QLiAucC5wLnAuEC1wLRAswCyQLHAsUCwQK+Ar0CugK5ArcCtQK2ArcCiv6+/t3+5f7o/vb+MP97/57/rv+1/7v/0f/m//j/CwAcAC8AQgBXAGoAegCQAKkAvgDNAN0A7wD+AA4BHQExAUUBWAFuAYcBmwGpAb0B4QEJAhsCJAIwAjwCNwIsAiICEgIVAicCMgJAAk0CWAJnAnIChgKaAqoCwwK+AoECLAIdAloCiwKuArcCvwLZAt0C4gLkAukC5gLkAt0C0gLKAscCxQLDAr8CvQK4ArYCswKxAq8CrwKuAq8CkP6x/sj+z/7i/gb/P/9y/4b/mf+q/7f/zf/h//X/BQAUACYANwBLAF4AcACFAJ8AswDDANYA5QDyAAIBEwEkATcBSwFcAXMBjQGoAcEB2QH0AQICGQIsAjYCLAIkAiMCIgItAjkCRwJQAl4CagJ6AokCmAKmArQCvQLTAqECQgIuAkgCaAKIAqICvALXAtcC3gLhAugC4QLeAtsCzwLFAsICvwK8ArcCtgKyArACrwKtAqgCpwKoAqoCb/6G/rD+zv4A/zH/RP9X/23/h/+f/7T/x//d//H/AAAOABwAKAA5AE4AYwB5AJIApQC5AMoA1QDkAPUABgEXASkBPQFQAWMBewGeAb4B0gHhAfEBFAInAiwCKAIrAi4CLQI5AkUCVAJcAmkCdQKHApECnwKqArUCtwLcArgCbwJbAmgCjQKJApcCuALNAs8C2QLTAtwC2wLbAtcCxgK+Ar0CuAK1ArMCsAKtAqoCpgKlAqICnwKgAqMCVf5+/rr+7P4f/zr/N/9J/2b/f/+X/6v/v//X/+r//P8HABIAHQAqAD4AUQBmAH4AlgCtAL4AywDbAOwA/AAOASABMwFIAVgBbQGKAakBwAHYAfEBCgIeAisCKQIqAjQCOQI+AkkCWQJkAnACegKKApMCpgKrAq4CswLcAr4CggJqAnICjAJ9ApgCtgLHAssC0gLJAtEC1gLVAtACwwK7ArkCtAKwAqwCqQKmAqMCpQKhApwCmgKZApsCT/6a/tr+CP8g/yv/NP9C/1n/dv+N/6H/tv/Q/+b/9/8BAAkAEwAeAC8AQQBXAG4AhQCeALQAwwDRAN8A7wACARYBKwE9AU8BZQF6AZQBrAHNAe0B+wERAi0COQI2AjwCTAJVAlcCWwJlAnICegKJApUCoAKkAqQCogLIAqkCagJSAkwCUwJnAp8CtALDAsUCxALAAskC0wLOAsgCvQK2ArQCrgKsAqkCpAKjAp4CngKbApcClQKTApQCXv64/tr+6/7//hr/L/87/1T/bv+C/5f/sP/O/+D/6f/0//z/BQAPAB8AMwBMAGMAdwCPAKcAtgDEANEA5QD5AAwBIgE3AUkBWAFsAYgBogG5AdIB7gEIAiACNQI7AkQCUAJhAmoCawJrAnACfgKKApMCngKfAoMCfQKjAosCRgIXAgQCKwJyAqQCswK7ArsCtwKyArkCxQLBArkCsgKsAqsCqAKmAqUCnwKbApkClwKXApMCjwKNAowCbf6s/rn+w/7f/gT/IP82/07/Yv93/43/pf/A/8z/0//i/+r/8v/8/w8AJwBCAFcAagCDAJsAqgC4AMgA3gDwAAABFQEvAT8BRAFYAXsBnQGrAboB5AEFAhsCIgImAj4CSAJWAm8ChgKAAnMCfwKHApEClwKMAnMCgQKKAnYCMgLYAd8BOQKKAqQCsgKwAqwCqwKnAqwCuAK3ArACqgKfApsCoQKjAp8CnQKYApICjQKMAooCiAKHAoYCbP6U/q/+wf7W/vj+F/8v/0P/V/9s/4P/mP+r/7b/wf/M/9b/4f/u/wQAHgA5AEwAXwB4AI4AngCtAL8A1ADkAPEAAwEdATIBOQFBAV0BhgGgAbEB0gHxARMCFgISAigCNAJAAlQCfgKZAp0CjQKBApICkgKhArUCvQKZAoECNgLEAfQBWwKSAqQCrQKqAqUCogKdAp8CqgKvAqkClwKMApAClgKbApYCkQKRAo8CjQKIAocCgwJ/AoIC', geoidGrid = null;
  function geoidAt(lat, lon) {
    if (lat < -11 || lat > 6 || lon < 95 || lon > 141) return null;
    if (!geoidGrid) { var bin = atob(GEOID_B64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); geoidGrid = new Int16Array(u.buffer); }
    var fy = (lat + 11) / .5, fx = (lon - 95) / .5, y = Math.min(33, Math.floor(fy)), x = Math.min(91, Math.floor(fx)), dy = fy - y, dx = fx - x, W = 93;
    var v = function (r, c) { return geoidGrid[r * W + c] / 10; };
    return v(y, x) * (1 - dx) * (1 - dy) + v(y, x + 1) * dx * (1 - dy) + v(y + 1, x) * (1 - dx) * dy + v(y + 1, x + 1) * dx * dy;
  }
  // Safari (iOS) sudah memberi tinggi di atas permukaan laut; peramban lain memberi tinggi elipsoid WGS84 → dikurangi undulasi geoid.
  var IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function gpsElev(f) {
    if (!f || f.alt == null || !isFinite(f.alt)) return null;
    if (IOS) return { v: f.alt, acc: f.altAcc, src: 'GPS' };
    var n = geoidAt(f.lat, f.lon); return n == null ? null : { v: f.alt - n, acc: f.altAcc, src: 'GPS' };
  }
  // Elevasi permukaan tanah dari model elevasi digital Copernicus (GLO-90) melalui Open-Meteo.
  function demAt(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/elevation?latitude=' + lat.toFixed(6) + '&longitude=' + lon.toFixed(6);
    return Promise.race([fetch(url).then(function (r) { return r.json(); }), new Promise(function (_, rej) { setTimeout(rej, 8000); })])
      .then(function (d) { var e = d && d.elevation && d.elevation[0]; return typeof e === 'number' && isFinite(e) && e > -100 && e < 6000 ? { v: e, src: 'DEM' } : null; })
      .catch(function () { return null; });
  }
  function elevText(e) { return e ? Math.round(e.v) + ' m dpl' : ''; }
  function elevSrc(e) { return !e ? '' : e.src === 'DEM' ? 'DEM Copernicus' : e.src === 'EXIF' ? 'data foto' : 'GPS' + (e.acc ? ' ± ' + Math.round(e.acc) + ' m' : ''); }
  function placeLine(ad) { return [ad.village && 'Desa/Kel. ' + ad.village, ad.district && 'Kec. ' + ad.district, ad.regency].filter(Boolean).join(', '); }

  // ---------- GPS: pantau terus, ambil pembacaan terbaik ----------
  var gps = { id: null, samples: [], last: null, err: null, subs: [] };
  function gpsStart() {
    if (gps.id != null || !navigator.geolocation) return;
    gps.err = null;
    gps.id = navigator.geolocation.watchPosition(function (p) {
      var s = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy || null, alt: p.coords.altitude, altAcc: p.coords.altitudeAccuracy || null, t: Date.now() };
      gps.last = s; gps.samples.push(s); if (gps.samples.length > 40) gps.samples.shift(); gps.err = null;
      gps.subs.forEach(function (f) { f(); });
    }, function (e) { gps.err = e; gps.subs.forEach(function (f) { f(); }); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function gpsStop() { if (gps.id != null) navigator.geolocation.clearWatch(gps.id); gps.id = null; gps.samples = []; gps.last = null; }
  // Pembacaan terbaik dari beberapa detik terakhir saja, agar posisi lama (sebelum pindah tempat) tidak terpakai.
  function gpsBest(windowMs) {
    var now = Date.now(), win = Math.min(windowMs, 4000), best = null;
    gps.samples.forEach(function (s) { if (now - s.t <= win && (!best || (s.acc || 1e9) < (best.acc || 1e9))) best = s; });
    if (!best && gps.last && now - gps.last.t <= windowMs) best = gps.last;
    return best;
  }
  function gpsError(e) {
    if (!window.isSecureContext) return 'GPS hanya bisa dipakai melalui alamat https:// resmi SOBAT TARU.';
    if (e && e.code === 1) return 'Izin lokasi ditolak. Buka pengaturan situs, izinkan Lokasi, lalu coba lagi.';
    if (e && e.code === 2) return 'Sinyal GPS belum tersedia. Aktifkan GPS dan pindah ke area terbuka.';
    if (e && e.code === 3) return 'GPS terlalu lama merespons. Pastikan GPS aktif.';
    return 'Lokasi perangkat belum dapat dibaca.';
  }

  // ---------- Kompas ----------
  var compass = { h: null, on: false };
  function compassStart() {
    if (compass.on) return; compass.on = true;
    function onOri(e) {
      if (typeof e.beta === 'number' && typeof e.gamma === 'number') { compass.b = e.beta; compass.g = e.gamma; compass.t = Date.now(); }
      var h = null;
      if (typeof e.webkitCompassHeading === 'number') {
        h = e.webkitCompassHeading + ((screen.orientation && screen.orientation.angle) || window.orientation || 0);
      } else if (e.absolute && typeof e.alpha === 'number') {
        // Arah lensa belakang (sumbu -Z perangkat) dari matriks rotasi W3C: benar untuk posisi tegak maupun miring/lanskap.
        var d = Math.PI / 180, a = e.alpha * d, b = (e.beta || 0) * d, g = (e.gamma || 0) * d;
        var r13 = Math.cos(a) * Math.sin(g) + Math.sin(a) * Math.sin(b) * Math.cos(g),
          r23 = Math.sin(a) * Math.sin(g) - Math.cos(a) * Math.sin(b) * Math.cos(g),
          r33 = Math.cos(b) * Math.cos(g);
        h = Math.abs(r33) > 0.94 ? 360 - e.alpha : Math.atan2(-r13, -r23) / d; // HP mendatar: pakai arah sisi atas
      }
      if (h == null) return;
      compass.h = toTrue(h);
    }
    var go = function () { window.addEventListener('deviceorientationabsolute', onOri, true); window.addEventListener('deviceorientation', onOri, true); };
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().then(function (s) { if (s === 'granted') go(); }).catch(function () {});
    else go();
  }

  // Posisi fisik HP dari sensor gravitasi: 0 = tegak, -90 = diputar berlawanan jarum jam (sisi kanan di atas), 90 = searah jarum jam.
  function physicalTurn() {
    if (compass.b == null || Date.now() - (compass.t || 0) > 3000) return 0;
    var d = Math.PI / 180, ux = -Math.cos(compass.b * d) * Math.sin(compass.g * d), uy = Math.sin(compass.b * d);
    if (Math.abs(ux) < 0.55 || Math.abs(ux) < Math.abs(uy) * 1.2) return 0;
    return ux > 0 ? -90 : 90;
  }
  function rotateCanvas(c, deg) {
    var r = document.createElement('canvas'); r.width = c.height; r.height = c.width;
    var g = r.getContext('2d'); g.translate(r.width / 2, r.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(c, -c.width / 2, -c.height / 2);
    return r;
  }

  // ---------- EXIF (foto dari galeri) ----------
  function readExif(buf) {
    try {
      var v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return null;
      var off = 2;
      while (off < v.byteLength - 4) {
        var marker = v.getUint16(off), len = v.getUint16(off + 2);
        if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
        if ((marker & 0xFF00) !== 0xFF00) break; off += 2 + len;
      }
    } catch (e) {}
    return null;
  }
  function parseTiff(v, t) {
    var le = v.getUint16(t) === 0x4949, u16 = function (o) { return v.getUint16(o, le); }, u32 = function (o) { return v.getUint32(o, le); };
    function ifd(o) { var n = u16(o), out = {}; for (var i = 0; i < n; i++) { var e = o + 2 + i * 12; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 }; } return out; }
    function rat(o) { return u32(o) / (u32(o + 4) || 1); }
    function ascii(en) { var o = en.count > 4 ? t + u32(en.at) : en.at, s = ''; for (var i = 0; i < en.count - 1; i++) s += String.fromCharCode(v.getUint8(o + i)); return s; }
    var main = ifd(t + u32(t + 4)), res = {};
    if (main[0x8769]) { var ex = ifd(t + u32(main[0x8769].at)); if (ex[0x9003]) res.time = ascii(ex[0x9003]); }
    if (!res.time && main[0x0132]) res.time = ascii(main[0x0132]);
    if (main[0x8825]) {
      var g = ifd(t + u32(main[0x8825].at));
      if (g[2] && g[4]) {
        var la = t + u32(g[2].at), lo = t + u32(g[4].at);
        var lat = rat(la) + rat(la + 8) / 60 + rat(la + 16) / 3600, lon = rat(lo) + rat(lo + 8) / 60 + rat(lo + 16) / 3600;
        if (g[1] && String.fromCharCode(v.getUint8(g[1].at)) === 'S') lat = -lat;
        if (g[3] && String.fromCharCode(v.getUint8(g[3].at)) === 'W') lon = -lon;
        if (isFinite(lat) && isFinite(lon) && (lat || lon)) { res.lat = lat; res.lon = lon; }
        if (g[6] && g[6].type === 5) { var al = rat(t + u32(g[6].at)); if (g[5] && v.getUint8(g[5].at) === 1) al = -al; if (isFinite(al)) res.alt = al; }
        if (g[0x1F] && g[0x1F].type === 5) res.acc = rat(t + u32(g[0x1F].at));
        if (g[0x11] && g[0x11].type === 5) { res.heading = rat(t + u32(g[0x11].at)); if (g[0x10] && String.fromCharCode(v.getUint8(g[0x10].at)) === 'M') res.heading = toTrue(res.heading); }
      }
    }
    return res;
  }
  function exifDate(s) { var m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null; }

  // ---------- Foto + cap ----------
  function fitCanvas(src, w, h) {
    var max = 3200, s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  var logoImg = null;
  function logo() { if (!logoImg) { logoImg = new Image(); logoImg.src = 'assets/sobat-taru-logo.png'; } return logoImg; }
  function fmtDate(d) { return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtTime(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function tzName(d) { var o = -d.getTimezoneOffset() / 60; return o === 7 ? 'WIB' : o === 8 ? 'WITA' : o === 9 ? 'WIT' : 'UTC' + (o >= 0 ? '+' : '') + o; }
  // Infografis JPG: foto utuh di atas + panel informasi di bawahnya (tinggi gambar bertambah, foto tidak ditimpa).
  var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif';
  function fitText(g, t, maxW) { t = String(t || ''); if (g.measureText(t).width <= maxW) return t; while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t + '…'; }
  function txt(g, t, x, y, size, weight, color, maxW, align) {
    g.font = (weight || 400) + ' ' + size + 'px ' + FONT; g.fillStyle = color || '#fff'; g.textAlign = align || 'left';
    g.fillText(maxW ? fitText(g, t, maxW) : t, x, y); g.textAlign = 'left';
  }
  function dial(g, cx, cy, r, heading) {
    g.save();
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    for (var i = 0; i < 72; i++) {
      var a = i * 5 * Math.PI / 180, major = i % 18 === 0, len = major ? 14 : (i % 6 === 0 ? 9 : 5);
      g.strokeStyle = major ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.28)'; g.lineWidth = major ? 3 : 1.5;
      g.beginPath(); g.moveTo(cx + Math.sin(a) * (r - 4), cy - Math.cos(a) * (r - 4)); g.lineTo(cx + Math.sin(a) * (r - 4 - len), cy - Math.cos(a) * (r - 4 - len)); g.stroke();
    }
    ['U', 'T', 'S', 'B'].forEach(function (l, i) { var a = i * Math.PI / 2; txt(g, l, cx + Math.sin(a) * (r - 34), cy - Math.cos(a) * (r - 34) + 8, 22, i ? 500 : 700, i ? 'rgba(255,255,255,.6)' : '#ff453a', 0, 'center'); });
    if (heading != null) {
      g.translate(cx, cy); g.rotate(heading * Math.PI / 180);
      g.fillStyle = '#0a84ff'; g.beginPath(); g.moveTo(0, -(r - 54)); g.lineTo(11, 0); g.lineTo(-11, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(0, r - 54); g.lineTo(11, 0); g.lineTo(-11, 0); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  // Rasio akhir dirancang: foto lanskap -> 4:5 (seperti unggahan potret), foto potret -> 9:16 (seperti story).
  function mapsUrl(p) { return 'https://www.google.com/maps/search/?api=1&query=' + p.lat.toFixed(7) + ',' + p.lon.toFixed(7); }
  function drawQr(g, text, x, y, size) {
    if (!window.qrcode) return false;
    try {
      var q = window.qrcode(0, 'M'); q.addData(text); q.make();
      var n = q.getModuleCount(), quiet = 10, cell = (size - quiet * 2) / n;
      g.fillStyle = '#fff'; roundRect(g, x, y, size, size, 18); g.fill();
      g.fillStyle = '#111214';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(Math.floor(x + quiet + c * cell), Math.floor(y + quiet + r * cell), Math.ceil(cell), Math.ceil(cell));
      return true;
    } catch (e) { return false; }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // Kartu kaca gelap di atas foto (desain A2): TM-3 ditonjolkan, QR lokasi di kanan.
  var CANVAS_FILTER = (function () { try { var g = document.createElement('canvas').getContext('2d'); g.filter = 'blur(2px)'; return g.filter === 'blur(2px)'; } catch (e) { return false; } })();
  function stamp(p) {
    // Dirancang pada lebar logis 1440 lalu digambar pada resolusi keluaran (OUT_W) agar teks tetap tajam.
    var src = p.raw, OUT_W = Math.min(2160, Math.max(1440, src.width)), k = OUT_W / 1440, W = 1440;
    // Foto sangat lebar (panorama) diberi ruang gelap di bawahnya agar kartu tidak menutupi seluruh foto.
    var PH = Math.round(src.height * OUT_W / src.width), H = Math.max(PH / k, 700);
    var c = document.createElement('canvas'); c.width = OUT_W; c.height = Math.round(H * k);
    var g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    if (PH < c.height) {
      var sc = c.height / PH;
      if (CANVAS_FILTER) { g.filter = 'blur(' + Math.round(40 * k) + 'px)'; g.drawImage(src, (OUT_W - OUT_W * sc) / 2, 0, OUT_W * sc, c.height); g.filter = 'none'; }
      g.fillStyle = CANVAS_FILTER ? 'rgba(10,10,12,.55)' : '#111214'; g.fillRect(0, 0, c.width, c.height);
    }
    g.drawImage(src, 0, 0, OUT_W, PH);
    var snap = null; if (CANVAS_FILTER) { snap = document.createElement('canvas'); snap.width = c.width; snap.height = c.height; snap.getContext('2d').drawImage(c, 0, 0); }
    var ad = p.admin || {}, m = tm3(p.lon, p.lat, ad.regency);
    var M = 40, CH = 470, x = M, w = W - 2 * M, y = H - M - CH, pad = 44;
    // kaca: foto diburamkan + lapisan gelap
    g.save(); g.scale(k, k); roundRect(g, x, y, w, CH, 36); g.clip();
    if (CANVAS_FILTER) { g.filter = 'blur(30px) saturate(115%)'; g.drawImage(snap, 0, 0, W, H); g.filter = 'none'; }
    g.fillStyle = CANVAS_FILTER ? 'rgba(10,10,12,.76)' : 'rgba(14,14,16,.84)'; g.fillRect(x, y, w, CH);
    g.restore();
    g.setTransform(k, 0, 0, k, 0, 0);
    roundRect(g, x + .75, y + .75, w - 1.5, CH - 1.5, 36); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5; g.stroke();
    var L = logo(), R = x + w - pad, lab = function (s, lx, ly) { txt(g, s, lx, ly, 18, 700, 'rgba(255,255,255,.5)'); };
    // kepala: merek | tanggal & waktu
    if (L.complete && L.naturalWidth) g.drawImage(L, x + pad, y + 30, 52, 52);
    txt(g, 'SOBAT TARU', x + pad + 68, y + 56, 26, 600, '#fff');
    txt(g, 'Dokumentasi Geotag', x + pad + 68, y + 84, 20, 400, 'rgba(255,255,255,.6)');
    txt(g, fmtDate(p.time), R, y + 52, 22, 500, 'rgba(255,255,255,.7)', 520, 'right');
    txt(g, fmtTime(p.time) + ' ' + tzName(p.time), R, y + 86, 30, 600, '#fff', 520, 'right');
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x + pad, y + 112, w - 2 * pad, 1.5);
    // TM-3: Zona | X | Y
    var qs = 236, qx = R - qs, cy = y + 168, L0 = x + pad, LW = qx - 40 - L0;
    lab('ZONA TM-3', L0, cy); txt(g, String(m.zone), L0, cy + 60, 50, 600, '#fff', 130);
    lab('X (TIMUR)', L0 + 150, cy); txt(g, idNum(m.x), L0 + 150, cy + 60, 50, 600, '#fff', 360);
    lab('Y (UTARA)', L0 + 530, cy); txt(g, idNum(m.y), L0 + 530, cy + 60, 50, 600, '#fff', LW - 530);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(L0, cy + 92, LW, 1.5);
    // lokasi + koordinat geografis
    var place = [ad.village && 'Desa/Kel. ' + ad.village, ad.district && 'Kec. ' + ad.district].filter(Boolean).join(', ') || (p.admin ? 'Lokasi tidak diketahui' : 'Mencari lokasi…');
    txt(g, place, L0, cy + 142, 28, 600, '#fff', LW);
    txt(g, [ad.regency, ad.province].filter(Boolean).concat([p.lat.toFixed(6) + ', ' + p.lon.toFixed(6)]).join('   ·   '), L0, cy + 178, 21, 400, 'rgba(255,255,255,.65)', LW);
    // QR lokasi
    if (!drawQr(g, mapsUrl(p), qx, cy - 28, qs)) dial(g, qx + qs / 2, cy - 28 + qs / 2, qs / 2 - 10, p.heading);
    var fy = y + CH - 34;
    txt(g, 'Pindai lokasi', qx + qs / 2, fy, 18, 500, 'rgba(255,255,255,.55)', qs, 'center');
    // baris bawah: Elevasi · Akurasi · Arah (+ peringatan sumber bila foto tanpa GPS)
    var fx = L0, item = function (label, val, col) {
      if (label) { txt(g, label, fx, fy, 23, 500, 'rgba(255,255,255,.6)'); g.font = '500 23px ' + FONT; fx += g.measureText(label).width + 10; }
      txt(g, val, fx, fy, 23, 600, col || '#fff'); g.font = '600 23px ' + FONT; fx += g.measureText(val).width + 44;
    };
    if (p.elev) item('Elevasi', elevText(p.elev));
    var ac = p.acc == null ? '#8e8e93' : p.acc <= GOOD ? '#30d158' : p.acc <= FAIR ? '#ffd60a' : '#ff453a';
    item('Akurasi', p.acc != null ? '± ' + Math.round(p.acc) + ' m' : '–', p.acc != null && p.acc > FAIR ? ac : null);
    if (p.heading != null) {
      var ex = exactCardinal(p.heading), col = ex ? '#30d158' : '#0a84ff';
      g.save(); g.translate(fx + 10, fy - 9); g.rotate(p.heading * Math.PI / 180); g.fillStyle = col; g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 9); g.lineTo(0, 5); g.lineTo(-7, 9); g.closePath(); g.fill(); g.restore();
      fx += 28; item('', Math.round(p.heading) + '° ' + (ex ? 'Tepat ' + ex : dirName(p.heading)), ex ? '#30d158' : null);
    }
    if (p.noGps && fx < qx - 120) txt(g, 'Foto tanpa GPS', fx, fy, 21, 600, '#ffd60a', qx - 40 - fx);
    g.setTransform(1, 0, 0, 1, 0, 0);
    p.stamped = c;
    return c;
  }

  // ---------- Antarmuka ----------
  var S = { photos: [], cur: 0, stream: null, el: null, view: '', busy: false };
  var ICON = { close: '<i class="fas fa-times"></i>', img: '<i class="fas fa-images"></i>', loc: '<i class="fas fa-location-arrow"></i>', cam: '<i class="fas fa-camera"></i>' };
  function build() {
    if (S.el) return S.el;
    logo();
    var el = document.createElement('div'); el.className = 'gt-shell'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<section class="gt-cam">'
      + '<video class="gt-video" playsinline muted autoplay></video><div class="gt-camerr" hidden><i class="fas fa-video-slash"></i><b>Kamera tidak dapat dibuka</b><span class="gt-camerr-t"></span></div>'
      + '<div class="gt-top"><button type="button" class="gt-round gt-x" aria-label="Tutup">' + ICON.close + '</button>'
      + '<span class="gt-chip gt-gps none"><i></i><b>Mencari GPS…</b></span><span class="gt-chip gt-dir" hidden></span></div>'
      + '<div class="gt-hint"></div>'
      + '<div class="gt-bottom"><button type="button" class="gt-round gt-gal" aria-label="Pilih dari galeri">' + ICON.img + '</button>'
      + '<button type="button" class="gt-shutter" aria-label="Ambil foto"><span></span></button>'
      + '<button type="button" class="gt-thumb" aria-label="Lihat foto" hidden><img alt=""><em></em></button><span class="gt-thumb-ph"></span></div>'
      + '<div class="gt-lock" hidden><div class="gt-lock-card"><span class="gt-spin"></span><b>Mengunci lokasi…</b><small class="gt-lock-t"></small><button type="button" class="gt-link gt-lock-go">Gunakan posisi saat ini</button></div></div>'
      + '</section>'
      + '<section class="gt-rev">'
      + '<header class="gt-bar"><button type="button" class="gt-link gt-back">' + '<i class="fas fa-chevron-left"></i> Kamera</button><b>Pratinjau</b><button type="button" class="gt-link gt-done">Tutup</button></header>'
      + '<div class="gt-scroll"><figure class="gt-fig"><img class="gt-main" alt="Foto geotag"><button type="button" class="gt-del" aria-label="Hapus foto ini"><i class="fas fa-trash-alt"></i></button></figure>'
      + '<div class="gt-strip"></div>'
      + '<div class="gt-group gt-info"></div>'
      + '<div class="gt-group gt-form">'
      + '<label><span>Judul</span><input class="gt-in-title" maxlength="80" placeholder="Opsional, tampil sebagai judul laporan"></label>'
      + '<label><span>Keterangan</span><textarea class="gt-in-note" rows="2" maxlength="400" placeholder="Opsional"></textarea></label>'
      + '<label><span>Petugas</span><input class="gt-in-off" maxlength="60" placeholder="Opsional"></label></div>'
      + '<p class="gt-foot">Koordinat dikunci saat foto diambil. Akurasi di bawah ± ' + GOOD + ' m sangat baik; di atas ± ' + FAIR + ' m sebaiknya ulangi di area terbuka.</p></div>'
      + '<footer class="gt-actions"><button type="button" class="gt-btn gt-save"><i class="fas fa-download"></i> Simpan foto</button><button type="button" class="gt-btn gt-primary gt-pdf"><i class="fas fa-file-pdf"></i> Buat PDF</button></footer>'
      + '</section><input type="file" class="gt-file" accept="image/jpeg,image/*" hidden>';
    document.body.appendChild(el); S.el = el;
    $('.gt-x', el).onclick = closeAll;
    $('.gt-done', el).onclick = closeAll;
    $('.gt-back', el).onclick = function () { showCam(); };
    $('.gt-shutter', el).onclick = shoot;
    $('.gt-gal', el).onclick = function () { $('.gt-file', el).click(); };
    $('.gt-file', el).onchange = function () { var f = this.files && this.files[0]; this.value = ''; if (f) fromFile(f); };
    $('.gt-thumb', el).onclick = function () { showReview(S.photos.length - 1); };
    $('.gt-del', el).onclick = function () { removePhoto(S.cur); };
    $('.gt-save', el).onclick = savePhoto;
    $('.gt-pdf', el).onclick = makePdf;
    var off = $('.gt-in-off', el); off.value = store('br.geotag.officer'); off.oninput = function () { store('br.geotag.officer', off.value); };
    gps.subs.push(updateGpsChip);
    setInterval(function () { if (S.view === 'cam') updateDir(); }, 400);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopCam(); else if (S.view === 'cam') startCam(); });
    return el;
  }
  function toast(t) { if (window.brToast) window.brToast(t, 4000); else alert(t); }
  function updateGpsChip() {
    if (!S.el) return;
    var chip = $('.gt-gps', S.el), hint = $('.gt-hint', S.el), s = gps.last;
    if (gps.err && !s) { chip.className = 'gt-chip gt-gps poor'; chip.querySelector('b').textContent = 'GPS tidak aktif'; hint.textContent = gpsError(gps.err); return; }
    if (!s) { chip.className = 'gt-chip gt-gps none'; chip.querySelector('b').textContent = 'Mencari GPS…'; hint.textContent = 'Tunggu sebentar, sinyal GPS sedang dicari'; return; }
    chip.className = 'gt-chip gt-gps ' + accClass(s.acc); chip.querySelector('b').textContent = accText(s.acc);
    hint.textContent = s.acc <= FAIR ? '' : 'Akurasi GPS masih lemah — pindah ke area terbuka bila memungkinkan';
  }
  var lastExact = null;
  function updateDir() {
    var d = $('.gt-dir', S.el);
    if (compass.h == null) { d.hidden = true; return; }
    var ex = exactCardinal(compass.h);
    d.hidden = false; d.classList.toggle('exact', !!ex);
    d.innerHTML = '<i class="fas fa-location-arrow" style="transform:rotate(' + (compass.h - 45) + 'deg)"></i>' + Math.round(compass.h) + '° ' + (ex ? 'Tepat ' + ex : dirName(compass.h));
    if (ex && ex !== lastExact && navigator.vibrate) navigator.vibrate(25);
    lastExact = ex;
  }
  function startCam() {
    if (S.stream || !S.el) return;
    var v = $('.gt-video', S.el), err = $('.gt-camerr', S.el);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { err.hidden = false; $('.gt-camerr-t', S.el).textContent = 'Browser ini tidak mendukung kamera. Gunakan tombol galeri untuk memilih foto.'; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } }, audio: false }).then(function (st) {
      if (S.view !== 'cam') { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      S.stream = st; v.srcObject = st; err.hidden = true; v.play().catch(function () {});
      // Jalur foto resolusi penuh (Chrome Android): ImageCapture.takePhoto, bukan bingkai video.
      var track = st.getVideoTracks()[0]; S.ic = null; S.photoW = 0;
      try { if (track && track.applyConstraints) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {}); } catch (e) {}
      if (track && window.ImageCapture) {
        try {
          S.ic = new ImageCapture(track);
          S.ic.getPhotoCapabilities().then(function (c) { S.photoW = c && c.imageWidth && c.imageWidth.max || 0; }).catch(function () {});
        } catch (e) { S.ic = null; }
      }
    }).catch(function (e) {
      err.hidden = false;
      $('.gt-camerr-t', S.el).textContent = e && e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Izinkan kamera di pengaturan situs, atau pilih foto dari galeri.' : 'Kamera tidak ditemukan atau sedang dipakai aplikasi lain. Anda tetap bisa memilih foto dari galeri.';
    });
  }
  function stopCam() { S.ic = null; if (S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; } if (S.el) $('.gt-video', S.el).srcObject = null; }
  function showCam() {
    build(); S.view = 'cam';
    S.el.className = 'gt-shell open cam';
    gpsStart(); updateGpsChip(); startCam();
    var th = $('.gt-thumb', S.el), n = S.photos.length;
    th.hidden = !n; $('.gt-thumb-ph', S.el).hidden = !!n;
    if (n) { th.querySelector('img').src = S.photos[n - 1].thumb; th.querySelector('em').textContent = n; }
    $('.gt-shutter', S.el).disabled = n >= MAX_PHOTOS;
    if (n >= MAX_PHOTOS) $('.gt-hint', S.el).textContent = 'Maksimal ' + MAX_PHOTOS + ' foto per laporan';
  }
  function open() {
    build();
    S.photos = []; $('.gt-in-title', S.el).value = ''; $('.gt-in-note', S.el).value = '';
    compassStart(); loadQr();
    showCam();
  }
  function closeAll() { stopCam(); gpsStop(); S.view = ''; if (S.el) S.el.className = 'gt-shell'; }

  function addPhoto(p) {
    p.admin = null;
    stamp(p); p.thumb = thumbOf(p.raw);
    S.photos.push(p);
    var idx = S.photos.length - 1;
    showReview(idx);
    adminAt(p.lon, p.lat).then(function (a) { p.admin = a; stamp(p); if (S.view === 'rev') showReview(S.cur); });
    p.elevWait = true;
    demAt(p.lat, p.lon).then(function (e) { p.elevWait = false; if (!e) { if (S.view === 'rev' && S.photos[S.cur] === p) showReview(S.cur); return; } p.elev = e; stamp(p); if (S.view === 'rev' && S.photos[S.cur] === p) showReview(S.cur); });
  }
  function thumbOf(c) { var t = document.createElement('canvas'), s = 160 / Math.max(c.width, c.height); t.width = Math.round(c.width * s); t.height = Math.round(c.height * s); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', .8); }
  function tiny(c) { var t = document.createElement('canvas'); t.width = t.height = 24; var g = t.getContext('2d'); g.drawImage(c, 0, 0, 24, 24); var d = g.getImageData(0, 0, 24, 24).data, o = []; for (var i = 0; i < d.length; i += 4) o.push(d[i] + d[i + 1] + d[i + 2]); return o; }
  function diff(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; }
  // Foto resolusi penuh; bila orientasinya berbeda dari pratinjau, putar ke arah yang paling cocok dengan pratinjau.
  function fullPhoto(preview) {
    if (!S.ic || !window.createImageBitmap) return Promise.reject();
    var opts = S.photoW && S.photoW > Math.max(preview.width, preview.height) ? { imageWidth: S.photoW } : {};
    var shot = S.ic.takePhoto(opts).catch(function () { return S.ic.takePhoto(); });
    var limit = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 7000); });
    return Promise.race([shot, limit]).then(function (blob) { return createImageBitmap(blob, { imageOrientation: 'from-image' }); }).then(function (bmp) {
      var c = fitCanvas(bmp, bmp.width, bmp.height); if (bmp.close) bmp.close();
      if ((c.width > c.height) !== (preview.width > preview.height)) {
        var ref = tiny(preview), a = rotateCanvas(c, 90), b2 = rotateCanvas(c, -90);
        c = diff(tiny(a), ref) <= diff(tiny(b2), ref) ? a : b2;
      }
      return c;
    });
  }
  function shoot() {
    if (S.busy) return;
    var v = $('.gt-video', S.el);
    if (!S.stream || !v.videoWidth) { toast('Kamera belum siap.'); return; }
    var preview = fitCanvas(v, v.videoWidth, v.videoHeight), time = new Date(), heading = compass.h;
    var turn = physicalTurn(), screenPortrait = window.innerHeight >= window.innerWidth;
    $('.gt-cam', S.el).classList.add('flash', 'saving'); setTimeout(function () { $('.gt-cam', S.el).classList.remove('flash'); }, 180);
    S.busy = true;
    var fixReady = new Promise(function (res) { waitFix(res); });
    var photoReady = fullPhoto(preview).catch(function () { return preview; });
    Promise.all([photoReady, fixReady]).then(function (r) {
      var raw = r[0], fix = r[1];
      $('.gt-cam', S.el).classList.remove('saving'); S.busy = false;
      // Layar terkunci potret tetapi HP dimiringkan (lanskap): putar hasil agar foto menjadi lanskap yang tegak.
      if (turn && screenPortrait && raw.height > raw.width) raw = rotateCanvas(raw, turn);
      if (!fix) { toast(gpsError(gps.err)); return; }
      stopCam();
      addPhoto({ raw: raw, time: time, lat: fix.lat, lon: fix.lon, acc: fix.acc, elev: gpsElev(fix), heading: heading, source: 'GPS perangkat saat pemotretan' });
    });
  }
  // Ambil pembacaan terbaik 10 detik terakhir; bila belum ada / masih lemah, tunggu sebentar.
  function waitFix(cb) {
    var best = gpsBest(10000);
    if (best && best.acc != null && best.acc <= FAIR) return cb(best);
    var lock = $('.gt-lock', S.el), t = $('.gt-lock-t', S.el), started = Date.now(), done = false;
    lock.hidden = false;
    function finish(f) { if (done) return; done = true; clearInterval(iv); lock.hidden = true; cb(f); }
    $('.gt-lock-go', S.el).onclick = function () { finish(gpsBest(30000) || gps.last); };
    var iv = setInterval(function () {
      var b = gpsBest(10000);
      t.textContent = b ? 'Akurasi saat ini ' + accText(b.acc) : gps.err ? gpsError(gps.err) : 'Menunggu sinyal GPS…';
      $('.gt-lock-go', S.el).hidden = !gps.last;
      if (b && b.acc != null && b.acc <= FAIR) finish(b);
      else if (Date.now() - started > 20000) finish(gpsBest(30000) || gps.last || null);
    }, 300);
  }
  function fromFile(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var ex = readExif(rd.result) || {}, url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var raw = fitCanvas(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url);
        var time = exifDate(ex.time) || new Date(file.lastModified || Date.now());
        if (ex.lat != null) { stopCam(); addPhoto({ raw: raw, time: time, lat: ex.lat, lon: ex.lon, acc: ex.acc != null ? ex.acc : null, elev: ex.alt != null ? { v: ex.alt, src: 'EXIF' } : null, heading: ex.heading != null ? ex.heading : null, source: 'Data GPS (EXIF) pada foto' }); return; }
        // Foto tanpa data GPS: pakai posisi perangkat, dan tandai dengan jelas di laporan.
        toast('Foto tidak menyimpan data lokasi. Koordinat diambil dari posisi perangkat saat ini.');
        S.busy = true;
        waitFix(function (fix) { S.busy = false; if (!fix) { toast(gpsError(gps.err)); return; } stopCam(); addPhoto({ raw: raw, time: time, lat: fix.lat, lon: fix.lon, acc: fix.acc, elev: gpsElev(fix), heading: null, source: 'Posisi perangkat saat foto dipilih (foto tanpa data GPS)', noGps: true }); });
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast('Berkas ini bukan gambar yang dapat dibaca.'); };
      img.src = url;
    };
    rd.readAsArrayBuffer(file.slice(0, 256 * 1024));
  }
  function removePhoto(i) {
    S.photos.splice(i, 1);
    if (!S.photos.length) { showCam(); return; }
    showReview(Math.min(i, S.photos.length - 1));
  }
  function row(k, v, cls) { return '<div class="gt-row"><span>' + k + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>'; }
  function showReview(i) {
    S.view = 'rev'; S.cur = i; S.el.className = 'gt-shell open rev';
    var p = S.photos[i], m = tm3(p.lon, p.lat, p.admin && p.admin.regency), ad = p.admin;
    $('.gt-main', S.el).src = p.stamped.toDataURL('image/jpeg', .85);
    var strip = S.photos.map(function (q, k) { return '<button type="button" class="gt-tile' + (k === i ? ' on' : '') + '" data-k="' + k + '"><img src="' + q.thumb + '" alt=""><em>' + (k + 1) + '</em></button>'; }).join('');
    if (S.photos.length < MAX_PHOTOS) strip += '<button type="button" class="gt-tile gt-add" aria-label="Tambah foto"><i class="fas fa-plus"></i><small>Foto</small></button>';
    var st = $('.gt-strip', S.el); st.innerHTML = strip;
    st.querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { showReview(+b.dataset.k); }; });
    var add = st.querySelector('.gt-add'); if (add) add.onclick = function () { showCam(); };
    var accCls = 'acc-' + accClass(p.acc);
    $('.gt-info', S.el).innerHTML =
      row('Lokasi', ad ? esc(placeLine(ad) || 'Tidak diketahui') : '<i class="gt-wait">Mencari desa…</i>')
      + row('Koordinat', p.lat.toFixed(6) + ', ' + p.lon.toFixed(6))
      + row('TM-3 ' + m.zone, 'X ' + idNum(m.x) + ' · Y ' + idNum(m.y))
      + row('Elevasi', p.elev ? elevText(p.elev) + ' <small class="gt-sm">' + elevSrc(p.elev) + '</small>' : '<i class="gt-wait">' + (p.elevWait ? 'Mencari elevasi…' : 'Tidak tersedia') + '</i>')
      + row('Akurasi', p.acc != null ? accText(p.acc) + (p.acc > FAIR ? ' — lemah' : p.acc > GOOD ? ' — cukup' : ' — baik') : 'Tidak tercatat', accCls)
      + (p.heading != null ? row('Arah kamera', Math.round(p.heading) + '° ' + (exactCardinal(p.heading) ? 'Tepat ' + exactCardinal(p.heading) : dirName(p.heading)) + ' <small class="gt-sm">dari utara sejati</small>', exactCardinal(p.heading) ? 'acc-good' : '') : '')
      + row('Waktu', esc(fmtDate(p.time)) + ', ' + fmtTime(p.time) + ' ' + tzName(p.time))
      + row('Sumber koordinat', esc(p.source), p.noGps ? 'acc-poor' : '');
  }
  function savePhoto() {
    var p = S.photos[S.cur]; if (!p) return;
    var name = 'SobatTaru_Geotag_' + fileStamp(p.time) + '.jpg';
    p.stamped.toBlob(function (blob) {
      // Langsung simpan ke perangkat (folder Unduhan), tanpa menu bagikan.
      var a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
      toast('Foto tersimpan di folder Unduhan: ' + name);
    }, 'image/jpeg', .93);
  }
  function fileStamp(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()); }

  // ---------- Laporan PDF ----------
  function loadQr() {
    return new Promise(function (res) {
      if (window.qrcode) return res(window.qrcode);
      var s = document.createElement('script'); s.src = 'js/qrcode.js?v=1'; s.onload = function () { res(window.qrcode || null); }; s.onerror = function () { res(null); }; document.head.appendChild(s);
    });
  }
  function qrSvg(text) { try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch (e) { return ''; } }
  function makePdf() {
    if (!S.photos.length) return;
    var pending = S.photos.some(function (p) { return !p.admin; });
    var btn = $('.gt-pdf', S.el); btn.disabled = true; btn.innerHTML = '<span class="gt-spin sm"></span> Menyiapkan…';
    var ready = Promise.all(S.photos.map(function (p) { return p.admin ? p : adminAt(p.lon, p.lat).then(function (a) { p.admin = a; stamp(p); return p; }); }));
    Promise.all([ready, loadQr()]).then(function () {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-pdf"></i> Buat PDF';
      var w = window.open('', '_blank'); // ditangani aplikasi sebagai bingkai cetak
      if (!w) { toast('Browser memblokir jendela cetak. Izinkan pop-up untuk SOBAT TARU.'); return; }
      w.document.open(); w.document.write(reportHtml()); w.document.close();
    }).catch(function () { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-pdf"></i> Buat PDF'; toast('Laporan gagal disiapkan. Coba lagi.'); });
    void pending;
  }
  function pdfImage(c) { var m = 2000, sc = Math.min(1, m / Math.max(c.width, c.height)); if (sc === 1) return c.toDataURL('image/jpeg', .88); var t = document.createElement('canvas'); t.width = Math.round(c.width * sc); t.height = Math.round(c.height * sc); var g = t.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', .88); }
  function arrowSvg(h) { return '<svg class="arr" viewBox="0 0 10 10" style="transform:rotate(' + Math.round(h) + 'deg)"><path d="M5 .6 8.2 9 5 7.3 1.8 9z" fill="#007aff"/></svg>'; }
  function reportHtml() {
    var ps = S.photos, p0 = ps[0], ad = p0.admin || {}, n = ps.length;
    var title = $('.gt-in-title', S.el).value.trim(), note = $('.gt-in-note', S.el).value.trim(), officer = $('.gt-in-off', S.el).value.trim();
    var maps = 'https://www.google.com/maps/search/?api=1&query=' + p0.lat.toFixed(7) + ',' + p0.lon.toFixed(7);
    var base = location.origin + location.pathname.replace(/[^\/]*$/, ''), abs = function (u) { return new URL(u, location.href).href; };
    var fileName = 'SobatTaru_Geotag_' + String(ad.village || 'Lokasi').replace(/[^A-Za-z0-9]+/g, '') + '_' + fileStamp(p0.time);
    var docNo = 'GT-' + fileStamp(p0.time).replace('_', '-');
    var place = [ad.village && 'Desa/Kel. ' + ad.village, ad.district && 'Kec. ' + ad.district, ad.regency].filter(Boolean).join(', ');
    // Tata letak foto ditentukan oleh jumlah & orientasi (lanskap/potret) agar seimbang.
    var portraitN = ps.filter(function (p) { return p.raw.height > p.raw.width * 1.05; }).length, PORT = portraitN * 2 > n || (n === 1 && portraitN === 1);
    var hero = n === 1 && PORT, GAP = 3, FULL = 186;
    var cols = n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : (PORT ? 4 : 2), rowsN = Math.ceil(n / cols);
    var cellW = (FULL - GAP * (cols - 1)) / cols, ratio = n === 1 ? p0.raw.height / p0.raw.width : (PORT ? 4 / 3 : 3 / 4);
    var cellH = cellW * ratio, cap = n === 1 ? 128 : (rowsN > 1 ? 100 : 122);
    if (cellH * rowsN + GAP * (rowsN - 1) > cap) cellH = (cap - GAP * (rowsN - 1)) / rowsN;
    var photoH = Math.round(cellH * rowsN + GAP * (rowsN - 1));
    // Potret tunggal: foto & peta berdampingan, lebar sama; tinggi mengikuti rasio foto (maks 140 mm).
    var heroW = (FULL - GAP) / 2, noteH = note ? 13 + 4.2 * note.split('\n').reduce(function (a, l) { return a + Math.max(1, Math.ceil(l.length / 105)); }, 0) : 0, heroH = Math.round(Math.max(100, Math.min(heroW * ratio * 1.14, 150, 272 - 98 - noteH))), heroFit = Math.abs(ratio / (heroH / heroW) - 1) < .2 ? 'cover' : 'contain';
    var photos = ps.map(function (p, k) {
      return '<figure class="ph"><img src="' + pdfImage(p.raw) + '" alt="Foto ' + (k + 1) + '">' + (n > 1 ? '<span class="no">' + (k + 1) + '</span>' : '') + '</figure>';
    }).join('');
    var rows = ps.map(function (p, k) {
      var m = tm3(p.lon, p.lat, (p.admin || {}).regency);
      return '<tr><td class="n">' + (k + 1) + '</td>'
        + '<td>' + p.lat.toFixed(6) + ', ' + p.lon.toFixed(6) + '<small>' + dms(p.lat, 'LU', 'LS') + ' · ' + dms(p.lon, 'BT', 'BB') + '</small></td>'
        + '<td>X ' + idNum(m.x) + ' · Y ' + idNum(m.y) + '<small>TM-3 zona ' + m.zone + '</small></td>'
        + '<td class="c">' + (p.heading != null ? arrowSvg(p.heading) + Math.round(p.heading) + '°<small' + (exactCardinal(p.heading) ? ' class="ok">Tepat ' + exactCardinal(p.heading) : '>' + dirName(p.heading)) + '</small>' : '–') + '</td>'
        + '<td class="c">' + (p.acc != null ? '± ' + Math.round(p.acc) + ' m' : '–') + '<small>' + (p.noGps ? 'posisi perangkat' : p.source.indexOf('EXIF') >= 0 ? 'data foto' : 'GPS') + '</small></td>'
        + '<td class="c">' + (p.elev ? elevText(p.elev) + '<small>' + (p.elev.src === 'DEM' ? 'DEM' : elevSrc(p.elev)) + '</small>' : '–') + '</td>'
        + '<td class="c">' + fmtTime(p.time) + '<small>' + p.time.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + '</small></td></tr>';
    }).join('');
    var marks = JSON.stringify(ps.map(function (p) { return [p.lat, p.lon]; }));
    var mapCard = '<div class="card mapc"><div id="map"></div><span class="north">U</span></div>';
    var lokCard = '<div class="card"><h3>Lokasi</h3><div class="kv"><span>Desa/Kel.</span><b>' + esc(ad.village || '–') + '</b><span>Kecamatan</span><b>' + esc(ad.district || '–') + '</b><span>Kab/Kota</span><b>' + esc(ad.regency || '–') + '</b><span>Provinsi</span><b>' + esc(ad.province || '–') + '</b>' + (hero ? '' : '<span>Jumlah foto</span><b>' + n + '</b>') + '</div></div>';
    var coCard = '';
    if (hero) {
      var m0 = tm3(p0.lon, p0.lat, ad.regency), ec = p0.heading != null && exactCardinal(p0.heading);
      coCard = '<div class="card"><h3>Koordinat</h3><div class="kv co">'
        + '<span>Lintang</span><b>' + p0.lat.toFixed(6) + '<small>' + dms(p0.lat, 'LU', 'LS') + '</small></b>'
        + '<span>Bujur</span><b>' + p0.lon.toFixed(6) + '<small>' + dms(p0.lon, 'BT', 'BB') + '</small></b>'
        + '<span>TM-3 ' + m0.zone + '</span><b>X ' + idNum(m0.x) + '<small>Y ' + idNum(m0.y) + '</small></b>'
        + '<span>Arah</span><b' + (ec ? ' class="ok"' : '') + '>' + (p0.heading != null ? arrowSvg(p0.heading) + Math.round(p0.heading) + '° ' + (ec ? 'Tepat ' + ec : dirName(p0.heading)) : '–') + '</b>'
        + '<span>Elevasi</span><b>' + (p0.elev ? elevText(p0.elev) + '<small>' + elevSrc(p0.elev) + '</small>' : '–') + '</b>'
        + '<span>Akurasi</span><b>' + (p0.acc != null ? '± ' + Math.round(p0.acc) + ' m' : '–') + '</b>'
        + '</div></div>';
    }
    var css = '@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}html,body{margin:0}body{color:#1d1d1f;font:8.6pt/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
      + '.page{display:flex;flex-direction:column;height:272mm}'
      + '.hd{display:flex;align-items:center;justify-content:space-between;padding-bottom:3mm;border-bottom:.25mm solid #d2d2d7}.brand{display:flex;align-items:center;gap:2.6mm}.brand img{width:8.5mm;height:8.5mm}.brand b{display:block;font-size:10pt;font-weight:600}.brand span{color:#86868b;font-size:7pt}'
      + '.meta{text-align:right;color:#86868b;font-size:7pt}.meta b{display:block;color:#1d1d1f;font-size:7.6pt;font-weight:600;letter-spacing:.14em}'
      + '.tt{display:flex;align-items:flex-end;justify-content:space-between;gap:6mm;margin:5mm 0 4mm}h1{margin:0;font-size:15pt;font-weight:600;letter-spacing:-.01em}.tt p{margin:1mm 0 0;color:#6e6e73;font-size:8.6pt}.date{text-align:right;white-space:nowrap}.date b{display:block;font-size:11pt;font-weight:500;font-variant-numeric:tabular-nums}.date span{color:#86868b;font-size:7.4pt}'
      + '.photos{display:grid;gap:' + GAP + 'mm;height:' + photoH + 'mm;grid-template-columns:repeat(' + cols + ',1fr);grid-template-rows:repeat(' + rowsN + ',1fr)}'
      + (n > 1 ? '.photos{flex:1 1 auto;height:auto;min-height:' + photoH + 'mm;max-height:' + Math.round(photoH * (n === 3 ? 1.9 : 1.6)) + 'mm}' : '')
      + '.hero{display:grid;grid-template-columns:1fr 1fr;gap:3mm;height:' + heroH + 'mm}.hero .ph,.hero .mapc{height:100%}.hero .ph img{object-fit:' + heroFit + '}'
      + '.kv.co{gap:1mm 3mm}.kv.co b small{display:block;color:#86868b;font-size:6.4pt;font-weight:400}.kv b.ok{color:#248a3d}'
      + '.ph{position:relative;margin:0;border-radius:2.5mm;overflow:hidden;background:#f5f5f7}.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:' + (n === 1 ? 'contain' : 'cover') + '}'
      + '.ph .no{position:absolute;left:2mm;top:2mm;width:5.6mm;height:5.6mm;border-radius:50%;background:rgba(255,255,255,.94);font-size:7.6pt;font-weight:600;display:grid;place-items:center;box-shadow:0 .2mm .8mm rgba(0,0,0,.25)}'
      + '.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin-top:4mm;height:54mm}'
      + '.card{position:relative;border:.25mm solid #e5e5ea;border-radius:2.5mm;padding:3.2mm 3.6mm;overflow:hidden}.card h3{margin:0 0 2.4mm;color:#86868b;font-size:6.6pt;font-weight:600;letter-spacing:.1em;text-transform:uppercase}'
      + '.mapc{padding:0}#map{position:absolute;inset:0}.north{position:absolute;z-index:500;right:2mm;top:2mm;width:6mm;height:6mm;border-radius:50%;background:rgba(255,255,255,.95);display:grid;place-items:center;font-size:6.5pt;font-weight:700;box-shadow:0 .2mm .6mm rgba(0,0,0,.25)}'
      + '.kv{display:grid;grid-template-columns:auto 1fr;gap:1.3mm 3mm}.kv span{color:#86868b}.kv b{font-weight:500;text-align:right}'
      + '.qrc{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;text-decoration:none;color:inherit}.qrc svg{width:27mm;height:27mm}.qrc b{margin-top:2.2mm;font-size:8pt;font-weight:600;color:#007aff}.qrc span{margin-top:.6mm;color:#86868b;font-size:6.8pt}'
      + 'table{width:100%;margin-top:4mm;border-collapse:collapse;font-size:8pt;font-variant-numeric:tabular-nums}th{padding:0 2mm 1.2mm;color:#86868b;font-size:6.6pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase;text-align:left;border-bottom:.25mm solid #d2d2d7}th.c,td.c{text-align:center}'
      + 'td{padding:1.6mm 2mm;border-bottom:.2mm solid #ececf0;vertical-align:top}td small{display:block;color:#86868b;font-size:6.6pt}td.n{width:6mm;font-weight:600;color:#86868b}td small.ok{color:#248a3d;font-weight:600}.arr{width:2.6mm;height:2.6mm;margin-right:1mm;vertical-align:-.3mm}'
      + '.note{margin-top:4mm;padding:2.8mm 3.6mm;border-radius:2.5mm;background:#f5f5f7}.note h3{margin:0 0 1mm;color:#86868b;font-size:6.6pt;font-weight:600;letter-spacing:.1em;text-transform:uppercase}.note p{margin:0;white-space:pre-wrap}'
      + '.ft{margin-top:auto;padding-top:2.6mm;border-top:.25mm solid #e5e5ea;display:flex;justify-content:space-between;color:#86868b;font-size:6.8pt}.ft a{color:#86868b;text-decoration:none}'
      + '.mk{width:5mm;height:5mm;margin:-2.5mm 0 0 -2.5mm;border-radius:50%;background:#007aff;border:.5mm solid #fff;color:#fff;font:600 6.4pt/4mm Arial;text-align:center;box-shadow:0 .3mm 1mm rgba(0,0,0,.45)}.leaflet-control-attribution{display:none}.leaflet-control-scale-line{font-size:6pt;padding:0 1mm}'
      + '@media screen{body{background:#e5e5ea}.page{width:186mm;margin:8mm auto;padding:0;background:#fff;box-shadow:0 0 0 12mm #fff}}';
    return '<!doctype html><html lang="id"><head><meta charset="utf-8"><title>' + esc(fileName) + '</title><link rel="stylesheet" href="' + abs('css/leaflet.css') + '"><style>' + css + '</style></head><body><div class="page">'
      + '<header class="hd"><div class="brand"><img src="' + abs('assets/sobat-taru-logo.png') + '" alt=""><div><b>SOBAT TARU</b><span>Sumbawa Barat dalam Tata Ruang</span></div></div><div class="meta"><b>DOKUMENTASI GEOTAG</b>No. ' + esc(docNo) + '</div></header>'
      + '<section class="tt"><div><h1>' + esc(title || 'Dokumentasi Geotag') + '</h1><p>' + esc(place || 'Lokasi pada koordinat di bawah') + '</p></div><div class="date"><b>' + fmtTime(p0.time) + ' ' + tzName(p0.time) + '</b><span>' + esc(fmtDate(p0.time)) + '</span></div></section>'
      + (hero
        ? '<section class="hero">' + photos + mapCard + '</section><section class="cards">' + lokCard + coCard
          + '<a class="card qrc" href="' + esc(maps) + '" target="_blank" rel="noopener">' + qrSvg(maps) + '<b>Buka di Google Maps</b><span>Pindai atau klik kode ini</span></a></section>'
        : '<section class="photos">' + photos + '</section><section class="cards">' + mapCard + lokCard
          + '<a class="card qrc" href="' + esc(maps) + '" target="_blank" rel="noopener">' + qrSvg(maps) + '<b>Buka di Google Maps</b><span>Pindai atau klik' + (n > 1 ? ' · titik foto 1' : '') + '</span></a></section>')
      + (hero ? '' : '<table><thead><tr><th></th><th>Lintang, Bujur (WGS84)</th><th>Koordinat TM-3</th><th class="c">Arah (U. sejati)</th><th class="c">Akurasi</th><th class="c">Elevasi</th><th class="c">Waktu</th></tr></thead><tbody>' + rows + '</tbody></table>')
      + (note ? '<div class="note"><h3>Keterangan</h3><p>' + esc(note) + '</p></div>' : '')
      + '<footer class="ft"><span>' + (officer ? 'Petugas: ' + esc(officer) + ' · ' : '') + 'Dibuat ' + esc(new Date().toLocaleString('id-ID')) + '</span><a href="' + esc(base) + '">' + esc(base.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</a></footer></div>'
      + '<script src="' + abs('js/leaflet.js') + '"><\/script><script>(function(){var pts=' + marks + ',name=' + JSON.stringify(fileName) + ';document.title=name;'
      + 'function go(){var done=false;function print(){if(done)return;done=true;setTimeout(function(){document.title=name;try{parent.document.title=name}catch(e){}window.focus();window.print()},600)}'
      + 'try{var map=L.map("map",{zoomControl:false,attributionControl:false,fadeAnimation:false,zoomAnimation:false}),t=L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",{maxZoom:20,maxNativeZoom:20}).addTo(map);'
      + 'pts.forEach(function(p,i){L.marker(p,{icon:L.divIcon({className:"",html:"<div class=mk>"+(pts.length>1?i+1:"")+"</div>",iconSize:[0,0]})}).addTo(map)});'
      + 'if(pts.length>1)map.fitBounds(pts,{padding:[22,22],maxZoom:19});else map.setView(pts[0],18);L.control.scale({imperial:false,position:"bottomleft"}).addTo(map);t.on("load",print)}catch(e){}'
      + 'setTimeout(print,4500);}'
      + 'if(document.readyState==="complete")go();else window.addEventListener("load",go)})();<\/script></body></html>';
  }

  function init() {
    var menu = document.querySelector('.lontar-toolbox-menu');
    if (!menu || menu.querySelector('[data-geotag-report]')) return;
    var b = document.createElement('button'); b.className = 'lontar-toolbox-item'; b.type = 'button'; b.dataset.geotagReport = '1';
    b.innerHTML = '<i class="fas fa-camera"></i>Foto & PDF Geotag';
    b.onclick = function () { menu.classList.remove('open'); open(); };
    menu.appendChild(b);
  }
  window.brGeotagOpen = open;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
