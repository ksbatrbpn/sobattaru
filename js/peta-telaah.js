/*
 * SOBAT TARU — Peta Telaah Permohonan (A3 lanskap), dari menu Eksplorasi Bidang.
 * Alur: unggah SHP bidang (Eksplorasi Bidang) → pilih NIB yang dimohon → isi formulir
 * (pemohon, luas, penelaah, pejabat) → draf "Hasil Analisis" disusun otomatis dari irisan
 * kawasan hutan, PIPPIB, LSD, LP2B, pola ruang, dan tumpang tindih dengan bidang lain di SHP
 * → cetak satu/dua halaman A3: latar citra satelit dan latar pola ruang (RDTR/RTRW).
 * Bidang lain di SHP tampil sebagai "Bidang Sandingan" berlabel NIB.
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
  function fileToken(v){return String(v||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);}

  var PREF_KEY='sobatTaruPetaTelaah';
  function prefs(){try{return JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{};}catch(_e){return {};}}
  function savePrefs(p){try{localStorage.setItem(PREF_KEY,JSON.stringify(p));}catch(_e){}}

  var BASES=[
    {name:'Google Satellite',url:'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',max:20},
    {name:'Google Hybrid',url:'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',max:20},
    {name:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',max:19}
  ];
  var POLA=[
    {id:'rdtr-taliwang',label:'RDTR Perkotaan Taliwang',text:'Rencana Detail Tata Ruang (RDTR) Perkotaan Taliwang',layer:'layer_RDTRTALIWANG_2',field:'NAMAOBJ'},
    {id:'rdtr-maluk',label:'RDTR Sekitar Kawasan Industri Maluk',text:'Rencana Detail Tata Ruang (RDTR) Sekitar Kawasan Industri Maluk',layer:'layer_RDTRMALUK_1',field:'NAMOBJ'},
    {id:'rtrw',label:'RTRW Kabupaten Sumbawa Barat',text:'Rencana Tata Ruang Wilayah (RTRW) Kabupaten Sumbawa Barat',layer:'layer_RTRWSUMBAWABARAT20202040_3',field:'NAMOBJ'},
    {id:'rtrw-provinsi',label:'RTRW Provinsi NTB',text:'Rencana Tata Ruang Wilayah (RTRW) Provinsi Nusa Tenggara Barat',layer:'layer_RTRWPROVINSINTB20242044_7',field:'NAMOBJ'}
  ];
  var SCALES=[200,250,500,750,1000,1500,2000,2500,3000,4000,5000,7500,10000,15000,20000,25000,50000];
  var JENIS=['Permohonan SK Pemberian Hak Dengan Konstatasi','Permohonan SK Pemberian Hak','Permohonan Pendaftaran Tanah Pertama Kali','Permohonan Pengukuran dan Pemetaan Bidang','Permohonan Pemecahan Bidang','Permohonan Penggabungan Bidang','Permohonan Pengembalian Batas','Permohonan Peralihan Hak'];
  var KKP=[
    {id:'nib',text:'NIB yang dimohonkan sama dengan NIB pada KKP.'},
    {id:'luas',text:'Luas spasial dan tekstual KKP sudah sesuai dengan PBT yang dimohon.'},
    {id:'hgu',text:'Areal tidak terindikasi tumpang tindih dengan HGU Terdaftar KKP.'}
  ];
  // Ukuran halaman A3 lanskap (mm): bingkai peta kiri, panel keterangan kanan.
  var MAP_W=286,MAP_H=271,MM=96/25.4;
  var SUBJECT='#e6007e',NEIGHBOR='#f5a300';

  /* ---------- Dialog ---------- */
  var style=document.createElement('style');
  style.textContent=
    '.pt-shell{position:fixed;inset:0;z-index:30000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(6,30,26,.55)}.pt-shell.open{display:flex}'+
    '.pt-dialog{display:flex;flex-direction:column;width:min(1240px,100%);height:min(860px,100%);overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:inherit;color:#1d2b29}'+
    '.pt-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e1ebe8}.pt-head h2{margin:0;color:#0b4f44;font-size:17px}.pt-head p{margin:3px 0 0;color:#5b6e69;font-size:12px}'+
    '.pt-close{flex:0 0 auto;width:34px;height:34px;border:0;border-radius:50%;background:#eef4f2;color:#0b4f44;font-size:20px;cursor:pointer}'+
    '.pt-body{flex:1 1 auto;display:grid;grid-template-columns:minmax(0,1fr) 390px;min-height:0}'+
    '.pt-preview{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;padding:12px;background:#eef3f1}'+
    '.pt-tabs{display:flex;gap:6px;flex-wrap:wrap}.pt-tab{padding:6px 11px;border:1px solid #c9dad5;border-radius:999px;background:#fff;color:#0b4f44;font-size:12px;font-weight:700;cursor:pointer}.pt-tab.on{background:#0b4f44;border-color:#0b4f44;color:#fff}'+
    '.pt-frame-wrap{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}'+
    '.pt-frame{position:relative;width:100%;max-height:100%;aspect-ratio:'+MAP_W+'/'+MAP_H+';border:2px solid #1d2b29;background:#fff}.pt-map{position:absolute;inset:0}'+
    '.pt-badge{position:absolute;z-index:500;left:8px;bottom:8px;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.92);font-size:11px;font-weight:700;color:#0b4f44;pointer-events:none}'+
    '.pt-zoom{position:absolute;z-index:500;left:8px;top:8px;display:flex;flex-direction:column;gap:4px}.pt-zoom button{width:30px;height:30px;border:1px solid #9fb3ad;border-radius:7px;background:#fff;color:#0b4f44;font:700 18px/1 Arial,sans-serif;cursor:pointer}.pt-hint{margin:0;color:#4f625d;font-size:11.5px}'+
    '.pt-form{min-height:0;overflow:auto;padding:12px 14px 18px;border-left:1px solid #e1ebe8}'+
    '.pt-sec{margin:0 0 12px;padding:10px 11px;border:1px solid #dbe7e3;border-radius:11px;background:#fbfdfc}.pt-sec h3{margin:0 0 8px;color:#0b5e4f;font-size:12.5px;display:flex;align-items:center;gap:6px}'+
    '.pt-sec label{display:block;margin:0 0 7px;color:#41544f;font-size:11px;font-weight:700}.pt-sec label>input,.pt-sec label>select,.pt-sec label>textarea{display:block;box-sizing:border-box;width:100%;margin-top:3px;padding:7px 8px;border:1px solid #c9d8d4;border-radius:7px;background:#fff;color:#1d2b29;font:inherit;font-size:12.5px;font-weight:400}'+
    '.pt-sec textarea{min-height:170px;resize:vertical;line-height:1.45}'+
    '.pt-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pt-row3{display:grid;grid-template-columns:110px 1fr;gap:8px}'+
    '.pt-check{display:flex!important;align-items:flex-start;gap:7px;font-weight:600!important;line-height:1.35}.pt-sec label.pt-check>input{flex:0 0 auto;display:inline-block;width:auto;margin:2px 0 0;padding:0}'+
    '.pt-subject{padding:8px 9px;border-radius:8px;background:#fff0f8;border:1px solid #f6c3df;font-size:12px;line-height:1.45}.pt-subject b{color:#9d0057}'+
    '.pt-note{margin:4px 0 0;color:#5b6e69;font-size:10.5px;line-height:1.4}.pt-warn{color:#9a4a00}'+
    '.pt-mini{padding:5px 9px;border:1px solid #c9dad5;border-radius:7px;background:#fff;color:#0b4f44;font-size:11px;font-weight:700;cursor:pointer}'+
    '.pt-foot{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:11px 16px;border-top:1px solid #e1ebe8}.pt-foot span{margin-right:auto;color:#5b6e69;font-size:11.5px}'+
    '.pt-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border:1px solid #c9dad5;border-radius:9px;background:#fff;color:#0b4f44;font-weight:800;font-size:13px;cursor:pointer}.pt-btn.primary{background:#0b4f44;border-color:#0b4f44;color:#fff}.pt-btn:disabled{opacity:.55;cursor:wait}'+
    '.pt-label{background:none;border:0}.pt-label span{position:absolute;left:0;top:0;transform:translate(-50%,-50%);color:#111;font:700 10px Arial,sans-serif;white-space:nowrap;text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 3px #fff;pointer-events:none}'+
    '.pt-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11px;color:#30413d}.pt-legend i{display:inline-block;width:16px;height:10px;margin-right:5px;vertical-align:-1px}'+
    'body.pt-open .field-explorer-toggle{visibility:hidden}'+
    '@media(max-width:820px){.pt-shell{padding:0}.pt-dialog{height:100%;border-radius:0}.pt-body{grid-template-columns:1fr;grid-template-rows:42vh minmax(0,1fr)}.pt-form{border-left:0;border-top:1px solid #e1ebe8}.pt-row{grid-template-columns:1fr}}';
  document.head.appendChild(style);

  var shell=document.createElement('div');
  shell.className='pt-shell';shell.id='petaTelaahModal';shell.setAttribute('aria-hidden','true');
  shell.innerHTML=
    '<section class="pt-dialog" role="dialog" aria-modal="true" aria-labelledby="ptTitle">'+
      '<header class="pt-head"><div><h2 id="ptTitle">Peta Telaah Permohonan (A3)</h2><p>Pilih NIB yang dimohon, lengkapi isian, lalu cetak. Geser peta pratinjau untuk mengatur posisi; tombol +/− atau pilihan skala mengatur skala cetak.</p></div><button class="pt-close" type="button" data-pt-close aria-label="Tutup">×</button></header>'+
      '<div class="pt-body">'+
        '<div class="pt-preview">'+
          '<div class="pt-tabs" role="tablist"><button type="button" class="pt-tab on" data-pt-view="citra">Halaman citra satelit</button><button type="button" class="pt-tab" data-pt-view="pola">Halaman pola ruang</button></div>'+
          '<div class="pt-frame-wrap"><div class="pt-frame" id="ptFrame"><div id="ptMap" class="pt-map"></div><div class="pt-badge" id="ptBadge">Skala 1 : 500</div><div class="pt-zoom"><button type="button" data-pt-zoom="1" aria-label="Perbesar (skala lebih detail)">+</button><button type="button" data-pt-zoom="-1" aria-label="Perkecil">−</button></div></div></div>'+
          '<div class="pt-legend" id="ptLegend"></div>'+
          '<p class="pt-hint">Klik bidang sandingan di pratinjau untuk menjadikannya bidang yang dimohon.</p>'+
        '</div>'+
        '<div class="pt-form" id="ptForm">'+
          '<section class="pt-sec"><h3><i class="fas fa-vector-square" aria-hidden="true"></i>Bidang yang dimohon</h3>'+
            '<label>NIB<input id="ptNib" list="ptNibList" autocomplete="off" placeholder="Ketik atau pilih NIB…"></label><datalist id="ptNibList"></datalist>'+
            '<div class="pt-subject" id="ptSubject"></div></section>'+
          '<section class="pt-sec"><h3><i class="fas fa-heading" aria-hidden="true"></i>Judul peta</h3>'+
            '<label>Jenis permohonan<input id="ptJenis" list="ptJenisList"></label><datalist id="ptJenisList">'+JENIS.map(function(j){return '<option value="'+esc(j)+'">';}).join('')+'</datalist>'+
            '<label>Nama pemohon<input id="ptPemohon" placeholder="mis. HAIRUDDIN"></label>'+
            '<label>Luas permohonan (m², tekstual)<input id="ptLuas" inputmode="decimal" placeholder="mis. 120"></label>'+
            '<div class="pt-row3"><label>Wilayah<select id="ptDesaWord"><option>Kelurahan</option><option>Desa</option></select></label><label>Nama desa/kelurahan<input id="ptDesa"></label></div>'+
            '<label>Kecamatan<input id="ptKec"></label></section>'+
          '<section class="pt-sec"><h3><i class="fas fa-map" aria-hidden="true"></i>Tampilan peta</h3>'+
            '<label class="pt-check"><input type="checkbox" id="ptPageCitra" checked>Halaman latar citra satelit</label>'+
            '<label class="pt-check"><input type="checkbox" id="ptPagePola" checked>Halaman latar pola ruang</label>'+
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
            '<p class="pt-note">Nama penelaah, pejabat, dan kantor diingat di perangkat ini untuk cetakan berikutnya.</p></section>'+
        '</div>'+
      '</div>'+
      '<footer class="pt-foot"><span id="ptStatus"></span><button class="pt-btn" type="button" data-pt-close>Batal</button><button class="pt-btn primary" id="ptPrint" type="button"><i class="fas fa-file-pdf" aria-hidden="true"></i>Cetak Peta Telaah</button></footer>'+
    '</section>';
  document.body.appendChild(shell);
  $('ptScale').innerHTML='<option value="auto">Otomatis</option>'+SCALES.map(function(s){return '<option value="'+s+'">1 : '+s.toLocaleString('id-ID')+'</option>';}).join('');

  var st={open:false,feature:null,index:-1,model:null,villages:null,map:null,base:null,groups:null,view:'citra',center:null,edited:false,token:0,frameW:0};

  /* ---------- Data bidang dari Eksplorasi Bidang ---------- */
  function explorer(){return window.sobatExplorer||null;}
  function features(){var e=explorer();return e?e.features():[];}
  function nibOf(f){var e=explorer();var v=e?e.value(f,'nib'):'';return String(v==null?'':v).trim();}
  function labelFor(f){
    var mode=$('ptLabelMode').value,nib=nibOf(f);if(mode==='none'||!nib)return '';
    if(mode==='full')return nib;
    var digits=nib.replace(/\D/g,'');return digits.length>5?digits.slice(-5):nib;
  }
  function attr(f,name){var e=explorer();var v=e?e.value(f,name):'';return String(v==null?'':v).trim();}
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
  function catText(r,total){var a=r.categories.map(function(c){var p=pct(c.area,total);return c.name+(r.categories.length>1?' ('+num(c.area)+' m²'+(p?', '+p:'')+')':'');});return a.length>1?a.slice(0,-1).join(', ')+' dan '+a[a.length-1]:a.join('');}
  function defaultPola(){
    for(var i=0;i<POLA.length;i++){var r=result(POLA[i].id);if(r&&r.inside)return POLA[i].id;}
    return 'rtrw';
  }
  // Tumpang tindih bidang yang dimohon dengan bidang lain di SHP yang diunggah (persil terdaftar).
  function overlaps(){
    var f=st.feature,b=boxOf(f),rows=[];
    features().forEach(function(o){
      if(o===f||!boxesOverlap(boxOf(o),b))return;
      try{if(!turf.booleanIntersects(f,o))return;var hit=turf.intersect(f,o);if(!hit)return;var a=areaOf(hit);if(a>=1)rows.push({nib:nibOf(o)||'tanpa NIB',area:a});}catch(_e){}
    });
    return rows;
  }
  function autoLines(){
    var m=st.model,lines=[],kkp={};
    shell.querySelectorAll('[data-pt-kkp]').forEach(function(c){kkp[c.getAttribute('data-pt-kkp')]=c.checked;});
    var total=m?m.model.total:areaOf(st.feature),luas=Number(String($('ptLuas').value||'').replace(/\./g,'').replace(',','.'));
    if(kkp.nib)lines.push(KKP[0].text);
    if(kkp.luas)lines.push(KKP[1].text);
    if(luas>0){var diff=total-luas;lines.push(Math.abs(diff)<=Math.max(1,luas*0.01)?'Luas spasial bidang ('+num(total)+' m²) sesuai dengan luas permohonan ('+num(luas)+' m²).':'Luas spasial bidang ('+num(total)+' m²) berselisih '+num(Math.abs(diff))+' m² ('+pct(Math.abs(diff),luas)+') dari luas permohonan ('+num(luas)+' m²).');}
    if(!m){lines.push('(Menunggu hasil analisis kawasan…)');return lines;}
    total=m.model.total;
    var hutan=result('sigap'),forest=hutan&&hutan.forest,hutanPending=!hutan||hutan.pending;
    if(hutanPending)lines.push('Status kawasan hutan belum dapat dipastikan (data SIGAP belum termuat).');
    else if(forest)lines.push('Bidang beririsan dengan kawasan hutan: '+hutan.categories.filter(function(c){return !/areal penggunaan lain|^apl$/i.test(c.name);}).map(function(c){return c.name+' '+num(c.area)+' m² ('+pct(c.area,total)+')';}).join(', ')+'.');
    else lines.push('Kawasan hutan clear and clean.');
    var pippib=result('pippib');
    lines.push(pippib&&pippib.inside?'Bidang beririsan dengan kawasan PIPPIB ('+catText(pippib,total)+') seluas '+num(pippib.area)+' m² ('+pct(pippib.area,total)+').':'Kawasan PIPPIB clear and clean.');
    var ov=overlaps();
    lines.push(ov.length?'Areal terindikasi tumpang tindih dengan '+ov.length+' persil terdaftar: '+ov.slice(0,6).map(function(o){return 'NIB '+o.nib+' ('+num(o.area)+' m²)';}).join(', ')+(ov.length>6?' dan '+(ov.length-6)+' bidang lain':'')+'.':'Areal tidak terindikasi tumpang tindih dengan Persil Terdaftar KKP.');
    if(kkp.hgu)lines.push(KKP[2].text);
    var src=POLA.filter(function(p){return p.id===$('ptPola').value;})[0]||POLA[2],pr=result(src.id);
    if(pr&&pr.inside){var whole=pr.categories.length===1&&pr.area>=total*0.99;lines.push('Bidang Permohonan Tata Guna Lahan berdasarkan '+src.text+(whole?' masuk dalam kawasan ':' masuk dalam kawasan ')+catText(pr,total)+(whole?'':pr.area<total*0.99?'; sisanya ('+num(total-pr.area)+' m²) di luar cakupan '+src.label:'')+'.');}
    else lines.push('Bidang Permohonan berada di luar cakupan '+src.label+'.');
    var lsd=result('lsd');
    lines.push(lsd&&lsd.inside?'Bidang yang dimohon masuk dalam kawasan LSD KSB seluas '+num(lsd.area)+' m² ('+pct(lsd.area,total)+').':'Bidang yang dimohon tidak masuk dalam kawasan LSD KSB.');
    var lp2b=result('lp2b');
    if(lp2b&&lp2b.inside)lines.push('Bidang beririsan dengan LP2B Hasil Verifikasi Usulan tahun 2026 seluas '+num(lp2b.area)+' m² ('+pct(lp2b.area,total)+'), belum merupakan penetapan.');
    if(!hutanPending&&!forest)lines.push('Permohonan bidang di luar kawasan hutan.');
    return lines;
  }
  function regen(force){
    if(st.edited&&!force)return;
    $('ptHasil').value=autoLines().join('\n');
    st.edited=false;
    $('ptHasilNote').textContent=st.model?'Disusun otomatis.':'Analisis kawasan sedang berjalan…';
  }

  /* ---------- Skala dan pratinjau ---------- */
  function subjectCenter(){var b=boxOf(st.feature);return L.latLng((b[1]+b[3])/2,(b[0]+b[2])/2);}
  function scaleValue(){
    var v=$('ptScale').value;if(v!=='auto')return Number(v);
    var b=boxOf(st.feature),lat=(b[1]+b[3])/2,w=(b[2]-b[0])*111320*Math.cos(lat*Math.PI/180),h=(b[3]-b[1])*110574;
    for(var i=0;i<SCALES.length;i++){var s=SCALES[i];if(w<=MAP_W*s/1000*0.2&&h<=MAP_H*s/1000*0.2)return s;}
    return SCALES[SCALES.length-1];
  }
  function zoomFor(scale,lat,widthPx){
    // Zoom cetak: 1 piksel CSS = 0,2646 mm; zoom pratinjau disesuaikan dengan lebar bingkai.
    var mpp=scale*0.0002645833333,z=Math.log(156543.03392*Math.cos(lat*Math.PI/180)/mpp)/Math.LN2;
    return widthPx?z-Math.log(MAP_W*MM/widthPx)/Math.LN2:z;
  }
  function frameWidth(){return $('ptMap').clientWidth||1;}
  function applyView(){
    if(!st.map)return;
    var scale=scaleValue(),c=st.center||subjectCenter();
    st.applying=true;st.map.setView(c,zoomFor(scale,c.lat,frameWidth()),{animate:false});st.applying=false;
    $('ptBadge').textContent='Skala 1 : '+scale.toLocaleString('id-ID')+($('ptScale').value==='auto'?' (otomatis)':'');
  }
  function polaSource(){return POLA.filter(function(p){return p.id===$('ptPola').value;})[0]||POLA[2];}
  function polaFeatures(bbox){
    var src=polaSource(),layer=window[src.layer],out=[];
    if(!layer||!layer.eachLayer)return out;
    var view=turf.bboxPolygon(bbox);
    layer.eachLayer(function(sub){
      var f=sub.feature;if(!f||!f.geometry)return;
      var b;try{var lb=sub.getBounds();b=[lb.getWest(),lb.getSouth(),lb.getEast(),lb.getNorth()];}catch(_e){b=turf.bbox(f);}
      if(!boxesOverlap(b,bbox))return;
      try{if(!turf.booleanIntersects(f,view))return;}catch(_e2){}
      var o=sub.options||{},name=String((f.properties||{})[src.field]||'').replace(/\s+/g,' ').trim()||'Tanpa keterangan';
      out.push({type:'Feature',properties:{name:name,color:o.fillColor||o.color||'#cccccc'},geometry:f.geometry});
    });
    return out;
  }
  function viewBbox(pad){
    var b=st.map.getBounds(),dx=(b.getEast()-b.getWest())*(pad||0),dy=(b.getNorth()-b.getSouth())*(pad||0);
    return [b.getWest()-dx,b.getSouth()-dy,b.getEast()+dx,b.getNorth()+dy];
  }
  function neighborsIn(bbox,limit){
    var out=[];features().some(function(f){if(f!==st.feature&&boxesOverlap(boxOf(f),bbox))out.push(f);return out.length>=(limit||3000);});return out;
  }
  function legendItems(polaList){
    var items=[{kind:'neighbor',label:'Bidang Sandingan'},{kind:'subject',label:'Bidang Tanah yang Dimohon'}];
    if(polaList){var seen={};polaList.forEach(function(f){var n=f.properties.name;if(!seen[n]){seen[n]=1;items.push({kind:'pola',label:n,color:f.properties.color});}});}
    return items;
  }
  function renderPreview(){
    if(!st.map||!st.feature)return;
    var g=st.groups;g.pola.clearLayers();g.neighbors.clearLayers();g.labels.clearLayers();g.subject.clearLayers();
    var bbox=viewBbox(0.1),pola=st.view==='pola';
    if(pola){if(st.base&&st.map.hasLayer(st.base))st.map.removeLayer(st.base);}
    else if(st.base&&!st.map.hasLayer(st.base))st.base.addTo(st.map);
    var polaList=pola?polaFeatures(viewBbox(0)):null;
    if(polaList)L.geoJSON(polaList,{interactive:false,style:function(f){return {color:f.properties.color,weight:.6,opacity:1,fillColor:f.properties.color,fillOpacity:.9};}}).addTo(g.pola);
    var list=neighborsIn(bbox,2500);
    L.geoJSON(list,{style:{color:NEIGHBOR,weight:2,opacity:1,fill:true,fillOpacity:0},onEachFeature:function(f,layer){layer.on('click',function(){var e=explorer();if(e)chooseFeature(f);});layer.bindTooltip('NIB '+(nibOf(f)||'—'),{sticky:true});}}).addTo(g.neighbors);
    L.geoJSON(st.feature,{interactive:false,style:{color:SUBJECT,weight:3,opacity:1,fillColor:SUBJECT,fillOpacity:.28}}).addTo(g.subject);
    var zoomOk=st.map.getZoom()>=16;
    if(zoomOk)list.concat([st.feature]).slice(0,600).forEach(function(f){var t=labelFor(f);if(!t)return;var p=labelPoint(f);L.marker([p[1],p[0]],{interactive:false,keyboard:false,icon:L.divIcon({className:'pt-label',html:'<span>'+esc(t)+'</span>',iconSize:[0,0],iconAnchor:[0,0]})}).addTo(g.labels);});
    $('ptLegend').innerHTML=legendItems(polaList).map(function(i){return '<span><i style="'+(i.kind==='subject'?'border:2px solid '+SUBJECT+';background:repeating-linear-gradient(45deg,'+SUBJECT+' 0 1.5px,transparent 1.5px 4px)':i.kind==='neighbor'?'border:2px solid '+NEIGHBOR:'background:'+esc(i.color)+';border:1px solid rgba(0,0,0,.2)')+'"></i>'+esc(i.label)+'</span>';}).join('');
  }
  var previewTimer=null;
  function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,120);}
  function ensureMap(){
    if(st.map)return st.map;
    var m=L.map('ptMap',{zoomControl:false,attributionControl:false,zoomSnap:0,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,boxZoom:false,keyboard:false,minZoom:6,maxZoom:23});
    st.map=m;st.groups={pola:L.layerGroup().addTo(m),neighbors:L.layerGroup().addTo(m),subject:L.layerGroup().addTo(m),labels:L.layerGroup().addTo(m)};
    m.on('dragend',function(){st.center=m.getCenter();schedulePreview();});
    m.on('moveend',schedulePreview);
    return m;
  }
  function switchBase(){
    var b=BASES[Number($('ptBase').value)]||BASES[0];
    if(st.base)st.map.removeLayer(st.base);
    st.base=L.tileLayer(b.url,{maxZoom:22,maxNativeZoom:b.max});
    if(st.view!=='pola')st.base.addTo(st.map);
    st.base.bringToBack&&st.base.bringToBack();
  }

  /* ---------- Isian ---------- */
  function subjectInfo(){
    var f=st.feature,e=explorer(),cad=e?e.cadastral(f):0,total=st.model?st.model.model.total:areaOf(f);
    $('ptSubject').innerHTML='<b>NIB '+esc(nibOf(f)||'tidak tersedia')+'</b><br>Luas spasial '+num(total)+' m²'+(cad?' • luas atribut '+num(cad)+' m²':'')+(attr(f,'right')?' • '+esc(attr(f,'right')):'')+'<br>'+esc([attr(f,'village'),attr(f,'district')].filter(Boolean).join(', ')||'Wilayah dari atribut SHP tidak tersedia');
  }
  function fillAdmin(){
    var f=st.feature,v=(st.villages||[])[0];
    var desa=attr(f,'village')||(v&&v.name)||'',kec=(attr(f,'district')||(v&&v.kecamatan)||(st.model&&st.model.model.kecamatan)||'').replace(/^Kec(amatan)?\.?\s*/i,'');
    $('ptDesa').value=titleCase(desa);$('ptKec').value=titleCase(kec);
    if(v)$('ptDesaWord').value=v.kelurahan?'Kelurahan':'Desa';
  }
  function titleCase(s){s=String(s||'').trim();return s===s.toUpperCase()?s.toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g,function(_m,a,b){return a+b.toUpperCase();}):s;}
  function setFeature(f,keepForm){
    st.feature=f;st.center=null;st.model=null;st.villages=null;
    var token=++st.token;
    $('ptNib').value=nibOf(f);
    if(!keepForm){var e=explorer(),cad=e?e.cadastral(f):0;$('ptLuas').value=cad?String(Math.round(cad)):'';}
    subjectInfo();fillAdmin();regen(true);
    if(st.map){applyView();renderPreview();}
    $('ptStatus').textContent='Menganalisis bidang…';
    var la=modelFor(f);
    (la?Promise.resolve(la):waitModel(f,token)).then(function(res){
      if(token!==st.token)return;
      if(!res){$('ptStatus').textContent='Analisis kawasan belum tersedia. Butir hasil analisis perlu diisi manual.';return;}
      st.model=res;$('ptPola').value=defaultPola();subjectInfo();regen(false);renderPreview();
      $('ptStatus').textContent='Analisis selesai.';
      Promise.resolve(res.villagesReady).then(function(){if(token!==st.token)return;st.villages=res.villages;var before=$('ptDesa').value;fillAdmin();if(!before&&$('ptDesa').value)$('ptStatus').textContent='Analisis selesai.';});
    });
  }
  function chooseFeature(f){
    var e=explorer();if(!e)return;var i=features().indexOf(f);if(i<0)return;
    e.select(i);setFeature(f,false);
  }

  function open(){
    var e=explorer(),list=features(),i=e?e.selectedIndex():-1,f=list[i];
    if(!e||!list.length){toast('Unggah SHP bidang (lebih dari satu poligon) melalui Unggah SHP/KML terlebih dahulu.',5000);return;}
    if(!f){toast('Pilih bidang (NIB) yang dimohon pada daftar Eksplorasi Bidang terlebih dahulu.',4500);return;}
    var p=prefs();
    $('ptJenis').value=p.jenis||JENIS[0];$('ptPemohon').value='';
    $('ptPenelaah1').value=p.penelaah1||'';$('ptPenelaah2').value=p.penelaah2||'';
    $('ptJabatan').value=p.jabatan||'Kepala Seksi Survei dan Pemetaan';$('ptPejabat').value=p.pejabat||'';$('ptNip').value=p.nip||'';
    $('ptKantor').value=p.kantor||'Kantor Pertanahan Kabupaten Sumbawa Barat';$('ptProvinsi').value=p.provinsi||'Provinsi Nusa Tenggara Barat';
    $('ptTglTelaah').value=today();$('ptTglSah').value=today();
    $('ptLabelMode').value=p.labelMode||'short';$('ptBase').value=p.base||'0';$('ptScale').value='auto';
    shell.querySelectorAll('[data-pt-kkp]').forEach(function(c){c.checked=false;});
    $('ptNibList').innerHTML=list.slice(0,5000).map(function(x){var n=nibOf(x);return n?'<option value="'+esc(n)+'">':'';}).join('');
    shell.classList.add('open');shell.setAttribute('aria-hidden','false');document.body.classList.add('pt-open');st.open=true;
    st.view='citra';shell.querySelectorAll('[data-pt-view]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-pt-view')==='citra');});
    setTimeout(function(){ensureMap();st.map.invalidateSize();switchBase();setFeature(f,false);},60);
  }
  function close(){shell.classList.remove('open');shell.setAttribute('aria-hidden','true');document.body.classList.remove('pt-open');st.open=false;st.token++;}

  shell.addEventListener('click',function(ev){
    if(ev.target===shell||ev.target.closest('[data-pt-close]')){close();return;}
    var tab=ev.target.closest('[data-pt-view]');
    if(tab){st.view=tab.getAttribute('data-pt-view');shell.querySelectorAll('[data-pt-view]').forEach(function(b){b.classList.toggle('on',b===tab);});renderPreview();return;}
  });
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&st.open)close();});
  document.addEventListener('click',function(ev){var b=ev.target.closest&&ev.target.closest('[data-peta-telaah]');if(b&&!shell.contains(b))open();});
  $('ptNib').addEventListener('change',function(){
    var v=this.value.trim();if(!v)return;
    var f=features().filter(function(x){return nibOf(x)===v;})[0];
    if(!f){var d=v.replace(/\D/g,'');f=d&&features().filter(function(x){return nibOf(x).replace(/\D/g,'').slice(-d.length)===d;})[0];}
    if(!f){toast('NIB '+v+' tidak ditemukan di SHP.',3500);this.value=nibOf(st.feature);return;}
    if(f!==st.feature)chooseFeature(f);
  });
  $('ptScale').addEventListener('change',function(){applyView();renderPreview();});
  // Tombol +/− berpindah ke skala standar berikutnya (pratinjau selalu pada skala cetak).
  shell.addEventListener('click',function(ev){var z=ev.target.closest('[data-pt-zoom]');if(!z||!st.feature)return;var cur=scaleValue(),i=SCALES.indexOf(cur),dir=Number(z.getAttribute('data-pt-zoom'));if(i<0)i=SCALES.length-1;var next=SCALES[Math.max(0,Math.min(SCALES.length-1,i-dir))];if(st.map)st.center=st.map.getCenter();$('ptScale').value=String(next);applyView();renderPreview();});
  $('ptBase').addEventListener('change',function(){switchBase();});
  $('ptPola').addEventListener('change',function(){regen(false);if(st.view==='pola')renderPreview();});
  $('ptLabelMode').addEventListener('change',renderPreview);
  $('ptLuas').addEventListener('input',function(){regen(false);});
  shell.querySelectorAll('[data-pt-kkp]').forEach(function(c){c.addEventListener('change',function(){
    var line=KKP.filter(function(k){return k.id===c.getAttribute('data-pt-kkp');})[0].text;
    if(!st.edited){regen(false);return;}
    var rows=$('ptHasil').value.split('\n').filter(function(r){return r.trim()!==line;});
    if(c.checked)rows.push(line);$('ptHasil').value=rows.join('\n');
  });});
  $('ptHasil').addEventListener('input',function(){st.edited=true;$('ptHasilNote').textContent='Disunting manual.';});
  $('ptRegen').addEventListener('click',function(){regen(true);});
  window.addEventListener('resize',function(){if(st.open&&st.map){st.map.invalidateSize();applyView();}});

  /* ---------- Cetak A3 ---------- */
  function scaleBar(scale){
    var maxM=80*scale/1000,opts=[4,8,20,40,80,100,200,400,800,1000,2000,4000,8000,10000,20000,40000],total=opts[0];
    opts.forEach(function(v){if(v<=maxM)total=v;});
    var q=total/4,ticks=[0,q/2,q,2*q,3*q,4*q];
    return {total:total,widthMm:total*1000/scale,ticks:ticks};
  }
  function collectPayload(){
    var f=st.feature,scale=scaleValue(),c=st.center||subjectCenter(),zoom=zoomFor(scale,c.lat,0);
    // Luas bingkai cetak di permukaan bumi, dipakai untuk memilih bidang sandingan dan kelas pola ruang.
    var mpp=scale*0.0002645833333,halfW=MAP_W*MM*mpp/2,halfH=MAP_H*MM*mpp/2,kx=111320*Math.cos(c.lat*Math.PI/180),ky=110574;
    var bbox=[c.lng-halfW/kx*1.05,c.lat-halfH/ky*1.05,c.lng+halfW/kx*1.05,c.lat+halfH/ky*1.05];
    var nb=neighborsIn(bbox,4000).map(function(x){return {g:x.geometry,t:labelFor(x),p:labelPoint(x)};});
    var pages=[];
    if($('ptPageCitra').checked)pages.push({kind:'citra'});
    if($('ptPagePola').checked){var pf=polaFeatures([c.lng-halfW/kx,c.lat-halfH/ky,c.lng+halfW/kx,c.lat+halfH/ky]);pages.push({kind:'pola',features:pf,legend:legendItems(pf).slice(2)});}
    var base=BASES[Number($('ptBase').value)]||BASES[0];
    var desa=$('ptDesa').value.trim(),kec=$('ptKec').value.trim();
    return {
      pages:pages,center:[c.lat,c.lng],zoom:zoom,scale:scale,bar:scaleBar(scale),base:base,
      subject:{g:f.geometry,t:labelFor(f),p:labelPoint(f)},neighbors:nb,
      title:{jenis:$('ptJenis').value.trim(),pemohon:$('ptPemohon').value.trim().toUpperCase(),luas:$('ptLuas').value.trim(),
        lokasi:desa?$('ptDesaWord').value+' '+desa:'',kec:kec,kab:'Sumbawa Barat',prov:$('ptProvinsi').value.trim()},
      hasil:$('ptHasil').value.split('\n').map(function(s){return s.trim().replace(/^\d+[\.\)]\s*/,'');}).filter(Boolean),
      telaah:{tgl:dateId($('ptTglTelaah').value),p1:$('ptPenelaah1').value.trim(),p2:$('ptPenelaah2').value.trim()},
      sah:{tgl:dateId($('ptTglSah').value),jabatan:$('ptJabatan').value.trim(),nama:$('ptPejabat').value.trim(),nip:$('ptNip').value.trim()},
      kantor:$('ptKantor').value.trim(),provinsi:$('ptProvinsi').value.trim(),
      filename:['PETA_TELAAH','NIB',fileToken(nibOf(f)||'TANPA'),fileToken($('ptPemohon').value),fileToken(desa)].filter(Boolean).join('_')
    };
  }

  var SHEET_CSS=
    '@page{size:A3 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;color:#000;font-family:Arial,Helvetica,sans-serif}'+
    '.sheet{position:relative;width:420mm;height:297mm;padding:7mm;display:flex;gap:4mm;overflow:hidden;break-after:page;page-break-after:always;background:#fff}.sheet:last-child{break-after:auto;page-break-after:auto}'+
    '.mapbox{position:relative;flex:0 0 '+(MAP_W+12)+'mm;height:283mm;border:.5mm solid #000}.map{position:absolute;left:6mm;top:6mm;width:'+MAP_W+'mm;height:'+MAP_H+'mm;border:.3mm solid #000;background:#fff;overflow:hidden}'+
    '.edge{position:absolute;font-size:6.5pt;white-space:nowrap;color:#000}.edge.t,.edge.b{transform:translateX(-50%)}.edge.t{top:1.4mm}.edge.b{bottom:1.4mm}.edge.l,.edge.r{transform:translate(-50%,-50%) rotate(-90deg)}.edge.l{left:3mm}.edge.r{left:calc(100% - 3mm)}'+
    '.tick{position:absolute;background:#000}.cross{position:absolute;width:3.2mm;height:3.2mm;transform:translate(-50%,-50%);pointer-events:none}.cross:before,.cross:after{content:"";position:absolute;background:#29c5ff}.cross:before{left:50%;top:0;width:.35mm;height:100%;margin-left:-.17mm}.cross:after{top:50%;left:0;height:.35mm;width:100%;margin-top:-.17mm}'+
    '.side{flex:1 1 auto;height:283mm;display:flex;flex-direction:column;border:.5mm solid #000}.blk{border-bottom:.35mm solid #000;padding:2.2mm 3mm}.blk:last-child{border-bottom:0}'+
    '.ttl{text-align:center;font-family:"Times New Roman",Times,serif;font-weight:700;font-size:10.5pt;line-height:1.3}'+
    '.carto{text-align:center;padding-top:2mm}.north{display:inline-block;text-align:center}.north span{display:block;font-weight:700;font-size:10pt;line-height:1}.north img{width:15mm;height:15mm;display:block;margin:0 auto}'+
    '.bar{display:block;margin:1.5mm auto 0}.skala{margin-top:1mm;font-weight:700;font-size:10pt}'+
    '.legend h4,.hasil h4{margin:0 0 1.8mm;font-family:"Times New Roman",Times,serif;font-size:10pt}.li{display:flex;align-items:center;gap:2.5mm;margin:0 0 1.3mm;font-family:"Times New Roman",Times,serif;font-size:9.5pt}.li.pola{font-family:Arial,sans-serif;font-size:7.5pt}.sw{flex:0 0 8mm;height:4mm}'+
    '.hasil{flex:1 1 auto;overflow:hidden}.hasil ol{margin:0;padding-left:4.6mm;font-family:"Times New Roman",Times,serif;font-size:8.6pt;line-height:1.35}.hasil li{margin:0 0 1.6mm;padding-left:.8mm}'+
    '.telaah{width:100%;border-collapse:collapse;font-family:"Times New Roman",Times,serif;font-size:7pt}.telaah td{border:.25mm solid #000;padding:1.2mm 1.5mm;height:6mm;vertical-align:middle}.telaah td.k{width:24mm}.telaah td.c{width:3mm;border-left:0;border-right:0;text-align:center}.telaah td.s{width:24mm;text-align:center}'+
    '.sign{text-align:center;font-size:9pt;line-height:1.35}.sign .sp{height:17mm}'+
    '.office{display:flex;align-items:center;gap:3mm}.office img{width:19mm;height:auto}.office div{flex:1;text-align:center;font-size:8.4pt;line-height:1.3}'+
    '.lbl{background:none;border:0}.lbl span{position:absolute;left:0;top:0;transform:translate(-50%,-50%);color:#000;font:700 7pt Arial,sans-serif;white-space:nowrap;text-shadow:-.5px -.5px 0 #fff,.5px -.5px 0 #fff,-.5px .5px 0 #fff,.5px .5px 0 #fff,0 0 2px #fff;pointer-events:none}'+
    '.leaflet-control-attribution{display:none}.screen-bar{display:none}'+
    '@media screen{html{background:#dfe6e3}body{width:420mm;margin:0 auto}.sheet{margin:0 0 6mm;box-shadow:0 8px 30px rgba(0,0,0,.18)}.screen-bar{position:sticky;top:0;z-index:2000;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#0b4f44;color:#fff;font:13px Arial,sans-serif}.screen-bar button{padding:8px 14px;border:0;border-radius:8px;background:#fff;color:#0b4f44;font-weight:700;cursor:pointer}}'+
    '@media print{.screen-bar{display:none!important}.sheet{margin:0;box-shadow:none}}';

  // Dijalankan di tab cetak.
  function sheetMain(R){
    function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function dms(v,lat){var a=Math.abs(v),d=Math.floor(a),mf=(a-d)*60,m=Math.floor(mf),s=Math.round((mf-m)*60*10)/10;if(s>=60){s=0;m++;}if(m>=60){m=0;d++;}return d+'°'+m+"'"+(s%1?s.toFixed(1):s.toFixed(0))+'"'+(lat?(v<0?'S':'N'):(v<0?'W':'E'));}
    var started=false;
    function start(){
      if(started)return;started=true;document.title=R.filename;
      var btn=document.querySelector('.screen-bar button');if(btn)btn.addEventListener('click',function(){window.print();});
      var sheets=[].slice.call(document.querySelectorAll('.sheet')),pending=sheets.length;
      sheets.forEach(function(sheet,idx){
        var page=R.pages[idx],el=sheet.querySelector('.map'),box=sheet.querySelector('.mapbox');
        var map=L.map(el,{zoomControl:false,attributionControl:false,zoomSnap:0,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false,inertia:false,dragging:false,scrollWheelZoom:false,maxZoom:23});
        map.setView(R.center,R.zoom,{animate:false});
        var tiles=null;
        if(page.kind==='citra')tiles=L.tileLayer(R.base.url,{maxZoom:23,maxNativeZoom:R.base.max}).addTo(map);
        else L.geoJSON(page.features,{interactive:false,smoothFactor:0,style:function(f){return {color:f.properties.color,weight:.5,opacity:1,fillColor:f.properties.color,fillOpacity:1};}}).addTo(map);
        var nbStyle={color:'#f5a300',weight:1.8,opacity:1,fill:false};
        L.geoJSON(R.neighbors.map(function(n){return {type:'Feature',properties:{},geometry:n.g};}),{interactive:false,smoothFactor:0,style:nbStyle}).addTo(map);
        var subj=L.geoJSON({type:'Feature',properties:{},geometry:R.subject.g},{interactive:false,smoothFactor:0,style:{color:'#e6007e',weight:2.6,opacity:1,fill:true,fillColor:'#e6007e',fillOpacity:1}}).addTo(map);
        // Arsir diagonal untuk area permohonan.
        var svg=map.getPanes().overlayPane.querySelector('svg');
        if(svg){var ns='http://www.w3.org/2000/svg',defs=document.createElementNS(ns,'defs'),pat=document.createElementNS(ns,'pattern');pat.setAttribute('id','hatch'+idx);pat.setAttribute('patternUnits','userSpaceOnUse');pat.setAttribute('width','7');pat.setAttribute('height','7');pat.setAttribute('patternTransform','rotate(45)');
          var ln=document.createElementNS(ns,'line');ln.setAttribute('x1','0');ln.setAttribute('y1','0');ln.setAttribute('x2','0');ln.setAttribute('y2','7');ln.setAttribute('stroke','#e6007e');ln.setAttribute('stroke-width','2');pat.appendChild(ln);defs.appendChild(pat);svg.insertBefore(defs,svg.firstChild);
          subj.eachLayer(function(l){if(l._path)l._path.setAttribute('fill','url(#hatch'+idx+')');});}
        R.neighbors.concat([R.subject]).forEach(function(n){if(!n.t)return;L.marker([n.p[1],n.p[0]],{interactive:false,keyboard:false,icon:L.divIcon({className:'lbl',html:'<span>'+esc(n.t)+'</span>',iconSize:[0,0],iconAnchor:[0,0]})}).addTo(map);});
        // Grid koordinat geografis pada tepi bingkai dan tanda silang di dalam peta.
        var b=map.getBounds(),W=b.getWest(),E=b.getEast(),S=b.getSouth(),N=b.getNorth(),sz=map.getSize(),off=el.offsetLeft;
        function step(spanDeg){var sec=spanDeg*3600,opts=[1,2,3,5,10,15,20,30,60,120,180,300,600,900,1800,3600],best=opts[opts.length-1];for(var i=0;i<opts.length;i++){if(sec/opts[i]<=4){best=opts[i];break;}}return best/3600;}
        var sx=step(E-W),sy=step(N-S),xs=[],ys=[];
        for(var x=Math.ceil(W/sx)*sx;x<=E;x+=sx)xs.push(x);
        for(var y=Math.ceil(S/sy)*sy;y<=N;y+=sy)ys.push(y);
        function add(cls,text,left,top){var n=document.createElement('span');n.className='edge '+cls;n.textContent=text;if(left!=null)n.style.left=left+'px';if(top!=null)n.style.top=top+'px';box.appendChild(n);}
        function tick(l,t,w,h){var n=document.createElement('i');n.className='tick';n.style.left=l+'px';n.style.top=t+'px';n.style.width=w+'px';n.style.height=h+'px';box.appendChild(n);}
        xs.forEach(function(x){var px=map.latLngToContainerPoint([(S+N)/2,x]).x;if(px<20||px>sz.x-20)return;var l=off+px;add('t',dms(x,false),l,null);add('b',dms(x,false),l,null);tick(l,off-6,1,6);tick(l,off+sz.y,1,6);});
        ys.forEach(function(y){var py=map.latLngToContainerPoint([y,(W+E)/2]).y;if(py<20||py>sz.y-20)return;var t=off+py;add('l',dms(y,true),null,t);add('r',dms(y,true),null,t);tick(off-6,t,6,1);tick(off+sz.x,t,6,1);});
        xs.forEach(function(x){ys.forEach(function(y){var p=map.latLngToContainerPoint([y,x]);if(p.x<10||p.y<10||p.x>sz.x-10||p.y>sz.y-10)return;var c=document.createElement('i');c.className='cross';c.style.left=p.x+'px';c.style.top=p.y+'px';el.appendChild(c);});});
        var ready=false;function done(){if(ready)return;ready=true;pending--;if(pending<=0)setTimeout(function(){window.focus();window.print();},800);}
        if(tiles){tiles.on('load',function(){setTimeout(done,300);});setTimeout(done,8000);}else setTimeout(done,400);
      });
    }
    if(document.readyState==='complete')start();else window.addEventListener('load',start);
  }

  function sideHtml(R,page){
    var t=R.title,u=function(p){return new URL(p,location.href).href;};
    var lines=[t.jenis,t.pemohon,t.luas?'Luas Permohonan '+t.luas+' M2':'',t.lokasi?'Berlokasi di '+t.lokasi:'',[t.kec?'Kecamatan '+t.kec:'','Kabupaten '+t.kab].filter(Boolean).join(' '),t.prov].filter(Boolean);
    var bar=R.bar,w=bar.widthMm,segs='',labels='';
    bar.ticks.forEach(function(v,i){if(i===0)return;var x0=bar.ticks[i-1]/bar.total*w,x1=v/bar.total*w;segs+='<rect x="'+(x0+2).toFixed(2)+'" y="3.4" width="'+(x1-x0).toFixed(2)+'" height="1.6" fill="'+(i%2?'#000':'#fff')+'" stroke="#000" stroke-width=".2"/>';});
    bar.ticks.forEach(function(v){var x=v/bar.total*w+2;labels+='<text x="'+x.toFixed(2)+'" y="7.8" font-size="2.4" text-anchor="middle" font-family="Arial">'+v.toLocaleString('id-ID')+'</text>';});
    labels+='<text x="'+(w+2)+'" y="2.6" font-size="2.4" text-anchor="end" font-family="Arial">Meter</text>';
    var svg='<svg class="bar" width="'+(w+4)+'mm" height="8.5mm" viewBox="0 0 '+(w+4)+' 8.5">'+segs+labels+'</svg>';
    var legend='<div class="li"><i class="sw" style="border:.45mm solid #f5a300"></i>Bidang Sandingan</div><div class="li"><svg class="sw" viewBox="0 0 16 8" preserveAspectRatio="none"><defs><pattern id="lh" patternUnits="userSpaceOnUse" width="2.4" height="2.4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.4" stroke="#e6007e" stroke-width=".7"/></pattern></defs><rect x=".6" y=".6" width="14.8" height="6.8" fill="url(#lh)" stroke="#e6007e" stroke-width="1.2"/></svg>Area Permohonan Bidang Tanah</div>'+
      (page.kind==='pola'?(page.legend||[]).slice(0,12).map(function(i){return '<div class="li pola"><i class="sw" style="background:'+esc(i.color)+';border:.2mm solid rgba(0,0,0,.25)"></i>'+esc(i.label)+'</div>';}).join(''):'');
    return '<aside class="side">'+
      '<div class="blk ttl">'+lines.map(esc).join('<br>')+'</div>'+
      '<div class="blk carto"><div class="north"><span>U</span><img src="'+u('assets/app/compass-rose.png')+'" alt=""></div>'+svg+'<div class="skala">Skala 1:'+R.scale.toLocaleString('id-ID')+'</div></div>'+
      '<div class="blk legend"><h4>Keterangan:</h4>'+legend+'</div>'+
      '<div class="blk hasil"><h4>Hasil Analisis:</h4><ol>'+R.hasil.map(function(h){return '<li>'+esc(h)+'</li>';}).join('')+'</ol></div>'+
      '<div class="blk" style="padding:2mm 2.5mm"><table class="telaah"><tr><td class="k">Ditelaah Tanggal</td><td class="c">:</td><td>'+esc(R.telaah.tgl)+'</td><td class="s">TTD</td></tr><tr><td class="k">Ditelaah Oleh</td><td class="c">:</td><td>'+esc(R.telaah.p1)+'</td><td class="s"></td></tr><tr><td class="k">Ditelaah Oleh</td><td class="c">:</td><td>'+esc(R.telaah.p2)+'</td><td class="s"></td></tr></table></div>'+
      '<div class="blk sign">'+esc(R.sah.tgl)+'<br>Mengetahui,<br>'+esc(R.sah.jabatan)+'<div class="sp"></div>('+esc(R.sah.nama||'………………………………')+')<br>( '+esc(R.sah.nip||'NIP ………………………')+' )</div>'+
      '<div class="blk office"><img src="'+u('assets/app/logo-atr-bpn.jpg')+'" alt=""><div>KEMENTERIAN AGRARIA DAN<br>TATA RUANG/ BADAN PERTANAHAN NASIONAL<br>'+esc(R.kantor)+'<br>'+esc(R.provinsi)+'</div></div>'+
    '</aside>';
  }
  function printNow(){
    if(!st.feature)return;
    if(!$('ptPageCitra').checked&&!$('ptPagePola').checked){toast('Pilih minimal satu halaman (citra atau pola ruang).',3500);return;}
    var win=window.open('','_blank');
    if(!win){toast('Izinkan pop-up untuk membuka Peta Telaah.',5000);return;}
    try{win.document.write('<!doctype html><title>Menyiapkan peta telaah…</title><p style="font:15px Arial,sans-serif;padding:32px;color:#0b3b35">Menyiapkan Peta Telaah A3…</p>');win.document.close();}catch(_e){}
    var p=prefs();['jenis','penelaah1','penelaah2','jabatan','pejabat','nip','kantor','provinsi','labelMode','base'].forEach(function(k){var id={jenis:'ptJenis',penelaah1:'ptPenelaah1',penelaah2:'ptPenelaah2',jabatan:'ptJabatan',pejabat:'ptPejabat',nip:'ptNip',kantor:'ptKantor',provinsi:'ptProvinsi',labelMode:'ptLabelMode',base:'ptBase'}[k];p[k]=$(id).value;});savePrefs(p);
    var R=collectPayload(),u=function(x){return new URL(x,location.href).href;};
    var body=R.pages.map(function(page){return '<section class="sheet"><div class="mapbox"><div class="map"></div></div>'+sideHtml(R,page)+'</section>';}).join('');
    var doc='<!doctype html><html lang="id"><head><meta charset="utf-8"><title>'+esc(R.filename)+'</title><link rel="stylesheet" href="'+u('css/leaflet.css')+'"><style>'+SHEET_CSS+'</style></head><body>'+
      '<div class="screen-bar"><span>Pratinjau Peta Telaah A3. Pada dialog cetak pilih ukuran kertas <b>A3</b>, orientasi <b>Lanskap</b>, margin <b>Tidak ada</b>, dan skala <b>100%</b> agar skala peta tepat, lalu <b>Simpan sebagai PDF</b>.</span><button type="button">Cetak / Simpan PDF</button></div>'+
      body+'<script src="'+u('js/leaflet.js')+'"><\/script><script>('+sheetMain.toString()+')('+JSON.stringify(R)+');<\/script></body></html>';
    try{win.location.replace(URL.createObjectURL(new Blob([doc],{type:'text/html;charset=utf-8'})));}
    catch(_blob){win.document.open();win.document.write(doc);win.document.close();}
    toast('Peta Telaah dibuka di tab baru. Pilih A3 lanskap lalu “Simpan sebagai PDF”.',5000);
  }
  $('ptPrint').addEventListener('click',printNow);

  window.sobatOpenPetaTelaah=open;
})();
