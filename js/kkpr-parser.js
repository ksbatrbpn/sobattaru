(function(root){
  'use strict';
  function numberValue(value){
    var text=String(value||'').trim().replace(/\s/g,'');
    var dot=text.lastIndexOf('.'),comma=text.lastIndexOf(',');
    if(dot>=0&&comma>=0){var decimal=dot>comma?'.':',';text=text.split(decimal==='.'?',':'.').join('');if(decimal===',')text=text.replace(',','.')}
    else if(comma>=0)text=text.replace(',','.');
    return Number(text);
  }
  function validPair(x,y){return(Number.isFinite(x)&&Number.isFinite(y)&&((x>=100000&&x<=900000&&y>=8000000&&y<=10000000)||(x>=95&&x<=145&&y>=-15&&y<=5)))}
  // Koordinat derajat-menit-detik, mis. 8°39'00" LS 116°31'48" BT. Tanpa penanda belahan, lintang dianggap selatan (NTB).
  function dmsPair(line){var re=/([-+]?\d{1,3})\s*[°º]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:['′’]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|'')?)?)?\s*(LS|LU|BT|BB|S|N|E|W)?(?![A-Z])/gi,match,lat=null,lon=null;while((match=re.exec(String(line||'')))){var deg=Math.abs(Number(match[1])),min=numberValue(match[2]||0),sec=numberValue(match[3]||0),hemi=String(match[4]||'').toUpperCase(),value=deg+min/60+sec/3600,negative=/^-/.test(match[1]);if(!isFinite(value))continue;var isLon=hemi==='BT'||hemi==='BB'||hemi==='E'||hemi==='W'||(!hemi&&deg>=95);if(isLon){lon=(hemi==='BB'||hemi==='W'||negative)?-value:value}else{lat=(hemi==='LU'||hemi==='N')&&!negative?value:-value}}return lat!==null&&lon!==null&&validPair(lon,lat)?[lon,lat]:null}
  function parseLines(lines){
    lines=(lines||[]).map(function(line){return String(line||'').replace(/\s+/g,' ').trim()}).filter(Boolean);
    var normalized=lines.map(function(line){return line.toUpperCase()}),approved=-1;
    for(var i=0;i<normalized.length;i++)if(/\bKOORDINAT\b.*\b(?:DISETUJUI|DIMOHONKAN|DIMOHON)\b|\b(?:DISETUJUI|DIMOHONKAN|DIMOHON)\b.*\bKOORDINAT\b/.test(normalized[i])){approved=i;break}
    if(approved<0)for(var k=0;k<normalized.length;k++)if(/\bLINTANG\b.*\bBUJUR\b|\bBUJUR\b.*\bLINTANG\b/.test(normalized[k])){approved=k-1;break}
    if(approved<0)throw new Error('Tabel koordinat yang disetujui/dimohonkan tidak ditemukan.');
    var rows=[];
    for(var n=approved+1;n<lines.length;n++){
      var upper=normalized[n];
      if(rows.length&&(/^(KETENTUAN|CATATAN|LAMPIRAN|C\.|D\.)\b/.test(upper)||/KOORDINAT\s+(YANG\s+)?DIMOHON/.test(upper)))break;
      var tokens=lines[n].match(/[-+]?\d[\d.,]*/g)||[],values=tokens.map(numberValue).filter(Number.isFinite),pair=null,no=null;
      var dms=dmsPair(lines[n]);if(dms){pair=dms;no=values.length&&values[0]>=1&&values[0]<1000&&Math.floor(values[0])===values[0]?values[0]:rows.length+1}
      // Urutan Bujur–Lintang / X–Y, atau Lintang–Bujur / Y–X yang ditukar otomatis.
      if(!pair)for(var j=0;j<values.length-1;j++)if(validPair(values[j],values[j+1])){pair=[values[j],values[j+1]];no=j>0?values[j-1]:rows.length+1;break}
      if(!pair)for(var r=0;r<values.length-1;r++)if(validPair(values[r+1],values[r])){pair=[values[r+1],values[r]];no=r>0?values[r-1]:rows.length+1;break}
      if(pair)rows.push({no:no,x:pair[0],y:pair[1],source:lines[n]});
    }
    var unique=[],seen=Object.create(null);rows.forEach(function(row){var key=row.x.toFixed(4)+'|'+row.y.toFixed(4);if(!seen[key]){seen[key]=true;unique.push(row)}});
    if(unique.length<3)throw new Error('Koordinat disetujui kurang dari tiga titik atau tabel tidak terbaca.');
    var allText=normalized.join(' '),crs=/32750|ZONA\s*50\s*(SELATAN|S\b)|UTM\s*50\s*S/.test(allText)?'EPSG:32750':(unique[0].x>=95&&unique[0].x<=145&&unique[0].y>=-15&&unique[0].y<=5?'EPSG:4326':'UNKNOWN');
    if(crs==='UNKNOWN')throw new Error('Sistem koordinat belum dapat dikenali.');
    return{section:'KOORDINAT YANG DISETUJUI',crs:crs,rows:unique};
  }
  function utm50SToLonLat(easting,northing){
    var a=6378137,e=0.00669438,k0=.9996,x=easting-500000,y=northing-10000000,lonOrigin=117,e1=(1-Math.sqrt(1-e))/(1+Math.sqrt(1-e)),m=y/k0,mu=m/(a*(1-e/4-3*e*e/64-5*e*e*e/256)),phi1=mu+(3*e1/2-27*Math.pow(e1,3)/32)*Math.sin(2*mu)+(21*e1*e1/16-55*Math.pow(e1,4)/32)*Math.sin(4*mu)+(151*Math.pow(e1,3)/96)*Math.sin(6*mu)+(1097*Math.pow(e1,4)/512)*Math.sin(8*mu),ep=e/(1-e),c1=ep*Math.pow(Math.cos(phi1),2),t1=Math.pow(Math.tan(phi1),2),n1=a/Math.sqrt(1-e*Math.pow(Math.sin(phi1),2)),r1=a*(1-e)/Math.pow(1-e*Math.pow(Math.sin(phi1),2),1.5),d=x/(n1*k0),lat=phi1-(n1*Math.tan(phi1)/r1)*(d*d/2-(5+3*t1+10*c1-4*c1*c1-9*ep)*Math.pow(d,4)/24+(61+90*t1+298*c1+45*t1*t1-252*ep-3*c1*c1)*Math.pow(d,6)/720),lon=(d-(1+2*t1+c1)*Math.pow(d,3)/6+(5-2*c1+28*t1-3*c1*c1+8*ep+24*t1*t1)*Math.pow(d,5)/120)/Math.cos(phi1);
    return[lonOrigin+lon*180/Math.PI,lat*180/Math.PI];
  }
  function parseTables(lines){
    lines=(lines||[]).map(function(line){return String(line||'').replace(/\s+/g,' ').trim()}).filter(Boolean);
    var upper=lines.map(function(line){return line.toUpperCase()}),starts=[];
    upper.forEach(function(line,index){if(/\bKOORDINAT\b.*\b(?:DISETUJUI|DIMOHONKAN|DIMOHON|DILAMPIRKAN)\b|\b(?:DISETUJUI|DIMOHONKAN|DIMOHON|DILAMPIRKAN)\b.*\bKOORDINAT\b/.test(line))starts.push(index)});
    if(!starts.length)upper.forEach(function(line,index){if(/\bLINTANG\b.*\bBUJUR\b|\bBUJUR\b.*\bLINTANG\b/.test(line))starts.push(Math.max(0,index-1))});
    var tables=[];starts.forEach(function(start,index){var end=index+1<starts.length?starts[index+1]:lines.length,part=lines.slice(start,end);try{var parsed=parseLines(part);if(parsed.rows.length>=3){parsed.section=(lines[start]||'Tabel koordinat '+(index+1)).replace(/^.*?(KOORDINAT.*)$/i,'$1').trim();parsed.tableIndex=index+1;tables.push(parsed)}}catch(e){}});
    if(!tables.length)throw new Error('Tidak ditemukan lampiran/tabel koordinat yang memiliki minimal tiga titik.');
    return tables;
  }
  function toFeature(result){var coordinates=result.rows.map(function(row){return result.crs==='EPSG:32750'?utm50SToLonLat(row.x,row.y):[row.x,row.y]});if(coordinates[0][0]!==coordinates[coordinates.length-1][0]||coordinates[0][1]!==coordinates[coordinates.length-1][1])coordinates.push(coordinates[0].slice());return{type:'Feature',properties:{nama:'Koordinat Disetujui KKPR',sumber:'PDF KKPR',crs_asal:result.crs,jumlah_titik:result.rows.length,tabel_asal:result.section||''},geometry:{type:'Polygon',coordinates:[coordinates]}}}
  root.LontarKkprParser={parseLines:parseLines,parseTables:parseTables,utm50SToLonLat:utm50SToLonLat,toFeature:toFeature};
})(typeof globalThis!=='undefined'?globalThis:this);
