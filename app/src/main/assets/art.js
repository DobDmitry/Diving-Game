"use strict";
/* ================================================================
   Рисующий слой игры «Вышка 10 м».

   Здесь только графика: палитра, градиенты, скелет спортсмена,
   зал, вышка, вода, трибуны, судьи, эффекты, камера.
   Физики, судейства и управления тут нет — они в index.html.

   Файл подключается ПЕРВЫМ, обычным <script src>, поэтому делит
   с игрой общую область видимости: обращения к состоянию игры
   (state, y, rot, sel, dives и т.д.) работают напрямую.

   Правки визуала должны затрагивать только этот файл.
   Карта разделов — в РИСОВАНИЕ.md
   ================================================================ */

const clamp=(v,a,b)=>v<a?a:v>b?b:v;

/* ============ процедурный скелет ============
 поза = углы суставов (градусы): torso — наклон корпуса от вертикали; spine — грудной отдел;
 head — отн. корпуса; sh — плечо (0 = «стрелочка» вверх, 90 = вперёд); el — локоть;
 hip — сгиб в тазу; knee — колено; ank — стопа (0 = оттянутый носок) */
const R=Math.PI/180,SKIN2="#DFA87C",OUTL="#C2865A";
const SEG={torso:13,thigh:10,shin:10,foot:5.5,uarm:8,farm:9,neck:6.4};
const POSES={
 stand:    {torso:0, spine:2, head:0, sh:176,el:4,  hip:2,  knee:3,  ank:88},
 armsUpFw: {torso:-3,spine:0, head:-4,sh:8,  el:2,  hip:1,  knee:2,  ank:88},
 armsFwdBk:{torso:2, spine:2, head:0, sh:90, el:4,  hip:2,  knee:3,  ank:88},
 /* 1 и 4 класс: короткий упругий подсед «как на скакалке», руки остаются сверху */
 hopFw:    {torso:7, spine:2, head:-3,sh:12, el:2,  hip:12, knee:26, ank:111},
 squatBk:  {torso:12,spine:8, head:-4,sh:204,el:10, hip:60, knee:86, ank:126},
 line:     {torso:0, spine:0, head:2, sh:0,  el:0,  hip:0,  knee:0,  ank:2},
 /* раскрытие 1 и 4 класса: уголок, ноги прямые, руки разведены в стороны —
    в профиль они уходят к камере и от неё, поэтому сильно сокращены (armF) */
 openFw:   {torso:5, spine:-2,head:10,sh:92, el:-4, hip:84, knee:0,  ank:0, armF:0.32},
 /* раскрытие 2 и 3 класса: «лодочка» с прогибом, руки вдоль тела */
 openBk:   {torso:0, spine:12, head:-11,sh:175,el:-10,hip:7,  knee:0, ank:-3},
 tuck:     {torso:26,spine:34,head:26,sh:112,el:44, hip:124,knee:138,ank:8},
 /* складка: плотный клин, спина плоская, ноги прямые с оттянутым носком,
    руки обхватывают голени у щиколоток — как в 107B/207B у сборников */
 pike:     {torso:18,spine:4, head:34,sh:147,el:-89,hip:130,knee:0,  ank:0}
};
/* armF — ракурсное сокращение рук (1 = рука в плоскости экрана, 0 = смотрит в камеру) */
const CH=["torso","spine","head","sh","el","hip","knee","ank","armF"];
Object.keys(POSES).forEach(k=>{if(POSES[k].armF==null)POSES[k].armF=1;});
const OPEN_ST={torso:[0,0.11],head:[0,0.11],hip:[0.03,0.13],knee:[0.07,0.13],ank:[0.05,0.10],sh:[0.09,0.15],el:[0.09,0.13]};
/* выход из складки на 2 и 3 классе: ноги идут вверх первыми, корпус откидывается назад следом */
const OPEN_ST_LEGS={hip:[0,0.14],knee:[0,0.11],ank:[0,0.09],torso:[0.07,0.15],head:[0.09,0.13],sh:[0.11,0.16],el:[0.11,0.14]};
/* смыкание в «стрелочку»: сначала уходит уголок, руки к голове последними */
const CLOSE_ST={hip:[0,0.16],knee:[0,0.11],ank:[0,0.09],torso:[0,0.14],head:[0.03,0.12],sh:[0.07,0.17],el:[0.07,0.15]};
const TUCK_ST={hip:[0,0.12],knee:[0,0.12],ank:[0,0.10],torso:[0.02,0.12],head:[0.02,0.12],sh:[0.05,0.13],el:[0.05,0.13]};
let poseCur=Object.assign({},POSES.stand),trans=null;
function setPose(to,dur,st){trans={from:Object.assign({},poseCur),to:to,t:0,dur:dur,st:st||null};}
function easeS(u){return u<=0?0:u>=1?1:u*u*(3-2*u);}
function tickPose(dt){
 if(!trans)return;
 trans.t+=dt;let done=true;
 for(const c of CH){
  let off=0,dur=trans.dur;
  if(trans.st&&trans.st[c]){off=trans.st[c][0];dur=trans.st[c][1];}
  const u=(trans.t-off)/dur;
  poseCur[c]=trans.from[c]+(trans.to[c]-trans.from[c])*easeS(u);
  if(u<1)done=false;
 }
 if(done)trans=null;
}
function pt(x,y,a,len){return[x+Math.sin(a*R)*len,y-Math.cos(a*R)*len];}
function torsoChain(p){
 const mid=pt(0,0,p.torso,SEG.torso/2);
 const shp=pt(mid[0],mid[1],p.torso+p.spine,SEG.torso/2);
 return[mid,shp];
}
/* сегмент с утолщением: даёт квадрицепс, икру, бицепс — а не «палку» */
function musc(x1,y1,x2,y2,w1,wm,w2,at,c){
 const mx=x1+(x2-x1)*at,my=y1+(y2-y1)*at;
 limbT(x1,y1,mx,my,w1,wm,c);limbT(mx,my,x2,y2,wm,w2,c);
}
/* w — прибавка к толщине: тот же контур, нарисованный тёмным «под» заливкой,
   отделяет руку от ноги, ногу от корпуса и т.д. */
