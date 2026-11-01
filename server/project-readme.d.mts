export interface ProjectReadme { id: string; filename: 'README.md'; content: string; revision: string; source: 'saved'|'seed'|'generated'; updated_at: string|null }
export function projectReadmeStore(args: {root: string; seedRoot?: string; getDeck: (id:string)=>{id:string;title:string;style?:string;text:string;target:number|null;format:{height:number;fps:number};slides:{id:string;label:string}[]}}): {
  read: (id:string)=>ProjectReadme;
  write: (id:string, content:string, expected_revision:string)=>ProjectReadme;
  ensure: (id:string)=>ProjectReadme;
};
