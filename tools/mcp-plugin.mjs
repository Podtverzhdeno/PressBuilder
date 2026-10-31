/**
 * Build a private ChatGPT Plugin package for a deployed PressBuilder MCP server.
 * Usage: node tools/mcp-plugin.mjs https://your-domain.up.railway.app
 * Produces out/pressbuilder-mcp-plugin.tar.gz. API keys are never packaged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const value=process.argv[2];
if(!value)throw new Error('Pass the HTTPS server URL (e.g. https://example.up.railway.app)');
const u=new URL(value);
if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash || u.pathname.replace(/\/+$/,'')!==''){
  throw new Error('Server URL must be an HTTPS origin without path, credentials or query');
}
const base=u.origin;
const plugin={
  '$schema':'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name:'pressbuilder-video',version:'0.1.0',
  description:'Create, edit and render PressBuilder videos using chat and a protected MCP server.',
  homepage:'https://github.com/Podtverzhdeno/PressBuilder',
  repository:'https://github.com/Podtverzhdeno/PressBuilder',
  license:'MIT',
  extensions:{'com.openai':{interface:{
    displayName:'PressBuilder Video',
    shortDescription:'Создание и монтаж роликов через ChatGPT',
    longDescription:'Управляйте сценариями, репликами, слайдами и рендером PressBuilder прямо из чата.',
    developerName:'Podtverzhdeno',category:'productivity',
    capabilities:['Create video projects','Edit slides and narration','Render MP4']
  }}}
};
const mcp={
  '$schema':'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
  mcpServers:{pressbuilder:{
    type:'streamable-http',url:base+'/mcp',
    extensions:{'com.openai':{auth:{type:'api_key',headerScheme:'bearer'}}}
  }}
};
const skill=[
 '---',
 'name: edit-pressbuilder-video',
 'description: Use when the user asks to create, edit, inspect or render an animated PressBuilder video.',
 '---',
 '',
 'Use the PressBuilder MCP tools. For a new video, collect or draft a narration script, then create_deck with a unique slug, title, preferred style, and optional slide count. The system splits the text into slides and cues.',
 'Before changes, call get_deck to inspect the actual IDs. Edit only existing IDs with update_cue, update_slide, update_object, and reorder_slides. Do not invent object IDs; objects must exist in deployed TypeScript scene code. A new deck uses placeholder visuals, not custom motion graphics.',
 'For video output call render_video then get_render_status until completed or failed. On completion provide download_url; the URL requires the editor Basic authentication. Never claim a render is complete before status completed.',
 'The web editor uses a separate Basic username/password from the MCP API key. Audio is uploaded in the web editor. Avoid concurrent edits in web and chat (last save wins). Never ask for API secrets in conversation.',
 ''
].join('\n');
const files={
 'plugin.json':JSON.stringify(plugin,null,2)+'\n',
 'mcp.json':JSON.stringify(mcp,null,2)+'\n',
 'skills/edit-pressbuilder-video/SKILL.md':skill
};
function header(name,size){
 const b=Buffer.alloc(512);
 const put=(s,at,len)=>Buffer.from(s).copy(b,at,0,len);
 const oct=(n,width)=>String(n.toString(8)).padStart(width-1,'0')+'\0';
 put(name,0,100);put(oct(0o644,8),100,8);put(oct(0,8),108,8);put(oct(0,8),116,8);
 put(oct(size,12),124,12);put(oct(0,12),136,12);
 b.fill(32,148,156);b[156]=48;put('ustar\0',257,6);put('00',263,2);
 const checksum=b.reduce((sum,n)=>sum+n,0);put(oct(checksum,8),148,8);
 return b;
}
const parts=[];
for(const [name,data] of Object.entries(files)){
 const b=Buffer.from(data);
 parts.push(header(name,b.length),b,Buffer.alloc((512-b.length%512)%512));
}
parts.push(Buffer.alloc(1024));
const archive=gzipSync(Buffer.concat(parts),{level:9});
const dest=path.join(process.cwd(),'out','pressbuilder-mcp-plugin.tar.gz');
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,archive);
console.log('Plugin package: '+dest+' ('+archive.length+' bytes). Configure the Bearer API key in ChatGPT.');
