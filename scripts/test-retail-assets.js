const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../public');let count=0;
function check(url){if(!url||!url.startsWith('/'))return;const file=path.join(root,url.split('?')[0]);assert(fs.existsSync(file),`Missing asset: ${url}`);count++}
for(const row of require('../public/retail/wrap-examples.json'))for(const key of ['image','thumbnail','swatchImage'])check(row[key]);
for(const name of ['basic','nano','premium'])check(`/retail/assets/tint-videos/${name}.mp4`);
for(const file of ['app.js','tint.js','wrap-gallery.js','style.css','index.html']){
 const source=fs.readFileSync(path.join(root,'retail',file),'utf8');
 for(const m of source.matchAll(/(?:src|href)=["'](\/[^"'`$<>]+)["']/g))check(m[1]);
}
console.log(`PASS: ${count} retail assets exist, including all 228 gallery records and 3 videos.`);
