/** Stateless Streamable HTTP MCP endpoint. No arbitrary shell or filesystem tools. */
import { createDeck, getDeck, listDecks, patchCue, patchDeck, patchObject, patchSlide, reorderSlides, setVisuals, UserError } from './cloud-core.mjs';

const obj = (properties, required=[]) => ({ type:'object', properties, required, additionalProperties:false });
const str = (description) => ({ type:'string', description });
const num = (description) => ({ type:'number', description });
const nilNum = (description) => ({ oneOf:[{ type:'number' },{ type:'null' }], description });
export const TOOLS = [
 { name:'list_decks', description:'List video projects in PressBuilder.', inputSchema:obj({}) },
 { name:'get_deck', description:'Read a video project including slides, narration cues and timing.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'create_deck', description:'Create an animated video project from a narration script; automatically partition it into slides and cues. New projects start with placeholders; call set_slide_visuals to author animated graphics without a redeploy.', inputSchema:obj({id:str('Unique slug, lowercase letters/digits/hyphens'),title:str('Human-readable video title'),text:str('Narration script'),style:{type:'string',enum:['terevo','midnight','paper','lines']},slide_count:{type:'integer',minimum:1,maximum:300},target:nilNum('Target duration in seconds or null')},['id','title','text']) },
 { name:'update_deck', description:'Edit video metadata and output format, preserving slides.', inputSchema:obj({id:str('Project slug'),title:str('Title'),style:{type:'string',enum:['terevo','midnight','paper','lines']},target:nilNum('Target duration in seconds or null'),fps:{type:'number',minimum:1,maximum:120},height:{type:'integer',enum:[720,1080,1440,2160]}},['id']) },
 { name:'update_cue', description:'Edit voiceover wording, on-screen phrase and timing for an existing cue.', inputSchema:obj({id:str('Project slug'),slide_id:str('Slide ID'),cue_id:str('Cue ID'),say:str('Narration text'),show:{type:['string','null']},dur:nilNum('Cue duration (seconds); null to reset'),hold:nilNum('Pause after cue in seconds; null to reset')},['id','slide_id','cue_id']) },
 { name:'update_slide', description:'Edit the slide label and lead/tail pauses.', inputSchema:obj({id:str('Project slug'),slide_id:str('Slide ID'),label:str('Slide label'),lead:nilNum('Seconds'),tail:nilNum('Seconds')},['id','slide_id']) },
 { name:'update_object', description:'Override an existing scene object by ID: position, size, text, visibility. Objects must already exist in scene code.', inputSchema:obj({id:str('Project slug'),slide_id:str('Slide ID'),object_id:str('Object ID'),x:nilNum('X coordinate'),y:nilNum('Y coordinate'),scale:nilNum('Scale'),text:{type:['string','null']},hidden:{type:'boolean'}},['id','slide_id','object_id']) },
 { name:'set_slide_visuals', description:'Create or replace an entire animated infographic scene with 1..30 editable graphics (text, rect, circle, line, bar). No code deployment required. Each element can animate from slide start or from a cue ID; existing TypeScript scenes take priority. Coordinates are in 1920x1080 pixels. A replacement list [] clears the graphics.', inputSchema:obj({id:str('Project slug'),slide_id:str('Existing slide ID'),elements:{type:'array',maxItems:30,items:{type:'object',additionalProperties:false,properties:{id:str('Unique object ID'),kind:{type:'string',enum:['text','rect','circle','line','bar']},x:num('Left coordinate'),y:num('Top coordinate'),w:num('Width or horizontal line delta'),h:num('Height or vertical line delta'),text:str('Display text, required for text kind'),radius:num('Radius / corner radius'),size:num('Font size'),line_width:num('Line width'),color:{type:'string',enum:['h1','accent','text','pos','panel','bg']},font:{type:'string',enum:['display','sans','mono']},weight:{type:'string',enum:['regular','bold']},cue_id:str('Start animation when this cue begins'),effect:{type:'string',enum:['fade','rise','slide','pop']},duration:num('Entrance duration in seconds')},required:['id','kind','x','y']}}},['id','slide_id','elements']) },
 { name:'reorder_slides', description:'Reorder existing slides without losing any cue IDs.', inputSchema:obj({id:str('Project slug'),slide_ids:{type:'array',items:{type:'string'}}},['id','slide_ids']) },
 { name:'render_video', description:'Start a server-side Chromium + WebCodecs + FFmpeg render job for a video. Poll get_render_status. Server rendering uses deterministic Chromium Canvas frames encoded with FFmpeg.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_render_status', description:'Get status of a render job and download URL when finished.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_editor_link', description:'Get a browser link for opening a project in the hosted PressBuilder editor.', inputSchema:obj({id:str('Project slug')},['id']) }
];
export function makeMcp({ startRender, getRender, baseUrl }) {
  async function call(name, args) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new UserError('Arguments must be an object');
    switch(name) {
      case 'list_decks': return listDecks();
      case 'get_deck': return getDeck(args.id);
      case 'create_deck': return createDeck(args);
      case 'update_deck': return patchDeck(args.id, args);
      case 'update_cue': return patchCue(args.id,args.slide_id,args.cue_id,args);
      case 'update_slide': return patchSlide(args.id,args.slide_id,args);
      case 'update_object': return patchObject(args.id,args.slide_id,args.object_id,args);
      case 'reorder_slides': return reorderSlides(args.id,args.slide_ids);
      case 'set_slide_visuals': return setVisuals(args.id,args.slide_id,args.elements);
      case 'render_video': return startRender(args.id);
      case 'get_render_status': return getRender(args.id);
      case 'get_editor_link': getDeck(args.id); return { url:baseUrl().replace(/\/$/,'')+'/?deck='+encodeURIComponent(args.id), note:'Opens a password-protected editor. New projects use placeholder visuals unless scene code is deployed.' };
      default: throw new UserError('Unknown tool: '+name,404);
    }
  }
  return async function handle(message) {
    if (Array.isArray(message)) return { jsonrpc:'2.0',id:null,error:{code:-32600,message:'Batch requests not supported'} };
    if (!message || message.jsonrpc!=='2.0' || typeof message.method!=='string') return {jsonrpc:'2.0',id:message?.id??null,error:{code:-32600,message:'Invalid JSON-RPC'}};
    if (message.id===undefined) return null;
    const result = (value) => ({jsonrpc:'2.0',id:message.id,result:value});
    if (message.method==='initialize') return result({protocolVersion:'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'pressbuilder-cloud',version:'0.1.0'}});
    if (message.method==='ping') return result({});
    if (message.method==='tools/list') return result({tools:TOOLS});
    if (message.method==='tools/call') {
      const name=message.params?.name;
      if (typeof name!=='string' || !TOOLS.some((t)=>t.name===name)) return result({content:[{type:'text',text:'Unknown MCP tool'}],isError:true});
      try {
        const v=await call(name,message.params?.arguments||{});
        return result({content:[{type:'text',text:JSON.stringify(v)}],isError:false});
      } catch (e) {
        return result({content:[{type:'text',text:e instanceof Error?e.message:'Operation failed'}],isError:true});
      }
    }
    return {jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}};
  };
}
