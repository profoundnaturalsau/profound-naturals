/*
  Profound Naturals - Static Product Page Generator (SSG)
  ---------------------------------------------------------
  Reads the `products` array from index.html and generates:
    - products/<slug>.html   (one page per product, styled as the site modal)
    - sitemap.xml            (homepage + all product pages)
    - robots.txt             (points crawlers at the sitemap)

  Usage:  node generate-products.js
  Requires: Node 18+, no dependencies.

  Never edits index.html - read only.
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = 'https://profoundnaturals.com.au';
const TODAY = new Date().toISOString().slice(0, 10);

/* ── 1. Extract the products array from index.html ── */
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const marker = 'const products = [';
const startIdx = html.indexOf(marker);
if (startIdx === -1) throw new Error('products array not found in index.html');
let i = html.indexOf('[', startIdx), depth = 0, endIdx = -1;
for (let j = i; j < html.length; j++) {
  if (html[j] === '[') depth++;
  else if (html[j] === ']') { depth--; if (depth === 0) { endIdx = j; break; } }
}
const products = vm.runInNewContext('(' + html.slice(i, endIdx + 1) + ')');
console.log('Parsed ' + products.length + ' products from index.html');

/* ── 1b. SYNC GUARD - fail the build if the site and checkout disagree ──
   checkout.js charges prices from netlify/functions/products.json.
   If that file and the index.html array ever drift, customers would see
   one price and be charged another. This check makes that impossible
   to deploy. Skipped silently if products.json is not found. */
const jsonPath = ['netlify/functions/products.json', 'products.json']
  .map(p => path.join(__dirname, p)).find(fs.existsSync);
if (jsonPath) {
  const srv = {};
  JSON.parse(fs.readFileSync(jsonPath, 'utf8')).products
    .forEach(p => { srv[p.id] = p; });
  const errors = [];
  for (const p of products) {
    const s = srv[p.id];
    if (!s) { errors.push(`"${p.name}" (id ${p.id}) is on the site but missing from products.json - checkout will reject it`); continue; }
    if (s.name !== p.name) errors.push(`id ${p.id}: name differs - site "${p.name}" vs checkout "${s.name}"`);
    if (Math.abs(s.price - p.price) > 0.001) errors.push(`"${p.name}": site shows $${p.price} but checkout charges $${s.price}`);
    delete srv[p.id];
  }
  for (const id in srv) console.warn(`  ! note: "${srv[id].name}" (id ${id}) is in products.json but not in the site array (expected for size-twin ids like 75)`);
  if (errors.length) {
    console.error('\nSYNC ERRORS between index.html and ' + path.basename(jsonPath) + ':');
    errors.forEach(e => console.error('  ✗ ' + e));
    process.exit(1); // blocks the Netlify deploy so a price mismatch can never go live
  }
  console.log('Sync check passed - site prices match checkout prices (' + jsonPath.split(path.sep).slice(-2).join('/') + ')');
} else {
  console.log('Note: products.json not found - sync check skipped');
}

/* ── 2. Helpers ── */
const slugify = s => s.toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const truncate = (s, n) => { s = String(s || ''); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };

const slugs = new Set();
const pages = [];

/* ── 3. Page template - styled to match the site modal ── */
function renderPage(p) {
  let slug = slugify(p.name);
  while (slugs.has(slug)) slug += '-2';
  slugs.add(slug);

  const fullName = p.name + (p.size ? ' ' + p.size : '');
  const img = p.image ? SITE + '/' + p.image : SITE + '/images/pn-square.jpg';
  const url = SITE + '/products/' + slug + '.html';
  const metaDesc = truncate(p.desc || (fullName + ' - handcrafted botanical product by Profound Naturals. Australian made, no added synthetics, cruelty-free.'), 155);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: fullName,
    category: p.category || undefined,
    image: img,
    description: p.desc || metaDesc,
    brand: { '@type': 'Brand', name: 'Profound Naturals' },
    url: url,
    offers: {
      '@type': 'Offer',
      price: Number(p.price).toFixed(2),
      priceCurrency: 'AUD',
      availability: 'https://schema.org/InStock',
      url: url,
      seller: { '@type': 'Organization', name: 'Profound Naturals', url: SITE },
      // Fixes Search Console "Missing field" warnings for Merchant listings.
      // Values mirror the real /shipping-returns.html and /returns-refunds.html pages.
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: Number(p.price) >= 85 ? '0.00' : '8.95',
          currency: 'AUD'
        },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'AU'
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 7, unitCode: 'DAY' }
        }
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'AU',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 7,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnShippingFees',
        merchantReturnLink: SITE + '/returns-refunds.html'
      }
    }
  };

  const pageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(fullName)} | Profound Naturals</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/images/logo.png">