function drawLeg(p,tx,aOff,c,k_,w){
 w=w||0;
 const a1=p.torso+180-p.hip+aOff,a2=a1+p.knee,a3=a2-p.ank;
 const k=pt(tx,0,a1,SEG.thigh),an=pt(k[0],k[1],a2,SEG.shin),tt=pt(an[0],an[1],a3,SEG.foot);
 musc(tx,0,k[0],k[1],3.5*k_+w,3.2*k_+w,2.2*k_+w,0.42,c);        /* бедро */
 musc(k[0],k[1],an[0],an[1],2.1*k_+w,2.6*k_+w,1.3*k_+w,0.30,c); /* икра */
 limbT(an[0],an[1],tt[0],tt[1],1.4*k_+w,0.7*k_+w,c);            /* стопа, носок оттянут */
}
function drawArm(p,sx,sy,aOff,c,k_,w){
 w=w||0;
 /* при развороте рук в стороны они укорачиваются в ракурсе и кажутся толще, кисть — крупнее */
 const F=p.armF==null?1:p.armF,kk=k_*(1+(1-F)*0.45),hk=1+(1-F)*1.5;
 const a1=p.torso+p.spine+p.sh+aOff,a2=a1+p.el;
 const e=pt(sx,sy,a1,SEG.uarm*F),h=pt(e[0],e[1],a2,SEG.farm*F);
 musc(sx,sy,e[0],e[1],2.4*kk+w,2.3*kk+w,1.5*kk+w,0.38,c);       /* бицепс */
 musc(e[0],e[1],h[0],h[1],1.5*kk+w,1.6*kk+w,1.0*kk+w,0.28,c);   /* предплечье */
 ctx.save();ctx.translate(h[0],h[1]);ctx.rotate(a2*R);
 ctx.fillStyle=c;ctx.beginPath();
 ctx.ellipse(0,0,(1.1*kk+w)*hk,(1.6*kk+w)*Math.min(hk,1.25),0,0,7);ctx.fill();ctx.restore();
}
function comOf(p){
 const[mid,shp]=torsoChain(p);
 const a1=p.torso+180-p.hip,a2=a1+p.knee;
 const k=pt(0,0,a1,SEG.thigh),an=pt(k[0],k[1],a2,SEG.shin);
 const b1=p.torso+p.spine+p.sh,b2=b1+p.el;
 const e=pt(shp[0],shp[1],b1,SEG.uarm),h=pt(e[0],e[1],b2,SEG.farm);
 const hc=pt(shp[0],shp[1],p.torso+p.spine+p.head,SEG.neck);
 let x=0,y=0;
 [[mid[0]/2,mid[1]/2,0.24],[(mid[0]+shp[0])/2,(mid[1]+shp[1])/2,0.22],[hc[0],hc[1],0.08],
  [k[0]/2,k[1]/2,0.22],[(k[0]+an[0])/2,(k[1]+an[1])/2,0.12],[an[0],an[1],0.03],
  [(shp[0]+e[0])/2,(shp[1]+e[1])/2,0.05],[(e[0]+h[0])/2,(e[1]+h[1])/2,0.04]
 ].forEach(m=>{x+=m[0]*m[2];y+=m[1]*m[2];});
 return[x,y];
}
function drawBody(px,py,worldAng,f,p,pivot){
 ctx.save();ctx.translate(px,py);if(worldAng)ctx.rotate(worldAng);ctx.scale(f,1);
 if(pivot)ctx.translate(-pivot[0],-pivot[1]);
 const[mid,shp]=torsoChain(p);
 const OW=0.62,HR=3.7;
 /* дальняя сторона тела — темнее и чуть тоньше: читается объём, а не «ножницы» */
 drawLeg(p,1.4,2,SKIN2,0.92);drawArm(p,shp[0]+1.2,shp[1]+0.4,3,SKIN2,0.92);
 /* корпус: контур, затем таз → талия → грудная клетка → плечи */
 musc(0,0,mid[0],mid[1],3.9+OW,3.3+OW,4.0+OW,0.48,OUTL);
 musc(mid[0],mid[1],shp[0],shp[1],4.0+OW,4.2+OW,3.4+OW,0.52,OUTL);
 musc(0,0,mid[0],mid[1],3.9,3.3,4.0,0.48,SKIN);
 musc(mid[0],mid[1],shp[0],shp[1],4.0,4.2,3.4,0.52,SKIN);
 /* дельтовидные */
 ctx.fillStyle=SKIN;ctx.beginPath();ctx.arc(shp[0],shp[1],2.7,0,7);ctx.fill();
 /* объём: теневая грань со стороны спины + линия грудных */
 const bx=-Math.cos(p.torso*R),by=-Math.sin(p.torso*R);
 ctx.globalAlpha=0.16;
 musc(bx*1.5,by*1.5,mid[0]+bx*1.6,mid[1]+by*1.6,1.9,1.6,1.9,0.5,"#9C6B44");
 limbT(mid[0]+bx*1.7,mid[1]+by*1.7,shp[0]+bx*1.4,shp[1]+by*1.4,2.0,1.6,"#9C6B44");
 ctx.globalAlpha=0.15;
 const pc=pt(mid[0],mid[1],p.torso+p.spine,2.0);
 limbT(pc[0]-bx*1.5,pc[1]-by*1.5,pc[0]+bx*1.5,pc[1]+by*1.5,0.75,0.75,"#A9714A");
 ctx.globalAlpha=1;
 /* ближние конечности: сначала контуры, потом заливка — руки и ноги не слипаются */
 drawLeg(p,0,0,OUTL,1,OW);drawLeg(p,0,0,SKIN,1);
 /* плавки — поверх бедра, иначе в стойке их закрывает нога */
 const hA=pt(0,0,p.torso+180,2.2),hB=pt(0,0,p.torso,1.4);
 const th=pt(0,0,p.torso+180-p.hip,3.2);
 limbT(hA[0],hA[1],hB[0],hB[1],4.1,3.9,SUIT);
 limbT(0,0,th[0],th[1],4.0,3.2,SUIT);
 ctx.globalAlpha=0.24;
 const wb=pt(0,0,p.torso,1.6);limbT(wb[0],wb[1],wb[0],wb[1],3.8,3.8,"#F2A98D");
 ctx.globalAlpha=1;
 const hAng=p.torso+p.spine+p.head;
 const nk=pt(shp[0],shp[1],hAng,2.8);
 const hc=pt(shp[0],shp[1],hAng,SEG.neck);
 limbT(shp[0],shp[1],nk[0],nk[1],2.4+OW,2.2+OW,OUTL);
 ctx.fillStyle=OUTL;ctx.beginPath();ctx.arc(hc[0],hc[1],HR+OW,0,7);ctx.fill();
 limbT(shp[0],shp[1],nk[0],nk[1],2.4,2.2,SKIN);
 ctx.save();ctx.translate(hc[0],hc[1]);ctx.rotate(hAng*R);headAt(0,0,HR);ctx.restore();
 /* ближняя рука — последней, поверх головы */
 drawArm(p,shp[0],shp[1],0,OUTL,1,OW);drawArm(p,shp[0],shp[1],0,SKIN,1);
 ctx.restore();
}
function footBottom(p){
 const a1=p.torso+180-p.hip,a2=a1+p.knee,a3=a2-p.ank;
 const k=pt(0,0,a1,SEG.thigh),an=pt(k[0],k[1],a2,SEG.shin),tt=pt(an[0],an[1],a3,SEG.foot);
 return Math.max(an[1],tt[1])+1.1;
}
const cv=document.getElementById("cv"),ctx=cv.getContext("2d");
const SKIN="#F2C09A",SUIT="#D85A30",HAIR="#3E2C21";
const W=420,H=680,PXM=46,WY=560,EDGE=134;
function m2y(h){return WY-h*PXM;}
/* ============ рендер сцены ============ */
const view={s:1,ox:0,oy:0};
const cam={cx:W/2,cy:H/2,z:1};
let vis={x0:0,y0:0,w:W,h:H};
function resize(){
 const dpr=Math.min(2,window.devicePixelRatio||1),b=cv.getBoundingClientRect();
 const bw=Math.max(80,Math.round(b.width*dpr)),bh=Math.max(80,Math.round(b.height*dpr));
 if(cv.width!==bw||cv.height!==bh){cv.width=bw;cv.height=bh;}
 view.s=Math.min(cv.width/W,cv.height/H);
 view.ox=(cv.width-W*view.s)/2;view.oy=(cv.height-H*view.s)/2;
}
window.addEventListener("resize",resize);
if(window.ResizeObserver)new ResizeObserver(resize).observe(cv);

