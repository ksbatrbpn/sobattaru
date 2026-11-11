/*
 * SOBAT TARU — Peta Telaah Spasial, dari menu Eksplorasi Bidang.
 * Alur: unggah SHP bidang (Eksplorasi Bidang) → pilih NIB yang dimohon, atau muat bidang dari
 * Excel koordinat (bidang yang belum diukur/belum ber-NIB) → isi formulir (pemohon, luas,
 * penelaah, pejabat) → draf "Hasil Analisis" disusun otomatis dari irisan kawasan hutan, PIPPIB,
 * LSD, LP2B, sempadan, pola ruang, dan tumpang tindih dengan bidang lain di SHP → cetak.
 * Cetakan: satu halaman per latar (citra satelit, pola ruang, dan tiap faktor pembatas yang
 * beririsan), kertas A4/A3/A2/F4 lanskap, Tema 1 (Original) atau Tema 2 (Rapi).
 */
(function(){
  'use strict';
  if(!window.L||!window.map)return;

  function $(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function ux(){return window.sobatUx||{};}
  function toast(text,ms){var u=ux();if(u.showToast)u.showToast(text,ms);else if(window.brToast)window.brToast(text,ms);}
  function areaOf(g){var u=ux();try{return u.areaOf?u.areaOf(g):turf.area(g);}catch(_e){return 0;}}
  function num(v){return Math.round(Number(v)||0).toLocaleString('id-ID');}
  function pct(part,base){if(!base||!part)return '';var v=Math.min(100,part/base*100);return (v<0.1?'<0,1':v.toLocaleString('id-ID',{minimumFractionDigits:1,maximumFractionDigits:1}))+'%';}
  function boxesOverlap(a,b){return !(a[0]>b[2]||a[2]<b[0]||a[1]>b[3]||a[3]<b[1]);}
  function boxOf(f){if(!f.__ptBox){try{f.__ptBox=turf.bbox(f);}catch(_e){f.__ptBox=[0,0,0,0];}}return f.__ptBox;}
  function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function dateId(iso){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');return m?m[3]+'/'+m[2]+'/'+m[1]:'';}
  function fileToken(v){return String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);}
  function joinDan(a){return a.length>1?a.slice(0,-1).join(', ')+' dan '+a[a.length-1]:a.join('');}

  var PREF_KEY='sobatTaruPetaTelaah';
  function prefs(){try{return JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{};}catch(_e){return {};}}
  function savePrefs(p){try{localStorage.setItem(PREF_KEY,JSON.stringify(p));}catch(_e){}}

  var BASES=[
    {name:'Google Satellite',url:'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',max:20,credit:'Citra Google Satellite'},
    {name:'Google Hybrid',url:'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',max:20,credit:'Citra Google Hybrid'},
    {name:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',max:19,credit:'© OpenStreetMap'}
  ];
  var POLA=[
    {id:'rdtr-taliwang',label:'RDTR Perkotaan Taliwang',text:'Rencana Detail Tata Ruang (RDTR) Perkotaan Taliwang',layer:'layer_RDTRTALIWANG_2',field:'NAMAOBJ',word:'zona'},
    {id:'rdtr-maluk',label:'RDTR Sekitar Kawasan Industri Maluk',text:'Rencana Detail Tata Ruang (RDTR) Sekitar Kawasan Industri Maluk',layer:'layer_RDTRMALUK_1',field:'NAMOBJ',word:'zona'},
    {id:'rtrw',label:'RTRW Kabupaten Sumbawa Barat',text:'Rencana Tata Ruang Wilayah (RTRW) Kabupaten Sumbawa Barat',layer:'layer_RTRWSUMBAWABARAT20202040_3',field:'NAMOBJ',word:'kawasan'},
    {id:'rtrw-provinsi',label:'RTRW Provinsi NTB',text:'Rencana Tata Ruang Wilayah (RTRW) Provinsi Nusa Tenggara Barat',layer:'layer_RTRWPROVINSINTB20242044_7',field:'NAMOBJ',word:'kawasan'}
  ];
  // Faktor pembatas selain pola ruang: bila beririsan dengan bidang, dicetak sebagai halaman peta tersendiri.
  var LIMITS=[
    {id:'sigap',title:'Kawasan Hutan (SIGAP)',short:'Kawasan Hutan'},
    {id:'pippib',title:'PIPPIB 2025',short:'PIPPIB'},
    {id:'lsd',title:'Lahan Sawah yang Dilindungi (LSD)',short:'LSD'},
    {id:'lp2b',title:'LP2B Hasil Verifikasi Usulan 2026',short:'LP2B'},
    {id:'sempadan-sungai',title:'Sempadan Sungai',short:'Sempadan Sungai'},
    {id:'sempadan-pantai',title:'Sempadan Pantai',short:'Sempadan Pantai'}
  ];
  var PAPERS={
    A4:{w:297,h:210,label:'A4 (297 × 210 mm)'},
    A3:{w:420,h:297,label:'A3 (420 × 297 mm)'},
    A2:{w:594,h:420,label:'A2 (594 × 420 mm)'},
    F4:{w:330,h:215,label:'F4 / Folio (330 × 215 mm)'}
  };
  var THEMES={'1':'Tema 1 — Original','2':'Tema 2 — Rapi'};
  var SCALES=[200,250,500,750,1000,1500,2000,2500,3000,4000,5000,7500,10000,15000,20000,25000,50000];
  var JENIS=['Permohonan SK Pemberian Hak Dengan Konstatasi','Permohonan SK Pemberian Hak','Permohonan Pendaftaran Tanah Pertama Kali','Permohonan Pengukuran dan Pemetaan Bidang','Permohonan Pemecahan Bidang','Permohonan Penggabungan Bidang','Permohonan Pengembalian Batas','Permohonan Peralihan Hak'];
  var KKP=[
    {id:'nib',text:'NIB yang dimohonkan sama dengan NIB pada KKP.'},
    {id:'luas',text:'Luas spasial dan tekstual KKP sudah sesuai dengan PBT yang dimohon.'},
    {id:'hgu',text:'Areal tidak terindikasi tumpang tindih dengan HGU Terdaftar KKP.'}
  ];
  var MM=96/25.4,SUBJECT='#e6007e',NEIGHBOR='#f5a300';

  // Tata letak halaman (mm). Panel keterangan dan huruf diskalakan terhadap A3.
  function layoutFor(paperId,theme){
    var P=PAPERS[paperId]||PAPERS.A3,k=P.h/297,fk=Math.max(k,0.8),sk=Math.max(k,0.8);
    var pad=Math.max(5,7*k),side=(theme==='2'?112:104)*sk,gap=Math.max(3,4*k),inset=(theme==='2'?7.5:6)*Math.max(k,0.85);
    var boxW=P.w-2*pad-side-gap,boxH=P.h-2*pad;
    return {pw:P.w,ph:P.h,k:k,fk:fk,pad:pad,side:side,gap:gap,inset:inset,boxW:boxW,boxH:boxH,mapW:boxW-2*inset,mapH:boxH-2*inset};
  }

  /* ---------- Proyeksi Transverse Mercator (WGS84) untuk UTM 50S dan TM-3 ---------- */
  var CRS={
    utm50s:{k0:.9996,lon0:117,fe:500000,fn:10000000,label:'UTM Zona 50S (WGS 84)'},
    'tm3-501':{k0:.9999,lon0:115.5,fe:200000,fn:1500000,label:'TM-3 Zona 50.1'},
    'tm3-502':{k0:.9999,lon0:118.5,fe:200000,fn:1500000,label:'TM-3 Zona 50.2'}
  };
  var A_=6378137,F_=1/298.257223563,E2=F_*(2-F_),EP2=E2/(1-E2);
  function tmInverse(x,y,p){
    var e1=(1-Math.sqrt(1-E2))/(1+Math.sqrt(1-E2)),M=(y-p.fn)/p.k0,mu=M/(A_*(1-E2/4-3*E2*E2/64-5*E2*E2*E2/256));
    var fp=mu+(3*e1/2-27*Math.pow(e1,3)/32)*Math.sin(2*mu)+(21*e1*e1/16-55*Math.pow(e1,4)/32)*Math.sin(4*mu)+(151*Math.pow(e1,3)/96)*Math.sin(6*mu)+(1097*Math.pow(e1,4)/512)*Math.sin(8*mu);
    var C1=EP2*Math.pow(Math.cos(fp),2),T1=Math.pow(Math.tan(fp),2),N1=A_/Math.sqrt(1-E2*Math.pow(Math.sin(fp),2)),R1=A_*(1-E2)/Math.pow(1-E2*Math.pow(Math.sin(fp),2),1.5),D=(x-p.fe)/(N1*p.k0);
    var lat=fp-(N1*Math.tan(fp)/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*EP2)*Math.pow(D,4)/24+(61+90*T1+298*C1+45*T1*T1-252*EP2-3*C1*C1)*Math.pow(D,6)/720);
    var lon=(D-(1+2*T1+C1)*Math.pow(D,3)/6+(5-2*C1+28*T1-3*C1*C1+8*EP2+24*T1*T1)*Math.pow(D,5)/120)/Math.cos(fp);
    return [p.lon0+lon*180/Math.PI,lat*180/Math.PI];
  }

  /* ---------- Dialog ---------- */
  var style=document.createElement('style');
  style.textContent=
    '.pt-shell{position:fixed;inset:0;z-index:30000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(6,30,26,.55)}.pt-shell.open{display:flex}'+
    '.pt-dialog{display:flex;flex-direction:column;width:min(1280px,100%);height:min(880px,100%);overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:inherit;color:#1d2b29}'+
    '.pt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e1ebe8}.pt-head h2{margin:0;color:#0b4f44;font-size:17px}.pt-head p{margin:3px 0 0;color:#5b6e69;font-size:12px}'+
    '.pt-close{flex:0 0 auto;width:34px;height:34px;border:0;border-radius:50%;background:#eef4f2;color:#0b4f44;font-size:20px;cursor:pointer}'+
    '.pt-body{flex:1 1 auto;display:grid;grid-template-columns:minmax(0,1fr) 400px;min-height:0}'+
    '.pt-preview{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;padding:12px;background:#eef3f1}'+
    '.pt-tabs{display:flex;gap:6px;flex-wrap:wrap}.pt-tab{padding:6px 11px;border:1px solid #c9dad5;border-radius:999px;background:#fff;color:#0b4f44;font-size:12px;font-weight:700;cursor:pointer}.pt-tab.on{background:#0b4f44;border-color:#0b4f44;color:#fff}.pt-tab.limit{border-color:#e7b2a1;color:#9a3412}.pt-tab.limit.on{background:#9a3412;border-color:#9a3412;color:#fff}'+
    '.pt-frame-wrap{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}'+
    '.pt-frame{position:relative;width:100%;max-height:100%;border:2px solid #1d2b29;background:#fff}.pt-map{position:absolute;inset:0}'+
    '.pt-badge{position:absolute;z-index:500;left:8px;bottom:8px;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.92);font-size:11px;font-weight:700;color:#0b4f44;pointer-events:none}'+
    '.pt-zoom{position:absolute;z-index:500;left:8px;top:8px;display:flex;flex-direction:column;gap:4px}.pt-zoom button{width:30px;height:30px;border:1px solid #9fb3ad;border-radius:7px;background:#fff;color:#0b4f44;font:700 18px/1 Arial,sans-serif;cursor:pointer}'+
    '.pt-hint{margin:0;color:#4f625d;font-size:11.5px}'+
    '.pt-form{min-height:0;overflow:auto;padding:12px 14px 18px;border-left:1px solid #e1ebe8}'+
    '.pt-sec{margin:0 0 12px;padding:10px 11px;border:1px solid #dbe7e3;border-radius:11px;background:#fbfdfc}.pt-sec h3{margin:0 0 8px;color:#0b5e4f;font-size:12.5px;display:flex;align-items:center;gap:6px}'+
    '.pt-sec label{display:block;margin:0 0 7px;color:#41544f;font-size:11px;font-weight:700}.pt-sec label>input,.pt-sec label>select,.pt-sec label>textarea{display:block;box-sizing:border-box;width:100%;margin-top:3px;padding:7px 8px;border:1px solid #c9d8d4;border-radius:7px;background:#fff;color:#1d2b29;font:inherit;font-size:12.5px;font-weight:400}'+
    '.pt-sec textarea{min-height:170px;resize:vertical;line-height:1.45}'+
    '.pt-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pt-row3{display:grid;grid-template-columns:110px 1fr;gap:8px}'+
    '.pt-check{display:flex!important;align-items:flex-start;gap:7px;font-weight:600!important;line-height:1.35}.pt-sec label.pt-check>input{flex:0 0 auto;display:inline-block;width:auto;margin:2px 0 0;padding:0}'+
    '.pt-check small{display:block;color:#9a3412;font-weight:600}'+
    '.pt-subject{padding:8px 9px;border-radius:8px;background:#fff0f8;border:1px solid #f6c3df;font-size:12px;line-height:1.45}.pt-subject b{color:#9d0057}'+
    '.pt-seg{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0 0 9px;border:1px solid #c9dad5;border-radius:9px;overflow:hidden}.pt-seg button{padding:7px 6px;border:0;background:#fff;color:#0b4f44;font-size:11.5px;font-weight:800;cursor:pointer}.pt-seg button.on{background:#0b4f44;color:#fff}'+
    '.pt-note{margin:4px 0 0;color:#5b6e69;font-size:10.5px;line-height:1.4}.pt-warn{color:#9a4a00}.pt-err{color:#b42318}'+
    '.pt-mini{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;border:1px solid #c9dad5;border-radius:7px;background:#fff;color:#0b4f44;font-size:11px;font-weight:700;cursor:pointer}.pt-mini.primary{background:#0b4f44;border-color:#0b4f44;color:#fff}'+
    '.pt-actions{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px}'+
    '.pt-xtable{max-height:150px;overflow:auto;margin-top:6px;border:1px solid #dbe7e3;border-radius:7px;background:#fff}.pt-xtable table{width:100%;border-collapse:collapse;font-size:11px}.pt-xtable th,.pt-xtable td{padding:3px 6px;border-bottom:1px solid #eef3f1;text-align:right}.pt-xtable th{position:sticky;top:0;background:#f1f7f5;color:#0b4f44}.pt-xtable td:first-child,.pt-xtable th:first-child{text-align:center}'+
    '.pt-foot{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:11px 16px;border-top:1px solid #e1ebe8}.pt-foot span{margin-right:auto;color:#5b6e69;font-size:11.5px}'+
    '.pt-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border:1px solid #c9dad5;border-radius:9px;background:#fff;color:#0b4f44;font-weight:800;font-size:13px;cursor:pointer}.pt-btn.primary{background:#0b4f44;border-color:#0b4f44;color:#fff}.pt-btn:disabled{opacity:.55;cursor:wait}'+
    '.pt-label{background:none;border:0}.pt-label span{position:absolute;left:0;top:0;transform:translate(-50%,-50%);color:#111;font:700 10px Arial,sans-serif;white-space:nowrap;-webkit-text-stroke:2.5px #fff;paint-order:stroke fill;pointer-events:none}'+
    '.pt-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11px;color:#30413d}.pt-legend i{display:inline-block;width:16px;height:10px;margin-right:5px;vertical-align:-1px}'+
    'body.pt-open .field-explorer-toggle{visibility:hidden}'+
    '@media(max-width:820px){.pt-shell{padding:0}.pt-dialog{height:100%;border-radius:0}.pt-body{grid-template-columns:1fr;grid-template-rows:42vh minmax(0,1fr)}.pt-form{border-left:0;border-top:1px solid #e1ebe8}.pt-row{grid-template-columns:1fr}}';
  document.head.appendChild(style);

  var shell=document.createElement('div');
  shell.className='pt-shell';shell.id='petaTelaahModal';shell.setAttribute('aria-hidden','true');
  shell.innerHTML=
    '<section class="pt-dialog" role="dialog" aria-modal="true" aria-labelledby="ptTitle">'+
      '<header class="pt-head"><div><h2 id="ptTitle">Peta Telaah Spasial</h2><p>Pilih bidang yang dimohon (NIB dari SHP atau koordinat dari Excel), lengkapi isian, lalu cetak. Geser pratinjau untuk mengatur posisi; tombol +/− atau pilihan skala mengatur skala cetak.</p></div><button class="pt-close" type="button" data-pt-close aria-label="Tutup">×</button></header>'+
      '<div class="pt-body">'+
        '<div class="pt-preview">'+
          '<div class="pt-tabs" id="ptTabs" role="tablist"></div>'+
          '<div class="pt-frame-wrap" id="ptFrameWrap"><div class="pt-frame" id="ptFrame"><div id="ptMap" class="pt-map"></div><div class="pt-badge" id="ptBadge">Skala 1 : 500</div><div class="pt-zoom"><button type="button" data-pt-zoom="1" aria-label="Perbesar (skala lebih detail)">+</button><button type="button" data-pt-zoom="-1" aria-label="Perkecil">−</button></div></div></div>'+
          '<div class="pt-legend" id="ptLegend"></div>'+
          '<p class="pt-hint" id="ptPreviewHint">Klik bidang sandingan di pratinjau untuk menjadikannya bidang yang dimohon.</p>'+
        '</div>'+
        '<div class="pt-form" id="ptForm">'+
          '<section class="pt-sec"><h3><i class="fas fa-vector-square" aria-hidden="true"></i>Bidang yang dimohon</h3>'+
            '<div class="pt-seg" role="tablist"><button type="button" class="on" data-pt-mode="shp">Dari SHP (NIB)</button><button type="button" data-pt-mode="excel">Dari Excel koordinat</button></div>'+
            '<div id="ptModeShp"><label>NIB<input id="ptNib" list="ptNibList" autocomplete="off" placeholder="Ketik atau pilih NIB…"></label><datalist id="ptNibList"></datalist></div>'+
            '<div id="ptModeExcel" hidden>'+
              '<p class="pt-note" style="margin:0 0 7px">Untuk bidang yang belum diukur atau belum ber-NIB. Bidang SHP yang sudah diunggah tetap tampil sebagai bidang sandingan.</p>'+
              '<div class="pt-actions"><button type="button" class="pt-mini primary" id="ptExcelPick"><i class="fas fa-file-excel" aria-hidden="true"></i>Unggah Excel/CSV koordinat</button><button type="button" class="pt-mini" id="ptExcelTemplate"><i class="fas fa-download" aria-hidden="true"></i>Unduh template</button></div>'+
              '<div class="pt-row"><label>Sistem koordinat<select id="ptCrs"><option value="auto">Deteksi otomatis</option><option value="geo">Geografis (bujur, lintang)</option><option value="utm50s">UTM Zona 50S (WGS 84)</option><option value="tm3-501">TM-3 Zona 50.1</option><option value="tm3-502">TM-3 Zona 50.2</option></select></label><label>Label bidang di peta<input id="ptExcelLabel" value="Dimohon" maxlength="24"></label></div>'+
              '<div id="ptExcelInfo"></div>'+
            '</div>'+
            '<div class="pt-subject" id="ptSubject"></div></section>'+
          '<section class="pt-sec"><h3><i class="fas fa-heading" aria-hidden="true"></i>Judul peta</h3>'+
            '<label>Jenis permohonan<input id="ptJenis" list="ptJenisList"></label><datalist id="ptJenisList">'+JENIS.map(function(j){return '<option value="'+esc(j)+'">';}).join('')+'</datalist>'+
            '<label>Nama pemohon<input id="ptPemohon" placeholder="mis. HAIRUDDIN"></label>'+
            '<label>Luas permohonan (m², tekstual)<input id="ptLuas" inputmode="decimal" placeholder="mis. 120"></label>'+
            '<div class="pt-row3"><label>Wilayah<select id="ptDesaWord"><option>Kelurahan</option><option>Desa</option></select></label><label>Nama desa/kelurahan<input id="ptDesa"></label></div>'+
            '<label>Kecamatan<input id="ptKec"></label></section>'+
          '<section class="pt-sec"><h3><i class="fas fa-map" aria-hidden="true"></i>Tata letak dan halaman</h3>'+
            '<div class="pt-row"><label>Tema layout<select id="ptTheme">'+Object.keys(THEMES).map(function(k){return '<option value="'+k+'">'+esc(THEMES[k])+'</option>';}).join('')+'</select></label><label>Ukuran kertas<select id="ptPaper">'+Object.keys(PAPERS).map(function(k){return '<option value="'+k+'">'+esc(PAPERS[k].label)+'</option>';}).join('')+'</select></label></div>'+
            '<div id="ptPages"></div>'+
            '<div class="pt-row"><label>Skala<select id="ptScale"></select></label><label>Peta dasar citra<select id="ptBase">'+BASES.map(function(b,i){return '<option value="'+i+'">'+esc(b.name)+'</option>';}).join('')+'</select></label></div>'+
            '<label>Sumber pola ruang<select id="ptPola">'+POLA.map(function(p){return '<option value="'+p.id+'">'+esc(p.label)+'</option>';}).join('')+'</select></label>'+
            '<label>Label bidang<select id="ptLabelMode"><option value="short">5 digit terakhir NIB (mis. 04324)</option><option value="full">NIB lengkap</option><option value="none">Tanpa label</option></select></label></section>'+
          '<section class="pt-sec"><h3><i class="fas fa-clipboard-check" aria-hidden="true"></i>Hasil analisis</h3>'+
            '<p class="pt-note" style="margin:0 0 7px">Centang butir yang sudah dicek di KKP. Butir lain disusun otomatis dari data SOBAT TARU dan SHP yang diunggah.</p>'+
            KKP.map(function(k){return '<label class="pt-check"><input type="checkbox" data-pt-kkp="'+k.id+'">'+esc(k.text)+'</label>';}).join('')+
            '<label>Butir hasil analisis (satu baris satu butir, bisa disunting)<textarea id="ptHasil"></textarea></label>'+
            '<div style="display:flex;gap:8px;align-items:center"><button type="button" class="pt-mini" id="ptRegen"><i class="fas fa-sync-alt" aria-hidden="true"></i> Susun ulang otomatis</button><span class="pt-note" id="ptHasilNote"></span></div></section>'+
          '<section class="pt-sec"><h3><i class="fas fa-user-check" aria-hidden="true"></i>Penelaah dan pengesahan</h3>'+
            '<label>Tanggal ditelaah<input type="date" id="ptTglTelaah"></label>'+
            '<div class="pt-row"><label>Ditelaah oleh (1)<input id="ptPenelaah1"></label><label>Ditelaah oleh (2)<input id="ptPenelaah2"></label></div>'+
            '<label>Tanggal pengesahan<input type="date" id="ptTglSah"></label>'+
            '<label>Jabatan yang mengetahui<input id="ptJabatan"></label>'+
            '<div class="pt-row"><label>Nama pejabat<input id="ptPejabat"></label><label>NIP<input id="ptNip" inputmode="numeric"></label></div>'+
            '<label>Kantor<input id="ptKantor"></label><label>Provinsi<input id="ptProvinsi"></label>'+
            '<p class="pt-note">Nama penelaah, pejabat, kantor, tema, dan ukuran kertas diingat di perangkat ini.</p></section>'+
        '</div>'+
      '</div>'+
      '<footer class="pt-foot"><span id="ptStatus"></span><button class="pt-btn" type="button" data-pt-close>Batal</button><button class="pt-btn primary" id="ptPrint" type="button"><i class="fas fa-file-pdf" aria-hidden="true"></i>Cetak Peta Telaah</button></footer>'+
    '</section>';
  document.body.appendChild(shell);
  $('ptScale').innerHTML='<option value="auto">Otomatis</option>'+SCALES.map(function(s){return '<option value="'+s+'">1 : '+s.toLocaleString('id-ID')+'</option>';}).join('');
  var excelInput=document.createElement('input');excelInput.type='file';excelInput.accept='.xlsx,.xls,.csv';excelInput.hidden=true;document.body.appendChild(excelInput);

  var st={open:false,mode:'shp',feature:null,excel:null,excelLayer:null,model:null,villages:null,map:null,base:null,groups:null,view:'citra',center:null,edited:false,token:0,pages:[]};

  /* ---------- Data bidang dari Eksplorasi Bidang ---------- */
  function explorer(){return window.sobatExplorer||null;}
  function features(){var e=explorer();return e?e.features():[];}
  function isExcel(f){return !!(f&&f.properties&&f.properties.__SOBAT_EXCEL);}
  function nibOf(f){if(!f||isExcel(f))return '';var e=explorer();var v=e?e.value(f,'nib'):'';return String(v==null?'':v).trim();}
  function labelFor(f){
    if(isExcel(f))return String(f.properties.__SOBAT_LABEL||'').trim();
    var mode=$('ptLabelMode').value,nib=nibOf(f);if(mode==='none'||!nib)return '';
    if(mode==='full')return nib;
    var digits=nib.replace(/\D/g,'');return digits.length>5?digits.slice(-5):nib;
  }
  function attr(f,name){if(!f||isExcel(f))return '';var e=explorer();var v=e?e.value(f,name):'';return String(v==null?'':v).trim();}
  function labelPoint(f){
    if(f.__ptLabel)return f.__ptLabel;
    var pt=null;
    try{var c=turf.centerOfMass(f);if(turf.booleanPointInPolygon(c,f))pt=c.geometry.coordinates;}catch(_e){}
    if(!pt){try{pt=turf.pointOnFeature(f).geometry.coordinates;}catch(_e2){var b=boxOf(f);pt=[(b[0]+b[2])/2,(b[1]+b[3])/2];}}
    f.__ptLabel=pt;return pt;
  }

  /* ---------- Hasil analisis bidang (mesin analisis SOBAT TARU) ---------- */
  function modelFor(feature){
    var la=ux().lastAnalysis&&ux().lastAnalysis(),src=window.lastUploadedFeature;
    var list=src&&(src.type==='FeatureCollection'?src.features:[src]);
    if(la&&la.model&&la.model.mode==='polygon'&&list&&list.indexOf(feature)>=0)return la;
    return null;
  }
  function waitModel(feature,token){
    return new Promise(function(resolve){
      var t0=Date.now();
      (function check(){
        if(token!==st.token)return resolve(null);
        var la=modelFor(feature);if(la)return resolve(la);
        if(Date.now()-t0>25000)return resolve(null);
        setTimeout(check,200);
      })();
    });
  }
  function result(id){var m=st.model&&st.model.model;if(!m)return null;return m.results.filter(function(r){return r.def.id===id;})[0]||null;}
  function totalArea(){return st.model?st.model.model.total:areaOf(st.feature);}
  function catList(r,total){return r.categories.map(function(c){var p=pct(c.area,total);return c.name+(r.categories.length>1?' ('+num(c.area)+' m²'+(p?', '+p:'')+')':'');});}
  function defaultPola(){
    for(var i=0;i<POLA.length;i++){var r=result(POLA[i].id);if(r&&r.inside)return POLA[i].id;}
    return 'rtrw';
  }
  function polaSource(){return POLA.filter(function(p){return p.id===$('ptPola').value;})[0]||POLA[2];}
  function limitHit(id){var r=result(id);if(!r)return false;if(id==='sigap')return !!r.forest;return !!r.inside;}
  // Tumpang tindih bidang yang dimohon dengan bidang lain di SHP yang diunggah (persil terdaftar).
  function overlaps(){
    var f=st.feature,b=boxOf(f),rows=[];
    features().forEach(function(o){
      if(o===f||!boxesOverlap(boxOf(o),b))return;
      try{if(!turf.booleanIntersects(f,o))return;var hit=turf.intersect(f,o);if(!hit)return;var a=areaOf(hit);if(a>=1)rows.push({nib:nibOf(o)||'tanpa NIB',area:a});}catch(_e){}
    });
    return rows.sort(function(a,b){return b.area-a.area;});
  }
  // Luas dibandingkan setelah dibulatkan ke m², sama seperti angka yang tercetak; selisih sekecil apa pun disebutkan.
  function luasLine(total,luas){
    if(!(luas>0))return '';
    var t=Math.round(total),l=Math.round(luas),d=t-l;
    if(!d)return 'Luas spasial bidang ('+num(t)+' m²) sesuai dengan luas permohonan ('+num(l)+' m²).';
    return 'Luas spasial bidang ('+num(t)+' m²) tidak sama dengan luas permohonan ('+num(l)+' m²); luas spasial '+(d<0?'lebih kecil':'lebih besar')+' '+num(Math.abs(d))+' m² ('+pct(Math.abs(d),l)+').';
  }
  function luasInput(){return Number(String($('ptLuas').value||'').replace(/\./g,'').replace(',','.'));}
  function autoLines(){
    var m=st.model,lines=[],kkp={},excel=isExcel(st.feature);
    shell.querySelectorAll('[data-pt-kkp]').forEach(function(c){kkp[c.getAttribute('data-pt-kkp')]=c.checked;});
    var total=totalArea(),luas=luasInput();
    if(kkp.nib&&!excel)lines.push(KKP[0].text);
    if(kkp.luas&&!excel)lines.push(KKP[1].text);
    if(excel)lines.push('Bidang dimohon belum terdaftar/belum ber-NIB; batas bidang berasal dari koordinat '+(st.excel?st.excel.crsLabel:'Excel')+(st.excel?' ('+st.excel.points.length+' titik)':'')+'.');
    var ll=luasLine(total,luas);if(ll)lines.push(ll);
    if(!m){lines.push('(Menunggu hasil analisis kawasan…)');return lines;}
    var hutan=result('sigap'),forest=hutan&&hutan.forest,hutanPending=!hutan||hutan.pending;
    if(hutanPending)lines.push('Status kawasan hutan belum dapat dipastikan (data SIGAP belum termuat).');
    else if(forest)lines.push('Bidang beririsan dengan kawasan hutan: '+joinDan(hutan.categories.filter(function(c){return !/areal penggunaan lain|^apl$/i.test(c.name);}).map(function(c){return c.name+' '+num(c.area)+' m² ('+pct(c.area,total)+')';}))+'.');
    else lines.push('Kawasan hutan clear and clean.');
    var pippib=result('pippib');
    lines.push(pippib&&pippib.inside?'Bidang beririsan dengan kawasan PIPPIB ('+joinDan(catList(pippib,total))+') seluas '+num(pippib.area)+' m² ('+pct(pippib.area,total)+').':'Kawasan PIPPIB clear and clean.');
    var ov=overlaps();
    lines.push(ov.length?'Areal terindikasi tumpang tindih dengan '+ov.length+' persil terdaftar: '+ov.slice(0,6).map(function(o){return 'NIB '+o.nib+' ('+num(o.area)+' m², '+pct(o.area,total)+')';}).join(', ')+(ov.length>6?' dan '+(ov.length-6)+' bidang lain':'')+'.':'Areal tidak terindikasi tumpang tindih dengan Persil Terdaftar KKP.');
    if(kkp.hgu)lines.push(KKP[2].text);
    var src=polaSource(),pr=result(src.id);
    if(pr&&pr.inside){
      var names=catList(pr,total).map(function(n){return /^(kawasan|zona)\b/i.test(n)?n:src.word+' '+n;});
      lines.push('Bidang Permohonan Tata Guna Lahan berdasarkan '+src.text+' masuk dalam '+joinDan(names)+(pr.area<total*0.99?'; sisanya ('+num(total-pr.area)+' m²) di luar cakupan '+src.label:'')+'.');
    }else lines.push('Bidang Permohonan berada di luar cakupan '+src.label+'.');
    var lsd=result('lsd');
    lines.push(lsd&&lsd.inside?'Bidang yang dimohon masuk dalam kawasan LSD KSB seluas '+num(lsd.area)+' m² ('+pct(lsd.area,total)+').':'Bidang yang dimohon tidak masuk dalam kawasan LSD KSB.');
    var lp2b=result('lp2b');
    if(lp2b&&lp2b.inside)lines.push('Bidang beririsan dengan LP2B Hasil Verifikasi Usulan tahun 2026 seluas '+num(lp2b.area)+' m² ('+pct(lp2b.area,total)+'), belum merupakan penetapan.');
    ['sempadan-sungai','sempadan-pantai'].forEach(function(id){var r=result(id);if(r&&r.inside)lines.push('Bidang beririsan dengan '+r.def.title+' seluas '+num(r.area)+' m² ('+pct(r.area,total)+').');});
    if(!hutanPending&&!forest)lines.push('Permohonan bidang di luar kawasan hutan.');
    return lines;
  }
  function regen(force){
    if(st.edited&&!force)return;
    $('ptHasil').value=st.feature?autoLines().join('\n'):'';
    st.edited=false;
    $('ptHasilNote').textContent=!st.feature?'':st.model?'Disusun otomatis.':'Analisis kawasan sedang berjalan…';
  }

  /* ---------- Halaman cetak ---------- */
  function buildPages(){
    var prev={};st.pages.forEach(function(p){prev[p.id]=p.on;});
    var list=[{id:'citra',kind:'citra',title:'Latar Citra Satelit',on:true},{id:'pola',kind:'pola',title:'Latar Pola Ruang',on:true}];
    LIMITS.forEach(function(l){if(limitHit(l.id))list.push({id:l.id,kind:'limit',title:l.title,short:l.short,on:true});});
    list.forEach(function(p){if(Object.prototype.hasOwnProperty.call(prev,p.id))p.on=prev[p.id];});
    st.pages=list;
    var limits=list.filter(function(p){return p.kind==='limit';});
    $('ptPages').innerHTML='<label style="margin-bottom:4px">Halaman yang dicetak</label>'+list.map(function(p){return '<label class="pt-check"><input type="checkbox" data-pt-page="'+p.id+'"'+(p.on?' checked':'')+'><span>'+(p.kind==='limit'?'Peta faktor pembatas: '+esc(p.title)+'<small>Bidang beririsan dengan layer ini</small>':esc(p.title))+'</span></label>';}).join('')+
      (st.model&&!limits.length?'<p class="pt-note" style="margin:0 0 8px">Tidak ada faktor pembatas (hutan, PIPPIB, LSD, LP2B, sempadan) yang beririsan, jadi tidak ada halaman tambahan.</p>':'');
    if(!list.some(function(p){return p.id===st.view;}))st.view='citra';
    $('ptTabs').innerHTML=list.map(function(p){return '<button type="button" class="pt-tab'+(p.kind==='limit'?' limit':'')+(p.id===st.view?' on':'')+'" data-pt-view="'+p.id+'">'+esc(p.kind==='limit'?p.short:p.id==='citra'?'Citra satelit':'Pola ruang')+'</button>';}).join('');
  }
  function pageById(id){return st.pages.filter(function(p){return p.id===id;})[0];}
  function defById(id){return (ux().analysisDefs||[]).filter(function(d){return d.id===id;})[0];}
  function featureValue(def,f){var s=window.sobatPrintState&&window.sobatPrintState();if(s&&s.featureValue)return s.featureValue(def,f);var p=f.properties||{};return String(p[def.field]||'').trim();}
  // Fitur layer yang terlihat di bingkai: pola ruang atau faktor pembatas, beserta warna kelasnya.
  function layerFeatures(pageId,bbox){
    var out=[],view=turf.bboxPolygon(bbox);
    function push(f,name,color){try{if(!turf.booleanIntersects(f,view))return;}catch(_e){}out.push({type:'Feature',properties:{name:name||'Tanpa keterangan',color:color||'#cccccc'},geometry:f.geometry});}
    if(pageId==='sigap'){
      ((window.sigapVector&&window.sigapVector.features)||[]).forEach(function(f){var b=boxOf(f);if(!boxesOverlap(b,bbox))return;var cat=typeof window.sigapCategoryFromFeature==='function'?window.sigapCategoryFromFeature(f):null;if(cat&&cat.key==='apl')return;push(f,cat?cat.label:'Kawasan hutan',cat?cat.hex:'#2f855a');});
      return out;
    }
    var layerName,def=null,field=null;
    if(pageId==='pola'){var src=polaSource();layerName=src.layer;field=src.field;}
    else{def=defById(pageId);if(!def)return out;layerName=def.layer;}
    var layer=window[layerName];if(!layer||!layer.eachLayer)return out;
    layer.eachLayer(function(sub){
      var f=sub.feature;if(!f||!f.geometry)return;
      var b;try{var lb=sub.getBounds();b=[lb.getWest(),lb.getSouth(),lb.getEast(),lb.getNorth()];}catch(_e){b=turf.bbox(f);}
      if(!boxesOverlap(b,bbox))return;
      var o=sub.options||{},name=field?String((f.properties||{})[field]||'').replace(/\s+/g,' ').trim():(featureValue(def,f)||def.title);
      push(f,name,o.fillColor||o.color);
    });
    return out;
  }
  function legendOf(list){var seen={},out=[];list.forEach(function(f){var n=f.properties.name;if(!seen[n]){seen[n]=1;out.push({label:n,color:f.properties.color});}});return out;}

  /* ---------- Skala dan pratinjau ---------- */
  function lay(){return layoutFor($('ptPaper').value,$('ptTheme').value);}
  function subjectCenter(){var b=boxOf(st.feature);return L.latLng((b[1]+b[3])/2,(b[0]+b[2])/2);}
  function scaleValue(){
    var v=$('ptScale').value;if(v!=='auto')return Number(v);
    var l=lay(),b=boxOf(st.feature),lat=(b[1]+b[3])/2,w=(b[2]-b[0])*111320*Math.cos(lat*Math.PI/180),h=(b[3]-b[1])*110574;
    for(var i=0;i<SCALES.length;i++){var s=SCALES[i];if(w<=l.mapW*s/1000*0.2&&h<=l.mapH*s/1000*0.2)return s;}
    return SCALES[SCALES.length-1];
  }
  function zoomFor(scale,lat,widthPx){
    // Zoom cetak: 1 piksel CSS = 0,2646 mm; zoom pratinjau disesuaikan dengan lebar bingkai.
    var mpp=scale*0.0002645833333,z=Math.log(156543.03392*Math.cos(lat*Math.PI/180)/mpp)/Math.LN2;
    return widthPx?z-Math.log(lay().mapW*MM/widthPx)/Math.LN2:z;
  }
  function sizeFrame(){
    var l=lay(),wrap=$('ptFrameWrap'),frame=$('ptFrame'),ww=wrap.clientWidth||600,wh=wrap.clientHeight||400,ratio=l.mapW/l.mapH;
    var w=Math.min(ww,wh*ratio);frame.style.width=Math.floor(w)+'px';frame.style.height=Math.floor(w/ratio)+'px';
    if(st.map)st.map.invalidateSize();
  }
  function frameWidth(){return $('ptMap').clientWidth||1;}
  function applyView(){
    if(!st.map||!st.feature)return;
    var scale=scaleValue(),c=st.center||subjectCenter();
    st.map.setView(c,zoomFor(scale,c.lat,frameWidth()),{animate:false});
    $('ptBadge').textContent='Skala 1 : '+scale.toLocaleString('id-ID')+($('ptScale').value==='auto'?' (otomatis)':'')+' • '+$('ptPaper').value;
  }
  function viewBbox(pad){
    var b=st.map.getBounds(),dx=(b.getEast()-b.getWest())*(pad||0),dy=(b.getNorth()-b.getSouth())*(pad||0);
    return [b.getWest()-dx,b.getSouth()-dy,b.getEast()+dx,b.getNorth()+dy];
  }
  function neighborsIn(bbox,limit){
    var out=[];features().some(function(f){if(f!==st.feature&&boxesOverlap(boxOf(f),bbox))out.push(f);return out.length>=(limit||3000);});return out;
  }
  function renderPreview(){
    if(!st.map)return;
    var g=st.groups;g.overlay.clearLayers();g.neighbors.clearLayers();g.labels.clearLayers();g.subject.clearLayers();
    if(!st.feature){$('ptLegend').innerHTML='';return;}
    var page=pageById(st.view)||{kind:'citra'},opaque=page.kind==='pola';
    if(opaque){if(st.base&&st.map.hasLayer(st.base))st.map.removeLayer(st.base);}
    else if(st.base&&!st.map.hasLayer(st.base))st.base.addTo(st.map);
    var over=page.kind==='citra'?null:layerFeatures(page.id,viewBbox(0));
    if(over)L.geoJSON(over,{interactive:false,style:function(f){return {color:f.properties.color,weight:opaque?.6:1.2,opacity:1,fillColor:f.properties.color,fillOpacity:opaque?.9:.5};}}).addTo(g.overlay);
    var list=neighborsIn(viewBbox(0.1),2500);
    L.geoJSON(list,{style:{color:NEIGHBOR,weight:2,opacity:1,fill:true,fillOpacity:0},onEachFeature:function(f,layer){layer.on('click',function(){chooseFeature(f);});layer.bindTooltip('NIB '+(nibOf(f)||'—'),{sticky:true});}}).addTo(g.neighbors);
    L.geoJSON(st.feature,{interactive:false,style:{color:SUBJECT,weight:3,opacity:1,fillColor:SUBJECT,fillOpacity:.28}}).addTo(g.subject);
    if(st.map.getZoom()>=16)[st.feature].concat(list).slice(0,600).forEach(function(f){var t=labelFor(f);if(!t)return;var p=labelPoint(f);L.marker([p[1],p[0]],{interactive:false,keyboard:false,icon:L.divIcon({className:'pt-label',html:'<span>'+esc(t)+'</span>',iconSize:[0,0],iconAnchor:[0,0]})}).addTo(g.labels);});
    var items=[{kind:'neighbor',label:'Bidang Sandingan'},{kind:'subject',label:'Bidang Tanah yang Dimohon'}].concat(over?legendOf(over).map(function(i){return {kind:'cls',label:i.label,color:i.color};}):[]);
    $('ptLegend').innerHTML=items.map(function(i){return '<span><i style="'+(i.kind==='subject'?'border:2px solid '+SUBJECT+';background:repeating-linear-gradient(45deg,'+SUBJECT+' 0 1.5px,transparent 1.5px 4px)':i.kind==='neighbor'?'border:2px solid '+NEIGHBOR:'background:'+esc(i.color)+';border:1px solid rgba(0,0,0,.2)')+'"></i>'+esc(i.label)+'</span>';}).join('');
  }
  var previewTimer=null;
  function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,120);}
  function ensureMap(){
    if(st.map)return st.map;
    var m=L.map('ptMap',{zoomControl:false,attributionControl:false,zoomSnap:0,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,boxZoom:false,keyboard:false,minZoom:6,maxZoom:23});
    st.map=m;st.groups={overlay:L.layerGroup().addTo(m),neighbors:L.layerGroup().addTo(m),subject:L.layerGroup().addTo(m),labels:L.layerGroup().addTo(m)};
    m.on('dragend',function(){st.center=m.getCenter();});
    m.on('moveend',schedulePreview);
    return m;
  }
  function switchBase(){
    var b=BASES[Number($('ptBase').value)]||BASES[0];
    if(st.base)st.map.removeLayer(st.base);
    st.base=L.tileLayer(b.url,{maxZoom:23,maxNativeZoom:b.max});
    if((pageById(st.view)||{}).kind!=='pola')st.base.addTo(st.map);
    if(st.base.bringToBack)st.base.bringToBack();
  }

  /* ---------- Isian ---------- */
  function subjectInfo(){
    var f=st.feature;if(!f){$('ptSubject').innerHTML='Belum ada bidang yang dipilih.';return;}
    var e=explorer(),total=totalArea();
    if(isExcel(f)){$('ptSubject').innerHTML='<b>Bidang dari Excel koordinat</b> (belum ber-NIB)<br>Luas spasial '+num(total)+' m² • '+st.excel.points.length+' titik • '+esc(st.excel.crsLabel)+'<br>'+esc(st.excel.fileName);return;}
    var cad=e?e.cadastral(f):0;
    $('ptSubject').innerHTML='<b>NIB '+esc(nibOf(f)||'tidak tersedia')+'</b><br>Luas spasial '+num(total)+' m²'+(cad?' • luas atribut '+num(cad)+' m²':'')+(attr(f,'right')?' • '+esc(attr(f,'right')):'')+'<br>'+esc([attr(f,'village'),attr(f,'district')].filter(Boolean).join(', ')||'Wilayah dari atribut SHP tidak tersedia');
  }
  function titleCase(s){s=String(s||'').trim();return s===s.toUpperCase()?s.toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g,function(_m,a,b){return a+b.toUpperCase();}):s;}
  function fillAdmin(){
    var f=st.feature,v=(st.villages||[])[0];
    var desa=attr(f,'village')||(v&&v.name)||'',kec=(attr(f,'district')||(v&&v.kecamatan)||(st.model&&st.model.model.kecamatan)||'').replace(/^Kec(amatan)?\.?\s*/i,'');
    if(desa)$('ptDesa').value=titleCase(desa);
    if(kec)$('ptKec').value=titleCase(kec);
    if(v)$('ptDesaWord').value=v.kelurahan?'Kelurahan':'Desa';
  }
  function setFeature(f,keepForm){
    st.feature=f;st.center=null;st.model=null;st.villages=null;
    var token=++st.token;
    $('ptNib').value=nibOf(f);
    if(!keepForm){var e=explorer(),cad=!isExcel(f)&&e?e.cadastral(f):0;$('ptLuas').value=cad?String(Math.round(cad)):isExcel(f)?String(Math.round(areaOf(f))):'';$('ptDesa').value='';$('ptKec').value='';}
    subjectInfo();fillAdmin();buildPages();regen(true);
    if(st.map){applyView();renderPreview();}
    $('ptStatus').textContent='Menganalisis bidang…';
    var la=modelFor(f);
    (la?Promise.resolve(la):waitModel(f,token)).then(function(res){
      if(token!==st.token)return;
      if(!res){$('ptStatus').textContent='Analisis kawasan belum tersedia. Butir hasil analisis perlu diisi manual.';return;}
      st.model=res;$('ptPola').value=defaultPola();subjectInfo();buildPages();regen(false);renderPreview();
      var lim=st.pages.filter(function(p){return p.kind==='limit';}).length;
      $('ptStatus').textContent='Analisis selesai.'+(lim?' '+lim+' faktor pembatas beririsan; halaman petanya ditambahkan.':'');
      Promise.resolve(res.villagesReady).then(function(){if(token!==st.token)return;st.villages=res.villages;fillAdmin();});
    });
  }
  function chooseFeature(f){
    var e=explorer();if(!e)return;var i=features().indexOf(f);if(i<0)return;
    setMode('shp',true);e.select(i);setFeature(f,false);
  }
  function setMode(mode,silent){
    st.mode=mode;
    shell.querySelectorAll('[data-pt-mode]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-pt-mode')===mode);});
    $('ptModeShp').hidden=mode!=='shp';$('ptModeExcel').hidden=mode!=='excel';
    $('ptPreviewHint').textContent=mode==='excel'?'Bidang dari Excel tampil magenta; bidang SHP tampil sebagai sandingan.':'Klik bidang sandingan di pratinjau untuk menjadikannya bidang yang dimohon.';
    if(silent)return;
    if(mode==='excel'){
      renderExcelInfo();
      if(st.excel)useExcelFeature();
      else{st.feature=null;st.token++;st.model=null;subjectInfo();buildPages();regen(true);renderPreview();$('ptStatus').textContent='Unggah Excel koordinat bidang yang dimohon.';}
    }else{var e=explorer(),f=e&&features()[e.selectedIndex()];if(f)setFeature(f,false);else{st.feature=null;st.token++;subjectInfo();regen(true);renderPreview();$('ptStatus').textContent='Pilih NIB bidang yang dimohon.';}}
  }

  function open(mode){
    var e=explorer(),list=features(),i=e?e.selectedIndex():-1,f=list[i];
    if(!e||!list.length){toast('Unggah SHP bidang (lebih dari satu poligon) melalui Unggah SHP/KML terlebih dahulu.',5000);return;}
    if(mode!=='excel'&&!f){toast('Pilih bidang (NIB) yang dimohon pada daftar Eksplorasi Bidang, atau gunakan Telaah dari Excel.',5000);return;}
    var p=prefs();
    $('ptJenis').value=p.jenis||JENIS[0];$('ptPemohon').value='';
    $('ptPenelaah1').value=p.penelaah1||'';$('ptPenelaah2').value=p.penelaah2||'';
    $('ptJabatan').value=p.jabatan||'Kepala Seksi Survei dan Pemetaan';$('ptPejabat').value=p.pejabat||'';$('ptNip').value=p.nip||'';
    $('ptKantor').value=p.kantor||'Kantor Pertanahan Kabupaten Sumbawa Barat';$('ptProvinsi').value=p.provinsi||'Provinsi Nusa Tenggara Barat';
    $('ptTglTelaah').value=today();$('ptTglSah').value=today();
    $('ptLabelMode').value=p.labelMode||'short';$('ptBase').value=p.base||'0';$('ptScale').value='auto';
    $('ptTheme').value=THEMES[p.theme]?p.theme:'1';$('ptPaper').value=PAPERS[p.paper]?p.paper:'A3';
    shell.querySelectorAll('[data-pt-kkp]').forEach(function(c){c.checked=false;});
    $('ptNibList').innerHTML=list.slice(0,5000).map(function(x){var n=nibOf(x);return n?'<option value="'+esc(n)+'">':'';}).join('');
    shell.classList.add('open');shell.setAttribute('aria-hidden','false');document.body.classList.add('pt-open');st.open=true;st.view='citra';st.pages=[];
    setTimeout(function(){ensureMap();sizeFrame();switchBase();if(mode==='excel')setMode('excel');else{setMode('shp',true);setFeature(f,false);}},60);
  }
  function close(){shell.classList.remove('open');shell.setAttribute('aria-hidden','true');document.body.classList.remove('pt-open');st.open=false;st.token++;}

  shell.addEventListener('click',function(ev){
    if(ev.target===shell||ev.target.closest('[data-pt-close]')){close();return;}
    var tab=ev.target.closest('[data-pt-view]');
    if(tab){st.view=tab.getAttribute('data-pt-view');shell.querySelectorAll('[data-pt-view]').forEach(function(b){b.classList.toggle('on',b===tab);});renderPreview();return;}
    var mode=ev.target.closest('[data-pt-mode]');
    if(mode){if(mode.getAttribute('data-pt-mode')!==st.mode)setMode(mode.getAttribute('data-pt-mode'));return;}
    var z=ev.target.closest('[data-pt-zoom]');
    if(z&&st.feature){var cur=scaleValue(),i=SCALES.indexOf(cur),dir=Number(z.getAttribute('data-pt-zoom'));if(i<0)i=SCALES.length-1;var next=SCALES[Math.max(0,Math.min(SCALES.length-1,i-dir))];if(st.map)st.center=st.map.getCenter();$('ptScale').value=String(next);applyView();renderPreview();}
  });
  shell.addEventListener('change',function(ev){var c=ev.target.closest&&ev.target.closest('[data-pt-page]');if(!c)return;var p=pageById(c.getAttribute('data-pt-page'));if(p)p.on=c.checked;});
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&st.open)close();});
  document.addEventListener('click',function(ev){var b=ev.target.closest&&ev.target.closest('[data-peta-telaah]');if(b&&!shell.contains(b))open(b.getAttribute('data-peta-telaah')==='excel'?'excel':'shp');});
  $('ptNib').addEventListener('change',function(){
    var v=this.value.trim();if(!v)return;
    var f=features().filter(function(x){return nibOf(x)===v;})[0];
    if(!f){var d=v.replace(/\D/g,'');f=d&&features().filter(function(x){return nibOf(x).replace(/\D/g,'').slice(-d.length)===d;})[0];}
    if(!f){toast('NIB '+v+' tidak ditemukan di SHP.',3500);this.value=nibOf(st.feature);return;}
    if(f!==st.feature)chooseFeature(f);
  });
  $('ptScale').addEventListener('change',function(){applyView();renderPreview();});
  $('ptPaper').addEventListener('change',function(){sizeFrame();applyView();renderPreview();});
  $('ptTheme').addEventListener('change',function(){sizeFrame();applyView();renderPreview();});
  $('ptBase').addEventListener('change',function(){switchBase();});
  $('ptPola').addEventListener('change',function(){regen(false);if(st.view==='pola')renderPreview();});
  $('ptLabelMode').addEventListener('change',renderPreview);
  $('ptLuas').addEventListener('input',function(){
    if(!st.edited){regen(false);return;}
    if(!st.feature)return;
    var ll=luasLine(totalArea(),luasInput()),rows=$('ptHasil').value.split('\n'),at=-1;
    rows.forEach(function(r,i){if(at<0&&/^Luas spasial bidang \(/.test(r))at=i;});
    if(at>=0){if(ll)rows[at]=ll;else rows.splice(at,1);}else if(ll){var k=0;while(k<rows.length&&!/^Kawasan hutan|^Bidang beririsan dengan kawasan hutan|^Status kawasan hutan/.test(rows[k]))k++;rows.splice(Math.min(k,rows.length),0,ll);}
    $('ptHasil').value=rows.join('\n');
  });
  shell.querySelectorAll('[data-pt-kkp]').forEach(function(c){c.addEventListener('change',function(){
    var line=KKP.filter(function(k){return k.id===c.getAttribute('data-pt-kkp');})[0].text;
    if(!st.edited){regen(false);return;}
    var rows=$('ptHasil').value.split('\n').filter(function(r){return r.trim()!==line;});
    if(c.checked)rows.push(line);$('ptHasil').value=rows.join('\n');
  });});
  $('ptHasil').addEventListener('input',function(){st.edited=true;$('ptHasilNote').textContent='Disunting manual.';});
  $('ptRegen').addEventListener('click',function(){regen(true);});
  window.addEventListener('resize',function(){if(st.open&&st.map){sizeFrame();applyView();}});

  /* ---------- Bidang dari Excel koordinat ---------- */
  var MAX_FILE=5*1024*1024,MAX_POINTS=2000,KSB_BOX=[115.4,-9.6,117.9,-8.1];
  function loadXlsx(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    if(typeof window.loadOptionalScript==='function')return window.loadOptionalScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','XLSX').then(function(){return window.XLSX;});
    return Promise.reject(new Error('Modul Excel tidak tersedia.'));
  }
  function parseNumber(v){
    if(typeof v==='number')return isFinite(v)?v:NaN;
    var s=String(v==null?'':v).trim().replace(/\s+/g,'');if(!s)return NaN;
    var lastDot=s.lastIndexOf('.'),lastComma=s.lastIndexOf(',');
    if(lastDot>=0&&lastComma>=0){if(lastComma>lastDot)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}
    else if(lastComma>=0){s=(s.match(/,/g).length>1)?s.replace(/,/g,''):s.replace(',','.');}
    else if((s.match(/\./g)||[]).length>1)s=s.replace(/\./g,'');
    return /^[-+]?\d+(\.\d+)?$/.test(s)?Number(s):NaN;
  }
  // Derajat menit detik: 8°47'0"S, 116 51 15 BT, -8 47 0, dsb.
  function parseDms(v){
    var s=String(v==null?'':v).trim().toUpperCase();if(!s)return NaN;
    var m=/^([-+])?\s*(\d{1,3})\s*[°\s:]\s*(\d{1,2})\s*['′:\s]\s*(\d{1,2}(?:[.,]\d+)?)\s*["″]?\s*(LS|LU|BT|BB|[NSEWUTB])?$/.exec(s);
    if(!m)return NaN;
    var val=Number(m[2])+Number(m[3])/60+Number(m[4].replace(',','.'))/3600,h=m[5]||'';
    if(m[1]==='-'||/^(S|LS|W|BB|B)$/.test(h))val=-val;
    return val;
  }
  function cellValue(v){var n=parseNumber(v);return isFinite(n)?n:parseDms(v);}
  var X_KEYS=/^(X|EASTING|TIMUR|BUJUR|LONGITUDE|LONG|LON|LNG|BT|KOORDINATX|KOORDX|E)$/,Y_KEYS=/^(Y|NORTHING|UTARA|LINTANG|LATITUDE|LAT|LS|KOORDINATY|KOORDY|N)$/;
  function normKey(v){return String(v==null?'':v).toUpperCase().replace(/[^A-Z]/g,'');}
  function extractRows(rows){
    var header=-1,xi=-1,yi=-1;
    for(var r=0;r<Math.min(rows.length,15)&&header<0;r++){
      var row=rows[r]||[],xx=-1,yy=-1;
      row.forEach(function(c,i){var k=normKey(c);if(xx<0&&X_KEYS.test(k))xx=i;else if(yy<0&&Y_KEYS.test(k))yy=i;});
      if(xx>=0&&yy>=0){header=r;xi=xx;yi=yy;}
    }
    var data=rows.slice(header+1);
    if(header<0){
      // Tanpa judul kolom: pakai dua kolom angka pertama (lewati kolom nomor urut 1, 2, 3…).
      var first=data.filter(function(r){return r&&r.some(function(c){return isFinite(cellValue(c));});})[0]||[],numeric=[];
      first.forEach(function(c,i){if(isFinite(cellValue(c)))numeric.push(i);});
      if(numeric.length>=3&&Number(cellValue(first[numeric[0]]))===1){xi=numeric[1];yi=numeric[2];}
      else if(numeric.length>=2){xi=numeric[0];yi=numeric[1];}
      else throw new Error('Kolom X dan Y tidak ditemukan. Gunakan template agar formatnya sesuai.');
    }
    var pts=[],skipped=0;
    data.forEach(function(r){if(!r)return;var x=cellValue(r[xi]),y=cellValue(r[yi]);if(isFinite(x)&&isFinite(y))pts.push([x,y]);else if(r.some(function(c){return String(c==null?'':c).trim()!=='';}))skipped++;});
    return {points:pts,skipped:skipped};
  }
  function detectCrs(pts){
    var x=pts[0][0],y=pts[0][1];
    if(Math.abs(x)<=180&&Math.abs(y)<=180){if(Math.abs(x)<=15&&Math.abs(y)>=100)return 'geo-swap';return 'geo';}
    if(x>=100000&&x<=900000&&y>=8500000&&y<=10000000)return 'utm50s';
    if(x>=0&&x<=500000&&y>=300000&&y<=900000)return x>=200000?'tm3-501':'tm3-502';
    return '';
  }
  function toLonLat(pts,crs){
    var notes=[];
    if(crs==='geo-swap'){pts=pts.map(function(p){return [p[1],p[0]];});crs='geo';notes.push('Kolom X/Y tertukar (lintang di kolom X), sudah dibalik otomatis.');}
    if(crs==='geo'){
      if(pts.every(function(p){return p[1]>0&&p[1]<12;})){pts=pts.map(function(p){return [p[0],-p[1]];});notes.push('Lintang tanpa tanda minus dianggap Lintang Selatan.');}
      return {coords:pts,label:'Geografis (WGS 84)',notes:notes};
    }
    var p=CRS[crs];if(!p)throw new Error('Sistem koordinat tidak dikenali. Pilih sistem koordinat secara manual.');
    return {coords:pts.map(function(q){return tmInverse(q[0],q[1],p);}),label:p.label,notes:notes};
  }
  function buildExcelFeature(raw,fileName){
    var pts=raw.points.slice();
    if(pts.length>MAX_POINTS)throw new Error('Jumlah titik melebihi '+MAX_POINTS+'. Satu file hanya untuk satu bidang.');
    if(pts.length>1&&pts[0][0]===pts[pts.length-1][0]&&pts[0][1]===pts[pts.length-1][1])pts.pop();
    if(pts.length<3)throw new Error('Minimal 3 titik koordinat untuk membentuk bidang (terbaca '+pts.length+').');
    var chosen=$('ptCrs').value,crs=chosen==='auto'?detectCrs(pts):chosen;
    if(!crs)throw new Error('Sistem koordinat tidak dapat dideteksi dari nilai X='+pts[0][0]+', Y='+pts[0][1]+'. Pilih sistem koordinat secara manual.');
    var conv=toLonLat(pts,crs),coords=conv.coords;
    var outside=coords.filter(function(c){return !(c[0]>=KSB_BOX[0]&&c[0]<=KSB_BOX[2]&&c[1]>=KSB_BOX[1]&&c[1]<=KSB_BOX[3]);});
    if(outside.length)throw new Error(outside.length+' titik berada di luar wilayah Kabupaten Sumbawa Barat bila dibaca sebagai '+conv.label+'. Periksa sistem koordinat atau urutan kolom X/Y.');
    var ring=coords.concat([coords[0]]);
    try{if(turf.booleanClockwise(ring))ring=ring.slice().reverse();}catch(_e){}
    var feature={type:'Feature',properties:{__SOBAT_EXCEL:true,__SOBAT_EXPLORER_SELECTED:true,__SOBAT_LABEL:$('ptExcelLabel').value.trim(),SUMBER:'Excel koordinat',NAMA_FILE:fileName},geometry:{type:'Polygon',coordinates:[ring]}};
    var warn=conv.notes.slice();
    try{var k=turf.kinks(feature);if(k&&k.features&&k.features.length)warn.push('Garis batas saling berpotongan ('+k.features.length+' titik silang). Periksa urutan titik; luas dan analisis bisa tidak tepat.');}catch(_e2){}
    if(raw.skipped)warn.push(raw.skipped+' baris dilewati karena nilainya bukan koordinat.');
    var area=areaOf(feature);
    if(area<1)throw new Error('Luas bidang dari koordinat hampir nol. Periksa urutan dan nilai koordinat.');
    return {feature:feature,points:pts,lonlat:coords,crs:crs,crsLabel:conv.label,warnings:warn,fileName:fileName,area:area};
  }
  function readExcelFile(file){
    if(file.size>MAX_FILE)return Promise.reject(new Error('Ukuran file melebihi 5 MB.'));
    var ext=(file.name.split('.').pop()||'').toLowerCase();
    if(['xlsx','xls','csv'].indexOf(ext)<0)return Promise.reject(new Error('Gunakan file .xlsx, .xls, atau .csv.'));
    if(ext==='csv')return file.text().then(function(text){text=text.replace(/^\uFEFF/,'');var head=text.split('\n')[0]||'',sep=(head.match(/;/g)||[]).length>=(head.match(/,/g)||[]).length?';':',';return text.split(/\r?\n/).map(function(l){return l.split(sep).map(function(c){return c.replace(/^"|"$/g,'').trim();});});});
    return Promise.all([loadXlsx(),file.arrayBuffer()]).then(function(v){
      var wb=v[0].read(v[1],{type:'array'}),name=wb.SheetNames.filter(function(n){return /koordinat/i.test(n);})[0]||wb.SheetNames[0];
      return v[0].utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:''});
    });
  }
  function renderExcelInfo(error){
    var x=st.excel,box=$('ptExcelInfo');
    if(error){box.innerHTML='<p class="pt-note pt-err"><i class="fas fa-exclamation-circle" aria-hidden="true"></i> '+esc(error)+'</p>';return;}
    if(!x){box.innerHTML='<p class="pt-note">Belum ada file. Unduh template, isi kolom X dan Y sesuai urutan titik batas, lalu unggah.</p>';return;}
    box.innerHTML='<p class="pt-note"><b>'+esc(x.fileName)+'</b>: '+x.points.length+' titik • '+esc(x.crsLabel)+' • luas '+num(x.area)+' m²</p>'+
      x.warnings.map(function(w){return '<p class="pt-note pt-warn"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i> '+esc(w)+'</p>';}).join('')+
      '<div class="pt-xtable"><table><thead><tr><th>No</th><th>X</th><th>Y</th><th>Bujur</th><th>Lintang</th></tr></thead><tbody>'+x.points.slice(0,300).map(function(p,i){return '<tr><td>'+(i+1)+'</td><td>'+esc(p[0])+'</td><td>'+esc(p[1])+'</td><td>'+x.lonlat[i][0].toFixed(7)+'</td><td>'+x.lonlat[i][1].toFixed(7)+'</td></tr>';}).join('')+'</tbody></table></div>';
  }
  function useExcelFeature(){
    var x=st.excel,f=x.feature,e=explorer();
    if(e&&e.clearSelection)e.clearSelection();
    if(st.excelLayer)map.removeLayer(st.excelLayer);
    st.excelLayer=L.geoJSON(f,{interactive:false,style:{color:SUBJECT,weight:4,opacity:1,fillColor:SUBJECT,fillOpacity:.25}}).addTo(map);
    // Analisis kawasan memakai mesin yang sama dengan bidang SHP.
    if(typeof window.runAnalysis==='function'){try{window.runAnalysis({type:'FeatureCollection',features:[f]});}catch(_e){}}
    setFeature(f,false);renderExcelInfo();
  }
  function handleExcel(file){
    $('ptStatus').textContent='Membaca '+file.name+'…';
    readExcelFile(file).then(function(rows){
      var raw=extractRows(rows),x=buildExcelFeature(raw,file.name);
      st.excel=x;useExcelFeature();toast('Bidang dari Excel dimuat: '+x.points.length+' titik, '+num(x.area)+' m².',4000);
    }).catch(function(err){renderExcelInfo(err&&err.message?err.message:'File tidak dapat dibaca.');$('ptStatus').textContent='Excel koordinat gagal dibaca.';});
  }
  $('ptExcelPick').addEventListener('click',function(){excelInput.click();});
  excelInput.addEventListener('change',function(){var f=this.files&&this.files[0];this.value='';if(f)handleExcel(f);});
  $('ptCrs').addEventListener('change',function(){if(!st.excel)return;try{var x=buildExcelFeature({points:st.excel.points,skipped:0},st.excel.fileName);st.excel=x;useExcelFeature();}catch(err){renderExcelInfo(err.message);}});
  $('ptExcelLabel').addEventListener('input',function(){if(st.excel){st.excel.feature.properties.__SOBAT_LABEL=this.value.trim();renderPreview();}});
  function downloadTemplate(){
    var rows=[['No','X','Y','Keterangan'],[1,484470.25,9028560.10,'Contoh UTM 50S. Hapus baris contoh lalu isi data Anda'],[2,484485.40,9028556.80,''],[3,484482.10,9028541.60,''],[4,484466.95,9028544.90,'']];
    var guide=[['PETUNJUK PENGISIAN TEMPLATE KOORDINAT BIDANG — SOBAT TARU'],[''],['1. Satu file untuk satu bidang. Isi lembar "Koordinat" mulai baris ke-2 (baris pertama adalah judul kolom, jangan diubah).'],['2. Isi titik batas berurutan mengelilingi bidang (searah atau berlawanan jarum jam). Titik terakhir tidak perlu mengulang titik pertama.'],['3. Kolom X = Easting/Timur/Bujur, kolom Y = Northing/Utara/Lintang. Minimal 3 titik, maksimal 2.000 titik.'],['4. Sistem koordinat yang didukung:'],['   - UTM Zona 50S WGS 84 (contoh X 484470, Y 9028560)'],['   - TM-3 Zona 50.1 / 50.2 (contoh X 343210, Y 528700)'],['   - Geografis desimal (contoh X 116.8541, Y -8.7834)'],['   - Derajat menit detik (contoh X 116°51\'15"BT, Y 8°47\'0"LS)'],['5. Desimal boleh memakai titik atau koma. Isi berupa nilai, jangan memakai rumus.'],['6. Sistem koordinat dideteksi otomatis; bila keliru, pilih manual di SOBAT TARU.'],['7. Hapus baris contoh sebelum mengisi data Anda.']];
    loadXlsx().then(function(X){
      var wb=X.utils.book_new(),ws=X.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:6},{wch:16},{wch:16},{wch:52}];X.utils.book_append_sheet(wb,ws,'Koordinat');
      var g=X.utils.aoa_to_sheet(guide);g['!cols']=[{wch:120}];X.utils.book_append_sheet(wb,g,'Petunjuk');
      X.writeFile(wb,'Template_Koordinat_Bidang_SOBAT_TARU.xlsx');
    }).catch(function(){
      var csv='\uFEFF'+rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(';');}).join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
      a.href=URL.createObjectURL(blob);a.download='Template_Koordinat_Bidang_SOBAT_TARU.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
      toast('Modul Excel tidak dapat dimuat; template diunduh sebagai CSV yang bisa dibuka di Excel.',5000);
    });
  }
  $('ptExcelTemplate').addEventListener('click',downloadTemplate);

  /* ---------- Cetak ---------- */
  function scaleBar(scale,maxMm){
    var maxM=maxMm*scale/1000,opts=[4,8,20,40,80,100,200,400,800,1000,2000,4000,8000,10000,20000,40000],total=opts[0];
    opts.forEach(function(v){if(v<=maxM)total=v;});
    var q=total/4,w=total*1000/scale;return {total:total,widthMm:w,ticks:w<45?[0,q,2*q,3*q,4*q]:[0,q/2,q,2*q,3*q,4*q]};
  }
  var kecCache=null;
  function kecamatanOutline(){
    if(kecCache)return kecCache;
    var out=[];try{if(window.layer_BatasKecamatanKSB)window.layer_BatasKecamatanKSB.eachLayer(function(l){var f=l.feature||l.toGeoJSON();if(!f||!f.geometry)return;var s=f;try{s=turf.simplify(f,{tolerance:0.002,highQuality:false});}catch(_e){}out.push({type:'Feature',properties:{name:String((f.properties||{}).KECAMATAN||'').replace(/^Kec\.\s*/i,'')},geometry:s.geometry});});}catch(_e2){}
    kecCache=out;return out;
  }
  function collectPayload(){
    var f=st.feature,l=lay(),theme=$('ptTheme').value,scale=scaleValue(),c=st.center||subjectCenter(),zoom=zoomFor(scale,c.lat,0);
    // Luas bingkai cetak di permukaan bumi, dipakai untuk memilih bidang sandingan dan kelas layer.
    var mpp=scale*0.0002645833333,halfW=l.mapW*MM*mpp/2,halfH=l.mapH*MM*mpp/2,kx=111320*Math.cos(c.lat*Math.PI/180),ky=110574;
    var frame=[c.lng-halfW/kx,c.lat-halfH/ky,c.lng+halfW/kx,c.lat+halfH/ky],dx=(frame[2]-frame[0])*.05,dy=(frame[3]-frame[1])*.05,wide=[frame[0]-dx,frame[1]-dy,frame[2]+dx,frame[3]+dy];
    var nb=neighborsIn(wide,4000).map(function(x){return {g:x.geometry,t:labelFor(x),p:labelPoint(x)};});
    var on=st.pages.filter(function(p){return p.on;}),src=polaSource(),base=BASES[Number($('ptBase').value)]||BASES[0];
    var pages=on.map(function(p){
      if(p.kind==='citra')return {kind:'citra',title:'Latar Citra Satelit',source:base.credit};
      var list=layerFeatures(p.id,frame),legend=legendOf(list);
      if(p.kind==='pola')return {kind:'pola',title:'Pola Ruang '+src.label,features:list,legend:legend,source:src.label};
      var r=result(p.id),def=defById(p.id)||{};
      return {kind:'limit',title:p.title,features:list,legend:legend,stat:r?'irisan '+num(r.area)+' m² ('+pct(r.area,totalArea())+')':'',source:p.title+(def.sub?' — '+def.sub:'')};
    });
    var desa=$('ptDesa').value.trim(),kec=$('ptKec').value.trim(),excel=isExcel(f);
    return {
      theme:theme,layout:l,paper:$('ptPaper').value,
      pages:pages,center:[c.lat,c.lng],zoom:zoom,scale:scale,bar:scaleBar(scale,l.side*(theme==='2'?.4:.7)),base:base,
      subject:{g:f.geometry,t:labelFor(f),p:labelPoint(f)},neighbors:nb,kecamatan:theme==='2'?kecamatanOutline():[],kecName:kec,
      title:{jenis:$('ptJenis').value.trim(),pemohon:$('ptPemohon').value.trim().toUpperCase(),luas:$('ptLuas').value.trim(),
        lokasi:desa?$('ptDesaWord').value+' '+desa:'',kec:kec,kab:'Sumbawa Barat',prov:$('ptProvinsi').value.trim()},
      info:{nib:excel?'':nibOf(f),excel:excel,excelFile:excel&&st.excel?st.excel.fileName:'',excelCrs:excel&&st.excel?st.excel.crsLabel:'',luasSpasial:num(totalArea())},
      hasil:$('ptHasil').value.split('\n').map(function(s){return s.trim().replace(/^\d+[\.\)]\s*/,'');}).filter(Boolean),
      telaah:{tgl:dateId($('ptTglTelaah').value),p1:$('ptPenelaah1').value.trim(),p2:$('ptPenelaah2').value.trim()},
      sah:{tgl:dateId($('ptTglSah').value),jabatan:$('ptJabatan').value.trim(),nama:$('ptPejabat').value.trim(),nip:$('ptNip').value.trim()},
      kantor:$('ptKantor').value.trim(),provinsi:$('ptProvinsi').value.trim(),printed:new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}),
      filename:['PETA_TELAAH',excel?'EXCEL':'NIB',excel?'':fileToken(labelFor(f)||nibOf(f)||'TANPA'),fileToken($('ptPemohon').value),fileToken(desa),$('ptPaper').value].filter(Boolean).join('_')
    };
  }

  function sheetCss(R){
    var L0=R.layout,fk=L0.fk,t2=R.theme==='2';
    function mm(v){return v.toFixed(2)+'mm';}function pt(v){return (v*fk).toFixed(2)+'pt';}function sm(v){return mm(v*fk);}
    var css='@page{size:'+L0.pw+'mm '+L0.ph+'mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;color:#000;font-family:Arial,Helvetica,sans-serif}'+
      '.sheet{position:relative;width:'+L0.pw+'mm;height:'+L0.ph+'mm;padding:'+mm(L0.pad)+';display:flex;gap:'+mm(L0.gap)+';overflow:hidden;break-after:page;page-break-after:always;background:#fff}.sheet:last-child{break-after:auto;page-break-after:auto}'+
      '.mapbox{position:relative;flex:0 0 '+mm(L0.boxW)+';height:'+mm(L0.boxH)+';border:'+(t2?'.6mm solid #1b2a33':'.5mm solid #000')+'}'+
      '.map{position:absolute;left:'+mm(L0.inset)+';top:'+mm(L0.inset)+';width:'+mm(L0.mapW)+';height:'+mm(L0.mapH)+';border:.3mm solid #000;background:#fff;overflow:hidden}'+
      '.edge{position:absolute;font-size:'+pt(t2?6.2:6.5)+';white-space:nowrap;color:'+(t2?'#1b2a33':'#000')+'}.edge.t,.edge.b{transform:translateX(-50%)}.edge.t{top:'+mm(L0.inset*.18)+'}.edge.b{bottom:'+mm(L0.inset*.18)+'}.edge.l,.edge.r{transform:translate(-50%,-50%) rotate(-90deg)}.edge.l{left:'+mm(L0.inset/2)+'}.edge.r{left:calc(100% - '+mm(L0.inset/2)+')}'+
      '.edge.utm{color:#4b5d66}.tick{position:absolute;background:#000}.cross{position:absolute;width:3.2mm;height:3.2mm;transform:translate(-50%,-50%);pointer-events:none}.cross:before,.cross:after{content:"";position:absolute;background:'+(t2?'#ffffff':'#29c5ff')+'}.cross:before{left:50%;top:0;width:.35mm;height:100%;margin-left:-.17mm}.cross:after{top:50%;left:0;height:.35mm;width:100%;margin-top:-.17mm}'+
      '.lbl{background:none;border:0}.lbl span{position:absolute;left:0;top:0;transform:translate(-50%,-50%);color:#000;font:700 '+pt(7)+' Arial,sans-serif;white-space:nowrap;-webkit-text-stroke:2px #fff;paint-order:stroke fill;pointer-events:none}.lbl.subj span{color:#9d0057;font-size:'+pt(8)+'}'+
      '.leaflet-control-attribution{display:none}.screen-bar{display:none}'+
      '@media screen{html{background:#dfe6e3}body{width:'+L0.pw+'mm;margin:0 auto}.sheet{margin:0 0 6mm;box-shadow:0 8px 30px rgba(0,0,0,.18)}.screen-bar{position:sticky;top:0;z-index:2000;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#0b4f44;color:#fff;font:13px Arial,sans-serif}.screen-bar button{padding:8px 14px;border:0;border-radius:8px;background:#fff;color:#0b4f44;font-weight:700;cursor:pointer}}'+
      '@media print{.screen-bar{display:none!important}.sheet{margin:0;box-shadow:none}}';
    if(!t2)return css+
      '.side{flex:1 1 auto;height:'+mm(L0.boxH)+';display:flex;flex-direction:column;border:.5mm solid #000;min-width:0}.blk{border-bottom:.35mm solid #000;padding:'+sm(2.2)+' '+sm(3)+'}.blk:last-child{border-bottom:0}'+
      '.ttl{text-align:center;font-family:"Times New Roman",Times,serif;font-weight:700;font-size:'+pt(10.5)+';line-height:1.3}'+
      '.carto{text-align:center;padding-top:'+sm(2)+'}.north{display:inline-block;text-align:center}.north span{display:block;font-weight:700;font-size:'+pt(10)+';line-height:1}.north img{width:'+sm(15)+';height:'+sm(15)+';display:block;margin:0 auto}'+
      '.bar{display:block;margin:'+sm(1.5)+' auto 0}.skala{margin-top:1mm;font-weight:700;font-size:'+pt(10)+'}'+
      '.legend h4,.hasil h4{margin:0 0 '+sm(1.8)+';font-family:"Times New Roman",Times,serif;font-size:'+pt(10)+'}.li{display:flex;align-items:center;gap:'+sm(2.5)+';margin:0 0 '+sm(1.3)+';font-family:"Times New Roman",Times,serif;font-size:'+pt(9.5)+'}.li.cls{font-family:Arial,sans-serif;font-size:'+pt(7.5)+'}.sw{flex:0 0 '+sm(8)+';height:'+sm(4)+'}.latar{margin:0 0 '+sm(1.4)+';font-family:Arial,sans-serif;font-size:'+pt(7.5)+';font-style:italic}'+
      '.hasil{flex:1 1 auto;overflow:hidden}.hasil ol{margin:0;padding-left:'+sm(4.6)+';font-family:"Times New Roman",Times,serif;font-size:'+pt(8.6)+';line-height:1.35}.hasil li{margin:0 0 '+sm(1.6)+';padding-left:.8mm}'+
      '.telaah{width:100%;border-collapse:collapse;font-family:"Times New Roman",Times,serif;font-size:'+pt(7)+'}.telaah td{border:.25mm solid #000;padding:'+sm(1.2)+' '+sm(1.5)+';height:'+sm(6)+';vertical-align:middle}.telaah td.k{width:'+sm(24)+'}.telaah td.c{width:3mm;border-left:0;border-right:0;text-align:center}.telaah td.s{width:'+sm(24)+';text-align:center}'+
      '.sign{text-align:center;font-size:'+pt(9)+';line-height:1.35}.sign .sp{height:'+sm(17)+'}'+
      '.office{display:flex;align-items:center;gap:'+sm(3)+'}.office img{width:'+sm(19)+';height:auto}.office div{flex:1;text-align:center;font-size:'+pt(8.4)+';line-height:1.3}';
    return css+
      '.side{flex:1 1 auto;height:'+mm(L0.boxH)+';display:flex;flex-direction:column;min-width:0;color:#1b2a33;border:.6mm solid #1b2a33}'+
      '.kop{display:flex;align-items:center;gap:'+sm(3)+';padding:'+sm(2.6)+' '+sm(3.2)+';border-bottom:.6mm solid #1b2a33}.kop img{width:'+sm(15)+';height:auto}.kop div{flex:1;line-height:1.25}.kop b{display:block;font-size:'+pt(8.2)+';letter-spacing:.02em}.kop span{display:block;font-size:'+pt(8)+'}'+
      '.sec{padding:'+sm(2.4)+' '+sm(3.2)+';border-bottom:.25mm solid #9aa9b1}.cap{margin:0 0 '+sm(1.4)+';font-size:'+pt(7)+';font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4b5d66}'+
      '.ttl h1{margin:0;font-size:'+pt(11.5)+';line-height:1.25}.ttl .pm{margin:'+sm(1)+' 0 '+sm(1.8)+';font-size:'+pt(10)+';font-weight:700;color:#9d0057}'+
      '.kv{display:grid;grid-template-columns:'+sm(27)+' 1fr;gap:'+sm(.7)+' '+sm(2)+';margin:0;font-size:'+pt(7.8)+';line-height:1.3}.kv dt{color:#4b5d66}.kv dd{margin:0;font-weight:700}'+
      '.tag{display:flex;justify-content:space-between;gap:2mm;margin-top:'+sm(2)+';padding:'+sm(1.2)+' '+sm(2)+';background:#1b2a33;color:#fff;font-size:'+pt(7.4)+';font-weight:700}.tag span:last-child{font-weight:400;text-align:right}'+
      '.carto{display:grid;grid-template-columns:'+sm(16)+' 1fr '+sm(30)+';gap:'+sm(2.4)+';align-items:center}.north{text-align:center}.north span{display:block;font-weight:700;font-size:'+pt(9)+';line-height:1}.north img{width:'+sm(14)+';height:'+sm(14)+';display:block;margin:0 auto}'+
      '.scl{text-align:center;min-width:0}.bar{display:block;margin:0 auto}.skala{margin-top:'+sm(.8)+';font-weight:700;font-size:'+pt(9.5)+'}.proj{font-size:'+pt(6.2)+';color:#4b5d66;line-height:1.3}'+
      '.inset{position:relative;width:'+sm(30)+';height:'+sm(24)+';border:.25mm solid #1b2a33;background:#eef3f6;overflow:hidden}.inset-map{position:absolute;inset:0;background:#eef3f6}.inset small{position:absolute;left:1mm;bottom:.6mm;z-index:500;font-size:'+pt(5.4)+';color:#1b2a33}'+
      '.lg{display:grid;grid-template-columns:1fr 1fr;gap:'+sm(1.2)+' '+sm(2.5)+'}.li{display:flex;align-items:center;gap:'+sm(1.8)+';font-size:'+pt(7.4)+';line-height:1.2}.sw{flex:0 0 '+sm(7)+';height:'+sm(3.6)+'}.stat{margin-top:'+sm(1.4)+';font-size:'+pt(7.2)+';color:#9a3412;font-weight:700}'+
      '.hasil{flex:1 1 auto;overflow:hidden}.hasil ol{margin:0;padding:0;list-style:none;counter-reset:h}.hasil li{position:relative;margin:0 0 '+sm(1.5)+';padding-left:'+sm(6)+';font-size:'+pt(8)+';line-height:1.38}.hasil li:before{counter-increment:h;content:counter(h);position:absolute;left:0;top:'+sm(.2)+';width:'+sm(4.2)+';height:'+sm(4.2)+';border-radius:50%;background:#1b2a33;color:#fff;font-size:'+pt(6.4)+';font-weight:700;line-height:'+sm(4.2)+';text-align:center}'+
      '.sah{border-bottom:0}.sah .sign{width:70%;margin-left:auto}'+
      '.telaah{width:100%;border-collapse:collapse;font-size:'+pt(6.8)+'}.telaah th{background:#1b2a33;color:#fff;font-weight:700;text-align:left;padding:'+sm(1)+' '+sm(1.4)+'}.telaah td{border:.2mm solid #9aa9b1;padding:'+sm(1)+' '+sm(1.4)+';height:'+sm(6.2)+'}.telaah td.s{width:'+sm(13)+'}'+
      '.sign{text-align:center;font-size:'+pt(7.6)+';line-height:1.3}.sign .sp{height:'+sm(13)+'}.sign b{display:block}'+
      '';
  }

  // Dijalankan di tab cetak.
  function sheetMain(R){
    function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function dms(v,lat){var a=Math.abs(v),d=Math.floor(a),mf=(a-d)*60,m=Math.floor(mf),s=Math.round((mf-m)*60*10)/10;if(s>=60){s=0;m++;}if(m>=60){m=0;d++;}return d+'°'+m+"'"+(s%1?s.toFixed(1):s.toFixed(0))+'"'+(lat?(v<0?'S':'N'):(v<0?'W':'E'));}
    // UTM 50S maju (untuk label grid meter pada Tema 2).
    function utm(lon,lat){var a=6378137,f=1/298.257223563,e2=f*(2-f),ep2=e2/(1-e2),k0=.9996,phi=lat*Math.PI/180,l=(lon-117)*Math.PI/180,N=a/Math.sqrt(1-e2*Math.sin(phi)*Math.sin(phi)),T=Math.tan(phi)*Math.tan(phi),C=ep2*Math.cos(phi)*Math.cos(phi),A=Math.cos(phi)*l,M=a*((1-e2/4-3*e2*e2/64-5*e2*e2*e2/256)*phi-(3*e2/8+3*e2*e2/32+45*e2*e2*e2/1024)*Math.sin(2*phi)+(15*e2*e2/256+45*e2*e2*e2/1024)*Math.sin(4*phi)-(35*e2*e2*e2/3072)*Math.sin(6*phi));
      return [k0*N*(A+(1-T+C)*Math.pow(A,3)/6+(5-18*T+T*T+72*C-58*ep2)*Math.pow(A,5)/120)+500000,k0*(M+N*Math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*Math.pow(A,4)/24+(61-58*T+T*T+600*C-330*ep2)*Math.pow(A,6)/720))+10000000];}
    var t2=R.theme==='2',started=false;
    function start(){
      if(started)return;started=true;document.title=R.filename;
      var btn=document.querySelector('.screen-bar button');if(btn)btn.addEventListener('click',function(){window.print();});
      var sheets=[].slice.call(document.querySelectorAll('.sheet')),pending=sheets.length;
      // Hasil analisis yang panjang (mis. kertas A4) dikecilkan hurufnya sampai muat, tidak dipotong.
      [].slice.call(document.querySelectorAll('.hasil')).forEach(function(box){var ol=box.querySelector('ol');if(!ol)return;var base=parseFloat(getComputedStyle(ol.querySelector('li')||ol).fontSize)||12,f=base,guard=0;while(box.scrollHeight>box.clientHeight+1&&f>base*.62&&guard++<30){f*=.95;ol.style.fontSize=f+'px';[].slice.call(ol.children).forEach(function(li){li.style.fontSize=f+'px';li.style.marginBottom=(f*.35)+'px';});}});
      sheets.forEach(function(sheet,idx){
        var page=R.pages[idx],el=sheet.querySelector('.map'),box=sheet.querySelector('.mapbox');
        var map=L.map(el,{zoomControl:false,attributionControl:false,zoomSnap:0,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false,inertia:false,dragging:false,scrollWheelZoom:false,maxZoom:23});
        map.setView(R.center,R.zoom,{animate:false});
        var tiles=null;
        if(page.kind!=='pola')tiles=L.tileLayer(R.base.url,{maxZoom:23,maxNativeZoom:R.base.max}).addTo(map);
        if(page.features){var op=page.kind==='pola';L.geoJSON(page.features,{interactive:false,smoothFactor:0,style:function(f){return {color:f.properties.color,weight:op?.5:1.2,opacity:1,fillColor:f.properties.color,fillOpacity:op?1:.5};}}).addTo(map);}
        var nbGeo=R.neighbors.map(function(n){return {type:'Feature',properties:{},geometry:n.g};});
        if(t2)L.geoJSON(nbGeo,{interactive:false,smoothFactor:0,style:{color:'#1b1b1b',weight:3.2,opacity:.55,fill:false}}).addTo(map);
        L.geoJSON(nbGeo,{interactive:false,smoothFactor:0,style:{color:t2?'#ffc21a':'#f5a300',weight:t2?1.6:1.8,opacity:1,fill:false}}).addTo(map);
        if(t2)L.geoJSON({type:'Feature',properties:{},geometry:R.subject.g},{interactive:false,smoothFactor:0,style:{color:'#ffffff',weight:5.5,opacity:.9,fill:false}}).addTo(map);
        var subj=L.geoJSON({type:'Feature',properties:{},geometry:R.subject.g},{interactive:false,smoothFactor:0,style:{color:'#e6007e',weight:2.8,opacity:1,fill:true,fillColor:'#e6007e',fillOpacity:1}}).addTo(map);
        // Arsir diagonal untuk area permohonan.
        var svg=map.getPanes().overlayPane.querySelector('svg');
        if(svg){var ns='http://www.w3.org/2000/svg',defs=document.createElementNS(ns,'defs'),pat=document.createElementNS(ns,'pattern');pat.setAttribute('id','hatch'+idx);pat.setAttribute('patternUnits','userSpaceOnUse');pat.setAttribute('width','7');pat.setAttribute('height','7');pat.setAttribute('patternTransform','rotate(45)');
          var ln=document.createElementNS(ns,'line');ln.setAttribute('x1','0');ln.setAttribute('y1','0');ln.setAttribute('x2','0');ln.setAttribute('y2','7');ln.setAttribute('stroke','#e6007e');ln.setAttribute('stroke-width','2');pat.appendChild(ln);defs.appendChild(pat);svg.insertBefore(defs,svg.firstChild);
          subj.eachLayer(function(l){if(l._path)l._path.setAttribute('fill','url(#hatch'+idx+')');});}
        var size=map.getSize();
        // Label NIB: bidang dimohon lebih dulu; label yang terpotong tepi atau bertumpuk dilewati.
        var boxes=[],fontPx=9.33*R.layout.fk;
        [R.subject].concat(R.neighbors).forEach(function(n,i){
          if(!n.t)return;var q=map.latLngToContainerPoint([n.p[1],n.p[0]]),w=n.t.length*fontPx*(i?.6:.68)+4,h=fontPx+3,b=[q.x-w/2,q.y-h/2,q.x+w/2,q.y+h/2];
          if(b[0]<2||b[1]<2||b[2]>size.x-2||b[3]>size.y-2)return;
          if(i&&boxes.some(function(o){return !(b[0]>o[2]||b[2]<o[0]||b[1]>o[3]||b[3]<o[1]);}))return;
          boxes.push(b);L.marker([n.p[1],n.p[0]],{interactive:false,keyboard:false,icon:L.divIcon({className:'lbl'+(i?'':' subj'),html:'<span>'+esc(n.t)+'</span>',iconSize:[0,0],iconAnchor:[0,0]})}).addTo(map);
        });
        // Grid koordinat pada tepi bingkai: geografis, dan pada Tema 2 juga UTM 50S (bawah/kanan).
        var b=map.getBounds(),W=b.getWest(),E=b.getEast(),S=b.getSouth(),N=b.getNorth(),off=el.offsetLeft,offT=el.offsetTop;
        function step(spanDeg){var sec=spanDeg*3600,opts=[1,2,3,5,10,15,20,30,60,120,180,300,600,900,1800,3600],best=opts[opts.length-1];for(var i=0;i<opts.length;i++){if(sec/opts[i]<=4){best=opts[i];break;}}return best/3600;}
        var sx=step(E-W),sy=step(N-S),xs=[],ys=[];
        for(var x=Math.ceil(W/sx)*sx;x<=E;x+=sx)xs.push(x);
        for(var y=Math.ceil(S/sy)*sy;y<=N;y+=sy)ys.push(y);
        function add(cls,text,left,top){var n=document.createElement('span');n.className='edge '+cls;n.textContent=text;if(left!=null)n.style.left=left+'px';if(top!=null)n.style.top=top+'px';box.appendChild(n);}
        function tick(l,t,w,h){var n=document.createElement('i');n.className='tick';n.style.left=l+'px';n.style.top=t+'px';n.style.width=w+'px';n.style.height=h+'px';box.appendChild(n);}
        var tk=off*.45;
        xs.forEach(function(x){var px=map.latLngToContainerPoint([(S+N)/2,x]).x;if(px<20||px>size.x-20)return;var l=off+px;add('t',dms(x,false),l,null);if(!t2)add('b',dms(x,false),l,null);tick(l,offT-tk,1,tk);if(!t2)tick(l,offT+size.y,1,tk);});
        ys.forEach(function(y){var py=map.latLngToContainerPoint([y,(W+E)/2]).y;if(py<20||py>size.y-20)return;var t=offT+py;add('l',dms(y,true),null,t);if(!t2)add('r',dms(y,true),null,t);tick(off-tk,t,tk,1);if(!t2)tick(off+size.x,t,tk,1);});
        if(t2){
          var c0=utm(W,S),c1=utm(E,N),span=Math.max(c1[0]-c0[0],1),opts=[10,20,25,50,100,200,250,500,1000,2000,5000],ms=opts[opts.length-1];for(var i=0;i<opts.length;i++){if(span/opts[i]<=5){ms=opts[i];break;}}
          var midLat=(S+N)/2,midLon=(W+E)/2;
          function lonForE(e){var lo=W,hi=E;for(var k=0;k<40;k++){var m=(lo+hi)/2;if(utm(m,midLat)[0]<e)lo=m;else hi=m;}return (lo+hi)/2;}
          function latForN(nv){var lo=S,hi=N;for(var k=0;k<40;k++){var m=(lo+hi)/2;if(utm(midLon,m)[1]<nv)lo=m;else hi=m;}return (lo+hi)/2;}
          for(var e=Math.ceil(c0[0]/ms)*ms;e<=c1[0];e+=ms){var px=map.latLngToContainerPoint([midLat,lonForE(e)]).x;if(px<20||px>size.x-20)continue;add('b utm',e.toLocaleString('id-ID')+' mT',off+px,null);tick(off+px,offT+size.y,1,tk);}
          for(var nn=Math.ceil(c0[1]/ms)*ms;nn<=c1[1];nn+=ms){var py=map.latLngToContainerPoint([latForN(nn),midLon]).y;if(py<20||py>size.y-20)continue;add('r utm',nn.toLocaleString('id-ID')+' mU',null,offT+py);tick(off+size.x,offT+py,tk,1);}
        }
        xs.forEach(function(x){ys.forEach(function(y){var p=map.latLngToContainerPoint([y,x]);if(p.x<10||p.y<10||p.x>size.x-10||p.y>size.y-10)return;var c=document.createElement('i');c.className='cross';c.style.left=p.x+'px';c.style.top=p.y+'px';el.appendChild(c);});});
        // Peta inset lokasi (Tema 2): batas kecamatan KSB dan titik bidang.
        var inEl=sheet.querySelector('.inset-map');
        if(inEl&&R.kecamatan&&R.kecamatan.length){
          var im=L.map(inEl,{zoomControl:false,attributionControl:false,zoomSnap:0,dragging:false,scrollWheelZoom:false,fadeAnimation:false,zoomAnimation:false});
          var kl=L.geoJSON(R.kecamatan,{interactive:false,style:function(f){var on=R.kecName&&String(f.properties.name).toLowerCase()===R.kecName.toLowerCase();return {color:'#55656d',weight:.6,fillColor:on?'#f6c56b':'#ffffff',fillOpacity:1};}}).addTo(im);
          im.fitBounds(kl.getBounds(),{padding:[3,3],animate:false});
          L.circleMarker(R.center,{radius:3.2,color:'#fff',weight:1.2,fillColor:'#e6007e',fillOpacity:1}).addTo(im);
        }
        var ready=false;function done(){if(ready)return;ready=true;pending--;if(pending<=0)setTimeout(function(){window.focus();window.print();},800);}
        if(tiles){tiles.on('load',function(){setTimeout(done,300);});setTimeout(done,8000);}else setTimeout(done,500);
      });
    }
    if(document.readyState==='complete')start();else window.addEventListener('load',start);
  }

  function legendItems(R,page){
    var nb='<div class="li"><svg class="sw" viewBox="0 0 16 8" preserveAspectRatio="none"><rect x="1" y="1" width="14" height="6" fill="none" stroke="'+(R.theme==='2'?'#e0a400':'#f5a300')+'" stroke-width="1.6"/></svg>Bidang Sandingan</div>';
    var sb='<div class="li"><svg class="sw" viewBox="0 0 16 8" preserveAspectRatio="none"><defs><pattern id="lh" patternUnits="userSpaceOnUse" width="2.4" height="2.4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.4" stroke="#e6007e" stroke-width=".7"/></pattern></defs><rect x=".8" y=".8" width="14.4" height="6.4" fill="url(#lh)" stroke="#e6007e" stroke-width="1.4"/></svg>Area Permohonan Bidang Tanah</div>';
    var cls=(page.legend||[]).slice(0,14).map(function(i){return '<div class="li cls"><i class="sw" style="background:'+esc(i.color)+';'+(page.kind==='limit'?'opacity:.75;':'')+'border:.2mm solid rgba(0,0,0,.3)"></i>'+esc(i.label)+'</div>';}).join('');
    return nb+sb+cls;
  }
  function barSvg(bar){
    var w=bar.widthMm,segs='',labels='';
    bar.ticks.forEach(function(v,i){if(i===0)return;var x0=bar.ticks[i-1]/bar.total*w,x1=v/bar.total*w;segs+='<rect x="'+(x0+2).toFixed(2)+'" y="3.4" width="'+(x1-x0).toFixed(2)+'" height="1.6" fill="'+(i%2?'#000':'#fff')+'" stroke="#000" stroke-width=".2"/>';});
    bar.ticks.forEach(function(v){labels+='<text x="'+(v/bar.total*w+2).toFixed(2)+'" y="7.8" font-size="2.4" text-anchor="middle" font-family="Arial">'+v.toLocaleString('id-ID')+'</text>';});
    labels+='<text x="'+(w+2)+'" y="2.6" font-size="2.4" text-anchor="end" font-family="Arial">Meter</text>';
    return '<svg class="bar" width="'+(w+4)+'mm" height="8.5mm" viewBox="0 0 '+(w+4)+' 8.5">'+segs+labels+'</svg>';
  }
  function sideTheme1(R,page){
    var t=R.title,u=function(p){return new URL(p,location.href).href;};
    var lines=[t.jenis,t.pemohon,t.luas?'Luas Permohonan '+t.luas+' M2':'',t.lokasi?'Berlokasi di '+t.lokasi:'',[t.kec?'Kecamatan '+t.kec:'','Kabupaten '+t.kab].filter(Boolean).join(' '),t.prov].filter(Boolean);
    return '<aside class="side">'+
      '<div class="blk ttl">'+lines.map(esc).join('<br>')+'</div>'+
      '<div class="blk carto"><div class="north"><span>U</span><img src="'+u('assets/app/compass-rose.png')+'" alt=""></div>'+barSvg(R.bar)+'<div class="skala">Skala 1:'+R.scale.toLocaleString('id-ID')+'</div></div>'+
      '<div class="blk legend"><h4>Keterangan:</h4>'+(page.kind!=='citra'?'<div class="latar">Peta '+esc(page.title)+(page.stat?' • '+esc(page.stat):'')+'</div>':'')+legendItems(R,page)+'</div>'+
      '<div class="blk hasil"><h4>Hasil Analisis:</h4><ol>'+R.hasil.map(function(h){return '<li>'+esc(h)+'</li>';}).join('')+'</ol></div>'+
      '<div class="blk" style="padding:2mm 2.5mm"><table class="telaah"><tr><td class="k">Ditelaah Tanggal</td><td class="c">:</td><td>'+esc(R.telaah.tgl)+'</td><td class="s">TTD</td></tr><tr><td class="k">Ditelaah Oleh</td><td class="c">:</td><td>'+esc(R.telaah.p1)+'</td><td class="s"></td></tr><tr><td class="k">Ditelaah Oleh</td><td class="c">:</td><td>'+esc(R.telaah.p2)+'</td><td class="s"></td></tr></table></div>'+
      '<div class="blk sign">'+esc(R.sah.tgl)+'<br>Mengetahui,<br>'+esc(R.sah.jabatan)+'<div class="sp"></div>('+esc(R.sah.nama||'………………………………')+')<br>( '+esc(R.sah.nip||'NIP ………………………')+' )</div>'+
      '<div class="blk office"><img src="'+u('assets/app/logo-atr-bpn.jpg')+'" alt=""><div>KEMENTERIAN AGRARIA DAN<br>TATA RUANG/ BADAN PERTANAHAN NASIONAL<br>'+esc(R.kantor)+'<br>'+esc(R.provinsi)+'</div></div>'+
    '</aside>';
  }
  function sideTheme2(R,page,n,total){
    var t=R.title,i=R.info,u=function(p){return new URL(p,location.href).href;};
    var kv=[['NIB',i.excel?'Belum ada (koordinat Excel)':(i.nib||'—')],['Luas permohonan',t.luas?t.luas+' m²':'—'],['Luas spasial',i.luasSpasial+' m²'],['Lokasi',[t.lokasi,t.kec?'Kec. '+t.kec:''].filter(Boolean).join(', ')||'—'],['Kabupaten','Sumbawa Barat, '+String(t.prov||'').replace(/^Provinsi\s+/i,'')]];
    return '<aside class="side">'+
      '<header class="kop"><img src="'+u('assets/app/logo-atr-bpn.jpg')+'" alt=""><div><b>KEMENTERIAN AGRARIA DAN TATA RUANG/</b><b>BADAN PERTANAHAN NASIONAL</b><span>'+esc(R.kantor)+'</span><span>'+esc(R.provinsi)+'</span></div></header>'+
      '<section class="sec ttl"><p class="cap">Peta Telaah Spasial</p><h1>'+esc(t.jenis||'Permohonan')+'</h1>'+(t.pemohon?'<div class="pm">'+esc(t.pemohon)+'</div>':'<div class="pm" style="color:#9aa9b1">Nama pemohon belum diisi</div>')+
        '<dl class="kv">'+kv.map(function(r){return '<dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd>';}).join('')+'</dl>'+
        '<div class="tag"><span>Lembar '+n+' dari '+total+'</span><span>'+esc(page.title)+'</span></div></section>'+
      '<section class="sec carto"><div class="north"><span>U</span><img src="'+u('assets/app/compass-rose.png')+'" alt=""></div><div class="scl">'+barSvg(R.bar)+'<div class="skala">Skala 1 : '+R.scale.toLocaleString('id-ID')+'</div><div class="proj">Datum WGS 84 • grid geografis<br>dan UTM Zona 50S (meter)</div></div><div class="inset"><div class="inset-map"></div><small>Kab. Sumbawa Barat</small></div></section>'+
      '<section class="sec"><p class="cap">Keterangan</p><div class="lg">'+legendItems(R,page)+'</div>'+(page.stat?'<div class="stat">'+esc(page.title)+': '+esc(page.stat)+'</div>':'')+'</section>'+
      '<section class="sec hasil"><p class="cap">Hasil Analisis</p><ol>'+R.hasil.map(function(h){return '<li>'+esc(h)+'</li>';}).join('')+'</ol></section>'+
      '<section class="sec tl"><p class="cap">Ditelaah oleh</p><table class="telaah"><tr><th style="width:30%">Penelaah</th><th>Nama</th><th class="s">Paraf</th></tr><tr><td>Penelaah 1</td><td>'+esc(R.telaah.p1)+'</td><td class="s"></td></tr><tr><td>Penelaah 2</td><td>'+esc(R.telaah.p2)+'</td><td class="s"></td></tr><tr><td>Tanggal telaah</td><td colspan="2">'+esc(R.telaah.tgl)+'</td></tr></table></section>'+
      '<section class="sec sah"><div class="sign">'+esc(R.sah.tgl)+'<br>Mengetahui,<b>'+esc(R.sah.jabatan)+'</b><div class="sp"></div><b>'+esc(R.sah.nama||'………………………………')+'</b>NIP '+esc(R.sah.nip||'………………………')+'</div></section>'+
    '</aside>';
  }
  function printNow(){
    if(!st.feature){toast(st.mode==='excel'?'Unggah Excel koordinat bidang terlebih dahulu.':'Pilih bidang yang dimohon terlebih dahulu.',4000);return;}
    if(!st.pages.some(function(p){return p.on;})){toast('Pilih minimal satu halaman yang dicetak.',3500);return;}
    var win=window.open('','_blank');
    if(!win){toast('Izinkan pop-up untuk membuka Peta Telaah.',5000);return;}
    try{win.document.write('<!doctype html><title>Menyiapkan peta telaah…</title><p style="font:15px Arial,sans-serif;padding:32px;color:#0b3b35">Menyiapkan Peta Telaah Spasial…</p>');win.document.close();}catch(_e){}
    var p=prefs(),ids={jenis:'ptJenis',penelaah1:'ptPenelaah1',penelaah2:'ptPenelaah2',jabatan:'ptJabatan',pejabat:'ptPejabat',nip:'ptNip',kantor:'ptKantor',provinsi:'ptProvinsi',labelMode:'ptLabelMode',base:'ptBase',theme:'ptTheme',paper:'ptPaper'};
    Object.keys(ids).forEach(function(k){p[k]=$(ids[k]).value;});savePrefs(p);
    if(!$('ptPemohon').value.trim())toast('Nama pemohon belum diisi; judul peta dicetak tanpa nama pemohon.',4500);
    var R=collectPayload(),u=function(x){return new URL(x,location.href).href;},n=R.pages.length;
    var body=R.pages.map(function(page,i){return '<section class="sheet"><div class="mapbox"><div class="map"></div></div>'+(R.theme==='2'?sideTheme2(R,page,i+1,n):sideTheme1(R,page))+'</section>';}).join('');
    var paper=PAPERS[R.paper]||PAPERS.A3;
    var doc='<!doctype html><html lang="id"><head><meta charset="utf-8"><title>'+esc(R.filename)+'</title><link rel="stylesheet" href="'+u('css/leaflet.css')+'"><style>'+sheetCss(R)+'</style></head><body>'+
      '<div class="screen-bar"><span>Pratinjau Peta Telaah Spasial ('+n+' halaman). Pada dialog cetak pilih kertas <b>'+esc(paper.label)+'</b>, orientasi <b>Lanskap</b>, margin <b>Tidak ada</b>, dan skala <b>100%</b> agar skala peta tepat, lalu <b>Simpan sebagai PDF</b>.</span><button type="button">Cetak / Simpan PDF</button></div>'+
      body+'<script src="'+u('js/leaflet.js')+'"><\/script><script>('+sheetMain.toString()+')('+JSON.stringify(R).replace(/</g,'\\u003c')+');<\/script></body></html>';
    try{win.location.replace(URL.createObjectURL(new Blob([doc],{type:'text/html;charset=utf-8'})));}
    catch(_blob){win.document.open();win.document.write(doc);win.document.close();}
    toast('Peta Telaah dibuka di tab baru ('+n+' halaman '+R.paper+').',5000);
  }
  $('ptPrint').addEventListener('click',printNow);

  window.sobatOpenPetaTelaah=open;
})();