<meta property="og:type" content="product">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(fullName)} | Profound Naturals">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:image" content="${img}">
<meta property="og:locale" content="en_AU">
<meta property="og:site_name" content="Profound Naturals">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root{--bg:#080d09;--surface:#0f1610;--surface-2:#141d15;--white:#e6ece7;--white-dim:rgba(230,236,231,.6);
  --green:#8cc40f;--green-lt:#a0d916;--amber:#d4a017;--border:rgba(140,196,15,.22);
  --serif:'Cormorant Garamond',Georgia,serif;--sans:'Jost',sans-serif;}
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--white);font-family:var(--sans);min-height:100dvh;
  display:flex;align-items:safe center;justify-content:center;padding:16px}
  .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);cursor:pointer}
  .modal{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:14px;
  max-width:620px;width:100%;max-height:94dvh;overflow-y:auto;padding:34px 24px 24px;
  box-shadow:0 30px 80px rgba(0,0,0,.6);z-index:1}
  .close{position:absolute;top:10px;right:12px;background:none;border:none;color:var(--white-dim);
  font-size:24px;line-height:1;cursor:pointer;font-family:var(--sans);padding:8px;z-index:2}
  .close:hover{color:var(--green-lt)}
  .cat{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--green)}
  h1{font-family:'Cinzel',serif;font-weight:500;font-size:clamp(21px,4.5vw,27px);margin:6px 0 2px}
  .meta-row{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
  .size{color:var(--white-dim);font-size:13px}
  .badge{background:var(--green);color:#08130a;font-size:10px;font-weight:500;
  letter-spacing:.12em;text-transform:uppercase;padding:2px 9px;border-radius:20px}
  .top{display:grid;grid-template-columns:132px 1fr;gap:16px;align-items:start;margin-bottom:14px}
  img.product{width:100%;border-radius:10px;background:var(--surface-2)}
  .emoji-box{width:100%;aspect-ratio:1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:3.4rem;line-height:1}
  .buy{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:16px;background:var(--surface-2)}
  .price{font-family:'Cinzel',serif;font-size:22px;color:var(--green-lt)}
  .price span{font-size:12px;color:var(--white-dim)}
  .cta{background:var(--green);color:#08130a;text-decoration:none;font-weight:500;letter-spacing:.06em;
  padding:11px 20px;border-radius:8px;font-size:13px;text-transform:uppercase;white-space:nowrap}
  .cta:hover{background:var(--green-lt)}
  .desc{font-family:var(--serif);font-size:17px;font-weight:300;line-height:1.6;color:var(--white)}
  .desc.clamped{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
  .more{background:none;border:none;color:var(--green-lt);font-family:var(--sans);font-size:12px;
  letter-spacing:.14em;text-transform:uppercase;cursor:pointer;padding:8px 0 0;border-bottom:1px solid var(--green)}
  details{margin-top:16px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px}
  summary{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--amber);cursor:pointer;list-style:none}
  summary::after{content:' ▾';font-size:10px}
  details[open] summary::after{content:' ▴'}
  .ing{font-size:13px;line-height:1.6;color:var(--white-dim);padding-top:10px}
  .home{display:block;text-align:center;margin-top:18px;color:var(--white-dim);font-size:12px;
  text-decoration:none;letter-spacing:.08em}
  .home:hover{color:var(--green-lt)}
  @media(max-width:479px){
    .top{grid-template-columns:104px 1fr;gap:12px}
  }
</style>
</head>
<body>
<div class="backdrop" onclick="goBack()" aria-hidden="true"></div>
<main class="modal">
  <button class="close" onclick="goBack()" aria-label="Close">✕</button>
  <div class="cat">${esc(p.category || 'Profound Naturals')}</div>
  <h1>${esc(p.name)}</h1>
  <div class="meta-row">
    ${p.size ? '<span class="size">' + esc(p.size) + '</span>' : ''}
    ${p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : ''}
  </div>
  <div class="top">
    ${p.image ? '<img class="product" src="/' + esc(p.image) + '" alt="' + esc(fullName) + ' - Profound Naturals" width="300" height="300" loading="eager">' : '<div class="emoji-box" style="background:' + esc(p.bg || '#141d15') + '">' + esc(p.emoji || '') + '</div>'}
    <div class="buy">
      <div class="price">$${Number(p.price).toFixed(2)} <span>AUD</span></div>
      <a class="cta" href="/#shop">Shop Now</a>
    </div>
  </div>
  <p class="desc clamped" id="d">${esc(p.desc || '')}</p>
  <button class="more" id="m" onclick="var d=document.getElementById('d');d.classList.toggle('clamped');this.textContent=d.classList.contains('clamped')?'See more':'See less'" hidden>See more</button>
  ${p.ingredients ? '<details><summary>Ingredients</summary><p class="ing">' + esc(p.ingredients) + '</p></details>' : ''}
  <a class="home" href="/">Profound Naturals - Natural · Botanical · Handcrafted</a>
</main>
<script>
function goBack(){
  if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) {
    history.back();
  } else {
    location.href = '/#shop';
  }
}
// show the See more toggle only when the description actually overflows its clamp
(function(){
  var d = document.getElementById('d'), m = document.getElementById('m');
  if (d && m && d.scrollHeight > d.clientHeight + 2) m.hidden = false;
  else if (d) d.classList.remove('clamped');
})();
</script>
</body>
</html>`;

  return { slug, url, pageHtml };
}

/* ── 4. Generate ── */
const outDir = path.join(__dirname, 'products');
fs.mkdirSync(outDir, { recursive: true });
for (const p of products) {
  const page = renderPage(p);
  fs.writeFileSync(path.join(outDir, page.slug + '.html'), page.pageHtml);
  pages.push(page);
}
console.log('Wrote ' + pages.length + ' pages to /products');

/* ── 4b. INFO PAGES - extracted from the site's own modals at build time ──
   Single source of truth: edit the modal content in index.html, re-run this
   script, and the standalone page updates to match. */

function extractBalancedDiv(html, openTagStart) {
  // given index of a '<div', return [innerHTML, endIndex-after-close]
  const openEnd = html.indexOf('>', openTagStart) + 1;
  let depth = 1, i = openEnd;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = openEnd;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return [html.slice(openEnd, m.index), re.lastIndex];
  }
  throw new Error('Unbalanced div during extraction');
}

function extractModalBody(containerNeedle, bodyClass) {
  const ci = html.indexOf(containerNeedle);
  if (ci === -1) throw new Error('Container not found: ' + containerNeedle);
  const bi = html.indexOf('class="' + bodyClass + '"', ci);
  if (bi === -1) throw new Error('Body class not found: ' + bodyClass);
  const divStart = html.lastIndexOf('<div', bi);
  return extractBalancedDiv(html, divStart)[0];
}

const INFO_PAGES = [
  { slug: 'why-natural', label: 'Why Natural?', h1: 'Why <em>Natural?</em>',
    container: 'class="why-natural-modal"', bodyClass: 'why-natural-body',
    title: 'Why Natural? Synthetic Fragrance Concerns Explained',
    desc: 'Endocrine disruptors, phthalates, synthetic musks and the transparency problem - why Profound Naturals uses only natural botanical ingredients.' },
  { slug: 'baltic-amber', label: 'Baltic Amber', h1: 'Baltic Amber',
    container: 'class="baltic-amber-modal"', bodyClass: 'baltic-amber-body',
    title: 'Baltic Amber Essential Oil - History & Character',
    desc: 'Steam-distilled from fossilised tree resin millions of years old - the history and character of Baltic Amber, from the Amber Road to Chinese medicine.' },
  { slug: 'sustainability', label: 'Sustainability', h1: 'Sustainability',
    container: 'class="sustain-modal"', bodyClass: 'sustain-body',
    title: 'Sustainability - An Honest Commitment',
    desc: 'Recycled protective wrap, amber glass bottles, refillable inhalers and an honest account of what is not perfect yet at Profound Naturals.' },
  { slug: 'privacy-policy', label: 'Privacy Policy', h1: 'Privacy Policy',
    container: 'id="privacyModal"', bodyClass: 'policy-modal-body',
    title: 'Privacy Policy',
    desc: 'How Profound Naturals collects, uses and protects personal information under the Privacy Act 1988 and the Australian Privacy Principles.' },
  { slug: 'shipping-returns', label: 'Shipping & Returns', h1: 'Shipping &amp; Returns',
    container: 'id="shippingModal"', bodyClass: 'policy-modal-body',
    title: 'Shipping & Returns',
    desc: 'Standard $8.95 (free over $85), Express $13.95 (free over $180). Australia-wide via Australia Post, hand-packed and dispatched in 1-3 business days.' },
  { slug: 'returns-refunds', label: 'Returns & Refund Policy', h1: 'Returns &amp; Refund Policy',
    container: 'id="returnsModal"', bodyClass: 'policy-modal-body',
    title: 'Returns & Refund Policy',
    desc: 'Refunds and replacements under Australian Consumer Law - consumer guarantees, how to make a claim, and what is not covered.' },
  { slug: 'faq', label: 'FAQ', h1: 'Frequently Asked Questions',
    container: 'id="faqModal"', bodyClass: 'policy-modal-body',
    title: 'Frequently Asked Questions',
    desc: 'Dispatch and delivery times, returns, oil purity, natural ingredients, free samples and perfume-making workshops - answered.' },
  { slug: 'australian-native', label: 'Australian Native', h1: 'Australian Native Botanicals',
    container: 'class="au-native-modal"', bodyClass: 'au-native-modal-body',
    title: 'Australian Native Botanicals',
    desc: 'Plants native to Australia, grown and harvested on Country - ethically and sustainably sourced native botanicals at Profound Naturals.' },
];

function renderInfoPage(pg, bodyHtml) {
  const url = SITE + '/' + pg.slug + '.html';
  const ld = { '@context':'https://schema.org', '@type':'WebPage', name: pg.title,
    url: url, isPartOf: { '@id': SITE + '/#website' },
    publisher: { '@id': SITE + '/#org' }, inLanguage: 'en-AU' };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pg.title} | Profound Naturals</title>
<meta name="description" content="${esc(pg.desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/images/logo.png">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(pg.title)} | Profound Naturals">
<meta property="og:description" content="${esc(pg.desc)}">
<meta property="og:image" content="${SITE}/images/pn-square.jpg">
<meta property="og:locale" content="en_AU">
<meta property="og:site_name" content="Profound Naturals">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root{--bg:#080d09;--surface:#0f1610;--surface-2:#141d15;--white:#e6ece7;--white-dim:rgba(230,236,231,.65);
  --green:#8cc40f;--green-lt:#a0d916;--amber:#d4a017;--border:rgba(140,196,15,.22);
  --serif:'Cormorant Garamond',Georgia,serif;--sans:'Jost',sans-serif;}
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--white);font-family:var(--sans);min-height:100dvh;padding:28px 16px}
  .page{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:14px;
  max-width:780px;margin:0 auto;padding:44px 36px 36px;box-shadow:0 30px 80px rgba(0,0,0,.6)}
  .close{position:absolute;top:12px;right:14px;background:none;border:none;color:var(--white-dim);
  font-size:24px;line-height:1;cursor:pointer;font-family:var(--sans);padding:8px}
  .close:hover{color:var(--green-lt)}
  .brand{font-size:10px;letter-spacing:.25em;text-transform:uppercase;color:var(--green);margin-bottom:8px}
  h1{font-family:'Cinzel',serif;font-weight:500;font-size:clamp(24px,5vw,32px);margin-bottom:22px}
  h1 em{font-family:var(--serif);font-style:italic;color:var(--amber)}
  .body{font-size:.86rem;line-height:1.75;color:var(--white-dim);font-weight:300}
  .body h2,.body h3{font-family:'Cinzel',serif;font-weight:500;color:var(--amber);
  font-size:.95rem;letter-spacing:.04em;margin:26px 0 10px}
  .body p{margin-bottom:14px}
  .body ul{margin:0 0 14px 20px}
  .body li{margin-bottom:6px}
  .body strong{color:var(--white);font-weight:500}
  .body em{font-style:italic}
  .body img{max-width:100%;height:auto}
  .body a{color:var(--green-lt)}
  .home{display:block;text-align:center;margin-top:26px;color:var(--white-dim);font-size:12px;
  text-decoration:none;letter-spacing:.08em}
  .home:hover{color:var(--green-lt)}
  @media(max-width:600px){ .page{padding:36px 20px 26px} }
</style>
</head>
<body>
<main class="page">
  <button class="close" onclick="goBack()" aria-label="Close">✕</button>
  <div class="brand">Profound Naturals</div>
  <h1>${pg.h1}</h1>
  <div class="body">
${bodyHtml}
  </div>
  <a class="home" href="/">Profound Naturals - Natural · Botanical · Handcrafted</a>
</main>
<script>
function goBack(){
  if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) {
    history.back();
  } else {
    location.href = '/';
  }
}
</script>
</body>
</html>`;
}

