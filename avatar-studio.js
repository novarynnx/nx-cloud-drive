import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/FBXLoader.js";
import { STLLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/STLLoader.js";

"use strict";

// Keep this project URL and publishable key in sync with index.html.
// A publishable/anon key is intended for browser use. Never use a service-role secret here.
const SUPABASE_URL = "https://jlpjvrribbjtdhdenpsh.supabase.co";
const SUPABASE_KEY = "sb_publishable_BiKDAGYZQVNJWC0yD9ldsA_99wcLTIw";
const BUCKET = "nx-assets";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);
const CATEGORIES = ["Accessory","Hair","Face","Shirt","Pants","Body Part","Layered Clothing","Animation","Bundle","Texture","Model","Other"];

const ATTACHMENTS = {
  Head:[0,4.16,0], UpperTorso:[0,3.23,0], LowerTorso:[0,2.52,0],
  LeftUpperArm:[-0.64,3.34,0], LeftLowerArm:[-0.67,2.76,0], LeftHand:[-0.67,2.34,0],
  RightUpperArm:[0.64,3.34,0], RightLowerArm:[0.67,2.76,0], RightHand:[0.67,2.34,0],
  LeftUpperLeg:[-0.23,1.80,0], LeftLowerLeg:[-0.23,0.98,0], LeftFoot:[-0.23,0.22,0.08],
  RightUpperLeg:[0.23,1.80,0], RightLowerLeg:[0.23,0.98,0], RightFoot:[0.23,0.22,0.08]
};
const DEFAULT_ATTACHMENT = {
  Hair:"Head", Face:"Head", Accessory:"Head", Bundle:"UpperTorso", Shirt:"UpperTorso",
  "Layered Clothing":"UpperTorso", Pants:"LowerTorso", "Body Part":"UpperTorso",
  Model:"Head", Texture:"UpperTorso", Animation:"UpperTorso", Other:"Head"
};
let user = null;
let scene, camera, renderer, controls, avatarRoot, resizeObserver;
let itemGroups = new Map();
let assets = [];
let outfits = [];
let currentItems = [];
let selectedKey = null;
let currentOutfitId = null;
let currentRig = "R15";
let loadingRevision = 0;
let busy = false;

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `nx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const val = (id, fallback=0) => { const v=Number($(id).value); return Number.isFinite(v) ? v : fallback; };
const cleanName = name => String(name || "asset").replace(/[\\/]/g,"_").replace(/[\u0000-\u001f]/g,"_");
function status(message, isError=false) { $("studioStatus").textContent=message||""; $("studioStatus").classList.toggle("error",!!isError); }
function dirty(message="มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก") { $("dirtyStatus").textContent=message; }
function sizeText(bytes) { bytes=Number(bytes)||0; return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(1)} MB`; }
function safeUrl(raw) { if(!raw) return ""; try { const u=new URL(raw); return ["http:","https:"].includes(u.protocol)?u.href:""; } catch { return ""; } }
function normTransform(source={}) {
  const p=source.position||{}, r=source.rotation||{};
  const number=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  return {position:{x:number(p.x),y:number(p.y),z:number(p.z)},rotation:{x:number(r.x),y:number(r.y),z:number(r.z)},scale:Math.min(10,Math.max(.05,number(source.scale,1)))};
}
function normaliseItem(raw={}) {
  const category=CATEGORIES.includes(raw.category)?raw.category:"Other";
  return {
    instance_id:String(raw.instance_id||uid()), asset_record_id:raw.asset_record_id||null,
    name:String(raw.name||"Avatar Asset").slice(0,160),category,
    item_type:raw.item_type==="custom"||raw.file_path?"custom":"catalog",
    asset_id:raw.asset_id==null?"":String(raw.asset_id), asset_url:safeUrl(raw.asset_url||""),
    file_path:raw.file_path||"",file_name:raw.file_name||"",mime_type:raw.mime_type||"",
    attachment:Object.prototype.hasOwnProperty.call(ATTACHMENTS,raw.attachment)?raw.attachment:(DEFAULT_ATTACHMENT[category]||"Head"),
    transform:normTransform(raw.transform)
  };
}

