/** Stateless Streamable HTTP MCP endpoint. No arbitrary shell or filesystem tools. */
import { createDeck, DECKS, getDeck, listDecks, patchCue, patchDeck, patchObject, patchSlide, reorderSlides, setVisuals, UserError } from './cloud-core.mjs';
import { sceneTaskStore } from './scene-tasks.mjs';
import { projectReadmeStore } from './project-readme.mjs';
import path from 'node:path';
const taskStore=sceneTaskStore({root:DECKS,getDeck});
const readmeStore=projectReadmeStore({root:DECKS,seedRoot:path.join(process.cwd(),'src','decks'),getDeck});

const obj = (properties, required=[]) => ({ type:'object', properties, required, additionalProperties:false });
const str = (description) => ({ type:'string', description });
const num = (description) => ({ type:'number', description });
const nilNum = (description) => ({ oneOf:[{ type:'number' },{ type:'null' }], description });
export const TOOLS = [
 { name:'list_decks', description:'START HERE if the user did not give a project ID. List all PressBuilder video projects, then call get_project_context for the chosen project and get_scene_task before editing a scene.', inputSchema:obj({}) },
 { name:'get_deck', description:'Read project slides, narration, timing, project README and scene task status. For a new agent use get_project_context first, followed by get_scene_task for your assigned scene.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_project_context', description:'RECOMMENDED FIRST ACTION for any agent unfamiliar with a PressBuilder project: one call returns the project README.md, title, global format, scene list, all task statuses/checkpoints, and optionally the full assignment of one scene. If project ID is unknown, call list_decks first. Read the README and your scene task BEFORE modifying a scene.', inputSchema:obj({id:str('Project slug'),slide_id:str('Optional specific scene ID; returns full brief and checkpoints')},['id']) },
 { name:'get_project_readme', description:'Read the project-specific README.md from the video project, including the global style, storyboard, constraints and onboarding steps. Not the GitHub repository README.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'update_project_readme', description:'Update the project-specific Markdown README. Needs expected_revision from get_project_readme or get_project_context to prevent stale writes. Does not overwrite scene tasks or deck.json.', inputSchema:obj({id:str('Project slug'),content:str('Complete README.md Markdown, maximum 64 KiB'),expected_revision:str('Exact revision from last README read')},['id','content','expected_revision']) },
 { name:'create_deck', description:'Create an animated video project from a narration script; automatically partition it into slides and cues. New projects start with placeholders; call set_slide_visuals to author animated graphics without a redeploy.', inputSchema:obj({id:str('Unique slug, lowercase letters/digits/hyphens'),title:str('Human-readable video title'),text:str('Narration script'),style:{type:'string',enum:['terevo','midnight','paper','lines']},slide_count:{type:'integer',minimum:1,maximum:300},target:nilNum('Target duration in seconds or null')},['id','title','text']) },
 { name:'update_deck', description:'Edit video metadata and output format, preserving slides.', inputSchema:obj({id:str('Project slug'),title:str('Title'),style:{type:'string',enum:['terevo','midnight','paper','lines']},target:nilNum('Target duration in seconds or null'),fps:{type:'number',minimum:1,maximum:120},height:{type:'integer',enum:[720,1080,1440,2160]}},['id']) },
 { name:'update_cue', description:'Edit voiceover wording, on-screen phrase and timing for an existing cue.', inputSchema:obj({id:str('Project slug'),slide_id:str('Slide ID'),cue_id:str('Cue ID'),say:str('Narration text'),show:{type:['string','null']},dur:nilNum('Cue duration (seconds); null to reset'),hold:nilNum('Pause after cue in seconds; null to reset')},['id','slide_id','cue_id']) },
 { name:'update_slide', description:'Edit the slide label and lead/tail pauses.', inputSchema:obj({id:str('Project slug'),slide_id:str('Slide ID'),label:str('Slide label'),lead:nilNum('Seconds'),tail:nilNum('Seconds')},['id','slide_id']) },
 { name:'update_object', description:'Override an existing scene object by ID: position, size, text, visibility. Objects must already exist in scene code.', inputSchema:obj({id:str('Project slug'),slide_id:str('Slide ID'),object_id:str('Object ID'),x:nilNum('X coordinate'),y:nilNum('Y coordinate'),scale:nilNum('Scale'),text:{type:['string','null']},hidden:{type:'boolean'}},['id','slide_id','object_id']) },
 { name:'set_slide_visuals', description:'Create or replace an entire animated infographic scene with 1..30 editable graphics (text, rect, circle, line, bar). No code deployment required. Each element can animate from slide start or from a cue ID; existing TypeScript scenes take priority. Coordinates are in 1920x1080 pixels. A replacement list [] clears the graphics.', inputSchema:obj({id:str('Project slug'),slide_id:str('Existing slide ID'),elements:{type:'array',maxItems:30,items:{type:'object',additionalProperties:false,properties:{id:str('Unique object ID'),kind:{type:'string',enum:['text','rect','circle','line','bar']},x:num('Left coordinate'),y:num('Top coordinate'),w:num('Width or horizontal line delta'),h:num('Height or vertical line delta'),text:str('Display text, required for text kind'),radius:num('Radius / corner radius'),size:num('Font size'),line_width:num('Line width'),color:{type:'string',enum:['h1','accent','text','pos','panel','bg']},font:{type:'string',enum:['display','sans','mono']},weight:{type:'string',enum:['regular','bold']},cue_id:str('Start animation when this cue begins'),effect:{type:'string',enum:['fade','rise','slide','pop']},duration:num('Entrance duration in seconds')},required:['id','kind','x','y']}}},['id','slide_id','elements']) },
 { name:'list_scene_tasks', description:'List all scene assignments, assignees, full prompts, statuses and individual checkpoints. Agents should call this after opening a video project.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_scene_task', description:'Get the full scene-specific agent assignment, detailed brief, deliverables, checkpoints and revision.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID')},['id','slide_id']) },
 { name:'set_scene_task', description:'Create or edit the full assignment for one scene (not the deck). Requires the latest expected_revision from get_scene_task or list_scene_tasks to avoid overwriting another agent. Keeps unspecified fields unchanged.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),expected_revision:{type:'integer',minimum:0},title:str('Scene task title'),assignee:str('Agent/owner name'),brief:str('Detailed task specification, up to 20000 characters'),deliverables:str('Acceptance criteria and deliverable requirements'),status:{type:'string',enum:['todo','in_progress','review','done','blocked']},checkpoints:{type:'array',maxItems:60,items:obj({id:str('Stable checkpoint id'),title:str('Checkpoint action'),done:{type:'boolean'},note:str('Completion evidence or blocker')},['id','title'])}},['id','slide_id','expected_revision']) },
 { name:'set_scene_checkpoint', description:'Update exactly one scene checkpoint and preserve all other scenes/tasks. Use after completing and checking a milestone; provide evidence in note.', inputSchema:obj({id:str('Project slug'),slide_id:str('Scene ID'),checkpoint_id:str('Checkpoint ID'),done:{type:'boolean'},note:str('Evidence or details')},['id','slide_id','checkpoint_id']) },
 { name:'reorder_slides', description:'Reorder existing slides without losing any cue IDs.', inputSchema:obj({id:str('Project slug'),slide_ids:{type:'array',items:{type:'string'}}},['id','slide_ids']) },
 { name:'render_video', description:'Start a server-side Chromium + WebCodecs + FFmpeg render job for a video. Poll get_render_status. Server rendering uses deterministic Chromium Canvas frames encoded with FFmpeg.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_render_status', description:'Get status of a render job and download URL when finished.', inputSchema:obj({id:str('Project slug')},['id']) },
 { name:'get_editor_link', description:'Get a browser link for opening a project in the hosted PressBuilder editor.', inputSchema:obj({id:str('Project slug')},['id']) }
].map(tool=>({...tool,securitySchemes:[{type:'oauth2',scopes:['mcp:tools']}]}));
export function makeMcp({ startRender, getRender, baseUrl }) {
  async function call(name, args) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new UserError('Arguments must be an object');
    switch(name) {
      case 'list_decks': return listDecks();
      case 'get_deck': return {...getDeck(args.id),project_readme:readmeStore.read(args.id),scene_tasks:taskStore.list(args.id).map(t=>({scene_id:t.scene_id,title:t.title,assignee:t.assignee,status:t.status,revision:t.revision,checkpoints_done:t.checkpoints.filter(c=>c.done).length,checkpoints_total:t.checkpoints.length}))};
      case 'get_project_context': {
        const d=getDeck(args.id);
        const tasks=taskStore.list(args.id);
        const summary=tasks.map(t=>({scene_id:t.scene_id,title:t.title,assignee:t.assignee,status:t.status,revision:t.revision,checkpoints_done:t.checkpoints.filter(c=>c.done).length,checkpoints_total:t.checkpoints.length}));
        const assigned=args.slide_id?taskStore.read(args.id,args.slide_id):undefined;
        return {project:{id:d.id,title:d.title,style:d.style,format:d.format,target:d.target,slides:d.slides.map(s=>({id:s.id,label:s.label,cues:s.cues.map(c=>({id:c.id,say:c.say,show:c.show}))}))},
          readme:readmeStore.read(args.id),scene_tasks:summary,...(assigned?{assigned_scene_task:assigned}:{})};
      }
      case 'get_project_readme': return readmeStore.read(args.id);
      case 'update_project_readme': return readmeStore.write(args.id,args.content,args.expected_revision);
      case 'list_scene_tasks': return taskStore.list(args.id);
      case 'get_scene_task': return taskStore.read(args.id,args.slide_id);
      case 'set_scene_task': {const {id,slide_id,expected_revision,...fields}=args;return taskStore.put(id,slide_id,fields,expected_revision)}
      case 'set_scene_checkpoint': {const {id,slide_id,checkpoint_id,...patch}=args;return taskStore.checkpoint(id,slide_id,checkpoint_id,patch)}
      case 'create_deck': { const d=createDeck(args);readmeStore.ensure(d.id);return d; }
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
