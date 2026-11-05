const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const str=(s,n=10000)=>typeof s==='string'&&s.length<=n;
const isoDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const time=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const mins=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const cleanText=s=>str(s)?s.trim():'';
export function validate(d){
 if(!d||d.version!==1||!['tutors','groups','tasks','entries'].every(k=>Array.isArray(d[k])&&d[k].length<=20000&&d[k].every(x=>x&&str(x.id,100)&&x.id)&&new Set(d[k].map(x=>x.id)).size===d[k].length))fail('Structure des données invalide.');
 if(!d.groups.every(g=>str(g.name,100)&&g.name.trim()&&str(g.level,100)&&g.level.trim()))fail('Groupe ou niveau invalide.');
 if(!d.tutors.every(t=>str(t.name,100)&&t.name.trim()&&str(t.email,254)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email)&&Array.isArray(t.groups)&&t.groups.every(g=>d.groups.some(x=>x.id===g))))fail('Chaque tuteur doit avoir une adresse e-mail valide et des groupes existants.');
 if(new Set(d.tutors.map(t=>t.email.toLowerCase())).size!==d.tutors.length)fail('Cette adresse e-mail est déjà associée à un tuteur.');
 const refs=e=>d.tutors.some(t=>t.id===e.tutor&&t.groups.includes(e.group))&&d.groups.some(g=>g.id===e.group);
 if(!d.tasks.every(t=>refs(t)&&str(t.title,250)&&t.title.trim()&&isoDate(t.due)))fail('Tâche invalide ou groupe non affecté au tuteur.');
 if(!d.entries.every(e=>refs(e)&&isoDate(e.date)&&e.date<=new Date().toISOString().slice(0,10)&&time(e.start)&&time(e.end)&&mins(e.end)>mins(e.start)&&str(e.work,4000)&&e.work.trim()&&str(e.result,2000)&&str(e.proof,3000)&&(!e.proof||/^https?:\/\//i.test(e.proof))&&['À vérifier','Validée','À compléter'].includes(e.status)&&(!e.task||d.tasks.some(t=>t.id===e.task&&t.tutor===e.tutor&&t.group===e.group))&&Array.isArray(e.history)&&e.history.length<=2000&&e.history.every(h=>str(h.at,100)&&str(h.status,100)&&str(h.note,2000))))fail('Intervention invalide. Vérifiez la date, les horaires, le travail et le groupe.');
 const sorted=[...d.entries].sort((a,b)=>(a.tutor+a.date+a.start).localeCompare(b.tutor+b.date+b.start));
 for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i];if(a.tutor===b.tutor&&a.date===b.date&&a.end>b.start)fail('Deux interventions du même tuteur se chevauchent.');}
 return d;
}
export function scope(d,user){if(user.role==='responsable')return d;return {...d,tutors:d.tutors.filter(t=>t.id===user.tutorId),groups:d.groups.filter(g=>user.groups.includes(g.id)),tasks:d.tasks.filter(t=>t.tutor===user.tutorId),entries:d.entries.filter(e=>e.tutor===user.tutorId)}}
export function authorizeChange(before,submitted,user){
 const now=new Date().toISOString(),after=structuredClone(submitted);
 if(user.role==='tuteur'){
  const visible=scope(before,user);
  if(!['tutors','groups','tasks'].every(k=>same(visible[k],after[k])))fail('Seul le responsable peut gérer l’équipe et les tâches.',403);
  if(visible.entries.some(e=>!after.entries.some(x=>x.id===e.id)))fail('Seul le responsable peut supprimer une intervention.',403);
  for(const e of after.entries){const old=before.entries.find(x=>x.id===e.id);if(e.tutor!==user.tutorId||!user.groups.includes(e.group)||(old&&old.tutor!==user.tutorId))fail('Intervention hors de vos groupes.',403);if(!old||!same(old,e)){if(e.status!=='À vérifier')fail('Seul le responsable peut valider le travail.',403);e.status='À vérifier';e.history=[...(old?.history||[]),{at:now,status:old?'Saisie modifiée — à vérifier':'Intervention enregistrée',note:'Saisie par '+user.email}];}}
  after.tutors=before.tutors;after.groups=before.groups;after.tasks=before.tasks;after.entries=[...before.entries.filter(e=>e.tutor!==user.tutorId),...after.entries];
 }else{
  for(const e of after.entries){const old=before.entries.find(x=>x.id===e.id);if(!old){if(e.status!=='À vérifier')fail('Une nouvelle intervention doit être vérifiée.');e.history=[{at:now,status:'Intervention enregistrée',note:'Saisie par '+user.email}];continue}if(same(old,e))continue;
   const fields=['tutor','group','date','start','end','task','work','result','proof'];const edited=fields.some(k=>old[k]!==e[k]);
   if(edited){if(e.status!=='À vérifier')fail('Une modification doit être vérifiée à nouveau.');e.history=[...old.history,{at:now,status:'Saisie modifiée — à vérifier',note:'Modification par '+user.email}];}
   else{const note=cleanText(e.history.at(-1)?.note);if(!note)fail('Ajoutez une observation pour enregistrer le contrôle.');e.history=[...old.history,{at:now,status:e.status,note,reviewer:user.email}];}
  }
 }
 return validate(after);
}
export function createWorker(assets){return {async fetch(request,env){try{
 const path=new URL(request.url).pathname;
 if(['/app.js','/style.css'].includes(path))return new Response(assets[path],{headers:{'content-type':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'}});
 if(path!=='/'&&path!=='/index.html'&&!path.startsWith('/api/'))return new Response('Introuvable',{status:404});
 const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
 if(!id||!email){if(path.startsWith('/api/'))return json({error:'Connectez-vous pour continuer.'},401);return new Response(assets.login,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})}
 if(!env.DB)return json({error:'La base de données partagée n’est pas encore configurée.'},503);
 if(request.method!=='GET'){if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Requête refusée.'},403)}
 // La première ouverture privée appartient au propriétaire du Site.
 await env.DB.prepare('INSERT OR IGNORE INTO relais_state (id,owner_id) VALUES (1,?)').bind(id).run();
 const row=await env.DB.prepare('SELECT * FROM relais_state WHERE id=1').first(),all=JSON.parse(row.payload);
 const member=all.tutors.find(t=>t.email.toLowerCase()===email);
 const user=row.owner_id===id?{role:'responsable',email}:{role:'tuteur',email,tutorId:member?.id,groups:member?.groups||[]};
 if(user.role==='tuteur'&&!member){if(path.startsWith('/api/'))return json({error:'Votre compte n’est pas encore autorisé. Demandez au responsable d’ajouter votre adresse e-mail.'},403);return new Response(assets.denied.replace('{{EMAIL}}',email.replace(/[&<>"']/g,'')),{status:403,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})}
 const result=()=>({data:scope(all,user),revision:row.revision,user});
 if(path==='/api/state'&&request.method==='GET')return json(result());
 if(path==='/api/state'&&request.method==='PUT'){
  if(Number(request.headers.get('content-length')||0)>4000000)return json({error:'Volume de données trop important.'},413);
  const raw=await request.text();if(raw.length>4000000)return json({error:'Volume de données trop important.'},413);
  const input=JSON.parse(raw);if(input.revision!==row.revision)return json({error:'Les données ont changé sur un autre appareil. La vue a été rechargée ; recommencez votre modification.'},409);
  const d=authorizeChange(all,input.data,user),r=await env.DB.prepare('UPDATE relais_state SET payload=?,revision=revision+1 WHERE id=1 AND revision=?').bind(JSON.stringify(d),row.revision).run();
  if(!r.meta.changes)return json({error:'Modification simultanée. Rechargez puis recommencez.'},409);
  return json({data:scope(d,user),revision:row.revision+1,user});
 }
 if(path.startsWith('/api/'))return json({error:'Méthode non autorisée.'},405);
 const boot=JSON.stringify(result()).replace(/</g,'\\u003c');
 return new Response(assets.html.replace('<script src="app.js"></script>',`<script>window.RELAIS_BOOT=${boot}</script><script src="app.js"></script>`),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'}});
 }catch(e){return json({error:e.status?e.message:'Impossible de traiter la demande. Réessayez ou contactez le responsable.'},e.status||500)}}}}
