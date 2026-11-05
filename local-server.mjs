import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes,randomUUID,scrypt as scryptCb,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {createWorker} from './server.mjs';
const scrypt=promisify(scryptCb),root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.RELAIS_PORT||4173),host=process.env.RELAIS_HOST||'127.0.0.1',origin=process.env.RELAIS_ORIGIN||`http://127.0.0.1:${port}`;
if(!/^https?:\/\//.test(origin))throw Error('RELAIS_ORIGIN doit être une origine HTTP ou HTTPS.');
if(host!=='127.0.0.1'&&!origin.startsWith('https://'))throw Error('Pour un accès réseau, configurez RELAIS_ORIGIN en HTTPS et un proxy TLS.');
const dataDir=process.env.RELAIS_DATA_DIR||path.join(root,'data');mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(path.join(dataDir,'relais.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='relais_state'").get())db.exec(readFileSync(path.join(root,'drizzle/0000_relais.sql'),'utf8'));
db.exec(`CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,role TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL);CREATE UNIQUE INDEX IF NOT EXISTS one_owner ON accounts(role) WHERE role='responsable';CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,expires INTEGER NOT NULL);`);
const env={DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}}}}};
const read=n=>readFileSync(path.join(root,'dist',n),'utf8');
const portableHtml=read('index.html').replace('Le tuteur se connectera avec cette adresse via ChatGPT.','Le tuteur se connectera avec cette adresse et le mot de passe défini par le responsable.');
const assets={html:portableHtml,'/app.js':read('app.js'),'/style.css':read('style.css'),login:'',denied:''};
const worker=createWorker(assets),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digest=s=>createHash('sha256').update(s).digest('hex');
const accountCount=()=>db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
const cookie=(token,age)=>`relais_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${origin.startsWith('https://')?'; Secure':''}`;
function page(title,text,form=''){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relais — ${title}</title><link rel="stylesheet" href="/style.css"></head><body><main style="max-width:520px;margin:8vh auto;padding:28px"><div class="brand" style="margin-bottom:36px"><span class="mark">r.</span> relais</div><h1>${title}</h1><p style="margin:16px 0 26px">${text}</p>${form}</main></body></html>`}
function authPage(setup=false,error=''){const title=setup?'Créer le compte responsable':'Connexion à votre espace';return page(title,setup?'Créez votre compte pour configurer les groupes et ouvrir les accès des tuteurs.':'Retrouvez vos tâches et enregistrez le travail effectué.',`<form method="post" action="${setup?'/auth/setup':'/auth/login'}"><label>Adresse e-mail<input name="email" type="email" required maxlength="254" autocomplete="username"></label><label>Mot de passe${setup?' (10 caractères minimum)':''}<input name="password" type="password" required minlength="${setup?10:1}" maxlength="200" autocomplete="${setup?'new-password':'current-password'}"></label>${error?`<p role="alert" class="error">${escape(error)}</p>`:''}<button class="primary" type="submit" style="width:100%;margin-top:12px">${setup?'Créer mon compte':'Se connecter'}</button></form>`)}
const reply=(res,status,body,headers={})=>{res.writeHead(status,{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin',...headers});res.end(body)};
const sendJson=(res,status,value)=>reply(res,status,JSON.stringify(value),{'content-type':'application/json; charset=utf-8'});
async function body(req){let s='',size=0;for await(const chunk of req){size+=chunk.length;if(size>4e6)throw Object.assign(Error('Demande trop volumineuse.'),{status:413});s+=chunk}return s}
async function passwordHash(password,salt){return (await scrypt(password,salt,64)).toString('hex')}
function identity(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('relais_session='))?.slice(15);if(!token)return null;return db.prepare('SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token=? AND s.expires>?').get(digest(token),Date.now())||null}
function createSession(res,account){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),account.id,Date.now()+8*3600e3);reply(res,303,'',{'location':'/','set-cookie':cookie(token,8*3600)})}
const attempts=new Map();
function limited(req){const key=req.socket.remoteAddress,now=Date.now();if(attempts.size>10000)attempts.clear();let a=attempts.get(key);if(!a||a.until<now){a={count:0,until:now+60000};attempts.set(key,a)}return ++a.count>15}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin),route=url.pathname;
 if(!['GET','POST','PUT'].includes(req.method))return reply(res,405,'Méthode non autorisée.');
 if(req.method!=='GET'&&req.headers.origin!==origin)return sendJson(res,403,{error:'Origine de la demande refusée.'});
 const account=identity(req);
 if(route==='/auth/login'||route==='/auth/setup'){
  const setup=route.endsWith('setup'),count=accountCount();if(setup&&count)return reply(res,303,'',{'location':'/auth/login'});if(!setup&&!count)return reply(res,303,'',{'location':'/auth/setup'});
  if(req.method==='GET')return reply(res,200,authPage(setup),{'content-type':'text/html; charset=utf-8'});
  if(req.method!=='POST')return reply(res,405,'Méthode non autorisée.');
  if(limited(req))return reply(res,429,authPage(setup,'Trop de tentatives. Réessayez dans une minute.'),{'content-type':'text/html; charset=utf-8'});
  const form=new URLSearchParams(await body(req)),email=(form.get('email')||'').trim().toLowerCase(),password=form.get('password')||'';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length>200||(setup&&password.length<10))return reply(res,400,authPage(setup,'Adresse e-mail ou mot de passe invalide.'),{'content-type':'text/html; charset=utf-8'});
  if(setup){const salt=randomBytes(16).toString('hex'),hash=await passwordHash(password,salt),id=randomUUID();try{db.exec('BEGIN IMMEDIATE');db.prepare("INSERT INTO accounts VALUES (?,?,'responsable',?,?)").run(id,email,salt,hash);db.prepare('INSERT OR IGNORE INTO relais_state(id,owner_id) VALUES (1,?)').run(id);db.exec('COMMIT')}catch{db.exec('ROLLBACK');return reply(res,409,authPage(false,'Un compte responsable existe déjà.'),{'content-type':'text/html; charset=utf-8'})}return createSession(res,{id})}
  const a=db.prepare('SELECT * FROM accounts WHERE email=?').get(email);const candidate=await passwordHash(password,a?.salt||'inexistent-user-salt');if(!a||!timingSafeEqual(Buffer.from(candidate,'hex'),Buffer.from(a.hash,'hex')))return reply(res,401,authPage(false,'Adresse e-mail ou mot de passe incorrect.'),{'content-type':'text/html; charset=utf-8'});
  return createSession(res,a);
 }
 if(route==='/signout-with-chatgpt'||route==='/auth/logout'){if(account){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('relais_session='))?.slice(15);if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token))}return reply(res,303,'',{'location':'/auth/login','set-cookie':cookie('',0)})}
 if(route==='/auth/accounts'&&req.method==='POST'){
  if(!account||account.role!=='responsable')return sendJson(res,403,{error:'Action réservée au responsable.'});
  const input=JSON.parse(await body(req)),email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');if(password.length<10||password.length>200)return sendJson(res,400,{error:'Utilisez un mot de passe entre 10 et 200 caractères.'});
  const state=JSON.parse(db.prepare('SELECT payload FROM relais_state WHERE id=1').get().payload);if(!state.tutors.some(t=>t.email.toLowerCase()===email))return sendJson(res,400,{error:'Ajoutez d’abord ce tuteur à l’équipe.'});
  const previous=db.prepare('SELECT * FROM accounts WHERE email=?').get(email);if(previous?.role==='responsable')return sendJson(res,400,{error:'Cette adresse est celle du responsable.'});
  const salt=randomBytes(16).toString('hex'),hash=await passwordHash(password,salt),id=previous?.id||randomUUID();db.exec('BEGIN IMMEDIATE');try{if(previous){db.prepare('UPDATE accounts SET salt=?,hash=? WHERE id=?').run(salt,hash,id);db.prepare('DELETE FROM sessions WHERE account_id=?').run(id)}else db.prepare("INSERT INTO accounts VALUES (?,?,'tuteur',?,?)").run(id,email,salt,hash);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return sendJson(res,200,{ok:true});
 }
 if(['/app.js','/style.css'].includes(route)){const r=await worker.fetch(new Request(origin+route),env);return reply(res,r.status,Buffer.from(await r.arrayBuffer()),Object.fromEntries(r.headers))}
 if(!account){if(route.startsWith('/api/'))return sendJson(res,401,{error:'Votre session a expiré. Reconnectez-vous.'});return reply(res,303,'',{'location':accountCount()?'/auth/login':'/auth/setup'})}
 const headers=new Headers();if(req.headers.origin)headers.set('origin',req.headers.origin);if(req.headers['content-type'])headers.set('content-type',req.headers['content-type']);headers.set('oai-authenticated-user-id',account.id);headers.set('oai-authenticated-user-email',account.email);
 const request=new Request(origin+route,{method:req.method,headers,body:req.method==='GET'?undefined:await body(req)}),r=await worker.fetch(request,env);let responseBody=await r.text();if(route==='/'||route==='/index.html')responseBody=responseBody.replace('window.RELAIS_BOOT=', 'window.RELAIS_PORTABLE=true;window.RELAIS_BOOT=');return reply(res,r.status,responseBody,Object.fromEntries(r.headers));
 }catch(e){sendJson(res,e.status||500,{error:e.status?e.message:'Impossible de traiter la demande. Réessayez.'})}});
server.listen(port,host,()=>console.log(`Relais disponible : ${origin}\nCréez votre compte responsable à la première ouverture.\nDonnées : ${dataDir}`));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Le port ${port} est déjà utilisé. Ouvrez ${origin} ou choisissez RELAIS_PORT.`:error.message);process.exitCode=1});
