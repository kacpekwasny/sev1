// Deterministic sample wire encoding. Model addresses, lengths and checksums agree;
// unspecified MACs, ports, IDs and payload are explicitly educational defaults.
const bitsOf = (bytes) => [...bytes].map((byte) => byte.toString(2).padStart(8, "0")).join("");
const bytesOf = (bits) => Uint8Array.from(bits.match(/.{8}/g) ?? [], (byte) => parseInt(byte, 2));
const concat = (...values) => Uint8Array.from(values.flatMap((value) => [...value]));
const integer = (value, bits) => BigInt(value).toString(2).padStart(bits, "0");
function layer(name) {
  const fields = []; let bits = "";
  return { name, fields, get bytes() { return bytesOf(bits); },
    add(label, width, value, description, display = value) {
      const raw = value instanceof Uint8Array ? bitsOf(value) : integer(value, width);
      if (raw.length !== width) throw new Error(`Nieprawidłowa długość pola ${label}`);
      fields.push({label,offset:bits.length,width,bits:raw,value:String(display),description}); bits += raw;
      return this;
    }
  };
}
export function addressBytes(address) {
  const raw = address.split("%")[0];
  if (!raw.includes(":")) return Uint8Array.from(raw.split("."), Number);
  const [left, right] = raw.split("::");
  const a = left ? left.split(":") : [], b = right ? right.split(":") : [];
  const words = right !== undefined ? [...a, ...Array(8-a.length-b.length).fill("0"), ...b] : a;
  return Uint8Array.from(words.flatMap((word) => {const n=parseInt(word,16);return [n>>8,n&255];}));
}
export function checksum(bytes) {
  let sum = 0;
  for (let i=0;i<bytes.length;i+=2) sum += (bytes[i]<<8) + (bytes[i+1] ?? 0);
  while (sum>>16) sum = (sum&65535)+(sum>>16);
  return (~sum)&65535;
}
const numberBytes = (value, count) => bytesOf(integer(value,count*8));
function pseudo(source,destination,protocol,length) {
  const a=addressBytes(source),b=addressBytes(destination);
  return a.length===4 ? concat(a,b,Uint8Array.of(0,protocol),numberBytes(length,2)) : concat(a,b,numberBytes(length,4),Uint8Array.of(0,0,0,protocol));
}
function ip(source,destination,protocol,bodyLength,ttl,title) {
  const is6=source.includes(":"), l=layer(title ?? (is6?"IPv6":"IPv4"));
  l.add("Version",4,is6?6:4,"Wersja protokołu IP.");
  if (is6) {
    l.add("Traffic Class",8,0,"Klasa ruchu: DSCP i ECN; w przykładzie 0.").add("Flow Label",20,0,"Identyfikator przepływu IPv6; w przykładzie 0.")
      .add("Payload Length",16,bodyLength,"Liczba bajtów po 40-bajtowym nagłówku IPv6.")
      .add("Next Header",8,protocol,"Numer następnego protokołu: 58 ICMPv6, 6 TCP, 17 UDP.").add("Hop Limit",8,ttl,"Maleje przy routowaniu; pakiet z wartością 0 jest odrzucany.");
  } else {
    l.add("IHL",4,5,"Długość nagłówka w słowach 32-bitowych: 5 = 20 bajtów, bez opcji.")
      .add("DSCP",6,0,"Klasa obsługi ruchu; w przykładzie 0.").add("ECN",2,0,"Sygnalizacja przeciążenia; w przykładzie wyłączona.")
      .add("Total Length",16,20+bodyLength,"Całkowita długość datagramu IPv4 w bajtach, razem z nagłówkiem.")
      .add("Identification",16,1,"Identyfikator do składania fragmentów; przykładowo 1.")
      .add("Reserved",1,0,"Zarezerwowany bit flag, zawsze 0.").add("DF",1,1,"Don't Fragment: nie fragmentuj tego datagramu.").add("MF",1,0,"More Fragments: 0 oznacza brak następnych fragmentów.")
      .add("Fragment Offset",13,0,"Pozycja fragmentu w jednostkach 8 bajtów; w przykładzie brak fragmentacji.")
      .add("TTL",8,ttl,"Limit liczby przeskoków; maleje przy routowaniu.").add("Protocol",8,protocol,"Numer protokołu: 1 ICMP, 6 TCP, 17 UDP.")
      .add("Header Checksum",16,0,"Suma kontrolna nagłówka IPv4. Obliczona dla pokazanych bajtów.");
  }
  l.add("Source Address",is6?128:32,addressBytes(source),"Adres IP nadawcy w tej warstwie.",source)
    .add("Destination Address",is6?128:32,addressBytes(destination),"Adres IP odbiorcy w tej warstwie.",destination);
  if (!is6) {
    const check=checksum(l.bytes), f=l.fields.find((item)=>item.label==="Header Checksum");
    const data=l.bytes; data[10]=check>>8;data[11]=check&255;
    f.bits=integer(check,16);f.value=`0x${check.toString(16).padStart(4,"0")}`;
    return {...l,bytes:data};
  }
  return l;
}
function sampleMAC(id) {
  let hash=2166136261;
  for(const char of id) hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  return Uint8Array.of(2,0,hash>>>24,(hash>>>16)&255,(hash>>>8)&255,hash&255);
}
function ethernet(source,destination,is6,title) {
  const mac=(value)=>[...value].map((byte)=>byte.toString(16).padStart(2,"0")).join(":");
  const a=sampleMAC(source),b=sampleMAC(destination);
  return layer(title).add("Destination MAC",48,b,"Przykładowy lokalnie administrowany MAC odbiorcy ramki; nie pochodzi z ARP/ND.",mac(b))
    .add("Source MAC",48,a,"Przykładowy lokalnie administrowany MAC nadawcy ramki.",mac(a))
    .add("EtherType",16,is6?0x86dd:0x0800,"Typ danych ramki: 0x0800 IPv4, 0x86dd IPv6.",is6?"0x86dd":"0x0800");
}
export function encodePacket(packet) {
  const is6=packet.family==="ipv6", payload=new TextEncoder().encode(packet.payload);
  const icmp=layer(is6?"ICMPv6 Echo Request":"ICMP Echo Request");
  icmp.add("Type",8,is6?128:8,"Echo Request: typ 8 dla ICMP, 128 dla ICMPv6.").add("Code",8,0,"Podtyp wiadomości; Echo Request używa kodu 0.")
    .add("Checksum",16,0,"Suma kontrolna wiadomości; ICMPv6 uwzględnia również pseudonagłówek IPv6.")
    .add("Identifier",16,1,"Przykładowy identyfikator zapytania Echo.").add("Sequence Number",16,1,"Przykładowy numer zapytania Echo.")
    .add("Payload",payload.length*8,payload,"Dane Echo zapisane jako UTF-8; odbiorca powtarza je w odpowiedzi.",packet.payload);
  const check=checksum(is6?concat(pseudo(packet.source,packet.destination,58,icmp.bytes.length),icmp.bytes):icmp.bytes);
  const icmpData=icmp.bytes;icmpData[2]=check>>8;icmpData[3]=check&255;
  icmp.fields[2].bits=integer(check,16);icmp.fields[2].value=`0x${check.toString(16).padStart(4,"0")}`;
  const inner=ip(packet.source,packet.destination,is6?58:1,icmpData.length,packet.vxlan?63:packet.ttl,packet.vxlan?"Wewnętrzny IP":"IP");
  const innerEthernet=ethernet(packet.from_id,packet.to_id,is6,packet.vxlan?"Wewnętrzny Ethernet":"Ethernet");
  if(!packet.vxlan) return [innerEthernet,inner,{...icmp,bytes:icmpData}];
  const vxlan=layer("VXLAN").add("Flags",8,8,"Bit I (0x08) wskazuje poprawny VNI. Pozostałe flagi mają wartość 0.","0x08")
    .add("Reserved",24,0,"Zarezerwowane, zerowane przez nadawcę.").add("VNI",24,packet.vni,"24-bitowy identyfikator sieci wirtualnej, wybrany dla tej VPC.")
    .add("Reserved tail",8,0,"Zarezerwowany bajt końcowy, wartość 0.");
  const body=concat(vxlan.bytes,innerEthernet.bytes,inner.bytes,icmpData);
  const udp=layer("UDP").add("Source Port",16,packet.udp_source_port,"Przykładowy port źródłowy; może wnosić entropię dla ECMP.")
    .add("Destination Port",16,packet.udp_destination_port,"Port 4789 identyfikuje VXLAN.").add("Length",16,8+body.length,"Długość UDP wraz z 8-bajtowym nagłówkiem.")
    .add("Checksum",16,0,"Suma kontrolna UDP z pseudonagłówkiem IP, obliczona dla przykładu.");
  const uCheck=checksum(concat(pseudo(packet.outer_source,packet.outer_destination,17,8+body.length),udp.bytes,body))||65535;
  const udpData=udp.bytes;udpData[6]=uCheck>>8;udpData[7]=uCheck&255;
  udp.fields[3].bits=integer(uCheck,16);udp.fields[3].value=`0x${uCheck.toString(16).padStart(4,"0")}`;
  const outer=ip(packet.outer_source,packet.outer_destination,17,8+body.length,64,"Zewnętrzny IPv4 · VTEP");
  return [ethernet(packet.physical_node_ids[0],packet.physical_node_ids[1]??packet.to_id,false,"Zewnętrzny Ethernet"),outer,{...udp,bytes:udpData},vxlan,innerEthernet,inner,{...icmp,bytes:icmpData}];
}
export function appendPacketBits(container,packet) {
  appendWireLayers(container,encodePacket(packet),packet.vxlan?"Przykład przy wyjściu z VTEP źródłowego; wewnętrzny TTL/Hop Limit 63, zewnętrzny TTL 64.":"Przykład przy wysłaniu pakietu; TTL/Hop Limit 64.");
}
export function appendBGPBits(container,session) {
  const bgp=layer("BGP KEEPALIVE").add("Marker",128,Uint8Array.from({length:16},()=>255),"16 bajtów 0xff w nagłówku BGP.","16 × ff")
    .add("Length",16,19,"Długość przykładowego KEEPALIVE: 19 bajtów.").add("Type",8,4,"4 = KEEPALIVE; atrybuty UPDATE (typ 2) możesz obejrzeć w eksportach sesji.");
  const tcp=layer("TCP").add("Source Port",16,49152,"Przykładowy port klienta TCP.").add("Destination Port",16,179,"Port usługi BGP.")
    .add("Sequence Number",32,1,"Przykładowy numer sekwencji bajtów.").add("Acknowledgment Number",32,1,"Przykładowe potwierdzenie bajtów.")
    .add("Data Offset",4,5,"5 słów 32-bitowych: nagłówek TCP bez opcji.").add("Reserved",4,0,"Zarezerwowane bity, zerowe w przykładzie.")
    .add("Flags",8,24,"PSH + ACK (0x18), przykładowy segment ustanowionej sesji.","0x18")
    .add("Window",16,65535,"Przykładowe okno odbiorcy, bez skalowania.").add("Checksum",16,0,"Suma kontrolna TCP, danych i pseudonagłówka IPv6.").add("Urgent Pointer",16,0,"Bez pilnych danych.");
  const check=checksum(concat(pseudo(session.a.address,session.b.address,6,39),tcp.bytes,bgp.bytes));
  const data=tcp.bytes;data[16]=check>>8;data[17]=check&255;tcp.fields[8].bits=integer(check,16);tcp.fields[8].value=`0x${check.toString(16).padStart(4,"0")}`;
  appendWireLayers(container,[ip(session.a.address,session.b.address,6,39,64,"IPv6 transportu BGP"),{...tcp,bytes:data},bgp],"Przykładowy KEEPALIVE w sesji BGP, nie przechwycony UPDATE; numery TCP i okno są poglądowe.");
}
function appendWireLayers(container,layers,note) {
  const section=document.createElement("section");section.className="dc-wire";
  const title=document.createElement("h4");title.textContent="Pakiet bit po bicie";title.tabIndex=-1;
  const intro=document.createElement("p");intro.textContent=`${note} Kliknij pole lub jego bity. Kolejność sieciowa: najbardziej znaczący bit pierwszy. MAC są przykładowe; bez preambuły i FCS.`;
  const info=document.createElement("div");info.className="dc-bit-info";info.setAttribute("role","status");info.setAttribute("aria-live","polite");info.textContent="Wybierz pole, aby poznać jego znaczenie i wartość.";
  section.append(title,intro,info);container.append(section);
  let absolute=0;
  for(const l of layers) {
    const details=document.createElement("details");details.className="dc-wire-layer";details.open=true;
    const summary=document.createElement("summary");summary.textContent=`${l.name} · ${l.bytes.length} B · bity ${absolute}–${absolute+l.bytes.length*8-1}`;
    const ruler=document.createElement("div");ruler.className="dc-bit-ruler";ruler.textContent="0        8        16       24      31";
    const grid=document.createElement("div");grid.className="dc-bit-grid";details.append(summary,ruler,grid);section.append(details);
    for(const [index,f] of l.fields.entries()) {
      const fragments=[];
      const highlight=(kind,enabled)=>{for(const fragment of fragments)fragment.classList.toggle(kind,enabled);};
      let consumed=0;
      while(consumed<f.width) {
        const offset=f.offset+consumed,length=Math.min(32-offset%32,f.width-consumed);
        const button=document.createElement("button");button.type="button";button.className="dc-bit-field";
        button.dataset.field=f.label;button.dataset.layer=l.name;button.dataset.fieldIndex=index;
        fragments.push(button);
        button.onpointerenter=()=>highlight("hovered",true);
        button.onpointerleave=()=>highlight("hovered",false);
        button.onfocus=()=>highlight("field-focus",true);
        button.onblur=()=>highlight("field-focus",false);
        button.style.gridColumn=`${offset%32+1} / span ${length}`;button.style.gridRow=String(Math.floor(offset/32)+1);
        button.setAttribute("aria-label",`${l.name}: ${f.label}, ${f.width} bitów, wartość ${f.value}`);
        const label=document.createElement("span");label.className="dc-bit-label";label.textContent=f.label;button.append(label);
        const bits=document.createElement("span");bits.className="dc-bit-values";
        for(const bit of f.bits.slice(consumed,consumed+length)) {const value=document.createElement("span");value.textContent=bit;bits.append(value);}
        button.append(bits);grid.append(button);
        const start=absolute+f.offset;
        button.onclick=()=>{
          for(const cell of section.querySelectorAll(".dc-bit-field")) {const active=cell.dataset.layer===l.name&&Number(cell.dataset.fieldIndex)===index;cell.classList.toggle("active",active);cell.setAttribute("aria-pressed",String(active));}
          const strong=document.createElement("strong");strong.textContent=`${l.name} / ${f.label} · ${f.width} bitów · ${f.value}`;
          const description=document.createElement("p");description.textContent=f.description;
          const position=document.createElement("p");position.textContent=`Bity ${start}–${start+f.width-1} pakietu (offset ${f.offset} w tej warstwie).`;
          info.replaceChildren(strong,description,position);
        };
        consumed+=length;
      }
    }
    absolute+=l.bytes.length*8;
  }
}
