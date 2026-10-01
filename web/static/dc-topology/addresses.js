// Address ownership is derived from the current model, including interface and
// VRF scope. No network lookup or production address inventory is used.
function parseAddress(raw) {
  const value=raw.split('/')[0].split('%')[0].toLowerCase();
  if(!value.includes(':')) {
    const parts=value.split('.');
    if(parts.length!==4||parts.some(part=>!/^\d{1,3}$/.test(part)||Number(part)>255))return null;
    return {bytes:parts.map(Number),key:parts.map(Number).join('.'),family:4};
  }
  let address=value;
  if(address.includes('.')) {
    const index=address.lastIndexOf(':');const v4=parseAddress(address.slice(index+1));
    if(!v4||v4.family!==4)return null;
    address=address.slice(0,index+1)+((v4.bytes[0]<<8)|v4.bytes[1]).toString(16)+':'+((v4.bytes[2]<<8)|v4.bytes[3]).toString(16);
  }
  const halves=address.split('::');if(halves.length>2)return null;
  const left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  const missing=8-left.length-right.length;
  if(halves.length===1?missing!==0:missing<1)return null;
  const words=halves.length===1?left:[...left,...Array(missing).fill('0'),...right];
  if(words.some(word=>! /^[0-9a-f]{1,4}$/.test(word)))return null;
  const values=words.map(word=>parseInt(word,16));
  return {bytes:values.flatMap(word=>[word>>8,word&255]),key:values.map(word=>word.toString(16)).join(':'),family:6};
}

const inPrefix=(address,prefix)=>{
  const network=parseAddress(prefix),bits=Number(prefix.split('/')[1]);
  if(!network||network.family!==address.family||!Number.isInteger(bits)||bits<0||bits>network.bytes.length*8)return false;
  return network.bytes.every((byte,index)=>{
    const mask=255<<(8-Math.min(8,Math.max(0,bits-index*8)))&255;
    return (byte&mask)===(address.bytes[index]&mask);
  });
};

export function addressInventory(model) {
  const nodes=new Map(model.nodes.map(node=>[node.id,node]));const entries=new Map(),prefixes=[];
  const add=(raw,entry)=>{
    const address=parseAddress(raw);if(!address)return;
    if(!entries.has(address.key))entries.set(address.key,[]);
    entries.get(address.key).push({...entry,raw});
  };
  for(const node of model.nodes) {
    add(node.ipv4,{ownerID:node.id,label:node.label,purpose:node.kind==='host'?'Loopback IPv4 / VTEP VXLAN':'Loopback IPv4 urządzenia',description:'Adres urządzenia w underlay; nie adres łącza fizycznego.'});
    add(node.ipv6,{ownerID:node.id,label:node.label,purpose:'Loopback IPv6 / transport BGP',description:'Tożsamość urządzenia w underlay; łącza fizyczne używają wyłącznie link-local.'});
  }
  for(const vm of model.vms)for(const raw of [...new Set(vm.addresses??[vm.ipv4,vm.ipv6])]) {
    const customer=vm.role==='customer';
    const vni=vm.vpc_id?10000+vm.vpc_id:3;
    add(raw,{ownerID:vm.id,label:vm.label,vpcID:customer?vm.vpc_id:undefined,hostID:vm.host_id,
      purpose:customer?'Adres VM klienta':'Adres VM infrastruktury / RS',
      description:`Host ${nodes.get(vm.host_id)?.label??vm.host_id} · ${customer?(vm.vpc_id?`VPC ${vm.vpc_id} · VNI ${vni}`:`default/public VRF · VNI ${vni}`):raw.includes(':')?'usługa IPv6 ogłaszana w underlay przez host':'adres IPv4 infrastruktury; brak ogłoszenia w underlay'}`});
  }
  for(const iface of model.interfaces)if(iface.link_local_ipv6)add(iface.link_local_ipv6,{ownerID:iface.node_id,label:nodes.get(iface.node_id)?.label??iface.node_id,interfaceID:iface.id,
    purpose:'IPv6 link-local / BGP unnumbered',description:`Interfejs ${iface.name} · sąsiad ${nodes.get(iface.peer_node_id)?.label??iface.peer_node_id}. Adres jest ważny tylko na tym łączu i wymaga zakresu interfejsu.`});
  const extra=(raw,vm,owner=vm)=>{
    const entry={ownerID:owner.id,label:owner.label,vpcID:vm.vpc_id,purpose:'Dodatkowy / Shared IP · prefiks unicast',
      description:`Skonfigurowany prefiks ${raw} via podstawowy IP ${raw.includes(':')?vm.ipv6:vm.ipv4} VM ${vm.label}. Publikacja przez RS User wymaga publicznej łączności TAP/EVPN; ten prefiks nie jest kolejną trasą EVPN.${vm.vpc_id?' VM jest w prywatnym VRF; publikacja jest zablokowana.':''}`};
    prefixes.push({...entry,raw});add(raw,entry);
  };
  for(const vm of model.vms)for(const prefix of vm.advertised_prefixes??[])extra(prefix,vm);
  for(const origin of model.config.route_servers?.user_origins??[]) {
    const vm=model.vms.find(vm=>vm.id===`customer-${origin.next_hop_vm_id}`),rs=model.vms.find(vm=>vm.id===`rs-user-m${origin.member}`);
    if(vm&&rs)extra(origin.prefix,vm,rs);
  }
  return {model,nodes,entries,prefixes};
}