const crowd=[];const cc=["#AFA9EC","#9FE1CB","#F5C4B3","#F4C0D1","#85B7EB","#FAC775","#ED93B1",
 "#C8D9F0","#EFB9A0","#B7E3A8","#E8CBEF"];
const skinC=["#F2C09A","#E0A377","#C98850","#F5CDAA","#A9713F","#EFCBA8","#8E5C33"];
const hairC=["#3E2C21","#6B4A32","#2C2622","#7A6A58","#4A3A2C","#A08B6E","#241E1A","#B79A64"];
const R2=Math.random;
for(let r=0;r<4;r++)for(let px=-160+(r%2)*8;px<600;px+=17)if(R2()>0.16)
 crowd.push({x:px+(R2()-0.5)*3,y:398+r*21,
  c:skinC[Math.floor(R2()*skinC.length)],hr:hairC[Math.floor(R2()*hairC.length)],
  s:cc[Math.floor(R2()*cc.length)],ph:R2()*6,
  w:0.88+R2()*0.3,cam:R2()<0.07,arm:R2()<0.45,lean:(R2()-0.5)*1.4});
const jSkin=["#F2C09A","#E0A377","#C98850","#F5CDAA","#B07A46","#EFC49F","#D9A878"];
const jHair=["#3E2C21","#6B4A32","#2C2622","#7A6A58","#4A3A2C","#8C8378","#241E1A"];
const jShirt=["#2C4E77","#37414D","#1F5F84","#40495A","#26567F","#333C48","#1B4A6E"];
const jBias=[-0.30,-0.10,0.05,0.20,-0.20,0.10,0.25];
const judges=[];
/* судейская бригада — по правому борту, чтобы не перекрывать точку входа */
[[272,492,1],[312,492,2],[352,492,3],[252,522,4],[292,522,5],[332,522,6],[372,522,7]]
 .forEach((p,i)=>judges.push({x:p[0],y:p[1],n:p[2],sk:jSkin[i],hr:jHair[i],
  st:jShirt[i],b:jBias[i],ph:i*1.37}));

/* конус с округлыми концами: даёт конечностям сужение, а суставам — скругление */
function limbT(x1,y1,x2,y2,w1,w2,c){
 const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy);
 ctx.fillStyle=c;
 if(L>0.01){const nx=-dy/L,ny=dx/L;
  ctx.beginPath();
  ctx.moveTo(x1+nx*w1,y1+ny*w1);ctx.lineTo(x2+nx*w2,y2+ny*w2);
  ctx.lineTo(x2-nx*w2,y2-ny*w2);ctx.lineTo(x1-nx*w1,y1-ny*w1);
  ctx.closePath();ctx.fill();}
 ctx.beginPath();ctx.arc(x1,y1,w1,0,7);ctx.fill();
 ctx.beginPath();ctx.arc(x2,y2,w2,0,7);ctx.fill();
}
/* без шапочки и очков: коротко стриженная голова, лицо смотрит в +x */
function headAt(hx,hy,r){
 ctx.fillStyle=SKIN;
 ctx.beginPath();ctx.arc(hx,hy,r,0,7);ctx.fill();
 ctx.beginPath();ctx.ellipse(hx+r*0.16,hy+r*0.28,r*0.74,r*0.66,0,0,7);ctx.fill();  /* челюсть */
 ctx.fillStyle=HAIR;                                                               /* волосы */
 ctx.beginPath();ctx.arc(hx,hy-r*0.06,r*1.02,Math.PI*0.94,Math.PI*2.03);ctx.closePath();ctx.fill();
 ctx.beginPath();ctx.ellipse(hx-r*0.46,hy-r*0.02,r*0.58,r*0.70,0,0,7);ctx.fill();  /* затылок */
 ctx.fillStyle=SKIN2;                                                              /* ухо */
 ctx.beginPath();ctx.ellipse(hx-r*0.02,hy+r*0.16,r*0.17,r*0.22,0,0,7);ctx.fill();
 ctx.fillStyle="#7A4E33";                                                          /* бровь */
 ctx.beginPath();ctx.ellipse(hx+r*0.46,hy-r*0.30,r*0.24,r*0.08,-0.2,0,7);ctx.fill();
 ctx.fillStyle="#31353B";                                                          /* глаз */
 ctx.beginPath();ctx.arc(hx+r*0.50,hy-r*0.06,r*0.13,0,7);ctx.fill();
}
function rrect(x0_,y0_,w,h,r){ctx.beginPath();
 if(ctx.roundRect)ctx.roundRect(x0_,y0_,w,h,r);else ctx.rect(x0_,y0_,w,h);}
