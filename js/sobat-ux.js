/*
 * SOBAT TARU — tata letak antarmuka 2026.
 * Panel layer di kiri, pencarian dan menu di header, panel hasil analisis di kanan,
 * dan navigasi bawah untuk HP. Semua fungsi lama (layer, analisis, alat, unggah)
 * tetap dipakai; berkas ini hanya menata ulang cara pengguna menjangkaunya.
 */
(function(){
  'use strict';
  function hideLoader(){if(typeof window.stSplashDone==='function')window.stSplashDone();}
  if(!window.L||!window.map){hideLoader();return;}

  var phoneQuery=window.matchMedia('(max-width:760px)');
  function isPhone(){return phoneQuery.matches;}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function $(id){return document.getElementById(id);}
  function store(key,value){try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value);}catch(_storageError){}return null;}
  function append(html){var holder=document.createElement('div');holder.innerHTML=html.trim();var node=holder.firstChild;document.body.appendChild(node);return node;}
  var layersIcon='<svg class="st-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1 7.5l11 5.5 11-5.5L12 2zm0 13.2L3.4 10.9 1 12.1l11 5.5 11-5.5-2.4-1.2L12 15.2zm0 4.5-8.6-4.3L1 16.6 12 22l11-5.4-2.4-1.2L12 19.7z"/></svg>';

  /* ---------- Struktur DOM baru ---------- */
  var layerPanel=append(
    '<aside id="stLayerPanel" class="st-panel st-layer-panel" aria-label="Layer Tata Ruang" hidden>'+
      '<div class="st-panel-head"><div><h2>'+layersIcon+'Layer Tata Ruang</h2></div>'+
      '<button class="st-close" type="button" data-st-close="layers" aria-label="Tutup panel layer">&times;</button></div>'+
      '<div class="st-panel-body">'+
        '<div class="st-section-label">Peta dasar</div>'+
        '<div id="stBasemapSegment" class="st-segment" role="radiogroup" aria-label="Peta dasar"></div>'+
        '<div class="st-section-label"><label for="stOpacity">Ketebalan warna layer</label><output id="stOpacityValue" for="stOpacity">60%</output></div>'+
        '<div class="st-range-row"><i class="fas fa-adjust" aria-hidden="true"></i><input id="stOpacity" class="st-range" type="range" min="10" max="100" step="5" value="60" title="Turunkan agar citra satelit di bawah layer tetap terlihat"></div>'+
        '<div class="st-section-label"><span>Data Kabupaten Sumbawa Barat</span><button id="stLayersOff" class="st-text-btn" type="button" disabled>Matikan semua</button></div>'+
        '<div id="stLayerTreeSlot"></div>'+
      '</div>'+
    '</aside>');

  var resultPanel=append(
    '<aside id="stResultPanel" class="st-panel st-result-panel" aria-label="Analisis Spasial Koordinat" hidden>'+
      '<div class="st-panel-head"><div><h2><i class="fas fa-map-marker-alt" aria-hidden="true"></i>Analisis Lokasi</h2></div>'+
      '<button class="st-close" type="button" data-st-close="result" aria-label="Tutup hasil analisis">&times;</button></div>'+
      '<div id="stResultBody" class="st-panel-body" aria-live="polite"></div>'+
    '</aside>');

  var toolsMenu=append(
    '<div id="stToolsMenu" class="st-menu" role="menu" aria-label="Alat" hidden>'+
      '<div class="st-menu-head"><span>Alat</span><button class="st-close" type="button" data-st-close="menus" aria-label="Tutup">&times;</button></div>'+
      // Isi dan urutan sama dengan menu Alat Bale Ruang NTB.
      '<button type="button" role="menuitem" data-st-tool="distance"><i class="fas fa-ruler-horizontal" aria-hidden="true"></i>Ukur Jarak</button>'+
      '<button type="button" role="menuitem" data-st-tool="area"><i class="fas fa-object-group" aria-hidden="true"></i>Ukur Luas</button>'+
      '<button type="button" role="menuitem" data-st-tool="shp-kml"><i class="fas fa-exchange-alt" aria-hidden="true"></i>SHP ke KML</button>'+
      '<button type="button" role="menuitem" data-st-tool="kml-shp"><i class="fas fa-exchange-alt" aria-hidden="true"></i>KML ke SHP</button>'+
      '<button type="button" role="menuitem" data-st-tool="pdf-kkpr"><i class="fas fa-file-pdf" aria-hidden="true"></i>PDF KKPR ke Poligon</button>'+
      '<button type="button" role="menuitem" data-st-tool="geotag"><i class="fas fa-camera" aria-hidden="true"></i>Foto &amp; PDF Geotag</button>'+
      '<button type="button" role="menuitem" data-st-tool="install" hidden><i class="fas fa-mobile-alt" aria-hidden="true"></i>Pasang Aplikasi</button>'+
    '</div>');

  var infoMenu=append(
    '<div id="stInfoMenu" class="st-menu" role="menu" aria-label="Informasi" hidden>'+
      '<div class="st-menu-head"><span>Informasi</span><button class="st-close" type="button" data-st-close="menus" aria-label="Tutup">&times;</button></div>'+
      '<button type="button" role="menuitem" data-st-info="guide" class="st-phone-only"><i class="fas fa-book-open" aria-hidden="true"></i>Panduan Penggunaan</button>'+
      '<button type="button" role="menuitem" data-st-info="data"><i class="fas fa-database" aria-hidden="true"></i>Informasi Data &amp; Batas Penggunaan</button>'+
      '<button type="button" role="menuitem" data-st-info="about"><i class="fas fa-info-circle" aria-hidden="true"></i>Tentang SOBAT TARU</button>'+
    '</div>');

  var statusChip=append('<div id="stStatus" class="st-status" aria-live="off"><i class="fas fa-map" aria-hidden="true"></i><span id="stStatusText">Peta hibrid</span></div>');

  var legendWrap=append(
    '<div id="stLegendWrap" class="st-legend-wrap" hidden>'+
      '<button id="stLegendBtn" class="st-legend-btn" type="button" aria-expanded="false" aria-controls="stLegend"><i class="fas fa-list-ul" aria-hidden="true"></i><span>Legenda</span></button>'+
      '<div id="stLegend" class="st-legend" hidden><div class="st-legend-head"><b>Legenda layer aktif</b><button class="st-close" type="button" data-st-close="legend" aria-label="Tutup legenda">&times;</button></div><div id="stLegendBody" class="st-legend-body"></div></div>'+
    '</div>');

  var hint=append('<div id="stHint" class="st-hint" role="note" hidden><i class="fas fa-hand-pointer" aria-hidden="true"></i><span>Ketuk peta atau cari lokasi untuk memeriksa tata ruangnya.</span><button type="button" data-st-close="hint" aria-label="Tutup petunjuk">&times;</button></div>');

  var toast=append('<div id="stToast" class="st-toast" role="status" aria-live="polite" hidden></div>');

  var bottomNav=append(
    '<nav id="stBottomNav" class="st-bottom-nav" aria-label="Navigasi">'+
      '<button type="button" data-st-nav="layers">'+layersIcon+'Layer</button>'+
      '<button type="button" data-st-nav="result" disabled><i class="fas fa-clipboard-list" aria-hidden="true"></i>Hasil</button>'+
      '<button type="button" data-st-nav="upload"><i class="fas fa-upload" aria-hidden="true"></i>Unggah</button>'+
      '<button type="button" data-st-nav="tools"><i class="fas fa-ruler-combined" aria-hidden="true"></i>Alat</button>'+
      '<button type="button" data-st-nav="info"><i class="fas fa-info-circle" aria-hidden="true"></i>Info</button>'+
    '</nav>');

  [layerPanel,resultPanel,toolsMenu,infoMenu,statusChip,bottomNav,legendWrap,hint].forEach(function(node){
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
  });

  function showToast(text,duration){
    toast.textContent=text;toast.hidden=false;toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer=setTimeout(function(){toast.classList.remove('show');setTimeout(function(){toast.hidden=true;},250);},duration||2600);
  }

  // Fitur yang diambil dari Bale Ruang NTB (Geotag) memakai window.brToast.
  window.brToast=function(text,duration){showToast(text,duration);};

  /* ---------- Pasang Aplikasi (PWA), sama seperti Bale Ruang NTB ---------- */
  var installPrompt=null,promptSeen=false,installItem=toolsMenu.querySelector('[data-st-tool="install"]');
  function standalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}
  // Tombol pasang tetap tampil selama aplikasi belum terpasang di perangkat ini dan hilang setelah terpasang.
  // Browser Chromium hanya mengirim beforeinstallprompt bila aplikasi belum terpasang; browser lain diberi petunjuk manual.
  var installButtons=[];
  (function(){
    var nav=document.querySelector('.st-nav'),upload=$('stNavUpload'),header=document.querySelector('.sobat-header');
    var desk=document.createElement('button');
    desk.className='st-nav-btn st-install-btn';desk.type='button';desk.hidden=true;desk.title='Pasang SOBAT TARU sebagai aplikasi di perangkat ini';
    desk.innerHTML='<i class="fas fa-download" aria-hidden="true"></i><span>Pasang Aplikasi</span>';
    if(nav)nav.insertBefore(desk,upload||null);
    var phone=document.createElement('button');
    phone.className='st-install-phone';phone.type='button';phone.hidden=true;phone.setAttribute('aria-label','Pasang aplikasi di HP');
    phone.innerHTML='<i class="fas fa-download" aria-hidden="true"></i><span>Pasang</span>';
    if(header)header.appendChild(phone);
    installButtons=[desk,phone];
    installButtons.forEach(function(button){button.addEventListener('click',function(){installApp();});});
  })();
  function canInstall(){
    if(standalone()||store('sobatTaruInstalled')==='1')return false;
    if(installPrompt||promptSeen)return true;
    if('onbeforeinstallprompt' in window)return false;
    var ua=navigator.userAgent;
    // Safari (iPhone/iPad/Mac) dan browser HP lain bisa memasang lewat menunya sendiri; Firefox desktop tidak bisa.
    return /iphone|ipad|ipod|android/i.test(ua)||(/macintosh/i.test(ua)&&/safari/i.test(ua)&&!/chrome|chromium|firefox|edg/i.test(ua));
  }
  function refreshInstallItem(){
    if(standalone())store('sobatTaruInstalled','1');
    var show=canInstall();
    installItem.hidden=!show;
    installButtons.forEach(function(button){button.hidden=!show;});
  }
  // Bila aplikasi dihapus dari perangkat, browser kembali mengirim beforeinstallprompt sehingga tanda terpasang direset.
  function installApp(){
    if(installPrompt){installPrompt.prompt();installPrompt.userChoice.then(function(){installPrompt=null;refreshInstallItem();});return;}
    var ua=navigator.userAgent;
    showToast(/iphone|ipad|ipod/i.test(ua)?'Di iPhone/iPad: ketuk tombol Bagikan, lalu “Tambahkan ke Layar Utama”.':/macintosh/i.test(ua)&&/safari/i.test(ua)&&!/chrome|chromium|edg/i.test(ua)?'Di Safari Mac: buka menu File, lalu pilih “Tambahkan ke Dock”.':'Buka menu browser (⋮), lalu pilih “Instal aplikasi” atau “Tambahkan ke layar utama”.',6000);
  }
  window.addEventListener('beforeinstallprompt',function(event){event.preventDefault();installPrompt=event;promptSeen=true;store('sobatTaruInstalled','0');refreshInstallItem();});
  window.addEventListener('appinstalled',function(){installPrompt=null;promptSeen=false;store('sobatTaruInstalled','1');refreshInstallItem();showToast('SOBAT TARU terpasang di perangkat Anda.');});
  refreshInstallItem();
  function registerWorker(){navigator.serviceWorker.register('sw.js').catch(function(){});}
  if('serviceWorker' in navigator&&location.protocol!=='file:'){if(document.readyState==='complete')registerWorker();else window.addEventListener('load',registerWorker);}

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
  // Tombol sinkron SIGAP: kegagalan sinkron bukan galat bagi pengguna umum.
  document.querySelectorAll('[data-sigap-sync]').forEach(function(button){
    button.title='Data kawasan hutan memakai versi tersimpan terakhir. Tekan untuk mencoba memperbarui.';
  });

  /* ---------- Peta dasar ---------- */
  var basemapLabels={hybrid:'Hibrid',satellite:'Satelit',road:'Jalan',osm:'OSM'};
  var basemapNames={hybrid:'Peta hibrid',satellite:'Citra satelit',road:'Peta jalan',osm:'OpenStreetMap'};
  var segment=$('stBasemapSegment');
  document.querySelectorAll('#basemapMenu [data-basemap-option]').forEach(function(option){
    var mode=option.dataset.basemapOption,button=document.createElement('button');
    button.type='button';button.setAttribute('role','radio');button.dataset.stBasemap=mode;
    button.textContent=basemapLabels[mode]||option.textContent.trim();
    button.title=basemapNames[mode]||option.textContent.trim();
    segment.appendChild(button);
  });
  function activeBasemap(){
    var option=document.querySelector('#basemapMenu [data-basemap-option].active');
    return option?option.dataset.basemapOption:'hybrid';
  }
  function syncBasemapSegment(){
    var mode=activeBasemap();
    segment.querySelectorAll('[data-st-basemap]').forEach(function(button){
      var active=button.dataset.stBasemap===mode;
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

  /* ---------- Ketebalan warna layer ---------- */
  var opacityPanes=['pane_RTRWPROVINSINTB20242044_7','pane_RTRWSUMBAWABARAT20202040_3','pane_RDTRTALIWANG_2','pane_RDTRMALUK_1','pane_LP2BSUMBAWABARAT_5','pane_LSD_Kabupaten_Sumbawa_Barat_4','pane_LBS_Kabupaten_Sumbawa_Barat_6'];
  // Warna isi bawaan qgis2web sudah transparan (rgba ..., 0.5), jadi pada 100% layer tetap tembus.
  // Isi dibuat pekat dan seluruh transparansi diatur oleh penggeser lewat opasitas pane.
  function solidColor(color){
    var match=/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/.exec(String(color||'').replace(/\s/g,''));
    return match?'rgb('+match[1]+','+match[2]+','+match[3]+')':color;
  }
  ['layer_RTRWPROVINSINTB20242044_7','layer_RTRWSUMBAWABARAT20202040_3','layer_RDTRTALIWANG_2','layer_RDTRMALUK_1','layer_LP2BSUMBAWABARAT_5','layer_LSD_Kabupaten_Sumbawa_Barat_4','layer_LBS_Kabupaten_Sumbawa_Barat_6'].forEach(function(name){
    var layer=window[name];if(!layer||!layer.options||typeof layer.setStyle!=='function')return;
    var base=layer.options.style;
    var solid=function(feature){
      var style=L.extend({},typeof base==='function'?base(feature):base);
      if(style.fillColor)style.fillColor=solidColor(style.fillColor);
      style.fillOpacity=1;
      return style;
    };
    layer.options.style=solid;layer.setStyle(solid);
  });
  var opacityInput=$('stOpacity');
  function applyOpacity(value){
    opacityPanes.forEach(function(name){var pane=map.getPane(name);if(pane)pane.style.opacity=String(value/100);});
    $('stOpacityValue').textContent=value+'%';
  }
  var savedOpacity=parseInt(store('sobatTaruLayerOpacity2'),10);
  if(savedOpacity>=10&&savedOpacity<=100)opacityInput.value=savedOpacity;
  applyOpacity(Number(opacityInput.value));
  opacityInput.addEventListener('input',function(){applyOpacity(Number(opacityInput.value));});
  opacityInput.addEventListener('change',function(){store('sobatTaruLayerOpacity2',opacityInput.value);});

  /* ---------- Status peta (kiri bawah, desktop) ---------- */
  var pointerLatLng=null,statusFrame=0;
  function updateStatus(){
    var text=esc(basemapNames[activeBasemap()]||'Peta')+' &middot; Zoom '+map.getZoom();
    if(pointerLatLng)text+=' &middot; <code>'+pointerLatLng.lat.toFixed(5)+', '+pointerLatLng.lng.toFixed(5)+'</code>';
    $('stStatusText').innerHTML=text;
  }
  map.on('zoomend',updateStatus);
  map.on('mousemove',function(event){pointerLatLng=event.latlng;if(statusFrame)return;statusFrame=requestAnimationFrame(function(){statusFrame=0;updateStatus();});});
  map.on('mouseout',function(){pointerLatLng=null;updateStatus();});
  L.control.scale({imperial:false,position:'bottomright'}).addTo(map);

  /* ---------- Legenda mengambang ---------- */
  var legendPanel=$('stLegend'),legendButton=$('stLegendBtn');
  function activeLeafRows(){
    var rows=[];
    document.querySelectorAll('#stLayerTreeSlot input.leaflet-control-layers-selector:not(.leaflet-layerstree-sel-all-checkbox)').forEach(function(input){
      if(!input.checked)return;
      var header=input.closest('.leaflet-layerstree-header');var name=header&&header.querySelector('.leaflet-layerstree-header-name');
      if(name)rows.push(name);
    });
    return rows;
  }
  function renderLegend(){
    var rows=activeLeafRows();
    legendWrap.hidden=rows.length===0;
    if(!rows.length){setLegendOpen(false);return;}
    var body=$('stLegendBody');body.innerHTML='';
    rows.forEach(function(name){
      var clone=name.cloneNode(true);
      clone.querySelectorAll('button,.st-layer-sub,small,input,script').forEach(function(node){node.remove();});
      clone.removeAttribute('class');clone.className='st-legend-item';
      body.appendChild(clone);
    });
  }
  function setLegendOpen(open){
    legendPanel.hidden=!open;legendButton.setAttribute('aria-expanded',open?'true':'false');
    legendWrap.classList.toggle('is-open',open);
  }
  legendButton.addEventListener('click',function(){setLegendOpen(legendPanel.hidden);});
  var legendFrame=0;
  map.on('layeradd layerremove',function(){if(legendFrame)return;legendFrame=requestAnimationFrame(function(){legendFrame=0;renderLegend();refreshLayersOff();});});

  /* ---------- Matikan semua layer ---------- */
  var layersOff=$('stLayersOff');
  function activeLayerInputs(){
    return Array.prototype.filter.call(document.querySelectorAll('#stLayerTreeSlot input.leaflet-control-layers-selector[type="checkbox"]:not(.leaflet-layerstree-sel-all-checkbox)'),function(input){return input.checked;});
  }
  function refreshLayersOff(){
    var count=activeLayerInputs().length;
    layersOff.disabled=count===0;
  }
  layersOff.addEventListener('click',function(){
    var inputs=activeLayerInputs();
    inputs.forEach(function(input){input.click();});
    refreshLayersOff();showToast(inputs.length+' layer dimatikan');
  });


  /* ---------- Buka/tutup panel ---------- */
  var navLayers=$('stNavLayers'),navTools=$('stNavTools'),navAbout=$('stNavAbout');
  // Tombol "Hasil" di header: membuka lagi hasil analisis terakhir setelah panelnya ditutup.
  var navResult=document.createElement('button');
  navResult.id='stNavResult';navResult.className='st-nav-btn';navResult.type='button';navResult.hidden=true;
  navResult.title='Buka lagi hasil analisis terakhir';navResult.setAttribute('aria-controls','stResultPanel');
  navResult.innerHTML='<i class="fas fa-clipboard-list" aria-hidden="true"></i><span>Hasil</span>';
  if(navLayers)navLayers.insertAdjacentElement('afterend',navResult);
  var lastIdentification=null;

  function setLayersOpen(open,remember){
    layerPanel.hidden=!open;
    document.body.classList.toggle('st-layers-open',open);
    if(navLayers){navLayers.classList.toggle('is-active',open);navLayers.setAttribute('aria-expanded',open?'true':'false');}
    if(open&&isPhone()){closeMenus();hideResult(true);hideUploadResult();closeUploadBox();setLegendOpen(false);sheetState(layerPanel,'half');}
    if(remember&&!isPhone())store('sobatTaruLayerPanel',open?'1':'0');
    refreshBottomNav();
  }
  function showResult(){
    resultPanel.hidden=false;
    document.body.classList.add('st-result-open');
    closeUploadBox();
    if(isPhone()){setLayersOpen(false);closeMenus();setLegendOpen(false);sheetState(resultPanel,'half');}
    else if(window.innerWidth<1100&&!layerPanel.hidden)setLayersOpen(false);
    refreshBottomNav();
  }
  function hideResult(keepPoint){
    resultPanel.hidden=true;
    document.body.classList.remove('st-result-open');
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
    if(isPhone()){setLayersOpen(false);hideResult(true);closeUploadBox();}
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
      else if(what==='result')hideResult(true);
      else if(what==='legend')setLegendOpen(false);
      else if(what==='hint')hideHint(true);
      else closeMenus();
      return;
    }
    if(!event.target.closest('.st-menu')&&!event.target.closest('#stNavTools,#stNavAbout,[data-st-nav="tools"],[data-st-nav="info"]'))closeMenus();
  });
  document.addEventListener('keydown',function(event){
    if(event.key!=='Escape')return;
    if(!toolsMenu.hidden||!infoMenu.hidden){closeMenus();return;}
    if(uploadBoxOpen()&&!$('uploadBox').classList.contains('is-processing')){closeUploadBox();return;}
    if(!legendPanel.hidden){setLegendOpen(false);return;}
    if(isPhone()&&!layerPanel.hidden){setLayersOpen(false);return;}
    if(!resultPanel.hidden&&!document.querySelector('.data-info-backdrop.open,.tutorial-backdrop.open,.tool-modal-backdrop.open,.smart-search-backdrop.open'))hideResult(true);
  });

  /* ---------- Header ---------- */
  if(navLayers)navLayers.addEventListener('click',function(){setLayersOpen(layerPanel.hidden,true);});
  if(navTools)navTools.addEventListener('click',function(){openMenu(toolsMenu,navTools);});
  if(navAbout)navAbout.addEventListener('click',function(){openMenu(infoMenu,navAbout);});
  $('stNavUpload').addEventListener('click',triggerUpload);

  toolsMenu.addEventListener('click',function(event){
    var item=event.target.closest('[data-st-tool]');if(!item)return;
    closeMenus();
    if(item.dataset.stTool==='geotag'){if(typeof window.brGeotagOpen==='function')window.brGeotagOpen();return;}
    if(item.dataset.stTool==='install'){installApp();return;}
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

  /* ---------- Kotak unggah ---------- */
  var uploadBox=$('uploadBox'),uploadInput=$('uploadFile'),dropZone=$('uploadDrop');
  function uploadBoxOpen(){return !!uploadBox&&uploadBox.classList.contains('open');}
  function closeUploadBox(){
    if(!uploadBox||uploadBox.classList.contains('is-processing'))return;
    uploadBox.classList.remove('open','upload-result-visible');
    var toggle=$('uploadToggle');if(toggle)toggle.setAttribute('aria-expanded','false');
    refreshBottomNav();
  }
  function triggerUpload(){
    closeMenus();
    if(!uploadBox){var toggle=$('uploadToggle');if(toggle)toggle.click();return;}
    if(uploadBoxOpen()&&!uploadBox.classList.contains('is-processing')){closeUploadBox();return;}
    hideResult(true);
    if(isPhone())setLayersOpen(false);
    var progress=$('uploadProgress');if(progress&&!uploadBox.classList.contains('is-processing'))progress.classList.remove('show');
    uploadBox.classList.add('open');
    if(dropZone&&!isPhone())dropZone.focus({preventScroll:true});
    refreshBottomNav();
  }
  if(uploadBox){
    L.DomEvent.disableClickPropagation(uploadBox);
    L.DomEvent.disableScrollPropagation(uploadBox);
    $('closeUploadBox').addEventListener('click',function(){refreshBottomNav();});
    dropZone.tabIndex=0;
    dropZone.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();uploadInput.click();}});
    ['dragenter','dragover'].forEach(function(type){dropZone.addEventListener(type,function(event){event.preventDefault();dropZone.classList.add('is-over');});});
    ['dragleave','drop'].forEach(function(type){dropZone.addEventListener(type,function(){dropZone.classList.remove('is-over');});});
    dropZone.addEventListener('drop',function(event){
      event.preventDefault();
      var files=event.dataTransfer&&event.dataTransfer.files;if(!files||!files.length)return;
      try{var transfer=new DataTransfer();transfer.items.add(files[0]);uploadInput.files=transfer.files;}
      catch(_transferError){showToast('Peramban ini belum mendukung seret berkas. Gunakan tombol Pilih berkas.');return;}
      uploadInput.dispatchEvent(new Event('change',{bubbles:true}));
    });
    // Seret berkas ke mana saja di peta membuka kotak unggah.
    document.addEventListener('dragover',function(event){
      if(event.dataTransfer&&Array.prototype.indexOf.call(event.dataTransfer.types||[],'Files')>=0&&!uploadBoxOpen()&&!isPhone())triggerUpload();
    });
    new MutationObserver(refreshBottomNav).observe(uploadBox,{attributes:true,attributeFilter:['class']});
  }

  /* ---------- Navigasi bawah (HP) ---------- */
  function refreshBottomNav(){
    var phone=isPhone();
    bottomNav.querySelectorAll('[data-st-nav]').forEach(function(button){
      var kind=button.dataset.stNav,active=false;
      if(kind==='layers')active=!layerPanel.hidden;
      else if(kind==='result')active=!resultPanel.hidden||uploadResultVisible();
      else if(kind==='upload')active=uploadBoxOpen();
      else if(kind==='tools')active=!toolsMenu.hidden;
      else if(kind==='info')active=!infoMenu.hidden;
      button.classList.toggle('is-active',phone&&active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
    var resultButton=bottomNav.querySelector('[data-st-nav="result"]');
    resultButton.disabled=!(lastIdentification||uploadResultVisible());
    navResult.hidden=!lastIdentification;
    navResult.classList.toggle('is-active',!resultPanel.hidden);
    navResult.setAttribute('aria-expanded',resultPanel.hidden?'false':'true');
  }
  navResult.addEventListener('click',function(){
    if(!resultPanel.hidden){hideResult(true);return;}
    if(lastIdentification){showResult();keepPointVisible(lastIdentification.latlng);}
  });
  bottomNav.addEventListener('click',function(event){
    var button=event.target.closest('[data-st-nav]');if(!button||button.disabled)return;
    var kind=button.dataset.stNav;
    if(kind==='layers')setLayersOpen(layerPanel.hidden);
    else if(kind==='result'){
      if(!resultPanel.hidden)hideResult(true);
      else if(uploadResultVisible())return;
      else if(lastIdentification){showResult();keepPointVisible(lastIdentification.latlng);}
    }
    else if(kind==='upload')triggerUpload();
    else if(kind==='tools')openMenu(toolsMenu,null);
    else if(kind==='info')openMenu(infoMenu,null);
  });

  /* ---------- Panel bawah HP yang bisa diseret ---------- */
  function headerBottom(){var header=document.querySelector('.sobat-header');return header?header.getBoundingClientRect().bottom:56;}
  function navHeight(){return isPhone()?bottomNav.getBoundingClientRect().height:0;}
  function sheetHeights(){
    var room=window.innerHeight-navHeight();
    var search=$('stSearch'),top=search?search.getBoundingClientRect().bottom:headerBottom();
    return {peek:Math.min(176,room*0.4),half:Math.round(room*0.5),full:Math.round(room-top-8)};
  }
  function sheetState(panel,state){
    if(!isPhone()){panel.style.height='';panel.dataset.sheet='';return;}
    var heights=sheetHeights();
    panel.dataset.sheet=state;
    panel.style.height=heights[state]+'px';
  }
  function makeDraggable(panel,onClose){
    var head=panel.querySelector('.st-panel-head');
    var startY=0,startH=0,dragging=false,moved=false;
    head.addEventListener('pointerdown',function(event){
      if(!isPhone()||event.target.closest('button'))return;
      dragging=true;moved=false;startY=event.clientY;startH=panel.getBoundingClientRect().height;
      panel.classList.add('is-dragging');head.setPointerCapture(event.pointerId);
    });
    head.addEventListener('pointermove',function(event){
      if(!dragging)return;
      var dy=startY-event.clientY;if(Math.abs(dy)>4)moved=true;
      var heights=sheetHeights();
      panel.style.height=Math.max(80,Math.min(heights.full,startH+dy))+'px';
    });
    function finish(){
      if(!dragging)return;dragging=false;panel.classList.remove('is-dragging');
      var heights=sheetHeights(),h=panel.getBoundingClientRect().height;
      if(!moved){sheetState(panel,panel.dataset.sheet==='full'?'half':panel.dataset.sheet==='half'?'full':'half');return;}
      if(h<heights.peek-50){onClose();return;}
      var best='peek';['peek','half','full'].forEach(function(state){if(Math.abs(heights[state]-h)<Math.abs(heights[best]-h))best=state;});
      sheetState(panel,best);
      if(panel===resultPanel&&lastIdentification)setTimeout(function(){keepPointVisible(lastIdentification.latlng);},240);
    }
    head.addEventListener('pointerup',finish);
    head.addEventListener('pointercancel',finish);
  }
  makeDraggable(resultPanel,function(){hideResult(true);});
  makeDraggable(layerPanel,function(){setLayersOpen(false);});

  /* ---------- Jaga titik tetap terlihat ---------- */
  function visibleMapRect(){
    var rect={left:16,top:headerBottom()+16,right:window.innerWidth-16,bottom:window.innerHeight-40};
    if(isPhone()){
      var search=$('stSearch');if(search)rect.top=search.getBoundingClientRect().bottom+24;
      rect.bottom=window.innerHeight-navHeight()-24;
      [resultPanel,layerPanel].forEach(function(panel){if(!panel.hidden)rect.bottom=Math.min(rect.bottom,panel.getBoundingClientRect().top-24);});
    }else{
      if(!layerPanel.hidden)rect.left=layerPanel.getBoundingClientRect().right+24;
      if(!resultPanel.hidden)rect.right=resultPanel.getBoundingClientRect().left-24;
    }
    return rect;
  }
  function keepPointVisible(latlng){
    if(!latlng)return;
    var rect=visibleMapRect();if(rect.right-rect.left<60||rect.bottom-rect.top<60)return;
    var mapRect=map.getContainer().getBoundingClientRect();
    var point=map.latLngToContainerPoint(latlng).add([mapRect.left,mapRect.top]);
    if(point.x>=rect.left&&point.x<=rect.right&&point.y>=rect.top&&point.y<=rect.bottom)return;
    var target=L.point((rect.left+rect.right)/2,(rect.top+rect.bottom)/2);
    map.panBy(point.subtract(target),{animate:true,duration:.35});
  }

  /* ---------- Tombol navigasi peta, sama seperti Bale Ruang NTB ---------- */
  function activeGeometry(){
    if(lastIdentification&&lastIdentification.mode==='polygon'&&lastIdentification.geojson)return lastIdentification.geojson;
    if(window.uploadLayer&&map.hasLayer(window.uploadLayer)){try{return window.uploadLayer.toGeoJSON();}catch(_uploadError){}}
    return null;
  }
  function zoomToActive(){
    var geometry=activeGeometry();
    if(geometry){
      var bounds=L.geoJSON(geometry).getBounds();
      if(!bounds.isValid()){showToast('Geometri bidang aktif tidak dapat ditampilkan.');return;}
      var rect=visibleMapRect();
      map.fitBounds(bounds,{animate:true,maxZoom:19,paddingTopLeft:[rect.left+30,rect.top+30],paddingBottomRight:[window.innerWidth-rect.right+30,window.innerHeight-rect.bottom+30]});
      showToast('Peta diarahkan ke bidang yang sedang aktif.');return;
    }
    if(lastIdentification&&lastIdentification.latlng){
      map.setView(lastIdentification.latlng,Math.max(18,map.getZoom()),{animate:true});
      setTimeout(function(){keepPointVisible(lastIdentification.latlng);},450);
      showToast('Peta diperbesar ke titik koordinat yang sedang aktif.');return;
    }
    showToast('Belum ada titik atau bidang aktif. Klik peta, cari koordinat, atau unggah SHP/KML terlebih dahulu.',4200);
  }
  function zoomToHome(){
    var bounds=window.layer_BatasKecamatanKSB&&layer_BatasKecamatanKSB.getBounds();
    if(bounds&&bounds.isValid())map.fitBounds(bounds,fitPadding());else map.setView([-8.85,116.85],10);
    showToast('Peta kembali ke tampilan seluruh Sumbawa Barat.');
  }
  function locateMe(){
    var locate=document.querySelector('.leaflet-control-locate a');
    if(locate)locate.click();else showToast('Fitur lokasi belum siap.');
  }
  var MapNavControl=L.Control.extend({options:{position:'topleft'},onAdd:function(){
    var box=L.DomUtil.create('div','leaflet-bar st-map-nav');
    function button(icon,label,handler){
      var b=L.DomUtil.create('button','',box);b.type='button';b.title=label;b.setAttribute('aria-label',label);
      b.innerHTML='<i class="fas '+icon+'" aria-hidden="true"></i>';L.DomEvent.on(b,'click',function(e){L.DomEvent.stop(e);handler();});return b;
    }
    button('fa-crosshairs','Tampilkan lokasi saya di peta',locateMe);
    button('fa-home','Tampilkan seluruh wilayah Sumbawa Barat',zoomToHome);
    button('fa-bullseye','Zoom ke titik koordinat atau bidang aktif',zoomToActive);
    L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);
    return box;
  }});
  new MapNavControl().addTo(map);
  // Saat panel layer tertutup di desktop, tombol "Buka Panel Layer" muncul di samping peta.
  var LayerOpenControl=L.Control.extend({options:{position:'topleft'},onAdd:function(){
    var box=L.DomUtil.create('div','leaflet-bar st-layer-open'),b=L.DomUtil.create('button','',box);
    b.type='button';b.title='Buka panel layer';b.setAttribute('aria-label','Buka panel layer');
    b.innerHTML=layersIcon+'<span>Layer</span>';
    L.DomEvent.on(b,'click',function(e){L.DomEvent.stop(e);setLayersOpen(true,true);});
    L.DomEvent.disableClickPropagation(box);
    return box;
  }});
  var layerOpenControl=new LayerOpenControl().addTo(map);
  var corner=layerOpenControl.getContainer().parentNode;if(corner)corner.insertBefore(layerOpenControl.getContainer(),corner.firstChild);

  /* ---------- Pencarian di header ---------- */
  var searchForm=$('stSearch'),searchInput=$('stSearchInput');
  var fullPlaceholder='Cari desa, kecamatan, tempat, koordinat, atau tautan Maps';
  searchInput.setAttribute('aria-label',fullPlaceholder);
  function syncPlaceholder(){searchInput.placeholder=isPhone()?'Cari tempat atau koordinat':fullPlaceholder;}
  syncPlaceholder();
  if(phoneQuery.addEventListener)phoneQuery.addEventListener('change',syncPlaceholder);
  var searchMessage=document.createElement('div');searchMessage.className='st-search-msg';searchMessage.setAttribute('role','status');
  searchForm.appendChild(searchMessage);
  var suggestBox=document.createElement('ul');suggestBox.className='st-suggest';suggestBox.id='stSuggest';suggestBox.setAttribute('role','listbox');suggestBox.hidden=true;
  searchForm.appendChild(suggestBox);
  searchInput.setAttribute('role','combobox');searchInput.setAttribute('aria-autocomplete','list');searchInput.setAttribute('aria-controls','stSuggest');searchInput.setAttribute('aria-expanded','false');

  function showSearchMessage(text,isError,advanced){
    hideSuggest();
    searchMessage.innerHTML=esc(text)+(advanced?'<button type="button" data-st-search-advanced>Pilih format koordinat</button>':'');
    searchMessage.classList.toggle('error',!!isError);
    searchMessage.classList.add('show');
    clearTimeout(showSearchMessage.timer);
    showSearchMessage.timer=setTimeout(function(){searchMessage.classList.remove('show');},isError?7000:2500);
  }
  function openAdvancedSearch(){
    searchMessage.classList.remove('show');hideSuggest();
    var smartInput=$('smartSearchInput');if(smartInput&&searchInput.value.trim())smartInput.value=searchInput.value.trim();
    var opener=document.querySelector('.smart-search-button');if(opener)opener.click();
  }
  searchMessage.addEventListener('click',function(event){if(event.target.closest('[data-st-search-advanced]'))openAdvancedSearch();});

  function looksLikeCoordinate(value){
    if(/https?:\/\/|maps\.|goo\.gl/i.test(value))return true;
    if(/[°'"]/.test(value))return true;
    return (value.match(/-?\d+(?:[.,]\d+)?/g)||[]).length>=2;
  }
  function normalize(text){return String(text||'').toLocaleLowerCase('id-ID').replace(/^kec(amatan)?\.?\s*/,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
  var districts=[];
  if(window.layer_BatasKecamatanKSB&&layer_BatasKecamatanKSB.eachLayer){
    layer_BatasKecamatanKSB.eachLayer(function(item){
      var name=String(item.feature&&item.feature.properties&&item.feature.properties.KECAMATAN||'').replace(/^Kec\.\s*/i,'').trim();
      if(name)districts.push({name:name,layer:item});
    });
  }
  var suggestions=[],activeSuggestion=-1,suggestToken=0,remoteCache={};
  function localMatches(query){
    var q=normalize(query);if(!q)return [];
    return districts.filter(function(item){return normalize(item.name).indexOf(q)>=0;}).map(function(item){
      return {label:'Kecamatan '+item.name,detail:'Kabupaten Sumbawa Barat',kind:'district',layer:item.layer};
    });
  }
  function remoteMatches(query){
    var key=normalize(query);
    if(remoteCache[key])return Promise.resolve(remoteCache[key]);
    var url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=id&countrycodes=id&bounded=1&viewbox=116.55,-8.55,117.25,-9.25&q='+encodeURIComponent(query);
    return fetch(url,{headers:{'Accept':'application/json'}}).then(function(response){if(!response.ok)throw new Error('HTTP '+response.status);return response.json();}).then(function(rows){
      var items=(rows||[]).map(function(row){
        var parts=String(row.display_name||'').split(',').map(function(part){return part.trim();}).filter(Boolean);
        return {label:parts[0]||query,detail:parts.slice(1,3).join(', '),kind:'place',latlng:L.latLng(Number(row.lat),Number(row.lon))};
      });
      remoteCache[key]=items;return items;
    });
  }
  function renderSuggest(){
    if(!suggestions.length){hideSuggest();return;}
    suggestBox.innerHTML=suggestions.map(function(item,index){
      var icon=item.kind==='district'?'fa-map':item.kind==='loading'?'fa-circle-notch fa-spin':'fa-map-marker-alt';
      return '<li role="option" id="stSuggest'+index+'" data-index="'+index+'" aria-selected="'+(index===activeSuggestion)+'"'+(item.kind==='loading'?' aria-disabled="true"':'')+'><i class="fas '+icon+'" aria-hidden="true"></i><span><b>'+esc(item.label)+'</b>'+(item.detail?'<small>'+esc(item.detail)+'</small>':'')+'</span></li>';
    }).join('');
    suggestBox.hidden=false;searchInput.setAttribute('aria-expanded','true');
    if(activeSuggestion>=0)searchInput.setAttribute('aria-activedescendant','stSuggest'+activeSuggestion);else searchInput.removeAttribute('aria-activedescendant');
  }
  function hideSuggest(){suggestBox.hidden=true;searchInput.setAttribute('aria-expanded','false');searchInput.removeAttribute('aria-activedescendant');activeSuggestion=-1;}
  function updateSuggest(){
    var value=searchInput.value.trim(),token=++suggestToken;
    searchMessage.classList.remove('show');
    if(value.length<2||looksLikeCoordinate(value)){suggestions=[];hideSuggest();return;}
    var local=localMatches(value);
    suggestions=local.concat(value.length>=3?[{label:'Mencari tempat…',kind:'loading'}]:[]);activeSuggestion=-1;renderSuggest();
    if(value.length<3)return;
    clearTimeout(updateSuggest.timer);
    updateSuggest.timer=setTimeout(function(){
      remoteMatches(value).then(function(items){if(token!==suggestToken)return;suggestions=local.concat(items);renderSuggest();},
        function(){if(token!==suggestToken)return;suggestions=local;renderSuggest();});
    },350);
  }
  function chooseSuggestion(item){
    if(!item||item.kind==='loading')return;
    hideSuggest();searchInput.value=item.label;
    if(isPhone())searchInput.blur();
    if(item.kind==='district'){
      if(!map.hasLayer(layer_BatasKecamatanKSB))map.addLayer(layer_BatasKecamatanKSB);
      map.fitBounds(item.layer.getBounds(),fitPadding());
      showToast(item.label+' ditampilkan. Ketuk peta untuk memeriksa titik.');
      return;
    }
    map.setView(item.latlng,17);
    if(typeof window.identifikasiLokasi==='function')window.identifikasiLokasi(item.latlng);
  }
  searchInput.addEventListener('input',updateSuggest);
  searchInput.addEventListener('keydown',function(event){
    if(suggestBox.hidden)return;
    var selectable=suggestions.map(function(item,index){return item.kind==='loading'?-1:index;}).filter(function(index){return index>=0;});
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();if(!selectable.length)return;
      var pos=selectable.indexOf(activeSuggestion);
      pos=event.key==='ArrowDown'?(pos+1)%selectable.length:(pos<=0?selectable.length-1:pos-1);
      activeSuggestion=selectable[pos];renderSuggest();
    }else if(event.key==='Escape'){event.stopPropagation();hideSuggest();}
  });
  suggestBox.addEventListener('mousedown',function(event){event.preventDefault();});
  suggestBox.addEventListener('click',function(event){var row=event.target.closest('[data-index]');if(row)chooseSuggestion(suggestions[Number(row.dataset.index)]);});
  searchInput.addEventListener('blur',function(){setTimeout(hideSuggest,150);});

  function runCoordinateSearch(value){
    var smartInput=$('smartSearchInput'),method=$('smartSearchMethod'),submit=$('smartSearchSubmit'),state=$('smartSearchState');
    if(!smartInput||!submit){openAdvancedSearch();return;}
    smartInput.value=value;if(method)method.value='auto';
    searchForm.classList.add('is-busy');searchMessage.classList.remove('show');
    submit.click();
    var started=Date.now();
    (function wait(){
      if(submit.disabled&&Date.now()-started<15000){setTimeout(wait,120);return;}
      searchForm.classList.remove('is-busy');
      if(state&&state.classList.contains('error'))showSearchMessage(state.textContent||'Lokasi tidak dapat ditemukan.',true,true);
      else if(isPhone())searchInput.blur();
    })();
  }
  searchForm.addEventListener('submit',function(event){
    event.preventDefault();
    var value=searchInput.value.trim();
    if(!value){showSearchMessage('Ketik nama desa, kecamatan, tempat, koordinat, atau tautan Google Maps.',true);return;}
    if(looksLikeCoordinate(value)){hideSuggest();runCoordinateSearch(value);return;}
    if(activeSuggestion>=0){chooseSuggestion(suggestions[activeSuggestion]);return;}
    var local=localMatches(value);
    if(local.length===1&&normalize(local[0].layer.feature.properties.KECAMATAN)===normalize(value)){chooseSuggestion(local[0]);return;}
    searchForm.classList.add('is-busy');
    remoteMatches(value).then(function(items){
      searchForm.classList.remove('is-busy');
      var all=local.concat(items);
      if(all.length===1||(all.length&&!local.length&&items.length))chooseSuggestion(all[0]);
      else if(all.length){suggestions=all;activeSuggestion=-1;renderSuggest();}
      else showSearchMessage('"'+value+'" tidak ditemukan di Sumbawa Barat. Coba nama desa atau kecamatan, atau masukkan koordinat.',true,true);
    },function(){
      searchForm.classList.remove('is-busy');
      if(local.length){suggestions=local;renderSuggest();}
      else showSearchMessage('Pencarian tempat butuh koneksi internet. Anda tetap bisa memasukkan koordinat.',true,true);
    });
  });
  $('stSearchAdvanced').addEventListener('click',openAdvancedSearch);
  $('stSearchLocate').addEventListener('click',function(){
    var locate=document.querySelector('.leaflet-control-locate a');
    if(locate)locate.click();else showSearchMessage('Fitur lokasi belum siap.',true);
  });

  /* ---------- Panel hasil identifikasi titik ---------- */
  var themeLayerKeys=['sigap','pippib','rtrw-provinsi','rtrw','rdtr','lp2b','lsd','lbs','administrasi','jalan','sempadan'];
  function layerKeyActive(key){
    var groups=typeof window.analysisLayerGroups==='function'?window.analysisLayerGroups():{};
    return (groups[key]||[]).some(function(layer){return layer&&map.hasLayer(layer);});
  }
  function setLayerKey(key,on){
    var groups=typeof window.analysisLayerGroups==='function'?window.analysisLayerGroups():{};
    (groups[key]||[]).forEach(function(layer){if(!layer)return;if(on&&!map.hasLayer(layer))map.addLayer(layer);if(!on&&map.hasLayer(layer))map.removeLayer(layer);});
  }
  function syncShowSwitches(){
    document.querySelectorAll('[data-st-layer]').forEach(function(input){input.checked=layerKeyActive(input.dataset.stLayer);});
  }
  map.on('layeradd layerremove',syncShowSwitches);
  document.addEventListener('change',function(event){
    var input=event.target.closest&&event.target.closest('[data-st-layer]');if(!input)return;
    setLayerKey(input.dataset.stLayer,input.checked);syncShowSwitches();
  });

  function copyText(text,label,done){
    function fallback(){window.prompt(label,text);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,fallback);else fallback();
  }
  function shareUrl(latlng){
    var lat=latlng.lat.toFixed(6),lng=latlng.lng.toFixed(6);
    return location.origin+location.pathname+'?titik='+lat+','+lng+'#'+Math.max(map.getZoom(),16)+'/'+lat+'/'+lng;
  }
  document.addEventListener('click',function(event){
    if(!event.target.closest)return;
    var copy=event.target.closest('[data-st-copy]');
    if(copy){copyText(copy.dataset.stCopy,'Salin koordinat:',function(){showToast('Koordinat disalin');});return;}
    var share=event.target.closest('[data-st-share]');
    if(share&&lastIdentification){
      var url=shareUrl(lastIdentification.latlng),title='Hasil SOBAT TARU — Kecamatan '+(lastIdentification.kecamatan||'');
      if(navigator.share&&isPhone())navigator.share({title:title,text:'Hasil pemeriksaan tata ruang SOBAT TARU',url:url}).catch(function(){});
      else copyText(url,'Salin tautan:',function(){showToast('Tautan hasil disalin. Tempel di WhatsApp atau surel.');});
      return;
    }
    if(event.target.closest('[data-st-print]')){
      var stamp=$('stPrintStamp');if(stamp)stamp.textContent='Dicetak '+new Date().toLocaleString('id-ID',{dateStyle:'long',timeStyle:'short'});
      document.body.classList.add('st-printing');
      setTimeout(function(){window.print();},30);
    }
  });
  window.addEventListener('afterprint',function(){document.body.classList.remove('st-printing');});

  function showSwitch(key){
    if(themeLayerKeys.indexOf(key)<0)return '';
    return '<label class="st-show">Tampilkan di peta<input type="checkbox" data-st-layer="'+key+'"'+(layerKeyActive(key)?' checked':'')+'></label>';
  }
  function chip(inside,textIn,textOut){return inside?'<span class="st-chip in">'+(textIn||'Masuk')+'</span>':'<span class="st-chip out">'+(textOut||'Tidak masuk')+'</span>';}
  function item(options){
    return '<div class="st-item'+(options.flag?' is-flagged':'')+'"><div class="st-item-label">'+esc(options.label)+'</div>'+
      '<div class="st-item-title">'+options.title+'</div>'+
      (options.sub?'<div class="st-item-sub">'+options.sub+'</div>':'')+
      (options.details||'')+
      '<div class="st-item-row">'+(options.chip||'<span></span>')+showSwitch(options.key)+'</div></div>';
  }
  var protectedPattern=/lindung|konservasi|mangrove|cagar|suaka|taman nasional|taman wisata alam|taman hutan raya|resapan|rawan bencana|ruang terbuka hijau|sempadan|perlindungan setempat/i;

  /* ---------- Analisis titik dan bidang: satu mesin, satu tampilan (mengikuti Bale Ruang NTB) ----------
   * Titik: layer yang mencakup lokasi beserta kelasnya. Bidang: luas irisan per layer dan per kelas.
   * Layer yang tidak mencakup/beririsan dikumpulkan dalam satu grup yang bisa dibuka. */
  var LP2B_NOTE='Hasil Verifikasi Usulan LP2B, belum merupakan penetapan. Sumber: Kementerian ATR/BPN &amp; Pemprov NTB, 6 Okt 2026.';
  var ANALYSIS_DEFS=[
    {id:'rtrw-provinsi',key:'rtrw-provinsi',layer:'layer_RTRWPROVINSINTB20242044_7',field:'NAMOBJ',title:'Pola Ruang RTRW',sub:'Provinsi NTB 2024–2044',legal:'Perda Provinsi NTB No. 5 Tahun 2024',color:function(v){return window.rtrwProvinsiColors?window.rtrwProvinsiColors.color(v):'';}},
    {id:'rtrw',key:'rtrw',layer:'layer_RTRWSUMBAWABARAT20202040_3',field:'NAMOBJ',title:'Pola Ruang RTRW',sub:'Kabupaten Sumbawa Barat 2020–2040',legal:'Perda Kab. Sumbawa Barat No. 11 Tahun 2020'},
    {id:'rdtr-taliwang',key:'rdtr',layer:'layer_RDTRTALIWANG_2',field:'NAMAOBJ',title:'RDTR dan Peraturan Zonasi Perkotaan Taliwang',sub:'Sumbawa Barat',legal:'Perda Sumbawa Barat No. 12 Tahun 2016'},
    {id:'rdtr-maluk',key:'rdtr',layer:'layer_RDTRMALUK_1',field:'NAMOBJ',title:'RDTR Sekitar Kawasan Industri Maluk',sub:'Sumbawa Barat',legal:'Perbup Sumbawa Barat No. 4 Tahun 2023'},
    {id:'lsd',key:'lsd',layer:'layer_LSD_Kabupaten_Sumbawa_Barat_4',field:'LSD',title:'LSD Provinsi NTB',sub:'Lahan Sawah yang Dilindungi',constraint:'LSD'},
    {id:'lp2b',key:'lp2b',layer:'layer_LP2BSUMBAWABARAT_5',field:'KELAS',title:'LP2B Hasil Verifikasi Usulan tahun 2026',sub:'Belum merupakan penetapan',note:LP2B_NOTE},
    {id:'lbs',key:'lbs',layer:'layer_LBS_Kabupaten_Sumbawa_Barat_6',field:'JSWH',title:'LBS Provinsi NTB',sub:'Lahan Baku Sawah'},
    {id:'pippib',key:'pippib',layer:'layer_PIPPIB2025',value:function(p){return typeof window.pippibCategory==='function'?window.pippibCategory(p).label:p.PIPPIB;},title:'PIPPIB Provinsi NTB 2025',sub:'Peta Indikatif Penghentian Pemberian Izin Baru',constraint:'PIPPIB',danger:true},
    {id:'sigap',key:'sigap',sigap:true,title:'Kawasan Hutan',sub:'Kementerian Kehutanan RI (SIGAP)'},
    {id:'sempadan-sungai',key:'sempadan',layer:'layer_SempadanSungaiRTRW',field:'NAMOBJ',title:'Sempadan Sungai',sub:'RTRW Kabupaten Sumbawa Barat',constraint:'Sempadan'},
    {id:'sempadan-pantai',key:'sempadan',layer:'layer_SempadanPantaiRTRW',field:'NAMOBJ',title:'Sempadan Pantai',sub:'RTRW Kabupaten Sumbawa Barat',constraint:'Sempadan'},
    {id:'jalan',key:'jalan',layer:'layer_JaringanJalanKSB',field:'NAMOBJ',line:true,title:'Jaringan Jalan',sub:'Kabupaten Sumbawa Barat'}
  ];
  var HIDDEN_ATTR=/^(objectid(_1)?|fid|shape_.*|orde0\d|metadata|srs_id|fcode|lcode|luas_cyl|tglskpnjk|lskpnjk|kdp.*|kdc.*|kde.*|kdb.*|__.*)$/i;
  var MIN_AREA=1;
  function fmtArea(m2){var v=Number(m2)||0;return Math.round(v).toLocaleString('id-ID')+' m²';}
  function fmtAreaLong(m2){var v=Number(m2)||0;return v>=10000?(v/10000).toLocaleString('id-ID',{maximumFractionDigits:4})+' ha ('+fmtArea(v)+')':fmtArea(v);}
  function fmtPct(part,base){if(!base||!part)return '';var v=Math.min(100,part/base*100);return (v<0.1?'<0,1':v.toLocaleString('id-ID',{minimumFractionDigits:1,maximumFractionDigits:1}))+'%';}
  function areaOf(geometry){try{return (typeof window.utm50Area==='function'&&window.utm50Area(geometry))||turf.area(geometry)||0;}catch(_areaError){return 0;}}
  function boxesOverlap(a,b){return !(a[0]>b[2]||a[2]<b[0]||a[1]>b[3]||a[3]<b[1]);}
  function layerBox(layer){try{var b=layer.getBounds();return b&&b.isValid()?[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]:null;}catch(_boundsError){return null;}}
  function featureValue(def,feature){
    var p=feature&&feature.properties||{},v=def.value?def.value(p):p[def.field];
    v=v==null?'':String(v).replace(/\s+/g,' ').trim();
    return v&&v!=='-'?v:'';
  }
  function eachFeatureLayer(def,fn){var layer=window[def.layer];if(!layer||typeof layer.eachLayer!=='function')return;layer.eachLayer(fn);}

  function analysePoint(latlng){
    var pt=turf.point([latlng.lng,latlng.lat]),results=[];
    ANALYSIS_DEFS.forEach(function(def){
      if(def.line)return;
      var result={def:def,hits:[],values:[],categories:[]};
      if(def.sigap){
        var feature=typeof window.sigapFeatureAt==='function'?window.sigapFeatureAt(latlng.lng,latlng.lat):null;
        var category=feature&&typeof window.sigapCategoryFromFeature==='function'?window.sigapCategoryFromFeature(feature):(typeof window.sigapPixelAt==='function'?window.sigapPixelAt(latlng.lng,latlng.lat):null);
        if(category){result.hits=feature?[feature]:[{properties:{}}];result.values=[category.label];result.sigapCategory=category;result.forest=category.key!=='apl';}
      }else{
        eachFeatureLayer(def,function(layer){
          var box=layerBox(layer);if(box&&(latlng.lng<box[0]||latlng.lng>box[2]||latlng.lat<box[1]||latlng.lat>box[3]))return;
          try{var g=layer.feature||layer.toGeoJSON();if(turf.booleanPointInPolygon(pt,g)){result.hits.push(g);var v=featureValue(def,g);if(v&&result.values.indexOf(v)<0)result.values.push(v);}}catch(_pointError){}
        });
      }
      result.inside=result.hits.length>0;
      results.push(result);
    });
    var kecamatan='';
    if(window.layer_BatasKecamatanKSB)layer_BatasKecamatanKSB.eachLayer(function(layer){try{var g=layer.feature||layer.toGeoJSON();if(!kecamatan&&turf.booleanPointInPolygon(pt,g))kecamatan=String(g.properties.KECAMATAN||'').replace(/^Kec\.\s*/i,'');}catch(_kecError){}});
    return {mode:'point',latlng:latlng,results:results,kecamatan:kecamatan,places:kecamatan?[{name:kecamatan,kind:'kecamatan'}]:[]};
  }

  function analysePolygon(geojson){
    var parts=turf.flatten(geojson).features.filter(function(f){return f.geometry&&/Polygon/.test(f.geometry.type);}).map(function(f){var box=null;try{box=turf.bbox(f);}catch(_bboxError){}return {feature:f,box:box};});
    var total=0;parts.forEach(function(part){total+=areaOf(part.feature);});
    var results=[];
    function intersectArea(layerGeojson,layerBoxValue){
      var area=0;
      parts.forEach(function(part){
        if(part.box&&layerBoxValue&&!boxesOverlap(part.box,layerBoxValue))return;
        try{if(turf.booleanIntersects(part.feature,layerGeojson)){var inter=turf.intersect(part.feature,layerGeojson);if(inter){var a=areaOf(inter);if(a>=MIN_AREA)area+=a;}}}catch(_intersectError){}
      });
      return area;
    }
    ANALYSIS_DEFS.forEach(function(def){
      var result={def:def,hits:[],values:[],categories:[],area:0};
      if(def.sigap){
        var sigap=typeof window.analyzeSigapGeometry==='function'?window.analyzeSigapGeometry(geojson,total):null;
        if(sigap&&sigap.ready&&sigap.items&&sigap.items.length){
          sigap.items.forEach(function(item){result.categories.push({name:item.category.label,area:total?Math.min(item.area,total):item.area,hex:item.category.hex});result.area+=item.area;if(item.category.key!=='apl')result.forest=true;});
          result.sigapMethod=sigap.sourceType==='vector'?'Luas dihitung dari irisan poligon vektor SIGAP skala 1:250.000.':'Estimasi dari klasifikasi piksel raster cadangan SIGAP.';
          result.hits=[{properties:{}}];
        }else if(sigap&&!sigap.ready)result.pending=true;
      }else if(def.line){
        var names=[];
        eachFeatureLayer(def,function(layer){
          var box=layerBox(layer);
          var hit=parts.some(function(part){if(part.box&&box&&!boxesOverlap(part.box,box))return false;try{return turf.booleanIntersects(part.feature,layer.feature||layer.toGeoJSON());}catch(_lineError){return false;}});
          if(hit){var g=layer.feature||layer.toGeoJSON();result.hits.push(g);var v=featureValue(def,g)||'Ruas jalan tanpa nama';if(names.indexOf(v)<0)names.push(v);}
        });
        result.values=names.sort(function(a,b){return a.localeCompare(b,'id-ID');});
      }else{
        var byName=Object.create(null);
        eachFeatureLayer(def,function(layer){
          var g=layer.feature||layer.toGeoJSON(),a=intersectArea(g,layerBox(layer));
          if(a<MIN_AREA)return;
          result.area+=a;result.hits.push({type:'Feature',properties:g.properties,__area:a});
          var name=featureValue(def,g)||'Tanpa keterangan';byName[name]=(byName[name]||0)+a;
        });
        result.categories=Object.keys(byName).map(function(name){return {name:name,area:byName[name],hex:def.color?def.color(name):''};}).sort(function(a,b){return b.area-a.area;});
      }
      if(total&&result.area>total)result.area=total;
      result.inside=def.line?result.hits.length>0:result.area>=MIN_AREA;
      results.push(result);
    });
    var places=[];
    if(window.layer_BatasKecamatanKSB){
      var kec=Object.create(null);
      layer_BatasKecamatanKSB.eachLayer(function(layer){var g=layer.feature||layer.toGeoJSON(),a=intersectArea(g,layerBox(layer));if(a>=MIN_AREA){var n=String(g.properties.KECAMATAN||'').replace(/^Kec\.\s*/i,'');kec[n]=(kec[n]||0)+a;}});
      places=Object.keys(kec).sort(function(a,b){return kec[b]-kec[a];}).map(function(n){return {name:n,kind:'kecamatan',area:kec[n]};});
    }
    var center=null;try{var c=turf.pointOnFeature(geojson).geometry.coordinates;center=L.latLng(c[1],c[0]);}catch(_centerError){}
    return {mode:'polygon',geojson:geojson,parts:parts,total:total,results:results,latlng:center,kecamatan:places.length?places[0].name:'',places:places};
  }

  // Nama desa/kelurahan dari batas desa Bale Ruang (dimuat saat dibutuhkan); kecamatan tetap tampil bila desa belum terbaca.
  function lookupVillages(model){
    var contains=function(geometry,x,y){try{return turf.booleanPointInPolygon([x,y],geometry);}catch(_e){return false;}};
    if(model.mode==='point'){
      if(typeof window.ntbAdminLookup!=='function')return Promise.resolve(null);
      return window.ntbAdminLookup(model.latlng.lng,model.latlng.lat,contains).then(function(features){
        return (features||[]).slice(0,1).map(function(f){var p=f.properties||{};return {name:p.WADMKD,kecamatan:String(p.WADMKC||'').replace(/^Kec(amatan)?\.?\s*/i,'')};});
      }).catch(function(){return null;});
    }
    if(typeof window.ntbAdminFeaturesInBounds!=='function'||!model.parts.length)return Promise.resolve(null);
    var box=turf.bbox(model.geojson);
    return window.ntbAdminFeaturesInBounds(box).then(function(features){
      var found=[];
      (features||[]).forEach(function(f){
        var area=0;model.parts.forEach(function(part){try{if(turf.booleanIntersects(part.feature,f)){var inter=turf.intersect(part.feature,f);if(inter)area+=areaOf(inter);}}catch(_e){}});
        if(area>=MIN_AREA){var p=f.properties||{};found.push({name:p.WADMKD,kecamatan:String(p.WADMKC||'').replace(/^Kec(amatan)?\.?\s*/i,''),area:area});}
      });
      return found.sort(function(a,b){return b.area-a.area;});
    }).catch(function(){return null;});
  }

  function attrTable(properties){
    var rows=Object.keys(properties||{}).filter(function(k){var v=properties[k];return !HIDDEN_ATTR.test(k)&&v!==null&&v!==undefined&&String(v).trim()!==''&&String(v).trim()!=='-'&&v!==0;})
      .map(function(k){return '<tr><th>'+esc(k)+'</th><td>'+esc(properties[k])+'</td></tr>';}).join('');
    return rows?'<table class="st-attr">'+rows+'</table>':'';
  }
  function detailHtml(result,model){
    var def=result.def,out='';
    if(def.legal)out+='<div class="st-legal"><span>Dasar hukum</span>'+esc(def.legal)+'</div>';
    if(def.sigap&&result.sigapCategory)out+='<p class="st-note">'+esc(result.sigapCategory.meaning||'')+(result.sigapCategory.action?' '+esc(result.sigapCategory.action):'')+'</p>';
    if(def.sigap&&result.sigapMethod)out+='<p class="st-note">'+esc(result.sigapMethod)+' Konfirmasikan dengan dokumen SK kawasan hutan yang berlaku.</p>';
    if(model.mode==='polygon'&&!def.line&&!def.sigap)out+='<p class="st-note">≈ Luas beririsan '+esc(fmtAreaLong(result.area))+' • '+result.hits.length.toLocaleString('id-ID')+' fitur sumber beririsan</p>';
    if(def.line&&model.mode==='polygon')out+='<p class="st-note">'+result.values.length+' ruas jalan memotong bidang.</p>';
    var features=result.hits.filter(function(f){return f&&f.properties&&Object.keys(f.properties).length;});
    features.slice(0,5).forEach(function(f,i){
      var table=attrTable(f.properties);if(!table)return;
      out+=(features.length>1?'<div class="st-feat">Fitur '+(i+1)+(f.__area?' · '+esc(fmtArea(f.__area)):'')+'</div>':'')+table;
    });
    if(features.length>5)out+='<p class="st-note">+'+(features.length-5).toLocaleString('id-ID')+' fitur lain.</p>';
    if(def.note)out+='<p class="st-note">'+def.note+'</p>';
    return out||'<p class="st-note">Tidak ada atribut tambahan.</p>';
  }
  function layerSection(result,model,index){
    var def=result.def,flagged=!!(def.constraint||(def.sigap&&result.forest)||(/^rtrw/.test(def.id)&&result.values.some(function(v){return protectedPattern.test(v);})));
    var head,rows='';
    if(model.mode==='polygon'&&!def.line){
      head='<div class="st-lrow st-lhead"><div class="st-lname">'+esc(def.title)+'<small>'+esc(def.sub)+'</small></div><div class="st-lnum">'+esc(fmtArea(result.area))+'</div><div class="st-lpct">'+esc(fmtPct(result.area,model.total))+'</div></div>';
      rows=result.categories.map(function(cat){return '<div class="st-lrow"><div class="st-lcat">'+(cat.hex?'<span class="st-swatch" style="background:'+esc(cat.hex)+'"></span>':'')+esc(cat.name)+'</div><div class="st-lnum">'+esc(fmtArea(cat.area))+'</div><div class="st-lpct">'+esc(fmtPct(cat.area,model.total))+'</div></div>';}).join('');
    }else{
      head='<div class="st-lname">'+esc(def.title)+'<small>'+esc(def.sub)+'</small></div>';
      var values=result.values.length?result.values:['Lokasi berada di dalam layer ini'];
      if(def.line&&values.length>6){rows=values.slice(0,6).map(function(v){return '<div class="st-lcat">'+esc(v)+'</div>';}).join('')+'<div class="st-lcat st-more">+'+(values.length-6)+' ruas lain</div>';}
      else rows=values.map(function(v){var hex=def.sigap&&result.sigapCategory?result.sigapCategory.hex:(def.color&&result.values.length?def.color(v):'');return '<div class="st-lcat">'+(hex?'<span class="st-swatch" style="background:'+esc(hex)+'"></span>':'')+esc(v)+'</div>';}).join('');
    }
    return '<section class="st-layer'+(flagged?' is-flagged':'')+'">'+head+rows+
      '<div class="st-lacts"><button type="button" class="st-more-btn" data-st-detail="'+index+'" aria-expanded="false"><i class="fas fa-chevron-right" aria-hidden="true"></i><span>Rincian</span></button>'+showSwitch(def.key)+'</div>'+
      '<div class="st-ldetail" hidden>'+detailHtml(result,model)+'</div></section>';
  }
  function placesHtml(model,villages){
    if(villages&&villages.length)return villages.slice(0,4).map(function(v){return '<b>'+esc(v.name)+'</b><small>Kec. '+esc(v.kecamatan||model.kecamatan)+' · Sumbawa Barat</small>';}).join('')+(villages.length>4?'<small>+'+(villages.length-4)+' desa lain</small>':'');
    if(model.places.length)return model.places.map(function(p){return '<b>Kec. '+esc(p.name)+'</b>';}).join('')+'<small>Sumbawa Barat</small>';
    return '<b>—</b>';
  }
  function analysisHtml(model,options){
    var polygon=model.mode==='polygon',subject=polygon?'Bidang':'Lokasi';
    var inside=model.results.filter(function(r){return r.inside;}),outside=model.results.filter(function(r){return !r.inside&&!r.pending;});
    var flags=[];
    inside.forEach(function(r){
      var name=r.def.constraint||'';
      if(/^rtrw/.test(r.def.id)&&r.values.concat(r.categories.map(function(c){return c.name;})).some(function(v){return protectedPattern.test(v);}))name='Kawasan lindung RTRW';
      if(name&&flags.indexOf(name)<0)flags.push(name);
    });
    var forest=inside.filter(function(r){return r.def.sigap&&r.forest;})[0];
    var lp2b=inside.some(function(r){return r.def.id==='lp2b';});
    var lat=model.latlng?model.latlng.lat:0,lng=model.latlng?model.latlng.lng:0;
    var utm=null;try{if(model.latlng&&typeof window.projectToUtm50S==='function')utm=window.projectToUtm50S([lng,lat]);}catch(_utmError){}
    var html='<div class="st-print-head"><b>SOBAT TARU — Hasil Analisis Spasial '+(polygon?'Bidang':'Koordinat')+'</b><span id="stPrintStamp"></span></div>';
    if(polygon){
      html+='<div class="st-card"><div class="st-card-title">Bidang yang diperiksa</div><div class="st-coords">'+
        '<div><span>'+esc(options.areaLabel||'Luas bidang')+'</span> <b>'+esc(fmtAreaLong(model.total))+'</b></div>'+
        (options.cadastral?'<div><span>Luas atribut bidang</span> '+esc(fmtAreaLong(options.cadastral))+'</div>':'')+
        (model.latlng?'<div><span>Titik tengah</span> <code>'+lat.toFixed(6)+', '+lng.toFixed(6)+'</code></div>':'')+
      '</div></div>';
    }else{
      html+='<div class="st-card"><div class="st-card-title">Lokasi yang diperiksa</div><div class="st-coords">'+
        '<div><span>Lintang, Bujur</span> <code>'+lat.toFixed(6)+', '+lng.toFixed(6)+'</code></div>'+
        (utm?'<div><span>UTM 50S</span> <code>X '+Number(utm[0]).toFixed(2)+' &middot; Y '+Number(utm[1]).toFixed(2)+'</code></div>':'')+
      '</div></div>';
    }
    var bhumi=options.bhumiUrl||'';
    var actionCount=(model.latlng?1:0)+(bhumi?1:0)+1;
    html+='<div class="st-actions" style="grid-template-columns:repeat('+actionCount+',minmax(0,1fr))">'+
      (model.latlng?'<a class="st-action" href="https://www.google.com/maps/dir/?api=1&destination='+lat.toFixed(7)+','+lng.toFixed(7)+'" target="_blank" rel="noopener noreferrer"><i class="fas fa-location-arrow" aria-hidden="true"></i>Arah</a>':'')+
      (bhumi?'<a class="st-action" href="'+esc(bhumi)+'" target="_blank" rel="noopener noreferrer" title="Buka BHUMI ATR/BPN untuk melihat bidang tanah di sini"><i class="fas fa-external-link-alt" aria-hidden="true"></i>Cek Bidang</a>':'')+
      (polygon?'<button class="st-action primary" type="button" data-st-print><i class="fas fa-print" aria-hidden="true"></i>Cetak PDF</button>':'<button class="st-action primary" type="button" data-st-share><i class="fas fa-share-alt" aria-hidden="true"></i>Bagikan</button>')+
    '</div>';
    html+='<div class="st-actions-sub">'+
      (model.latlng?'<button type="button" data-st-copy="'+lat.toFixed(6)+', '+lng.toFixed(6)+'"><i class="fas fa-copy" aria-hidden="true"></i>Salin koordinat</button>':'')+
      (polygon?'':'<button type="button" data-st-print><i class="fas fa-print" aria-hidden="true"></i>Cetak / PDF</button>')+
      (options.measured?'<button type="button" data-digitized-action="export"><i class="fas fa-download" aria-hidden="true"></i>Export SHP</button><button type="button" data-digitized-action="delete"><i class="fas fa-trash-alt" aria-hidden="true"></i>Hapus bidang</button>':'')+
    '</div>';
    if(forest)html+='<div class="st-alert danger"><i class="fas fa-tree" aria-hidden="true"></i><div><b>'+subject+(polygon?' beririsan dengan kawasan hutan':' berada di kawasan hutan')+'</b>'+esc((forest.sigapCategory&&forest.sigapCategory.action)||'Konfirmasikan kepada instansi kehutanan yang berwenang.')+'</div></div>';
    if(flags.length)html+='<div class="st-alert'+(flags.indexOf('PIPPIB')>=0?' danger':'')+'"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i><div><b>'+subject+' beririsan dengan '+esc(flags.join(', '))+'</b>Pemanfaatan ruang di sini terikat ketentuan khusus perlindungan lahan/izin. Konfirmasikan kepada instansi berwenang.</div></div>';
    if(lp2b)html+='<div class="st-alert info"><i class="fas fa-info-circle" aria-hidden="true"></i><div><b>'+subject+' berada dalam LP2B Hasil Verifikasi Usulan tahun 2026</b>Belum merupakan penetapan; menunggu Keputusan Bupati. Untuk rencana pemanfaatan, konfirmasikan ke Pemda setempat.</div></div>';
    var pending=model.results.some(function(r){return r.pending;});
    html+='<div class="st-card st-res"><div class="st-results-head"><div class="st-card-title">Hasil analisis</div><small>'+inside.length+' masuk • '+outside.length+' tidak</small></div>'+
      '<div class="st-meta"><div class="st-meta-item"><span class="st-meta-label">Desa/Kelurahan</span><div class="st-places" data-st-places>'+placesHtml(model,null)+'</div></div>'+
      (polygon?'<div class="st-meta-item"><span class="st-meta-label">Luas bidang</span><b>'+esc(model.total>=10000?(model.total/10000).toLocaleString('id-ID',{maximumFractionDigits:4})+' ha':fmtArea(model.total))+'</b>'+(model.total>=10000?'<small>'+esc(fmtArea(model.total))+'</small>':'')+'</div>':'')+
      '</div>'+
      '<div class="st-lacts st-meta-acts">'+showSwitch('administrasi')+'</div>';
    html+=inside.length?inside.map(function(r){return layerSection(r,model,model.results.indexOf(r));}).join(''):'<p class="st-empty">Tidak ada layer yang '+(polygon?'beririsan dengan bidang ini.':'mencakup lokasi ini.')+'</p>';
    if(pending)html+='<p class="st-note">Data kawasan hutan sedang dimuat. Ulangi analisis setelah sinkronisasi selesai.</p>';
    if(outside.length)html+='<details class="st-out"><summary>'+outside.length+' layer '+(polygon?'tidak beririsan dengan bidang':'tidak mencakup lokasi ini')+'</summary>'+
      outside.map(function(r){return '<div class="st-outrow">'+esc(r.def.title)+'<small>'+esc(r.def.sub)+'</small></div>';}).join('')+'</details>';
    html+='</div>';
    html+='<p class="st-foot-note">Hasil SOBAT TARU bersifat indikatif, memakai seluruh dataset yang tersedia meskipun layer disembunyikan, dan bukan produk hukum.'+(polygon?' Luas irisan dihitung dari geometri (UTM 50S), bukan ukuran kadastral.':'')+' Konfirmasikan kepada instansi berwenang.</p>';
    return html;
  }
  var analysisToken=0;
  function renderAnalysis(model,options,target){
    var token=++analysisToken,body=target||$('stResultBody');
    body.innerHTML=analysisHtml(model,options||{});
    lookupVillages(model).then(function(villages){
      if(token!==analysisToken||!villages||!villages.length)return;
      body.querySelectorAll('[data-st-places]').forEach(function(node){node.innerHTML=placesHtml(model,villages);});
    });
  }
  // Rincian per layer (panel hasil maupun panel eksplorasi bidang lama).
  document.addEventListener('click',function(event){
    var button=event.target.closest&&event.target.closest('[data-st-detail]');if(!button)return;
    var panel=button.closest('.st-layer').querySelector('.st-ldetail'),open=panel.hidden;
    panel.hidden=!open;button.setAttribute('aria-expanded',String(open));
    button.querySelector('i').className='fas fa-chevron-'+(open?'down':'right');
    button.querySelector('span').textContent=open?'Tutup rincian':'Rincian';
  });

  function setResultTitle(polygon){
    var title=resultPanel.querySelector('.st-panel-head h2');
    if(title)title.innerHTML='<i class="fas '+(polygon?'fa-object-group':'fa-map-marker-alt')+'" aria-hidden="true"></i>'+(polygon?'Analisis Bidang':'Analisis Lokasi');
  }

  window.sobatRenderIdentification=function(data){
    var model=analysePoint(data.latlng);
    lastIdentification={mode:'point',latlng:data.latlng,kecamatan:model.kecamatan||data.kecamatan};
    hideHint(true);
    setResultTitle(false);
    renderAnalysis(model,{bhumiUrl:data.bhumiUrl});
    var body=$('stResultBody');body.scrollTop=0;
    hideUploadResult();
    showResult();
    setTimeout(function(){keepPointVisible(data.latlng);},isPhone()?260:60);
  };

  // Analisis bidang (unggah SHP/KML, ukur luas, PDF KKPR, bidang eksplorasi) memakai tampilan yang sama dengan analisis titik.
  if(typeof window.runAnalysis==='function'){
    window.runAnalysis=function(geojson){
      window.lastUploadedFeature=geojson;
      map.closePopup();
      var features=geojson.type==='FeatureCollection'?geojson.features:[geojson];
      var props=function(f){return f&&f.properties||{};};
      var explorer=features.some(function(f){return props(f).__SOBAT_EXPLORER_SELECTED===true;});
      var measured=features.some(function(f){return props(f).__SOBAT_MEASURED===true||/HASIL PENGUKURAN/i.test(String(props(f).NAMA||props(f).Nama||''));});
      var cadastral=features.reduce(function(sum,f){var v=Number(props(f).__SOBAT_KADASTRAL_M2);return sum+(v>0?v:0);},0);
      var hasNib=features.length&&features.every(function(f){var p=props(f);return p.__SOBAT_HAS_NIB===true||Object.keys(p).some(function(k){return /^(NIB|NIBIDANG|NOMORNIB)$/.test(String(k).toUpperCase().replace(/[^A-Z0-9]/g,''))&&String(p[k]||'').trim();});});
      var model=analysePolygon(geojson);
      var options={measured:measured,cadastral:cadastral,areaLabel:measured?'Luas hasil pengukuran':'Luas bidang',bhumiUrl:!explorer&&!hasNib&&typeof window.bhumiUrlForGeojson==='function'?window.bhumiUrlForGeojson(geojson):''};
      lastIdentification={mode:'polygon',latlng:model.latlng,kecamatan:model.kecamatan,geojson:geojson};
      hideHint(true);
      if(explorer){
        // Bidang dari eksplorasi tetap tampil di panel eksplorasi (kartu bidang ditambahkan di atasnya).
        var legacyPanel=uploadPanel(),content=$('analysisContent');
        if(legacyPanel&&content){legacyPanel.style.display='block';renderAnalysis(model,options,content);}
      }else{
        setResultTitle(true);
        renderAnalysis(model,options);
        $('stResultBody').scrollTop=0;
        var legacy=uploadPanel();if(legacy)legacy.style.display='none';
        showResult();
      }
      if(typeof window.presentUploadedAnalysis==='function')window.presentUploadedAnalysis(geojson);
    };
  }
  // Hapus bidang hasil digitasi juga menutup panel hasil.
  document.addEventListener('click',function(event){
    if(event.target.closest&&event.target.closest('[data-digitized-action="delete"]')){lastIdentification=null;hideResult(true);}
  });

  /* ---------- Petunjuk awal ---------- */
  function hideHint(remember){hint.hidden=true;if(remember)store('sobatTaruHintSeen','1');}
  if(store('sobatTaruHintSeen')!=='1')hint.hidden=false;

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
  function fitPadding(){
    if(isPhone())return {paddingTopLeft:[16,headerBottom()+70],paddingBottomRight:[16,navHeight()+16]};
    return {paddingTopLeft:[(layerPanel.hidden?24:layerPanel.getBoundingClientRect().right+16),headerBottom()+16],paddingBottomRight:[24,40]};
  }
  function applyLayout(){
    closeMenus();
    if(isPhone())setLayersOpen(false);
    else setLayersOpen(store('sobatTaruLayerPanel')!=='0');
    [layerPanel,resultPanel].forEach(function(panel){sheetState(panel,panel.dataset.sheet||'half');});
    setTimeout(function(){map.invalidateSize();},50);
  }
  if(phoneQuery.addEventListener)phoneQuery.addEventListener('change',applyLayout);else if(phoneQuery.addListener)phoneQuery.addListener(applyLayout);
  window.addEventListener('resize',function(){
    if(!toolsMenu.hidden)placeMenu(toolsMenu,navTools);if(!infoMenu.hidden)placeMenu(infoMenu,navAbout);
    [layerPanel,resultPanel].forEach(function(panel){if(!panel.hidden&&panel.dataset.sheet)sheetState(panel,panel.dataset.sheet);});
  });
  syncBasemapSegment();
  applyLayout();
  map.closePopup();
  renderLegend();refreshLayersOff();

  var params=new URLSearchParams(location.search);
  var sharedPoint=(params.get('titik')||'').split(',').map(Number);
  var hasSharedPoint=sharedPoint.length===2&&sharedPoint.every(isFinite)&&Math.abs(sharedPoint[0])<=90&&Math.abs(sharedPoint[1])<=180;
  var initialHash=/^#\d+\/-?[\d.]+\/-?[\d.]+/.test(window.__stInitialHash||'');
  if(window.layer_BatasKecamatanKSB&&store('sobatTaruKecamatanDefault')!=='0'&&!map.hasLayer(layer_BatasKecamatanKSB))map.addLayer(layer_BatasKecamatanKSB);
  if(window.layer_BatasKecamatanKSB){layer_BatasKecamatanKSB.on('add',function(){store('sobatTaruKecamatanDefault','1');});layer_BatasKecamatanKSB.on('remove',function(){store('sobatTaruKecamatanDefault','0');});}
  if(hasSharedPoint){
    var shared=L.latLng(sharedPoint[0],sharedPoint[1]);
    if(!initialHash)map.setView(shared,17);
    setTimeout(function(){if(typeof window.identifikasiLokasi==='function')window.identifikasiLokasi(shared);},120);
  }else if(!initialHash&&window.layer_BatasKecamatanKSB&&layer_BatasKecamatanKSB.getBounds().isValid()){
    map.fitBounds(layer_BatasKecamatanKSB.getBounds(),fitPadding());
  }
  hideLoader();
})();