export function explainAddress(inventory, raw, context={}) {
  const address=parseAddress(raw);if(!address)return null;
  const bits=raw.includes('/')?Number(raw.split('/')[1]):null;
  if(bits===0)return {title:raw,description:'Prefiks trasy domyślnej: wszystkie adresy tej rodziny. Nie jest adresem konkretnego urządzenia.',ownerIDs:[]};
  const mapped=address.family===6&&address.bytes.slice(0,10).every(byte=>byte===0)&&address.bytes[10]===255&&address.bytes[11]===255;
  const key=mapped?address.bytes.slice(12).join('.'):address.key;
  let entries=inventory.entries.get(key)??[];
  if(!entries.length)entries=inventory.prefixes.filter(prefix=>inPrefix(address,prefix.raw));
  const linkLocal=address.family===6&&address.bytes[0]===254&&(address.bytes[1]&192)===128;
  if(linkLocal) {
    const after=context.after?.match(/(?:dev\s+|,\s*)(to-[\w-]+)/)?.[1];
    const before=[...(context.before??'').matchAll(/\b(to-[\w-]+)(?=:|\s)/g)].at(-1)?.[1];
    let ifaceID=context.interfaceID;
    if(!ifaceID&&after&&context.ownerID) {
      const local=inventory.model.interfaces.find(iface=>iface.node_id===context.ownerID&&iface.name===after);
      ifaceID=inventory.model.interfaces.find(iface=>iface.link_id===local?.link_id&&iface.node_id===local?.peer_node_id)?.id;
    }
    if(!ifaceID&&before&&context.linkID)ifaceID=inventory.model.interfaces.find(iface=>iface.link_id===context.linkID&&iface.name===before)?.id;
    if(ifaceID)entries=entries.filter(entry=>entry.interfaceID===ifaceID);
    else if(context.sessionID) {
      const session=inventory.model.bgp_sessions.find(session=>session.id===context.sessionID);
      entries=entries.filter(entry=>[session?.a.interface_id,session?.b.interface_id].includes(entry.interfaceID));
    } else if(context.ownerID)entries=entries.filter(entry=>entry.ownerID===context.ownerID);
  } else if(context.vpcID!==undefined)entries=entries.filter(entry=>entry.vpcID===undefined||entry.vpcID===context.vpcID);
  if(entries.length) {
    const unique=[...new Map(entries.map(entry=>[`${entry.ownerID}/${entry.interfaceID??''}`,entry])).values()];
    const title=mapped?'Sąsiad IPv6 mapowany na VTEP IPv4':bits!==null?`Prefiks /${bits}`:unique[0].purpose;
    const description=unique.length<=4?unique.map(entry=>`${entry.label} · ${entry.purpose}. ${entry.description}`).join('\n')
      :`Adres współdzielony przez ${unique.length} interfejsów. Link-local wymaga zakresu interfejsu; sam adres nie identyfikuje właściciela.`;
    return {title:`${raw} · ${title}`,description,ownerIDs:unique.length<=4?[...new Set(unique.map(entry=>entry.ownerID))]:[]};
  }
  const targets=inventory.model.config.route_origins?.filter(target=>(context.vpcID===undefined||context.vpcID===target.vpc_id)&&inPrefix(address,target.prefix))??[];
  if(targets.length)return {title:`${raw} · cel poza fabric`,description:targets.map(target=>`Prefiks scenariusza ${target.prefix} przy ${inventory.nodes.get(`border-${target.border_id}`)?.label??`border-${target.border_id}`}. Ruch publiczny korzysta z wybranej trasy domyślnej; nie jest to loopback border.`).join('\n'),ownerIDs:[]};
  return {title:raw,description:linkLocal?'Adres IPv6 link-local. Wymaga zakresu interfejsu; brak jednoznacznego właściciela w tym kontekście.':'Adres lub prefiks bez właściciela w bieżącym modelu. Może oznaczać zewnętrzny cel ruchu; nie przypisano go do urządzenia.',ownerIDs:[]};
}

// Include IPv4-mapped IPv6, scope and CIDR without matching ASNs, RD/RT or MACs.
const candidates=/(?:[\da-fA-F]*:[\da-fA-F:.]*(?:%[\w-]+)?|(?:\d{1,3}\.){3}\d{1,3})(?:\/\d{1,3})?/g;