function glassRail(xa,xb,yTop){
 ctx.save();ctx.translate(0,yTop);
 ctx.fillStyle=GR.glass;ctx.fillRect(xa,-17,xb-xa,17);
 ctx.fillStyle="rgba(255,255,255,0.55)";ctx.fillRect(xa,-14,xb-xa,1.6);
 ctx.fillStyle="#93AEC6";ctx.fillRect(xa,-19,xb-xa,2.2);
 for(let px=xa;px<=xb-2;px+=24){ctx.fillStyle="#A6BCCE";ctx.fillRect(px,-17,1.5,17);}
 ctx.restore();
}
/* ---- кэш градиентов: координаты мира статичны, строим один раз ---- */
const GR={};
function buildGrads(){
 let g=ctx.createLinearGradient(0,0,0,WY);
 g.addColorStop(0,"#D3E4F5");g.addColorStop(0.30,"#E9F2FA");g.addColorStop(1,"#E1ECF6");GR.hall=g;
 g=ctx.createLinearGradient(0,WY,0,WY+260);
 g.addColorStop(0,"#5FB0EA");g.addColorStop(0.22,"#3183CE");g.addColorStop(0.65,"#155C9C");
 g.addColorStop(1,"#0B3A6B");GR.water=g;
 g=ctx.createLinearGradient(18,0,74,0);
 g.addColorStop(0,"#F1EDE3");g.addColorStop(0.16,"#E4E0D5");g.addColorStop(0.55,"#CFCBBE");
 g.addColorStop(1,"#A39F91");GR.col=g;
 g=ctx.createLinearGradient(0,-4,0,5);          /* дюралевая доска трамплина */
 g.addColorStop(0,"#FBFCFD");g.addColorStop(0.4,"#DDE3E8");g.addColorStop(1,"#98A3AC");GR.board=g;
 g=ctx.createLinearGradient(0,0,0,11);
 g.addColorStop(0,"#F6F3EB");g.addColorStop(0.55,"#E6E2D8");g.addColorStop(1,"#CBC7BB");GR.slab=g;
 g=ctx.createLinearGradient(0,-19,0,0);
 g.addColorStop(0,"rgba(206,231,249,0.66)");g.addColorStop(1,"rgba(146,192,230,0.28)");GR.glass=g;
 g=ctx.createLinearGradient(0,478,0,WY);
 g.addColorStop(0,"#EFF4F9");g.addColorStop(1,"#D9E5EF");GR.deck=g;
 g=ctx.createLinearGradient(0,150,0,392);
 g.addColorStop(0,"#CFDDEC");g.addColorStop(1,"#BACBDD");GR.wall=g;
 g=ctx.createLinearGradient(0,0,0,12);
 g.addColorStop(0,"rgba(60,64,58,0.30)");g.addColorStop(1,"rgba(60,64,58,0)");GR.ao=g;
 g=ctx.createLinearGradient(0,176,0,306);
 g.addColorStop(0,"#F7FBFF");g.addColorStop(1,"#C4DCF2");GR.win=g;
}
/* нескользящее покрытие площадок — фиксированный «шум», а не рандом каждый кадр */
const GRIT=[];for(let i=0;i<260;i++)GRIT.push([Math.random(),Math.random()]);
/* потолок, задняя стена, окна, табло */
function drawHall(){
 ctx.fillStyle=GR.hall;ctx.fillRect(vis.x0-30,vis.y0-30,vis.w+60,vis.h+60);
 /* фермы перекрытия */
 ctx.strokeStyle="rgba(146,170,194,0.30)";ctx.lineWidth=2.2;
 ctx.beginPath();ctx.moveTo(vis.x0-30,16);ctx.lineTo(vis.x0+vis.w+30,16);
 ctx.moveTo(vis.x0-30,40);ctx.lineTo(vis.x0+vis.w+30,40);ctx.stroke();
 ctx.lineWidth=1.1;ctx.beginPath();
 for(let px=Math.floor((vis.x0-30)/30)*30;px<vis.x0+vis.w+30;px+=30){
  ctx.moveTo(px,16);ctx.lineTo(px+15,40);ctx.lineTo(px+30,16);}
 ctx.stroke();
 /* световые панели */
 for(let px=Math.floor((vis.x0-30)/76)*76;px<vis.x0+vis.w+30;px+=76){
  ctx.fillStyle="rgba(255,252,232,0.85)";rrect(px,46,40,5,2.5);ctx.fill();
  ctx.fillStyle="rgba(255,250,220,0.20)";rrect(px-6,50,52,14,7);ctx.fill();}
 /* задняя стена и окна */
 ctx.fillStyle=GR.wall;ctx.fillRect(vis.x0-30,150,vis.w+60,242);
 for(let px=Math.floor((vis.x0-30)/98)*98;px<vis.x0+vis.w+30;px+=98){
  ctx.fillStyle=GR.win;rrect(px,176,54,130,4);ctx.fill();
  ctx.fillStyle="rgba(255,255,255,0.55)";ctx.fillRect(px+25,176,2,130);
  ctx.fillStyle="rgba(140,168,194,0.35)";ctx.fillRect(px,238,54,2);}
 ctx.fillStyle="rgba(120,150,178,0.25)";ctx.fillRect(vis.x0-30,150,vis.w+60,3);
 drawBoard();
}
/* информационное табло на стене */
function drawBoard(){
 const bx=250,by=196,bw=146,bh=74,d=dives[sel];
 ctx.fillStyle="rgba(11,37,69,0.10)";rrect(bx+3,by+4,bw,bh,7);ctx.fill();
 ctx.fillStyle="#16283C";rrect(bx,by,bw,bh,7);ctx.fill();
 ctx.fillStyle="#22384F";rrect(bx+5,by+5,bw-10,bh-10,4);ctx.fill();
 ctx.font="600 16px 'Segoe UI',sans-serif";ctx.fillStyle="#F5C244";
 ctx.fillText(d.num,bx+12,by+26);
 ctx.font="10px 'Segoe UI',sans-serif";ctx.fillStyle="#8FB8DE";
 ctx.fillText("КТ "+d.dd.toFixed(1),bx+12,by+40);
 const sc=lastRes?lastRes.total.toFixed(2):"--.--";
 ctx.font="600 19px 'Segoe UI',sans-serif";ctx.fillStyle="#25B47E";
 ctx.fillText(sc,bx+bw-12-ctx.measureText(sc).width,by+27);
 ctx.font="9px 'Segoe UI',sans-serif";ctx.fillStyle="#6E8CA8";
 const lb="ПОСЛЕДНЯЯ";ctx.fillText(lb,bx+bw-12-ctx.measureText(lb).width,by+40);
 ctx.fillStyle="rgba(143,184,222,0.22)";ctx.fillRect(bx+12,by+47,bw-24,1);
 ctx.font="9.5px 'Segoe UI',sans-serif";ctx.fillStyle="#8FB8DE";
 ctx.fillText(mode==="meet"?"СОРЕВНОВАНИЕ · ПРЫЖОК "+Math.min(meetRows.length+1,MEET_PROG.length)+"/"+MEET_PROG.length:"РЕЖИМ ТРЕНИРОВКИ",bx+12,by+62);
}
/* мягкое затемнение под нависающей плитой */
function ao(x,w,yTop,h){ctx.save();ctx.translate(0,yTop);
 ctx.fillStyle=GR.ao;ctx.fillRect(x,0,w,h||12);ctx.restore();}
