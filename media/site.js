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

  /* Fonds légèrement animés : un calque .bgfx dans chaque bande et le pied de page (sauf les bandes qui ont déjà
     leur propre fond animé, .pg-bg) ; il ne bouge que lorsqu'il est à l'écran, et jamais si les animations sont réduites */
  var fxs=[];
  d.querySelectorAll('.band, footer').forEach(function(b){
    if(b.querySelector(':scope > .pg-bg')) return;
    var f=d.createElement('div'); f.className='bgfx'; f.setAttribute('aria-hidden','true');
    f.appendChild(d.createElement('i')); b.insertBefore(f,b.firstChild); fxs.push(f);
  });
  if(!reduce && 'IntersectionObserver' in window){
    var fio=new IntersectionObserver(function(es){ es.forEach(function(e){ e.target.classList.toggle('on',e.isIntersecting); }); },{rootMargin:'100px 0px'});
    fxs.forEach(function(f){ fio.observe(f); });
  }

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
     - si la version nette ne peut pas être lue, on revient à la légère ; si rien ne peut être lu, la photo reste
     - ordinateur (souris et écran de 1024 px ou plus) : on démarre directement sur la version moyenne (720),
       puis on vise la version HD (1080) quel que soit l'écran, avec un délai de téléchargement plus généreux */
  var vids=d.querySelectorAll('video[data-src]');
  var conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection||{};
  var lowData=!!(conn.saveData||/^(slow-2g|2g)$/.test(conn.effectiveType||''));
  var slowNet=lowData||(conn.effectiveType==='3g');
  var desk=fine&&window.matchMedia&&window.matchMedia('(min-width:1024px)').matches;
  var UPGRADE_MAX_S=desk?12:6;
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
    if(desk) return list.length-1;
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
    /* version de départ : la légère, ou la moyenne sur ordinateur */
    var first=(desk&&!slowNet&&list.length>2)?1:0;

    /* débit : part du fichier léger déjà reçue / temps écoulé ; décision une fois le fichier reçu (ou après 5 s) */
    function speedCheck(){
      if(decided) return;
      var b=v.buffered, dur=v.duration, s=(performance.now()-t0)/1000;
      var f=(b&&b.length&&dur>0&&isFinite(dur))?Math.min(1,b.end(b.length-1)/dur):0;
      if(f>=.97||(s>=5&&(f>0||v._vis))){
        decided=true; clearInterval(tick); v.removeEventListener('progress',speedCheck);
        upgrade(f*list[first].bytes*8/1e6/Math.max(s,.05));
      }
    }
    function watchSpeed(reset){
      if(decided||noUp||slowNet||list.length<2||!list[first].bytes||first>=list.length-1) return;
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
      setTimeout(function(){ if(cur>first&&v._vis&&!v._manual&&v.readyState<2) revertLite(); },6000);
    }
    function revertLite(){
      if(cur<=first) return;
      noUp=true; pending=null; cur=first;
      var old=blobUrl; blobUrl=null; v.src=list[first].url; v.load();
      if(old) URL.revokeObjectURL(old);
      if(v._vis&&!v._manual) play();
    }
    function ensureSrc(){
      if(v.getAttribute('src')) return;
      cur=first; v.preload='auto'; v.src=list[first].url; v.load(); watchSpeed(false);
    }
    function play(){
      applyPending(); ensureSrc(); watchSpeed(true);
      var p=v.play(); if(p&&p.then){ p.then(function(){setBtn(v,true);},function(){setBtn(v,false);}); }
    }
    v.addEventListener('error',function(){
      if(cur>first) revertLite();
      /* la version moyenne ne se lit pas : on retente avec la légère */
      else if(cur>0){ first=0; noUp=true; cur=0; v.src=list[0].url; v.load(); if(v._vis&&!v._manual) play(); }
      else setBtn(v,false);
    });
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

  /* Votre coach : médaillon qui fait défiler une photo, une vidéo, une photo, une vidéo…
     - une photo reste 5 s avec un léger zoom lent ; une vidéo est lue une fois en entier, puis on passe à la suite
     - fondu enchaîné entre deux éléments ; la vidéo suivante se télécharge pendant que la photo est affichée
     - le défilement ne tourne que lorsque le médaillon est à l'écran ; bouton pause / lecture
     - animations réduites : le médaillon reste sur la première photo, le bouton lance le défilement
     - économie de données ou 2G : photos seulement
     Ces vidéos utilisent data-reel (et non data-src) pour rester hors de la lecture en boucle des vidéos d'offres. */
  (function(){
    var reel=d.getElementById('csReel'); if(!reel) return;
    var btn=reel.querySelector('.rl-btn');
    var items=[].slice.call(reel.querySelectorAll('.rl-it'));
    if(lowData){ items=items.filter(function(it){ if(it.querySelector('video')){ it.parentNode.removeChild(it); return false; } return true; }); }
    if(items.length<2){ if(btn) btn.hidden=true; return; }
    var cur=0, timer=null, vis=false, paused=!!reduce, PHOTO_MS=5000, FADE_MS=900;
    function vidOf(it){ return it.querySelector('video'); }
    function load(v){ if(v&&!v.getAttribute('src')){ v.preload='auto'; v.src=v.getAttribute('data-reel'); v.load(); } }
    function setBtn(){
      btn.setAttribute('data-state',paused?'paused':'playing');
      btn.setAttribute('aria-label',paused?'Lire le diaporama':'Mettre le diaporama en pause');
    }
    function stop(){ clearTimeout(timer); timer=null; var v=vidOf(items[cur]); if(v&&!v.paused) v.pause(); }
    function next(){ show((cur+1)%items.length); }
    function run(){
      stop(); if(paused||!vis) return;
      var v=vidOf(items[cur]);
      load(vidOf(items[(cur+1)%items.length]));
      if(!v){ timer=setTimeout(next,PHOTO_MS); return; }
      load(v);
      /* garde-fou : si la fin de la vidéo n'est jamais signalée, on passe quand même à la suite */
      function guard(){
        var left=(isFinite(v.duration)&&v.duration>0)?(v.duration-v.currentTime)*1000:12000;
        clearTimeout(timer); timer=setTimeout(next,left+1500);
      }
      var p=v.play();
      if(p&&p.then){ p.then(guard,function(){ clearTimeout(timer); timer=setTimeout(next,3500); }); } else guard();
    }
    function show(n){
      if(n===cur) return;
      var old=items[cur], ov=vidOf(old);
      old.classList.remove('is-on'); old.setAttribute('aria-hidden','true');
      cur=n; var it=items[cur], v=vidOf(it);
      if(v){ try{ v.currentTime=0; }catch(x){} }
      it.classList.add('is-on'); it.removeAttribute('aria-hidden');
      if(ov){ setTimeout(function(){ if(items[cur]!==old){ ov.pause(); try{ ov.currentTime=0; }catch(x){} } },FADE_MS); }
      run();
    }
    items.forEach(function(it){
      var v=vidOf(it); if(!v) return;
      v.muted=true; v.defaultMuted=true; v.loop=false; v.disablePictureInPicture=true;
      v.addEventListener('ended',function(){ if(items[cur]===it&&!paused) next(); });
      v.addEventListener('error',function(){ if(items[cur]===it&&!paused){ clearTimeout(timer); timer=setTimeout(next,800); } });
    });
    btn.addEventListener('click',function(){ paused=!paused; setBtn(); if(paused) stop(); else run(); });
    setBtn();
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(es){ es.forEach(function(e){ vis=e.isIntersecting; if(vis) run(); else stop(); }); },{threshold:.25}).observe(reel);
    } else { vis=true; run(); }
  })();

  /* Mes coachings : une rangée par offre (#individuel, #intervention-entreprise, #team-building).
     Les liens vers ces ancres font défiler jusqu'à la rangée, déjà affichée (sans attendre l'animation d'apparition). */
  var OFFERS=['individuel','team-building','intervention-entreprise'];
  function showRow(k,instant){
    var row=d.getElementById(k); if(!row) return;
    row.querySelectorAll('[data-reveal]').forEach(function(el){
      if(!el.classList.contains('in')){ el.style.transition='none'; el.classList.add('in'); void el.offsetWidth; el.style.transition=''; }
    });
    if(instant){ root.style.scrollBehavior='auto'; row.scrollIntoView({block:'start'}); root.style.scrollBehavior=''; }
    else row.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
  }
  window.addEventListener('hashchange',function(){ var k=location.hash.slice(1); if(OFFERS.indexOf(k)>-1) showRow(k,false); });
  if(OFFERS.indexOf(location.hash.slice(1))>-1){
    /* on recale après chargement des images et polices, qui déplacent la page */
    var hk=location.hash.slice(1);
    if(d.readyState==='complete') showRow(hk,true); else window.addEventListener('load',function(){ showRow(hk,true); });
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

  /* ================= Quiz « Quel coaching pour vous ? » : orienter et expliquer, en 4 questions =================
     - Question 1 : pour qui ? -> un particulier (coaching individuel) ou une entreprise (intervention / team building)
     - Particulier : ce qui pèse (-> programme : Décompression, Recharge, Express, Reprise), niveau de sport
       (-> échauffement, durée, rythme), moment préféré (-> créneau et son intérêt)
     - Entreprise : format (régulier / ponctuel / je ne sais pas), objectif, taille du groupe
       -> régulier = intervention en entreprise ; ponctuel = team building ; « je ne sais pas » = selon l'objectif
     - Résultat construit à partir des réponses : « Vous m'avez dit », pourquoi cette offre répond au problème,
       la séance type ou le déroulé, ce qu'on peut en attendre, et une note si format et objectif tirent dans
       deux sens. Aucun chiffre inventé : c'est un premier repère, affiné pendant l'appel. */
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
    var OFFRES={
      ind:{rec:'Coaching <span class="serif">individuel</span>',plain:'Coaching individuel',cls:'r1',href:'/coaching-individuel-boxe-lyon/'},
      int:{rec:'Intervention <span class="serif">en entreprise</span>',plain:'Intervention en entreprise',cls:'r3',href:'/intervention-entreprise-boxe-lyon/',fmt:'Séances régulières'},
      team:{rec:'<span class="serif">Team</span> building',plain:'Team building',cls:'r2',href:'/team-building-boxe-lyon/',fmt:'Temps fort ponctuel'}
    };
    var Q1={q:'Le coaching, c’est <span class="serif">pour qui</span>&nbsp;?',opts:[
      {i:'user',l:'Pour moi',s:'Particulier'},
      {i:'brief',l:'Pour mon entreprise',s:'Entreprise'}]};

    /* ---------- Particulier ---------- */
    var PART=[
      {q:'Qu’est-ce qui vous <span class="serif">pèse</span> le plus en ce moment&nbsp;?',opts:[
        {i:'pression',l:'Le stress, la pression',name:'Décompression',goal:'relâcher la pression',
         why:'Le stress, c’est de la tension qui s’accumule sans trouver de sortie. En boxe, vous la déchargez physiquement&nbsp;: on frappe, on bouge, on souffle. Et chaque séance se termine par un retour au calme guidé, pour repartir apaisé, pas vidé.',
         core:'Des enchaînements intenses aux pattes d’ours, pour évacuer la tension accumulée',
         coreStart:'Des enchaînements aux pattes d’ours, de plus en plus soutenus au fil des semaines, pour évacuer la tension',
         coreSoft:'Des enchaînements aux pattes d’ours, à une intensité adaptée à votre corps, pour évacuer la tension',
         end:'Retour au calme et respiration guidée, pour faire redescendre la pression',
         gains:['Une vraie soupape, chaque semaine','Plus de recul face aux situations tendues','Des soirées plus apaisées']},
        {i:'fatigue',l:'La fatigue, le manque d’énergie',name:'Recharge',goal:'retrouver de l’énergie',
         why:'Quand on est fatigué, on bouge moins… et on se sent encore plus à plat. Des efforts courts et bien dosés relancent la machine&nbsp;: le corps s’active, la tête se réveille, et vous repartez avec plus d’énergie qu’en arrivant.',
         core:'Des séries courtes et vives, avec des pauses actives, pour relancer l’énergie sans vous épuiser',
         coreSoft:'Des séries courtes à intensité modérée, pour relancer l’énergie en douceur',
         end:'Étirements légers, pour repartir frais et non fatigué',
         gains:['Plus d’énergie au fil des semaines','Une tête plus claire','Moins de coups de barre dans la journée']},
        {i:'temps',l:'Pas le temps de bouger',name:'Express',goal:'bouger malgré un agenda chargé',short:true,
         why:'Quand l’agenda déborde, le sport passe toujours en dernier. La solution&nbsp;: une séance courte et dense, que vous n’avez pas à organiser. Je prépare tout, vous n’avez qu’à venir et frapper.',
         core:'Un circuit boxe dense, sans temps mort, pour tout faire en peu de temps',
         coreStart:'Un circuit boxe court et progressif, sans temps mort, pour tout faire en peu de temps',
         coreSoft:'Un circuit court et efficace, à intensité adaptée à votre corps, pour tout faire en peu de temps',
         end:'Quelques minutes de récupération, pour enchaîner directement sur la suite de votre journée',
         gains:['Une activité qui tient enfin dans votre agenda','Un rendez-vous fixe, rien que pour vous','De l’énergie pour le reste de la journée']},
        {i:'target',l:'L’envie de me remettre au sport',name:'Reprise',goal:'reprendre le sport avec plaisir',
         why:'Reprendre seul, c’est souvent s’arrêter au bout de deux semaines. Avec un coach, vous avez un rendez-vous, un plan et quelqu’un qui ajuste à chaque séance. Et la boxe a un vrai atout&nbsp;: on apprend en s’amusant, donc on a envie de revenir.',
         core:'L’apprentissage des coups et des enchaînements, avec des progrès visibles d’une séance à l’autre',
         coreSoft:'L’apprentissage des coups à votre rythme, avec des gestes adaptés à votre corps',
         end:'Renforcement et étirements, pour progresser sans se blesser',
         gains:['Une habitude sportive qui s’installe','Le plaisir de progresser','Une condition physique qui revient']}]},
      {q:'Où en êtes-vous <span class="serif">côté sport</span>&nbsp;?',opts:[
        {i:'user',l:'Rien depuis longtemps',dur:'45 min',rhythm:'1 séance par semaine pour démarrer',
         why:'Comme vous reprenez après une longue pause, le tête-à-tête est idéal&nbsp;: j’ajuste l’intensité en direct, geste par geste, sans jamais vous mettre en difficulté.',
         warm:'Mise en route douce&nbsp;: articulations, puis cardio progressif'},
        {i:'trend',l:'Un peu, de temps en temps',dur:'1 h',rhythm:'1 à 2 séances par semaine',
         why:'Vous bougez déjà un peu&nbsp;: on s’appuie là-dessus pour installer de la régularité, avec un cadre qui vous fait avancer semaine après semaine.',
         warm:'Corde à sauter et déplacements, pour monter en rythme'},
        {i:'bolt',l:'Je m’entraîne régulièrement',dur:'1 h',rhythm:'1 séance par semaine, en complément de votre entraînement',
         why:'Vous êtes déjà sportif&nbsp;: on peut aller plus loin en intensité et en technique, avec de vrais enchaînements de boxe qui changent de vos habitudes.',
         warm:'Shadow boxing et gammes techniques'},
        {i:'cross',l:'Une gêne me freine',dur:'45 min',rhythm:'1 séance par semaine, à intensité modérée',
         why:'Avec une gêne physique, le suivi individuel fait toute la différence&nbsp;: chaque geste est adapté à votre corps et on avance à votre rythme (avec l’avis de votre médecin en cas de doute).',
         warm:'Mobilité ciblée, en douceur, en ménageant la zone sensible'}]},
      {q:'Quel moment vous <span class="serif">arrange</span>&nbsp;?',opts:[
        {i:'sun',l:'Le matin',slot:'Le matin',why:'Placée le matin, la séance vous lance avec de l’élan pour toute la journée.'},
        {i:'star',l:'Sur le temps du midi',slot:'Le midi',why:'Sur le temps du midi, elle coupe la journée en deux et évite le coup de barre de l’après-midi.'},
        {i:'moon',l:'En fin de journée',slot:'En fin de journée',why:'En fin de journée, elle marque une vraie coupure entre le travail et la soirée.'},
        {i:'cal',l:'Ça dépend des semaines',slot:'Créneau souple',why:'Les créneaux se calent semaine après semaine&nbsp;: la séance s’adapte à votre agenda, et pas l’inverse.'}]}
    ];

    /* ---------- Entreprise ---------- */
    var ENT=[
      {q:'Vous imaginez plutôt <span class="serif">quel format</span>&nbsp;?',opts:[
        {i:'cal',l:'Des séances régulières',s:'Toute l’année',fmt:'int'},
        {i:'trophy',l:'Un temps fort ponctuel',s:'Séminaire, événement…',fmt:'team'},
        {i:'info',l:'Je ne sais pas encore',s:'On regarde ensemble',fmt:null}]},
      {q:'Votre <span class="serif">objectif</span> principal&nbsp;?',opts:[
        {i:'smile',l:'Moins de stress dans les équipes',lean:'int',goal:'faire baisser la pression',
         why:'Le stress au travail s’accumule sans trouver de sortie. La boxe en offre une, concrète&nbsp;: on frappe, on bouge, on souffle, et chacun repart plus léger.',
         int:'Chaque séance se termine par un retour au calme, pour faire retomber la pression',
         team:'Des défis de frappe pour se défouler, puis un retour au calme collectif',
         gains:['Une pression qui retombe','Des collaborateurs plus sereins','Un climat de travail plus apaisé']},
        {i:'users',l:'Plus de cohésion',lean:'team',goal:'renforcer la cohésion',
         why:'La cohésion ne se décrète pas, elle se vit. Les exercices à deux et les défis en équipe obligent à se coordonner, à s’encourager et à se faire confiance.',
         int:'Des binômes qui changent à chaque séance, pour mélanger les services',
         team:'Des défis par équipes et des exercices à deux, où l’on gagne ensemble',
         gains:['Des liens renforcés entre collègues','Plus de confiance et d’entraide','Une équipe plus soudée']},
        {i:'bolt',l:'Plus d’énergie au travail',lean:'int',goal:'redonner de l’énergie',
         why:'Quand l’énergie baisse, tout le monde le sent. Un effort dynamique, en musique et en groupe, réveille le corps et la tête&nbsp;: l’équipe repart avec un vrai élan.',
         int:'Des séances rythmées, idéalement en début de journée ou de semaine',
         team:'Des enchaînements dynamiques en musique, pour réveiller tout le groupe',
         gains:['Une équipe plus dynamique','Plus de motivation au quotidien','Un élan collectif retrouvé']},
        {i:'star',l:'Marquer un événement',lean:'team',goal:'marquer un événement',
         why:'Pour marquer un cap, rien de tel qu’une expérience inhabituelle et partagée. La boxe surprend, fait rire et crée des souvenirs communs.',
         int:'Une première séance pensée comme un temps fort, pour marquer le lancement',
         team:'Un défi final par équipes, pour finir sur un moment fort',
         gains:['Un souvenir commun fort','Une équipe fière de ce qu’elle a vécu','Une dynamique positive pour la suite']}]},
      {q:'Combien de <span class="serif">personnes</span>&nbsp;?',opts:[
        {i:'user',l:'Moins de 10',org:'Un seul groupe',why:'En petit groupe, je suis chacun de près&nbsp;: les consignes sont personnalisées et tout le monde progresse.'},
        {i:'users',l:'De 10 à 30',org:'Binômes et petites équipes',why:'Avec 10 à 30 personnes, on travaille en binômes et en petites équipes&nbsp;: tout le monde participe en même temps, sans temps mort.'},
        {i:'users',l:'Plus de 30',org:'Sous-groupes en rotation',why:'Au-delà de 30 personnes, on organise des sous-groupes en rotation, pour que chacun participe vraiment et en toute sécurité.'}]}
    ];
    /* pourquoi ce format plutôt que l'autre (format choisi, ou déduit de l'objectif si « je ne sais pas ») */
    var FMT_WHY={
      int:{known:'Vous visez la durée&nbsp;: des séances régulières installent une habitude, et les effets se construisent semaine après semaine au lieu de retomber après un seul événement.',
           guess:'Comme votre objectif se joue dans la durée, je vous conseille des séances régulières plutôt qu’un événement unique&nbsp;: c’est la répétition qui fait la différence.'},
      team:{known:'Vous visez un temps fort&nbsp;: un team building concentre l’énergie sur un moment marquant, simple à organiser, qui lance une vraie dynamique.',
            guess:'Comme votre objectif se vit surtout lors d’un moment fort partagé, je vous conseille de commencer par un team building&nbsp;: c’est le format le plus marquant pour lancer la dynamique.'}
    };

    var ans=[];
    function path(){ return ans[0]===1?ENT:PART; }
    function spec(i){ return i===0?Q1:path()[i-1]; }
    function setProg(n,txt){ bar.style.width=(n/N*100)+'%'; stepEl.textContent=txt; }
    function view(html){ body.style.animation='none'; void body.offsetWidth; body.style.animation=''; body.innerHTML=html; }
    function ask(i){
      var s=spec(i);
      setProg(i,(i+1)+'/'+N);
      var cls=s.opts.length===2?' two':(s.opts.length===3?' three':'');
      var h='<h2 class="qz-q" id="qzQ" tabindex="-1">'+s.q+'</h2><div class="qz-opts'+cls+'" role="group" aria-labelledby="qzQ">';
      s.opts.forEach(function(o,k){
        h+='<button type="button" class="qz-opt" data-k="'+k+'" aria-pressed="'+(ans[i]===k?'true':'false')+'"><span class="bub">'+ic(o.i)+'</span><span>'+o.l+(o.s?'<small>'+o.s+'</small>':'')+'</span></button>';
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
    /* le conseil, construit à partir des réponses */
    function decide(){
      var said=[1,2,3].map(function(k){ return path()[k-1].opts[ans[k]].l; });
      if(ans[0]!==1){
        var a=PART[0].opts[ans[1]], b=PART[1].opts[ans[2]], c=PART[2].opts[ans[3]];
        /* cœur de séance ajusté au niveau : plus progressif après une longue pause, plus doux en cas de gêne */
        var core=ans[2]===3?(a.coreSoft||a.core):ans[2]===0?(a.coreStart||a.core):a.core;
        return {who:'part',offre:OFFRES.ind,said:said,
          sub:'Un coaching en tête à tête, construit autour de votre besoin&nbsp;: '+a.goal+'.',
          meta:['Programme «&nbsp;'+a.name+'&nbsp;»',a.short?'45 min':b.dur,b.rhythm,c.slot],
          why:[a.why,b.why,c.why],
          stepsK:'Votre séance type',steps:[['Échauffement',b.warm],['Cœur de séance',core],['Fin de séance',a.end]],
          gainsK:'Ce que vous pouvez en attendre',gains:a.gains};
      }
      var f=ENT[0].opts[ans[1]], g=ENT[1].opts[ans[2]], n=ENT[2].opts[ans[3]], key=f.fmt||g.lean, o=OFFRES[key];
      var steps=key==='int'
        ?[['Lancement',g===ENT[1].opts[3]?g.int:'Une séance découverte, pour que chacun teste sans pression'],
          ['Rythme','Du FitBoxing (boxe + fitness) dans vos locaux, à une fréquence définie avec vous'],
          ['À chaque séance',g===ENT[1].opts[3]?'Un point d’étape avec vous, pour ajuster le programme':g.int]]
        :[['Ouverture','Accueil et échauffement collectif, ludique, pour mettre tout le monde à l’aise'],
          ['Temps fort',g.team],
          ['Clôture','Retour au calme et temps d’échange, pour ancrer ce qui a été vécu']];
      var note=null;
      if(!f.fmt) note='Bon à savoir&nbsp;: les deux formats se combinent très bien. Un team building lance la dynamique, des séances régulières la font durer.';
      else if(key==='team'&&g.lean==='int') note='Bon à savoir&nbsp;: pour que l’effet dure, des séances régulières peuvent prendre le relais après le team building.';
      else if(key==='int'&&g.lean==='team') note='Bon à savoir&nbsp;: un team building peut aussi ouvrir le programme, pour souder l’équipe dès le départ.';
      return {who:'ent',offre:o,said:said,note:note,
        sub:'Un programme pensé pour votre objectif&nbsp;: '+g.goal+'.',
        meta:[o.fmt,n.org,key==='int'?'Dans vos locaux':'Dans vos locaux ou ailleurs'],
        why:[g.why,FMT_WHY[key][f.fmt?'known':'guess'],n.why],
        stepsK:'Le déroulé proposé',steps:steps,
        gainsK:'Ce que vos équipes y gagnent',gains:g.gains};
    }
    function compute(){
      setProg(N,N+'/'+N);
      var r=decide();
      QUIZ.need=r.offre.plain;
      QUIZ.text={pour:plain(Q1.opts[ans[0]].s),reponses:r.said.map(plain)};
      if(reduce){ result(r); return; }
      view('<div class="qz-load" role="status"><div class="gl"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#d-glove"/></svg></div><b>Je prépare mon conseil à partir de vos réponses…</b><div class="qz-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>');
      setTimeout(function(){ result(r); },1200);
    }
    function li(t){ return '<li><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg><span>'+t+'</span></li>'; }
    function result(r){
      var o=r.offre, ent=r.who==='ent';
      var h='<h2 class="qz-q" id="qzQ" tabindex="-1">Mon conseil <span class="serif">'+(ent?'pour votre entreprise':'pour vous')+'</span></h2>'
      +'<article class="qr '+o.cls+'">'
      +'<div class="qr-top"><p class="qr-for"><svg class="ic" aria-hidden="true"><use href="#'+(ent?'i-brief':'i-user')+'"/></svg>'+(ent?'Entreprises':'Particuliers')+'</p>'
      +'<h3 class="qr-name">'+o.rec+'</h3><p class="qr-sub">'+r.sub+'</p>'
      +'<ul class="qr-meta" aria-label="En bref">'+r.meta.map(function(m){ return '<li>'+m+'</li>'; }).join('')+'</ul></div>'
      +'<div class="qr-cols">'
      +'<div class="qr-col"><p class="qr-k">Vous m’avez dit</p><ul class="qr-said">'+r.said.map(function(s){ return '<li>'+s+'</li>'; }).join('')+'</ul>'
      +'<p class="qr-k">Pourquoi '+(ent?'cette offre répond à votre besoin':'ce coaching va vous aider')+'</p><div class="qr-txt">'+r.why.map(function(p){ return '<p>'+p+'</p>'; }).join('')+'</div></div>'
      +'<div class="qr-col"><p class="qr-k">'+r.stepsK+'</p><ol class="qr-steps">'+r.steps.map(function(s){ return '<li><span><b>'+s[0]+'</b>'+s[1]+'</span></li>'; }).join('')+'</ol>'
      +'<p class="qr-k">'+r.gainsK+'</p><ul class="qr-gains">'+r.gains.map(li).join('')+'</ul></div>'
      +'</div>'
      +(r.note?'<p class="qr-alt">'+r.note+'</p>':'')
      +'<div class="qr-cta"><a class="btn btn-primary" href="#rdv">Réserver mon appel de 5&nbsp;min <svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></a>'
      +'<a class="btn btn-secondary" href="'+o.href+'">Découvrir l’offre <svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></a></div>'
      +'</article>'
      +'<div class="qz-cta"><button type="button" class="qz-redo" id="qzRedo">Refaire le quiz</button><p class="qz-note">Un premier repère, pas un diagnostic&nbsp;: on affine ensemble pendant l’appel, gratuit et sans engagement.</p></div>';
      view(h);
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
  var CAL_URL='https://calendly.com/coaching-jeremy-mercier/30min';
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
    if(ev==='calendly.page_height'){
      /* le cadre prend la hauteur du contenu de Calendly : pas de barre de défilement dans le calendrier */
      var h=parseInt(e.data.payload&&e.data.payload.height,10);
      if(h>300&&calFrame) calFrame.style.height=h+'px';
    }
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