let hintInstance=0;
export function mountAddressHints(root,{getModel,getContext,onPreview,signal}) {
  const tooltip=document.createElement('div');tooltip.id=`dc-address-tooltip-${++hintInstance}`;tooltip.className='dc-address-tooltip';tooltip.hidden=true;tooltip.setAttribute('role','tooltip');
  document.body.append(tooltip);
  let inventory=null,model=null,active=null;
  const clear=()=>{active?.removeAttribute('aria-describedby');active=null;tooltip.hidden=true;onPreview([]);};
  const refresh=()=>{if(model!==getModel()){model=getModel();inventory=model?addressInventory(model):null;}return inventory;};
  const contextFor=element=>{
    const context={...getContext()};
    const row=element.closest('[data-route-candidate]');
    if(row) {
      const route=JSON.parse(row.dataset.routeCandidate);
      context.ownerID=route.owner_type==='vpc-view'?route.source_nve:row.dataset.routeOwner;
      context.vpcID=route.vpc_id;
      context.interfaceID=route.next_hop_interface_id;
    }
    const scoped=element.closest('[data-address-interface]');if(scoped)context.interfaceID=scoped.dataset.addressInterface;
    const vm=element.closest('[data-vm-id]');if(vm) {
      const owner=model.vms.find(owner=>owner.id===vm.dataset.vmId);
      context.vpcID=owner?.role==='customer'?owner.vpc_id:undefined;
    }
    const session=element.closest('[data-session-id]');if(session)context.sessionID=session.dataset.sessionId;
    return context;
  };
  const position=()=>{
    if(!active)return;
    const rect=active.getBoundingClientRect(),box=tooltip.getBoundingClientRect();
    const pane=active.closest('.dc-details')?.getBoundingClientRect();
    if(!active.isConnected||rect.bottom<Math.max(0,pane?.top??0)||rect.top>Math.min(window.innerHeight,pane?.bottom??window.innerHeight)){clear();return;}
    tooltip.style.left=`${Math.max(8,Math.min(window.innerWidth-box.width-8,rect.left))}px`;
    tooltip.style.top=`${Math.max(8,rect.bottom+8+box.height<window.innerHeight?rect.bottom+8:rect.top-box.height-8)}px`;
  };
  const show=element=>{
    if(!refresh())return;
    if(active!==element)clear();active=element;
    const info=explainAddress(inventory,element.dataset.address,{...contextFor(element),before:element.dataset.addressBefore,after:element.dataset.addressAfter});
    if(!info)return;
    const title=document.createElement('strong');title.textContent=info.title;
    const body=document.createElement('p');body.textContent=info.description;
    tooltip.replaceChildren(title,body);tooltip.hidden=false;active.setAttribute('aria-describedby',tooltip.id);onPreview(info.ownerIDs);
    position();
  };
  const enter=event=>{const element=event.target.closest?.('[data-address]');if(element&&root.contains(element)&&element!==active)show(element);};
  const leave=event=>{if(event.target.closest?.('[data-address]')===active&&!active.contains(event.relatedTarget))clear();};
  root.addEventListener('pointerover',enter,{signal});root.addEventListener('focusin',enter,{signal});
  root.addEventListener('pointerout',event=>{if(event.target.closest?.('[data-address]'))leave(event);},{signal});
  root.addEventListener('focusout',event=>{if(event.target.closest?.('[data-address]'))leave(event);},{signal});
  root.addEventListener('click',clear,{signal});window.addEventListener('scroll',position,{signal,capture:true});window.addEventListener('resize',position,{signal});
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)decorate(node);});
  const decorate=container=>{
    if(!refresh())return;
    const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);const nodes=[];
    while(walker.nextNode()) {
      const text=walker.currentNode;
      if(text.parentElement&&!text.parentElement.closest('svg,textarea,option,input,script,style,[data-address],.dc-bit-grid,.dc-address-tooltip'))nodes.push(text);
    }
    for(const text of nodes) {
      const matches=[...text.nodeValue.matchAll(candidates)].filter(match=>parseAddress(match[0]));if(!matches.length)continue;
      const fragment=document.createDocumentFragment();let offset=0;
      for(const match of matches) {
        fragment.append(text.nodeValue.slice(offset,match.index));
        const span=document.createElement('span');span.className='dc-address';span.dataset.address=match[0];span.textContent=match[0];span.tabIndex=0;
        span.dataset.addressBefore=text.nodeValue.slice(0,match.index);span.dataset.addressAfter=text.nodeValue.slice(match.index+match[0].length);
        fragment.append(span);offset=match.index+match[0].length;
      }
      fragment.append(text.nodeValue.slice(offset));text.replaceWith(fragment);
    }
  };
  observer.observe(root,{childList:true,subtree:true});
  return {decorate,clear,destroy(){clear();observer.disconnect();tooltip.remove();}};
}
