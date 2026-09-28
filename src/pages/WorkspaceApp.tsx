import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, BarChart3, Bell, Blocks, Bot, Check, ChevronsUpDown, History, LayoutDashboard, LogOut, Menu, MoreHorizontal, RotateCcw, Search, Sparkles, Truck, UserCog, Users, WandSparkles, X, Zap } from "lucide-react";
import { AlertDialog, DropdownMenu, Popover, Tooltip } from "radix-ui";
import type { DataRecord, Entity, View, Workspace } from "../types";
import { deriveAlerts } from "../services/aiEngine";
import { Dashboard } from "../components/Dashboard";
import { EntityTable } from "../components/EntityTable";
import { AutomationsPage } from "../components/AutomationsPage";
import { UsersRolesPage } from "../components/UsersRolesPage";
import { AssistantPanel } from "../components/AssistantPanel";
import { Hint } from "../components/ui/Hint";

const iconFor=(name:string)=>/customer|client|lead|owner/i.test(name)?<Users/>:/analytic/i.test(name)?<BarChart3/>:/deliver|logistic/i.test(name)?<Truck/>:<Blocks/>;

export function WorkspaceApp({workspace,setWorkspace,onReset}:{workspace:Workspace;setWorkspace:(w:Workspace)=>void;onReset:()=>void}){
 const [active,setActive]=useState("dashboard"),[assistant,setAssistant]=useState(false),[assistantModeHint,setAssistantModeHint]=useState<"operator"|"builder">("operator"),[mobileNav,setMobileNav]=useState(false),[delayedOnly,setDelayedOnly]=useState(false),[toast,setToast]=useState(""),[confirmReset,setConfirmReset]=useState(false);
 const searchRef=useRef<HTMLInputElement>(null);
 const currentUser=workspace.users.find(u=>u.id===workspace.currentUserId)||workspace.users[0],role=workspace.roles.find(r=>r.id===currentUser.roleId)||workspace.roles[0],permissions=role.permissions,entity=workspace.entities.find(e=>e.id===active);
 const notify=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(""),2800)};
 const updateEntity=(changed:Entity)=>setWorkspace({...workspace,entities:workspace.entities.map(e=>e.id===changed.id?changed:e),alerts:deriveAlerts(workspace.entities.map(e=>e.id===changed.id?changed:e))});
 const saveRecord=(record:DataRecord)=>{if(!entity)return;const exists=entity.records.some(r=>r.id===record.id),changed={...entity,records:exists?entity.records.map(r=>r.id===record.id?record:r):[record,...entity.records]};let next={...workspace,entities:workspace.entities.map(e=>e.id===changed.id?changed:e)};next=runWorkflows(next,entity,record,exists);next.alerts=deriveAlerts(next.entities);setWorkspace(next);notify(exists?"Record updated":"Record created")};
 const deleteRecord=(id:string)=>{if(!entity)return;updateEntity({...entity,records:entity.records.filter(r=>r.id!==id)});notify("Record deleted")};
 const saveView=(view:View)=>{setWorkspace({...workspace,views:[...workspace.views,view]});notify("View saved")};
 const openAssistant=(hint:"operator"|"builder"="operator")=>{setAssistantModeHint(hint);setAssistant(true)};
 const go=(id:string)=>{setActive(id);setDelayedOnly(false);setMobileNav(false)};
 const switchUser=(id:string)=>{setWorkspace({...workspace,currentUserId:id});notify("Demo user switched")};

 // Desktop shortcuts: ⌘K opens AI Builder (admins) or Operator, ⌘/ focuses search, Esc closes mobile nav.
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{const mod=e.metaKey||e.ctrlKey;if(mod&&e.key.toLowerCase()==="k"){e.preventDefault();openAssistant(permissions.editStructure?"builder":"operator")}else if(mod&&e.key==="/"){e.preventDefault();searchRef.current?.focus()}else if(e.key==="Escape")setMobileNav(false)};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[permissions.editStructure]);

 const navItem=(id:string,icon:ReactNode,label:string,meta?:ReactNode)=><button key={id} className={active===id?"active":""} aria-current={active===id?"page":undefined} onClick={()=>go(id)}>{icon}<span>{label}</span>{meta}</button>;

 return <Tooltip.Provider delayDuration={400} skipDelayDuration={150}><div className="app-shell">
  {mobileNav&&<div className="sidebar-scrim" onClick={()=>setMobileNav(false)} aria-hidden/>}
  <aside className={`sidebar ${mobileNav?"open":""}`} aria-label="Workspace navigation">
   <div className="sidebar-brand"><span className="brand-mark"><Blocks size={17}/></span><div><strong>AI Business OS</strong><small>Adaptive workspace</small></div><button className="mobile-close" aria-label="Close navigation" onClick={()=>setMobileNav(false)}><X/></button></div>
   <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="workspace-switch" aria-label="Workspace menu"><div className="company-avatar">{workspace.companyName.slice(0,2).toUpperCase()}</div><div><strong>{workspace.companyName}</strong><small>{workspace.industry} workspace</small></div><ChevronsUpDown size={14}/></button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="ds-menu" sideOffset={4} align="start" collisionPadding={8}>
     <DropdownMenu.Label className="ds-menu-label">{workspace.companyName} · {workspace.architecture}</DropdownMenu.Label>
     <DropdownMenu.Item className="ds-menu-item" onSelect={()=>go("dashboard")}><LayoutDashboard/>Dashboard</DropdownMenu.Item>
     <DropdownMenu.Item className="ds-menu-item" onSelect={()=>go("automations")}><Zap/>Automations</DropdownMenu.Item>
     <DropdownMenu.Item className="ds-menu-item" onSelect={()=>go("users")}><UserCog/>Users & roles</DropdownMenu.Item>
     <DropdownMenu.Item className="ds-menu-item" onSelect={()=>go("history")}><History/>AI change history</DropdownMenu.Item>
     <DropdownMenu.Separator className="ds-menu-sep"/>
     <DropdownMenu.Item className="ds-menu-item danger" onSelect={()=>setConfirmReset(true)}><RotateCcw/>Reset demo…</DropdownMenu.Item>
    </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
   <nav>
    {navItem("dashboard",<LayoutDashboard/>,"Dashboard")}
    <div className="nav-label">Modules</div>
    {workspace.entities.map(e=>navItem(e.id,iconFor(e.name),e.name,<small>{e.records.length}</small>))}
    <div className="nav-label">Manage</div>
    {navItem("automations",<Zap/>,"Automations",<em>{workspace.workflows.filter(w=>w.active).length}</em>)}
    {navItem("users",<UserCog/>,"Users & roles")}
    {navItem("history",<History/>,"AI change history")}
   </nav>
   <div className="sidebar-bottom">
    <button onClick={()=>openAssistant("operator")}><Bot/><span>AI Operator</span></button>
    <Hint label={permissions.editStructure?"Change modules, fields and workflows":"Admin only"} side="right"><button onClick={()=>openAssistant("builder")} className={!permissions.editStructure?"disabled":""} aria-disabled={!permissions.editStructure}><WandSparkles/><span>AI Builder</span><kbd>⌘K</kbd></button></Hint>
    <button className="reset-demo" onClick={()=>setConfirmReset(true)}><RotateCcw/><span>Reset demo</span></button>
    <div className="user"><div className="avatar">{currentUser.initials}</div><div><strong>{currentUser.name}</strong><small>{role.name}</small></div>
     <DropdownMenu.Root><DropdownMenu.Trigger asChild><button aria-label="Account menu"><MoreHorizontal size={16}/></button></DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content className="ds-menu" side="top" align="end" sideOffset={6} collisionPadding={8}>
       <DropdownMenu.Label className="ds-menu-label">Preview as demo user</DropdownMenu.Label>
       <DropdownMenu.RadioGroup value={currentUser.id} onValueChange={switchUser}>{workspace.users.map(u=><DropdownMenu.RadioItem key={u.id} value={u.id} className="ds-menu-item"><DropdownMenu.ItemIndicator className="ds-menu-check"><Check size={13}/></DropdownMenu.ItemIndicator>{u.name}<span className="ds-menu-meta">{workspace.roles.find(r=>r.id===u.roleId)?.name}</span></DropdownMenu.RadioItem>)}</DropdownMenu.RadioGroup>
       <DropdownMenu.Separator className="ds-menu-sep"/>
       <DropdownMenu.Item className="ds-menu-item" onSelect={()=>go("users")}><UserCog/>Users & roles</DropdownMenu.Item>
       <DropdownMenu.Item className="ds-menu-item danger" onSelect={()=>setConfirmReset(true)}><LogOut/>Leave demo…</DropdownMenu.Item>
      </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
    </div>
   </div>
  </aside>
  <main className="workspace-main">
   <header className="topbar">
    <button className="menu-btn" aria-label="Open navigation" onClick={()=>setMobileNav(true)}><Menu/></button>
    <div className="global-search"><Search/><input ref={searchRef} placeholder="Search anything..." aria-label="Search"/><kbd>⌘/</kbd></div>
    <div className="permission-badge"><span>{role.name}</span>{!permissions.editRecords&&<small>Read only</small>}</div>
    <div className="top-actions">
     <Popover.Root><Hint label="Notifications"><Popover.Trigger asChild><button aria-label={`Notifications, ${workspace.alerts.length} alerts`} className="icon-button"><Bell/>{workspace.alerts.length>0&&<span className="badge-dot">{workspace.alerts.length}</span>}</button></Popover.Trigger></Hint>
      <Popover.Portal><Popover.Content className="popover notif-pop" align="end" sideOffset={8} collisionPadding={8}>
       <div className="notif-head"><strong>Needs attention</strong><span>{workspace.alerts.length}</span></div>
       {workspace.alerts.length===0?<p className="notif-empty">You’re all caught up.</p>:workspace.alerts.slice(0,6).map(a=><Popover.Close asChild key={a.id}><button className="notif-row" onClick={()=>a.entityId&&go(a.entityId)}><span className={`sev ${a.severity}`}><AlertCircle size={14}/></span><span><strong>{a.title}</strong><small>{a.detail}</small></span></button></Popover.Close>)}
      </Popover.Content></Popover.Portal></Popover.Root>
     <Hint label="Ask your workspace" shortcut="⌘K"><button className="assistant-top" onClick={()=>openAssistant("operator")}><Sparkles/>Ask AI</button></Hint>
     <div className="avatar" title={currentUser.name}>{currentUser.initials}</div>
    </div>
   </header>
   {active==="dashboard"&&<Dashboard workspace={workspace} onAsk={()=>openAssistant("operator")} onOpen={go}/>}
   {entity&&<EntityTable key={entity.id} entity={entity} workspace={workspace} canEdit={permissions.editRecords} canDelete={permissions.deleteRecords} delayedOnly={delayedOnly} onClearDelayed={()=>setDelayedOnly(false)} onSaveRecord={saveRecord} onDeleteRecord={deleteRecord} onSaveView={saveView}/>}
   {active==="automations"&&<AutomationsPage workflows={workspace.workflows} canEdit={permissions.editStructure} onCreate={()=>openAssistant("builder")} onToggle={id=>{setWorkspace({...workspace,workflows:workspace.workflows.map(w=>w.id===id?{...w,active:!w.active}:w)});notify("Automation updated")}}/>}
   {active==="users"&&<UsersRolesPage workspace={workspace} canManage={permissions.manageUsers} onSwitch={switchUser}/>}
   {active==="history"&&<HistoryPage workspace={workspace}/>}
  </main>
  {assistant&&<AssistantPanel key={assistantModeHint} initialMode={assistantModeHint} workspace={workspace} setWorkspace={setWorkspace} canBuild={permissions.editStructure} setActiveEntity={id=>{setActive(id);setAssistant(false)}} setDelayedOnly={setDelayedOnly} onClose={()=>setAssistant(false)} onToast={notify}/>}
  <AlertDialog.Root open={confirmReset} onOpenChange={setConfirmReset}><AlertDialog.Portal><AlertDialog.Overlay className="alert-overlay"/><AlertDialog.Content className="confirm-box"><RotateCcw/><AlertDialog.Title>Reset the demo workspace?</AlertDialog.Title><AlertDialog.Description>All records, views and AI changes saved in this browser will be removed and you’ll return to onboarding.</AlertDialog.Description><div><AlertDialog.Cancel asChild><button className="secondary">Cancel</button></AlertDialog.Cancel><AlertDialog.Action asChild><button className="danger-solid" onClick={onReset}>Reset demo</button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  {toast&&<div className="toast" role="status"><span>✓</span>{toast}</div>}
 </div></Tooltip.Provider>
}

