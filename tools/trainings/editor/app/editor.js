// Éditeur des formations (interface). Données : /api/content ; aperçu : /api/preview.
const LANGS = { fr: 'Français', en: 'Anglais' };
const FIELDS = [
  { key: 'title', label: 'Titre', required: true, full: true, hint: 'Affiché en haut de la fiche et sur la carte du catalogue' },
  { key: 'seoTitle', label: 'Titre de l’onglet (SEO)', full: true, hint: 'Vide = « Titre - Q-Leap »' },
  { key: 'slug', label: 'Adresse de la page', full: true, slug: true },
  { key: 'description', label: 'Informations', rich: true, full: true },
  { key: 'price', label: 'Prix de la formation', placeholder: '1 650.00€ HTVA' },
  { key: 'duration', label: 'Durée', placeholder: '3 jours' },
  { key: 'languages', label: 'Langues de la formation', placeholder: 'Anglais, Français' },
  { key: 'format', label: 'Format / Lieu', placeholder: 'Présentiel, Live Virtual Classroom', hint: 'Vide = bloc masqué' },
  { key: 'certificate', label: 'Certificat / Diplôme', placeholder: 'Examen compris' },
  { key: 'programPdf', label: 'Programme (PDF)', file: 'documents' },
  { key: 'syllabusPdf', label: 'Syllabus (PDF)', file: 'documents' },
];

const state = { content: null, defaultLabels: null, selected: null, tab: 'fr', previewLang: 'fr', previewWidth: 1440, dirty: false };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escape = (text) => String(text ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slugify = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/®/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const training = () => state.content?.trainings.find((item) => item.id === state.selected);
const sorted = () => [...state.content.trainings].sort((a, b) => a.order - b.order);
const today = () => new Date().toISOString().slice(0, 10);

function setStatus(text, kind = '') {
  const status = $('#status');
  status.textContent = text;
  status.className = `topbar-status ${kind}`;
}

function markDirty() {
  state.dirty = true;
  $('#save-button').disabled = false;
  setStatus('Modifications non enregistrées', 'dirty');
  renderList();
  schedulePreview();
}

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
  return data;
}

// ---------- Liste ----------
function renderList() {
  const query = slugify($('#filter').value);
  const list = $('#training-list');
  list.innerHTML = sorted().filter((item) => !query || slugify(`${item.fr.title} ${item.en.title}`).includes(query)).map((item) => `
    <li draggable="true" data-id="${escape(item.id)}" aria-current="${item.id === state.selected}">
      <img src="/site/${escape(item.image?.card?.src || '')}" alt="">
      <div><div class="name">${escape(item.fr.title || 'Sans titre')}${item.status === 'draft' ? '<span class="badge">Brouillon</span>' : ''}</div>
      <div class="meta">${upcomingCount(item)} session(s) à venir</div></div>
    </li>`).join('');
}

function upcomingCount(item) {
  return ['fr', 'en'].reduce((total, lang) => Math.max(total, (item[lang].sessions || []).filter((session) => (session.end || session.start) >= today()).length), 0);
}

function initList() {
  const list = $('#training-list');
  let dragged = null;
  list.addEventListener('click', (event) => {
    const item = event.target.closest('li');
    if (item) select(item.dataset.id);
  });
  list.addEventListener('dragstart', (event) => { dragged = event.target.closest('li'); dragged?.classList.add('dragging'); });
  list.addEventListener('dragend', () => { dragged?.classList.remove('dragging'); $$('.drop-before', list).forEach((item) => item.classList.remove('drop-before')); dragged = null; });
  list.addEventListener('dragover', (event) => {
    event.preventDefault();
    $$('.drop-before', list).forEach((item) => item.classList.remove('drop-before'));
    event.target.closest('li')?.classList.add('drop-before');
  });
  list.addEventListener('drop', (event) => {
    event.preventDefault();
    const target = event.target.closest('li');
    if (!dragged || !target || target === dragged) return;
    const order = sorted().map((item) => item.id).filter((id) => id !== dragged.dataset.id);
    order.splice(order.indexOf(target.dataset.id), 0, dragged.dataset.id);
    order.forEach((id, index) => { state.content.trainings.find((item) => item.id === id).order = index; });
    markDirty();
  });
  $('#filter').addEventListener('input', renderList);
}

// ---------- Formulaire ----------
function select(id) {
  state.selected = id;
  renderList();
  renderForm();
  schedulePreview(0);
}