function initScene() {
  const host=$("studioViewport");
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x0b0d12);
  camera=new THREE.PerspectiveCamera(42,1,.1,100); camera.position.set(6.2,4.5,8.0);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.07;
  controls.target.set(0,2.3,0); controls.minDistance=3.6; controls.maxDistance=16; controls.update();
  scene.add(new THREE.HemisphereLight(0xdce7ff,0x293246,2));
  const key=new THREE.DirectionalLight(0xffffff,2.2); key.position.set(4,8,5); scene.add(key);
  const rim=new THREE.DirectionalLight(0x8f7aff,1.25); rim.position.set(-5,5,-4); scene.add(rim);
  const grid=new THREE.GridHelper(12,24,0x40506a,0x202a3b); scene.add(grid);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(6,48),new THREE.MeshStandardMaterial({color:0x111722,roughness:.95})); floor.rotation.x=-Math.PI/2; floor.position.y=-.018; scene.add(floor);
  avatarRoot=new THREE.Group(); avatarRoot.name="NX Avatar Preview Rig"; scene.add(avatarRoot);
  buildMannequin(); resizeRenderer();
  resizeObserver=new ResizeObserver(resizeRenderer); resizeObserver.observe(host);
  window.addEventListener("resize",resizeRenderer);
  renderer.domElement.addEventListener("pointerdown",onViewportClick);
  renderer.setAnimationLoop(()=>{
    if(!renderer||!controls)return;
    controls.update();
    if(document.visibilityState==="visible"&&!document.hidden) renderer.render(scene,camera);
  });
}
function resizeRenderer() {
  if(!renderer||!camera)return;
  const host=$("studioViewport"), w=Math.max(1,host.clientWidth), h=Math.max(1,host.clientHeight);
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.render(scene,camera);
}
function material(color,roughness=.65) { return new THREE.MeshStandardMaterial({color,roughness,metalness:.04}); }
function block(parent,name,size,pos,color) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material(color)); mesh.name=name; mesh.position.set(...pos); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function buildMannequin() {
  if(!avatarRoot)return;
  for (const child of [...avatarRoot.children]) { avatarRoot.remove(child); disposeTree(child); }
  const skin=0xd6dbe6, shirt=0x414c62, accent=0x8270bc, pants=0x242b39;
  block(avatarRoot,"Head",[.72,.72,.72],[0,4.16,0],skin);
  if(currentRig==="R6") {
    block(avatarRoot,"Torso",[.92,1.34,.44],[0,3.20,0],shirt);
    block(avatarRoot,"LeftArm",[.32,1.30,.36],[-.65,3.20,0],skin);
    block(avatarRoot,"RightArm",[.32,1.30,.36],[.65,3.20,0],skin);
    block(avatarRoot,"LeftLeg",[.39,1.36,.40],[-.23,1.85,0],pants);
    block(avatarRoot,"RightLeg",[.39,1.36,.40],[.23,1.85,0],pants);
    return;
  }
  block(avatarRoot,"UpperTorso",[.92,.98,.44],[0,3.23,0],shirt); block(avatarRoot,"LowerTorso",[.86,.42,.42],[0,2.52,0],pants);
  block(avatarRoot,"LeftUpperArm",[.32,.72,.36],[-.64,3.34,0],skin); block(avatarRoot,"LeftLowerArm",[.30,.62,.34],[-.67,2.76,0],skin); block(avatarRoot,"LeftHand",[.28,.24,.30],[-.67,2.34,0],skin);
  block(avatarRoot,"RightUpperArm",[.32,.72,.36],[.64,3.34,0],skin); block(avatarRoot,"RightLowerArm",[.30,.62,.34],[.67,2.76,0],skin); block(avatarRoot,"RightHand",[.28,.24,.30],[.67,2.34,0],skin);
  block(avatarRoot,"LeftUpperLeg",[.38,.78,.40],[-.23,1.80,0],pants); block(avatarRoot,"LeftLowerLeg",[.36,.80,.38],[-.23,.98,0],pants); block(avatarRoot,"LeftFoot",[.40,.22,.60],[-.23,.22,.08],accent);
  block(avatarRoot,"RightUpperLeg",[.38,.78,.40],[.23,1.80,0],pants); block(avatarRoot,"RightLowerLeg",[.36,.80,.38],[.23,.98,0],pants); block(avatarRoot,"RightFoot",[.40,.22,.60],[.23,.22,.08],accent);
}
function placeholder(item) {
  const group=new THREE.Group();
  let color=0x9277d5;
  if(item.category==="Hair")color=0x252938; else if(item.category==="Face")color=0xe7c4a3; else if(item.category==="Shirt"||item.category==="Layered Clothing")color=0x7563b5; else if(item.category==="Pants")color=0x374c75; else if(item.category==="Body Part")color=0xcfd5e0; else if(item.category==="Animation")color=0x68c5d8;
  let geometry;
  if(item.category==="Hair") geometry=new THREE.SphereGeometry(.36,18,12,0,Math.PI*2,0,Math.PI*.62);
  else if(item.category==="Shirt"||item.category==="Layered Clothing")geometry=new THREE.BoxGeometry(.72,.78,.12);
  else if(item.category==="Pants")geometry=new THREE.BoxGeometry(.66,.58,.12);
  else if(item.category==="Face")geometry=new THREE.BoxGeometry(.48,.35,.08);
  else if(item.category==="Texture"){geometry=new THREE.PlaneGeometry(.62,.62);}
  else if(item.category==="Body Part")geometry=new THREE.BoxGeometry(.48,.70,.42);
  else geometry=new THREE.TorusGeometry(.28,.08,8,20);
  const mesh=new THREE.Mesh(geometry,material(color)); mesh.name="Catalog preview placeholder"; group.add(mesh);
  const wire=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8),new THREE.MeshBasicMaterial({color:0x8b78db,wireframe:true,transparent:true,opacity:.28}));
  if(item.category==="Accessory"||item.category==="Model")group.add(wire);
  return group;
}
function disposeTree(root) {
  root.traverse(node=>{if(node.geometry)node.geometry.dispose();if(node.material){if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());else node.material.dispose();}});
}
function clearItemGroups(){
  loadingRevision++;
  for(const group of itemGroups.values()){if(group.parent)group.parent.remove(group);disposeTree(group);}
  itemGroups.clear();
}
function applyTransform(item,group) {
  const anchor=ATTACHMENTS[item.attachment]||ATTACHMENTS.Head, t=normTransform(item.transform);
  group.position.set(anchor[0]+t.position.x,anchor[1]+t.position.y,anchor[2]+t.position.z);
  group.rotation.set(THREE.MathUtils.degToRad(t.rotation.x),THREE.MathUtils.degToRad(t.rotation.y),THREE.MathUtils.degToRad(t.rotation.z));
  group.scale.setScalar(t.scale);
}
function buildPreviewItem(item) {
  const group=placeholder(item); group.userData.instanceId=item.instance_id; avatarRoot.add(group); itemGroups.set(item.instance_id,group); applyTransform(item,group);
  if(item.file_path) loadCustomModel(item,group,loadingRevision);
}
async function loadCustomModel(item,group,revision) {
  try {
    const {data,error}=await db.storage.from(BUCKET).download(item.file_path); if(error)throw error;
    const ext=String(item.file_name||item.file_path).split(".").pop().toLowerCase(); let model;
    if(ext==="glb"||ext==="gltf") {
      const buffer=await data.arrayBuffer();
      const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,"",resolve,reject));
      model=gltf.scene;
    } else if(ext==="obj") model=new OBJLoader().parse(await data.text());
    else if(ext==="fbx") model=new FBXLoader().parse(await data.arrayBuffer(),"");
    else if(ext==="stl"){const geometry=new STLLoader().parse(await data.arrayBuffer());model=new THREE.Group();model.add(new THREE.Mesh(geometry,material(0x9faee0)));}
    else throw new Error("รองรับ .glb, .gltf, .obj, .fbx, .stl");
    if(revision!==loadingRevision||!group.parent)return;
    const box=new THREE.Box3().setFromObject(model), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
    const largest=Math.max(size.x,size.y,size.z); if(!Number.isFinite(largest)||largest<=0)throw new Error("ไฟล์ไม่มี geometry ที่แสดงผลได้");
    const fittedScale=.72/largest; model.scale.setScalar(fittedScale); model.position.set(-center.x*fittedScale,-center.y*fittedScale,-center.z*fittedScale);
    while(group.children.length){const child=group.children[0];group.remove(child);disposeTree(child);}
    group.add(model); group.userData.instanceId=item.instance_id; applyTransform(item,group); status("แสดง Custom Model: "+item.name);
  } catch(error) {
    if(revision===loadingRevision)status("พรีวิวโมเดล “"+item.name+"” ไม่สำเร็จ: "+(error.message||"ไฟล์ไม่รองรับ")+" — ยังคงปรับตำแหน่งและบันทึกได้",true);
  }
}
function renderItems() {
  $("studioItemCount").textContent=`${currentItems.length} รายการ`;
  if(!currentItems.length)$("studioItems").innerHTML='<div class="empty">ยังไม่มีไอเทมในชุด</div>';
  else $("studioItems").innerHTML=currentItems.map(item=>`<div class="item-row ${item.instance_id===selectedKey?"selected":""}"><button class="item-main" data-select-item="${esc(item.instance_id)}"><strong>${esc(item.name)}</strong><span>${esc(item.category)} · ${item.file_path?"Custom Model":item.asset_id?"Asset ID "+esc(item.asset_id):"Metadata only"}</span></button><div class="small-actions"><button title="คัดลอก Asset ID" data-copy-item="${esc(item.instance_id)}">ID</button><button title="นำออกจากชุด" class="danger" data-remove-item="${esc(item.instance_id)}">×</button></div></div>`).join("");
  if(selectedKey&&!currentItems.some(i=>i.instance_id===selectedKey))selectedKey=null;
  $("studioItems").querySelectorAll("[data-select-item]").forEach(b=>b.addEventListener("click",()=>selectItem(b.dataset.selectItem)));
  $("studioItems").querySelectorAll("[data-remove-item]").forEach(b=>b.addEventListener("click",()=>removeItem(b.dataset.removeItem)));
  $("studioItems").querySelectorAll("[data-copy-item]").forEach(b=>b.addEventListener("click",async()=>{const i=currentItems.find(x=>x.instance_id===b.dataset.copyItem);if(!i?.asset_id)return status("รายการนี้ไม่มี Asset ID",true);try{await navigator.clipboard.writeText(i.asset_id);status("คัดลอก Asset ID แล้ว");}catch{status("คัดลอกไม่ได้ ให้เลือกคัดลอก ID จากหน้าจอเอง",true);}}));
  renderInspector();
}
function selectedItem(){return currentItems.find(i=>i.instance_id===selectedKey)||null;}
function selectItem(key){selectedKey=key;renderItems();}
function renderInspector(){
  const item=selectedItem(), ids=["attachment","posX","posY","posZ","rotX","rotY","rotZ","scale","removeItem","resetTransform"];
  ids.forEach(id=>$(id).disabled=!item);
  if(!item){$("selectedName").textContent="เลือกไอเทมเพื่อแก้ไข";$("attachment").value="Head";["posX","posY","posZ","rotX","rotY","rotZ"].forEach(id=>$(id).value=0);$("scale").value=1;return;}
  const t=normTransform(item.transform);$("selectedName").textContent=item.name+(item.file_path?" · Custom Model":item.asset_id?" · Catalog ID":" · Metadata");
  $("attachment").value=item.attachment;$("posX").value=t.position.x;$("posY").value=t.position.y;$("posZ").value=t.position.z;$("rotX").value=t.rotation.x;$("rotY").value=t.rotation.y;$("rotZ").value=t.rotation.z;$("scale").value=t.scale;
}
function changeTransform(){
  const item=selectedItem();if(!item)return;
  item.attachment=$("attachment").value;item.transform=normTransform({position:{x:val("posX"),y:val("posY"),z:val("posZ")},rotation:{x:val("rotX"),y:val("rotY"),z:val("rotZ")},scale:val("scale",1)});
  const group=itemGroups.get(item.instance_id);if(group)applyTransform(item,group);dirty();
}
function renderScene(){clearItemGroups();buildMannequin();currentItems.forEach(buildPreviewItem);renderItems();resizeRenderer();}
function onViewportClick(event){
  const rect=renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);const hits=ray.intersectObjects([...itemGroups.values()],true);
  for(const hit of hits){let node=hit.object;while(node&&node!==scene){if(node.userData&&node.userData.instanceId){selectItem(node.userData.instanceId);return;}node=node.parent;}}
}
function addItem(asset){
  if(!asset)return;
  currentItems.push(normaliseItem({instance_id:uid(),asset_record_id:asset.id,name:asset.name,category:asset.category,item_type:asset.file_path?"custom":"catalog",asset_id:asset.asset_id,asset_url:asset.asset_url,file_path:asset.file_path,file_name:asset.file_name,mime_type:asset.mime_type,attachment:DEFAULT_ATTACHMENT[asset.category]||"Head",transform:{position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:1}}));
  selectedKey=currentItems.at(-1).instance_id;renderScene();dirty();status("เพิ่ม “"+asset.name+"” ในชุดแล้ว — กดบันทึกชุดเพื่อเก็บไว้ใน Cloud");
}
function newRecordPayload(name,category,assetId,assetUrl,extra={}){
  const u= safeUrl(assetUrl);
  if(assetUrl&&!u)throw new Error("ลิงก์ต้องเป็น HTTP หรือ HTTPS");
  return {owner_id:user.id,name,category,asset_id:String(assetId||"").trim(),asset_url:u||null,description:extra.description||"Added from NX Avatar Studio",tags:extra.tags||["avatar-studio"],file_path:extra.file_path||null,file_name:extra.file_name||null,file_size:extra.file_size||0,mime_type:extra.mime_type||null,updated_at:new Date().toISOString()};
}
async function addCatalog(event){
  event.preventDefault();if(!user)return status("กรุณาเข้าสู่ระบบก่อน",true);
  const name=$("catalogName").value.trim(), assetId=$("catalogId").value.trim(), category=$("catalogCategory").value, url=$("catalogUrl").value.trim();
  if(!name)return status("กรุณากรอกชื่อไอเทม",true);
  try{
    status("กำลังบันทึก Catalog item...");const payload=newRecordPayload(name,category,assetId,url,{description:"Roblox Catalog metadata saved from NX Avatar Studio",tags:["roblox-catalog","avatar-studio"]});
    const {data,error}=await db.from("nx_avatar_assets").insert(payload).select("*").single();if(error)throw error;
    assets.unshift(data);addItem(data);$("catalogForm").reset();closeDialog("catalogDialog");renderAssetsInPicker();
  }catch(error){status("เพิ่ม Asset ไม่สำเร็จ: "+error.message,true);}
}
async function loadAssets(){
  if(!user)return;
  const {data,error}=await db.from("nx_avatar_assets").select("id,owner_id,name,category,asset_id,asset_url,description,tags,file_path,file_name,file_size,mime_type,created_at,updated_at").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(500);
  if(error){status("โหลด Avatar Vault ไม่สำเร็จ: "+error.message,true);return;}
  assets=data||[];renderAssetsInPicker();
}
function renderAssetsInPicker(){
  const select=$("vaultSelect");const old=select.value;
  select.innerHTML=assets.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${esc(a.category)}${a.asset_id?" · ID "+esc(a.asset_id):""}${a.file_path?" · มีไฟล์":""}</option>`).join("");
  if(!assets.length)select.innerHTML='<option value="">คลัง Avatar ยังว่าง</option>';
  else if(assets.some(a=>a.id===old))select.value=old;
}
async function uploadCustomModel(event){
  event.preventDefault();if(!user||busy)return;
  const name=$("modelName").value.trim(),file=$("modelFile").files?.[0];if(!name||!file)return status("กรอกชื่อและเลือกไฟล์โมเดลก่อน",true);
  const ext=(file.name.split(".").pop()||"").toLowerCase();if(!["glb","gltf","obj","fbx","stl"].includes(ext))return status("รองรับ .glb, .gltf, .obj, .fbx, .stl เท่านั้น",true);
  if(file.size>50*1024*1024)return status("ไฟล์ต้องมีขนาดไม่เกิน 50 MB",true);
  busy=true;$("modelSubmit").disabled=true;let uploadedPath=null;
  try{
    status("กำลังอัปโหลดโมเดลไปยัง Cloud...");const path=`${user.id}/${uid()}-${cleanName(file.name)}`;
    const {error:uploadError}=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});if(uploadError)throw new Error("อัปโหลดไฟล์ไม่สำเร็จ: "+uploadError.message);uploadedPath=path;
    const payload=newRecordPayload(name,"Model","","",{description:"Custom model uploaded from NX Avatar Studio",tags:["custom-model","avatar-studio"],file_path:path,file_name:file.name,file_size:file.size,mime_type:file.type||"application/octet-stream"});
    const {data,error}=await db.from("nx_avatar_assets").insert(payload).select("*").single();if(error)throw new Error("บันทึก Asset metadata ไม่สำเร็จ: "+error.message);
    uploadedPath=null;assets.unshift(data);addItem(data);renderAssetsInPicker();$("modelForm").reset();closeDialog("modelDialog");status("อัปโหลดโมเดลและเพิ่มเข้า Avatar Vault แล้ว");
  }catch(error){if(uploadedPath)await db.storage.from(BUCKET).remove([uploadedPath]);status(error.message||"อัปโหลดโมเดลไม่สำเร็จ",true);}
  finally{busy=false;$("modelSubmit").disabled=false;}
}
function removeItem(key){const item=currentItems.find(i=>i.instance_id===key);if(!item)return;if(!confirm(`นำ “${item.name}” ออกจากชุดนี้หรือไม่?`))return;currentItems=currentItems.filter(i=>i.instance_id!==key);if(selectedKey===key)selectedKey=currentItems[0]?.instance_id||null;renderScene();dirty();status("นำไอเทมออกจากชุดแล้ว (ยังไม่ได้บันทึก)");}
function renderOutfits(){
  const host=$("studioOutfits");if(!outfits.length){host.innerHTML='<div class="empty">ยังไม่มีชุดที่บันทึก</div>';return;}
  host.innerHTML=outfits.map(o=>`<div class="outfit-row ${o.id===currentOutfitId?"selected":""}"><button class="outfit-main" data-open-outfit="${esc(o.id)}"><strong>${esc(o.name)}</strong><span>${esc(o.rig_type||"R15")} · ${(o.items||[]).length} ชิ้น</span></button><button data-delete-outfit="${esc(o.id)}" class="danger" title="ลบชุด">×</button></div>`).join("");
  host.querySelectorAll("[data-open-outfit]").forEach(b=>b.addEventListener("click",()=>openOutfit(b.dataset.openOutfit)));
  host.querySelectorAll("[data-delete-outfit]").forEach(b=>b.addEventListener("click",()=>deleteOutfit(b.dataset.deleteOutfit)));
}
async function loadOutfits(){
  if(!user)return;const {data,error}=await db.from("nx_avatar_outfits").select("id,name,description,rig_type,items,created_at,updated_at").eq("owner_id",user.id).order("updated_at",{ascending:false}).limit(100);
  if(error){outfits=[];renderOutfits();status("โหลดชุดไม่สำเร็จ: "+error.message+" — รัน nx-avatar-studio.sql ก่อน",true);return;}
  outfits=(data||[]).map(o=>({...o,items:Array.isArray(o.items)?o.items:[]}));renderOutfits();
}
async function saveOutfit(){
  if(!user)return status("กรุณาเข้าสู่ระบบก่อน",true);const name=$("outfitName").value.trim();if(!name)return status("ตั้งชื่อชุดก่อนบันทึก",true);if(currentItems.length>100)return status("หนึ่งชุดบันทึกได้สูงสุด 100 ไอเทม",true);
  const button=$("saveOutfit");button.disabled=true;
  const payload={owner_id:user.id,name,description:"",rig_type:currentRig,items:currentItems.map(normaliseItem),updated_at:new Date().toISOString()};
  try{
    status("กำลังบันทึกชุด...");
    if(currentOutfitId){const {error}=await db.from("nx_avatar_outfits").update(payload).eq("id",currentOutfitId).eq("owner_id",user.id);if(error)throw error;}
    else{const {data,error}=await db.from("nx_avatar_outfits").insert(payload).select("id").single();if(error)throw error;currentOutfitId=data.id;}
    dirty("บันทึกแล้ว");await loadOutfits();status("บันทึกชุด “"+name+"” สำเร็จ");
  }catch(error){status("บันทึกชุดไม่สำเร็จ: "+error.message,true);}finally{button.disabled=false;}
}
function openOutfit(id){const outfit=outfits.find(o=>o.id===id);if(!outfit)return;currentOutfitId=outfit.id;currentRig=outfit.rig_type==="R6"?"R6":"R15";$("studioRig").value=currentRig;$("outfitName").value=outfit.name;currentItems=(outfit.items||[]).map(normaliseItem);selectedKey=currentItems[0]?.instance_id||null;renderScene();renderOutfits();dirty("โหลดชุดจาก Cloud แล้ว");status("เปิดชุด “"+outfit.name+"” แล้ว");}
async function deleteOutfit(id){const outfit=outfits.find(o=>o.id===id);if(!outfit||!confirm(`ลบชุด “${outfit.name}” หรือไม่?`))return;const {error}=await db.from("nx_avatar_outfits").delete().eq("id",id).eq("owner_id",user.id);if(error)return status("ลบชุดไม่สำเร็จ: "+error.message,true);if(currentOutfitId===id){currentOutfitId=null;$("outfitName").value="";}await loadOutfits();status("ลบชุดแล้ว");}
function startNewOutfit(){currentOutfitId=null;currentItems=[];selectedKey=null;$("outfitName").value="ชุดใหม่";currentRig=$("studioRig").value||"R15";renderScene();renderOutfits();dirty("ชุดใหม่ · ยังไม่ได้บันทึก");status("เริ่มชุดใหม่แล้ว");}
function exportOutfit(){const outfit={format:"NXAvatarStudio",version:1,exported_at:new Date().toISOString(),name:$("outfitName").value.trim()||"NX Outfit",rig_type:currentRig,items:currentItems.map(normaliseItem)};const blob=new Blob([JSON.stringify(outfit,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=cleanName(outfit.name)+".nxoutfit.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status("ส่งออกไฟล์ชุดแล้ว");}
async function importOutfit(event){const file=event.target.files?.[0];event.target.value="";if(!file)return;try{const outfit=JSON.parse(await file.text());if(outfit.format!=="NXAvatarStudio"||!Array.isArray(outfit.items))throw new Error("ไฟล์ไม่ใช่ NX Avatar Studio JSON");if(outfit.items.length>100)throw new Error("จำนวนไอเทมเกิน 100");currentOutfitId=null;currentRig=outfit.rig_type==="R6"?"R6":"R15";$("studioRig").value=currentRig;$("outfitName").value=String(outfit.name||"Imported outfit").slice(0,100);currentItems=outfit.items.map(normaliseItem);selectedKey=currentItems[0]?.instance_id||null;renderScene();renderOutfits();dirty("นำเข้าแล้ว — กดบันทึกเพื่อเก็บใน Cloud");status("นำเข้าชุดจาก JSON แล้ว");}catch(error){status("นำเข้าไม่สำเร็จ: "+error.message,true);}}
function openDialog(id){const el=$(id);if(el.showModal)el.showModal();else el.setAttribute("open","");}
function closeDialog(id){const el=$(id);if(el.close)el.close();else el.removeAttribute("open");}
function bindUI(){
  $("newOutfit").addEventListener("click",startNewOutfit);$("saveOutfit").addEventListener("click",saveOutfit);$("exportOutfit").addEventListener("click",exportOutfit);$("importButton").addEventListener("click",()=>$("importFile").click());$("importFile").addEventListener("change",importOutfit);
  $("addCatalog").addEventListener("click",()=>openDialog("catalogDialog"));$("catalogForm").addEventListener("submit",addCatalog);$("addFromVault").addEventListener("click",async()=>{await loadAssets();openDialog("vaultDialog");});$("attachVault").addEventListener("click",()=>{const asset=assets.find(a=>a.id===$("vaultSelect").value);if(!asset)return status("เลือก Asset จากคลังก่อน",true);addItem(asset);closeDialog("vaultDialog");});
  $("uploadModel").addEventListener("click",()=>openDialog("modelDialog"));$("modelForm").addEventListener("submit",uploadCustomModel);document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeDialog(b.dataset.close)));
  ["attachment","posX","posY","posZ","rotX","rotY","rotZ","scale"].forEach(id=>$(id).addEventListener("input",changeTransform));$("removeItem").addEventListener("click",()=>selectedKey&&removeItem(selectedKey));$("resetTransform").addEventListener("click",()=>{const item=selectedItem();if(!item)return;item.transform={position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:1};$("attachment").value=DEFAULT_ATTACHMENT[item.category]||"Head";changeTransform();renderInspector();dirty();});
  $("studioRig").addEventListener("change",()=>{currentRig=$("studioRig").value;renderScene();dirty("เปลี่ยน Rig แล้ว · กดบันทึกเพื่อเก็บค่า");});$("outfitName").addEventListener("input",()=>dirty("ชื่อชุดเปลี่ยนแล้ว · กดบันทึก"));$("resetCamera").addEventListener("click",()=>{camera.position.set(6.2,4.5,8);controls.target.set(0,2.3,0);controls.update();});
}
async function startSession(session){
  user=session?.user||null;$("studioUser").textContent=user?.email||"ไม่ได้เข้าสู่ระบบ";$("studioAuthNotice").hidden=!!user;
  if(!user){assets=[];outfits=[];currentItems=[];currentOutfitId=null;selectedKey=null;renderScene();renderOutfits();return;}
  await Promise.all([loadAssets(),loadOutfits()]);
}
async function boot(){
  try{
    initScene();bindUI();
    const {data,error}=await db.auth.getSession();if(error)throw error;await startSession(data.session);
    db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>startSession(session),0);});
  }catch(error){status("เริ่มต้น Avatar Studio ไม่สำเร็จ: "+(error.message||String(error)),true);console.error(error);}
}
boot();
