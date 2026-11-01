/*
 * SOBAT TARU — sesi analisis bidang, dialog KKPR, dan cek irisan bidang (mengikuti Bale Ruang NTB PR #1–#7).
 *  - Dialog Konfirmasi Koordinat KKPR: pilihan tabel berbentuk kartu, ringkasan (thumbnail, titik/bagian, luas, CRS),
 *    tabel angka per bagian, opsi "Semua tabel", footer tombol tetap terlihat.
 *  - Cek irisan bidang KKPR dengan koordinat dimohonkan atau PBT sertipikat (ZIP SHP/KML): luas irisan total & per
 *    bidang, nomor irisan di peta, jarak ke bidang terdekat; >500 m Cetak PDF dinonaktifkan.
 *  - Sesi bidang: hasil analisis poligon disimpan; klik titik tidak menghapusnya, ada "Tampilkan lagi hasil bidang"
 *    dan "Akhiri analisis & hapus bidang dari layar" (dua klik).
 *  - Tampilan: tanpa label/pin di atas bidang, glow tepi bidang digitasi saat pertama tampil, bidang digitasi tidak
 *    di-zoom otomatis, bidang upload/KKPR/explor dipaskan ke area peta yang tidak tertutup panel.
 */
(function(){
  'use strict';
  if(!window.L||!window.map||!window.sobatUx||typeof window.runAnalysis!=='function')return;
  var ux=window.sobatUx,tools=window.sobatTools||{};
  function $(id){return document.getElementById(id);}
  var esc=ux.esc,toast=function(text,duration){ux.showToast(text,duration);};
  function areaOf(input){return ux.areaOf(input&&input.type?input:{type:'Feature',properties:{},geometry:input});}
  function num(v,d){return Number(v).toLocaleString('id-ID',{maximumFractionDigits:d==null?2:d});}
  function fixed(v,d){return Number(v).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});}
  function fmtArea(a){a=a||0;return a>=10000?num(a/10000,4)+' ha':Math.round(a).toLocaleString('id-ID')+' m²';}
  function fmtPct(part,whole){if(!whole||!part)return '0%';var v=Math.min(100,part/whole*100);return (v<0.1?'<0,1':num(v,1))+'%';}
  function fmtDistance(d){if(!isFinite(d))return '—';if(d<1)return '< 1 m';return d<1000?Math.round(d).toLocaleString('id-ID')+' m':num(d/1000,2)+' km';}
  function polygonFeatures(geojson){
    var list=geojson&&geojson.type==='FeatureCollection'?geojson.features:geojson&&geojson.type==='Feature'?[geojson]:geojson?[{type:'Feature',properties:{},geometry:geojson}]:[];
    return (list||[]).filter(function(f){return f&&f.geometry&&/Polygon$/.test(f.geometry.type);});
  }
  function boxOf(input){try{return turf.bbox(input);}catch(_e){return [Infinity,Infinity,-Infinity,-Infinity];}}
  function boxesOverlap(a,b){return !(a[0]>b[2]||a[2]<b[0]||a[1]>b[3]||a[3]<b[1]);}
  function dissolve(input){var fc={type:'FeatureCollection',features:polygonFeatures(input)};return typeof window.sobatDissolveParts==='function'?window.sobatDissolveParts(fc):turf.flatten(fc).features;}

  /* =====================================================================
   * 1. Dialog Konfirmasi Koordinat KKPR
   * ===================================================================== */
  var parser=window.LontarKkprParser,kkpr=null,lastKkpr=null;
  var PALETTE=['#e0306b','#7c3aed','#0b8fd8','#d97706'];
  function shortName(section){var m=String(section||'').match(/disetujui|dimohon\w*/i);return m?m[0].charAt(0).toUpperCase()+m[0].slice(1).toLowerCase():String(section||'Tabel lain');}
  function crsInfo(crs){return crs==='EPSG:4326'?{name:'WGS 84',unit:'derajat',x:'Bujur (X)',y:'Lintang (Y)',digits:6}:crs==='EPSG:32750'?{name:'UTM 50S',unit:'meter',x:'Easting X (m)',y:'Northing Y (m)',digits:2}:{name:crs||'—',unit:'',x:'X / Easting',y:'Y / Northing',digits:3};}
  function ringsOf(feature){var g=feature.geometry||{},polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[],rings=[];polys.forEach(function(poly){(poly||[]).forEach(function(r){if(r&&r.length>2)rings.push(r);});});return rings;}
  function thumb(items){
    var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    items.forEach(function(it){ringsOf(it.feature).forEach(function(r){r.forEach(function(c){minX=Math.min(minX,c[0]);maxX=Math.max(maxX,c[0]);minY=Math.min(minY,c[1]);maxY=Math.max(maxY,c[1]);});});});
    if(!isFinite(minX))return '';
    var k=Math.cos((minY+maxY)/2*Math.PI/180),w=(maxX-minX)*k||1e-9,h=(maxY-minY)||1e-9,scale=52/Math.max(w,h),ox=(64-w*scale)/2,oy=(64-h*scale)/2;
    var px=function(c){return (ox+(c[0]-minX)*k*scale).toFixed(1);},py=function(c){return (oy+(maxY-c[1])*scale).toFixed(1);};
    var single=items.length===1&&ringsOf(items[0].feature).length===1;
    return '<svg class="kr-thumb" viewBox="0 0 64 64" aria-hidden="true">'+items.map(function(it,n){var rings=ringsOf(it.feature);return '<path fill-rule="evenodd" style="fill:'+it.color+'2e;stroke:'+it.color+(n?';stroke-dasharray:3 2':'')+'" d="'+rings.map(function(r){return r.map(function(c,m){return (m?'L':'M')+px(c)+' '+py(c);}).join(' ')+' Z';}).join(' ')+'"/>';}).join('')+
      (single?ringsOf(items[0].feature)[0].slice(0,-1).map(function(c){return '<circle cx="'+px(c)+'" cy="'+py(c)+'" r="1.8"/>';}).join(''):'')+'</svg>';
  }
  function tableRows(table,info,heading){
    var parts=parser.ringIndexes?parser.ringIndexes(table):[],partCount=parts.length?parts[parts.length-1]+1:1;
    return (heading?'<tr class="kr-group"><td colspan="3">'+heading+'</td></tr>':'')+table.rows.map(function(row,index){
      return (partCount>1&&(index===0||parts[index]!==parts[index-1])?'<tr class="kr-part"><td colspan="3">Bagian '+(parts[index]+1)+' dari '+partCount+'</td></tr>':'')+
        '<tr><td class="kr-no">'+esc(row.no||index+1)+'</td><td>'+fixed(row.x,info.digits)+'</td><td>'+fixed(row.y,info.digits)+'</td></tr>';
    }).join('');
  }
  var reviewModal=$('kkprToolModal'),reviewBody=$('kkprToolTable');
  function renderReview(){
    var tables=kkpr.tables,all=kkpr.selected<0,mainIndex=all?kkpr.preferred:kkpr.selected,table=tables[mainIndex],info=crsInfo(table.crs);
    var order=all?[mainIndex].concat(tables.map(function(t,i){return i;}).filter(function(i){return i!==mainIndex;})):[mainIndex];
    var items=order.map(function(i,n){return {index:i,table:tables[i],feature:parser.toFeature(tables[i]),color:PALETTE[n%PALETTE.length]};});
    kkpr.showAll=all;kkpr.result=table;kkpr.feature=items[0].feature;
    kkpr.allFeatures=items.map(function(it){var f=parser.toFeature(it.table);f.properties.nama=it.table.section||('Tabel '+(it.index+1));return f;});
    var html='<div class="kr-summary"><span class="kr-file"><i class="fas fa-file-pdf" aria-hidden="true"></i>'+esc(kkpr.fileName)+'</span><span class="kr-count">'+tables.length+' tabel koordinat ditemukan</span></div>';
    if(tables.length>1)html+='<p class="kr-label">Pilih tabel yang dijadikan poligon</p><div class="kr-options" role="radiogroup" aria-label="Tabel koordinat">'+tables.map(function(t,i){
        var on=i===kkpr.selected,ti=crsInfo(t.crs);
        return '<button type="button" role="radio" aria-checked="'+on+'" class="kr-option'+(on?' active':'')+'" data-kr-table="'+i+'"><span class="kr-radio" aria-hidden="true"></span><span class="kr-option-text"><b>Tabel '+(i+1)+' · '+esc(t.section||'Koordinat')+'</b><small>'+t.rows.length+' titik · '+esc(ti.name)+'</small></span>'+(/DISETUJUI/i.test(t.section||'')?'<span class="kr-tag">Disetujui</span>':'')+'</button>';
      }).join('')+
      '<button type="button" role="radio" aria-checked="'+all+'" class="kr-option kr-option-all'+(all?' active':'')+'" data-kr-table="-1"><span class="kr-radio" aria-hidden="true"></span><span class="kr-option-text"><b>Semua tabel ('+tables.length+')</b><small>Tampilkan sekaligus dan langsung cek irisan '+esc(shortName(tables[kkpr.preferred].section).toLowerCase())+' terhadap tabel lain</small></span><span class="kr-tag kr-tag-all">Bandingkan</span></button></div>';
    var parts=items[0].feature.properties.jumlah_bagian||1;
    var stats=all?items.map(function(it,n){return '<div><span><i class="kr-dot" style="background:'+it.color+'"></i>'+esc(shortName(it.table.section))+(n===0?' (dianalisis)':'')+'</span><b>'+esc(fmtArea(areaOf(it.feature)))+'</b><small>'+it.table.rows.length+' titik'+(it.feature.properties.jumlah_bagian>1?' · '+it.feature.properties.jumlah_bagian+' bagian':'')+'</small></div>';}).join('')
      :'<div><span>Jumlah titik</span><b>'+table.rows.length+'</b>'+(parts>1?'<small>'+parts+' bagian poligon</small>':'')+'</div><div><span>Luas poligon</span><b>'+esc(fmtArea(areaOf(items[0].feature)))+'</b></div><div><span>Sistem koordinat</span><b>'+esc(info.name)+'</b><small>'+esc(table.crs+(info.unit?' · '+info.unit:''))+'</small></div>';
    html+='<div class="kr-preview"><div class="kr-head">'+thumb(items)+'<div class="kr-stats'+(all?' kr-stats-all':'')+'">'+stats+'</div></div>'+
      '<div class="kr-table-wrap"><table class="kr-table"><thead><tr><th class="kr-no">No.</th><th>'+esc(info.x)+'</th><th>'+esc(info.y)+'</th></tr></thead><tbody>'+
      items.map(function(it){return tableRows(it.table,crsInfo(it.table.crs),all?'<i class="kr-dot" style="background:'+it.color+'"></i>Tabel '+(it.index+1)+' · '+esc(it.table.section||'Koordinat'):'');}).join('')+
      '</tbody></table></div><p class="kr-note"><i class="fas fa-info-circle" aria-hidden="true"></i><span>'+(all?'Tabel '+esc(shortName(table.section).toLowerCase())+' dianalisis sebagai bidang utama; tabel lain ditampilkan sebagai pembanding (garis ungu putus-putus) dan irisannya langsung dihitung. Pembanding bisa diganti ke PBT sertipikat di panel analisis.':
        'Periksa urutan dan nilai titik terhadap PDF sebelum melanjutkan. '+(parts>1?'Tabel ini memuat '+parts+' bagian poligon: setiap bagian ditutup dengan mengulang titik awalnya, lalu bagian berikutnya dimulai.':'Poligon ditutup otomatis dari titik terakhir ke titik pertama.'))+'</span></p></div>';
    reviewBody.innerHTML=html;
  }
  window.sobatKkprReview=function(tables,fileName){
    tables=Array.isArray(tables)?tables:[tables];
    var preferred=0;tables.some(function(t,i){if(/DISETUJUI/i.test(t.section||'')){preferred=i;return true;}return false;});
    kkpr={tables:tables,selected:preferred,preferred:preferred,showAll:false,fileName:fileName||'PDF KKPR'};
    renderReview();
    reviewModal.classList.add('open');
    var scroller=reviewModal.querySelector('.tool-modal-body');if(scroller)scroller.scrollTop=0;
    toast(tables.length>1?tables.length+' tabel koordinat ditemukan. Tabel disetujui dipilih otomatis; periksa sebelum dianalisis.':'Koordinat ditemukan. Periksa sebelum dianalisis.',4200);
  };
  if(reviewBody)reviewBody.addEventListener('click',function(event){
    var option=event.target.closest('[data-kr-table]');if(!option||!kkpr)return;
    kkpr.selected=Number(option.getAttribute('data-kr-table'));renderReview();
    var active=reviewBody.querySelector('.kr-option.active');if(active)active.focus();
  });
  var downloadButton=$('kkprToolDownload'),analyzeButton=$('kkprToolAnalyze');
  if(downloadButton)downloadButton.addEventListener('click',function(){
    if(!kkpr||!tools.geojsonToKml)return;
    var features=kkpr.showAll&&kkpr.allFeatures?kkpr.allFeatures:[kkpr.feature];
    tools.saveFile(tools.geojsonToKml({type:'FeatureCollection',features:features}),kkpr.fileName.replace(/\.pdf$/i,'')+'_'+(kkpr.showAll?'SEMUA_TABEL':String(shortName(kkpr.result.section)).toUpperCase())+'.kml','application/vnd.google-earth.kml+xml');
    toast(kkpr.showAll?'KML semua tabel koordinat berhasil dibuat.':'KML koordinat '+shortName(kkpr.result.section).toLowerCase()+' berhasil dibuat.');
  });
  if(analyzeButton)analyzeButton.addEventListener('click',function(){
    if(!kkpr||!tools.displayAndAnalyze)return;
    lastKkpr=kkpr;reviewModal.classList.remove('open');
    window.sobatSpatialSource={type:'kkpr',fileName:kkpr.fileName};
    try{tools.displayAndAnalyze({type:'FeatureCollection',features:[kkpr.feature]},kkpr.fileName);}catch(error){toast(error.message||'Bidang KKPR tidak dapat ditampilkan.');}
  });

  /* =====================================================================
   * 2. Cek irisan bidang (sandingan) — koordinat lain di PDF yang sama atau PBT sertipikat
   * ===================================================================== */
  // Ambang "berdekatan" 500 m: kedua bidang masih muat dalam satu peta A4 berskala detail sehingga PDF tetap bermakna.
  var NEAR_LIMIT=500,TABLE_LIMIT=50,MAP_LIMIT=4000,PRINT_LIMIT=400,LABEL_LIMIT=30,MIN_AREA=1;
  var PBT_COMPARE={kind:'pbt',label:'PBT',full:'PBT sertipikat',color:'#f5b800',fill:'#ffd60a'};
  var pbt={subjectFeature:null,subjectName:'',subject:'KKPR',features:[],result:null,layer:null,fileName:'',crsNote:'',dismissed:false,busy:'',error:'',visible:true,token:0,compare:null,others:[]};
  var pbtRenderer=L.canvas({padding:.5});
  function cmp(){return pbt.compare||PBT_COMPARE;}
  function low(v){return v==='KKPR'||v==='PBT'?v:String(v).toLowerCase();}
  function title(){var c=cmp();return 'Penyandingan '+pbt.subject+' dan '+(c.kind==='pbt'?'PBT':c.label);}
  var pbtInput=document.createElement('input');pbtInput.type='file';pbtInput.accept='.zip,.kml';pbtInput.hidden=true;document.body.appendChild(pbtInput);
  pbtInput.addEventListener('change',function(){var file=this.files&&this.files[0];this.value='';if(file)pbtHandleFile(file);});
  function findProperty(props,names){var keys=Object.keys(props||{}),wanted=names.map(function(n){return n.replace(/[^A-Z0-9]/g,'');});for(var i=0;i<wanted.length;i++){var key=keys.filter(function(k){return String(k).toUpperCase().replace(/[^A-Z0-9]/g,'')===wanted[i];})[0];if(key!=null&&props[key]!=null&&String(props[key]).trim()!=='')return String(props[key]).trim();}return '';}
  function pbtBox(f){if(!f.__pbtBox)f.__pbtBox=boxOf(f);return f.__pbtBox;}
  function pbtMeta(f,index){var p=f.properties||{},nib=findProperty(p,['NIB','NOMOR NIB','NOMORNIB','NO NIB','NOMOR IDENTIFIKASI BIDANG']),hak=findProperty(p,['NOMOR HAK','NOMORHAK','NO HAK','NOHAK','NO_HAK','HAK_NO','NOMOR SERTIPIKAT','NO SERTIPIKAT']),tipe=findProperty(p,['TIPEHAK','TIPE HAK','JENISHAK','JENIS HAK','STATUS HAK','HAK']);return {nib:nib,hak:hak,tipe:tipe,label:nib?'NIB '+nib:hak?'No. hak '+hak:'Bidang PBT #'+(index+1)};}
  // SHP tanpa .prj berkoordinat meter dibaca sebagai TM-3 (Zona 50.1 Lombok, 50.2 Sumbawa).
  function tm3(easting,northing,zone){var central=zone==='50.2'?118.5:115.5,a=6378137,f=1/298.257223563,e2=f*(2-f),ep2=e2/(1-e2),k0=.9999,x=(easting-200000)/k0,y=(northing-1500000)/k0,mu=y/(a*(1-e2/4-3*e2*e2/64-5*e2*e2*e2/256)),e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2)),fp=mu+(3*e1/2-27*Math.pow(e1,3)/32)*Math.sin(2*mu)+(21*e1*e1/16-55*Math.pow(e1,4)/32)*Math.sin(4*mu)+(151*Math.pow(e1,3)/96)*Math.sin(6*mu)+(1097*Math.pow(e1,4)/512)*Math.sin(8*mu),sin=Math.sin(fp),cos=Math.cos(fp),tan=Math.tan(fp),C=ep2*cos*cos,T=tan*tan,N=a/Math.sqrt(1-e2*sin*sin),R=a*(1-e2)/Math.pow(1-e2*sin*sin,1.5),D=x/N,lat=fp-(N*tan/R)*(D*D/2-(5+3*T+10*C-4*C*C-9*ep2)*Math.pow(D,4)/24+(61+90*T+298*C+45*T*T-252*ep2-3*C*C)*Math.pow(D,6)/720),lng=central*Math.PI/180+(D-(1+2*T+C)*Math.pow(D,3)/6+(5-2*C+28*T-3*C*C+8*ep2+24*T*T)*Math.pow(D,5)/120)/cos;return [lng*180/Math.PI,lat*180/Math.PI];}
  function mapCoords(coords,fn){return typeof coords[0]==='number'?fn(coords):coords.map(function(c){return mapCoords(c,fn);});}
  function fixCrs(features){
    pbt.crsNote='';var sample=null;
    features.some(function(f){var c=f.geometry.coordinates;while(Array.isArray(c)&&Array.isArray(c[0]))c=c[0];if(Array.isArray(c)&&isFinite(c[0])&&isFinite(c[1])){sample=c;return true;}return false;});
    if(!sample||(Math.abs(sample[0])<=180&&Math.abs(sample[1])<=90))return features;
    if(sample[0]>=100000&&sample[0]<=900000&&sample[1]>=8000000&&sample[1]<=10000000&&parser&&parser.utm50SToLonLat){
      features.forEach(function(f){f.geometry={type:f.geometry.type,coordinates:mapCoords(f.geometry.coordinates,function(c){return parser.utm50SToLonLat(c[0],c[1]);})};delete f.__pbtBox;});
      pbt.crsNote='SHP tanpa .prj dibaca sebagai UTM Zona 50S.';return features;
    }
    if(!(sample[0]>=1000&&sample[0]<=400000&&sample[1]>=200000&&sample[1]<=1500000))throw new Error('Sistem koordinat SHP PBT tidak dikenali. Sertakan berkas .prj di dalam ZIP.');
    var kb=pbtBox(pbt.subjectFeature),zone=(kb[0]+kb[2])/2<117?'50.1':'50.2';
    features.forEach(function(f){f.geometry={type:f.geometry.type,coordinates:mapCoords(f.geometry.coordinates,function(c){return tm3(c[0],c[1],zone);})};delete f.__pbtBox;});
    pbt.crsNote='SHP tanpa .prj dibaca sebagai TM-3 Zona '+zone+'.';return features;
  }
  function readCompareFile(file){
    var ext=(file.name.split('.').pop()||'').toLowerCase();
    if(ext!=='zip'&&ext!=='kml')return Promise.reject(new Error('Gunakan ZIP Shapefile PBT (berisi .shp, .shx, .dbf, .prj) atau KML.'));
    return (ext==='kml'?file.text():file.arrayBuffer()).then(function(raw){
      if(ext==='kml'){if(!tools.parseKml)throw new Error('Pembaca KML tidak tersedia.');return tools.parseKml(raw);}
      if(typeof window.shp!=='function')throw new Error('Pembaca SHP tidak tersedia.');return window.shp(raw);
    });
  }
  // Irisan dua bidang: bagian-bagian keduanya disatukan (union) dulu, lalu dipotong per pasangan bagian dan dijumlahkan.
  function intersection(subjectParts,feature){
    var targetParts=dissolve(feature),coords=[],total=0;
    subjectParts.forEach(function(part){
      var pb=boxOf(part);
      targetParts.forEach(function(target){
        if(!boxesOverlap(pb,boxOf(target)))return;
        try{var hit=turf.intersect(part,target);if(!hit)return;var a=areaOf(hit);if(a<=0)return;total+=a;
          if(hit.geometry.type==='Polygon')coords.push(hit.geometry.coordinates);else if(hit.geometry.type==='MultiPolygon')coords=coords.concat(hit.geometry.coordinates);}catch(_e){}
      });
    });
    return total>0?{area:total,geometry:{type:'MultiPolygon',coordinates:coords}}:null;
  }
  function unionArea(rows){
    var sum=rows.reduce(function(s,r){return s+r.area;},0);
    if(rows.length<2)return sum;
    if(rows.length<=400){try{var acc=null;rows.forEach(function(r){var f={type:'Feature',properties:{},geometry:r.geometry};acc=acc?turf.union(acc,f):f;});var a=acc?areaOf(acc):0;if(a>0&&a<=sum*1.001+1)return a;}catch(_e){}}
    return sum;
  }
  // Jarak tepi-ke-tepi dalam meter (proyeksi lokal ekuirektangular).
  function pointSeg(p,a,b){var dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l:0;t=Math.max(0,Math.min(1,t));var x=a[0]+t*dx-p[0],y=a[1]+t*dy-p[1];return Math.sqrt(x*x+y*y);}
  function ringsProjected(geometry,proj){var polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[],out=[];polys.forEach(function(poly){(poly||[]).forEach(function(ring){if(ring&&ring.length>1)out.push(ring.map(proj));});});return out;}
  function ringsDistance(A,B){var best=Infinity;A.forEach(function(ra){B.forEach(function(rb){for(var i=0;i<ra.length-1;i++)for(var j=0;j<rb.length-1;j++){var d=Math.min(pointSeg(ra[i],rb[j],rb[j+1]),pointSeg(ra[i+1],rb[j],rb[j+1]),pointSeg(rb[j],ra[i],ra[i+1]),pointSeg(rb[j+1],ra[i],ra[i+1]));if(d<best)best=d;}});});return best;}
  function nearest(subject,features){
    var kb=pbtBox(subject),lat0=(kb[1]+kb[3])/2,lng0=(kb[0]+kb[2])/2,kx=111320*Math.cos(lat0*Math.PI/180),ky=110574,proj=function(c){return [(c[0]-lng0)*kx,(c[1]-lat0)*ky];},A=ringsProjected(subject.geometry,proj),best={distance:Infinity,feature:null,index:-1};
    features.map(function(f,i){var b=pbtBox(f),dx=Math.max(0,b[0]-kb[2],kb[0]-b[2])*kx,dy=Math.max(0,b[1]-kb[3],kb[1]-b[3])*ky;return {f:f,i:i,d:Math.sqrt(dx*dx+dy*dy)};}).sort(function(a,b){return a.d-b.d;}).some(function(c){if(c.d>=best.distance)return true;var d=ringsDistance(A,ringsProjected(c.f.geometry,proj));if(d<best.distance)best={distance:d,feature:c.f,index:c.i};return false;});
    return best;
  }
  function compute(subject,features){
    var parts=dissolve(subject),sBox=pbtBox(subject),sArea=parts.reduce(function(s,p){return s+areaOf(p);},0),rows=[];
    features.forEach(function(f,i){if(!boxesOverlap(pbtBox(f),sBox))return;var hit=intersection(parts,f);if(!hit||hit.area<MIN_AREA)return;rows.push({feature:f,index:i,meta:pbtMeta(f,i),area:hit.area,pbtArea:areaOf(f),geometry:hit.geometry});});
    rows.sort(function(a,b){return b.area-a.area;});rows.forEach(function(r,i){r.n=i+1;});
    var result={subjectArea:sArea,subjectBox:sBox,rows:rows,total:Math.min(unionArea(rows),sArea),count:features.length,status:'intersect',distance:0,nearest:null};
    if(!rows.length){var near=nearest(subject,features);result.distance=near.distance;result.nearest=near.feature?{feature:near.feature,meta:pbtMeta(near.feature,near.index),area:areaOf(near.feature)}:null;result.status=near.distance<=NEAR_LIMIT?'near':'far';}
    if(cmp().kind==='table'){var label={nib:'',hak:'',tipe:'',label:'Koordinat '+cmp().label.toLowerCase()};rows.forEach(function(r){r.meta=label;});if(result.nearest)result.nearest.meta=label;}
    return result;
  }
  function extentBounds(){var r=pbt.result,b=L.geoJSON(pbt.subjectFeature).getBounds();if(!r)return b;var extra=r.rows.length?r.rows.map(function(x){return x.feature;}):r.nearest?[r.nearest.feature]:[];if(extra.length){var eb=L.geoJSON({type:'FeatureCollection',features:extra}).getBounds();if(eb.isValid())b.extend(eb);}return b;}
  function clearLayer(){if(pbt.layer){map.removeLayer(pbt.layer);pbt.layer=null;}}
  function bringSubjectFront(){if(window.uploadLayer&&map.hasLayer(window.uploadLayer)&&window.uploadLayer.bringToFront)window.uploadLayer.bringToFront();}
  function draw(){
    clearLayer();var r=pbt.result;if(!r)return;
    var kb=r.subjectBox,pad=NEAR_LIMIT/111000,view=[kb[0]-pad,kb[1]-pad,kb[2]+pad,kb[3]+pad],hits=r.rows.map(function(x){return x.feature;}),near=r.nearest&&r.nearest.feature,group=L.featureGroup(),c=cmp();
    var shown=pbt.features.filter(function(f){return hits.indexOf(f)>=0||f===near||boxesOverlap(pbtBox(f),view);}).slice(0,MAP_LIMIT);if(near&&shown.indexOf(near)<0)shown.push(near);
    L.geoJSON({type:'FeatureCollection',features:shown},{renderer:pbtRenderer,style:function(f){var hit=hits.indexOf(f)>=0||f===near;return {color:c.color,weight:hit?2.6:1.5,opacity:1,dashArray:hit&&c.kind==='pbt'?null:'6 4',fillColor:c.fill,fillOpacity:hit?.14:.05};},
      onEachFeature:function(f,layer){var i=pbt.features.indexOf(f),meta=c.kind==='table'?{label:pbt.fileName,nib:'',hak:'',tipe:''}:pbtMeta(f,i);layer.bindPopup('<strong>'+esc(c.kind==='table'?'Koordinat '+c.label.toLowerCase():'Bidang PBT sertipikat')+'</strong><br>'+esc(meta.label)+(meta.hak&&meta.nib?'<br>No. hak: '+esc(meta.hak):'')+(meta.tipe?'<br>Tipe hak: '+esc(meta.tipe):'')+'<br>Luas: '+esc(fmtArea(areaOf(f))));}}).addTo(group);
    if(r.rows.length)L.geoJSON({type:'FeatureCollection',features:r.rows.map(function(x){return {type:'Feature',properties:{},geometry:x.geometry};})},{renderer:pbtRenderer,interactive:false,style:{color:'#0057ff',weight:1.4,opacity:1,fillColor:'#00b3ff',fillOpacity:.5}}).addTo(group);
    if(c.kind==='pbt')r.rows.slice(0,LABEL_LIMIT).forEach(function(x){var center=L.geoJSON(x.geometry).getBounds().getCenter();L.marker(center,{interactive:false,keyboard:false,icon:L.divIcon({className:'kp-map-num',html:String(x.n),iconSize:[20,20],iconAnchor:[10,10]})}).addTo(group);});
    pbt.layer=group;if(pbt.visible&&!(session&&session.displaced))group.addTo(map);bringSubjectFront();
  }
  function blocked(){return !!(pbt.result&&pbt.result.status==='far'&&pbt.subjectFeature);}
  function syncPrint(){
    var body=$('stResultBody');if(!body)return;
    body.querySelectorAll('[data-st-print]').forEach(function(button){
      if(blocked()&&!(session&&session.displaced)){button.disabled=true;button.title='Cetak PDF dinonaktifkan: pembanding terlalu jauh dari bidang '+pbt.subject;button.dataset.pbtBlocked='1';}
      else if(button.dataset.pbtBlocked){delete button.dataset.pbtBlocked;button.disabled=false;button.title='';}
    });
  }
  function btn(action,icon,label,cls){return '<button type="button" class="kp-btn'+(cls?' '+cls:'')+'" data-pbt="'+action+'"><i class="fas '+icon+'" aria-hidden="true"></i>'+esc(label)+'</button>';}
  function stat(label,value,sub,cls){return '<div class="kp-stat'+(cls?' '+cls:'')+'"><span>'+esc(label)+'</span><b>'+esc(value)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</div>';}
  function pbtHtml(){
    if(!pbt.subjectFeature)return '';
    var r=pbt.result,c=cmp(),subj=pbt.subject,html='';
    if(pbt.busy)return '<section class="kp-card kp-ask"><div class="kp-head"><span class="kp-ico"><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i></span><div class="kp-title"><strong>Menyandingkan…</strong><small>'+esc(pbt.busy)+'</small></div></div></section>';
    if(!r){
      if(pbt.dismissed)return '<button type="button" class="kp-reopen" data-pbt="ask"><i class="fas fa-object-group" aria-hidden="true"></i>Cek irisan bidang '+esc(low(subj))+'</button>';
      var choices=pbt.others.map(function(o,i){return '<button type="button" class="kp-choice" data-pbt="table" data-index="'+i+'"><span class="kp-choice-ico tbl"><i class="fas fa-table" aria-hidden="true"></i></span><span><b>Koordinat '+esc(o.short.toLowerCase())+'</b><small>Tabel lain di PDF yang sama • '+o.count+' titik</small></span><i class="fas fa-chevron-right" aria-hidden="true"></i></button>';}).join('')+
        '<button type="button" class="kp-choice" data-pbt="pick"><span class="kp-choice-ico pbt"><i class="fas fa-file-archive" aria-hidden="true"></i></span><span><b>PBT sertipikat</b><small>Upload ZIP SHP (.shp, .shx, .dbf, .prj) atau KML</small></span><i class="fas fa-chevron-right" aria-hidden="true"></i></button>';
      return '<section class="kp-card kp-ask"><div class="kp-head"><span class="kp-ico"><i class="fas fa-object-group" aria-hidden="true"></i></span><div class="kp-title"><strong>Cek irisan bidang '+esc(low(subj))+'?</strong><small>Pilih pembanding untuk menghitung luas irisannya.</small></div></div>'+
        (pbt.error?'<p class="kp-error"><i class="fas fa-exclamation-circle" aria-hidden="true"></i>'+esc(pbt.error)+'</p>':'')+'<div class="kp-choices">'+choices+'</div><div class="kp-acts">'+btn('later','fa-times','Nanti saja','ghost')+'</div></section>';
    }
    var isPbt=c.kind==='pbt',other=isPbt?'PBT':c.label,badge=r.status==='intersect'?['in','Beririsan']:r.status==='near'?['warn','Tidak beririsan']:['far','Terlalu jauh'];
    var src=isPbt?esc(pbt.fileName)+' • '+r.count.toLocaleString('id-ID')+' bidang PBT dibaca':'Dua tabel koordinat dari '+esc(pbt.subjectName);
    html+='<section class="kp-card kp-'+badge[0]+'"><div class="kp-head"><span class="kp-ico"><i class="fas fa-object-group" aria-hidden="true"></i></span><div class="kp-title"><strong>'+esc(title())+'</strong><small>'+src+'</small></div><span class="kp-badge '+badge[0]+'">'+badge[1]+'</span></div>';
    if(r.status==='intersect'){
      var outside=Math.max(0,r.subjectArea-r.total),coverage=Math.min(100,r.subjectArea?r.total/r.subjectArea*100:0);
      if(isPbt)html+='<div class="kp-stats">'+stat('Luas irisan',fmtArea(r.total),fmtPct(r.total,r.subjectArea)+' dari luas '+low(subj),'hl')+stat('Luas '+subj,fmtArea(r.subjectArea))+stat(subj+' di luar PBT',fmtArea(outside),fmtPct(outside,r.subjectArea))+stat('Bidang PBT beririsan',r.rows.length.toLocaleString('id-ID'),'dari '+r.count.toLocaleString('id-ID')+' bidang')+'</div>';
      else{var oArea=r.rows[0].pbtArea,oOut=Math.max(0,oArea-r.total);html+='<div class="kp-stats">'+stat('Luas irisan',fmtArea(r.total),fmtPct(r.total,r.subjectArea)+' dari luas '+low(subj),'hl')+stat('Luas '+subj,fmtArea(r.subjectArea))+stat(subj+' di luar '+other,fmtArea(outside),fmtPct(outside,r.subjectArea))+stat('Luas '+other,fmtArea(oArea),fmtArea(oOut)+' tidak masuk '+low(subj)+' ('+fmtPct(oOut,oArea)+')')+'</div>';}
      html+='<div class="kp-bar" role="img" aria-label="'+esc(fmtPct(r.total,r.subjectArea))+' luas '+esc(low(subj))+' beririsan dengan '+esc(other)+'"><i style="width:'+coverage.toFixed(2)+'%"></i></div><div class="kp-bar-legend"><span><i class="in"></i>Beririsan dengan '+esc(low(other))+'</span><span><i></i>Di luar '+esc(low(other))+'</span></div>';
      if(isPbt)html+='<div class="kp-table-wrap"><table class="kp-table"><thead><tr><th>No.</th><th>Bidang PBT</th><th>Irisan</th><th title="Persentase luas bidang PBT yang masuk bidang '+esc(low(subj))+'">% bidang</th></tr></thead><tbody>'+r.rows.slice(0,TABLE_LIMIT).map(function(x){var sub=[x.meta.nib&&x.meta.hak?'No. hak '+x.meta.hak:'',x.meta.tipe,'Luas '+fmtArea(x.pbtArea)].filter(Boolean).join(' • ');return '<tr><td class="kp-n"><span>'+x.n+'</span></td><td><b>'+esc(x.meta.label)+'</b><small>'+esc(sub)+'</small></td><td class="kp-r">'+esc(fmtArea(x.area))+'</td><td class="kp-r">'+esc(fmtPct(x.area,x.pbtArea))+'</td></tr>';}).join('')+'</tbody></table></div>'+(r.rows.length>TABLE_LIMIT?'<p class="kp-hint">+'+(r.rows.length-TABLE_LIMIT).toLocaleString('id-ID')+' bidang lain tidak ditampilkan.</p>':'');
    }else{
      var nm=r.nearest?r.nearest.meta.label:'—';
      html+='<div class="kp-stats">'+stat('Jarak '+other+' terdekat',fmtDistance(r.distance),nm,r.status==='far'?'bad':'hl')+stat('Luas irisan','0 m²','tidak ada bagian yang beririsan')+stat('Luas '+subj,fmtArea(r.subjectArea))+(isPbt?stat('Bidang PBT dibaca',r.count.toLocaleString('id-ID')):stat('Luas '+other,fmtArea(r.nearest?r.nearest.area:0)))+'</div>';
      html+=r.status==='near'?'<p class="kp-msg warn"><i class="fas fa-info-circle" aria-hidden="true"></i><span><b>Bidang '+esc(low(subj))+' tidak beririsan dengan '+esc(isPbt?'PBT mana pun':other)+'.</b> Jaraknya ± '+esc(fmtDistance(r.distance))+' dari batas '+esc(low(subj))+'. Masih dalam radius '+NEAR_LIMIT+' m, jadi Cetak PDF tetap tersedia dan memuat peta keduanya.</span></p>'
        :'<p class="kp-msg bad"><i class="fas fa-ban" aria-hidden="true"></i><span><b>Posisi '+esc(other)+' terlalu jauh (± '+esc(fmtDistance(r.distance))+').</b> Melebihi batas '+NEAR_LIMIT+' m, sehingga keduanya tidak dapat disajikan dalam satu peta yang bermakna dan Cetak PDF dinonaktifkan. '+(isPbt?'Periksa kembali apakah SHP PBT ini memang untuk lokasi tersebut, atau tekan <i>Hapus</i> untuk mencetak laporan '+esc(low(subj))+' saja.':'Tekan <i>Hapus</i> untuk mencetak laporan '+esc(low(subj))+' saja.')+'</span></p>';
    }
    if(pbt.crsNote&&isPbt)html+='<p class="kp-hint"><i class="fas fa-exclamation-triangle" aria-hidden="true"></i> '+esc(pbt.crsNote)+'</p>';
    html+='<div class="kp-acts"><label class="kp-switch"><input type="checkbox" data-pbt-visible'+(pbt.visible?' checked':'')+'><i aria-hidden="true"></i><span>Tampilkan '+esc(isPbt?'PBT':'koordinat '+other.toLowerCase())+' di peta</span></label>'+btn('zoom','fa-search-plus',r.status==='far'?'Lihat lokasi '+other:'Perbesar')+btn('ask','fa-exchange-alt','Ganti pembanding')+btn('remove','fa-trash-alt','Hapus','ghost')+'</div>';
    html+='<p class="kp-hint">Luas dihitung dari geometri (UTM 50S) dan dapat sedikit berbeda dengan luas tertulis di '+(isPbt?'sertipikat':'PDF KKPR')+'.</p></section>';
    return html;
  }
  function pbtBoxEl(){
    var body=$('stResultBody');if(!body)return null;
    var box=$('kkprPbtBox');
    if(!box){box=document.createElement('div');box.id='kkprPbtBox';box.setAttribute('aria-live','polite');box.addEventListener('click',onPbtClick);box.addEventListener('change',onPbtChange);}
    var anchor=body.querySelector('.st-actions-sub')||body.querySelector('.st-actions');
    if(!anchor)return null;
    if(box.previousSibling!==anchor)anchor.parentNode.insertBefore(box,anchor.nextSibling);
    return box;
  }
  function renderPbt(){
    var box=$('kkprPbtBox');
    var show=pbt.subjectFeature&&session&&!session.displaced&&session.kind==='kkpr';
    if(!show){if(box){box.hidden=true;box.innerHTML='';}return;}
    box=pbtBoxEl();if(!box)return;box.hidden=false;box.innerHTML=pbtHtml();syncPrint();
  }
  function clearResult(){pbt.token++;pbt.result=null;pbt.features=[];pbt.fileName='';pbt.crsNote='';pbt.error='';pbt.compare=null;clearLayer();syncPrint();}
  function fitPbt(){fitBoundsVisible(extentBounds(),18);}
  function onPbtClick(event){
    var button=event.target.closest('[data-pbt]');if(!button)return;var action=button.getAttribute('data-pbt');
    if(action==='pick'){if(!pbt.busy)pbtInput.click();}
    else if(action==='table')compareTable(Number(button.getAttribute('data-index')),true);
    else if(action==='ask'){clearResult();pbt.dismissed=false;renderPbt();}
    else if(action==='later'){pbt.dismissed=true;pbt.error='';renderPbt();}
    else if(action==='zoom'){if(!pbt.visible){pbt.visible=true;if(pbt.layer)pbt.layer.addTo(map);bringSubjectFront();renderPbt();}fitPbt();}
    else if(action==='remove'){clearResult();pbt.dismissed=true;renderPbt();toast('Penyandingan dihapus.');}
  }
  function onPbtChange(event){
    var input=event.target.closest('[data-pbt-visible]');if(!input)return;pbt.visible=input.checked;
    if(pbt.layer){if(input.checked){pbt.layer.addTo(map);bringSubjectFront();}else map.removeLayer(pbt.layer);}
  }
  function applyCompare(features,fileName,compare,announce){
    pbt.compare=compare;pbt.features=features;pbt.fileName=fileName;
    var result=compute(pbt.subjectFeature,features);pbt.result=result;pbt.busy='';pbt.visible=true;draw();renderPbt();
    if(result.status!=='far')fitPbt();
    if(announce){var o=compare.kind==='pbt'?'PBT':compare.label.toLowerCase();toast(result.status==='intersect'?'Irisan '+low(pbt.subject)+' dan '+o+': '+fmtArea(result.total)+' ('+fmtPct(result.total,result.subjectArea)+').':result.status==='near'?'Tidak beririsan. Jarak ± '+fmtDistance(result.distance)+'.':o+' terlalu jauh (± '+fmtDistance(result.distance)+'). Cetak PDF dinonaktifkan.',5200);}
  }
  function compareTable(index,announce){
    var o=pbt.others[index];if(!o)return;pbt.token++;pbt.error='';pbt.crsNote='';
    applyCompare([{type:'Feature',properties:{nama:o.name},geometry:o.feature.geometry}],o.name,{kind:'table',label:o.short,full:'koordinat '+o.short.toLowerCase(),color:'#7c3aed',fill:'#a78bfa'},announce);
  }
  function pbtHandleFile(file){
    if(!pbt.subjectFeature)return;var token=++pbt.token;pbt.error='';pbt.busy='Membaca '+file.name+'…';renderPbt();
    readCompareFile(file).then(function(data){
      if(token!==pbt.token)return;
      var features=fixCrs(polygonFeatures({type:'FeatureCollection',features:[].concat(data).reduce(function(list,item){return list.concat(item&&item.type==='FeatureCollection'?item.features:item&&item.type==='Feature'?[item]:[]);},[])}));
      if(!features.length)throw new Error('Tidak ada poligon bidang di dalam '+file.name+'.');
      pbt.busy='Menghitung irisan dengan '+features.length.toLocaleString('id-ID')+' bidang PBT…';renderPbt();
      return new Promise(function(resolve){setTimeout(resolve,40);}).then(function(){if(token!==pbt.token)return;applyCompare(features,file.name,PBT_COMPARE,true);});
    }).catch(function(error){if(token!==pbt.token)return;pbt.busy='';pbt.result=null;pbt.compare=null;pbt.error=(error&&error.message)||'SHP PBT gagal dibaca.';renderPbt();toast(pbt.error);});
  }
  function resetPbt(feature,name,subject,others){clearResult();pbt.subjectFeature=feature||null;pbt.subjectName=name||'';pbt.subject=subject||'KKPR';pbt.others=others||[];pbt.dismissed=false;pbt.busy='';pbt.visible=true;}

  // Data laporan PDF: halaman peta penyandingan + bagian ringkasan (dipakai js/print-report.js). Null bila tidak ada atau terlalu jauh.
  window.sobatPbtPrintData=function(){
    var r=pbt.result;if(!r||!pbt.subjectFeature||r.status==='far'||!session||session.displaced)return null;
    var c=cmp(),isPbt=c.kind==='pbt',other=isPbt?'PBT':c.label,subj=pbt.subject,hits=r.rows.map(function(x){return x.feature;}),near=r.nearest&&r.nearest.feature,focus=hits.length?hits:near?[near]:[],kb=r.subjectBox,box=kb.slice();
    focus.forEach(function(f){var b=pbtBox(f);box=[Math.min(box[0],b[0]),Math.min(box[1],b[1]),Math.max(box[2],b[2]),Math.max(box[3],b[3])];});
    var px=Math.max((box[2]-box[0])*.35,.0008),py=Math.max((box[3]-box[1])*.35,.0008),view=[box[0]-px,box[1]-py,box[2]+px,box[3]+py];
    var others=isPbt?pbt.features.filter(function(f){return focus.indexOf(f)<0&&boxesOverlap(pbtBox(f),view);}).slice(0,Math.max(0,PRINT_LIMIT-focus.length)):[];
    var features={type:'FeatureCollection',features:focus.concat(others).map(function(f){var row=r.rows.filter(function(x){return x.feature===f;})[0];return {type:'Feature',properties:{hit:focus.indexOf(f)>=0?1:0,n:row?row.n:0},geometry:f.geometry};})};
    var pieces=r.rows.length?{type:'FeatureCollection',features:r.rows.map(function(x){return {type:'Feature',properties:{n:x.n},geometry:x.geometry};})}:null;
    var labels=isPbt?r.rows.slice(0,LABEL_LIMIT).map(function(x){var cc=L.geoJSON(x.geometry).getBounds().getCenter();return [cc.lng,cc.lat,x.n];}):[];
    var extent={type:'FeatureCollection',features:[pbt.subjectFeature].concat(focus.map(function(f){return {type:'Feature',properties:{},geometry:f.geometry};}))};
    var statLine=r.status==='intersect'?'Irisan '+fmtArea(r.total)+' • '+fmtPct(r.total,r.subjectArea)+' dari luas '+low(subj)+' '+fmtArea(r.subjectArea):'Tidak beririsan • '+other+' terdekat ± '+fmtDistance(r.distance);
    var s=function(l,v,sub){return '<div><small>'+esc(l)+'</small><b>'+esc(v)+'</b>'+(sub?'<em>'+esc(sub)+'</em>':'')+'</div>';};
    var heading=isPbt?'Penyandingan Bidang '+subj+' dengan PBT Sertipikat':'Penyandingan Koordinat '+subj+' dengan Koordinat '+other,html='<h2 class="sec">'+esc(heading)+'</h2>';
    if(r.status==='intersect'){
      var outside=Math.max(0,r.subjectArea-r.total),limit=40;
      if(isPbt)html+='<div class="pbt-sum">'+s('Luas irisan',fmtArea(r.total),fmtPct(r.total,r.subjectArea)+' dari luas '+low(subj))+s('Luas '+subj,fmtArea(r.subjectArea),'')+s(subj+' di luar PBT',fmtArea(outside),fmtPct(outside,r.subjectArea))+s('Bidang PBT beririsan',r.rows.length.toLocaleString('id-ID'),'dari '+r.count.toLocaleString('id-ID')+' bidang pada SHP')+'</div>'+
        '<table class="rt pbt-t"><colgroup><col style="width:7%"><col><col style="width:17%"><col style="width:17%"><col style="width:13%"></colgroup><thead><tr><th>No.</th><th>Bidang PBT</th><th>Luas bidang</th><th>Luas irisan</th><th>% bidang</th></tr></thead><tbody>'+
        r.rows.slice(0,limit).map(function(x){var sub=[x.meta.nib&&x.meta.hak?'No. hak '+x.meta.hak:'',x.meta.tipe].filter(Boolean).join(' • ');return '<tr><td>'+x.n+'</td><td class="l"><b>'+esc(x.meta.label)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</td><td>'+esc(fmtArea(x.pbtArea))+'</td><td><b>'+esc(fmtArea(x.area))+'</b></td><td>'+esc(fmtPct(x.area,x.pbtArea))+'</td></tr>';}).join('')+
        (r.rows.length>limit?'<tr><td colspan="5" class="empty">+'+(r.rows.length-limit).toLocaleString('id-ID')+' bidang lain</td></tr>':'')+'</tbody></table>';
      else{var oArea=r.rows[0].pbtArea,oOut=Math.max(0,oArea-r.total);html+='<div class="pbt-sum">'+s('Luas irisan',fmtArea(r.total),fmtPct(r.total,r.subjectArea)+' dari luas '+low(subj))+s('Luas '+subj,fmtArea(r.subjectArea),'')+s(subj+' di luar '+other,fmtArea(outside),fmtPct(outside,r.subjectArea))+s('Luas '+other,fmtArea(oArea),fmtArea(oOut)+' tidak masuk '+low(subj))+'</div>';}
    }else html+='<div class="pbt-sum">'+s('Status','Tidak beririsan','')+s('Jarak '+other+' terdekat','± '+fmtDistance(r.distance),r.nearest?r.nearest.meta.label:'')+s('Luas '+subj,fmtArea(r.subjectArea),'')+(isPbt?s('Bidang PBT dibaca',r.count.toLocaleString('id-ID'),''):s('Luas '+other,fmtArea(r.nearest?r.nearest.area:0),''))+'</div><div class="box-out"><b>Tidak ada irisan.</b> Bidang '+esc(low(subj))+' tidak beririsan dengan '+esc(isPbt?'bidang PBT mana pun pada berkas '+pbt.fileName:'koordinat '+other.toLowerCase())+'. '+(isPbt?'Bidang PBT terdekat':'Keduanya')+' ditampilkan pada peta penyandingan.</div>';
    html+='<div class="box-out"><b>Sumber pembanding:</b> '+esc(isPbt?pbt.fileName:pbt.fileName+' pada '+pbt.subjectName)+'. Luas dihitung dari geometri (UTM 50S) dan dapat sedikit berbeda dengan luas tertulis di '+(isPbt?'sertipikat':'PDF KKPR')+'.</div>';
    return {status:r.status,statLine:statLine,title:isPbt?'Penyandingan '+subj+' dan PBT Sertipikat':'Penyandingan '+subj+' dan '+other,subjectLabel:'Bidang '+subj,otherLabel:isPbt?'Bidang PBT sertipikat':'Koordinat '+other.toLowerCase(),color:c.color,fill:c.fill,dashed:!isPbt,features:features,pieces:pieces,labels:labels,extent:extent,html:html};
  };
  window.sobatPbtBlocked=function(){return blocked()&&!!session&&!session.displaced;};
  if(typeof window.sobatOpenPrintSetup==='function'){
    var originalOpenPrint=window.sobatOpenPrintSetup;
    window.sobatOpenPrintSetup=function(){if(window.sobatPbtBlocked()){toast('Cetak PDF dinonaktifkan karena pembanding terlalu jauh dari bidang '+pbt.subject+'. Hapus penyandingan untuk mencetak laporan '+low(pbt.subject)+' saja.',5200);return;}return originalOpenPrint.apply(this,arguments);};
  }

  /* =====================================================================
   * 3. Sesi bidang: satu bidang aktif, simpan hasil, tampilkan lagi, akhiri analisis
   * ===================================================================== */
  var session=null,restoring=false,outline=null,endArmTimer=null,glowRenderer=null;
  function propsOf(f){return f&&f.properties||{};}
  function kindOf(geojson){
    var features=polygonFeatures(geojson);
    if(features.some(function(f){return propsOf(f).__SOBAT_EXPLORER_SELECTED===true;}))return 'explorer';
    if(features.some(function(f){return propsOf(f).__SOBAT_MEASURED===true;}))return 'digitized';
    if(features.some(function(f){return propsOf(f).sumber==='PDF KKPR';}))return 'kkpr';
    return 'upload';
  }
  function signature(geojson){var features=polygonFeatures(geojson),b=boxOf({type:'FeatureCollection',features:features});return kindOf(geojson)+'|'+features.length+'|'+b.map(function(v){return Number(v).toFixed(7);}).join(',');}
  function sessionName(s){
    if(!s)return '';
    if(s.kind==='digitized')return 'Bidang hasil digitasi';
    if(s.kind==='explorer'){var p=propsOf(polygonFeatures(s.geojson)[0]),nib=Object.keys(p).filter(function(k){return /^(NIB|NIBIDANG|NOMORNIB)$/.test(String(k).toUpperCase().replace(/[^A-Z0-9]/g,''));}).map(function(k){return p[k];})[0];return nib?'Bidang NIB '+nib:'Bidang Explor Bidang';}
    var label=s.kind==='kkpr'?'Bidang KKPR':'Bidang upload';return s.fileName?label+' • '+s.fileName:label;
  }
  function sessionArea(s){return dissolve(s.geojson).reduce(function(total,f){return total+areaOf(f);},0);}
  function shapeVisible(s){
    if(s.kind==='explorer')return true;
    if(!window.uploadLayer||!map.hasLayer(window.uploadLayer))return false;
    try{return signature(window.uploadLayer.toGeoJSON())===s.sig||(window.lastUploadedFeature===s.geojson);}catch(_e){return false;}
  }
  function removeOutline(){if(outline){map.removeLayer(outline);outline=null;}}
  // Garis bidang digambar ulang bila sudah hilang dari peta (mis. setelah layer unggahan dihapus).
  function drawOutline(s){removeOutline();if(!s||shapeVisible(s))return;outline=L.geoJSON(s.geojson,{interactive:false,style:{color:'#ff7a00',weight:3,fillColor:'#ffb347',fillOpacity:.2}}).addTo(map);}
  function hiddenPanel(el){if(!el)return true;var cs=getComputedStyle(el);return el.hidden||cs.display==='none'||cs.visibility==='hidden'||!el.getBoundingClientRect().width;}
  // Paskan bidang ke area peta yang tidak tertutup panel (bawah di HP, kanan/kiri di desktop).
  function visibleRect(){
    var rect=ux.visibleMapRect(),phone=ux.isPhone();
    var explorer=$('fieldExplorer'),legacy=$('analysisPanel');
    if(!phone){
      if(explorer&&explorer.classList.contains('open')&&!hiddenPanel(explorer))rect.left=Math.max(rect.left,explorer.getBoundingClientRect().right+24);
      if(legacy&&!hiddenPanel(legacy)&&legacy.getBoundingClientRect().left>window.innerWidth/2)rect.right=Math.min(rect.right,legacy.getBoundingClientRect().left-24);
    }else if(legacy&&!hiddenPanel(legacy))rect.bottom=Math.min(rect.bottom,legacy.getBoundingClientRect().top-24);
    return rect;
  }
  function fitBoundsVisible(bounds,maxZoom){
    if(!bounds||!bounds.isValid())return;
    var rect=visibleRect(),mapRect=map.getContainer().getBoundingClientRect();
    var tl=[Math.max(24,rect.left-mapRect.left+14),Math.max(24,rect.top-mapRect.top+14)],br=[Math.max(24,mapRect.right-rect.right+14),Math.max(24,mapRect.bottom-rect.bottom+14)];
    if(mapRect.width-tl[0]-br[0]<120||mapRect.height-tl[1]-br[1]<100){map.fitBounds(bounds,{padding:[30,30],maxZoom:maxZoom||18});return;}
    map.stop();map.fitBounds(bounds,{paddingTopLeft:tl,paddingBottomRight:br,maxZoom:maxZoom||18,animate:true,duration:.35});
  }
  window.sobatFitVisible=function(geojson){try{fitBoundsVisible(L.geoJSON(geojson).getBounds(),18);}catch(_e){}};
  // Cahaya oranye berdenyut ±2,5 detik di tepi bidang hasil digitasi saat pertama tampil.
  function glow(geojson){
    if(!glowRenderer)glowRenderer=L.svg({padding:.5});
    var layer=L.geoJSON(geojson,{renderer:glowRenderer,interactive:false,style:{color:'#ffb300',weight:5,opacity:1,fill:false,lineJoin:'round',className:'st-digit-glow'}}).addTo(map);
    setTimeout(function(){if(map.hasLayer(layer))map.removeLayer(layer);},2700);
  }
  // Tidak ada label/pin di atas bidang; bidang digitasi tidak di-zoom/geser, bidang lain dipaskan ke area peta yang terlihat.
  window.presentUploadedAnalysis=function(geojson){
    try{if(typeof window.clearUploadedAnalysisPresentation==='function')window.clearUploadedAnalysisPresentation();}catch(_e){}
    try{if(typeof window.clearIdentificationPulse==='function')window.clearIdentificationPulse();}catch(_e){}
    if(kindOf(geojson)==='digitized'){if(session&&session.fresh&&session.kind==='digitized'){session.fresh=false;glow(geojson);}return;}
    // Bila penyandingan sudah dihitung, paskan ke bidang dan pembandingnya sekaligus.
    setTimeout(function(){if(pbt.result&&session&&session.kind==='kkpr')fitPbt();else window.sobatFitVisible(geojson);},ux.isPhone()?320:80);
  };
  function startSession(geojson,sig){
    var previous=session,kind=kindOf(geojson),source=window.sobatSpatialSource||{};
    removeOutline();resetPbt(null);
    session={geojson:geojson,sig:sig,kind:kind,fileName:kind==='kkpr'||kind==='upload'?source.fileName||'':'',displaced:false,fresh:true,kkpr:kind==='kkpr'?lastKkpr:null};
    // Hanya satu bidang aktif: visual bidang lama yang tidak dipakai lagi dibersihkan.
    if(previous&&previous.kind!=='explorer'&&kind==='explorer'&&window.uploadLayer&&map.hasLayer(window.uploadLayer)){map.removeLayer(window.uploadLayer);window.uploadLayer=null;}
    if(window.measureControl&&measureControl._layer&&kind!=='digitized'){try{measureControl._layer.clearLayers();}catch(_e){}}
    if(kind==='kkpr'){
      var feature=polygonFeatures(geojson)[0],k=session.kkpr,subject='KKPR',others=[],auto=-1;
      if(k&&k.tables){var chosen=k.result;subject=k.tables.length>1&&chosen?shortName(chosen.section):'KKPR';k.tables.forEach(function(t){if(t===chosen)return;try{others.push({name:t.section||'Tabel lain',short:shortName(t.section),count:t.rows.length,feature:parser.toFeature(t)});}catch(_e){}});if(k.showAll&&others.length)auto=0;}
      resetPbt(feature,session.fileName||'PDF KKPR',subject,others);session.autoCompare=auto;
    }
  }
  var previousRun=window.runAnalysis;
  window.runAnalysis=function(geojson){
    var sig=signature(geojson);
    if(!restoring&&(!session||session.sig!==sig))startSession(geojson,sig);
    else if(session){session.displaced=false;session.geojson=geojson;if(shapeVisible(session))removeOutline();}
    if(pbt.layer&&pbt.visible&&!map.hasLayer(pbt.layer)){pbt.layer.addTo(map);bringSubjectFront();}
    var out=previousRun.apply(this,arguments);
    if(session&&session.autoCompare>=0){var auto=session.autoCompare;session.autoCompare=-1;compareTable(auto,true);}
    return out;
  };
  if(typeof window.sobatRenderIdentification==='function'){
    var previousIdentify=window.sobatRenderIdentification;
    window.sobatRenderIdentification=function(){
      if(session&&!session.displaced){
        // Titik baru menggantikan tampilan bidang: hasil bidang (termasuk penyandingan) disimpan untuk ditampilkan lagi.
        session.displaced=true;if(pbt.layer&&map.hasLayer(pbt.layer))map.removeLayer(pbt.layer);
        setTimeout(function(){toast('Hasil analisis bidang tetap tersimpan. Tekan "Tampilkan lagi hasil bidang" pada panel untuk kembali.',4800);},60);
      }
      return previousIdentify.apply(this,arguments);
    };
  }
  function restore(){
    var s=session;if(!s)return;
    s.displaced=false;
    if(s.kind!=='explorer')drawOutline(s);
    if(s.kind==='explorer')ux.hideResult(true);
    restoring=true;
    try{window.runAnalysis(s.geojson);}finally{restoring=false;}
    if(pbt.result)draw();
    fitBoundsVisible(L.geoJSON(s.geojson).getBounds(),18);
    toast('Hasil analisis bidang ditampilkan kembali tanpa upload ulang.',3200);
  }
  // Hapus hanya bidang tersimpan (hasil titik yang sedang tampil dibiarkan).
  function discard(announce){
    var s=session;if(!s)return;session=null;
    removeOutline();resetPbt(null);
    if(s.kind==='explorer'){var close=$('closeAnalysisPanel');if(close&&!hiddenPanel($('analysisPanel')))close.click();}
    else{if(window.uploadLayer&&map.hasLayer(window.uploadLayer))map.removeLayer(window.uploadLayer);window.uploadLayer=null;window.sobatDigitizedGeojson=null;}
    if(window.measureControl&&measureControl._layer){try{measureControl._layer.clearLayers();}catch(_e){}}
    window.lastUploadedFeature=null;window.sobatSpatialSource=null;
    try{if(typeof window.clearUploadedAnalysisPresentation==='function')window.clearUploadedAnalysisPresentation();}catch(_e){}
    syncSessionUi();
    if(announce)toast('Bidang analisis dihapus dari layar.');
  }
  // Akhiri seluruh analisis: hentikan proses berjalan dan kembalikan peta ke keadaan awal.
  function endAnalysis(){
    var had=!!session;pbt.token++;
    discard(false);
    try{if(typeof window.clearIdentificationPulse==='function')window.clearIdentificationPulse();}catch(_e){}
    map.closePopup();ux.reset();
    toast(had?'Analisis diakhiri. Bidang dan hasilnya sudah dihapus dari layar.':'Analisis diakhiri. Penanda dihapus dari layar.');
  }
  window.SobatAnalysisSession={restore:restore,discard:discard,end:endAnalysis,current:function(){return session;}};
  function syncSessionUi(){
    var body=$('stResultBody');if(!body)return;
    var recall=body.querySelector('.st-recall');
    if(session&&session.displaced&&ux.lastIdentification()&&ux.lastIdentification().mode==='point'){
      var area=sessionArea(session);
      if(!recall){recall=document.createElement('div');recall.className='st-recall';recall.setAttribute('role','note');body.insertBefore(recall,body.firstChild);}
      recall.innerHTML='<i class="fas fa-draw-polygon" aria-hidden="true"></i><div class="st-recall-text"><strong>Hasil analisis bidang masih tersimpan</strong><span>'+esc(sessionName(session))+(area?' • '+esc(fmtArea(area)):'')+'</span></div><div class="st-recall-acts"><button type="button" class="st-recall-main" data-st-recall="restore"><i class="fas fa-undo" aria-hidden="true"></i>Tampilkan lagi hasil bidang</button><button type="button" class="st-recall-drop" data-st-recall="discard" title="Hapus bidang dari layar" aria-label="Hapus bidang dari layar"><i class="fas fa-times" aria-hidden="true"></i></button></div>';
    }else if(recall)recall.remove();
    var end=body.querySelector('.st-end-analysis');
    if(ux.lastIdentification()){
      if(!end){end=document.createElement('button');end.type='button';end.className='st-end-analysis';var anchor=body.querySelector('#kkprPbtBox:not([hidden])')||body.querySelector('.st-actions-sub')||body.querySelector('.st-actions');if(anchor)anchor.parentNode.insertBefore(end,anchor.nextSibling);else body.appendChild(end);}
      clearTimeout(endArmTimer);end.classList.remove('armed');
      end.innerHTML='<i class="fas fa-trash-alt" aria-hidden="true"></i>'+(session?'Akhiri analisis &amp; hapus bidang dari layar':'Akhiri analisis &amp; hapus penanda');
      end.title=session?'Menghapus bidang, penanda, layer hasil, dan penyandingan dari peta':'Menghapus penanda dan hasil analisis dari peta';
    }else if(end)end.remove();
  }
  document.addEventListener('click',function(event){
    if(!event.target.closest)return;
    var recall=event.target.closest('[data-st-recall]');
    if(recall){if(recall.getAttribute('data-st-recall')==='restore')restore();else discard(true);return;}
    var end=event.target.closest('.st-end-analysis');
    if(end){
      // Dua langkah agar bidang tidak terhapus karena salah sentuh.
      if(!end.classList.contains('armed')){end.classList.add('armed');end.innerHTML='<i class="fas fa-exclamation-triangle" aria-hidden="true"></i>Klik sekali lagi untuk '+(session?'menghapus bidang dari layar':'mengakhiri analisis');clearTimeout(endArmTimer);endArmTimer=setTimeout(syncSessionUi,4000);return;}
      endAnalysis();return;
    }
    var exp=event.target.closest('[data-st-export]');
    if(exp)exportCurrent(exp.getAttribute('data-st-export'));
  });
  function exportCurrent(format){
    var s=session,geojson=s&&!s.displaced?s.geojson:null;
    if(!geojson){toast('Bidang terpilih tidak ditemukan.');return;}
    var features=polygonFeatures(geojson).map(function(f){var p={};Object.keys(f.properties||{}).forEach(function(k){if(!/^__/.test(k))p[k]=f.properties[k];});if(s.kind==='digitized'){p.NAMA=p.NAMA||'Bidang Hasil Digitasi SOBAT TARU';}p.LUAS_M2=Math.round(areaOf(f));return {type:'Feature',properties:p,geometry:f.geometry};});
    var name=(s.kind==='digitized'?'SOBAT_TARU_Hasil_Digitasi':s.kind==='kkpr'?String(s.fileName||'KKPR').replace(/\.pdf$/i,'')+'_BIDANG':String(s.fileName||'SOBAT_TARU_Bidang').replace(/\.(zip|kml)$/i,''))+'_'+new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
    if(format==='kml'){if(!tools.geojsonToKml){toast('Export KML belum siap.');return;}tools.saveFile(tools.geojsonToKml({type:'FeatureCollection',features:features}),name+'.kml','application/vnd.google-earth.kml+xml');toast('KML bidang berhasil dibuat.');return;}
    if(!tools.loadWriter){toast('Export SHP belum siap.');return;}
    toast('Menyiapkan ZIP Shapefile…');
    tools.loadWriter().then(function(writer){return writer.zip({type:'FeatureCollection',features:features},{folder:name,filename:name,outputType:'blob',compression:'DEFLATE',types:{polygon:'BIDANG'}});})
      .then(function(content){tools.saveFile(content,name+'.zip','application/zip');toast('SHP bidang berhasil dibuat dan dapat diunggah kembali.');})
      .catch(function(error){toast((error&&error.message)||'Bidang belum dapat diekspor ke SHP.');});
  }
  // Setiap kali panel hasil digambar ulang: kartu sesi, tombol akhiri analisis, dan kotak cek irisan.
  document.addEventListener('sobat:analysis-rendered',function(event){
    var detail=event.detail||{};if(detail.body&&detail.body.id!=='stResultBody')return;
    var box=$('kkprPbtBox');if(box&&box.parentNode&&!document.body.contains(box.parentNode))box.remove();
    setTimeout(function(){renderPbt();syncSessionUi();syncPrint();},0);
  });
  // Tombol hapus bidang digitasi lama juga mengakhiri sesi.
  document.addEventListener('click',function(event){if(event.target.closest&&event.target.closest('[data-digitized-action="delete"]')){session=null;removeOutline();resetPbt(null);}},true);
})();