const infoUrls = [];
for (const pg of INFO_PAGES) {
  const body = extractModalBody(pg.container, pg.bodyClass);
  fs.writeFileSync(path.join(__dirname, pg.slug + '.html'), renderInfoPage(pg, body));
  infoUrls.push(SITE + '/' + pg.slug + '.html');
}
// contact page - built directly (the contact modal is just links)
const contactBody = `
<p>Every enquiry lands directly with me - orders, custom scents, wholesale, workshops, or anything else.</p>
<h3>Email</h3>
<p><a href="mailto:hello@profoundnaturals.com.au"><strong>hello@profoundnaturals.com.au</strong></a><br>Typically answered within 1 business day.</p>
<h3>Instagram</h3>
<p><a href="https://www.instagram.com/profound.naturals" rel="me">@profound.naturals</a></p>
<h3>Location</h3>
<p>Canberra, ACT, Australia. Online store - shipping Australia-wide via Australia Post.</p>`;
fs.writeFileSync(path.join(__dirname, 'contact.html'),
  renderInfoPage({ slug:'contact', h1:'Get in Touch', title:'Contact',
    desc:'Contact Profound Naturals - email hello@profoundnaturals.com.au or reach out on Instagram @profound.naturals. Canberra, Australia.' }, contactBody));
