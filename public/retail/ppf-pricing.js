(function(root){
 const fullPrice=6500;
 const allocations=[['front','前保险杠',20],['rear','后保险杠',20],['hood','引擎盖',5],['fenders','前翼子板（左右）',5],['doors','车门（整组）',20],['rearFenders','后翼子板（左右）',10],['roof','车顶漆面',8],['trunk','尾门 / 后备厢盖',8],['mirrors','后视镜（左右）',2],['sills','侧裙（左右）',2]];
 const parts=allocations.map(([id,name,percent])=>[id,name,fullPrice*percent/100,percent]);
 parts.push(['full','全车漆面',fullPrice,100]);
 const total=ids=>ids.includes('full')?fullPrice:parts.filter(p=>ids.includes(p[0])).reduce((sum,p)=>sum+p[2],0);
 const pricing={fullPrice,parts,total};
 if(typeof module!=='undefined'&&module.exports)module.exports=pricing;else root.QUAD_PPF_PRICING=pricing;
})(typeof globalThis!=='undefined'?globalThis:this);
