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
  var installPrompt=null,installItem=toolsMenu.querySelector('[data-st-tool="install"]');
  function standalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}
  function refreshInstallItem(){installItem.hidden=standalone()||!(installPrompt||/iphone|ipad|ipod/i.test(navigator.userAgent));}
  function installApp(){
    if(installPrompt){installPrompt.prompt();installPrompt.userChoice.then(function(){installPrompt=null;refreshInstallItem();});return;}
    showToast(/iphone|ipad|ipod/i.test(navigator.userAgent)?'Di iPhone/iPad: ketuk tombol Bagikan, lalu “Tambahkan ke Layar Utama”.':'Buka menu browser (⋮), lalu pilih “Instal aplikasi” atau “Tambahkan ke layar utama”.',6000);
  }
  window.addEventListener('beforeinstallprompt',function(event){event.preventDefault();installPrompt=event;refreshInstallItem();});
  window.addEventListener('appinstalled',function(){installPrompt=null;refreshInstallItem();showToast('SOBAT TARU terpasang di perangkat Anda.');});
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
  var opacityPanes=['pane_RTRWSUMBAWABARAT20202040_3','pane_RDTRTALIWANG_2','pane_RDTRMALUK_1','pane_LP2BSUMBAWABARAT_5','pane_LSD_Kabupaten_Sumbawa_Barat_4','pane_LBS_Kabupaten_Sumbawa_Barat_6'];
  // Warna isi bawaan qgis2web sudah transparan (rgba ..., 0.5), jadi pada 100% layer tetap tembus.
  // Isi dibuat pekat dan seluruh transparansi diatur oleh penggeser lewat opasitas pane.
  function solidColor(color){
    var match=/^rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)$/.exec(String(color||'').replace(/\s/g,''));
    return match?'rgb('+match[1]+','+match[2]+','+match[3]+')':color;
  }
  ['layer_RTRWSUMBAWABARAT20202040_3','layer_RDTRTALIWANG_2','layer_RDTRMALUK_1','layer_LP2BSUMBAWABARAT_5','layer_LSD_Kabupaten_Sumbawa_Barat_4','layer_LBS_Kabupaten_Sumbawa_Barat_6'].forEach(function(name){
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

  function copyText(text,label,done){
    function fallback(){window.prompt(label,text);}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,fallback);else fallback();
  }
  function shareUrl(latlng){
    var lat=latlng.lat.toFixed(6),lng=latlng.lng.toFixed(6);
    return location.origin+location.pathname+'?titik='+lat+','+lng+'#'+Math.max(map.getZoom(),16)+'/'+lat+'/'+lng;
  }
  resultPanel.addEventListener('click',function(event){
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

  window.sobatRenderIdentification=function(data){
    lastIdentification=data;
    hideHint(true);
    var lat=data.latlng.lat,lng=data.latlng.lng;
    var utm=null;try{if(typeof window.projectToUtm50S==='function')utm=window.projectToUtm50S([lng,lat]);}catch(_utmError){}
    var rtrwFound=data.rtrw&&data.rtrw!=='Tidak ditemukan';
    var rtrwProtected=rtrwFound&&protectedPattern.test(String(data.rtrw));
    var rdtrFound=!!data.rdtrZona;
    var sigap=data.sigapCategory;
    var sigapForest=!!sigap&&sigap.key!=='apl';
    var pippibIn=data.pippib&&data.pippib!=='Tidak masuk';
    var lp2bIn=data.lp2b==='YA',lsdIn=data.lsd==='YA',lbsIn=data.lbs==='YA';
    var sempadanIn=data.sempadan&&data.sempadan.length>0;
    // Pembatas mengikuti Bale Ruang NTB: LSD dan PIPPIB adalah ketentuan khusus. LP2B 2026 masih hasil verifikasi
    // usulan (belum penetapan) dan LBS adalah data baku sawah, jadi keduanya ditampilkan sebagai informasi, bukan pembatas.
    var constraints=[
      sigapForest&&{name:'Kawasan hutan',danger:true},
      pippibIn&&{name:'PIPPIB',danger:true},
      rtrwProtected&&{name:'Kawasan lindung RTRW',danger:false},
      lsdIn&&{name:'LSD',danger:false},
      sempadanIn&&{name:'Sempadan',danger:false}
    ].filter(Boolean);
    var severe=constraints.some(function(entry){return entry.danger;});

    var summary=constraints.length?
      '<div class="st-summary '+(severe?'danger':'warn')+'"><i class="fas '+(severe?'fa-exclamation-circle':'fa-exclamation-triangle')+'" aria-hidden="true"></i><div>'+
        '<b>'+constraints.length+' hal perlu diperhatikan</b>'+
        '<div class="st-summary-chips">'+constraints.map(function(entry){return '<span class="st-chip '+(entry.danger?'danger':'in')+'">'+esc(entry.name)+'</span>';}).join('')+'</div>'+
        '<p>Pemanfaatan lahan di titik ini perlu pemeriksaan lebih lanjut ke instansi berwenang.</p></div></div>':
      '<div class="st-summary ok"><i class="fas fa-check-circle" aria-hidden="true"></i><div><b>Tidak ditemukan pembatas</b>'+
        '<p>Titik ini tidak masuk kawasan hutan, PIPPIB, LSD, sempadan, maupun kawasan lindung pada data yang tersedia.</p></div></div>';

    var alerts='';
    if(sigapForest)alerts+='<div class="st-alert danger"><i class="fas fa-tree" aria-hidden="true"></i><div><b>Lokasi berada di '+esc(sigap.label)+'</b>'+esc(sigap.action||'Konfirmasikan kepada instansi kehutanan yang berwenang.')+'</div></div>';
    if(pippibIn)alerts+='<div class="st-alert danger"><i class="fas fa-ban" aria-hidden="true"></i><div><b>Lokasi beririsan dengan PIPPIB</b>Pemanfaatan ruang di sini terikat ketentuan penghentian pemberian izin baru. Konfirmasikan kepada instansi berwenang.</div></div>';
    if(lsdIn)alerts+='<div class="st-alert"><i class="fas fa-seedling" aria-hidden="true"></i><div><b>Lokasi beririsan dengan LSD</b>Pemanfaatan ruang di sini terikat ketentuan khusus perlindungan lahan. Konfirmasikan kepada instansi berwenang.</div></div>';
    if(lp2bIn)alerts+='<div class="st-alert info"><i class="fas fa-info-circle" aria-hidden="true"></i><div><b>Lokasi berada dalam LP2B Hasil Verifikasi Usulan tahun 2026</b>Belum merupakan penetapan; menunggu Keputusan Bupati. Untuk rencana pemanfaatan, konfirmasikan ke Pemda setempat.</div></div>';
    if(sempadanIn)alerts+='<div class="st-alert"><i class="fas fa-tint" aria-hidden="true"></i><div><b>Lokasi berada di sempadan</b>'+esc(data.sempadan.join(', '))+' menurut RTRW Kabupaten Sumbawa Barat.</div></div>';

    var sigapDetails='';
    if(sigap){
      var props=data.sigapProperties||{};
      sigapDetails='<details class="st-details"><summary>Rincian SIGAP</summary><p>'+
        (data.sigapFeature?'<b>Nama objek:</b> '+esc(props.namobj||'-')+'<br><b>No. SK:</b> '+esc(props.noskpnjk||'-')+'<br><b>Keterangan:</b> '+esc(props.keterangan||props.remark||'-')+'<br>':'')+
        esc(sigap.meaning||'')+'</p></details>';
    }
    var rtrwChip=rtrwFound?(rtrwProtected?'<span class="st-chip in">Kawasan lindung</span>':'<span class="st-chip ok">Kawasan budi daya</span>'):'<span class="st-chip out">Tidak ada data</span>';

    var html=
      '<div class="st-print-head"><b>SOBAT TARU — Hasil Pemeriksaan Tata Ruang</b><span id="stPrintStamp"></span></div>'+
      summary+
      '<div class="st-card"><div class="st-card-title">Lokasi yang diperiksa</div><div class="st-coords">'+
        '<div><span>Lintang, Bujur</span> <code>'+lat.toFixed(6)+', '+lng.toFixed(6)+'</code></div>'+
        (utm?'<div><span>UTM 50S</span> <code>X '+Number(utm[0]).toFixed(2)+' &middot; Y '+Number(utm[1]).toFixed(2)+'</code></div>':'')+
        '<div><span>Kecamatan</span> <b>'+esc(data.kecamatan)+'</b></div>'+
      '</div></div>'+
      '<div class="st-actions">'+
        '<a class="st-action" href="https://www.google.com/maps/dir/?api=1&destination='+lat.toFixed(7)+','+lng.toFixed(7)+'" target="_blank" rel="noopener noreferrer"><i class="fas fa-location-arrow" aria-hidden="true"></i>Arah</a>'+
        '<a class="st-action" href="'+esc(data.bhumiUrl)+'" target="_blank" rel="noopener noreferrer" title="Buka BHUMI ATR/BPN untuk melihat bidang tanah di titik ini"><i class="fas fa-external-link-alt" aria-hidden="true"></i>Cek Bidang</a>'+
        '<button class="st-action primary" type="button" data-st-share><i class="fas fa-share-alt" aria-hidden="true"></i>Bagikan</button>'+
      '</div>'+
      '<div class="st-actions-sub">'+
        '<button type="button" data-st-copy="'+lat.toFixed(6)+', '+lng.toFixed(6)+'"><i class="fas fa-copy" aria-hidden="true"></i>Salin koordinat</button>'+
        '<button type="button" data-st-print><i class="fas fa-print" aria-hidden="true"></i>Cetak / PDF</button>'+
      '</div>'+
      alerts+
      '<div class="st-card"><div class="st-results-head"><div class="st-card-title">Rincian per data</div><small>'+(constraints.length?constraints.length+' pembatas':'Tanpa pembatas')+'</small></div>'+
        item({label:'Pola Ruang RTRW',key:'rtrw',flag:rtrwProtected,title:rtrwFound?esc(data.rtrw):'Di luar data RTRW',sub:'Pola Ruang RTRW Kabupaten Sumbawa Barat 2020–2040',chip:rtrwChip})+
        item({label:'RDTR',key:'rdtr',title:rdtrFound?'Zona '+esc(data.rdtrZona):'Tidak berada pada wilayah RDTR',sub:rdtrFound?esc(data.rdtrWilayah):'RDTR Perkotaan Taliwang dan RDTR Sekitar Kawasan Industri Maluk',chip:rdtrFound?'<span class="st-chip ok">Masuk wilayah RDTR</span>':'<span class="st-chip out">Di luar RDTR</span>'})+
        item({label:'Kawasan Hutan (SIGAP)',key:'sigap',flag:sigapForest,title:sigap?(sigapForest?'<span class="st-swatch" style="background:'+esc(sigap.hex)+'"></span>':'')+esc(sigap.label):'Tidak ada klasifikasi pada titik ini',sub:'Kementerian Kehutanan RI',details:sigapDetails,chip:sigap?(sigapForest?'<span class="st-chip danger">Kawasan hutan</span>':'<span class="st-chip ok">Bukan kawasan hutan</span>'):'<span class="st-chip out">Tidak ada data</span>'})+
        item({label:'PIPPIB Provinsi NTB 2025',key:'pippib',flag:pippibIn,title:pippibIn?esc(data.pippib):'Tidak masuk PIPPIB',sub:'Peta Indikatif Penghentian Pemberian Izin Baru',chip:pippibIn?'<span class="st-chip danger">Masuk</span>':chip(false)})+
        item({label:'LSD Provinsi NTB',key:'lsd',flag:lsdIn,title:'Lahan Sawah yang Dilindungi',chip:chip(lsdIn)})+
        item({label:'LP2B Hasil Verifikasi Usulan tahun 2026',key:'lp2b',title:lp2bIn?'Masuk usulan LP2B':'Tidak masuk usulan LP2B',sub:'Belum merupakan penetapan. Sumber: Kementerian ATR/BPN &amp; Pemprov NTB, 6 Okt 2026.',chip:lp2bIn?'<span class="st-chip info">Masuk usulan</span>':chip(false)})+
        item({label:'LBS Provinsi NTB',key:'lbs',title:'Lahan Baku Sawah',chip:lbsIn?'<span class="st-chip info">Masuk</span>':chip(false)})+
        item({label:'Sempadan (RTRW)',key:'sempadan',flag:sempadanIn,title:sempadanIn?esc(data.sempadan.join(', ')):'Tidak berada di sempadan sungai atau pantai',chip:chip(sempadanIn)})+
        item({label:'Administrasi',key:'administrasi',title:'Kecamatan '+esc(data.kecamatan),sub:'Kabupaten Sumbawa Barat'})+
      '</div>'+
      '<p class="st-foot-note">Hasil SOBAT TARU bersifat indikatif, memakai seluruh dataset yang tersedia meskipun layer disembunyikan, dan bukan produk hukum. Konfirmasikan kepada instansi berwenang.</p>';

    var body=$('stResultBody');
    body.innerHTML=html;body.scrollTop=0;
    hideUploadResult();
    showResult();
    setTimeout(function(){keepPointVisible(data.latlng);},isPhone()?260:60);
  };

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
