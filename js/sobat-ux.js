/*
 * SOBAT TARU — tata letak antarmuka 2026.
 * Panel layer di kiri, pencarian dan menu di header, panel hasil analisis di kanan,
 * dan navigasi bawah untuk HP. Semua fungsi lama (layer, analisis, alat, unggah)
 * tetap dipakai; berkas ini hanya menata ulang cara pengguna menjangkaunya.
 */
(function(){
  'use strict';
  if(!window.L||!window.map)return;

  var phoneQuery=window.matchMedia('(max-width:760px)');
  function isPhone(){return phoneQuery.matches;}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function $(id){return document.getElementById(id);}
  function store(key,value){try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value);}catch(_storageError){}return null;}
  function append(html){var holder=document.createElement('div');holder.innerHTML=html.trim();var node=holder.firstChild;document.body.appendChild(node);return node;}

  /* ---------- Struktur DOM baru ---------- */
  var layerPanel=append(
    '<aside id="stLayerPanel" class="st-panel st-layer-panel" aria-label="Layer Tata Ruang" hidden>'+
      '<div class="st-panel-head"><div><h2><svg class="st-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1 7.5l11 5.5 11-5.5L12 2zm0 13.2L3.4 10.9 1 12.1l11 5.5 11-5.5-2.4-1.2L12 15.2zm0 4.5-8.6-4.3L1 16.6 12 22l11-5.4-2.4-1.2L12 19.7z"/></svg>Layer Tata Ruang</h2>'+
      '<p>Nyalakan layer untuk menampilkannya di peta. Klik peta untuk analisis titik.</p></div>'+
      '<button class="st-close" type="button" data-st-close="layers" aria-label="Tutup panel layer">&times;</button></div>'+
      '<div class="st-panel-body">'+
        '<div class="st-section-label">Peta dasar</div>'+
        '<div id="stBasemapSegment" class="st-segment" role="radiogroup" aria-label="Peta dasar"></div>'+
        '<div class="st-section-label"><i class="fas fa-map-marker-alt" aria-hidden="true"></i>Kabupaten Sumbawa Barat</div>'+
        '<div id="stLayerTreeSlot"></div>'+
        '<div class="st-layer-foot">Data RTRW, RDTR, LSD, LP2B, LBS, dan PIPPIB disinkronkan otomatis dari <b>Bale Ruang NTB</b>. Analisis memakai seluruh data meskipun layer tidak ditampilkan.</div>'+
      '</div>'+
    '</aside>');

  var resultPanel=append(
    '<aside id="stResultPanel" class="st-panel st-result-panel" aria-label="Analisis Spasial Koordinat" hidden>'+
      '<div class="st-panel-head"><div><h2><i class="fas fa-map-marker-alt" aria-hidden="true"></i>Analisis Spasial Koordinat</h2></div>'+
      '<button class="st-close" type="button" data-st-close="result" aria-label="Tutup hasil analisis">&times;</button></div>'+
      '<div id="stResultBody" class="st-panel-body" aria-live="polite"></div>'+
    '</aside>');

  var toolsMenu=append(
    '<div id="stToolsMenu" class="st-menu" role="menu" aria-label="Alat" hidden>'+
      '<div class="st-menu-head"><span>Alat</span><button class="st-close" type="button" data-st-close="menus" aria-label="Tutup">&times;</button></div>'+
      '<div class="st-menu-title">Pengukuran</div>'+
      '<button type="button" role="menuitem" data-st-tool="distance"><i class="fas fa-ruler-horizontal" aria-hidden="true"></i>Ukur Jarak</button>'+
      '<button type="button" role="menuitem" data-st-tool="area"><i class="fas fa-object-group" aria-hidden="true"></i>Ukur Luas &amp; Analisis</button>'+
      '<hr><div class="st-menu-title">Konversi Data</div>'+
      '<button type="button" role="menuitem" data-st-tool="shp-kml"><i class="fas fa-exchange-alt" aria-hidden="true"></i>SHP ke KML<span class="st-badge">ZIP</span></button>'+
      '<button type="button" role="menuitem" data-st-tool="kml-shp"><i class="fas fa-file-archive" aria-hidden="true"></i>KML ke SHP<span class="st-badge">KML</span></button>'+
      '<button type="button" role="menuitem" data-st-tool="pdf-kkpr"><i class="fas fa-file-pdf" aria-hidden="true"></i>PDF KKPR ke Poligon<span class="st-badge">PDF</span></button>'+
    '</div>');

  var infoMenu=append(
    '<div id="stInfoMenu" class="st-menu" role="menu" aria-label="Informasi" hidden>'+
      '<div class="st-menu-head"><span>Informasi</span><button class="st-close" type="button" data-st-close="menus" aria-label="Tutup">&times;</button></div>'+
      '<button type="button" role="menuitem" data-st-info="guide"><i class="fas fa-book-open" aria-hidden="true"></i>Panduan Penggunaan</button>'+
      '<button type="button" role="menuitem" data-st-info="data"><i class="fas fa-database" aria-hidden="true"></i>Informasi Data &amp; Batas Penggunaan</button>'+
      '<button type="button" role="menuitem" data-st-info="about"><i class="fas fa-info-circle" aria-hidden="true"></i>Tentang SOBAT TARU</button>'+
    '</div>');

  var statusChip=append('<div id="stStatus" class="st-status" aria-live="off"><i class="fas fa-map" aria-hidden="true"></i><span id="stStatusText">Google Hybrid</span></div>');

  var bottomNav=append(
    '<nav id="stBottomNav" class="st-bottom-nav" aria-label="Navigasi">'+
      '<button type="button" data-st-nav="layers"><svg class="st-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1 7.5l11 5.5 11-5.5L12 2zm0 13.2L3.4 10.9 1 12.1l11 5.5 11-5.5-2.4-1.2L12 15.2zm0 4.5-8.6-4.3L1 16.6 12 22l11-5.4-2.4-1.2L12 19.7z"/></svg>Layer</button>'+
      '<button type="button" data-st-nav="result" disabled><i class="fas fa-clipboard-list" aria-hidden="true"></i>Hasil</button>'+
      '<button type="button" data-st-nav="upload"><i class="fas fa-upload" aria-hidden="true"></i>Upload</button>'+
      '<button type="button" data-st-nav="tools"><i class="fas fa-wrench" aria-hidden="true"></i>Alat</button>'+
      '<button type="button" data-st-nav="info"><i class="fas fa-info-circle" aria-hidden="true"></i>Info</button>'+
    '</nav>');

  [layerPanel,resultPanel,toolsMenu,infoMenu,statusChip,bottomNav].forEach(function(node){
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
  });

  /* ---------- Panel layer: pindahkan kontrol layer lama ---------- */
  if(window.lay&&typeof lay.getContainer==='function'){
    var tree=lay.getContainer();
    $('stLayerTreeSlot').appendChild(tree);
    tree.classList.add('leaflet-control-layers-expanded');
    // Kontrol lama menutup daftar saat peta diklik; di panel daftar selalu terbuka.
    var originalCollapse=lay.collapse;
    lay.collapse=function(){return this;};
    // Mode "collapsed" Leaflet menahan klik pertama setelah kursor/sentuhan masuk ke kontrol.
    // Di panel, daftar selalu terbuka, jadi pengaman itu dilepas agar sekali ketuk langsung bekerja.
    L.DomEvent.off(tree,'mouseenter',lay._expandSafely,lay);
    L.DomEvent.off(tree,'mouseleave',originalCollapse,lay);
    if(lay._map)lay._map.off('click',originalCollapse,lay);
    if(lay._layersLink)L.DomEvent.off(lay._layersLink,'focus',lay.expand,lay);
    lay._expandSafely=function(){this._preventClick=false;return this;};
    lay._preventClick=false;
  }

  /* ---------- Peta dasar ---------- */
  var basemapLabels={hybrid:'Hybrid',satellite:'Satelit',road:'Jalan',osm:'OSM'};
  var segment=$('stBasemapSegment');
  document.querySelectorAll('#basemapMenu [data-basemap-option]').forEach(function(option){
    var mode=option.dataset.basemapOption,button=document.createElement('button');
    button.type='button';button.setAttribute('role','radio');button.dataset.stBasemap=mode;
    button.textContent=basemapLabels[mode]||option.textContent.trim();
    button.title=option.textContent.trim();
    segment.appendChild(button);
  });
  function syncBasemapSegment(){
    segment.querySelectorAll('[data-st-basemap]').forEach(function(button){
      var option=document.querySelector('#basemapMenu [data-basemap-option="'+button.dataset.stBasemap+'"]');
      var active=!!option&&option.classList.contains('active');
      button.classList.toggle('active',active);button.setAttribute('aria-checked',active?'true':'false');
    });
    updateStatus();
  }
  segment.addEventListener('click',function(event){
    var button=event.target.closest('[data-st-basemap]');if(!button)return;
    if(typeof window.setBasemap==='function')window.setBasemap(button.dataset.stBasemap);
    else{var option=document.querySelector('#basemapMenu [data-basemap-option="'+button.dataset.stBasemap+'"]');if(option)option.click();}
    syncBasemapSegment();
  });

  /* ---------- Status peta (kiri bawah, desktop) ---------- */
  var pointerLatLng=null,statusFrame=0;
  function updateStatus(){
    var basemap=($('basemapCurrent')||{}).textContent||'Google Hybrid';
    var text=esc(basemap)+' &middot; Zoom '+map.getZoom();
    if(pointerLatLng)text+=' &middot; <code>'+pointerLatLng.lat.toFixed(5)+', '+pointerLatLng.lng.toFixed(5)+'</code>';
    $('stStatusText').innerHTML=text;
  }
  map.on('zoomend',updateStatus);
  map.on('mousemove',function(event){pointerLatLng=event.latlng;if(statusFrame)return;statusFrame=requestAnimationFrame(function(){statusFrame=0;updateStatus();});});
  map.on('mouseout',function(){pointerLatLng=null;updateStatus();});
  L.control.scale({imperial:false,position:'bottomright'}).addTo(map);

  /* ---------- Buka/tutup panel ---------- */
  var navLayers=$('stNavLayers'),navTools=$('stNavTools'),navAbout=$('stNavAbout');
  var lastIdentification=null;

  function setLayersOpen(open,remember){
    layerPanel.hidden=!open;
    document.body.classList.toggle('st-layers-open',open);
    if(navLayers){navLayers.classList.toggle('is-active',open);navLayers.setAttribute('aria-expanded',open?'true':'false');}
    if(open&&isPhone()){closeMenus();hideResult(true);hideUploadResult();}
    if(remember&&!isPhone())store('sobatTaruLayerPanel',open?'1':'0');
    refreshBottomNav();
  }
  function showResult(){
    resultPanel.hidden=false;
    if(isPhone()){setLayersOpen(false);closeMenus();}
    refreshBottomNav();
  }
  function hideResult(keepPoint){
    resultPanel.hidden=true;
    if(!keepPoint&&typeof window.clearIdentificationPulse==='function')window.clearIdentificationPulse();
    refreshBottomNav();
  }
  function uploadPanel(){return $('analysisPanel');}
  function uploadResultVisible(){var panel=uploadPanel();return !!panel&&panel.style.display!=='none'&&panel.style.display!=='';}
  function hideUploadResult(){var close=$('closeAnalysisPanel');if(uploadResultVisible()&&close)close.click();}

  function placeMenu(menu,anchor){
    if(isPhone()||!anchor){menu.style.left=menu.style.top=menu.style.right='';return;}
    var rect=anchor.getBoundingClientRect();
    menu.style.top=(rect.bottom+8)+'px';
    menu.style.right=Math.max(8,window.innerWidth-rect.right)+'px';
    menu.style.left='auto';
  }
  function openMenu(menu,anchor){
    var wasOpen=!menu.hidden;
    closeMenus();
    if(wasOpen)return;
    if(isPhone()){setLayersOpen(false);hideResult(true);}
    placeMenu(menu,anchor);
    menu.hidden=false;
    if(anchor)anchor.setAttribute('aria-expanded','true');
    var first=menu.querySelector('[role="menuitem"]');if(first&&!isPhone())first.focus({preventScroll:true});
    refreshBottomNav();
  }
  function closeMenus(){
    [toolsMenu,infoMenu].forEach(function(menu){menu.hidden=true;});
    [navTools,navAbout].forEach(function(button){if(button)button.setAttribute('aria-expanded','false');});
    refreshBottomNav();
  }

  document.addEventListener('click',function(event){
    var closer=event.target.closest&&event.target.closest('[data-st-close]');
    if(closer){
      var what=closer.dataset.stClose;
      if(what==='layers')setLayersOpen(false,true);
      else if(what==='result')hideResult(false);
      else closeMenus();
      return;
    }
    if(!event.target.closest('.st-menu')&&!event.target.closest('#stNavTools,#stNavAbout,[data-st-nav="tools"],[data-st-nav="info"]'))closeMenus();
  });
  document.addEventListener('keydown',function(event){
    if(event.key!=='Escape')return;
    if(!toolsMenu.hidden||!infoMenu.hidden){closeMenus();return;}
    if(isPhone()&&!layerPanel.hidden){setLayersOpen(false);return;}
    if(!resultPanel.hidden&&!document.querySelector('.data-info-backdrop.open,.tutorial-backdrop.open,.tool-modal-backdrop.open,.smart-search-backdrop.open'))hideResult(false);
  });

  /* ---------- Header ---------- */
  if(navLayers)navLayers.addEventListener('click',function(){setLayersOpen(layerPanel.hidden,true);});
  if(navTools)navTools.addEventListener('click',function(){openMenu(toolsMenu,navTools);});
  if(navAbout)navAbout.addEventListener('click',function(){openMenu(infoMenu,navAbout);});
  $('stNavUpload').addEventListener('click',triggerUpload);
  function triggerUpload(){closeMenus();var toggle=$('uploadToggle');if(toggle)toggle.click();}

  toolsMenu.addEventListener('click',function(event){
    var item=event.target.closest('[data-st-tool]');if(!item)return;
    closeMenus();
    var original=document.querySelector('.sobat-toolbox-item[data-tool="'+item.dataset.stTool+'"]');
    if(original)original.click();
  });
  infoMenu.addEventListener('click',function(event){
    var item=event.target.closest('[data-st-info]');if(!item)return;
    closeMenus();
    var kind=item.dataset.stInfo;
    if(kind==='guide'){var guide=$('openTutorial');if(guide)guide.click();}
    else if(kind==='about'){var about=$('aboutSobatModal');if(about)about.classList.add('open');}
    else if(kind==='data'&&typeof window.showDataInfo==='function'){window.__sobatDataInfoDismissed=false;window.showDataInfo();}
  });

  /* ---------- Navigasi bawah (HP) ---------- */
  function refreshBottomNav(){
    var phone=isPhone();
    bottomNav.querySelectorAll('[data-st-nav]').forEach(function(button){
      var kind=button.dataset.stNav,active=false;
      if(kind==='layers')active=!layerPanel.hidden;
      else if(kind==='result')active=!resultPanel.hidden||uploadResultVisible();
      else if(kind==='tools')active=!toolsMenu.hidden;
      else if(kind==='info')active=!infoMenu.hidden;
      button.classList.toggle('is-active',phone&&active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
    var resultButton=bottomNav.querySelector('[data-st-nav="result"]');
    resultButton.disabled=!(lastIdentification||uploadResultVisible());
  }
  bottomNav.addEventListener('click',function(event){
    var button=event.target.closest('[data-st-nav]');if(!button||button.disabled)return;
    var kind=button.dataset.stNav;
    if(kind==='layers')setLayersOpen(layerPanel.hidden);
    else if(kind==='result'){
      if(!resultPanel.hidden)hideResult(true);
      else if(uploadResultVisible())return;
      else if(lastIdentification){showResult();}
    }
    else if(kind==='upload'){setLayersOpen(false);triggerUpload();}
    else if(kind==='tools')openMenu(toolsMenu,null);
    else if(kind==='info')openMenu(infoMenu,null);
  });

  /* ---------- Pencarian di header ---------- */
  var searchForm=$('stSearch'),searchInput=$('stSearchInput');
  var fullPlaceholder=searchInput.placeholder;
  function syncPlaceholder(){searchInput.placeholder=isPhone()?'Cari koordinat / tautan Maps':fullPlaceholder;}
  syncPlaceholder();
  if(phoneQuery.addEventListener)phoneQuery.addEventListener('change',syncPlaceholder);
  var searchMessage=document.createElement('div');searchMessage.className='st-search-msg';searchMessage.setAttribute('role','status');
  searchForm.appendChild(searchMessage);
  function showSearchMessage(text,isError){
    searchMessage.innerHTML=esc(text)+(isError?'<button type="button" data-st-search-advanced>Pilih format</button>':'');
    searchMessage.classList.toggle('error',!!isError);
    searchMessage.classList.add('show');
    clearTimeout(showSearchMessage.timer);
    showSearchMessage.timer=setTimeout(function(){searchMessage.classList.remove('show');},isError?7000:2500);
  }
  function openAdvancedSearch(){
    searchMessage.classList.remove('show');
    var smartInput=$('smartSearchInput');if(smartInput&&searchInput.value.trim())smartInput.value=searchInput.value.trim();
    var opener=document.querySelector('.smart-search-button');if(opener)opener.click();
  }
  searchMessage.addEventListener('click',function(event){if(event.target.closest('[data-st-search-advanced]'))openAdvancedSearch();});
  searchForm.addEventListener('submit',function(event){
    event.preventDefault();
    var value=searchInput.value.trim();
    var smartInput=$('smartSearchInput'),method=$('smartSearchMethod'),submit=$('smartSearchSubmit'),state=$('smartSearchState');
    if(!value){showSearchMessage('Masukkan koordinat, UTM 50S, atau tautan Google Maps.',true);return;}
    if(!smartInput||!submit){openAdvancedSearch();return;}
    smartInput.value=value;if(method)method.value='auto';
    searchForm.classList.add('is-busy');searchMessage.classList.remove('show');
    submit.click();
    var started=Date.now();
    (function wait(){
      if(submit.disabled&&Date.now()-started<15000){setTimeout(wait,120);return;}
      searchForm.classList.remove('is-busy');
      if(state&&state.classList.contains('error'))showSearchMessage(state.textContent||'Lokasi tidak dapat ditemukan.',true);
      else if(isPhone())searchInput.blur();
    })();
  });
  $('stSearchAdvanced').addEventListener('click',openAdvancedSearch);
  $('stSearchLocate').addEventListener('click',function(){
    var locate=document.querySelector('.leaflet-control-locate a');
    if(locate)locate.click();else showSearchMessage('Fitur lokasi belum siap.',true);
  });

  /* ---------- Panel hasil identifikasi titik ---------- */
  var themeLayerKeys=['sigap','pippib','rtrw','rdtr','lp2b','lsd','lbs','administrasi','jalan','sempadan'];
  function layerKeyActive(key){
    var groups=typeof window.analysisLayerGroups==='function'?window.analysisLayerGroups():{};
    return (groups[key]||[]).some(function(layer){return layer&&map.hasLayer(layer);});
  }
  function setLayerKey(key,on){
    var groups=typeof window.analysisLayerGroups==='function'?window.analysisLayerGroups():{};
    (groups[key]||[]).forEach(function(layer){if(!layer)return;if(on&&!map.hasLayer(layer))map.addLayer(layer);if(!on&&map.hasLayer(layer))map.removeLayer(layer);});
  }
  function syncShowSwitches(){
    resultPanel.querySelectorAll('[data-st-layer]').forEach(function(input){input.checked=layerKeyActive(input.dataset.stLayer);});
  }
  map.on('layeradd layerremove',function(){if(!resultPanel.hidden)syncShowSwitches();});
  resultPanel.addEventListener('change',function(event){
    var input=event.target.closest('[data-st-layer]');if(!input)return;
    setLayerKey(input.dataset.stLayer,input.checked);syncShowSwitches();
  });
  resultPanel.addEventListener('click',function(event){
    var copy=event.target.closest('[data-st-copy]');if(!copy)return;
    var text=copy.dataset.stCopy;
    var done=function(){var label=copy.querySelector('span');if(!label)return;var previous=label.textContent;label.textContent='Tersalin';setTimeout(function(){label.textContent=previous;},1600);};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,function(){window.prompt('Salin koordinat:',text);});
    else window.prompt('Salin koordinat:',text);
  });

  function showSwitch(key){
    if(themeLayerKeys.indexOf(key)<0)return '';
    return '<label class="st-show">Tampilkan di peta<input type="checkbox" data-st-layer="'+key+'"'+(layerKeyActive(key)?' checked':'')+'></label>';
  }
  function chip(inside,textIn,textOut){return inside?'<span class="st-chip in">'+(textIn||'Masuk')+'</span>':'<span class="st-chip out">'+(textOut||'Tidak masuk')+'</span>';}
  function item(options){
    return '<div class="st-item"><div class="st-item-label">'+esc(options.label)+'</div>'+
      '<div class="st-item-title">'+options.title+'</div>'+
      (options.sub?'<div class="st-item-sub">'+options.sub+'</div>':'')+
      (options.details||'')+
      '<div class="st-item-row">'+(options.chip||'<span></span>')+showSwitch(options.key)+'</div></div>';
  }

  window.sobatRenderIdentification=function(data){
    lastIdentification=data;
    var lat=data.latlng.lat,lng=data.latlng.lng;
    var utm=null;try{if(typeof window.projectToUtm50S==='function')utm=window.projectToUtm50S([lng,lat]);}catch(_utmError){}
    var rtrwFound=data.rtrw&&data.rtrw!=='Tidak ditemukan';
    var rdtrFound=!!data.rdtrZona;
    var sigap=data.sigapCategory;
    var sigapForest=!!sigap&&sigap.key!=='apl';
    var pippibIn=data.pippib&&data.pippib!=='Tidak masuk';
    var lp2bIn=data.lp2b==='YA',lsdIn=data.lsd==='YA',lbsIn=data.lbs==='YA';
    var sempadanIn=data.sempadan&&data.sempadan.length>0;
    var checks=[rdtrFound,sigapForest,pippibIn,lp2bIn,lsdIn,lbsIn,sempadanIn];
    var inside=checks.filter(Boolean).length;

    var alerts='';
    if(sigapForest)alerts+='<div class="st-alert danger"><i class="fas fa-tree" aria-hidden="true"></i><div><b>Lokasi berada di '+esc(sigap.label)+'</b>'+esc(sigap.action||'Konfirmasikan kepada instansi kehutanan yang berwenang.')+'</div></div>';
    if(pippibIn)alerts+='<div class="st-alert danger"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i><div><b>Lokasi beririsan dengan PIPPIB</b>Pemanfaatan ruang di sini terikat ketentuan penghentian pemberian izin baru. Konfirmasikan kepada instansi berwenang.</div></div>';
    var farm=[lp2bIn?'LP2B':'',lsdIn?'LSD':''].filter(Boolean);
    if(farm.length)alerts+='<div class="st-alert"><i class="fas fa-seedling" aria-hidden="true"></i><div><b>Lokasi beririsan dengan '+farm.join(' dan ')+'</b>Alih fungsi lahan pertanian memerlukan pemeriksaan dan persetujuan sesuai ketentuan.</div></div>';
    if(sempadanIn)alerts+='<div class="st-alert"><i class="fas fa-tint" aria-hidden="true"></i><div><b>Lokasi berada di sempadan</b>'+esc(data.sempadan.join(', '))+' menurut RTRW Kabupaten Sumbawa Barat.</div></div>';

    var sigapDetails='';
    if(sigap){
      var props=data.sigapProperties||{};
      sigapDetails='<details class="st-details"><summary>Rincian SIGAP</summary><p>'+
        (data.sigapFeature?'<b>Nama objek:</b> '+esc(props.namobj||'-')+'<br><b>No. SK:</b> '+esc(props.noskpnjk||'-')+'<br><b>Keterangan:</b> '+esc(props.keterangan||props.remark||'-')+'<br>':'')+
        esc(sigap.meaning||'')+'</p></details>';
    }

    var html=
      '<div class="st-card"><div class="st-card-title">Lokasi yang diperiksa</div><div class="st-coords">'+
        '<div><span>Lintang, Bujur</span> <code>'+lat.toFixed(6)+', '+lng.toFixed(6)+'</code></div>'+
        (utm?'<div><span>UTM 50S</span> <code>X '+Number(utm[0]).toFixed(2)+' &middot; Y '+Number(utm[1]).toFixed(2)+'</code></div>':'')+
        '<div><span>Kecamatan</span> <b>'+esc(data.kecamatan)+'</b></div>'+
      '</div></div>'+
      '<div class="st-actions">'+
        '<a class="st-action" href="https://www.google.com/maps/dir/?api=1&destination='+lat.toFixed(7)+','+lng.toFixed(7)+'" target="_blank" rel="noopener noreferrer"><i class="fas fa-location-arrow" aria-hidden="true"></i>Arah</a>'+
        '<a class="st-action alt" href="'+esc(data.bhumiUrl)+'" target="_blank" rel="noopener noreferrer" title="Cek bidang tanah di BHUMI ATR/BPN"><i class="fas fa-external-link-alt" aria-hidden="true"></i>BHUMI</a>'+
        '<button class="st-action" type="button" data-st-copy="'+lat.toFixed(6)+', '+lng.toFixed(6)+'"><i class="fas fa-copy" aria-hidden="true"></i><span>Salin</span></button>'+
      '</div>'+
      alerts+
      '<div class="st-card"><div class="st-results-head"><div class="st-card-title" style="margin:0">Hasil analisis</div><small>'+inside+' masuk &middot; '+(checks.length-inside)+' tidak</small></div>'+
        item({label:'Pola Ruang RTRW',key:'rtrw',title:rtrwFound?esc(data.rtrw):'Di luar data RTRW',sub:'RTRW Kabupaten Sumbawa Barat 2020–2040'})+
        item({label:'RDTR',key:'rdtr',title:rdtrFound?'Zona '+esc(data.rdtrZona):'Tidak berada pada wilayah RDTR',sub:rdtrFound?esc(data.rdtrWilayah):'RDTR Taliwang dan RDTR Maluk',chip:rdtrFound?'<span class="st-chip ok">Masuk RDTR</span>':'<span class="st-chip out">Di luar RDTR</span>'})+
        item({label:'Kawasan Hutan (SIGAP)',key:'sigap',title:sigap?(sigapForest?'<span class="st-swatch" style="background:'+esc(sigap.hex)+'"></span>':'')+esc(sigap.label):'Tidak ada klasifikasi pada titik ini',sub:'Kementerian Kehutanan RI',details:sigapDetails,chip:sigap?(sigapForest?'<span class="st-chip in">Kawasan hutan</span>':'<span class="st-chip ok">Bukan kawasan hutan</span>'):'<span class="st-chip out">Tidak ada data</span>'})+
        item({label:'PIPPIB 2025 Periode I',key:'pippib',title:pippibIn?esc(data.pippib):'Tidak masuk PIPPIB',sub:'Peta Indikatif Penghentian Pemberian Izin Baru',chip:chip(pippibIn)})+
        item({label:'LP2B',key:'lp2b',title:'Lahan Pertanian Pangan Berkelanjutan',chip:chip(lp2bIn)})+
        item({label:'LSD',key:'lsd',title:'Lahan Sawah yang Dilindungi',chip:chip(lsdIn)})+
        item({label:'LBS',key:'lbs',title:'Lahan Baku Sawah',chip:chip(lbsIn)})+
        item({label:'Sempadan (RTRW)',key:'sempadan',title:sempadanIn?esc(data.sempadan.join(', ')):'Tidak berada di sempadan sungai atau pantai',chip:chip(sempadanIn)})+
        item({label:'Administrasi',key:'administrasi',title:'Kecamatan '+esc(data.kecamatan),sub:'Kabupaten Sumbawa Barat'})+
      '</div>'+
      '<p class="st-foot-note">Hasil SOBAT TARU bersifat indikatif, memakai seluruh dataset yang tersedia meskipun layer disembunyikan, dan bukan produk hukum. Konfirmasikan kepada instansi berwenang.</p>';

    var body=$('stResultBody');
    body.innerHTML=html;body.scrollTop=0;
    hideUploadResult();
    showResult();
  };

  /* ---------- Sinkron dengan panel hasil unggah lama ---------- */
  var analysisPanel=uploadPanel();
  if(analysisPanel){
    new MutationObserver(function(){
      if(uploadResultVisible()){hideResult(true);if(isPhone()){setLayersOpen(false);closeMenus();}}
      refreshBottomNav();
    }).observe(analysisPanel,{attributes:true,attributeFilter:['style']});
  }
  var explorerPanel=$('fieldExplorer'),explorerToggle=$('fieldExplorerToggle');
  if(explorerPanel){
    // Eksplorasi bidang menempati posisi panel layer, jadi panel layer ditutup saat eksplorasi dibuka.
    new MutationObserver(function(){if(explorerPanel.classList.contains('open')&&!layerPanel.hidden)setLayersOpen(false);})
      .observe(explorerPanel,{attributes:true,attributeFilter:['class']});
  }
  if(explorerToggle){
    new MutationObserver(function(){document.body.classList.toggle('st-explorer-toggle-visible',getComputedStyle(explorerToggle).display!=='none');})
      .observe(explorerToggle,{attributes:true,attributeFilter:['style','class']});
  }

  /* ---------- Awal ---------- */
  function applyLayout(){
    closeMenus();
    if(isPhone())setLayersOpen(false);
    else setLayersOpen(store('sobatTaruLayerPanel')!=='0');
    setTimeout(function(){map.invalidateSize();},50);
  }
  if(phoneQuery.addEventListener)phoneQuery.addEventListener('change',applyLayout);else if(phoneQuery.addListener)phoneQuery.addListener(applyLayout);
  window.addEventListener('resize',function(){if(!toolsMenu.hidden)placeMenu(toolsMenu,navTools);if(!infoMenu.hidden)placeMenu(infoMenu,navAbout);});
  syncBasemapSegment();
  applyLayout();
  map.closePopup();
})();