infoUrls.push(SITE + '/contact.html');
console.log('Wrote ' + infoUrls.length + ' info pages');

/* ── 5. sitemap.xml + robots.txt ── */

/* JOURNAL URLS - scanned, not hardcoded.
   The journal is hand-built, not generated, so this script knew nothing
   about it and rebuilt sitemap.xml from products + info pages only. That
   silently deleted every /journal/ URL on each run (102 -> 81).
   Scanning the folder means adding a post needs no sitemap edit and no
   change here: drop the HTML in journal/, re-run, done. If the folder is
   absent (running outside the repo) it contributes nothing and the rest
   still works. journal/index.html maps to the directory URL /journal/. */
const journalUrls = (() => {
  const dir = path.join(__dirname, 'journal');
  if (!fs.existsSync(dir)) {
    console.log('Note: journal/ not found - no journal URLs added to sitemap');
    return [];
  }
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.html'))
    .sort()
    .map(f => f === 'index.html' ? SITE + '/journal/' : SITE + '/journal/' + f);
})();

const urls = [SITE + '/'].concat(pages.map(p => p.url)).concat(infoUrls).concat(journalUrls);
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => '  <url><loc>' + u + '</loc><lastmod>' + TODAY + '</lastmod></url>').join('\n') +
  '\n</urlset>\n';
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);
fs.writeFileSync(path.join(__dirname, 'robots.txt'),
  'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');
console.log('Wrote sitemap.xml (' + urls.length + ' URLs, incl ' + journalUrls.length + ' journal) and robots.txt');