function slab(x,w,yTop,h){
 ctx.save();ctx.translate(0,yTop);
 ctx.fillStyle=GR.slab;rrect(x,0,w,h,2.5);ctx.fill();
 ctx.fillStyle="rgba(255,255,255,0.7)";ctx.fillRect(x,0,w,1.4);
 ctx.fillStyle="#A6A296";ctx.fillRect(x,h-2.4,w,2.4);
 ctx.fillStyle="rgba(120,116,104,0.30)";
 for(let i=0;i<GRIT.length;i+=2){const g=GRIT[i];
  ctx.fillRect(x+g[0]*w,1.8+g[1]*(h-5),0.9,0.9);}
 ctx.restore();
}
/* консольная косынка под площадкой — то, чем плита опирается на ствол */
function gusset(xc,yTop,len,drop){
 ctx.fillStyle="#C3BFB2";
 ctx.beginPath();ctx.moveTo(xc,yTop);ctx.lineTo(xc+len,yTop);ctx.lineTo(xc,yTop+drop);
 ctx.closePath();ctx.fill();
 ctx.fillStyle="rgba(96,92,84,0.16)";                               /* затенение по гипотенузе */
 ctx.beginPath();ctx.moveTo(xc+len,yTop);ctx.lineTo(xc,yTop+drop);ctx.lineTo(xc,yTop+drop*0.78);
 ctx.closePath();ctx.fill();
 ctx.fillStyle="rgba(255,255,255,0.30)";ctx.fillRect(xc,yTop,len,1.4);
}
/* трамплин 3 м: площадка, анкер, дюралевая доска, каретка */
function springboard(y3){
 const x0b=62,x1b=146,th=4.2,dTop=y3+5;
 gusset(74,dTop+11,22,26);
 ao(20,100,dTop+11);slab(20,100,dTop,11);glassRail(22,58,dTop);
 ctx.fillStyle="#B3AFA2";rrect(58,y3+1,24,5,1.5);ctx.fill();        /* анкерный блок */
 ctx.fillStyle="#8E96A0";rrect(96,y3+1,16,5,1.5);ctx.fill();        /* каретка */
 ctx.fillStyle="#5F6870";ctx.beginPath();ctx.arc(104,y3+5,3.2,0,7);ctx.fill();
 ctx.fillStyle="#9AA3AC";ctx.beginPath();ctx.arc(104,y3+5,1.4,0,7);ctx.fill();
 /* доска: к концу чуть провисает */
 ctx.save();ctx.translate(0,y3-3);
 ctx.fillStyle=GR.board;
 ctx.beginPath();
 ctx.moveTo(x0b,0);ctx.lineTo(x1b,2.6);ctx.lineTo(x1b,2.6+th*0.82);ctx.lineTo(x0b,th);
 ctx.closePath();ctx.fill();
 ctx.fillStyle="rgba(255,255,255,0.65)";
 ctx.beginPath();ctx.moveTo(x0b,0);ctx.lineTo(x1b,2.6);ctx.lineTo(x1b,3.5);ctx.lineTo(x0b,0.9);
 ctx.closePath();ctx.fill();
 ctx.fillStyle="rgba(110,116,124,0.45)";                            /* нескользящее покрытие */
 for(let i=0;i<GRIT.length;i+=3){const g=GRIT[i];
  ctx.fillRect(x0b+2+g[0]*(x1b-x0b-4),1.0+g[1]*2.0+g[0]*2.4,1.0,0.9);}
 ctx.restore();
 ctx.fillStyle="rgba(90,88,80,0.22)";                               /* тень под доской */
 ctx.beginPath();ctx.moveTo(x0b,y3+1.2+th);ctx.lineTo(x1b,y3+3.8+th*0.82);
 ctx.lineTo(x1b,y3+5.0+th*0.82);ctx.lineTo(x0b,y3+2.4+th);ctx.closePath();ctx.fill();
}
/* лестничная шахта, приросшая к стволу */
function stairs(yTop,yBot){
 ctx.fillStyle="#C8C4B7";ctx.fillRect(2,yTop,18,yBot-yTop);
 ctx.fillStyle="rgba(255,255,255,0.45)";ctx.fillRect(2,yTop,1.8,yBot-yTop);
 ctx.fillStyle="rgba(96,92,84,0.16)";ctx.fillRect(15,yTop,5,yBot-yTop);
 ctx.fillStyle="rgba(120,116,106,0.40)";                            /* ступени */
 for(let ry=yTop+8;ry<yBot-4;ry+=8){ctx.fillRect(4,ry,11,1.5);
  ctx.fillStyle="rgba(255,255,255,0.30)";ctx.fillRect(4,ry+1.5,11,0.7);
  ctx.fillStyle="rgba(120,116,106,0.40)";}
 ctx.fillStyle="rgba(178,212,240,0.40)";ctx.fillRect(3.2,yTop,1.5,yBot-yTop);
}
function drawTower(){
 const y10=m2y(10),y75=m2y(7.5),y5=m2y(5),y3=m2y(3),deck=WY-8,lx=Math.min(0,vis.x0);
 /* бортик бассейна */
 ctx.fillStyle="#EDEAE1";ctx.fillRect(lx,deck,96-lx,8);
 ctx.fillStyle="#CFCBBF";ctx.fillRect(lx,deck,96-lx,1.8);
 ctx.fillStyle="rgba(90,86,78,0.18)";ctx.fillRect(lx,deck+6.2,96-lx,1.8);
 /* уширенное основание: ствол расходится книзу */
 ctx.fillStyle="#B9B5A8";
 ctx.beginPath();ctx.moveTo(20,y5);ctx.lineTo(74,y5);ctx.lineTo(84,deck);ctx.lineTo(10,deck);
 ctx.closePath();ctx.fill();
 /* основной ствол */
 ctx.fillStyle=GR.col;ctx.fillRect(20,y10,54,deck-y10);
 ctx.fillStyle="rgba(255,255,255,0.55)";ctx.fillRect(20,y10,2.6,deck-y10);
 ctx.fillStyle="rgba(96,92,84,0.26)";ctx.fillRect(66,y10,8,deck-y10);
 ctx.fillStyle="rgba(96,92,84,0.13)";ctx.fillRect(45,y10,1.6,deck-y10);
 for(let jy=y10+58;jy<deck;jy+=58){                                  /* швы бетонирования */
  ctx.fillStyle="rgba(120,116,106,0.20)";ctx.fillRect(20,jy,54,1.3);
  ctx.fillStyle="rgba(255,255,255,0.28)";ctx.fillRect(20,jy+1.3,54,0.8);}
 stairs(y10+14,deck-2);
 /* площадки снизу вверх: косынка, тень, плита, ограждение */
 springboard(y3);
 gusset(74,y5+12,22,26);   ao(20,96,y5+12); slab(20,96,y5,12); glassRail(22,92,y5);
 gusset(74,y75+12,26,30);  ao(20,106,y75+12);slab(20,106,y75,12);glassRail(22,100,y75);
 gusset(74,y10+14,32,36);  ao(20,EDGE-20,y10+14);slab(20,EDGE-20,y10,14);glassRail(22,110,y10);
 /* отметки высоты */
 ctx.fillStyle="#7E7B72";ctx.font="600 10px 'Segoe UI',sans-serif";
 ctx.fillText("10",26,y10+10);ctx.fillText("7.5",26,y75+9);
 ctx.fillText("5",26,y5+9);ctx.fillText("3",26,y3+11);
}
function drawStands(){
 const xa=Math.min(40,vis.x0)-20,xb=Math.max(410,vis.x0+vis.w)+20;
 for(let r=0;r<4;r++){
  ctx.fillStyle=r%2?"#DAD7CD":"#E6E3DA";ctx.fillRect(xa,390+r*21,xb-xa,21);
  ctx.fillStyle="rgba(112,108,98,0.16)";ctx.fillRect(xa,390+r*21,xb-xa,2.2);}
 const cheer=cardT>0,amp=cheer?2.4:0.5,spd=cheer?8:1.4;
 const fly=state==="flight",dx0=vis.x0-16,dx1=vis.x0+vis.w+16;
 const divX=fly?curX():210;
 crowd.forEach(p=>{
  if(p.x<dx0||p.x>dx1)return;                       /* за кадром не рисуем */
  const w=p.w,dy=Math.sin(tGlob*spd+p.ph)*amp,br=Math.sin(tGlob*1.7+p.ph)*0.3;
  const look=clamp((divX-p.x)/150,-1,1)*(fly?1.1:0.4);
  const bx=p.x+p.lean*0.5,by=p.y+dy;
  /* торс: плечи шире таза */
  limbT(bx,by+13.5,bx+p.lean,by+5.2+br,3.3*w,4.3*w,p.s);
  /* руки */
  if(cheer&&p.arm){
   const sw=Math.sin(tGlob*7+p.ph)*1.6;
   limbT(bx-3.6*w,by+7,bx-4.6*w+sw,by-2.5,1.5*w,1.2*w,p.s);
   limbT(bx+3.6*w,by+7,bx+4.6*w+sw,by-2.5,1.5*w,1.2*w,p.s);
   ctx.fillStyle=p.c;
   ctx.beginPath();ctx.arc(bx-4.7*w+sw,by-3.1,1.3*w,0,7);ctx.fill();
   ctx.beginPath();ctx.arc(bx+4.7*w+sw,by-3.1,1.3*w,0,7);ctx.fill();
  }else{
   limbT(bx-3.4*w,by+7,bx-4.0*w,by+13,1.4*w,1.1*w,p.s);
   limbT(bx+3.4*w,by+7,bx+4.0*w,by+13,1.4*w,1.1*w,p.s);
  }
  /* шея и голова, повёрнутая вслед за спортсменом */
  const hx=bx+p.lean*0.6+look*0.9,hy=by+1.5+br;
  limbT(bx+p.lean,by+5.2+br,hx,hy+2.4,1.5*w,1.5*w,p.c);
  ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(hx,hy,3.2*w,0,7);ctx.fill();
  ctx.fillStyle=p.hr;
  ctx.beginPath();ctx.arc(hx,hy-0.4,3.3*w,Math.PI*0.94,Math.PI*2.05);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.ellipse(hx-look*1.4,hy-0.2,1.7*w,2.2*w,0,0,7);ctx.fill();
  if(cheer&&p.cam){/* вспышки фотоаппаратов на трибунах */
   const f=Math.sin(tGlob*3.1+p.ph*4);
   if(f>0.955){const k=(f-0.955)*22;
    ctx.fillStyle="rgba(255,255,255,"+(0.16*k)+")";
    ctx.beginPath();ctx.arc(hx,hy,5.5,0,7);ctx.fill();
    ctx.fillStyle="rgba(255,255,255,"+(0.85*k)+")";
    ctx.beginPath();ctx.arc(hx,hy,1.5,0,7);ctx.fill();}}
 });
 ctx.fillStyle="#C8C4B9";ctx.fillRect(xa,474,xb-xa,4);
 ctx.fillStyle="rgba(255,255,255,0.5)";ctx.fillRect(xa,474,xb-xa,1);
}
function easeBack(u){return u>=1?1:1-Math.pow(1-u,2)*(1-2.2*u*(1-u));}
/* судья: корпус с плечами, руки на столе, голова провожает спортсмена */
function drawJudge(j,i,u){
 const sway=Math.sin(tGlob*0.85+j.ph)*0.7,breath=Math.sin(tGlob*1.3+j.ph)*0.35;
 const look=state==="flight"?clamp((curX()-j.x)/90,-1,0.6):(cardT>0?0.25:0);
 ctx.save();ctx.translate(j.x+sway*0.5,j.y);
 ctx.fillStyle="rgba(60,70,80,0.13)";
 ctx.beginPath();ctx.ellipse(0,21,8,2.3,0,0,7);ctx.fill();
 limbT(0,20,sway*0.3,7.5+breath,5.0,5.9,j.st);              /* корпус */
 ctx.fillStyle="rgba(255,255,255,0.14)";
 ctx.beginPath();ctx.ellipse(-2.6,13,1.7,5.2,0.06,0,7);ctx.fill();
 /* левая рука: со стола поднимается вместе с карточкой */
 const hx=-6.4+0.3*u,hy=17.5-25*u;
 limbT(-5.4,9.5,hx,hy,1.9,1.4,j.st);
 ctx.fillStyle=j.sk;ctx.beginPath();ctx.arc(hx,hy+0.7,1.5,0,7);ctx.fill();
 limbT(5.4,9.5,6.4,17.5,1.9,1.5,j.st);
 ctx.fillStyle=j.sk;ctx.beginPath();ctx.arc(6.5,18.2,1.5,0,7);ctx.fill();
 limbT(sway*0.3,7.5+breath,sway*0.3,4.6+breath,2.1,2.0,j.sk); /* шея */
 ctx.save();ctx.translate(sway*0.3,breath);ctx.rotate(look*0.22);
 ctx.fillStyle=j.sk;ctx.beginPath();ctx.arc(0,-0.4,4.7,0,7);ctx.fill();
 ctx.fillStyle=j.hr;
 ctx.beginPath();ctx.arc(0,-0.9,4.8,Math.PI*0.95,Math.PI*2.06);ctx.closePath();ctx.fill();
 ctx.beginPath();ctx.ellipse(-2.1,-0.6,2.5,3.1,0,0,7);ctx.fill();
 ctx.fillStyle="#3A3E44";ctx.beginPath();ctx.arc(2.1,-0.3,0.85,0,7);ctx.fill();
 ctx.restore();ctx.restore();
}
function cardU(i){return cardT>0?easeBack(clamp((CARD_T-cardT-i*0.09)/0.30,0,1)):0;}
function drawJudges(){
 judges.forEach((j,i)=>drawJudge(j,i,cardU(i)));
 ctx.fillStyle="#FBFAF7";ctx.fillRect(244,511,148,8);
 ctx.fillStyle="#FBFAF7";ctx.fillRect(224,541,196,8);
 ctx.fillStyle="rgba(120,116,106,0.35)";ctx.fillRect(244,519,148,1.6);ctx.fillRect(224,549,196,1.6);
 ctx.fillStyle="#8B887E";ctx.font="8.5px sans-serif";
 judges.forEach(j=>ctx.fillText(j.n,j.x-2,j.y+(j.n<4?25:26)));
 if(cardT>0){
  const age=CARD_T-cardT;
  judges.forEach((j,i)=>{
   const u=clamp((age-i*0.09)/0.30,0,1);if(u<=0)return;
   const e=easeBack(u),tilt=(1-u)*(i%2?0.35:-0.35);
   ctx.save();ctx.translate(j.x-6.1,j.y-8.4);
   ctx.rotate(tilt);ctx.translate(0,(1-e)*24);ctx.scale(0.6+0.4*e,0.6+0.4*e);
   ctx.fillStyle="rgba(11,37,69,0.16)";rrect(-9,-13,20,15,2.5);ctx.fill();
   ctx.fillStyle="#FFFFFF";rrect(-10,-14,20,15,2.5);ctx.fill();
   ctx.strokeStyle="#B4B2A9";ctx.lineWidth=0.8;ctx.stroke();
   ctx.fillStyle="#0B2545";ctx.font="600 10px 'Segoe UI',sans-serif";
   const s=cardScores[i].toFixed(1);
   ctx.fillText(s,-ctx.measureText(s).width/2,-3);
   ctx.restore();});}
}
function waveY(px){return WY+Math.sin(px*0.05+tGlob*2.4)*1.8+Math.sin(px*0.113-tGlob*1.7)*0.9;}
function drawWater(){
 const xa=vis.x0-20,xb=vis.x0+vis.w+20,yb=vis.y0+vis.h+40;
 ctx.fillStyle=GR.water;ctx.beginPath();ctx.moveTo(xa,yb);ctx.lineTo(xa,waveY(xa));
 for(let px=xa;px<=xb;px+=10)ctx.lineTo(px,waveY(px));
 ctx.lineTo(xb,yb);ctx.closePath();ctx.fill();
 /* каустики: редкие световые полосы, глубже — слабее */
 for(let i=0;i<5;i++){const ry=WY+22+i*26,ph=tGlob*(0.45+i*0.1)+i*1.7;
  ctx.strokeStyle="rgba(198,232,255,"+(0.14-i*0.022)+")";ctx.lineWidth=3.2;
  ctx.beginPath();
  for(let px=xa;px<=xb;px+=16)ctx.lineTo(px,ry+Math.sin(px*0.038+ph)*4.5);
  ctx.stroke();}
 /* линия поверхности и блик */
 ctx.strokeStyle="rgba(236,246,255,0.85)";ctx.lineWidth=2;ctx.beginPath();
 for(let px=xa;px<=xb;px+=10)px===xa?ctx.moveTo(px,waveY(px)):ctx.lineTo(px,waveY(px));
 ctx.stroke();
 ctx.strokeStyle="rgba(255,255,255,0.30)";ctx.lineWidth=5;ctx.beginPath();
 for(let px=xa;px<=xb;px+=10)px===xa?ctx.moveTo(px,waveY(px)+5):ctx.lineTo(px,waveY(px)+5);
 ctx.stroke();
}
/* отражение спортсмена на воде — сплюснутое, с волновым дрожанием */
function drawReflection(px,py,ang,f,p){
 const k=clamp((4.2-y)/4.2,0,1);if(k<=0)return;
 ctx.save();
 ctx.beginPath();ctx.rect(vis.x0-20,WY,vis.w+40,90);ctx.clip();
 ctx.globalAlpha=0.20*k;
 ctx.translate(Math.sin(tGlob*3)*1.2,WY);ctx.scale(1,-0.82);ctx.translate(0,-WY);
 drawBody(px,py,ang,f,p,comOf(p));
 ctx.restore();
}
function spawnSplash(x,power){
 foam.push({x:x,r:5,rm:20+power*44,a:0.9,t:0});
 crown.push({x:x,t:0,dur:0.44+power*0.20,pw:power});
 const n=Math.round(10+power*34);
 for(let i=0;i<n;i++){
  const a=(Math.random()-0.5)*(0.6+power*0.95),sp=(1.8+Math.random()*3.0)*(0.6+power*0.9);
  drops.push({x:x+(Math.random()-0.5)*(6+power*14),y:WY-2,
   vx:Math.sin(a)*sp*1.2,vy:-Math.cos(a)*sp*(1.6+power*0.9),
   r:0.9+Math.random()*2.2,a:1});}
 for(let i=0;i<4;i++)rings.push({x:x,r:4+i*7,a:0.6-i*0.11,v:0.9+i*0.32});
 jets.push({x:x,w:7+power*16,h:4,v:3.0+power*3.2});
}
function drawFx(){
 foam.forEach(f=>{ctx.fillStyle="rgba(255,255,255,"+f.a+")";
  ctx.beginPath();ctx.ellipse(f.x,WY+3,f.r,f.r*0.19,0,0,7);ctx.fill();});
 rings.forEach(g=>{ctx.strokeStyle="rgba(255,255,255,"+g.a+")";ctx.lineWidth=1.8;
  ctx.beginPath();ctx.ellipse(g.x,WY+4,g.r,g.r*0.22,0,0,7);ctx.stroke();});
 bubbles.forEach(b=>{ctx.strokeStyle="rgba(255,255,255,"+b.a+")";ctx.lineWidth=0.9;
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,7);ctx.stroke();});
 /* «корона» из воды по краям входа */
 crown.forEach(c=>{const u=clamp(c.t/c.dur,0,1),e=Math.sin(u*Math.PI);
  const wid=(7+c.pw*22)*(0.45+u*1.05),hgt=(5+c.pw*24)*e;
  ctx.fillStyle="rgba(255,255,255,"+(0.72*(1-u))+")";
  for(let s=-1;s<=1;s+=2){ctx.beginPath();
   ctx.moveTo(c.x+s*wid*0.30,WY+3);
   ctx.quadraticCurveTo(c.x+s*wid*0.75,WY-hgt*0.72,c.x+s*wid,WY-hgt*0.12);
   ctx.lineTo(c.x+s*wid*1.18,WY+3);ctx.closePath();ctx.fill();}});
 /* центральный столб */
 jets.forEach(j=>{ctx.fillStyle="rgba(234,246,255,0.9)";ctx.beginPath();
  ctx.moveTo(j.x-j.w/2,WY+5);
  ctx.quadraticCurveTo(j.x-j.w*0.26,WY-j.h*0.62,j.x,WY-j.h);
  ctx.quadraticCurveTo(j.x+j.w*0.26,WY-j.h*0.62,j.x+j.w/2,WY+5);
  ctx.closePath();ctx.fill();});
 /* капли, вытянутые по вектору скорости */
 drops.forEach(p=>{const sp=Math.hypot(p.vx,p.vy),st=clamp(sp*0.42,0.8,3.0);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));
  ctx.fillStyle="rgba(255,255,255,"+p.a+")";
  ctx.beginPath();ctx.ellipse(0,0,p.r*st,p.r,0,0,7);ctx.fill();ctx.restore();});
}
/* окно «входа»: пульсирующая метка на воде */
function drawRipCue(){
 if(!(state==="flight"&&opened&&!ripUsed&&y<=RIP_OPEN))return;
 const k=(Math.sin(tGlob*16)+1)/2,x=curX();
 ctx.strokeStyle="rgba(37,180,126,"+(0.35+0.5*k)+")";ctx.lineWidth=2.4;
 ctx.beginPath();ctx.ellipse(x,WY+2,20+8*k,6+2*k,0,0,7);ctx.stroke();
}
/* HUD: счётчик оборотов + индикатор момента раскрытия */
function drawHud(){
 if(state!=="flight")return;
 const d=dives[sel];
 ctx.fillStyle="rgba(255,255,255,0.82)";rrect(268,14,140,hints?66:44,9);ctx.fill();
 ctx.fillStyle="#185FA5";ctx.font="600 12px sans-serif";
 ctx.fillText("Сальто "+(rot/360).toFixed(2)+" / "+d.req.toFixed(1),278,31);
 const p=clamp(rot/(d.req*360),0,1);
 ctx.fillStyle="#DCE7F1";rrect(278,37,120,5,2.5);ctx.fill();
 ctx.fillStyle=p>1.02?"#E05252":"#25B47E";rrect(278,37,120*p,5,2.5);ctx.fill();
 if(!hints)return;
 const k=openErr();
 ctx.fillStyle="#5B7089";ctx.font="10px sans-serif";
 ctx.fillText(tucked?"момент раскрытия":"выход сделан",278,56);
 ctx.fillStyle="#E7EDF3";rrect(278,60,120,7,3.5);ctx.fill();
 ctx.fillStyle="rgba(37,180,126,0.35)";rrect(334,60,8,7,3.5);ctx.fill();
 if(tucked){const u=clamp(k/200,-1,1);
  ctx.fillStyle=Math.abs(k)<14?"#25B47E":"#0B2545";
  rrect(336+u*57,58,4,11,2);ctx.fill();}
}
function camTarget(){
 if(state==="flight")return[curX()+22,m2y(y),1.5];
 if(state==="entry")return[entryX,WY-30,1.7];
 if(state==="score")return[236,472,1.12];
 return[W/2,H/2,1];
}
function draw(){
 ctx.setTransform(1,0,0,1,0,0);
 ctx.fillStyle="#F0F6FC";ctx.fillRect(0,0,cv.width,cv.height);
 const a=view.s*cam.z;
 const Cx=view.ox+view.s*W/2,Cy=view.oy+view.s*H/2;
 const sh=shake>0?(Math.random()-0.5)*shake:0;
 ctx.setTransform(a,0,0,a,Cx-a*cam.cx+sh,Cy-a*cam.cy+sh);
 vis={x0:cam.cx-Cx/a,y0:cam.cy-Cy/a,w:cv.width/a,h:cv.height/a};
 drawHall();
 drawStands();
 /* воздушная перспектива: дальний план чуть выцветает */
 ctx.fillStyle="rgba(240,247,253,0.18)";
 ctx.fillRect(vis.x0-30,vis.y0-30,vis.w+60,478-(vis.y0-30));
 ctx.fillStyle=GR.deck;ctx.fillRect(vis.x0-30,478,vis.w+60,WY-478);
 ctx.fillStyle="rgba(150,172,192,0.20)";ctx.fillRect(vis.x0-30,WY-14,vis.w+60,14);
 drawJudges();
 drawWater();
 const d=dives[sel];
 if(state==="flight")drawReflection(curX(),m2y(y),d.dir*rot*R,d.f,poseCur);
 if(state==="entry"){/* уход под воду: часть над водой и часть под ней рисуются раздельно */
  const fade=clamp(1+y/3.2,0,1),pv=comOf(poseCur);
  ctx.save();ctx.beginPath();ctx.rect(vis.x0-30,vis.y0-30,vis.w+60,WY-vis.y0+30);ctx.clip();
  ctx.globalAlpha=fade;drawBody(entryX,m2y(y),entryAng,d.f,poseCur,pv);ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(vis.x0-30,WY,vis.w+60,240);ctx.clip();
  ctx.globalAlpha=0.55*fade;drawBody(entryX,m2y(y),entryAng,d.f,poseCur,pv);ctx.restore();
  ctx.globalAlpha=1;
 }
 drawTower();
 drawFx();
 drawRipCue();
 if(state==="flight"){
  drawBody(curX(),m2y(y),d.dir*rot*R,d.f,poseCur,comOf(poseCur));
 }else if(state!=="entry"){
  /* дыхание в стойке: живая поза без отдельной анимации */
  let p=poseCur;
  if(state==="idle"||state==="armed"){const b=Math.sin(tGlob*1.5);
   p=Object.assign({},poseCur,{torso:poseCur.torso+b*0.35,spine:poseCur.spine+b*0.55,
    head:poseCur.head-b*0.3,sh:poseCur.sh+b*0.6});}
  const fy=m2y(10)-footBottom(p);
  ctx.fillStyle="rgba(70,74,68,0.20)";
  ctx.beginPath();ctx.ellipse(standX()+d.f*1.5,m2y(10)+1.5,7.5,2,0,0,7);ctx.fill();
  drawBody(standX(),fy,0,d.f,p,null);
 }
 /* HUD — без камеры, в координатах мира 420×680 */
 ctx.setTransform(view.s,0,0,view.s,view.ox,view.oy);
 drawHud();
 /* виньетка — в координатах устройства */
 ctx.setTransform(1,0,0,1,0,0);
 if(!GR.vig||GR.vw!==cv.width||GR.vh!==cv.height){
  const r=Math.hypot(cv.width,cv.height)/2;
  const g=ctx.createRadialGradient(cv.width/2,cv.height/2,r*0.55,cv.width/2,cv.height/2,r);
  g.addColorStop(0,"rgba(11,37,69,0)");g.addColorStop(1,"rgba(11,37,69,0.17)");
  GR.vig=g;GR.vw=cv.width;GR.vh=cv.height;}
 ctx.fillStyle=GR.vig;ctx.fillRect(0,0,cv.width,cv.height);
}
