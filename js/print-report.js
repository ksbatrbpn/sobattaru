/*
 * SOBAT TARU — Cetak PDF hasil analisis, mengikuti Bale Ruang NTB.
 * Alur: Pengaturan Cetak Peta (preview, peta dasar, skala, label wilayah, layer)
 * lalu laporan A4 di tab baru: satu halaman peta per layer (grid koordinat, kompas,
 * skala, legenda beserta luas irisan) dan satu halaman ringkasan hasil analisis.
 * Laporan dibuka dengan dialog cetak browser sehingga dapat disimpan sebagai PDF.
 */
(function(){
  'use strict';
  if(!window.L||!window.map)return;
  function $(id){return document.getElementById(id);}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function toast(text,duration){var c=window.sobatPrintState&&window.sobatPrintState();if(c&&c.showToast)c.showToast(text,duration);else if(window.brToast)window.brToast(text,duration);}

  var BASES=[
    {name:'Google Hybrid',url:'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',maxNativeZoom:20},
    {name:'Google Satellite',url:'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',maxNativeZoom:20},
    {name:'Google Road',url:'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',maxNativeZoom:20},
    {name:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',maxNativeZoom:19}
  ];
  var DEFAULT_BASE=1;
  var LINE_COLORS={'rtrw-provinsi':'#7b3fe4','rtrw':'#d9480f','rdtr-taliwang':'#b7791f','rdtr-maluk':'#9a5b2a',lsd:'#0fa3a3',lp2b:'#1f9d55',lbs:'#1f7fd1',pippib:'#be185d',sigap:'#0f766e','sempadan-sungai':'#4338ca','sempadan-pantai':'#0369a1',jalan:'#f08a24',admin:'#1b1b1b'};

  function printDmsId(value,isLat,decimals){var dir=isLat?(value<0?'LS':'LU'):(value<0?'BB':'BT'),abs=Math.abs(value),deg=Math.floor(abs),minF=(abs-deg)*60,min=Math.floor(minF),dec=decimals||0,pow=Math.pow(10,dec),sec=Math.round((minF-min)*60*pow)/pow;if(sec>=60){sec=0;min++;}if(min>=60){min=0;deg++;}var text=sec.toFixed(dec).replace('.',',');if(sec<10)text='0'+text;return deg+'°'+String(min).padStart(2,'0')+'′'+text+'″ '+dir;}
  function fileToken(value){return String(value||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48);}
  function boxesOverlap(a,b){return !(a[0]>b[2]||a[2]<b[0]||a[1]>b[3]||a[3]<b[1]);}
  function geometryBox(geometry){
    var box=[Infinity,Infinity,-Infinity,-Infinity];
    (function walk(v){if(!v)return;if(v.type==='FeatureCollection'){(v.features||[]).forEach(walk);return;}if(v.type==='Feature'){walk(v.geometry);return;}if(v.type==='GeometryCollection'){(v.geometries||[]).forEach(walk);return;}if(v.coordinates)(function coords(c){if(typeof c[0]==='number'){box[0]=Math.min(box[0],c[0]);box[1]=Math.min(box[1],c[1]);box[2]=Math.max(box[2],c[0]);box[3]=Math.max(box[3],c[1]);}else c.forEach(coords);})(v.coordinates);})(geometry);
    return isFinite(box[0])?box:null;
  }

  /* ---------- Data dari hasil analisis terakhir ---------- */
  function context(){return typeof window.sobatPrintState==='function'?window.sobatPrintState():null;}
  function subjectGeometry(c){
    if(c.model.mode==='point')return {type:'Point',coordinates:[c.model.latlng.lng,c.model.latlng.lat]};
    return c.model.geojson;
  }
  function subjectProps(c){
    if(c.model.mode!=='polygon')return {};
    var g=c.model.geojson,list=g.type==='FeatureCollection'?g.features:[g];
    return (list[0]&&list[0].properties)||{};
  }
  function subjectNib(c){
    var props=subjectProps(c),nib='';
    Object.keys(props).some(function(k){if(/^(NIB|NIBIDANG|NOMORNIB)$/.test(String(k).toUpperCase().replace(/[^A-Z0-9]/g,''))&&String(props[k]||'').trim()){nib=String(props[k]).trim();return true;}return false;});
    return nib;
  }
  function subjectAdmin(c){
    var v=(c.villages||[])[0];
    return {village:v?v.name:'',district:(v&&v.kecamatan)||c.model.kecamatan||'',regency:'Sumbawa Barat',kelurahan:!!(v&&v.kelurahan)};
  }
  function resultFor(c,id){return c.model.results.filter(function(r){return r.def.id===id;})[0];}
  // Nama layer seperti di panel: judul ditambah periode (mis. 2020–2040) bila ada.
  function layerTitle(def){return def.title+(def.sub&&/\d{4}/.test(def.sub)?' '+def.sub:'');}
  function areaPct(c,area){var pct=c.fmtPct(area,c.model.total);return c.fmtArea(area)+(pct?' • '+pct:'');}

  // Layer yang dapat dicetak: yang mencakup/beririsan dengan titik atau bidang, ditambah batas desa/kelurahan.
  function printableLayers(c){
    var polygon=c.model.mode==='polygon',list=[];
    c.model.results.forEach(function(r){
      if(!r.inside||!(r.def.layer||r.def.sigap))return;
      var note=r.def.line?r.values.length+' ruas jalan '+(polygon?'memotong bidang':'di sekitar lokasi'):polygon?'Beririsan '+c.fmtAreaLong(r.area)+(c.fmtPct(r.area,c.model.total)?' • '+c.fmtPct(r.area,c.model.total):''):'Lokasi berada di dalam layer ini';
      list.push({id:r.def.id,def:r.def,name:layerTitle(r.def),legal:r.def.legal||'',note:note,checked:true});
    });
    if(typeof window.ntbAdminFeaturesInBounds==='function')list.push({id:'admin',name:'Batas Administrasi Desa/Kelurahan',legal:'',note:'Garis batas desa/kelurahan di sekitar '+(polygon?'bidang':'lokasi'),checked:false,admin:true});
    return list;
  }

  // Fitur layer di dalam bingkai peta beserta warna kelasnya (sama dengan warna layer di peta).
  function layerResult(c,item,bbox){
    var key=item.id+'|'+bbox.map(function(v){return v.toFixed(5);}).join(',');
    state.cache=state.cache||Object.create(null);
    if(state.cache[key])return Promise.resolve(state.cache[key]);
    var promise;
    if(item.admin){
      promise=window.ntbAdminFeaturesInBounds(bbox).then(function(features){
        return {id:'admin',name:item.name,admin:true,legendItems:[],data:{type:'FeatureCollection',features:(features||[]).map(function(f){return {type:'Feature',properties:{name:(f.properties||{}).WADMKD},geometry:f.geometry};})}};
      });
    }else{
      var def=item.def,features=[],seen=Object.create(null),legend=[];
      var stats=Object.create(null),r=resultFor(c,def.id);
      if(r&&c.model.mode==='polygon')(r.categories||[]).forEach(function(cat){stats[cat.name]=areaPct(c,cat.area);});
      function push(feature,label,color){
        var k=label+'|'+color;if(!seen[k]){seen[k]=1;legend.push({label:label,color:color});}
        features.push({type:'Feature',properties:{__printColor:color,__label:label},geometry:feature.geometry});
      }
      if(def.sigap){
        ((window.sigapVector&&window.sigapVector.features)||[]).forEach(function(f){
          var b=geometryBox(f);if(!b||!boxesOverlap(b,bbox))return;
          var cat=typeof window.sigapCategoryFromFeature==='function'?window.sigapCategoryFromFeature(f):null;
          push(f,cat?cat.label:'Kawasan hutan',cat?cat.hex:'#2f855a');
        });
      }else if(window[def.layer]&&window[def.layer].eachLayer){
        window[def.layer].eachLayer(function(sub){
          var f=sub.feature;if(!f||!f.geometry)return;
          var b=null;try{var lb=sub.getBounds();b=[lb.getWest(),lb.getSouth(),lb.getEast(),lb.getNorth()];}catch(_e){b=geometryBox(f);}
          if(!b||!boxesOverlap(b,bbox))return;
          var o=sub.options||{},color=def.line?(o.color||'#f08a24'):(o.fillColor||o.color||'#888');
          push(f,c.featureValue(def,f)||def.title,color);
        });
      }
      // Kelas yang beririsan dengan bidang ditampilkan lebih dulu di legenda.
      legend.sort(function(a,b){return (stats[b.label]?1:0)-(stats[a.label]?1:0);});
      var r2=r||{};
      promise=Promise.resolve({id:def.id,name:layerTitle(def),short:layerTitle(def),legal:def.legal||def.sub||'',line:!!def.line,usulan:def.id==='lp2b',legendItems:legend,classStats:stats,
        statLine:c.model.mode==='polygon'&&!def.line&&r2.area?'Irisan '+areaPct(c,r2.area)+' dari luas bidang '+c.fmtArea(c.model.total):'',data:{type:'FeatureCollection',features:features}});
    }
    return promise.then(function(result){state.cache[key]=result;return result;});
  }

  /* ---------- Dialog Pengaturan Cetak Peta ---------- */
  var shell=document.createElement('div');
  shell.className='print-setup-shell';shell.id='printSetupModal';shell.setAttribute('aria-hidden','true');
  shell.innerHTML=
    '<section class="print-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="printSetupTitle">'+
      '<header class="print-setup-head"><div><h2 id="printSetupTitle">Pengaturan Cetak Peta</h2><p>Pilih peta dasar dan layer yang ingin tampil. Titik/bidang analisis selalu berada di lapisan paling atas.</p></div><button class="print-setup-close" type="button" data-print-close aria-label="Tutup">&times;</button></header>'+
      '<div class="print-setup-body">'+
        '<div class="print-preview-wrap"><div class="print-preview-frame"><div id="printPreviewMap" class="print-preview-map"></div><div class="print-preview-loading" id="printPreviewLoading">Menyiapkan preview…</div><div id="printPreviewScaleBadge" class="print-preview-scale">Skala preview: menghitung…</div><div id="printPreviewLegend" class="print-preview-legend"></div><div class="print-preview-note">Preview peta cetak • grid koordinat, kompas, dan skala dirapikan pada PDF</div></div></div>'+
        '<aside class="print-setup-panel">'+
          '<section class="print-setup-section"><h3>Peta dasar</h3><select id="printBaseSelect" class="print-base-select"></select></section>'+
          '<section class="print-setup-section"><h3>Skala cetak</h3><select id="printScaleSelect" class="print-base-select"><option value="auto">Otomatis — seluruh bidang terlihat</option><option value="500">1 : 500 — detail sangat dekat</option><option value="1000">1 : 1.000 — detail bidang</option><option value="2500">1 : 2.500 — bidang dan lingkungan</option><option value="5000">1 : 5.000 — konteks wilayah sekitar</option><option value="10000">1 : 10.000 — konteks kawasan</option></select><small id="printScaleHint" class="print-setup-hint">Skala aktif ditampilkan langsung pada preview.</small></section>'+
          '<section class="print-setup-section"><h3>Label wilayah</h3><select id="printVillageTypeSelect" class="print-base-select"><option value="auto">Otomatis</option><option value="Desa">Desa</option><option value="Kelurahan">Kelurahan</option></select><small id="printVillageTypeHint" class="print-setup-hint">Jenis wilayah dideteksi otomatis.</small></section>'+
          '<section class="print-setup-section"><h3>Layer peta</h3><div class="print-layer-fixed"><b id="printSubjectName">▣ Bidang analisis</b><br>Selalu aktif dan selalu ditampilkan paling atas.</div><div id="printLayerList" class="print-layer-list"></div><small id="printPageHint" class="print-page-hint"></small></section>'+
          '<section class="print-setup-section"><div id="printSetupStatus" class="print-setup-status">Google Satellite digunakan sebagai peta dasar bawaan.</div><div id="printLayerProgress" class="print-progress" hidden><i id="printLayerProgressBar"></i></div><small id="printLayerProgressText" class="print-setup-hint" hidden></small></section>'+
        '</aside>'+
      '</div>'+
      '<footer class="print-setup-foot"><button class="print-setup-btn" type="button" data-print-close>Batal</button><button class="print-setup-btn primary" id="printSetupConfirm" type="button"><i class="fas fa-file-pdf" aria-hidden="true"></i>Lanjut Cetak PDF</button></footer>'+
    '</section>';
  document.body.appendChild(shell);

  var state={map:null,base:null,group:null,subject:null,views:{},cache:null,token:0,ctx:null,layers:[],bboxKey:''};
  function baseSelect(){return $('printBaseSelect');}
  baseSelect().innerHTML=BASES.map(function(b,i){return '<option value="'+i+'"'+(i===DEFAULT_BASE?' selected':'')+'>'+esc(b.name)+'</option>';}).join('');

  function ensurePreviewMap(){
    if(state.map)return state.map;
    var preview=L.map('printPreviewMap',{zoomControl:true,attributionControl:false,minZoom:8,maxZoom:20,zoomSnap:.1,zoomDelta:.5});
    state.map=preview;state.group=L.layerGroup().addTo(preview);
    preview.on('moveend zoomend',function(){updateScaleInfo();schedulePreview();});
    return preview;
  }
  function switchBase(index){
    var preview=ensurePreviewMap(),base=BASES[index]||BASES[DEFAULT_BASE];
    if(state.base)preview.removeLayer(state.base);
    state.base=L.tileLayer(base.url,{maxZoom:20,maxNativeZoom:base.maxNativeZoom||20}).addTo(preview);
    state.base.bringToBack();
  }
  function selectedScale(){var v=$('printScaleSelect').value;if(v==='auto')return 0;v=Number(v);return isFinite(v)&&v>=100?v:0;}
  function previewDenominator(){var p=state.map;if(!p)return 0;var c=p.getCenter(),mpp=156543.03392*Math.cos(c.lat*Math.PI/180)/Math.pow(2,p.getZoom());return Math.max(100,Math.round((mpp/0.0002645833333)/100)*100);}
  function updateScaleInfo(){
    var selected=selectedScale(),actual=previewDenominator(),text='1 : '+Number(actual||selected||0).toLocaleString('id-ID');
    $('printPreviewScaleBadge').textContent='Skala preview: '+text;
    $('printScaleHint').textContent=selected?'Pilihan cetak 1 : '+selected.toLocaleString('id-ID')+'. Preview saat ini '+text+'.':'Mode otomatis menyesuaikan seluruh '+(state.ctx&&state.ctx.model.mode==='point'?'lokasi':'bidang')+'. Skala preview saat ini '+text+'.';
  }
  function applyScale(){
    var preview=ensurePreviewMap(),b=state.subject&&state.subject.getBounds(),scale=selectedScale();
    if(!b||!b.isValid())return;
    if(scale){var lat=b.getCenter().lat,mpp=scale*0.0002645833333,zoom=Math.log(156543.03392*Math.cos(lat*Math.PI/180)/mpp)/Math.LN2;preview.setView(b.getCenter(),Math.max(8,Math.min(20,zoom)),{animate:false});}
    else if(state.ctx.model.mode==='point')preview.setView(b.getCenter(),19,{animate:false});
    else preview.fitBounds(b,{padding:[60,60],maxZoom:19,animate:false});
    setTimeout(updateScaleInfo,80);
  }
  function syncSubject(){
    var preview=ensurePreviewMap(),geometry=subjectGeometry(state.ctx);
    if(state.subject)preview.removeLayer(state.subject);
    state.subject=L.geoJSON(geometry.type==='FeatureCollection'||geometry.type==='Feature'?geometry:{type:'Feature',properties:{},geometry:geometry},{interactive:false,style:{color:'#ff008c',weight:3,opacity:1,fillColor:'#ff008c',fillOpacity:.03},pointToLayer:function(f,ll){return L.circleMarker(ll,{radius:7,color:'#fff',weight:2,fillColor:'#ff008c',fillOpacity:1});}}).addTo(preview);
    applyScale();
  }
  function checkedIds(){return [].slice.call(document.querySelectorAll('#printLayerList input:checked')).map(function(i){return i.value;});}
  function itemById(id){return state.layers.filter(function(l){return l.id===id;})[0];}
  function updatePageHint(){
    var n=checkedIds().filter(function(id){return id!=='admin';}).length;
    $('printPageHint').textContent='PDF: '+(n?n+' halaman peta (1 layer per halaman)':'1 halaman peta')+' + 1 halaman ringkasan hasil analisis.'+(n>6?' Pertimbangkan mengurangi layer agar dokumen tidak terlalu panjang.':'');
  }
  function viewBbox(){var p=state.map,b=p&&p.getBounds();return b&&b.isValid()?[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]:geometryBox(subjectGeometry(state.ctx));}
  function overlayStyle(result){
    return function(f){
      var color=(f.properties||{}).__printColor||LINE_COLORS[result.id]||'#4c94c7';
      if(result.admin)return {color:'#1b1b1b',weight:1.3,opacity:.95,fill:false,dashArray:'5 3'};
      if(result.line)return {color:color,weight:3.2,opacity:1,fill:false};
      return {color:'#2b2b2b',weight:.6,opacity:.85,fillColor:color,fillOpacity:.86};
    };
  }
  function renderPreviewLegend(){
    var point=state.ctx.model.mode==='point',html='<b>Legenda</b><div class="print-preview-legend-row"><i class="print-preview-legend-swatch subject"></i><span>'+(point?'Titik analisis':'Bidang analisis')+'</span></div>';
    checkedIds().forEach(function(id){var item=itemById(id);if(!item)return;var c=LINE_COLORS[id]||'#4c94c7',pending=!state.views[id];html+='<div class="print-preview-legend-row'+(pending?' pending':'')+'"><i class="print-preview-legend-swatch" style="background:'+(item.admin?'transparent':c+'33')+';border:2px '+(item.admin||id==='lp2b'?'dashed':'solid')+' '+c+'"></i><span>'+esc(item.admin?'Batas desa/kelurahan':layerTitle(item.def))+(pending?' …':'')+'</span></div>';});
    $('printPreviewLegend').innerHTML=html;
  }
  function setProgress(active,done,total,label){
    var wrap=$('printLayerProgress'),text=$('printLayerProgressText');
    wrap.hidden=text.hidden=!active;
    $('printLayerProgressBar').style.width=(total?Math.round(done/total*100):100)+'%';
    text.textContent=active?label:'';
  }
  var previewTimer=null;
  function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(refreshPreview,250);}
  function refreshPreview(){
    if(!state.ctx||!state.group)return;
    var token=++state.token,bbox=viewBbox(),key=bbox.map(function(v){return v.toFixed(5);}).join(','),ids=checkedIds();
    if(state.bboxKey!==key){state.bboxKey=key;state.group.clearLayers();state.views={};}
    Object.keys(state.views).forEach(function(id){if(ids.indexOf(id)<0){state.group.removeLayer(state.views[id]);delete state.views[id];}});
    var todo=ids.filter(function(id){return !state.views[id];});
    renderPreviewLegend();
    if(!todo.length){$('printPreviewLoading').classList.remove('show');setProgress(false);return;}
    $('printPreviewLoading').classList.add('show');
    var done=0;setProgress(true,0,todo.length,'Menyiapkan '+todo.length+' layer…');
    (function next(k){
      if(token!==state.token)return;
      if(k>=todo.length){$('printPreviewLoading').classList.remove('show');setTimeout(function(){if(token===state.token)setProgress(false);},400);return;}
      var item=itemById(todo[k]);
      layerResult(state.ctx,item,bbox).then(function(result){
        done++;if(token!==state.token||state.bboxKey!==key)return;
        if(checkedIds().indexOf(item.id)>=0&&!state.views[item.id]){
          var view=L.geoJSON(result.data,{interactive:false,smoothFactor:0,style:overlayStyle(result)});
          state.views[item.id]=view;view.addTo(state.group);
          if(state.subject)state.subject.bringToFront();
        }
        renderPreviewLegend();setProgress(true,done,todo.length,'Layer '+done+' dari '+todo.length+' siap — '+result.name);
      }).catch(function(){done++;}).then(function(){setTimeout(function(){next(k+1);},0);});
    })(0);
  }
  function villageWord(){
    var select=$('printVillageTypeSelect');
    if(select.value!=='auto')return select.value;
    return subjectAdmin(state.ctx).kelurahan?'Kelurahan':'Desa';
  }
  function updateVillageHint(){
    var select=$('printVillageTypeSelect'),detected=subjectAdmin(state.ctx).kelurahan?'Kelurahan':'Desa';
    $('printVillageTypeHint').textContent=select.value==='auto'?'Terdeteksi otomatis sebagai '+detected+'. Anda dapat menggantinya untuk cetakan ini.':'Label dipaksa menjadi '+select.value+' untuk cetakan ini.';
  }
  function open(){
    var c=context();
    if(!c||!c.model){toast('Belum ada hasil analisis yang dapat dicetak.');return;}
    state.ctx=c;state.cache=null;state.views={};state.bboxKey='';
    if(state.group)state.group.clearLayers();
    state.layers=printableLayers(c);
    $('printSubjectName').textContent=c.model.mode==='point'?'▣ Titik analisis':'▣ Bidang analisis';
    $('printLayerList').innerHTML=state.layers.length>1||(state.layers.length&&!state.layers[0].admin)?state.layers.map(function(item){
      return '<label class="print-layer-row"><input type="checkbox" value="'+esc(item.id)+'"'+(item.checked?' checked':'')+'><span><strong>'+esc(item.name)+(item.legal?' ('+esc(item.legal)+')':'')+'</strong><small>'+esc(item.note)+'</small></span></label>';
    }).join(''):'<div class="print-layer-empty">Tidak ada layer yang '+(c.model.mode==='point'?'mencakup lokasi':'beririsan dengan bidang')+' ini. Cetakan hanya memuat peta dasar dan objek analisis.</div>'+state.layers.map(function(item){return '<label class="print-layer-row"><input type="checkbox" value="'+esc(item.id)+'"><span><strong>'+esc(item.name)+'</strong><small>'+esc(item.note)+'</small></span></label>';}).join('');
    $('printScaleSelect').value='auto';$('printVillageTypeSelect').value='auto';baseSelect().value=String(DEFAULT_BASE);
    $('printSetupStatus').textContent='Google Satellite digunakan sebagai peta dasar bawaan.';
    updatePageHint();updateVillageHint();
    // Nama desa dimuat bersamaan dengan hasil analisis; perbarui label bila belum siap.
    var ready=c.villages?Promise.resolve():(window.sobatPrintState().villagesReady||Promise.resolve());
    Promise.resolve(ready).then(function(){var fresh=context();if(fresh&&fresh.model===c.model){state.ctx=fresh;updateVillageHint();}});
    shell.classList.add('open');shell.setAttribute('aria-hidden','false');document.body.classList.add('st-print-setup-open');
    setTimeout(function(){var p=ensurePreviewMap();p.invalidateSize();switchBase(DEFAULT_BASE);syncSubject();refreshPreview();updateScaleInfo();},60);
  }
  function close(){shell.classList.remove('open');shell.setAttribute('aria-hidden','true');document.body.classList.remove('st-print-setup-open');state.token++;}
  shell.addEventListener('click',function(event){if(event.target===shell||event.target.closest('[data-print-close]'))close();});
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&shell.classList.contains('open'))close();});
  $('printScaleSelect').addEventListener('change',applyScale);
  baseSelect().addEventListener('change',function(){switchBase(Number(this.value));});
  $('printVillageTypeSelect').addEventListener('change',updateVillageHint);
  $('printLayerList').addEventListener('change',function(){updatePageHint();schedulePreview();});
  $('printSetupConfirm').addEventListener('click',function(){
    var button=this,c=state.ctx;if(!c)return;
    // Tab laporan dibuka langsung saat tombol ditekan agar tidak diblokir sebagai pop-up.
    var reportWindow=window.open('','_blank');
    if(!reportWindow){toast('Izinkan pop-up untuk membuka laporan PDF.',5000);return;}
    try{reportWindow.document.write('<!doctype html><title>Menyiapkan laporan…</title><p style="font:15px -apple-system,Segoe UI,Arial,sans-serif;padding:32px;color:#0b3b35">Menyiapkan laporan PDF SOBAT TARU…</p>');reportWindow.document.close();}catch(_e){}
    button.disabled=true;var label=button.innerHTML;button.textContent='Menyiapkan PDF…';
    $('printSetupStatus').textContent='Mengambil geometri layer yang relevan pada area peta…';
    var bbox=viewBbox(),settings={base:BASES[Number(baseSelect().value)]||BASES[DEFAULT_BASE],scale:selectedScale(),villageWord:villageWord()};
    Promise.all(checkedIds().map(function(id){return layerResult(c,itemById(id),bbox).catch(function(){return null;});})).then(function(results){
      settings.overlays=results.filter(function(r){return r&&r.data.features.length;});
      writeReport(reportWindow,c,settings);
      close();
    }).catch(function(error){
      try{reportWindow.close();}catch(_e){}
      $('printSetupStatus').textContent=error&&error.message?error.message:'Layer cetak belum dapat disiapkan.';
      toast('Layer cetak belum dapat disiapkan.');
    }).then(function(){button.disabled=false;button.innerHTML=label;});
  });
  window.sobatOpenPrintSetup=open;

  /* ---------- Laporan A4 ---------- */
  var PRINT_SHEET_CSS="@page{size:A4 portrait;margin:0 0 13mm 0;@bottom-left{content:\"SOBAT TARU • Sumbawa Barat dalam Tata Ruang\";padding-left:10mm;color:#3d5a53;font:600 7.5pt Arial,sans-serif;vertical-align:middle}@bottom-right{content:\"Halaman \" counter(page) \" dari \" counter(pages);padding-right:10mm;color:#3d5a53;font:600 7.5pt Arial,sans-serif;vertical-align:middle}}"+
    "*{box-sizing:border-box}html,body{margin:0;padding:0;color:#1d2b29;font-family:-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;font-size:10px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{width:210mm}"+
    ".sheet{height:284mm;display:flex;flex-direction:column;padding:0 10mm;overflow:hidden;break-after:page;page-break-after:always}.summary{padding:0 10mm}"+
    ".head{flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;margin:0 -10mm;padding:5mm 10mm;background:linear-gradient(110deg,#06352f,#0b4f44 58%,#0f7a63);color:#fff}.brand-wrap{display:flex;align-items:center;gap:10px}.report-logo{display:block;width:44px;height:44px;padding:4px;border-radius:10px;background:#fff;object-fit:contain}.brand{font-size:18px;font-weight:800;letter-spacing:.02em}.brand small{display:block;margin-top:2px;color:#d7efe7;font-size:9px;font-weight:500;letter-spacing:0}.meta{text-align:right;color:#e3f4ee;font-size:8.5px;line-height:1.5}"+
    ".ident{flex:0 0 auto;display:grid;grid-template-columns:1.35fr 1fr 1fr 1fr;margin-top:4mm;border:1px solid #cdd9d5;border-radius:6px;overflow:hidden}.ident>div{padding:6px 9px;border-right:1px solid #e3eae7}.ident>div:last-child{border-right:0}.ident small{display:block;color:#5b6e69;font-size:7.5px;margin-bottom:2px}.ident b{display:block;font-size:10px;line-height:1.35}.ident em{display:block;font-style:normal;color:#5b6e69;font-size:7.5px;margin-top:2px}"+
    ".sec{flex:0 0 auto;margin:4mm 0 2mm;color:#0b5e4f;font-size:12.5px;text-align:left}.sec-row{flex:0 0 auto;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:4mm;row-gap:1mm;align-items:center;margin:4mm 0 2mm}.sec-row .sec{grid-column:1/-1;grid-row:1;margin:0;line-height:1.3}.sec-sub{grid-column:1;grid-row:2;display:block;min-width:0;color:#5b6e69;font-size:8.5px;line-height:1.35}.sec-stat{grid-column:2;grid-row:2;justify-self:end;padding:2px 9px;border-radius:10px;background:#e6f2ee;color:#0b4a40;font-size:8px;font-weight:700;white-space:nowrap}"+
    ".map-frame{position:relative;flex:1 1 auto;min-height:75mm;border:1.1px solid #1d2b29;padding:26px 30px;background:#fff;overflow:hidden}.print-map{position:relative;width:100%;height:100%;background:#dde7e3;overflow:hidden;border:1px solid rgba(29,43,41,.45)}"+
    ".legend{flex:0 0 auto;margin-top:3mm;padding:6px 9px 7px;border:1px solid #cdd9d5;border-radius:6px;break-inside:avoid}.legend h2{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 5px;color:#0b5e4f;font-size:10.5px}.legend h2 span{color:#5b6e69;font-size:7px;font-weight:600;margin-left:12px;white-space:nowrap}.lg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px 12px}.li{display:flex;gap:6px;align-items:flex-start;font-size:8px;line-height:1.3}.li b{display:block;font-weight:700;color:#1d2b29}.li small{display:block;color:#0b4a40;font-size:7.2px;font-weight:700}"+
    ".sw{flex:0 0 20px;height:12px;margin-top:1px;border-radius:2px;display:grid;place-items:center}.sw-subject{border:0;height:16px;margin-top:-2px}.sw-poly{display:block;width:20px;height:12px;border:2px solid #ff008c;border-radius:2px}.sw-line{height:0;margin-top:6px;border-top:3px solid}.lg-note{margin:5px 0 0;color:#5b6e69;font-size:7px;line-height:1.4}"+
    ".rt{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px;margin-top:1mm}.rt thead{display:table-header-group}.rt th{background:#0b4a40;color:#fff;text-align:left;font-weight:700;padding:6px 8px;font-size:8.5px}.rt td{padding:6px 8px;border-bottom:1px solid #e0e8e5;vertical-align:top;line-height:1.38}.rt tr{break-inside:avoid;page-break-inside:avoid}.rt td.l b{display:block;font-size:9px}.rt td.l small{display:block;color:#5b6e69;font-size:7.5px;margin-top:1px}.rt td.s{white-space:nowrap}.rt .grp td{background:#eef5f2;color:#0b4a40;font-weight:700;font-size:8px;padding:4px 8px}.rt .empty{color:#5b6e69;text-align:center;padding:12px}"+
    ".pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:7.5px;font-weight:700;background:#e3f4e6;color:#1f6b2e;border:1px solid #b9e0c0;white-space:nowrap}.pill.amber{background:#fff4dd;color:#8a5a00;border-color:#f3d79a}.pill.red{background:#ffeceb;color:#a1140a;border-color:#f4b8b2}"+
    ".kv{display:grid;grid-template-columns:minmax(6.5em,1fr) minmax(0,auto);gap:2px 10px;align-items:baseline}.kv span{color:#5b6e69;overflow-wrap:anywhere}.kv b{text-align:right;font-weight:600;word-break:break-word}.kv b i{font-style:normal;white-space:nowrap;display:inline-block}.kv .tot{border-top:1px solid #e0e8e5;padding-top:2px;margin-top:1px;font-weight:700;color:#0b4a40}.nw{white-space:nowrap}"+
    ".box-out,.box-warn,.box-lp2b,.box-note{margin-top:3.5mm;padding:7px 10px;font-size:8.5px;line-height:1.5;break-inside:avoid;border-radius:5px}.box-out{border:1px solid #cdd9d5}.box-out b{color:#0b4a40}.box-warn{border-left:4px solid #d97706;background:#fff7ea;color:#5b3d00}.box-lp2b{border-left:4px solid #4d8a32;background:#eef6ea;color:#24461a}.box-note{border-left:4px solid #e0a800;background:#fffaf0;color:#5c4300}"+
    ".carto-card{position:absolute;z-index:940;right:42px;top:38px;width:120px;padding:5px 6px 6px;border:1px solid rgba(25,25,25,.4);border-radius:4px;background:rgba(255,255,255,.94);color:#111;text-align:center}.carto-compass span{display:block;font-size:9px;font-weight:800;line-height:10px}.carto-compass img{display:block;width:38px;height:38px;margin:0 auto 1px;object-fit:contain}.scale-ratio{margin:0 0 3px;font-size:7.5px;font-weight:800}.scale-bar{position:relative;height:7px;margin:0 auto 11px;border:1px solid #111;display:flex}.scale-seg{height:100%;border-right:1px solid #111}.scale-seg:nth-child(odd){background:#111}.scale-seg:nth-child(even){background:#fff}.scale-seg:last-child{border-right:0}.scale-labels{position:relative;height:9px;margin-top:-9px;font-size:6px}.scale-labels span{position:absolute;transform:translateX(-50%);white-space:nowrap}.scale-labels span:first-child{transform:none}.scale-labels span:last-child{transform:translateX(-100%)}"+
    ".edge-coordinate{position:absolute;z-index:925;color:#111;font:600 6.4px Arial,sans-serif;white-space:nowrap;pointer-events:none}.edge-coordinate.top,.edge-coordinate.bottom{transform:translate(-50%,-50%)}.edge-coordinate.left{transform:translate(-50%,-50%) rotate(-90deg)}.edge-coordinate.right{transform:translate(-50%,-50%) rotate(90deg)}"+
    ".map-loc{position:absolute;z-index:945;left:42px;bottom:38px;color:#fff;font-size:9px;font-weight:800;line-height:1.35;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 1px 3px #000}.map-loc span{display:block}.map-loc .sub{font-size:7.5px}.map-loc:empty{display:none}"+
    ".print-overlay{position:absolute;inset:0;z-index:850;width:100%;height:100%;overflow:visible;pointer-events:none}.print-overlay path{vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round;fill-rule:evenodd}.polygon-halo{fill:none;stroke:#fff;stroke-width:4.6;stroke-opacity:.8}.polygon-shape{fill:rgba(255,0,132,.04);stroke:#ff008c;stroke-width:2.4}"+
    ".print-pin{position:absolute;z-index:880;width:30px;height:38px;transform:translate(-15px,-36px)}.print-pin:before{content:\"\";position:absolute;left:3px;top:1px;width:24px;height:24px;border:3px solid #fff;border-radius:50% 50% 50% 0;background:#ed5b12;box-shadow:0 2px 7px rgba(0,0,0,.7);transform:rotate(-45deg)}.print-pin:after{content:\"\";position:absolute;z-index:1;left:12px;top:10px;width:7px;height:7px;border-radius:50%;background:#fff}"+
    ".leaflet-control-attribution{display:none}.screen-bar{display:none}"+
    "@media screen{html{background:#e9eeec}body{margin:0 auto;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 12px 40px rgba(0,0,0,.14)}.screen-bar{position:sticky;top:0;z-index:2000;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:#0b3b35;color:#fff;font-size:12px}.screen-bar button{height:32px;padding:0 14px;border:0;border-radius:8px;background:#fff;color:#0b4a40;font-weight:700;cursor:pointer}.sheet,.summary{border-bottom:1px dashed #cdd9d5}}"+
    "@media print{.screen-bar{display:none!important}}";

  // Dijalankan di tab laporan: menggambar setiap halaman peta lalu membuka dialog cetak.
  function printSheetMain(report){
    function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
    function geometries(input,out){if(!input)return out;if(input.type==='FeatureCollection')(input.features||[]).forEach(function(f){geometries(f,out);});else if(input.type==='Feature')geometries(input.geometry,out);else if(input.type==='GeometryCollection')(input.geometries||[]).forEach(function(g){geometries(g,out);});else out.push(input);return out;}
    function niceStep(spanSec){var steps=[0.1,0.2,0.25,0.5,1,2,5,10,15,20,30,60,120,300,600,900,1800,3600,7200,10800],best=steps[0];steps.forEach(function(s){if(spanSec/s>=3)best=s;});return best;}
    function decimalsFor(step){return step>=1?0:(Math.abs(step*10-Math.round(step*10))<1e-9?1:2);}
    function niceScaleDistance(raw){var values=[5,10,20,40,50,80,100,200,400,500,800,1000,2000,4000,5000,8000,10000,20000,50000],best=values[0];values.forEach(function(v){if(v<=raw)best=v;});return best;}
    var pinSvg='<svg width="12" height="16" viewBox="-16 -46 32 46"><path d="M0 0C-14-18-16-24-16-30A16 16 0 1 1 16-30C16-24 14-18 0 0Z" fill="#ed5b12" stroke="#fff" stroke-width="3"/><circle cy="-30" r="5.5" fill="#fff"/></svg>';
    function overlayStyle(o){return function(f){var c=(f.properties||{}).__printColor||o.color||'#4c94c7';return o.line?{color:c,weight:3.2,opacity:1,fill:false}:{color:'#2b2b2b',weight:.7,opacity:.85,fillColor:c,fillOpacity:.86};};}
    function swatch(color,line){return line?'border-top-color:'+color:'background:'+color+';border:1px solid #2b2b2b';}
    var started=false;
    function start(){
      if(started)return;started=true;
      document.title=report.filename||document.title;
      var bar=document.querySelector('.screen-bar button');if(bar)bar.addEventListener('click',function(){window.print();});
      var geo=report.geometry.type==='FeatureCollection'||report.geometry.type==='Feature'?report.geometry:{type:'Feature',properties:{},geometry:report.geometry},pages=[].slice.call(document.querySelectorAll('.map-sheet')),admins=report.admins||[],pending=pages.length;
      function setupPage(sheet){
        var id=Number(sheet.getAttribute('data-page')),layer=id>=0?report.layers[id]:null,mapEl=sheet.querySelector('.print-map'),frame=sheet.querySelector('.map-frame');
        var items=['<div class="li"><i class="sw sw-subject">'+(report.pointShape?pinSvg:'<b class="sw-poly"></b>')+'</i><div><b>'+(report.pointShape?'Titik analisis':'Bidang analisis')+'</b></div></div>'];
        if(layer){var cls=(layer.legendItems||[]).filter(function(e){return e.label;}),shown=cls.slice(0,14);shown.forEach(function(e){var st=layer.classStats&&layer.classStats[e.label];items.push('<div class="li"><i class="sw'+(layer.line?' sw-line':'')+'" style="'+swatch(e.color,layer.line)+'"></i><div>'+esc(e.label)+(st?'<small>'+esc(st)+'</small>':'')+'</div></div>');});if(cls.length>14)items.push('<div class="li"><i class="sw" style="background:#eee;border:1px solid #bbb"></i><div>+'+(cls.length-14)+' kelas lain</div></div>');}
        if(admins.length)items.push('<div class="li"><i class="sw" style="border:1.6px dashed #1b1b1b;background:transparent"></i><div>Batas desa/kelurahan</div></div>');
        sheet.querySelector('.legend').innerHTML='<h2>Legenda<span class="grid-note"></span></h2><div class="lg">'+items.join('')+'</div>'+(layer&&layer.usulan?'<p class="lg-note">Data hasil verifikasi usulan, belum merupakan penetapan.</p>':'')+(layer&&!(layer.data.features||[]).length?'<p class="lg-note">Layer ini tidak memiliki fitur di dalam bingkai peta.</p>':'');
        var map=L.map(mapEl,{zoomControl:false,attributionControl:false,fadeAnimation:false,zoomAnimation:false,markerZoomAnimation:false}),base=report.base,tiles=L.tileLayer(base.url,{maxZoom:20,maxNativeZoom:base.maxNativeZoom||20}).addTo(map),bounds=L.geoJSON(geo,{pointToLayer:function(f,ll){return L.circleMarker(ll,{radius:1,opacity:0,fillOpacity:0});}}).getBounds();
        function centerFeature(){if(bounds.isValid()&&report.scale){var lat=bounds.getCenter().lat,mpp=report.scale*0.0002645833333,zoom=Math.log(156543.03392*Math.cos(lat*Math.PI/180)/mpp)/Math.LN2;map.setView(bounds.getCenter(),Math.max(8,Math.min(20,zoom)),{animate:false});}else if(report.pointShape&&bounds.isValid())map.setView(bounds.getCenter(),19,{animate:false});else if(bounds.isValid()){map.fitBounds(bounds,{padding:[70,70],maxZoom:19,animate:false});map.setView(bounds.getCenter(),map.getZoom(),{animate:false});}else map.setView([-8.85,116.85],10,{animate:false});}
        map.invalidateSize();centerFeature();
        if(layer){map.createPane('lyr');map.getPane('lyr').style.zIndex=360;L.geoJSON(layer.data,{pane:'lyr',interactive:false,smoothFactor:0,style:overlayStyle(layer)}).addTo(map);}
        admins.forEach(function(o){if(!map.getPane('adm'))map.createPane('adm');map.getPane('adm').style.zIndex=380;L.geoJSON(o.data,{pane:'adm',interactive:false,smoothFactor:0,style:function(){return{color:'#ffffff',weight:3,opacity:.6,fill:false};}}).addTo(map);L.geoJSON(o.data,{pane:'adm',interactive:false,smoothFactor:0,style:function(){return{color:'#1b1b1b',weight:1.3,opacity:.95,fill:false,dashArray:'5 3'};}}).addTo(map);});
        var gridLayers=[];
        function edgeLabel(cls,text,left,top){var node=document.createElement('span');node.className='edge-coordinate '+cls;node.textContent=text;node.style.left=left+'px';node.style.top=top+'px';frame.appendChild(node);}
        function drawGrid(){gridLayers.forEach(function(l){map.removeLayer(l);});gridLayers=[];frame.querySelectorAll('.edge-coordinate').forEach(function(n){n.remove();});
          var el=map.getContainer(),w=el.clientWidth,h=el.clientHeight,ox=el.offsetLeft,oy=el.offsetTop,b=map.getBounds(),W=b.getWest(),E=b.getEast(),S=b.getSouth(),N=b.getNorth();
          var sx=niceStep((E-W)*3600),dx=decimalsFor(sx),kx=Math.ceil(W*3600/sx-1e-9);
          for(;kx*sx<=E*3600+1e-9;kx++){var lng=kx*sx/3600,x=map.latLngToContainerPoint([(S+N)/2,lng]).x;if(x<14||x>w-14)continue;gridLayers.push(L.polyline([[S,lng],[N,lng]],{color:'#fff',weight:.7,opacity:.6,interactive:false}).addTo(map));var t=printDmsId(lng,false,dx);edgeLabel('top',t,ox+x,13);edgeLabel('bottom',t,ox+x,frame.clientHeight-13);}
          var sy=niceStep((N-S)*3600),dy=decimalsFor(sy),ky=Math.ceil(S*3600/sy-1e-9);
          for(;ky*sy<=N*3600+1e-9;ky++){var lat=ky*sy/3600,y=map.latLngToContainerPoint([lat,(W+E)/2]).y;if(y<14||y>h-14)continue;gridLayers.push(L.polyline([[lat,W],[lat,E]],{color:'#fff',weight:.7,opacity:.6,interactive:false}).addTo(map));var u=printDmsId(lat,true,dy);edgeLabel('left',u,15,oy+y);edgeLabel('right',u,frame.clientWidth-15,oy+y);}
          var gl=sheet.querySelector('.grid-note');if(gl)gl.textContent='Grid koordinat '+(sx>=60?(sx/60)+'′':String(sx).replace('.',',')+'″')+' • WGS84';}
        function updateScale(){var center=map.getCenter(),mpp=156543.03392*Math.cos(center.lat*Math.PI/180)/Math.pow(2,map.getZoom()),distance=niceScaleDistance(mpp*92),width=Math.max(52,Math.min(106,distance/mpp)),bar=sheet.querySelector('.scale-bar'),labels=sheet.querySelector('.scale-labels'),ratio=sheet.querySelector('.scale-ratio');bar.innerHTML='';labels.innerHTML='';bar.style.width=width+'px';for(var i=0;i<4;i++){var s=document.createElement('i');s.className='scale-seg';s.style.width=(width/4)+'px';bar.appendChild(s);}for(var j=0;j<=4;j++){var lab=document.createElement('span'),v=distance/4*j;lab.textContent=(v>=1000&&distance>=2000?(v/1000).toLocaleString('id-ID')+(j===4?' km':''):Math.round(v)+(j===4?' m':''));lab.style.left=(j*25)+'%';labels.appendChild(lab);}var den=mpp/0.0002645833333,unit=den<2000?100:den<10000?500:den<50000?1000:5000,rounded=Math.max(unit,Math.round(den/unit)*unit);ratio.textContent=report.scale?'Skala 1 : '+Number(report.scale).toLocaleString('id-ID'):'Skala ± 1 : '+rounded.toLocaleString('id-ID');}
        function renderSubject(){var c=map.getContainer();c.querySelectorAll('.print-overlay,.print-pin').forEach(function(n){n.remove();});var size=map.getSize(),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','print-overlay');svg.setAttribute('viewBox','0 0 '+size.x+' '+size.y);
          function polygonPath(g){var polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[],parts=[];polys.forEach(function(poly){poly.forEach(function(ring){var line=[];ring.forEach(function(p,i){var q=map.latLngToContainerPoint([p[1],p[0]]);line.push((i?'L':'M')+q.x.toFixed(1)+' '+q.y.toFixed(1));});if(line.length)parts.push(line.join(' ')+' Z');});});return parts.join(' ');}
          geometries(report.geometry,[]).forEach(function(g){if(g.type==='Point'){var p=report.pointShape?{x:size.x/2,y:size.y/2}:map.latLngToContainerPoint([g.coordinates[1],g.coordinates[0]]),pin=document.createElement('div');pin.className='print-pin';pin.style.left=p.x+'px';pin.style.top=p.y+'px';c.appendChild(pin);return;}var d=polygonPath(g);if(!d)return;['polygon-halo','polygon-shape'].forEach(function(cls){var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('class',cls);path.setAttribute('d',d);svg.appendChild(path);});});c.appendChild(svg);}
        var tileDone=false,drawn=false;
        function done(){if(tileDone&&drawn&&!sheet.__ready){sheet.__ready=true;pending--;finish();}}
        tiles.on('load',function(){tileDone=true;done();});
        setTimeout(function(){map.invalidateSize();centerFeature();drawGrid();updateScale();renderSubject();drawn=true;done();},500);
        setTimeout(function(){tileDone=true;done();},4000);
      }
      var printed=false;
      function finish(){if(printed||pending>0)return;printed=true;setTimeout(function(){document.title=report.filename||document.title;window.focus();window.print();},700);}
      pages.forEach(setupPage);
      if(!pages.length)finish();
    }
    if(document.readyState==='complete')start();else window.addEventListener('load',start);
  }

  function writeReport(reportWindow,c,settings){
    var model=c.model,point=model.mode==='point',polygon=!point,geometry=subjectGeometry(c),admin=subjectAdmin(c),nib=subjectNib(c);
    var measured=!!(c.options&&c.options.measured),explorer=!!subjectProps(c).__SOBAT_EXPLORER_SELECTED;
    var villageWord=settings.villageWord||'Desa',now=new Date();
    var prefix=point?'Koordinat':measured?'Digitasi_Poligon':nib?'NIB_'+fileToken(nib):'Poligon';
    var filename=['SOBATTARU',prefix,fileToken(admin.village),fileToken(admin.district),String(now.getHours()).padStart(2,'0')+String(now.getMinutes()).padStart(2,'0')+String(now.getSeconds()).padStart(2,'0')].filter(Boolean).join('_');
    var title=point?'Laporan Analisis Lokasi':'Laporan Analisis Bidang';
    var stamp=now.toLocaleString('id-ID',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
    var center=model.latlng,dmsText=center?printDmsId(center.lat,true,1)+'<br>'+printDmsId(center.lng,false,1):'—',decText=center?center.lat.toFixed(6)+', '+center.lng.toFixed(6):'';
    var subjectLabel=measured?'Poligon hasil digitasi':nib?'NIB: '+nib:'';
    var u=function(p){return new URL(p,location.href).href;};

    // Ringkasan per layer, sama dengan isi panel hasil analisis.
    var flags=[];
    function rowFor(r){
      var def=r.def,fields=[];
      if(polygon&&!def.line&&!def.sigap&&r.categories.length){fields=r.categories.map(function(cat){return {label:cat.name,value:areaPct(c,cat.area)};});fields.push({label:'Total irisan',value:areaPct(c,r.area),tot:true});}
      else if(polygon&&def.sigap&&r.categories.length){fields=r.categories.map(function(cat){return {label:cat.name,value:areaPct(c,cat.area)};});}
      else if(def.line){fields=[{label:'Ruas jalan',value:r.values.slice(0,8).join(', ')+(r.values.length>8?' dan '+(r.values.length-8)+' ruas lain':'')}];}
      else fields=(r.values.length?r.values:['Lokasi berada di dalam layer ini']).map(function(v){return {label:def.sigap?'Fungsi kawasan':'Kelas',value:v};});
      var flagged=!!(def.constraint||(def.sigap&&r.forest)||(/^rtrw/.test(def.id)&&r.values.concat(r.categories.map(function(x){return x.name;})).some(function(v){return c.protectedPattern.test(v);})));
      if(flagged){var name=def.sigap?'Kawasan hutan':def.constraint||'Kawasan lindung RTRW';if(flags.indexOf(name)<0)flags.push(name);}
      return {title:layerTitle(def),legal:def.legal||'',status:point?'Masuk':'Beririsan',fields:fields,lp2b:def.id==='lp2b',flagged:flagged,group:/^(rtrw|rdtr)/.test(def.id)?'planning':'thematic'};
    }
    var inRows=model.results.filter(function(r){return r.inside;}).map(rowFor),outRows=model.results.filter(function(r){return !r.inside&&!r.pending;});
    function fieldValue(v){v=String(v==null?'':v);return /(m²|\bha\b|%)/.test(v)&&v.length<60?v.split(' • ').map(function(part){return '<i>'+esc(part)+'</i>';}).join('<i>&nbsp;•&nbsp;</i>'):esc(v);}
    function rowHtml(r){return '<tr><td class="l"><b>'+esc(r.title).replace(/(\d{4}–\d{4})/g,'<span class="nw">$1</span>')+'</b>'+(r.legal?'<small>'+esc(r.legal)+'</small>':'')+'</td><td class="s"><span class="pill'+(r.lp2b?' amber':r.flagged?' red':'')+'">'+esc(r.status)+(r.lp2b?'*':'')+'</span></td><td><div class="kv">'+r.fields.map(function(f){return '<span'+(f.tot?' class="tot"':'')+'>'+esc(f.label)+'</span><b'+(f.tot?' class="tot"':'')+'>'+fieldValue(f.value)+'</b>';}).join('')+'</div></td></tr>';}
    function groupHtml(label,list){return list.length?'<tr class="grp"><td colspan="3">'+esc(label)+'</td></tr>'+list.map(rowHtml).join(''):'';}
    var bodyRows=groupHtml('Tata ruang',inRows.filter(function(r){return r.group==='planning';}))+groupHtml('Lahan dan kawasan tematik',inRows.filter(function(r){return r.group!=='planning';}));
    if(!bodyRows)bodyRows='<tr><td colspan="3" class="empty">Tidak ada layer yang '+(point?'mencakup lokasi':'beririsan dengan bidang')+' ini.</td></tr>';
    var outHtml=outRows.length?'<div class="box-out"><b>'+(point?'Tidak mencakup lokasi ini':'Tidak beririsan dengan')+':</b> '+outRows.map(function(r){return esc(layerTitle(r.def));}).join(' • ')+'</div>':'';
    var warnHtml=flags.length?'<div class="box-warn"><b>Perhatian:</b> '+(point?'Lokasi':'Bidang')+' '+(point?'berada di':'beririsan dengan')+' '+esc(flags.join(', '))+'. Pemanfaatan ruang di sini terikat ketentuan khusus perlindungan lahan/izin. Konfirmasikan kepada instansi berwenang.</div>':'';
    var hasLp2b=inRows.some(function(r){return r.lp2b;});

    var overlays=settings.overlays||[],layers=overlays.filter(function(o){return !o.admin;}),admins=overlays.filter(function(o){return o.admin;}),mapPages=layers.length?layers.map(function(o,i){return i;}):[-1],totalMaps=mapPages.length;
    var locLine=(admin.village?'<span>'+esc(villageWord)+' '+esc(admin.village)+'</span>':'')+(admin.district?'<span class="sub">Kec. '+esc(admin.district)+'</span>':'')+(subjectLabel?'<span class="sub">'+esc(subjectLabel)+'</span>':'');
    var head='<header class="head"><div class="brand-wrap"><img class="report-logo" src="'+u('assets/sobat-taru-logo.svg')+'" alt=""><div class="brand">SOBAT TARU<small>Sumbawa Barat dalam Tata Ruang</small></div></div><div class="meta">'+esc(title)+'<br>Dicetak '+esc(stamp)+'</div></header>';
    var ident='<div class="ident"><div><small>'+(point?'Koordinat titik (WGS84)':'Titik tengah bidang (WGS84)')+'</small><b>'+dmsText+'</b>'+(decText?'<em>'+decText+'</em>':'')+(polygon?'<em>Luas bidang: '+esc(c.fmtAreaLong(model.total))+'</em>':'')+'</div><div><small>'+esc(villageWord)+'</small><b>'+esc(admin.village||'—')+'</b></div><div><small>Kecamatan</small><b>'+esc(admin.district||'—')+'</b></div><div><small>Kabupaten</small><b>'+esc(admin.regency)+'</b></div></div>';
    var mapHtml=mapPages.map(function(id,n){var o=id>=0?layers[id]:null;return '<section class="sheet map-sheet" data-page="'+id+'">'+head+ident+
      '<div class="sec-row"><h1 class="sec">'+(o?'Peta '+(n+1)+' dari '+totalMaps+' • '+esc(o.short).replace(/(\d{4}–\d{4})/g,'<span class="nw">$1</span>'):'Peta '+(point?'Lokasi':'Bidang')+' Analisis')+'</h1>'+(o&&o.legal?'<span class="sec-sub">'+(/^(Perda|Perbup|Pergub|Perpres|PP|Permen|Kepmen|Keputusan|Peraturan|SK)\b/i.test(o.legal)?'Dasar hukum: ':'')+esc(o.legal)+'</span>':'')+(o&&o.statLine?'<span class="sec-stat">'+esc(o.statLine)+'</span>':'')+'</div>'+
      '<div class="map-frame"><div class="print-map"></div><div class="carto-card"><div class="carto-compass"><span>U</span><img src="'+u('assets/app/compass-rose.png')+'" alt=""></div><div class="scale-card"><div class="scale-ratio">Skala</div><div class="scale-bar"></div><div class="scale-labels"></div></div></div><div class="map-loc">'+locLine+'</div></div>'+
      '<section class="legend"></section></section>';}).join('');
    var summary='<section class="summary">'+head+ident+'<h2 class="sec">Ringkasan Hasil Analisis</h2><table class="rt"><colgroup><col style="width:36%"><col style="width:15%"><col></colgroup><thead><tr><th>Layer</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>'+bodyRows+'</tbody></table>'+outHtml+warnHtml+
      (hasLp2b?'<div class="box-lp2b"><b>* LP2B Hasil Verifikasi Usulan tahun 2026</b> belum merupakan penetapan dan masih menunggu Keputusan Bupati. Untuk rencana pemanfaatan, konfirmasikan ke Pemda setempat.</div>':'')+
      '<div class="box-note"><b>Catatan:</b> Hasil ini merupakan informasi awal berbasis data geospasial yang tersedia dan bukan keputusan atau dokumen hukum.'+(polygon?' Luas irisan dihitung dari geometri (UTM 50S), bukan ukuran kadastral.':'')+' Konfirmasikan keputusan formal kepada instansi berwenang.</div></section>';
    var payload=JSON.stringify({geometry:geometry,pointShape:point,base:settings.base,layers:layers,admins:admins,scale:Number(settings.scale||0),filename:filename}).replace(/</g,'\\u003c');
    var screenBar='<div class="screen-bar"><span>Pratinjau laporan. Pada dialog cetak, pilih <b>Simpan sebagai PDF</b>.</span><button type="button">Cetak / Simpan PDF</button></div>';
    var doc='<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(filename)+'</title><link rel="stylesheet" href="'+u('css/leaflet.css')+'"><style>'+PRINT_SHEET_CSS+'</style></head><body>'+screenBar+mapHtml+summary+
      '<script src="'+u('js/leaflet.js')+'"><\/script><script>var printDmsId='+printDmsId.toString()+';('+printSheetMain.toString()+')('+payload+');<\/script></body></html>';
    // Laporan dimuat sebagai dokumen tersendiri (blob) agar peta dan gambar termuat penuh sebelum dialog cetak.
    try{reportWindow.location.replace(URL.createObjectURL(new Blob([doc],{type:'text/html;charset=utf-8'})));}
    catch(_blobError){reportWindow.document.open();reportWindow.document.write(doc);reportWindow.document.close();}
    toast('Laporan dibuka di tab baru. Pilih “Simpan sebagai PDF” pada dialog cetak.',5000);
  }
})();