function fieldHtml(field, lang, item) {
  const value = item[lang][field.key] ?? '';
  const id = `${lang}-${field.key}`;
  const copy = lang === 'en' ? `<button type="button" class="copy-fr" data-copy="${field.key}">Copier depuis FR</button>` : '';
  const hint = field.hint ? `<small>${escape(field.hint)}</small>` : '';
  let control;
  if (field.rich) {
    control = `<div class="rich"><div class="rich-toolbar" data-for="${id}">
      <button type="button" data-command="bold" title="Gras"><b>G</b></button>
      <button type="button" data-command="italic" title="Italique"><i>I</i></button>
      <button type="button" data-command="insertUnorderedList" title="Liste">• Liste</button>
      <button type="button" data-command="createLink" title="Lien">Lien</button>
      <button type="button" data-command="removeFormat" title="Effacer la mise en forme">⌫</button>
    </div><div class="rich-body" id="${id}" contenteditable="true" data-lang="${lang}" data-key="${field.key}">${value}</div></div>`;
  } else if (field.file) {
    control = `<div class="file-row"><input type="text" id="${id}" data-lang="${lang}" data-key="${field.key}" value="${escape(value)}" placeholder="assets/documents/…pdf">
      <button type="button" class="button small" data-upload="${field.file}" data-target="${id}">Envoyer un PDF</button>
      ${value ? `<a href="/site/${escape(value)}" target="_blank" rel="noopener">Voir</a>` : ''}</div>`;
  } else {
    control = `<input type="text" id="${id}" data-lang="${lang}" data-key="${field.key}" value="${escape(value)}" placeholder="${escape(field.placeholder || '')}"${field.required ? ' required' : ''}${field.slug ? ' pattern="[a-z0-9-]+"' : ''}>`;
  }
  const slugNote = field.slug ? `<small class="slug-url">/${lang === 'en' ? 'en/' : ''}trainings/<b>${escape(value || '…')}</b>/</small>` : '';
  return `<label class="field${field.full ? ' full' : ''}" for="${id}"><span>${escape(field.label)} ${copy}${hint}</span>${control}${slugNote}</label>`;
}

function languagePanel(lang, item) {
  return `<div class="group"><h2>Contenu de la fiche · ${LANGS[lang]}</h2><div class="grid">${FIELDS.map((field) => fieldHtml(field, lang, item)).join('')}</div></div>`;
}

function sessionRow(session, index, lang) {
  const past = (session.end || session.start) < today();
  return `<div class="session${past ? ' past' : ''}" data-index="${index}" data-lang="${lang}">
    <label class="field"><span>Début</span><input type="date" data-session="start" value="${escape(session.start)}" required></label>
    <label class="field"><span>Fin</span><input type="date" data-session="end" value="${escape(session.end)}" required></label>
    <label class="field"><span>Langue <small>(facultatif)</small></span><input type="text" data-session="language" value="${escape(session.language)}" placeholder="FRANÇAIS"></label>
    <label class="field"><span>Format</span><input type="text" data-session="format" value="${escape(session.format)}" placeholder="Live Virtual Classroom, Onsite"></label>
    <button type="button" class="remove" data-remove-session title="Supprimer la session" aria-label="Supprimer la session">×</button>
    <div class="session-preview">${past ? 'Session passée : n’apparaît plus sur le site.' : escape(rangeText(session, lang))}</div>
  </div>`;
}

function rangeText(session, lang) {
  const labels = state.content.labels?.[lang] || state.defaultLabels[lang];
  const months = labels.months || state.defaultLabels[lang].months;
  if (!session.start) return '';
  const end = session.end || session.start;
  const part = (iso, withYear) => `${Number(iso.slice(8, 10))} ${months[Number(iso.slice(5, 7)) - 1]}${withYear ? ` ${iso.slice(0, 4)}` : ''}`;
  return session.start === end ? part(end, true) : `${part(session.start, session.start.slice(0, 4) !== end.slice(0, 4))} - ${part(end, true)}`;
}

function sessionsPanel(item) {
  return ['fr', 'en'].map((lang) => `<div class="group"><h2>Sessions · ${LANGS[lang]} ${lang === 'en' ? '<button type="button" class="copy-fr" data-copy-sessions>Copier les sessions FR</button>' : ''}</h2>
    <div class="sessions" data-sessions="${lang}">${(item[lang].sessions || []).map((session, index) => sessionRow(session, index, lang)).join('') || '<p class="hint">Aucune session : la fiche affiche le formulaire de demande.</p>'}</div>
    <p><button type="button" class="button small" data-add-session="${lang}">+ Ajouter une session</button></p></div>`).join('');
}

