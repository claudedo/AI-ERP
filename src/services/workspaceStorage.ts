import type { Workspace } from "../types";
import { demoWorkflows, relationsFor, roles, users } from "../data/templates";
import { deriveAlerts } from "./aiEngine";
export interface WorkspaceRepository{load():Workspace|null;save(workspace:Workspace):void;clear():void}
const KEY="ai-business-os-workspace";
export const localWorkspaceRepository:WorkspaceRepository={load(){try{const raw=JSON.parse(localStorage.getItem(KEY)||"null") as Workspace|null;return raw?migrate(raw):null}catch{return null}},save(w){try{localStorage.setItem(KEY,JSON.stringify(w))}catch(error){console.error("Workspace could not be saved locally",error)}},clear(){try{localStorage.removeItem(KEY)}catch(error){console.error("Workspace could not be cleared locally",error)}}};
function migrate(w:Workspace):Workspace{const entities=(w.entities||[]).filter(e=>e.name!=="Dashboard"&&e.name!=="Automations").map((e,ei)=>({...e,records:e.records.map((r,ri)=>({...r,id:String(r.id||r.orderNo||r.name||`${e.id}-${ei}-${ri}`)}))}));return{...w,entities,relations:w.relations||relationsFor(entities),views:w.views||[],workflows:(w.workflows||structuredClone(demoWorkflows)).map(x=>({...x,runs:x.runs||[]})),users:w.users||structuredClone(users),roles:w.roles||structuredClone(roles),currentUserId:w.currentUserId||"usr-admin",changeHistory:w.changeHistory||[],alerts:w.alerts||deriveAlerts(entities),version:w.version||2}}