function runWorkflows(w:Workspace,entity:Entity,record:DataRecord,exists:boolean):Workspace{const next=structuredClone(w),now=new Date().toISOString(),isOrder=/orders/i.test(entity.name),isDelivery=/deliver/i.test(entity.name);if(isOrder&&record.status==="Confirmed"&&next.workflows.find(x=>x.id==="confirmed-order-task"&&x.active)){let tasks=next.entities.find(e=>e.id==="tasks"||/operations/i.test(e.name));if(!tasks){tasks={id:"tasks",name:"Tasks",fields:[{id:"name",name:"Task","type":"text"},{id:"sourceRecord",name:"Source record","type":"text"},{id:"owner",name:"Owner","type":"text"},{id:"due",name:"Due date","type":"date"},{id:"status",name:"Status","type":"status",options:["To do","In progress","Done"]}],records:[]};next.entities.push(tasks)}if(!tasks.records.some(r=>r.sourceRecord===record.id)){const values:DataRecord={id:`AUTO-${Date.now()}`,sourceRecord:record.id};tasks.fields.forEach(f=>{if(f.id==="name")values[f.id]=`Prepare ${record.orderNo||record.id}`;else if(f.id==="sourceRecord")values[f.id]=record.id;else if(f.id==="owner")values[f.id]=String(record.owner||"");else if(f.id==="due")values[f.id]=String(record.delivery||"");else if(f.id==="status")values[f.id]=f.options?.[0]||"To do";else if(f.type==="checkbox")values[f.id]=false;else values[f.id]=""});tasks.records.unshift(values)}const flow=next.workflows.find(x=>x.id==="confirmed-order-task")!;flow.runs.unshift({id:`run-${Date.now()}`,at:now,status:"success",summary:`Created task for ${record.orderNo||record.id}`})}if(isDelivery&&record.status==="Delayed"&&!exists){next.alerts.unshift({id:`alert-${record.id}`,title:"Delivery delayed",detail:String(record.deliveryNo||record.id),severity:"high",entityId:entity.id,recordId:record.id})}return next}
function HistoryPage({workspace}:{workspace:Workspace}){return <div className="entity-page history-page"><div className="page-heading"><div><span className="overline">WORKSPACE / GOVERNANCE</span><h1>AI change history</h1><p>A transparent record of proposed and applied structural changes.</p></div></div><div className="history-list">{workspace.changeHistory.map(c=><article key={c.id}><span className={c.status}>{c.status==="applied"?"✓":"×"}</span><div><h3>{c.summary}</h3><p>“{c.command}”</p><small>{new Date(c.at).toLocaleString("en-GB")} · {workspace.users.find(u=>u.id===c.userId)?.name||"User"}</small></div><em>{c.status}</em></article>)}{workspace.changeHistory.length===0&&<div className="empty-state"><History/><h3>No AI changes yet</h3><p>Confirmed Builder changes will be recorded here.</p></div>}</div></div>}