function filtersHtml(lang, item) {
  const filters = state.content.filters;
  return Object.entries(filters).map(([name, group]) => `<div class="field full"><span>${escape(group.fr)}</span><div class="checks">${group.choices.map((choice) => `
    <label><input type="checkbox" data-filter="${name}" data-lang="${lang}" value="${escape(choice)}"${(item[lang].filters?.[name] || []).includes(choice) ? ' checked' : ''}> ${escape(choice)}</label>`).join('')}</div></div>`).join('');
}

function imageHtml(item, key, title) {
  const image = item[key]?.card;
  return `<div class="field full"><span>${title}</span><div class="image-box">
    <img src="/site/${escape(image?.src || '')}" alt="">
    <div><p class="hint">${image ? `${image.width} × ${image.height} px · ${escape(image.src)}` : 'Aucune image'}</p>
    <button type="button" class="button small" data-upload="images" data-image="${key}">Remplacer l’image</button>
    ${key === 'imageEn' ? '<button type="button" class="copy-fr" data-copy-image>Utiliser l’image FR</button>' : ''}</div></div></div>`;
}

function cataloguePanel(item) {
  return `<div class="group"><h2>Images du catalogue</h2><div class="grid">${imageHtml(item, 'image', 'Carte · Français')}${imageHtml(item, 'imageEn', 'Carte · Anglais')}</div></div>
    <div class="group"><h2>Filtres du catalogue · Français</h2><div class="grid">${filtersHtml('fr', item)}</div></div>
    <div class="group"><h2>Filtres du catalogue · Anglais <button type="button" class="copy-fr" data-copy-filters>Copier les filtres FR</button></h2><div class="grid">${filtersHtml('en', item)}</div></div>`;
}

function renderForm() {
  const item = training();
  $('#empty').hidden = Boolean(item);
  $('#form').hidden = !item;
  if (!item) return;
  $('#form-title').textContent = item.fr.title || 'Nouvelle formation';
  $('#form-subtitle').textContent = `Position ${sorted().indexOf(item) + 1} sur ${state.content.trainings.length} dans le catalogue`;
  $('#status-published').checked = item.status !== 'draft';
  $('[data-panel="fr"]').innerHTML = languagePanel('fr', item);
  $('[data-panel="en"]').innerHTML = languagePanel('en', item);
  $('[data-panel="sessions"]').innerHTML = sessionsPanel(item);
  $('[data-panel="catalogue"]').innerHTML = cataloguePanel(item);
  showTab(state.tab);
}

