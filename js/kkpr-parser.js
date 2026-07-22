(function(root){
  'use strict';
  function numberValue(value){
    var text=String(value||'').trim().replace(/\s/g,'');
    var dot=text.lastIndexOf('.'),comma=text.lastIndexOf(',');
    if(dot>=0&&comma>=0){var decimal=dot>comma?'.':',';text=text.split(decimal==='.'?',':'.').join('');if(decimal===',')text=text.replace(',','.')}
    else if(comma>=0)text=text.replace(',','.');
    return Number(text);
  }
  function validPair(x,y){return(Number.isFinite(x)&&Number.isFinite(y)&&((x>=100000&&x<=900000&&y>=8000000&&y<=10000000)||(x>=110&&x<=125&&y>=-12&&y<=-5)))}
  function parseLines(lines){
    lines=(lines||[]).map(function(line){return String(line||'').replace(/\s+/g,' ').trim()}).filter(Boolean);
    var normalized=lines.map(function(line){return line.toUpperCase()}),approved=-1;
    for(var i=0;i<normalized.length;i++)if(/^(?:[A-Z]\.?\s+)?(?:KOORDINAT|AREA)\s+(?:YANG\s+)?DISETUJUI\b/.test(normalized[i])){approved=i;break}
    if(approved<0)throw new Error('Bagian KOORDINAT YANG DISETUJUI tidak ditemukan.');
    var rows=[];
    for(var n=approved+1;n<lines.length;n++){
      var upper=normalized[n];
      if(rows.length&&(/^(KETENTUAN|CATATAN|LAMPIRAN|C\.|D\.)\b/.test(upper)||/KOORDINAT\s+(YANG\s+)?DIMOHON/.test(upper)))break;
      var tokens=lines[n].match(/[-+]?\d[\d.,]*/g)||[],values=tokens.map(numberValue).filter(Number.isFinite),pair=null,no=null;
      for(var j=0;j<values.length-1;j++)if(validPair(values[j],values[j+1])){pair=[values[j],values[j+1]];no=j>0?values[j-1]:rows.length+1;break}
      if(pair)rows.push({no:no,x:pair[0],y:pair[1],source:lines[n]});
    }
    var unique=[],seen=Object.create(null);rows.forEach(function(row){var key=row.x.toFixed(4)+'|'+row.y.toFixed(4);if(!seen[key]){seen[key]=true;unique.push(row)}});
    if(unique.length<3)throw new Error('Koordinat disetujui kurang dari tiga titik atau tabel tidak terbaca.');
    var allText=normalized.join(' '),crs=/32750|ZONA\s*50\s*(SELATAN|S\b)|UTM\s*50\s*S/.test(allText)?'EPSG:32750':(unique[0].x>=110&&unique[0].x<=125?'EPSG:4326':'UNKNOWN');
    if(crs==='UNKNOWN')throw new Error('Sistem koordinat belum dapat dikenali.');
    return{section:'KOORDINAT YANG DISETUJUI',crs:crs,rows:unique};
  }
  function utm50SToLonLat(easting,northing){
    var a=6378137,e=0.00669438,k0=.9996,x=easting-500000,y=northing-10000000,lonOrigin=117,e1=(1-Math.sqrt(1-e))/(1+Math.sqrt(1-e)),m=y/k0,mu=m/(a*(1-e/4-3*e*e/64-5*e*e*e/256)),phi1=mu+(3*e1/2-27*Math.pow(e1,3)/32)*Math.sin(2*mu)+(21*e1*e1/16-55*Math.pow(e1,4)/32)*Math.sin(4*mu)+(151*Math.pow(e1,3)/96)*Math.sin(6*mu)+(1097*Math.pow(e1,4)/512)*Math.sin(8*mu),ep=e/(1-e),c1=ep*Math.pow(Math.cos(phi1),2),t1=Math.pow(Math.tan(phi1),2),n1=a/Math.sqrt(1-e*Math.pow(Math.sin(phi1),2)),r1=a*(1-e)/Math.pow(1-e*Math.pow(Math.sin(phi1),2),1.5),d=x/(n1*k0),lat=phi1-(n1*Math.tan(phi1)/r1)*(d*d/2-(5+3*t1+10*c1-4*c1*c1-9*ep)*Math.pow(d,4)/24+(61+90*t1+298*c1+45*t1*t1-252*ep-3*c1*c1)*Math.pow(d,6)/720),lon=(d-(1+2*t1+c1)*Math.pow(d,3)/6+(5-2*c1+28*t1-3*c1*c1+8*ep+24*t1*t1)*Math.pow(d,5)/120)/Math.cos(phi1);
    return[lonOrigin+lon*180/Math.PI,lat*180/Math.PI];
  }
  function toFeature(result){var coordinates=result.rows.map(function(row){return result.crs==='EPSG:32750'?utm50SToLonLat(row.x,row.y):[row.x,row.y]});if(coordinates[0][0]!==coordinates[coordinates.length-1][0]||coordinates[0][1]!==coordinates[coordinates.length-1][1])coordinates.push(coordinates[0].slice());return{type:'Feature',properties:{nama:'Koordinat Disetujui KKPR',sumber:'PDF KKPR',crs_asal:result.crs,jumlah_titik:result.rows.length},geometry:{type:'Polygon',coordinates:[coordinates]}}}
  root.LontarKkprParser={parseLines:parseLines,utm50SToLonLat:utm50SToLonLat,toFeature:toFeature};
})(typeof globalThis!=='undefined'?globalThis:this);
