(() => {
  const STORAGE_KEY = 'medcontrol:meds';
  const HIST_KEY = STORAGE_KEY + ':hist';

  // Seletores
  const form = document.getElementById('medicineForm');
  const medName = document.getElementById('med-name');
  const medDose = document.getElementById('med-dose');
  const medTime = document.getElementById('med-time');
  const medRepeat = document.getElementById('med-repeat');
  const medList = document.getElementById('medList');
  const template = document.getElementById('med-item-template');
  const btnRequestPerm = document.getElementById('btn-request-perm');
  const btnClearAll = document.getElementById('btn-clear-all');
  const btnExport = document.getElementById('btn-export-hist');
  const liveRegion = document.getElementById('liveRegion');
  const histList = document.getElementById('histList');
  const contrastBtn = document.getElementById('btn-toggle-contrast');
  const yearEl = document.getElementById('year');

  yearEl.textContent = new Date().getFullYear();

  const load = (key, fallback = []) => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return fallback; }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  let meds = load(STORAGE_KEY);
  let hist = load(HIST_KEY);

  // Acessibilidade: atualizar região viva
  const speakLive = (text) => { liveRegion.textContent = text; };

  // Render med list
  const createItemNode = (med, index) => {
    const node = template.content.cloneNode(true);
    const li = node.querySelector('li');
    const nameEl = node.querySelector('.med-item__name');
    const metaEl = node.querySelector('.med-item__meta');
    const takeBtn = node.querySelector('.med-item__take');
    const skipBtn = node.querySelector('.med-item__skip');

    nameEl.textContent = med.name;
    metaEl.textContent = `${med.dose || ''} • ${med.time} ${med.repeat ? '• diário' : ''}`;

    takeBtn.addEventListener('click', () => markAsTaken(index));
    skipBtn.addEventListener('click', () => markAsSkipped(index));

    return li;
  };

  const renderList = () => {
    medList.innerHTML = '';
    if (!meds.length) {
      medList.innerHTML = `<li class="small">Nenhum medicamento agendado. Adicione um acima.</li>`;
      return;
    }
    meds.forEach((med, i) => medList.appendChild(createItemNode(med, i)));
  };

  const renderHist = () => {
    histList.innerHTML = '';
    if (!hist.length) {
      histList.innerHTML = `<li class="small">Nenhum evento registrado.</li>`;
      return;
    }
    hist.slice(0, 50).forEach(item => {
      const li = document.createElement('li');
      li.className = 'hist-item';
      li.textContent = `${item.at.slice(0,16).replace('T',' ')} — ${item.action.toUpperCase()} — ${item.med}`;
      histList.appendChild(li);
    });
  };

  // CRUD
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = medName.value.trim();
    const dose = medDose.value.trim();
    const time = medTime.value;
    const repeat = medRepeat.checked;

    if (!name || !time) {
      alert('Informe nome e horário do medicamento.');
      return;
    }

    meds.push({ name, dose, time, repeat, createdAt: new Date().toISOString() });
    save(STORAGE_KEY, meds);
    renderList();
    speakLive(`Agendado: ${name} às ${time}`);
    form.reset();
  });

  btnClearAll.addEventListener('click', () => {
    if (!confirm('Apagar todos os medicamentos salvos?')) return;
    meds = [];
    save(STORAGE_KEY, meds);
    renderList();
    speakLive('Agenda limpa.');
  });

  // Registro de ações
  const pushHist = (action, med) => {
    const entry = { action, med, at: new Date().toISOString() };
    hist.unshift(entry);
    // manter apenas 500 registros no store (controle)
    if (hist.length > 500) hist = hist.slice(0,500);
    save(HIST_KEY, hist);
    renderHist();
  };

  const markAsTaken = (index) => {
    const med = meds[index];
    if (!med) return;
    pushHist('tomei', med.name);
    speakLive(`Registrado: tomou ${med.name}`);
    if (!med.repeat) {
      meds.splice(index, 1);
      save(STORAGE_KEY, meds);
      renderList();
    }
  };

  const markAsSkipped = (index) => {
    const med = meds[index];
    if (!med) return;
    pushHist('pulou', med.name);
    speakLive(`Registrado: pulou ${med.name}`);
    if (!med.repeat) {
      meds.splice(index, 1);
      save(STORAGE_KEY, meds);
      renderList();
    }
  };

  // Notificações
  const supported = () => 'Notification' in window;
  const requestNotificationPermission = async () => {
    if (!supported()) { alert('Navegador não suporta notificações.'); return; }
    const p = await Notification.requestPermission();
    if (p === 'granted') speakLive('Notificações ativadas.');
    else speakLive('Permissão de notificações negada.');
  };
  btnRequestPerm.addEventListener('click', requestNotificationPermission);

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.02;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(()=>{ o.stop(); ctx.close(); }, 200);
    } catch (e) { /* ignorar */ }
  };

  const showBanner = (text) => {
    const banner = document.createElement('div');
    banner.setAttribute('role','status');
    banner.style.position='fixed';
    banner.style.right='12px';
    banner.style.bottom='12px';
    banner.style.background='var(--primary)';
    banner.style.color='#fff';
    banner.style.padding='10px 12px';
    banner.style.borderRadius='8px';
    banner.style.boxShadow='0 6px 20px rgba(0,0,0,0.2)';
    banner.style.zIndex=9999;
    banner.textContent=text;
    document.body.appendChild(banner);
    setTimeout(()=>banner.remove(),7000);
  };

  const sendNotification = (title, text) => {
    if (supported() && Notification.permission === 'granted') {
      const n = new Notification(title, { body: text });
      n.onclick = () => window.focus();
    } else {
      showBanner(`${title}: ${text}`);
    }
    playBeep();
  };

  // Verifica horário (checa a cada 30s)
  const checkReminders = () => {
    if (!meds.length) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const current = `${hh}:${mm}`;
    // iterar sobre cópia para evitar problemas com splice durante loop
    meds.slice().forEach((med, idx) => {
      if (med.time === current) {
        sendNotification('Hora do remédio', `${med.name} — ${med.dose || ''}`);
        speakLive(`Lembrete: ${med.name} às ${med.time}`);
        pushHist('lembrete', med.name);
        if (!med.repeat) {
          // remover pelo index real; findIndex por createdAt para robustez
          const realIndex = meds.findIndex(m => m.createdAt === med.createdAt);
          if (realIndex > -1) {
            meds.splice(realIndex,1);
            save(STORAGE_KEY, meds);
            renderList();
          }
        }
      }
    });
  };

  setInterval(checkReminders, 30*1000);
  setTimeout(checkReminders, 1500);

  // Exportar histórico como CSV
  const exportCSV = () => {
    const data = load(HIST_KEY);
    if (!data.length) {
      alert('Histórico vazio — nada para exportar.');
      return;
    }
    const rows = [['data','ação','medicamento']];
    data.forEach(item => {
      rows.push([item.at, item.action, item.med]);
    });
    const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medcontrol_historico_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  btnExport.addEventListener('click', exportCSV);

  // Contraste alto toggle
  contrastBtn.addEventListener('click', () => {
    const pressed = contrastBtn.getAttribute('aria-pressed') === 'true';
    document.documentElement.classList.toggle('high-contrast');
    contrastBtn.setAttribute('aria-pressed', String(!pressed));
  });

  // Inicialização
  const init = () => {
    renderList();
    renderHist();
    speakLive('Med Control pronto. Adicione um medicamento.');
  };

  init();

})();