function showTab(tab) {
  state.tab = tab;
  $$('.tabs [role=tab]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
  $$('.tab-panel').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
  if (tab === 'fr' || tab === 'en') setPreviewLang(tab);
}

function cleanRichHtml(html) {
  return html.replace(/<div><br><\/div>/g, '').replace(/<div>/g, '<p>').replace(/<\/div>/g, '</p>').replace(/&nbsp;/g, ' ').trim();
}

function initForm() {
  const form = $('#form');
  $('.tabs').addEventListener('click', (event) => { const tab = event.target.closest('[role=tab]'); if (tab) showTab(tab.dataset.tab); });
  form.addEventListener('input', (event) => {
    const item = training();
    const target = event.target;
    if (target.dataset.key) {
      const lang = target.dataset.lang;
      const value = target.isContentEditable ? cleanRichHtml(target.innerHTML) : target.value;
      item[lang][target.dataset.key] = target.dataset.key === 'slug' ? slugify(value) : value;
      if (target.dataset.key === 'slug') target.closest('.field').querySelector('.slug-url b').textContent = item[lang].slug || '…';
      if (target.dataset.key === 'title' && lang === 'fr') $('#form-title').textContent = value || 'Nouvelle formation';
      if (target.dataset.key === 'title' && item.isNew && !item[lang].slugTouched) {
        item[lang].slug = slugify(value);
        const slugInput = $(`#${lang}-slug`);
        if (slugInput) { slugInput.value = item[lang].slug; slugInput.closest('.field').querySelector('.slug-url b').textContent = item[lang].slug || '…'; }
      }
      if (target.dataset.key === 'slug') item[lang].slugTouched = true;
      markDirty();
    } else if (target.dataset.session) {
      const row = target.closest('.session');
      const session = item[row.dataset.lang].sessions[Number(row.dataset.index)];
      session[target.dataset.session] = target.value;
      if (target.dataset.session === 'start' && (!session.end || session.end < session.start)) { session.end = session.start; row.querySelector('[data-session=end]').value = session.end; }
      row.querySelector('.session-preview').textContent = rangeText(session, row.dataset.lang);
      markDirty();
    }
  });
  form.addEventListener('change', (event) => {
    const item = training();
    const target = event.target;
    if (target.dataset.filter) {
      const values = $$(`input[data-filter="${target.dataset.filter}"][data-lang="${target.dataset.lang}"]:checked`).map((input) => input.value);
      (item[target.dataset.lang].filters ||= {})[target.dataset.filter] = values;
      markDirty();
    } else if (target.id === 'status-published') {
      item.status = target.checked ? 'published' : 'draft';
      markDirty();
    }
  });
  form.addEventListener('click', async (event) => {
    const item = training();
    const button = event.target.closest('button');
    if (!button || !item) return;
    if (button.dataset.command) {
      event.preventDefault();
      const value = button.dataset.command === 'createLink' ? prompt('Adresse du lien (https://…)') : null;
      if (button.dataset.command === 'createLink' && !value) return;
      document.execCommand(button.dataset.command, false, value);
      const body = $(`#${button.parentElement.dataset.for}`);
      item[body.dataset.lang][body.dataset.key] = cleanRichHtml(body.innerHTML);
      markDirty();
    } else if (button.dataset.copy) {
      item.en[button.dataset.copy] = item.fr[button.dataset.copy];
      renderForm(); markDirty();
    } else if ('copySessions' in button.dataset) {
      item.en.sessions = JSON.parse(JSON.stringify(item.fr.sessions || []));
      renderForm(); markDirty();
    } else if ('copyFilters' in button.dataset) {
      item.en.filters = JSON.parse(JSON.stringify(item.fr.filters || {}));
      renderForm(); markDirty();
    } else if ('copyImage' in button.dataset) {
      item.imageEn = JSON.parse(JSON.stringify(item.image));
      renderForm(); markDirty();
    } else if (button.dataset.addSession) {
      const lang = button.dataset.addSession;
      (item[lang].sessions ||= []).push({ start: today(), end: today(), language: '', format: 'Live Virtual Classroom, Onsite', eventId: '' });
      renderForm(); markDirty();
    } else if ('removeSession' in button.dataset) {
      const row = button.closest('.session');
      item[row.dataset.lang].sessions.splice(Number(row.dataset.index), 1);
      renderForm(); markDirty();
    } else if (button.dataset.upload) {
      const uploaded = await pickAndUpload(button.dataset.upload);
      if (!uploaded) return;
      if (button.dataset.image) {
        const key = button.dataset.image;
        item[key] = { ...(item[key] || {}), card: { src: uploaded.path, srcset: [], sizes: '', width: uploaded.width, height: uploaded.height }, social: uploaded.path, socialUrl: `https://q-leap.eu/${uploaded.path}` };
      } else {
        const input = $(`#${button.dataset.target}`);
        item[input.dataset.lang][input.dataset.key] = uploaded.path;
      }
      renderForm(); markDirty();
    }
  });
  $('#duplicate-button').addEventListener('click', () => duplicate(training()));
  $('#delete-button').addEventListener('click', () => {
    const item = training();
    if (!confirm(`Supprimer « ${item.fr.title} » ? Ses pages FR et EN ne seront plus publiées.`)) return;
    state.content.trainings = state.content.trainings.filter((other) => other !== item);
    state.selected = null;
    renderForm(); markDirty();
  });
  $('#add-button').addEventListener('click', addTraining);
}

function pickAndUpload(kind) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'documents' ? 'application/pdf' : 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve(null);
      setStatus(`Envoi de ${file.name}…`);
      try {
        const response = await fetch(`/api/upload?kind=${kind}&name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setStatus(`${file.name} ajouté`, 'ok');
        resolve(data);
      } catch (error) { setStatus(error.message, 'error'); resolve(null); }
    };
    input.click();
  });
}

function nextPostId() {
  return Math.max(...state.content.trainings.flatMap((item) => [item.fr.postId, item.en.postId]).map(Number).filter(Boolean), 50000) + 1;
}

function blankVersion(postId) {
  return { postId, slug: '', title: '', seoTitle: '', published: new Date().toISOString().slice(0, 19), modified: '', description: '', price: '', duration: '', languages: '', format: '', certificate: '', programPdf: '', syllabusPdf: '', contactForm: '2', taxonomyClasses: [], filters: {}, sessions: [] };
}

function addTraining() {
  const id = `nouvelle-formation-${Date.now()}`;
  const fr = nextPostId();
  const first = sorted()[0];
  state.content.trainings.forEach((item) => { item.order += 1; });
  state.content.trainings.push({ id, isNew: true, order: 0, status: 'draft', image: JSON.parse(JSON.stringify(first?.image || {})), imageEn: JSON.parse(JSON.stringify(first?.imageEn || {})), fr: blankVersion(fr), en: blankVersion(fr + 1) });
  select(id); markDirty();
}

function duplicate(item) {
  const copy = JSON.parse(JSON.stringify(item));
  const postId = nextPostId();
  copy.id = `${item.id}-copie-${Date.now()}`;
  copy.status = 'draft';
  copy.isNew = true;
  copy.order = item.order + 0.5;
  for (const [lang, offset] of [['fr', 0], ['en', 1]]) {
    copy[lang].postId = postId + offset;
    copy[lang].slug = `${item[lang].slug}-copie`;
    copy[lang].title = `${item[lang].title} (copie)`;
    copy[lang].seoTitle = '';
  }
  state.content.trainings.push(copy);
  sorted().forEach((other, index) => { other.order = index; });
  select(copy.id); markDirty();
}

// ---------- Contrôles avant enregistrement ----------
function problems() {
  const list = [];
  const seen = { fr: new Map(), en: new Map() };
  for (const item of state.content.trainings) {
    for (const lang of ['fr', 'en']) {
      const version = item[lang];
      const name = `« ${item.fr.title || 'Sans titre'} » (${lang.toUpperCase()})`;
      if (item.status !== 'draft') {
        if (!version.title) list.push(`${name} : titre manquant`);
        if (!/^[a-z0-9-]+$/.test(version.slug || '')) list.push(`${name} : adresse de page invalide (lettres minuscules, chiffres et tirets)`);
      }
      if (version.slug) {
        if (seen[lang].has(version.slug)) list.push(`${name} : même adresse que « ${seen[lang].get(version.slug)} »`);
        seen[lang].set(version.slug, item.fr.title);
      }
      (version.sessions || []).forEach((session, index) => {
        if (!session.start || !session.end) list.push(`${name} : session ${index + 1} sans date`);
        else if (session.end < session.start) list.push(`${name} : session ${index + 1} se termine avant de commencer`);
      });
    }
  }
  return list;
}

async function save() {
  const issues = problems();
  if (issues.length) { setStatus(issues[0], 'error'); alert(`À corriger avant d’enregistrer :\n\n• ${issues.join('\n• ')}`); return false; }
  setStatus('Enregistrement et génération des pages…');
  $('#save-button').disabled = true;
  for (const item of state.content.trainings) {
    if (item.isNew && item.fr.slug) { item.id = item.fr.slug; delete item.isNew; state.selected = state.selected?.startsWith('nouvelle-formation') || state.selected?.includes('-copie-') ? item.id : state.selected; }
    for (const lang of ['fr', 'en']) delete item[lang].slugTouched;
  }
  sorted().forEach((item, index) => { item.order = index; });
  // A published page whose address changes keeps its former address as a redirect.
  for (const item of state.content.trainings) {
    const before = state.savedSlugs.get(item.id);
    for (const lang of ['fr', 'en']) {
      const old = before?.[lang];
      if (old && old !== item[lang].slug) item[lang].previousSlugs = [...new Set([...(item[lang].previousSlugs || []), old])].filter((slug) => slug !== item[lang].slug);
    }
  }
  try {
    const result = await api('/api/content', { method: 'PUT', body: JSON.stringify({ content: state.content }) });
    state.dirty = false;
    rememberSlugs();
    setStatus(`Enregistré · ${result.written} pages générées`, 'ok');
    renderList(); renderForm(); schedulePreview(0);
    return true;
  } catch (error) {
    $('#save-button').disabled = false;
    setStatus(error.message, 'error');
    return false;
  }
}

// ---------- Aperçu ----------
let previewTimer;
function schedulePreview(delay = 600) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(updatePreview, delay);
}

async function updatePreview() {
  const item = training();
  if (!item) return;
  try {
    const { url } = await api('/api/preview', { method: 'POST', body: JSON.stringify({ content: state.content, trainingId: item.id, lang: state.previewLang }) });
    const frame = $('#preview');
    const scrollY = frame.contentWindow?.scrollY || 0;
    frame.onload = () => { try { frame.contentWindow.scrollTo(0, scrollY); } catch {} };
    frame.src = `${url}?t=${Date.now()}`;
    $('#preview-open').href = frame.src;
    layoutPreview();
  } catch (error) { setStatus(`Aperçu : ${error.message}`, 'error'); }
}

function layoutPreview() {
  const box = $('#preview-frame');
  const frame = $('#preview');
  const scale = Math.min(1, box.clientWidth / state.previewWidth);
  frame.style.width = `${state.previewWidth}px`;
  frame.style.height = `${box.clientHeight / scale}px`;
  frame.style.transform = `scale(${scale})`;
}

function setPreviewLang(lang) {
  if (state.previewLang === lang) return;
  state.previewLang = lang;
  $$('#preview-lang button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lang === lang)));
  schedulePreview(0);
}

function initPreview() {
  $('#preview-lang').addEventListener('click', (event) => { const button = event.target.closest('button'); if (button) setPreviewLang(button.dataset.lang); });
  $('#preview-device').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    state.previewWidth = Number(button.dataset.width);
    $$('#preview-device button').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    layoutPreview();
  });
  window.addEventListener('resize', layoutPreview);
}

// ---------- Libellés ----------
function initLabels() {
  $('#labels-button').addEventListener('click', () => {
    const labels = state.content.labels || (state.content.labels = { fr: {}, en: {} });
    const keys = Object.keys(state.defaultLabels.fr);
    $('#labels-grid').innerHTML = '<div class="head">Clé</div><div class="head">Français</div><div class="head">Anglais</div>' + keys.map((key) => {
      const value = (lang) => { const current = labels[lang]?.[key] ?? state.defaultLabels[lang][key]; return Array.isArray(current) ? current.join(' | ') : current; };
      return `<code>${key}</code>${['fr', 'en'].map((lang) => `<input data-label="${key}" data-lang="${lang}" value="${escape(value(lang))}">`).join('')}`;
    }).join('');
    $('#labels-dialog').showModal();
  });
  $('#labels-grid').addEventListener('input', (event) => {
    const input = event.target;
    const isList = Array.isArray(state.defaultLabels[input.dataset.lang][input.dataset.label]);
    (state.content.labels[input.dataset.lang] ||= {})[input.dataset.label] = isList ? input.value.split('|').map((part) => part.trim()) : input.value;
    markDirty();
  });
}

// ---------- Publication ----------
function initPublish() {
  $('#save-button').addEventListener('click', save);
  $('#publish-button').addEventListener('click', async () => {
    if (state.dirty && !(await save())) return;
    const status = await api('/api/status');
    $('#publish-branch').textContent = status.branch;
    $('#publish-changes').innerHTML = status.changes.length ? status.changes.slice(0, 80).map((line) => `<li>${escape(line)}</li>`).join('') : '<li>Aucun changement à publier.</li>';
    $('#publish-confirm').disabled = !status.changes.length;
    $('#publish-dialog').showModal();
  });
  $('#publish-dialog').addEventListener('close', async () => {
    if ($('#publish-dialog').returnValue !== 'confirm') return;
    setStatus('Publication sur GitHub…');
    try {
      await api('/api/publish', { method: 'POST', body: JSON.stringify({ message: $('#publish-message').value.trim() }) });
      setStatus('Publié sur GitHub', 'ok');
    } catch (error) { setStatus(`Publication impossible : ${error.message}`, 'error'); }
  });
  window.addEventListener('beforeunload', (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 's') { event.preventDefault(); if (state.dirty) save(); } });
}

function rememberSlugs() {
  state.savedSlugs = new Map(state.content.trainings.filter((item) => item.status !== 'draft').map((item) => [item.id, { fr: item.fr.slug, en: item.en.slug }]));
}

async function start() {
  const { content, defaultLabels } = await api('/api/content');
  state.content = content;
  rememberSlugs();
  state.defaultLabels = defaultLabels;
  initList(); initForm(); initPreview(); initLabels(); initPublish();
  renderList();
  select(sorted()[0]?.id);
  setStatus(`${content.trainings.length} formations`);
}

start().catch((error) => setStatus(error.message, 'error'));
