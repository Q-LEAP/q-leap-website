// Génère les fiches formation (trainings/<slug>/ et en/trainings/<slug>/) et la grille des
// catalogues (training/ et en/training/) à partir de content/trainings/ (une formation par fichier,
// éditable dans Pages CMS) et de content/training-settings.json (filtres et libellés).
// Le balisage reproduit celui du thème WordPress (single-trainings du thème enfant Qwery,
// widget Elementor « Publications » en cartes, filtres Ajax Search Pro) : même CSS, même rendu.
// Usage : node tools/trainings/build.mjs   (aussi appelé par l'éditeur à chaque enregistrement)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'trainings');
const SETTINGS_FILE = path.join(ROOT, 'content', 'training-settings.json');
const SITE = 'https://q-leap.eu';
const CARDS_PER_PAGE = 6;

export const DEFAULT_LABELS = {
  fr: {
    information: 'Informations', price: 'Prix de la formation', duration: 'Durée de la formation', languages: 'Langues de la formation',
    format: 'Format / Lieu', certificate: 'Certificat / Diplôme', documentation: 'Documentation',
    program: ['Télécharger le', 'programme (PDF)'], syllabus: ['Télécharger le syllabus', '(PDF)'],
    sessions: 'Nos prochaines sessions', previousSessions: 'Précédentes sessions', nextSessions: 'Prochaines sessions',
    register: "S'inscrire", sessionLanguage: 'Langue:', sessionFormat: 'Format:', noscript: 'Remarque : JavaScript est requis pour ce contenu.',
    readMore: 'Lire la suite »', readMoreAria: 'En savoir plus sur', previous: 'Précédent', next: 'Suivant',
    months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  },
  en: {
    information: 'Information', price: 'Training prices', duration: 'Course duration', languages: 'Training languages',
    format: 'Format / Location', certificate: 'Certificate / Diploma', documentation: 'Documentation',
    program: ['Download the', 'program (PDF)'], syllabus: ['Download the syllabus', '(PDF)'],
    sessions: 'Our next sessions', previousSessions: 'Previous sessions', nextSessions: 'Next sessions',
    register: "S'inscrire", sessionLanguage: 'Langue:', sessionFormat: 'Format:', noscript: 'Notice: JavaScript is required for this content.',
    readMore: 'Read more »', readMoreAria: 'Read more about', previous: 'Previous', next: 'Next',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
};

// WordPress' wptexturize on titles: " - " becomes an en dash entity, apostrophes become &rsquo;.
// Characters typed as such (« – », « ’ ») are kept as they are.
export function wpTitle(text) {
  return String(text)
    .replace(/&(?![a-z]+;|#\d+;)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/ - /g, ' &#8211; ').replace(/'/g, '&rsquo;');
}

// trx_addons breadcrumbs: trx_addons_strshort(texturized title, 49), which works on bytes (PHP
// strlen / substr), steps back to the last space when the cut is not on one, then esc_html
// re-escapes an entity cut in half (« &#8211... » shows as text, exactly as on the original site).
// Checked against the 22 original training pages.
const utf8 = new TextEncoder();
const byteSlice = (text, length) => new TextDecoder().decode(utf8.encode(text).slice(0, length)).replace(/\uFFFD/g, '');
export function breadcrumbTitle(text, maxLength = 49, more = '...') {
  let value = wpTitle(text);
  if (utf8.encode(value).length > maxLength) {
    const keep = maxLength - more.length;
    let cut = byteSlice(value, keep);
    const next = new TextDecoder().decode(utf8.encode(value).slice(keep, keep + 1));
    if (next !== ' ') {
      const space = cut.lastIndexOf(' ');
      cut = cut.slice(0, space > 0 ? space : cut.length).trim();
    }
    if (cut && ',.:;-'.includes(cut.slice(-1))) cut = cut.slice(0, -1);
    value = cut + more;
  }
  return value.replace(/&(?![a-z]+;|#\d+;)/gi, '&amp;');
}
const escapeAttribute = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function render(template, values) {
  return template
    .replace(/\{\{\{(\w+)\}\}\}/g, (_, key) => values[key] ?? '')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => escapeAttribute(values[key] ?? ''));
}

export function withLabels(content) {
  const labels = {};
  for (const lang of ['fr', 'en']) labels[lang] = { ...DEFAULT_LABELS[lang], ...(content.labels?.[lang] || {}) };
  return { ...content, labels };
}

export function loadContent() {
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  const trainings = fs.readdirSync(CONTENT_DIR).filter((name) => name.endsWith('.json')).sort()
    .map((name) => ({ id: name.slice(0, -5), ...JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8')) }));
  return withLabels({ ...settings, trainings: trainings.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) });
}

const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

export function saveContent(content) {
  const { labels, trainings, ...settings } = content;
  // Only labels that differ from the defaults are stored.
  const changed = {};
  for (const lang of ['fr', 'en']) {
    for (const [key, value] of Object.entries(labels?.[lang] || {})) {
      if (JSON.stringify(value) !== JSON.stringify(DEFAULT_LABELS[lang][key])) (changed[lang] ||= {})[key] = value;
    }
  }
  writeJson(SETTINGS_FILE, Object.keys(changed).length ? { ...settings, labels: changed } : settings);
  // One file per training, named after its id (the file name is the id, as in Pages CMS).
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  const kept = new Set();
  for (const { id, ...training } of trainings) {
    kept.add(`${id}.json`);
    writeJson(path.join(CONTENT_DIR, `${id}.json`), training);
  }
  for (const name of fs.readdirSync(CONTENT_DIR)) if (name.endsWith('.json') && !kept.has(name)) fs.rmSync(path.join(CONTENT_DIR, name));
}

export const paths = { ROOT, CONTENT_DIR, SETTINGS_FILE };

// Pages CMS writes uploaded files as "/assets/…": the pages need paths relative to the site root.
const sitePath = (file) => (file || '').replace(/^\/+/, '');

// Width and height read from the file header (PNG, GIF, JPEG, WebP), for images uploaded in the CMS.
function imageSize(file) {
  const data = fs.readFileSync(path.join(ROOT, file));
  if (data.toString('ascii', 1, 4) === 'PNG') return [data.readUInt32BE(16), data.readUInt32BE(20)];
  if (data.toString('ascii', 0, 3) === 'GIF') return [data.readUInt16LE(6), data.readUInt16LE(8)];
  if (data.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = data.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + data.readUIntLE(24, 3), 1 + data.readUIntLE(27, 3)];
    if (chunk === 'VP8L') { const bits = data.readUInt32LE(21); return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]; }
    return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
  }
  for (let offset = 2; offset < data.length;) {
    const marker = data[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [data.readUInt16BE(offset + 7), data.readUInt16BE(offset + 5)];
    offset += 2 + data.readUInt16BE(offset + 2);
  }
  throw new Error(`taille d'image illisible : ${file}`);
}

// The card image as imported from WordPress keeps its resized copies (srcset); an image replaced in
// the CMS has none: the copies of another image are dropped and the size is read from the file.
const stem = (file) => path.basename(sitePath(file)).replace(/(-\d+x\d+)?(@\dx)?\.\w+$/, '');
function cardImage(image) {
  const card = { ...image.card, src: sitePath(image.card.src) };
  const srcset = (card.srcset || []).map((entry) => (Array.isArray(entry) ? entry : String(entry).trim().split(/\s+/)));
  if (srcset.length && srcset.every(([file]) => stem(file) === stem(card.src))) return { ...card, srcset };
  const [width, height] = imageSize(card.src);
  return { ...card, srcset: [], sizes: '', width, height };
}

// The social image is served by this site: the WordPress image CDN URL kept in image.socialUrl
// (i0.wp.com/q-leap.eu/wp-content/…) stops working once q-leap.eu leaves WordPress.
function socialImageUrl(image) {
  return `${SITE}/${sitePath(image.social) || cardImage(image).src}`;
}

const day = (iso) => Number(iso.slice(8, 10));
const monthIndex = (iso) => Number(iso.slice(5, 7)) - 1;
const year = (iso) => Number(iso.slice(0, 4));

// « 8 décembre - 10 décembre 2026 » (the theme's format; the year is repeated when it changes).
export function dateRange(session, labels) {
  const { start, end } = session;
  const startText = `${day(start)} ${labels.months[monthIndex(start)]}${year(start) !== year(end) ? ` ${year(start)}` : ''}`;
  const endText = `${day(end)} ${labels.months[monthIndex(end)]} ${year(end)}`;
  return start === end ? endText : `${startText} - ${endText}`;
}

function upcoming(sessions, today) {
  return [...sessions].filter((session) => (session.end || session.start) >= today).sort((a, b) => a.start.localeCompare(b.start));
}

function metaBlock(heading, body) {
  return `
													<div class="traning-meta">
								<h4>
									${heading}								</h4>
								<p>
								${body}
								</p>
							</div>
						`;
}

function sessionsSection(version, labels, today) {
  const sessions = upcoming(version.sessions || [], today);
  let current = '';
  const parts = [];
  for (const session of sessions) {
    const month = `${labels.months[monthIndex(session.start)]} ${year(session.start)}`;
    if (month !== current) {
      if (current) parts.push('');
      parts.push(`<div class="session-month"><h4 class="ss_month-separator-text">${escapeText(month)}</h4></div>`);
      current = month;
    }
    const meta = [];
    if (session.language) meta.push(`
                            <div class="div-meta-group">
                    <span class="label-meta">
                        ${labels.sessionLanguage}
                    </span>
                      <span>
                    ${escapeText(session.language)}
                    </span>
                </div>`);
    if (session.format) meta.push(`
                            <div class="div-meta-group">
                    <span class="label-meta">
                        ${labels.sessionFormat}
                    </span>
                    <span>
                                                ${escapeText(session.format)}                    </span>
                </div>`);
    parts.push(`
<div class="session-column" data-session-end="${escapeAttribute(session.end || session.start)}">
    <div class="col-two session-item">
        <span class="meta-date-range">
            ${escapeText(dateRange(session, labels))}        </span>
        <h4>
            ${wpTitle(version.title)}        </h4>
        <div class="session-meta">${meta.join('')}
        </div>
        <div data-start-date="${escapeAttribute(session.start)} 00:00:00" data-name-ss="${wpTitle(version.title)}"
            data-post-id="${escapeAttribute(session.eventId || '')}"
            class="d-btn dddd form-ninja-popup sc_button sc_button_simple sc_button_size_normal sc_button_icon_left">
            <span class="sc_button_text"><span class="sc_button_title">${labels.register} </span></span></div>
    </div>
    <div class="col-three session-item">
    </div>
</div>`);
  }
  return { count: sessions.length, html: parts.join('') };
}

function ninjaForm(instance, labels) {
  return `<noscript class="ninja-forms-noscript-message">
	${labels.noscript}</noscript>
<div id="nf-form-2_${instance}-cont" class="nf-form-cont" aria-live="polite" aria-labelledby="nf-form-title-2_${instance}" aria-describedby="nf-form-errors-2_${instance}" role="form">

    <div class="nf-loading-spinner"></div>

</div>`;
}

export function articleHtml(training, lang, labels, today) {
  const version = training[lang];
  const pdfs = [];
  if (version.programPdf) pdfs.push(`
																			<a href="{{prefix}}${escapeAttribute(sitePath(version.programPdf))}" target="_blank">
											${labels.program[0]}
											${labels.program[1]}
										</a>
									`);
  if (version.syllabusPdf) pdfs.push(`
																			<a href="{{prefix}}${escapeAttribute(sitePath(version.syllabusPdf))}" target="_blank">
											${labels.syllabus[0]}
											${labels.syllabus[1]}
										</a>
																	`);
  const firstColumn = [
    version.price ? metaBlock(labels.price, `									${escapeText(version.price)}`) : '',
    version.duration ? metaBlock(labels.duration, escapeText(version.duration)) : '',
    version.languages ? metaBlock(labels.languages, escapeText(version.languages)) : '',
  ].join('');
  const secondColumn = [
    version.format ? metaBlock(labels.format, escapeText(version.format)) : '',
    version.certificate ? metaBlock(labels.certificate, escapeText(version.certificate)) : '',
    pdfs.length ? `
													<div class="traning-meta pdf">

								<h4>
									${labels.documentation}								</h4>

								<p>${pdfs.join('')}</p>
							</div>
						` : '',
  ].join('');
  const sessions = sessionsSection(version, labels, today);
  const sessionsOrRequest = sessions.count
    ? `
					<section class="trainings_page_sessions" id="dtrainings_page_sessions">
				<div class="content_container">

					<h2>
						${labels.sessions}					</h2>
					<div class="d-shortcode-sc">

						${sessions.html}

					</div>
					<div class="paginate-container"><a class="prev disable page-numbers" href="#">${labels.previousSessions}</a><a class="next disable page-numbers" href="#">${labels.nextSessions}</a></div>				</div>



			</section>`
    : `
						<section class="form" id="request-form-ninja" >
					<div class="content_container">
					${ninjaForm(1, labels)}
        						</div>
				</section>
`;
  const postId = version.postId;
  return `<article id="post-${postId}" data-post-id="${postId}" class="services_single itemscope post-${postId} trainings type-trainings status-publish format-standard has-post-thumbnail hentry ${(version.taxonomyClasses || []).join(' ')}" data-training="${escapeAttribute(training.id)}">
					<section class="services_page_header">
									<div class="services_page_featured">

												</div>
								</section>

		<section class="trainings_page_info">
			<div class="content_container">
				<div class="d info">
											${version.description ? `<div class="d-info text-info col">
							<div class="traning-meta">

									<h4>${labels.information}</h4>
								<p>
									${version.description}								</p>
							</div>
						</div>` : ''}

					<div class="d-info col">${firstColumn}

					</div>

					<div class="d-info col">${secondColumn}
					</div>

				</div>

			</div>

		</section>

		${sessionsOrRequest}
					<section class="form" id="form-ninja" style="display:none;">
			<div class="content_container">
				${ninjaForm(sessions.count ? 1 : 2, labels)}
        				</div>
		</section>



			</article>`;
}

function jsonLd(training, lang) {
  const version = training[lang];
  const model = fs.readFileSync(path.join(HERE, 'templates', `jsonld.${lang}.json`), 'utf8');
  const graph = JSON.parse(model);
  const url = `${SITE}/${lang === 'en' ? 'en/' : ''}trainings/${version.slug}/`;
  const image = socialImageUrl(lang === 'en' ? training.imageEn : training.image);
  for (const node of graph['@graph']) {
    if (node['@type'] === 'WebPage') {
      Object.assign(node, { '@id': url, url, name: version.seoTitle, primaryImageOfPage: { '@id': `${url}#primaryimage` }, image: { '@id': `${url}#primaryimage` },
        thumbnailUrl: image, breadcrumb: { '@id': `${url}#breadcrumb` }, potentialAction: [{ '@type': 'ReadAction', target: [url] }] });
      if (version.published) node.datePublished = `${version.published}+00:00`.replace(/(\+00:00)+$/, '+00:00');
      if (version.modified) node.dateModified = version.modified;
    } else if (node['@type'] === 'ImageObject' && String(node['@id']).includes('#primaryimage')) {
      Object.assign(node, { '@id': `${url}#primaryimage`, url: image, contentUrl: image, caption: version.title });
    } else if (node['@type'] === 'BreadcrumbList') {
      node['@id'] = `${url}#breadcrumb`;
      node.itemListElement[node.itemListElement.length - 1].name = wpTitle(version.title);
    }
  }
  return JSON.stringify(graph).replace(/\//g, '\\/');
}

export function trainingPage(content, training, lang, today = new Date().toISOString().slice(0, 10)) {
  const version = training[lang];
  const other = lang === 'fr' ? 'en' : 'fr';
  const prefix = lang === 'en' ? '../../../' : '../../';
  const template = fs.readFileSync(path.join(HERE, 'templates', `training.${lang}.html`), 'utf8');
  const url = `${SITE}/${lang === 'en' ? 'en/' : ''}trainings/${version.slug}/`;
  const image = lang === 'en' ? training.imageEn : training.image;
  const article = articleHtml(training, lang, content.labels[lang], today).replaceAll('{{prefix}}', prefix);
  return render(template, {
    seoTitle: version.seoTitle || `${version.title} - Q-Leap`,
    url,
    modified: version.modified || '',
    socialImageUrl: socialImageUrl(image),
    postId: version.postId,
    titleHtml: wpTitle(version.title),
    breadcrumbTitle: breadcrumbTitle(version.title),
    translationHref: `${prefix}${other === 'en' ? 'en/' : ''}trainings/${training[other].slug}/`,
    selfHref: `${prefix}${lang === 'en' ? 'en/' : ''}trainings/${version.slug}/`,
    article,
    jsonLd: jsonLd(training, lang),
  });
}

function cardHtml(training, lang, labels, eager) {
  const version = training[lang];
  const image = { card: cardImage(lang === 'en' ? training.imageEn : training.image) };
  const prefix = lang === 'en' ? '../../' : '../';
  const href = `../trainings/${version.slug}/`;
  const title = wpTitle(version.title);
  const filters = Object.entries(version.filters || {}).map(([name, values]) => ` data-filter-${name}="${escapeAttribute(JSON.stringify(values))}"`).join('');
  return `
				<article class="elementor-post elementor-grid-item post-${version.postId} trainings type-trainings status-publish format-standard has-post-thumbnail hentry ${(version.taxonomyClasses || []).join(' ')}" data-title="${escapeAttribute(version.title)}"${filters}>
			<div class="elementor-post__card">
				<a class="elementor-post__thumbnail__link" href="${href}" tabindex="-1" ><div class="elementor-post__thumbnail"><img ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="${image.card.width}" height="${image.card.height}" src="${prefix}${image.card.src}" class="attachment-newspack-article-block-portrait-large size-newspack-article-block-portrait-large" alt=""${image.card.srcset.length ? ` srcset="${image.card.srcset.map(([file, descriptor]) => `${prefix}${file} ${descriptor}`).join(', ')}"` : ''}${image.card.sizes ? ` sizes="${escapeAttribute(image.card.sizes)}"` : ''} /></div></a>
				<div class="elementor-post__avatar">
			<img alt='Marie Krust' src='${prefix}assets/images/ext/avatar-marie-krust-128.png' srcset='${prefix}assets/images/ext/avatar-marie-krust-256.png 2x' class='avatar avatar-128 photo' height='128' width='128' />		</div>
				<div class="elementor-post__text">
				<h3 class="elementor-post__title">
			<a href="${href}" >
				${title}			</a>
		</h3>
				<div class="elementor-post__excerpt">
					</div>

		<a class="elementor-post__read-more" href="${href}" aria-label="${labels.readMoreAria} ${title}" tabindex="-1" >
			${labels.readMore}		</a>

				</div>
					</div>
		</article>`;
}

function catalogueGrid(content, lang) {
  const labels = content.labels[lang];
  const trainings = content.trainings.filter((training) => training.status !== 'draft').sort((a, b) => a.order - b.order);
  const cards = trainings.map((training, index) => cardHtml(training, lang, labels, index === 0)).join('');
  const pagination = trainings.length > CARDS_PER_PAGE
    ? `<nav class="elementor-pagination" aria-label="Pagination">
			<span class="page-numbers prev">${labels.previous}</span>
<a class="page-numbers next" href="#">${labels.next}</a>		</nav>`
    : '';
  return `<!-- trainings:grid --><div class="elementor-posts-container elementor-posts elementor-posts--skin-cards elementor-grid" data-cards-per-page="${CARDS_PER_PAGE}" data-label-previous="${escapeAttribute(labels.previous)}" data-label-next="${escapeAttribute(labels.next)}">${cards}
				</div>
		${pagination}<!-- /trainings:grid -->`;
}

// The catalogue page keeps its exported markup; only the posts grid is regenerated, and the
// Ajax Search Pro settings form is moved where its script would put it (#wpdreams_asp_settings_1).
function updateCatalogue(content, lang) {
  const file = path.join(ROOT, lang === 'en' ? 'en' : '', 'training', 'index.html');
  let markup = fs.readFileSync(file, 'utf8');
  const grid = catalogueGrid(content, lang);
  if (markup.includes('<!-- trainings:grid -->')) {
    markup = markup.replace(/<!-- trainings:grid -->[\s\S]*?<!-- \/trainings:grid -->/, grid);
  } else {
    const start = markup.indexOf('<div class="elementor-posts-container');
    const navEnd = markup.indexOf('</nav>', start);
    if (start < 0 || navEnd < 0) throw new Error(`grille introuvable dans ${file}`);
    markup = markup.slice(0, start) + grid + markup.slice(navEnd + '</nav>'.length);
  }
  const original = markup.match(/<div id='__original__ajaxsearchprobsettings1_1'([\s\S]*?<\/form><\/div>)/);
  if (original && markup.includes("<div id='wpdreams_asp_settings_1'></div>")) {
    markup = markup.replace(original[0], '');
    const moved = `<div id="ajaxsearchprobsettings1_1"${original[1].replace(/^ class="/, ' style="display: block; visibility: visible; opacity: 1;" class="')}`;
    markup = markup.replace("<div id='wpdreams_asp_settings_1'></div>", `<div id='wpdreams_asp_settings_1'>${moved}</div>`);
  }
  fs.writeFileSync(file, markup);
}

function redirectPage(target) {
  return `<!doctype html>
<html lang="fr" data-training-redirect>
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, follow">
<title>Redirection</title>
<link rel="canonical" href="${SITE}/${target}">
<meta http-equiv="refresh" content="0; url=../../${target}">
<script>location.replace('../../${target}' + location.hash)</script>
</head>
<body><p><a href="../../${target}">${SITE}/${target}</a></p></body>
</html>
`;
}

// Pages this generator wrote earlier but that no longer match a training are removed; former
// addresses (previousSlugs, kept by the editor when a slug changes) redirect to the new page.
function tidyFolders(content) {
  for (const lang of ['fr', 'en']) {
    const base = path.join(ROOT, lang === 'en' ? 'en' : '', 'trainings');
    if (!fs.existsSync(base)) continue;
    const prefix = lang === 'en' ? 'en/' : '';
    const live = new Set(content.trainings.filter((item) => item.status !== 'draft').map((item) => item[lang]?.slug).filter(Boolean));
    const redirects = new Map();
    for (const item of content.trainings) {
      if (item.status === 'draft') continue;
      for (const old of item[lang]?.previousSlugs || []) if (old && !live.has(old)) redirects.set(old, item[lang].slug);
    }
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(base, entry.name, 'index.html');
      if (!fs.existsSync(file)) continue;
      const markup = fs.readFileSync(file, 'utf8');
      const generated = markup.includes('data-training="') || markup.includes('data-training-redirect');
      if (!generated || live.has(entry.name)) continue;
      if (redirects.has(entry.name)) continue;
      fs.rmSync(path.join(base, entry.name), { recursive: true, force: true });
    }
    for (const [old, target] of redirects) {
      fs.mkdirSync(path.join(base, old), { recursive: true });
      fs.writeFileSync(path.join(base, old, 'index.html'), redirectPage(`${prefix}trainings/${target}/`));
    }
  }
}

export function build({ today = new Date().toISOString().slice(0, 10), content = loadContent() } = {}) {
  content = withLabels(content);
  tidyFolders(content);
  const written = [];
  for (const training of content.trainings) {
    for (const lang of ['fr', 'en']) {
      if (!training[lang]?.slug) continue;
      const dir = path.join(ROOT, lang === 'en' ? 'en' : '', 'trainings', training[lang].slug);
      if (training.status === 'draft') continue;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), trainingPage(content, training, lang, today));
      written.push(path.relative(ROOT, dir));
    }
  }
  updateCatalogue(content, 'fr');
  updateCatalogue(content, 'en');
  // Same post-processing as the exported pages: stylesheets in WordPress order, rendered forms, etc.
  const pages = [...written.map((dir) => path.join(dir, 'index.html')), 'training/index.html', 'en/training/index.html'];
  execFileSync('python3', [path.join(ROOT, 'tools', 'export', 'components.py'), ...pages], { cwd: ROOT, stdio: 'ignore' });
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const written = build();
  console.log(`${written.length} fiches générées, catalogues FR et EN mis à jour`);
}
