/* Script commun à toutes les pages (chargé en defer). Chaque bloc vérifie que ses éléments existent :
   le quiz, la page de réservation et la parallaxe du héros ne sont présents que sur l'accueil. */
(function(){
  var d=document, root=d.documentElement;
  root.classList.add('js'); root.lang='fr';
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine=window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  /* Apparition au défilement */
  var rev=d.querySelectorAll('[data-reveal]');
  if('IntersectionObserver' in window && !reduce){
    var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} }); },{threshold:.12,rootMargin:'0px 0px -6% 0px'});
    rev.forEach(function(el){ io.observe(el); });
  } else { rev.forEach(function(el){ el.classList.add('in'); }); }

  /* Barre de progression */
  var prog=d.getElementById('prog'), tick=false;
  function onScroll(){
    if(tick||!prog) return; tick=true;
    requestAnimationFrame(function(){
      var h=root.scrollHeight-window.innerHeight;
      prog.style.transform='scaleX('+(h>0?Math.min(1,window.scrollY/h):0)+')'; tick=false;
    });
  }
  window.addEventListener('scroll',onScroll,{passive:true}); onScroll();

  /* Parallaxe, bouton magnétique, inclinaison (souris seulement) */
  if(fine && !reduce){
    var hero=d.getElementById('hero');
    if(hero) hero.addEventListener('pointermove',function(e){
      var r=hero.getBoundingClientRect();
      hero.style.setProperty('--mx',((e.clientX-r.left)/r.width-.5)*2);
      hero.style.setProperty('--my',((e.clientY-r.top)/r.height-.5)*2);
    });
    if(hero) hero.addEventListener('pointerleave',function(){ hero.style.setProperty('--mx',0); hero.style.setProperty('--my',0); });
    d.querySelectorAll('.mag').forEach(function(el){
      el.addEventListener('pointermove',function(e){
        var r=el.getBoundingClientRect();
        el.style.translate=((e.clientX-r.left-r.width/2)*.12)+'px '+((e.clientY-r.top-r.height/2)*.25)+'px';
      });
      el.addEventListener('pointerleave',function(){ el.style.translate=''; });
    });
    d.querySelectorAll('.tilt').forEach(function(el){
      el.addEventListener('pointermove',function(e){
        var r=el.getBoundingClientRect();
        el.style.setProperty('--ry',(((e.clientX-r.left)/r.width-.5)*6)+'deg');
        el.style.setProperty('--rx',(-((e.clientY-r.top)/r.height-.5)*6)+'deg');
      });
      el.addEventListener('pointerleave',function(){ el.style.setProperty('--rx','0deg'); el.style.setProperty('--ry','0deg'); });
    });
  }

  /* Vidéos : lecture en boucle quand elles sont visibles, bouton pause, qualité adaptée à la connexion.
     - chaque vidéo existe en plusieurs tailles (data-sources : adresse, largeur, poids en octets)
     - la plus légère démarre tout de suite (et dès 1400 px avant l'écran, pour une lecture immédiate)
     - pendant ce premier téléchargement, la page mesure le débit réel du visiteur, puis récupère en arrière-plan
       la version la plus nette que l'écran justifie (largeur de la carte × densité de pixels, 2 au maximum)
       et qui se télécharge en moins de 6 s à ce débit
     - la version nette remplace la légère sans à-coup : au bouclage de la vidéo, ou aussitôt si elle est à l'arrêt
     - économie de données ou 2G : pas de lecture automatique, la photo reste et le bouton lance la vidéo ;
       en 3G : version légère seulement
     - si la version nette ne peut pas être lue, on revient à la légère ; si rien ne peut être lu, la photo reste */
  var vids=d.querySelectorAll('video[data-src]');
  var conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection||{};
  var lowData=!!(conn.saveData||/^(slow-2g|2g)$/.test(conn.effectiveType||''));
  var slowNet=lowData||(conn.effectiveType==='3g');
  var UPGRADE_MAX_S=6;
  function setBtn(v,playing){
    var btn=v.parentNode.querySelector('.vbtn'); if(!btn) return;
    btn.setAttribute('data-state',playing?'playing':'paused');
    btn.setAttribute('aria-label',playing?'Mettre la vidéo en pause':'Lire la vidéo');
  }
  function sourcesOf(v){
    var list=(v.getAttribute('data-sources')||'').split(',').map(function(s){
      var p=s.trim().split(/\s+/); return {url:p[0],w:parseInt(p[1],10)||0,bytes:parseInt(p[2],10)||0};
    }).filter(function(s){ return s.url; }).sort(function(a,b){ return a.w-b.w; });
    return list.length?list:[{url:v.getAttribute('data-src'),w:0,bytes:0}];
  }
  /* rang de la version la plus nette utile sur cet écran */
  function targetIndex(v,list){
    var need=(v.clientWidth||360)*Math.min(window.devicePixelRatio||1,2);
    for(var i=0;i<list.length;i++){ if(list[i].w>=need) return i; }
    return list.length-1;
  }
  /* rang de la meilleure version (jusqu'à target) qui se télécharge en moins de UPGRADE_MAX_S secondes au débit mesuré (Mb/s) */
  function bestIndex(list,target,mbps){
    if(!(mbps>0)) return 0;
    for(var i=target;i>0;i--){ if(list[i].bytes&&list[i].bytes*8/1e6/mbps<=UPGRADE_MAX_S) return i; }
    return 0;
  }
  vids.forEach(function(v){
    v.loop=true; v.muted=true; v.defaultMuted=true; v.setAttribute('playsinline',''); v.disablePictureInPicture=true;
    v._manual=false; v._vis=false;
    var btn=v.parentNode.querySelector('.vbtn');
    var list=sourcesOf(v), cur=-1, pending=null, blobUrl=null, decided=false, noUp=false, last=0, t0=0, tick=null;

    /* débit : part du fichier léger déjà reçue / temps écoulé ; décision une fois le fichier reçu (ou après 5 s) */
    function speedCheck(){
      if(decided) return;
      var b=v.buffered, dur=v.duration, s=(performance.now()-t0)/1000;
      var f=(b&&b.length&&dur>0&&isFinite(dur))?Math.min(1,b.end(b.length-1)/dur):0;
      if(f>=.97||(s>=5&&(f>0||v._vis))){
        decided=true; clearInterval(tick); v.removeEventListener('progress',speedCheck);
        upgrade(f*list[0].bytes*8/1e6/Math.max(s,.05));
      }
    }
    function watchSpeed(reset){
      if(decided||noUp||slowNet||list.length<2||!list[0].bytes) return;
      if(!t0||(reset&&!(v.buffered&&v.buffered.length))) t0=performance.now();
      if(!tick){ tick=setInterval(speedCheck,250); v.addEventListener('progress',speedCheck); }
    }
    /* télécharge la version nette en arrière-plan, puis la met en attente (remplacée au bon moment) */
    function upgrade(mbps){
      var bi=bestIndex(list,targetIndex(v,list),mbps);
      if(noUp||bi<=cur) return;
      var ctl=window.AbortController?new AbortController():null;
      var to=setTimeout(function(){ if(ctl) ctl.abort(); },(UPGRADE_MAX_S+3)*1000);
      fetch(list[bi].url,ctl?{signal:ctl.signal}:{})
        .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.blob(); })
        .then(function(b){
          clearTimeout(to); if(noUp) return;
          pending={url:URL.createObjectURL(b),idx:bi};
          if(v.paused&&!v._manual) applyPending();
        })
        .catch(function(){ clearTimeout(to); });
    }
    function applyPending(){
      if(!pending) return;
      var p=pending, was=!v.paused, old=blobUrl;
      pending=null; blobUrl=p.url; cur=p.idx;
      v.src=p.url; v.load();
      if(old) URL.revokeObjectURL(old);
      if(was){ var q=v.play(); if(q&&q.catch) q.catch(function(){ setBtn(v,false); }); }
      /* garde-fou : si la version nette ne démarre pas, retour à la légère */
      setTimeout(function(){ if(cur>0&&v._vis&&!v._manual&&v.readyState<2) revertLite(); },6000);
    }
    function revertLite(){
      if(cur<=0) return;
      noUp=true; pending=null; cur=0;
      var old=blobUrl; blobUrl=null; v.src=list[0].url; v.load();
      if(old) URL.revokeObjectURL(old);
      if(v._vis&&!v._manual) play();
    }
    function ensureSrc(){
      if(v.getAttribute('src')) return;
      cur=0; v.preload='auto'; v.src=list[0].url; v.load(); watchSpeed(false);
    }
    function play(){
      applyPending(); ensureSrc(); watchSpeed(true);
      var p=v.play(); if(p&&p.then){ p.then(function(){setBtn(v,true);},function(){setBtn(v,false);}); }
    }
    v.addEventListener('error',function(){ if(cur>0) revertLite(); else setBtn(v,false); });
    /* bouclage de la lecture : bon moment pour passer à la version nette */
    v.addEventListener('timeupdate',function(){
      if(pending&&!v.paused&&v.currentTime<last-.5) applyPending();
      last=v.currentTime;
    });
    if(btn){ btn.addEventListener('click',function(){ if(v.paused){ v._manual=false; play(); } else { v._manual=true; v.pause(); setBtn(v,false); } }); }
    if(reduce||lowData){ setBtn(v,false); return; }
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(es){
        es.forEach(function(e){
          v._vis=e.isIntersecting;
          if(e.isIntersecting){ if(!v._manual) play(); } else { if(!v.paused){ v.pause(); } }
        });
      },{threshold:.2,rootMargin:'300px 0px'}).observe(v);
      if(!slowNet){
        var pre=new IntersectionObserver(function(es){
          es.forEach(function(e){ if(e.isIntersecting){ ensureSrc(); pre.disconnect(); } });
        },{rootMargin:'1400px 0px'});
        pre.observe(v);
      }
    } else { v._vis=true; play(); }
  });

  /* Mes coachings : chaque carte ouvre son détail, un seul à la fois.
     #individuel, #team-building et #intervention-entreprise ouvrent l'offre ; l'adresse suit l'offre ouverte pour pouvoir la copier. */
  var OFFERS=['individuel','team-building','intervention-entreprise'];
  function offer(k){ var c=d.getElementById(k); return c&&{card:c,btn:c.querySelector('.ocard-btn'),panel:d.getElementById('detail-'+k)}; }
  function jump(el,block,instant){
    if(instant){ root.style.scrollBehavior='auto'; el.scrollIntoView({block:block}); root.style.scrollBehavior=''; }
    else el.scrollIntoView({behavior:reduce?'auto':'smooth',block:block});
  }
  function showOffer(key,o){
    o=o||{};
    OFFERS.forEach(function(k){
      var p=offer(k), on=k===key; if(!p) return;
      p.panel.hidden=!on;
      p.card.classList.toggle('is-open',on);
      /* carte posée à sa place finale (sans l'animation d'apparition) pour viser juste en défilant */
      if(on && !p.card.classList.contains('in')){ p.card.style.transition='none'; p.card.classList.add('in'); void p.card.offsetWidth; p.card.style.transition=''; }
      p.btn.setAttribute('aria-expanded',on?'true':'false');
      p.btn.querySelector('.ocard-lbl').textContent=on?'Masquer le détail':'Voir le détail';
    });
    if(o.url){ try{ history.replaceState(null,'','#'+(key||'accompagnements')); }catch(e){} }
    if(key&&o.scroll){ var p=offer(key); if(o.scroll==='card') jump(p.card,'start',o.instant); else jump(p.panel,'nearest'); }
  }
  OFFERS.forEach(function(k){
    var p=offer(k); if(!p) return;
    p.btn.addEventListener('click',function(){
      showOffer(p.btn.getAttribute('aria-expanded')==='true'?null:k,{url:true,scroll:'panel'});
    });
    /* toute la carte agit comme son bouton, sauf le bouton lecture/pause de la vidéo */
    p.card.addEventListener('click',function(e){ if(!e.target.closest('button,a')) p.btn.click(); });
  });
  function offerFromHash(instant){
    var k=location.hash.slice(1);
    if(OFFERS.indexOf(k)>-1) showOffer(k,{scroll:'card',instant:instant});
  }
  window.addEventListener('hashchange',function(){ offerFromHash(false); });
  if(OFFERS.indexOf(location.hash.slice(1))>-1){
    showOffer(location.hash.slice(1));
    /* on recale après chargement des images et polices, qui déplacent la page */
    if(d.readyState==='complete') offerFromHash(true); else window.addEventListener('load',function(){ offerFromHash(true); });
  }

  /* Copier */
  d.querySelectorAll('.copy').forEach(function(btn){
    btn.addEventListener('click',function(){
      var el=d.getElementById(btn.getAttribute('data-copy'));
      var txt=el.textContent.replace(/ /g,' ');
      var label=btn.querySelector('span');
      function ok(){ label.textContent='Copié'; setTimeout(function(){label.textContent='Copier';},1800); }
      function fallback(){
        var r=d.createRange(); r.selectNodeContents(el);
        var s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
        label.textContent='Sélectionné'; setTimeout(function(){label.textContent='Copier';},1800);
      }
      try{ navigator.clipboard.writeText(txt).then(ok,fallback); }catch(e){ fallback(); }
    });
  });

  /* Blocs dépliables ciblés : mentions légales, ou étude placée dans la liste des sources (#etude-2…) */
  function openFromHash(){
    var id=location.hash.slice(1); if(!id) return;
    var el=d.getElementById(id); if(!el) return;
    if(el.tagName==='DETAILS'){ el.open=true; return; }
    var box=el.parentNode.closest('details');
    if(box && !box.open){ box.open=true; setTimeout(function(){ el.scrollIntoView({block:'start'}); },20); }
  }
  window.addEventListener('hashchange',openFromHash);
  d.querySelectorAll('[data-open]').forEach(function(a){
    a.addEventListener('click',function(){
      var el=d.getElementById(a.getAttribute('href').slice(1));
      if(el){ el.open=true; setTimeout(function(){ el.scrollIntoView({block:'start'}); },20); }
    });
  });
  /* « Étude N » : on ouvre la liste avant que le navigateur ne défile jusqu'à l'étude */
  d.querySelectorAll('a.study').forEach(function(a){
    a.addEventListener('click',function(){ var src=d.getElementById('sources'); if(src) src.open=true; });
  });
  openFromHash();
  /* Arrivée depuis une autre page avec une ancre (#qui, #faq, #mentions, #etude-2…) :
     on recale le défilement une fois la page chargée (polices et images déplacent la mise en page) */
  (function(){
    var id=location.hash.slice(1); if(!id||id==='rdv'||OFFERS.indexOf(id)>-1) return;
    function go(){
      var el=d.getElementById(id); if(!el) return;
      root.style.scrollBehavior='auto'; el.scrollIntoView({block:'start'}); root.style.scrollBehavior='';
    }
    if(d.readyState==='complete') go(); else window.addEventListener('load',go);
  })();

  /* Chiffres qui montent */
  var cnt=d.querySelectorAll('.fx-n[data-count]');
  function countUp(el){
    var to=+el.getAttribute('data-count'), suf=el.getAttribute('data-suf')||'', t0=null;
    function f(t){ if(!t0) t0=t; var p=Math.min(1,(t-t0)/1300), e=1-Math.pow(1-p,3); el.textContent=Math.round(to*e)+suf; if(p<1) requestAnimationFrame(f); }
    requestAnimationFrame(f);
  }
  if(!reduce && 'IntersectionObserver' in window){
    var cio=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ countUp(e.target); cio.unobserve(e.target); } }); },{threshold:.6});
    cnt.forEach(function(el){ el.textContent='0'+(el.getAttribute('data-suf')||''); cio.observe(el); });
  }

  /* ================= Mini quiz d'une minute (questions adaptées à chaque frein) ================= */
  var QUIZ={need:null,text:null};
  (function(){
    var body=d.getElementById('qzBody'), bar=d.getElementById('qzBar'), stepEl=d.getElementById('qzStep');
    if(!body) return; /* pas de quiz sur cette page */
    var N=4;
    var ICON={
      pression:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17a8 8 0 1 1 16 0"/><path class="a-needle" d="M12 17V8.5"/><circle cx="12" cy="17" r="1.2"/></svg>',
      temps:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path class="a-hand" d="M12 12V6.5"/><path d="M12 12l3 2"/></svg>',
      fatigue:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="7.5" width="16" height="9" rx="2.5"/><path d="M21.5 10.5v3"/><rect class="a-drain" x="5" y="10" width="11" height="4" rx="1.2" fill="#0a3922" stroke="none"/></svg>',
      equipe:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="a-c1" cx="8" cy="12" r="4.2"/><circle class="a-c2" cx="16" cy="12" r="4.2"/></svg>'
    };
    function ic(n){ return ICON[n]||'<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-'+n+'"/></svg>'; }
    var FR=[['pression','Pression'],['temps','Manque de temps'],['fatigue','Fatigue mentale'],['equipe','Équipe tendue']];
    /* Dernière question des parcours 1 à 3 : les trois offres. Pour l'intervention en entreprise, « Mon aide » affiche
       ses propres étapes (steps) : séances et durée se décident avec l'entreprise, rien n'est fixé à l'avance. */
    var O4=[{i:'user',l:'Seul à la barre',rec:'Coaching individuel',need:'Individuel'},
      {i:'users',l:'Avec mon équipe, pour un temps fort',rec:'Team building',need:'Team building'},
      {i:'brief',l:'Avec mon équipe, dans la durée',rec:'Intervention en entreprise',need:'Intervention en entreprise',
       steps:['Du FitBoxing&nbsp;: un mélange de boxe et de fitness','Directement dans votre entreprise, de façon régulière','Nombre de séances et durée définis avec vous']}];
    var P=[
    /* ---------- 0 : pression ---------- */
    {name:'Sous <span class="serif">pression</span>',icon:'pression',
     q2:'Comment la pression <span class="serif">se manifeste</span>-t-elle&nbsp;?',
     o2:[
      {i:'moon',l:'Je rumine, même la nuit',sent:'Les décisions tournent en boucle, même la nuit',a:'On vide la tête avec des séries courtes et intenses',b:'On finit par un retour au calme guidé, respiration comprise',m:[['Décrochage',.9],['Calme',.85],['Focus',.75]],day:['Un soir qui se détend enfin','Une tête qui se vide'],pro:['Des décisions plus posées','Moins de rumination au bureau']},
      {i:'bolt',l:'Je m’irrite vite',sent:'La patience s’use plus vite que vous ne le voudriez',a:'On évacue la tension en frappant dans les pattes d’ours',b:'On travaille le rythme&nbsp;: frapper, respirer, reprendre',m:[['Patience',.9],['Calme',.85],['Énergie',.75]],day:['Plus de patience à la maison','Des réactions plus mesurées'],pro:['Des échanges plus sereins avec l’équipe','Du recul face aux imprévus']},
      {i:'shield',l:'Tout est crispé',sent:'Épaules, nuque, mâchoire&nbsp;: le corps garde la tension',a:'On mobilise les épaules et le haut du dos dès l’échauffement',b:'Des enchaînements fluides, qui relâchent au lieu de fatiguer',m:[['Détente',.9],['Énergie',.8],['Calme',.8]],day:['Un corps moins crispé','Une posture plus libre'],pro:['Moins de tension en fin de journée','Plus de présence en réunion']},
      {i:'phone',l:'Je n’arrive pas à décrocher',sent:'Le travail vous suit jusque dans la soirée',a:'On installe un rituel de fin de journée, court et net',b:'Une séance qui fait basculer du mode travail au mode repos',m:[['Décrochage',.9],['Calme',.85],['Énergie',.7]],day:['Une vraie coupure le soir','Du temps pleinement pour vos proches'],pro:['Un esprit plus frais le lendemain','Moins de dossiers ressassés']}
     ],
     q3:'Quelle situation vous <span class="serif">met</span> le plus sous tension&nbsp;?',
     o3:[
      {i:'target',l:'Les décisions à fort enjeu',c:'Des exercices de calme sous pression, pour garder la tête froide',pro:'Des décisions prises avec plus de recul'},
      {i:'speak',l:'Négociations, clients exigeants',c:'Des mises en situation pour rester posé face à la tension',pro:'Plus d’assurance en négociation'},
      {i:'users',l:'Management et conflits',c:'On travaille posture et voix, pour garder votre calme avec l’équipe',pro:'Un management plus apaisé'},
      {i:'trend',l:'Une charge qui ne s’arrête jamais',c:'Des séances courtes et régulières, calées sur vos pics de charge',pro:'Une charge mieux encaissée dans la durée'}
     ],
     q4:'Vous avancez <span class="serif">comment</span>&nbsp;?',
     o4:O4},
    /* ---------- 1 : temps ---------- */
    {name:'Agenda <span class="serif">saturé</span>',icon:'temps',
     q2:'Qu’est-ce qui <span class="serif">dévore</span> votre temps&nbsp;?',
     o2:[
      {i:'speak',l:'Des réunions enchaînées',sent:'Les réunions s’enchaînent, sans une minute pour vous',a:'Une séance de 30 minutes, pensée pour tenir entre deux rendez-vous',b:'Zéro temps mort&nbsp;: chaque minute compte',m:[['Rythme',.85],['Focus',.8],['Énergie',.8]],day:['Une vraie pause dans la journée','Un créneau qui devient intouchable'],pro:['Plus d’énergie entre deux réunions','Des réunions mieux suivies']},
      {i:'brief',l:'Des déplacements',sent:'Les déplacements mangent vos semaines',a:'Des séances calées sur votre ville du jour, sans matériel lourd',b:'Un format court à refaire seul, pour garder le rythme en voyage',m:[['Régularité',.85],['Énergie',.8],['Focus',.75]],day:['Une routine qui vous suit partout','Moins de fatigue de voyage'],pro:['De l’énergie en fin de déplacement','Une forme stable malgré l’agenda']},
      {i:'bolt',l:'Des urgences de dernière minute',sent:'Les urgences bousculent tout, y compris vos créneaux',a:'Des créneaux souples, ajustés selon votre semaine',b:'Une séance «&nbsp;de secours&nbsp;» express pour les jours tendus',m:[['Souplesse',.85],['Calme',.8],['Énergie',.8]],day:['Moins de stress pour tenir votre planning','Une routine qui résiste aux imprévus'],pro:['Plus de sang-froid face à l’urgence','Des priorités mieux tenues']},
      {i:'moon',l:'Des journées qui finissent à 21&nbsp;h',sent:'Les journées débordent et il ne reste rien pour vous',a:'On vise un créneau tôt ou sur le déjeuner, avant que la journée n’avale tout',b:'Une séance qui redonne de l’énergie au lieu d’en prendre',m:[['Énergie',.9],['Rythme',.85],['Focus',.75]],day:['Du temps à vous, sans culpabilité','Des soirées moins écrasées'],pro:['Des journées mieux bornées','Plus d’efficacité dans le temps imparti']}
     ],
     q3:'Quel créneau <span class="serif">tiendrait</span> vraiment&nbsp;?',
     o3:[
      {i:'sun',l:'Avant 8&nbsp;h',c:'Séance avant le premier rendez-vous, pour démarrer avec de l’élan',pro:'Une journée lancée avec de l’élan',slot:'Avant 8 h'},
      {i:'star',l:'Sur le déjeuner',c:'Séance express sur la pause déjeuner',pro:'Un après-midi sans coup de barre',slot:'Pause déjeuner'},
      {i:'moon',l:'En fin de journée',c:'Séance qui ferme la journée et libère la soirée',pro:'Un passage net du travail au repos',slot:'Fin de journée'},
      {i:'shield',l:'Sur site, dans mes locaux',c:'Je viens à vous&nbsp;: aucun trajet, aucun temps perdu',pro:'Zéro temps de trajet perdu',slot:'Sur site'}
     ],
     q4:'Vous avancez <span class="serif">comment</span>&nbsp;?',
     o4:O4},
    /* ---------- 2 : fatigue ---------- */
    {name:'Batterie <span class="serif">faible</span>',icon:'fatigue',
     q2:'Comment la fatigue <span class="serif">se voit</span>-elle&nbsp;?',
     o2:[
      {i:'sun',l:'Le brouillard de l’après-midi',sent:'Après le déjeuner, la concentration s’effondre',a:'Une séance placée avant ou pendant ce creux pour le réveiller',b:'Des efforts courts et vifs qui relancent la machine',m:[['Vivacité',.9],['Focus',.85],['Énergie',.8]],day:['Un après-midi sans coup de barre','Moins de café pour tenir'],pro:['Une concentration plus stable','Des dossiers complexes mieux traités l’après-midi']},
      {i:'target',l:'Mal à me concentrer longtemps',sent:'Rester concentré longtemps devient un effort',a:'On entraîne la concentration avec des enchaînements qui demandent toute votre attention',b:'Une heure, un seul geste&nbsp;: l’esprit apprend à se fixer',m:[['Focus',.9],['Énergie',.8],['Humeur',.75]],day:['Un esprit plus clair','Moins de dispersion'],pro:['Des tâches longues menées à bout','Moins d’erreurs d’inattention']},
      {i:'bolt',l:'Je tiens au café',sent:'Le café remplace l’énergie qui manque',a:'On remet du mouvement au cœur de la journée',b:'Un effort progressif qui recharge au lieu de vider',m:[['Énergie',.9],['Humeur',.8],['Focus',.75]],day:['Une énergie plus naturelle','Moins besoin du coup de fouet'],pro:['Une énergie plus régulière','Une présence plus affirmée']},
      {i:'moon',l:'Je me réveille déjà fatigué',sent:'Le matin, vous démarrez déjà à plat',a:'On construit une routine d’activité douce et régulière',b:'Des séances qui laissent de l’énergie, jamais épuisé',m:[['Élan',.9],['Humeur',.8],['Énergie',.8]],day:['Un matin plus vif','Un corps qui se sent bien'],pro:['Un démarrage de journée plus net','Une meilleure forme dans la durée']}
     ],
     q3:'Où en êtes-vous <span class="serif">côté sport</span>&nbsp;?',
     o3:[
      {i:'user',l:'Je n’en fais plus depuis longtemps',c:'On repart de zéro, doucement, avec des gestes simples',pro:'Une reprise sans pression'},
      {i:'trend',l:'Un peu, quand je peux',c:'On donne un cadre à ce que vous faites déjà',pro:'Une régularité qui s’installe'},
      {i:'smile',l:'Je m’entraîne, sans plaisir',c:'On remet de l’envie&nbsp;: variété, jeu, frappe',pro:'Le plaisir de bouger retrouvé'},
      {i:'cross',l:'Une gêne me freine',c:'On adapte les gestes, avec l’avis de votre médecin si besoin',pro:'Une activité adaptée à votre corps'}
     ],
     q4:'Vous avancez <span class="serif">comment</span>&nbsp;?',
     o4:O4},
    /* ---------- 3 : équipe ---------- */
    {name:'Équipe sous <span class="serif">tension</span>',icon:'equipe',
     q2:'Qu’<span class="serif">observez</span>-vous dans l’équipe&nbsp;?',
     o2:[
      {i:'speak',l:'Peu de communication entre services',sent:'Chaque service travaille dans son coin',a:'Des exercices à deux qui obligent à s’écouter et se coordonner',b:'On mélange les services pour casser les silos',m:[['Communication',.9],['Cohésion',.85],['Ambiance',.8]],day:['Des rencontres inattendues entre collègues','Des visages qui se connaissent enfin'],pro:['Une communication plus fluide','Des projets transverses facilités']},
      {i:'shield',l:'Des tensions, des non-dits',sent:'Des tensions couvent et personne n’en parle',a:'On libère la pression collective en frappant ensemble',b:'Des défis à plusieurs qui remettent du rire et du lien',m:[['Ambiance',.9],['Confiance',.85],['Énergie',.8]],day:['Une atmosphère plus légère','Des rires partagés'],pro:['Des tensions qui retombent','Plus de confiance entre collègues']},
      {i:'trend',l:'Une motivation en baisse',sent:'L’élan collectif s’essouffle',a:'On remet du rythme et de l’énergie dans le groupe',b:'Des défis par petites équipes pour retrouver l’envie',m:[['Motivation',.9],['Énergie',.85],['Cohésion',.8]],day:['Une équipe qui a envie de se retrouver','Des sourires au bureau'],pro:['Une équipe plus mobilisée','Plus d’élan sur les objectifs']},
      {i:'star',l:'Une équipe toute nouvelle',sent:'Les nouveaux ne se connaissent pas encore',a:'Un format d’accueil&nbsp;: on bouge, on rit, on se découvre',b:'Des exercices à deux qui créent du lien dès la première séance',m:[['Cohésion',.9],['Confiance',.85],['Ambiance',.85]],day:['Un groupe qui se rapproche vite','Une intégration plus chaleureuse'],pro:['Une équipe soudée plus tôt','Des nouveaux plus à l’aise']}
     ],
     q3:'Quel est votre <span class="serif">objectif</span> principal&nbsp;?',
     o3:[
      {i:'users',l:'Renforcer la cohésion',c:'Un programme sur plusieurs séances pour ancrer le lien',pro:'Un esprit d’équipe durable'},
      {i:'smile',l:'Apaiser les tensions',c:'Une séance d’abord détente, sans compétition',pro:'Un climat de travail plus serein'},
      {i:'bolt',l:'Redonner de l’énergie',c:'Une séance dynamique, en début ou en fin de semaine',pro:'Une équipe qui repart avec de l’énergie'},
      {i:'trophy',l:'Marquer un événement',c:'Un team building sur mesure pour fêter un cap ou un lancement',pro:'Un souvenir commun fort'}
     ],
     q4:'Combien de <span class="serif">personnes</span>&nbsp;?',
     o4:[{i:'users',l:'Moins de 10',rec:'Team building, en petit groupe',need:'Team building'},{i:'users',l:'De 10 à 30',rec:'Team building',need:'Team building'},{i:'users',l:'Plus de 30',rec:'Team building, en sous-groupes',need:'Team building'}]}
    ];
    var step=0, ans=[];
    function setProg(n,txt){ bar.style.width=(n/N*100)+'%'; stepEl.textContent=txt; }
    function view(html){ body.style.animation='none'; void body.offsetWidth; body.style.animation=''; body.innerHTML=html; }
    function spec(i){
      var p=P[ans[0]];
      if(i===0) return {q:'Qu’est-ce qui vous <span class="serif">pèse</span> le plus&nbsp;?',opts:FR.map(function(f){return {i:f[0],l:f[1]};})};
      if(i===1) return {q:p.q2,opts:p.o2};
      if(i===2) return {q:p.q3,opts:p.o3};
      return {q:p.q4,opts:p.o4};
    }
    function ask(i){
      step=i; var s=spec(i);
      setProg(i,(i+1)+'/'+N);
      var cls=s.opts.length===2?' two':(s.opts.length===3?' three':'');
      var h='<h2 class="qz-q" id="qzQ" tabindex="-1">'+s.q+'</h2><div class="qz-opts'+cls+'" role="group" aria-labelledby="qzQ">';
      s.opts.forEach(function(o,k){
        h+='<button type="button" class="qz-opt" data-k="'+k+'" aria-pressed="'+(ans[i]===k?'true':'false')+'"><span class="bub">'+ic(o.i)+'</span><span>'+o.l+'</span></button>';
      });
      h+='</div>'+(i>0?'<button type="button" class="qz-back" id="qzBack"><svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg>Retour</button>':'');
      view(h);
      Array.prototype.forEach.call(body.querySelectorAll('.qz-opt'),function(b){
        b.addEventListener('click',function(){
          var k=+b.getAttribute('data-k');
          if(i===0&&ans[0]!==k){ ans=[k]; } else { ans[i]=k; }
          Array.prototype.forEach.call(body.querySelectorAll('.qz-opt'),function(x){ x.setAttribute('aria-pressed',x===b?'true':'false'); });
          setTimeout(function(){ if(i<N-1) ask(i+1); else compute(); },reduce?0:380);
        });
      });
      var bk=d.getElementById('qzBack'); if(bk) bk.addEventListener('click',function(){ ask(i-1); });
    }
    function plain(t){ return t.replace(/&nbsp;/g,' ').replace(/<[^>]+>/g,''); }
    function compute(){
      setProg(N,N+'/'+N);
      var p=P[ans[0]], o2=p.o2[ans[1]], o3=p.o3[ans[2]], o4=p.o4[ans[3]];
      QUIZ.need=o4.need;
      QUIZ.text={frein:FR[ans[0]][1],symptome:plain(o2.l),contexte:plain(o3.l),format:plain(o4.l)};
      if(reduce){ result(); return; }
      view('<div class="qz-load" role="status"><div class="gl"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#d-glove"/></svg></div><b>Je compose votre programme…</b><div class="qz-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>');
      setTimeout(result,1500);
    }
    function li(t){ return '<li><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>'+t+'</li>'; }
    function result(){
      var p=P[ans[0]], o2=p.o2[ans[1]], o3=p.o3[ans[2]], o4=p.o4[ans[3]];
      var team=o4.need!=='Individuel', steps=o4.steps||[o2.a,o2.b,o3.c];
      var h='<h2 class="qz-q" id="qzQ" tabindex="-1">Votre programme <span class="serif">sur mesure</span></h2><div class="qz-grid">'
      +'<article class="qc" style="--d:.05s"><p class="qh"><span class="fnum">1</span>Votre frein</p><div class="qic">'+ic(p.icon)+'</div><h3 class="qname">'+p.name+'</h3><p class="sent">'+o2.sent+'.</p><div class="qtags"><span class="tag">'+o2.l+'</span><span class="tag">'+o3.l+'</span></div></article>'
      +'<article class="qc" style="--d:.25s"><p class="qh"><span class="fnum">2</span>Mon aide</p><ol class="qsteps"><li>'+steps.join('</li><li>')+'</li></ol><span class="tag qrec"><svg class="ic" aria-hidden="true"><use href="#'+(team?'i-users':'i-user')+'"/></svg>'+o4.rec+'</span>'+(o3.slot?'<span class="tag qrec alt"><svg class="ic" aria-hidden="true"><use href="#i-cal"/></svg>Créneau&nbsp;: '+o3.slot+'</span>':'')+'</article>'
      +'<article class="qc" id="qzGain" style="--d:.45s"><p class="qh"><span class="fnum">3</span>Vos gains</p><div class="meters">'
      +o2.m.map(function(m,k){ return '<div class="mt"><span>'+m[0]+'</span><span class="bar"><i style="--from:18%;--to:'+Math.round(m[1]*100)+'%;--dl:'+(.9+k*.25)+'s"></i></span></div>'; }).join('')
      +'</div><div class="gl2"><div><b>Au quotidien</b><ul>'+o2.day.map(li).join('')+'</ul></div><div><b>Dans votre vie pro</b><ul>'+o2.pro.concat([o3.pro]).map(li).join('')+'</ul></div></div></article></div>'
      +'<div class="qz-cta"><span class="halo"><a class="btn btn-primary btn-big" href="#rdv">Je veux ce programme <svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></a></span><button type="button" class="qz-redo" id="qzRedo">Refaire le quiz</button><p class="qz-note">Illustration de ce que vous pouvez viser, selon votre régularité. Le coaching n’est pas un acte médical.</p></div>';
      view(h);
      var g=d.getElementById('qzGain');
      setTimeout(function(){ if(g) g.classList.add('go'); },reduce?0:900);
      var rd=d.getElementById('qzRedo'); if(rd) rd.addEventListener('click',function(){ ans=[]; QUIZ.need=null; QUIZ.text=null; ask(0); });
      confetti();
    }
    function confetti(){
      if(reduce) return;
      var c=d.createElement('div'); c.className='qz-conf'; c.setAttribute('aria-hidden','true');
      for(var k=0;k<22;k++){
        var i=d.createElement('i'), a=Math.random()*Math.PI*2, r=120+Math.random()*260;
        i.style.setProperty('--x',Math.round(Math.cos(a)*r)+'px'); i.style.setProperty('--y',Math.round(Math.sin(a)*r*.7)+'px');
        i.style.background=['#e6c887','#1dbf73','#ff643b','#5fd4ef','#fff'][k%5]; i.style.animationDelay=(Math.random()*.15)+'s';
        c.appendChild(i);
      }
      d.getElementById('quiz').appendChild(c);
      setTimeout(function(){ if(c.parentNode) c.parentNode.removeChild(c); },1600);
    }
    ask(0);
  })();

  /* ================= Réservation : calendrier Calendly intégré dans la page ================= */
  var CAL_URL='https://calendly.com/mercier-naruto/5min';
  var CAL_ORIGIN='https://calendly.com';
  var $=function(id){ return d.getElementById(id); };
  var calFrame=null, calSeen=false, calTimer=null;
  function buildCal(){
    if(calFrame) return;
    var q=['embed_domain='+encodeURIComponent(location.hostname||'localhost'),'embed_type=Inline',
      'background_color=ffffff','text_color=0a3922','primary_color=0e8a50'].join('&');
    calFrame=d.createElement('iframe');
    /* l'iframe garde sa vraie taille (invisible, hors flux) pendant le chargement : cachée avec « hidden »,
       Calendly ne démarre pas et n'envoie jamais son signal, donc elle ne s'afficherait jamais */
    calFrame.className='bk-frame bk-wait'; calFrame.title='Calendrier de réservation de l’appel de 5 minutes';
    calFrame.src=CAL_URL+'?'+q;
    $('bkCard').appendChild(calFrame);
    /* si le calendrier ne répond pas (bloqueur, réseau, hébergement restreint), on propose le lien direct ;
       s'il répond finalement plus tard, il remplace ce lien (voir l'écouteur « message » ci-dessous) */
    calTimer=setTimeout(function(){
      if(calSeen) return;
      $('bkLoad').hidden=true; $('bkFb').hidden=false;
    },12000);
  }
  window.addEventListener('message',function(e){
    if(e.origin!==CAL_ORIGIN) return;
    var ev=e.data&&e.data.event; if(typeof ev!=='string'||ev.indexOf('calendly.')!==0) return;
    calSeen=true; clearTimeout(calTimer);
    $('bkLoad').hidden=true; $('bkFb').hidden=true; if(calFrame) calFrame.classList.remove('bk-wait');
    if(ev==='calendly.event_scheduled'){
      var ok=$('bkOk'); ok.hidden=false;
      try{ ok.scrollIntoView({block:'center',behavior:reduce?'auto':'smooth'}); }catch(x){}
    }
  });
  var wasRdv=false;
  function route(){
    var on=location.hash==='#rdv';
    /* la réservation vit sur l'accueil : depuis une autre page, #rdv y renvoie */
    if(!$('rdvPage')){ if(on) location.href='/#rdv'; return; }
    d.body.classList.toggle('in-rdv',on);
    if(on){ window.scrollTo(0,0); buildCal(); }
    else if(wasRdv){
      var id=location.hash.slice(1), t=id&&d.getElementById(id);
      setTimeout(function(){ if(t&&t.scrollIntoView) t.scrollIntoView(); else window.scrollTo(0,0); },0);
    }
    wasRdv=on;
  }
  window.addEventListener('hashchange',route);

  route();
})();
