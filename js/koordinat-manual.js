/*
 * SOBAT TARU — Alat "Input Koordinat Manual" (menu Alat).
 * Pengguna mengetik koordinat satu per satu (atau menempel daftar). Setiap koordinat tampil sebagai TITIK
 * bernomor di peta; klik titik menampilkan nilai koordinatnya. Titik TIDAK otomatis menjadi poligon:
 * tombol "Jadikan poligon" yang membentuk bidang (minimal 3 titik), lalu bidang dianalisis seperti bidang
 * hasil digitasi (cetak PDF, ekspor SHP/KML, Peta Telaah Spasial dari digitasi).
 * Sistem koordinat: Geografis (desimal/DMS), UTM 50S, TM-3 50.1/50.2, atau deteksi otomatis.
 */
(function(){
  'use strict';
  if(!window.L||!window.map)return;

  function $(id){return document.getElementById(id);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function toast(text,ms){var u=window.sobatUx;if(u&&u.showToast)u.showToast(text,ms);else if(window.sobatTools&&window.sobatTools.notify)window.sobatTools.notify(text);}
  function tools(){return window.sobatCoordTools||null;}
  function isPhone(){return window.matchMedia('(max-width:640px)').matches;}
  function fmt(v,d){return Number(v).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d,useGrouping:false});}
  var MAX_POINTS=500,COLOR='#e6007e';

  var st={points:[],crs:'auto',layer:null,open:false,polygonMade:false};

  /* ---------- Panel ---------- */
  var panel=document.createElement('section');
  panel.className='mc-panel';panel.id='manualCoordPanel';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','mcTitle');
  panel.innerHTML=
    '<header class="mc-head"><div><h2 id="mcTitle"><i class="fas fa-map-pin" aria-hidden="true"></i>Input Koordinat Manual</h2><p>Ketik koordinat titik batas satu per satu. Titik tampil di peta; bentuk poligon setelah semua titik benar.</p></div><button type="button" class="mc-close" data-mc-close aria-label="Tutup panel">×</button></header>'+
    '<div class="mc-body">'+
      '<label class="mc-field">Sistem koordinat<select id="mcCrs"><option value="auto">Deteksi otomatis</option><option value="geo">Geografis WGS 84 (bujur, lintang)</option><option value="utm50s">UTM Zona 50S (WGS 84)</option><option value="tm3-501">TM-3 Zona 50.1</option><option value="tm3-502">TM-3 Zona 50.2</option></select></label>'+
      '<form class="mc-entry" id="mcForm" autocomplete="off">'+
        '<label class="mc-field"><span id="mcXLabel">X / Bujur / Easting</span><input id="mcX" inputmode="decimal" placeholder="mis. 116.853075"></label>'+
        '<label class="mc-field"><span id="mcYLabel">Y / Lintang / Northing</span><input id="mcY" inputmode="decimal" placeholder="mis. -8.753883"></label>'+
        '<button type="submit" class="mc-btn primary mc-add"><i class="fas fa-plus" aria-hidden="true"></i>Tambah titik</button>'+
      '</form>'+
      '<p class="mc-hint">Desimal, derajat-menit-detik (8 45 14 LS), UTM, atau TM-3. Bisa juga ketik pasangan "X, Y" di kolom pertama, lalu Enter.</p>'+
      '<p class="mc-msg" id="mcMsg" role="status" aria-live="polite"></p>'+
      '<details class="mc-paste"><summary>Tempel banyak koordinat sekaligus</summary><textarea id="mcPaste" rows="4" placeholder="Satu titik per baris: X Y&#10;484470.25 9028560.10&#10;484485.40 9028556.80"></textarea><button type="button" class="mc-btn" id="mcPasteAdd"><i class="fas fa-paste" aria-hidden="true"></i>Tambahkan sebagai titik</button></details>'+
      '<div class="mc-list-head"><b id="mcCount">Belum ada titik</b><span id="mcCrsInfo"></span></div>'+
      '<ol class="mc-list" id="mcList"></ol>'+
    '</div>'+
    '<footer class="mc-foot">'+
      '<button type="button" class="mc-btn" id="mcClear"><i class="fas fa-trash-alt" aria-hidden="true"></i><span>Hapus<span class="mc-long">&nbsp;semua</span></span></button>'+
      '<button type="button" class="mc-btn" id="mcZoom"><i class="fas fa-expand" aria-hidden="true"></i><span>Zoom<span class="mc-long">&nbsp;titik</span></span></button>'+
      '<button type="button" class="mc-btn primary" id="mcMakePolygon" disabled><i class="fas fa-object-group" aria-hidden="true"></i>Jadikan poligon</button>'+
    '</footer>';
  document.body.appendChild(panel);
  L.DomEvent.disableClickPropagation(panel);
  L.DomEvent.disableScrollPropagation(panel);

  /* ---------- Konversi ---------- */
  function parse(v){var t=tools();if(t)return t.parse(v);var n=Number(String(v||'').trim().replace(',','.'));return isFinite(n)?n:NaN;}
  // Semua titik memakai satu sistem koordinat; pada mode otomatis ditentukan dari titik pertama.
  function activeCrs(){
    var chosen=$('mcCrs').value;if(chosen!=='auto')return chosen;
    var t=tools();if(!t||!st.points.length)return '';
    return t.detectCrs([st.points[0].raw])||'';
  }
  function crsLabel(crs){var t=tools();if(crs==='geo'||crs==='geo-swap')return 'Geografis WGS 84';return t&&t.crs[crs]?t.crs[crs].label:'';}
  function convert(raw,crs){
    var t=tools();if(!t)throw new Error('Modul konversi koordinat belum siap.');
    if(!crs)throw new Error('Sistem koordinat tidak dikenali dari X='+raw[0]+', Y='+raw[1]+'. Pilih sistem koordinat secara manual.');
    // Lintang/bujur yang tertukar pada satu titik dibalik otomatis.
    if(crs==='geo-swap')crs='geo';
    if(crs==='geo'&&Math.abs(raw[0])<=15&&Math.abs(raw[1])>=100)crs='geo-swap';
    var res=t.toLonLat([raw],crs),ll=res.coords[0],box=t.ksbBox;
    if(!(ll[0]>=box[0]&&ll[0]<=box[2]&&ll[1]>=box[1]&&ll[1]<=box[3]))throw new Error('Titik berada di luar Kabupaten Sumbawa Barat bila dibaca sebagai '+res.label+'. Periksa nilai, urutan X/Y, atau sistem koordinat.');
    return {lonlat:ll,notes:res.notes};
  }
  function recompute(){
    var crs=activeCrs(),bad=0;
    st.points.forEach(function(p){try{var c=convert(p.raw,crs);p.lonlat=c.lonlat;p.error='';}catch(err){p.lonlat=null;p.error=err.message;bad++;}});
    return bad;
  }

  /* ---------- Titik di peta ---------- */
  function icon(n,bad){return L.divIcon({className:'mc-pt'+(bad?' bad':''),html:'<i></i><span>'+n+'</span>',iconSize:[14,14],iconAnchor:[7,7]});}
  function popupHtml(p,i){
    var crs=activeCrs();
    return '<div class="mc-pop"><b>Titik '+(i+1)+'</b>'+
      '<div><span>X</span>'+esc(p.input[0])+'</div><div><span>Y</span>'+esc(p.input[1])+'</div>'+
      (p.lonlat?'<div><span>Lintang, bujur</span>'+fmt(p.lonlat[1],7)+', '+fmt(p.lonlat[0],7)+'</div>':'')+
      (crs?'<small>'+esc(crsLabel(crs))+'</small>':'')+'</div>';
  }
  function draw(){
    if(st.layer){map.removeLayer(st.layer);st.layer=null;}
    var group=L.featureGroup();
    st.points.forEach(function(p,i){
      if(!p.lonlat)return;
      var m=L.marker([p.lonlat[1],p.lonlat[0]],{icon:icon(i+1,false),keyboard:false,riseOnHover:true,bubblingMouseEvents:false});
      m.bindPopup(popupHtml(p,i),{className:'mc-popup',autoPanPaddingTopLeft:L.point(20,isPhone()?230:90),autoPanPaddingBottomRight:L.point(20,isPhone()&&!panel.hidden?Math.round(window.innerHeight-panel.getBoundingClientRect().top+20):40)});
      m.on('click',function(ev){if(ev.originalEvent)L.DomEvent.stop(ev.originalEvent);highlight(i);});
      group.addLayer(m);p.marker=m;
    });
    st.layer=group.addTo(map);
  }
  function highlight(i){[].forEach.call($('mcList').children,function(li,k){li.classList.toggle('on',k===i);});var li=$('mcList').children[i];if(li&&li.scrollIntoView)li.scrollIntoView({block:'nearest'});}
  function render(){
    var bad=recompute(),crs=activeCrs(),valid=st.points.filter(function(p){return p.lonlat;}).length;
    draw();
    $('mcList').innerHTML=st.points.map(function(p,i){
      return '<li class="'+(p.error?'bad':'')+'"><button type="button" class="mc-row" data-mc-go="'+i+'"><b>'+(i+1)+'</b><span><code>'+esc(p.input[0])+'</code><code>'+esc(p.input[1])+'</code>'+(p.error?'<small>'+esc(p.error)+'</small>':p.lonlat?'<small>'+fmt(p.lonlat[1],6)+', '+fmt(p.lonlat[0],6)+'</small>':'')+'</span></button>'+
        '<span class="mc-row-acts"><button type="button" data-mc-up="'+i+'" aria-label="Naikkan titik '+(i+1)+'" title="Naikkan urutan"'+(i?'':' disabled')+'><i class="fas fa-arrow-up" aria-hidden="true"></i></button><button type="button" data-mc-del="'+i+'" aria-label="Hapus titik '+(i+1)+'" title="Hapus titik"><i class="fas fa-times" aria-hidden="true"></i></button></span></li>';
    }).join('');
    $('mcCount').textContent=st.points.length?st.points.length+' titik'+(bad?' • '+bad+' perlu diperiksa':''):'Belum ada titik';
    $('mcCrsInfo').textContent=st.points.length&&crs?crsLabel(crs)+($('mcCrs').value==='auto'?' (otomatis)':''):'';
    var ready=valid>=3&&!bad;
    $('mcMakePolygon').disabled=!ready;
    $('mcMakePolygon').title=ready?'Bentuk poligon dari '+valid+' titik sesuai urutan':'Butuh minimal 3 titik yang valid';
    $('mcZoom').disabled=$('mcClear').disabled=!st.points.length;
    syncLabels();
  }
  function syncLabels(){
    var c=$('mcCrs').value,geo=c==='geo';
    $('mcXLabel').textContent=geo?'Bujur (X)':c==='auto'?'X / Bujur / Easting':'X / Easting';
    $('mcYLabel').textContent=geo?'Lintang (Y)':c==='auto'?'Y / Lintang / Northing':'Y / Northing';
    $('mcX').placeholder=geo||c==='auto'?'mis. 116.853075':'mis. 484470,25';
    $('mcY').placeholder=geo||c==='auto'?'mis. -8.753883':'mis. 9028560,10';
  }
  function message(text,kind){var m=$('mcMsg');m.textContent=text||'';m.className='mc-msg'+(kind?' '+kind:'');}

  /* ---------- Tambah / hapus titik ---------- */
  function addPoint(xText,yText,quiet){
    var x=parse(xText),y=parse(yText);
    if(!isFinite(x)||!isFinite(y))throw new Error('Nilai X dan Y harus berupa angka (desimal atau derajat-menit-detik).');
    if(st.points.length>=MAX_POINTS)throw new Error('Maksimal '+MAX_POINTS+' titik.');
    var p={raw:[x,y],input:[String(xText).trim(),String(yText).trim()]};
    var crs=st.points.length?activeCrs():($('mcCrs').value!=='auto'?$('mcCrs').value:(tools()?tools().detectCrs([p.raw]):''));
    var c=convert(p.raw,crs);// validasi sebelum ditambahkan
    st.points.push(p);
    if(!quiet&&c.notes&&c.notes.length)message(c.notes.join(' '),'warn');
    return p;
  }
  function submitEntry(ev){
    if(ev)ev.preventDefault();
    var xv=$('mcX').value,yv=$('mcY').value;
    // Satu kolom juga bisa diisi pasangan "X, Y" / "X Y".
    if(String(xv).trim()&&!String(yv).trim()){var pair=splitPair(xv);if(pair){xv=pair[0];yv=pair[1];}}
    if(!String(xv).trim()||!String(yv).trim()){message('Isi nilai X dan Y terlebih dahulu.','err');return;}
    try{
      message('');addPoint(xv,yv);render();
      var p=st.points[st.points.length-1];
      if(p.lonlat){if(st.points.length>1)zoomPoints();else showPoint(L.latLng(p.lonlat[1],p.lonlat[0]));}
      if(!$('mcMsg').textContent)message('Titik '+st.points.length+' ditambahkan.'+(st.points.length>=3?' Tekan "Jadikan poligon" bila semua titik sudah benar.':''),'ok');
      $('mcX').value='';$('mcY').value='';if(!isPhone())$('mcX').focus();
      st.polygonMade=false;
    }catch(err){message(err.message,'err');}
  }
  function splitPair(line){
    var s=String(line||'').trim();if(!s)return null;
    var parts=s.split(/\s*[;\t]\s*|\s*,\s+|\s{2,}/).filter(Boolean);
    if(parts.length<2)parts=s.split(/\s+/).filter(Boolean);
    if(parts.length===2)return parts;
    if(parts.length>=3&&/^\d{1,4}$/.test(parts[0])&&parts.length===3)return [parts[1],parts[2]];
    // "8 45 14 LS 116 51 11 BT" dan sejenisnya: pisah pada penanda arah pertama.
    var m=/^(.+?(?:LS|LU|BT|BB|[NSEW]))\s+(.+)$/i.exec(s);
    return m?[m[1],m[2]]:null;
  }
  function addPasted(){
    var lines=String($('mcPaste').value||'').split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean),added=0,failed=[];
    lines.forEach(function(line,i){
      if(/^[A-Za-z]/.test(line)&&!/\d/.test(line))return;// baris judul
      var pair=splitPair(line);
      if(!pair){failed.push(i+1);return;}
      try{addPoint(pair[0],pair[1],true);added++;}catch(_e){failed.push(i+1);}
    });
    render();zoomPoints();
    if(added)$('mcPaste').value=failed.length?lines.filter(function(_l,i){return failed.indexOf(i+1)>=0;}).join('\n'):'';
    message(added?added+' titik ditambahkan'+(failed.length?'; baris '+failed.slice(0,6).join(', ')+(failed.length>6?'…':'')+' belum terbaca dan dibiarkan di kotak tempel.':'.'):'Tidak ada baris yang dapat dibaca. Gunakan format "X Y" per baris.',added?(failed.length?'warn':'ok'):'err');
    st.polygonMade=false;
  }
  // Paskan titik ke area peta yang tidak tertutup panel ini (bawah di HP, kiri di desktop).
  function clearPadding(){
    var m=map.getContainer().getBoundingClientRect(),tl=[50,isPhone()?220:50],br=[50,50];
    if(!panel.hidden){var r=panel.getBoundingClientRect();if(isPhone())br[1]=Math.max(50,m.bottom-r.top+30);else tl[0]=Math.max(50,r.right-m.left+30);}
    return {tl:tl,br:br};
  }
  function zoomPoints(){
    var b=st.layer&&st.layer.getLayers().length?st.layer.getBounds():null;if(!b||!b.isValid())return;
    var pad=clearPadding();
    map.fitBounds(b,{paddingTopLeft:pad.tl,paddingBottomRight:pad.br,maxZoom:18});
  }
  function showPoint(ll){
    var pad=clearPadding(),size=map.getSize(),pt=map.latLngToContainerPoint(ll);
    if(map.getZoom()>=16&&pt.x>pad.tl[0]&&pt.y>pad.tl[1]&&pt.x<size.x-pad.br[0]&&pt.y<size.y-pad.br[1])return;
    var z=Math.max(map.getZoom(),17),target=map.project(ll,z),off=L.point((pad.tl[0]-pad.br[0])/2,(pad.tl[1]-pad.br[1])/2);
    map.setView(map.unproject(target.subtract(off),z),z);
  }

  /* ---------- Jadikan poligon ---------- */
  function makePolygon(){
    var pts=st.points.filter(function(p){return p.lonlat;}).map(function(p){return p.lonlat.slice();});
    if(pts.length<3){message('Butuh minimal 3 titik yang valid untuk membentuk poligon.','err');return;}
    if(pts.length>3&&pts[0][0]===pts[pts.length-1][0]&&pts[0][1]===pts[pts.length-1][1])pts.pop();
    var ring=pts.concat([pts[0].slice()]);
    try{if(turf.booleanClockwise(ring))ring=ring.slice().reverse();}catch(_e){}
    var feature={type:'Feature',properties:{NAMA:'Bidang dari Input Koordinat SOBAT TARU',SUMBER:'Input koordinat manual',CRS_INPUT:crsLabel(activeCrs()),JUMLAH_TITIK:pts.length,__SOBAT_MEASURED:true},geometry:{type:'Polygon',coordinates:[ring]}};
    var warn='';
    try{var k=turf.kinks(feature);if(k&&k.features&&k.features.length)warn=' Garis batas saling berpotongan; periksa urutan titik.';}catch(_e2){}
    var tool=window.sobatTools;
    if(!tool||typeof tool.displayAndAnalyze!=='function'){message('Analisis bidang belum siap. Coba lagi sebentar.','err');return;}
    window.sobatSpatialSource={type:'digitized',fileName:''};
    try{tool.displayAndAnalyze({type:'FeatureCollection',features:[feature]},'Poligon dari '+pts.length+' titik koordinat');}
    catch(err){message(err.message||'Poligon belum dapat dibentuk.','err');return;}
    st.polygonMade=true;
    message('Poligon dibentuk dari '+pts.length+' titik dan sedang dianalisis.'+warn,warn?'warn':'ok');
    if(st.layer&&st.layer.bringToFront)st.layer.eachLayer(function(m){if(m.setZIndexOffset)m.setZIndexOffset(500);});
    if(isPhone())close();
    setTimeout(function(){try{window.sobatFitVisible&&window.sobatFitVisible(feature);}catch(_e3){}},isPhone()?360:120);
  }

  /* ---------- Buka / tutup ---------- */
  function open(){
    panel.hidden=false;st.open=true;document.body.classList.add('mc-open');
    if(!tools())message('Modul konversi koordinat sedang dimuat…','warn');
    render();
    if(!isPhone())setTimeout(function(){$('mcX').focus();},60);
  }
  function close(){panel.hidden=true;st.open=false;document.body.classList.remove('mc-open');map.closePopup();}
  function clearAll(){
    if(!st.points.length)return;
    st.points=[];st.polygonMade=false;render();message('Semua titik dihapus.','ok');
  }

  $('mcForm').addEventListener('submit',submitEntry);
  $('mcCrs').addEventListener('change',function(){st.crs=this.value;render();var bad=st.points.filter(function(p){return p.error;}).length;message(bad?bad+' titik tidak valid dengan sistem koordinat ini.':st.points.length?'Titik dihitung ulang dengan '+crsLabel(activeCrs())+'.':'',bad?'err':'ok');});
  $('mcPasteAdd').addEventListener('click',addPasted);
  $('mcClear').addEventListener('click',clearAll);
  $('mcZoom').addEventListener('click',zoomPoints);
  $('mcMakePolygon').addEventListener('click',makePolygon);
  panel.addEventListener('click',function(ev){
    if(ev.target.closest('[data-mc-close]')){close();return;}
    var del=ev.target.closest('[data-mc-del]');
    if(del){st.points.splice(Number(del.getAttribute('data-mc-del')),1);st.polygonMade=false;render();message('Titik dihapus; nomor titik disesuaikan.','ok');return;}
    var up=ev.target.closest('[data-mc-up]');
    if(up){var i=Number(up.getAttribute('data-mc-up'));if(i>0){var t=st.points[i];st.points[i]=st.points[i-1];st.points[i-1]=t;st.polygonMade=false;render();}return;}
    var go=ev.target.closest('[data-mc-go]');
    if(go){var p=st.points[Number(go.getAttribute('data-mc-go'))];if(p&&p.marker){showPoint(p.marker.getLatLng());p.marker.openPopup();highlight(Number(go.getAttribute('data-mc-go')));}}
  });
  document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&st.open&&!document.querySelector('.pt-shell.open,.print-setup-shell.open'))close();});
  syncLabels();

  window.sobatManualCoords={open:open,close:close,points:function(){return st.points.slice();}};
})();
