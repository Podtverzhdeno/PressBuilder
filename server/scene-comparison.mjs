/**
 * P11: deterministic pixel diffs between integrity-checked P08 storyboard frames.
 * This is not semantic / creative QA and never changes approval or review state.
 * Real image decoding and visualization are performed by FFmpeg with fixed args.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const VERSION=/^[0-9a-f]{16}$/;
const PROFILE='p11-gbrp-rgb-difference-64x36-v1';
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const sha=file=>{
  const hash=createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(1024*1024);
  try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,n))}
  finally{fs.closeSync(fd)}
  return hash.digest('hex');
};
function atomic(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,file)}
  finally{fs.rmSync(temp,{force:true})}
}
function runFFmpeg(args,{maxBytes=2*1024*1024,timeoutMs=20000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.FFMPEG||'ffmpeg',['-hide_banner','-nostdin','-loglevel','error',...args],
      {stdio:['ignore','pipe','pipe']});
    let done=false,size=0,chunks=[],stderr='';
    const finish=(e)=>{
      if(done)return;done=true;clearTimeout(timer);
      e?reject(e):resolve(Buffer.concat(chunks));
    };
    const timer=setTimeout(()=>{
      child.kill('SIGKILL');finish(bad('Scene comparison FFmpeg timeout',504))
    },timeoutMs);
    timer.unref?.();
    child.stdout.on('data',b=>{
      size+=b.length;
      if(size>maxBytes){child.kill('SIGKILL');finish(bad('Scene comparison output too large',413))}
      else chunks.push(b);
    });
    child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-600)});
    child.on('error',e=>finish(bad('Scene comparison FFmpeg error: '+e.message,502)));
    child.on('close',code=>finish(code===0?null:bad('Scene comparison FFmpeg failed: '+stderr,502)));
  });
}
const filters=(size)=>'[0:v]scale='+size+':flags=area,format=gbrp[a];'+
  '[1:v]scale='+size+':flags=area,format=gbrp[b];'+
  '[a][b]blend=all_mode=difference,format=rgb24[d]';
const makeUrl=(base,id,scene,from,to,index)=>base.replace(/\/$/,'')+
  '/api/decks/'+encodeURIComponent(id)+'/versions/'+encodeURIComponent(scene)+
  '/compare/'+from+'/'+to+'/'+index+'.jpg';
export function sceneComparisonService({
  versions,out,baseUrl=()=>'',acquireResource=async()=>()=>{}
}){
  const inflight=new Map();
  const locate=(id,scene,from,to)=>{
    if(!ID.test(id)||!ID.test(scene)||!VERSION.test(from)||!VERSION.test(to))
      throw bad('Invalid comparison identifiers');
    if(from===to)throw bad('Select two distinct versions');
    const a=versions.verified(id,scene,from),b=versions.verified(id,scene,to);
    if(a.qa?.verdict!=='PASS'||b.qa?.verdict!=='PASS')
      throw bad('Only QA-passing versions are comparable',409);
    if(a.frame_evidence?.frames?.length!==3||b.frame_evidence?.frames?.length!==3)
      throw bad('Both versions need P03 three-frame evidence',409);
    const pairs=[0,1,2].map(i=>{
      const x=a.frame_evidence.frames[i],y=b.frame_evidence.frames[i];
      if(x.index!==i||y.index!==i)throw bad('Invalid storyboard frame indices',409);
      const p=path.join(out,path.basename(x.file)),q=path.join(out,path.basename(y.file));
      return {index:i,before:x,after:y,fileA:p,fileB:q};
    });
    const key=createHash('sha256').update(JSON.stringify({
      profile:PROFILE,id,scene,from,to,
      files:[a.sha256,b.sha256],
      frames:pairs.map(p=>[p.before.sha256,p.after.sha256])
    })).digest('hex');
    const dir=path.join(out,'comparisons',id,scene);
    return {a,b,pairs,key,dir,manifest:path.join(dir,key+'.json')};
  };
  function cached(loc){
    if(!fs.existsSync(loc.manifest))return null;
    try{
      const item=JSON.parse(fs.readFileSync(loc.manifest,'utf8'));
      if(item?.key!==loc.key||item.profile!==PROFILE||item.frames?.length!==3)return null;
      for(let i=0;i<3;i++){
        const frame=item.frames[i],filename=loc.key+'_f'+i+'.jpg';
        if(frame.index!==i||frame.filename!==filename||
           !/^[a-f0-9]{64}$/.test(frame.sha256||''))return null;
        const f=path.join(loc.dir,filename);
        if(!fs.existsSync(f)||fs.statSync(f).size!==frame.size||sha(f)!==frame.sha256)
          return null;
      }
      return item;
    }catch{return null}
  }
  function response(id,scene,from,to,loc,item){
    return {project:id,scene_id:scene,from_version:from,to_version:to,
      scope:'PIXEL_DIFFERENCE_ONLY',samples:'P03_RELATIVE_10_50_90',
      resolution:{width:64,height:36},cache_hit:item.cache_hit===true,
      mean_absolute_difference:Number((item.frames.reduce((v,x)=>v+x.mean_absolute_difference,0)/3).toFixed(3)),
      frames:item.frames.map((f,i)=>({index:i,from_t:loc.pairs[i].before.t,
        to_t:loc.pairs[i].after.t,mean_absolute_difference:f.mean_absolute_difference,
        changed_fraction:f.changed_fraction,
        before_url:baseUrl().replace(/\/$/,'')+'/'+loc.pairs[i].before.file,
        after_url:baseUrl().replace(/\/$/,'')+'/'+loc.pairs[i].after.file,
        difference_url:makeUrl(baseUrl(),id,scene,from,to,i)})),
      note:'Pixel difference at three relative times is not artistic QA. Different lengths shift the compared moments.'};
  }
  async function compare(id,scene,from,to){
    const loc=locate(id,scene,from,to);
    const old=cached(loc);
    if(old)return response(id,scene,from,to,loc,{...old,cache_hit:true});
    const inflightKey=id+':'+scene+':'+loc.key;
    if(inflight.has(inflightKey))return inflight.get(inflightKey);
    const task=(async()=>{
      let release=null;
      const stages=[];
      try{
        release=await acquireResource({kind:'compare',id,scene});
        // The wait can be arbitrarily long; revalidate input integrity.
        const live=locate(id,scene,from,to);
        if(live.key!==loc.key)throw bad('Comparison inputs changed during resource wait',409);
        const existing=cached(loc);
        if(existing)return response(id,scene,from,to,loc,{...existing,cache_hit:true});
        fs.mkdirSync(loc.dir,{recursive:true});
        const frames=[];
        for(let i=0;i<3;i++){
          const p=loc.pairs[i];
          const input=['-i',p.fileA,'-i',p.fileB];
          const raw=await runFFmpeg([...input,'-filter_complex',filters('64:36'),
            '-map','[d]','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
          if(raw.length!==64*36*3)throw bad('Invalid decoded comparison frame length',502);
          let sum=0,changed=0;
          for(let pixel=0;pixel<raw.length;pixel+=3){
            const r=raw[pixel],g=raw[pixel+1],b=raw[pixel+2];
            sum+=r+g+b;
            if(Math.max(r,g,b)>24)changed++;
          }
          const filename=loc.key+'_f'+i+'.jpg',final=path.join(loc.dir,filename);
          const stage=final+'.'+randomUUID()+'.tmp.jpg';stages.push(stage);
          await runFFmpeg([...input,'-filter_complex',filters('640:360'),
            '-map','[d]','-frames:v','1','-q:v','4','-y',stage]);
          const stat=fs.statSync(stage);
          if(stat.size<100||stat.size>2*1024*1024)throw bad('Comparison JPEG has invalid size',502);
          const contents=fs.readFileSync(stage);
          if(contents[0]!==0xff||contents[1]!==0xd8||contents.at(-2)!==0xff||contents.at(-1)!==0xd9)
            throw bad('Comparison JPEG is invalid',502);
          fs.renameSync(stage,final);
          frames.push({index:i,filename,sha256:sha(final),size:stat.size,
            mean_absolute_difference:Number((sum/raw.length).toFixed(3)),
            changed_fraction:Number((changed/(64*36)).toFixed(5))});
        }
        atomic(loc.manifest,JSON.stringify({profile:PROFILE,key:loc.key,frames})+'\n');
        return response(id,scene,from,to,loc,{frames,cache_hit:false});
      }finally{
        try{release?.()}finally{for(const f of stages)fs.rmSync(f,{force:true})}
      }
    })();
    inflight.set(inflightKey,task);
    try{return await task}finally{inflight.delete(inflightKey)}
  }
  async function frame(id,scene,from,to,index){
    if(!Number.isSafeInteger(index)||index<0||index>2)throw bad('Invalid comparison frame');
    const report=await compare(id,scene,from,to);
    const loc=locate(id,scene,from,to);
    return path.join(loc.dir,loc.key+'_f'+index+'.jpg');
  }
  return {compare,frame};
}
