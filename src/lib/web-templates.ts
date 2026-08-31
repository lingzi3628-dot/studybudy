/**
 * web-templates.ts — Phase 54 (WebBuddy)
 *
 * Seed template library for the WebBuilderScreen. Each template is a small
 * multi-file static site the user can load instantly ("Start from template")
 * without waiting for the AI — and then edit or ask WebBuddy to customize.
 *
 * Design rules for templates:
 *   - Plain CSS (no external CDN) so the preview works offline and instantly
 *   - Mobile-first, CSS variables for theming
 *   - Vanilla JS only, small and readable (these teach by example)
 */

export type WebTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  files: Array<{ path: string; content: string; isEntry?: boolean }>;
};

const BASE_CSS = `:root {
  --primary: #6366f1;
  --primary-dark: #4f46e5;
  --bg: #ffffff;
  --text: #1f2937;
  --muted: #6b7280;
  --border: #e5e7eb;
  --radius: 12px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg); color: var(--text); line-height: 1.6;
}
.container { max-width: 1040px; margin: 0 auto; padding: 0 20px; }
.btn {
  display: inline-block; padding: 12px 24px; border-radius: 999px;
  background: var(--primary); color: #fff; text-decoration: none;
  font-weight: 600; border: none; cursor: pointer; font-size: 15px;
}
.btn:hover { background: var(--primary-dark); }
.btn-outline { background: transparent; color: var(--primary); border: 2px solid var(--primary); }
.btn-outline:hover { background: var(--primary); color: #fff; }
@media (min-width: 768px) { .container { padding: 0 32px; } }`;

export const WEB_TEMPLATES: WebTemplate[] = [
  {
    id: "landing",
    name: "SaaS Landing Page",
    description: "Hero, feature grid, testimonials, pricing teaser, and CTA — the classic startup landing.",
    emoji: "🚀",
    files: [
      {
        path: "index.html",
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YourProduct — Launch faster</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="nav">
    <div class="container nav-inner">
      <strong>YourProduct</strong>
      <nav><a href="#features">Features</a><a href="#pricing">Pricing</a></nav>
      <a class="btn" href="#cta">Get started</a>
    </div>
  </header>
  <section class="hero">
    <div class="container">
      <h1>Build something people love</h1>
      <p>YourProduct helps small teams ship faster — no setup, no credit card.</p>
      <a class="btn" href="#cta">Start free</a>
      <a class="btn btn-outline" href="#features">See features</a>
    </div>
  </section>
  <section id="features" class="features">
    <div class="container grid" id="featureGrid"></div>
  </section>
  <section id="cta" class="cta">
    <div class="container">
      <h2>Ready to launch?</h2>
      <button class="btn" id="signupBtn">Create your account</button>
      <p id="ctaMsg" aria-live="polite"></p>
    </div>
  </section>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: "styles.css",
        content: BASE_CSS + `
.nav { border-bottom: 1px solid var(--border); padding: 14px 0; position: sticky; top: 0; background: var(--bg); }
.nav-inner { display: flex; align-items: center; gap: 20px; }
.nav-inner nav { display: none; gap: 16px; flex: 1; }
.nav-inner a:not(.btn) { color: var(--muted); text-decoration: none; }
@media (min-width: 768px) { .nav-inner nav { display: flex; } }
.hero { padding: 72px 0; text-align: center; background: linear-gradient(180deg, #eef2ff, var(--bg)); }
.hero h1 { font-size: clamp(32px, 6vw, 56px); line-height: 1.15; margin-bottom: 12px; }
.hero p { color: var(--muted); max-width: 480px; margin: 0 auto 24px; }
.features { padding: 48px 0; }
.grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 640px) { .grid { grid-template-columns: repeat(3, 1fr); } }
.card { border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.card h3 { margin: 8px 0 4px; }
.card p { color: var(--muted); font-size: 14px; }
.cta { text-align: center; padding: 64px 0; background: #f9fafb; }
.cta p { margin-top: 12px; color: var(--primary-dark); font-weight: 600; }`,
      },
      {
        path: "app.js",
        content: `const features = [
  { icon: "⚡", title: "Instant setup", text: "Be running in under a minute — zero config." },
  { icon: "🔒", title: "Secure by default", text: "Encryption and backups handled for you." },
  { icon: "📈", title: "Scales with you", text: "From side project to thousands of users." },
];
document.getElementById("featureGrid").innerHTML = features
  .map(f => '<div class="card"><div style="font-size:28px">' + f.icon + '</div><h3>' + f.title + '</h3><p>' + f.text + '</p></div>')
  .join("");
document.getElementById("signupBtn").addEventListener("click", function () {
  document.getElementById("ctaMsg").textContent = "🎉 Demo only — hook this button up to your real signup!";
});`,
      },
    ],
  },
  {
    id: "portfolio",
    name: "Portfolio",
    description: "Personal site with bio, three project cards, and a contact section.",
    emoji: "💼",
    files: [
      {
        path: "index.html",
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alex Dev — Portfolio</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="container">
    <section class="intro">
      <div class="avatar">A</div>
      <div>
        <h1>Alex Dev</h1>
        <p>Frontend developer crafting fast, accessible interfaces. Currently open to freelance work.</p>
        <a class="btn" href="#work">See my work</a>
      </div>
    </section>
    <section id="work">
      <h2>Selected projects</h2>
      <div class="grid" id="projects"></div>
    </section>
    <section class="contact">
      <h2>Contact</h2>
      <p>Want to work together? <a href="mailto:hello@example.com">hello@example.com</a></p>
    </section>
  </main>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: "styles.css",
        content: BASE_CSS + `
.intro { display: flex; gap: 20px; align-items: center; padding: 56px 0 32px; flex-direction: column; text-align: center; }
@media (min-width: 640px) { .intro { flex-direction: row; text-align: left; } }
.avatar { width: 84px; height: 84px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), #a855f7);
  color: #fff; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 800; flex-shrink: 0; }
h2 { margin: 32px 0 16px; }
.grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
@media (min-width: 640px) { .grid { grid-template-columns: repeat(3, 1fr); } }
.card { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.card .thumb { height: 110px; background: linear-gradient(135deg, #c7d2fe, #fbcfe8); }
.card .body { padding: 14px; }
.card p { color: var(--muted); font-size: 14px; margin-top: 4px; }
.contact { padding: 40px 0 64px; }`,
      },
      {
        path: "app.js",
        content: `const projects = [
  { name: "Weather PWA", text: "Offline-first forecast app with push alerts." },
  { name: "Quiz Engine", text: "Adaptive quiz platform used by 3 schools." },
  { name: "Chart Kit", text: "Tiny SVG charting library (4kb gzipped)." },
];
document.getElementById("projects").innerHTML = projects
  .map(p => '<div class="card"><div class="thumb"></div><div class="body"><strong>' + p.name + '</strong><p>' + p.text + '</p></div></div>')
  .join("");`,
      },
    ],
  },
  {
    id: "blog",
    name: "Blog",
    description: "Minimal blog index with post list, tags, and readable typography.",
    emoji: "📰",
    files: [
      {
        path: "index.html",
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Blog</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="container">
    <header><h1>Notes & ideas</h1><p class="sub">Short posts about code and learning.</p></header>
    <div id="tagBar" class="tags"></div>
    <div id="postList"></div>
  </main>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: "styles.css",
        content: BASE_CSS + `
main { max-width: 680px; }
header { padding: 48px 0 8px; }
.sub { color: var(--muted); }
.tags { display: flex; gap: 8px; flex-wrap: wrap; padding: 16px 0; }
.tag { border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: 12px;
  cursor: pointer; background: none; color: var(--muted); }
.tag.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.post { padding: 20px 0; border-bottom: 1px solid var(--border); }
.post h2 { font-size: 20px; margin-bottom: 4px; }
.post .meta { color: var(--muted); font-size: 13px; }`,
      },
      {
        path: "app.js",
        content: `const posts = [
  { title: "Learning in public, week 3", tag: "learning", date: "Aug 12", text: "What shipping tiny demos taught me about consistency." },
  { title: "CSS grid vs flexbox in 2 minutes", tag: "css", date: "Aug 5", text: "A quick mental model for choosing the right layout tool." },
  { title: "My 30-day coding streak", tag: "learning", date: "Jul 28", text: "Small daily wins compound — here is the system I used." },
];
var activeTag = "all";
function render() {
  var list = posts.filter(function (p) { return activeTag === "all" || p.tag === activeTag; });
  document.getElementById("postList").innerHTML = list.map(function (p) {
    return '<article class="post"><h2>' + p.title + '</h2><p class="meta">' + p.date + " · " + p.tag + '</p><p>' + p.text + '</p></article>';
  }).join("") || '<p class="sub">No posts with this tag yet.</p>';
}
var tags = ["all"].concat(posts.map(function (p) { return p.tag; }).filter(function (t, i, a) { return a.indexOf(t) === i; }));
document.getElementById("tagBar").innerHTML = tags.map(function (t) {
  return '<button class="tag' + (t === activeTag ? " active" : "") + '" data-tag="' + t + '">' + t + '</button>';
}).join("");
document.getElementById("tagBar").addEventListener("click", function (e) {
  var btn = e.target.closest("[data-tag]");
  if (!btn) return;
  activeTag = btn.getAttribute("data-tag");
  document.querySelectorAll(".tag").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tag") === activeTag); });
  render();
});
render();`,
      },
    ],
  },
  {
    id: "dashboard",
    name: "Stats Dashboard",
    description: "Four stat cards, an SVG line chart, and an activity table.",
    emoji: "📊",
    files: [
      {
        path: "index.html",
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <h1>Overview</h1>
    <div class="stats" id="stats"></div>
    <div class="panel">
      <h2>This week</h2>
      <svg id="chart" viewBox="0 0 320 120" role="img" aria-label="Weekly line chart"></svg>
    </div>
    <div class="panel">
      <h2>Recent activity</h2>
      <table><thead><tr><th>When</th><th>Event</th><th>Value</th></tr></thead>
      <tbody id="rows"></tbody></table>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: "styles.css",
        content: BASE_CSS + `
body { background: #f3f4f6; }
.container { padding: 24px 20px 64px; }
h1 { margin-bottom: 16px; }
.stats { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); margin-bottom: 16px; }
@media (min-width: 768px) { .stats { grid-template-columns: repeat(4, 1fr); } }
.stat { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
.stat .k { color: var(--muted); font-size: 12px; }
.stat .v { font-size: 26px; font-weight: 800; }
.stat .d { font-size: 12px; color: #059669; font-weight: 600; }
.panel { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; }
.panel h2 { font-size: 15px; margin-bottom: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; color: var(--muted); font-weight: 600; padding: 6px 4px; border-bottom: 1px solid var(--border); }
td { padding: 8px 4px; border-bottom: 1px solid #f3f4f6; }`,
      },
      {
        path: "app.js",
        content: `var stats = [
  { k: "Users", v: "1,284", d: "+12%" },
  { k: "Sessions", v: "8,930", d: "+4%" },
  { k: "Revenue", v: "$3.1k", d: "+18%" },
  { k: "Churn", v: "2.1%", d: "-0.4%" },
];
document.getElementById("stats").innerHTML = stats.map(function (s) {
  return '<div class="stat"><div class="k">' + s.k + '</div><div class="v">' + s.v + '</div><div class="d">' + s.d + ' vs last week</div></div>';
}).join("");
var points = [42, 58, 50, 74, 66, 88, 95];
var w = 320, h = 120, max = 100;
var path = points.map(function (p, i) {
  var x = (i / (points.length - 1)) * (w - 20) + 10;
  var y = h - 10 - (p / max) * (h - 30);
  return (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
}).join(" ");
document.getElementById("chart").innerHTML =
  '<path d="' + path + '" fill="none" stroke="#6366f1" stroke-width="3" stroke-linecap="round"/>' +
  points.map(function (p, i) {
    var x = (i / (points.length - 1)) * (w - 20) + 10;
    var y = h - 10 - (p / max) * (h - 30);
    return '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="#6366f1"/>';
  }).join("");
var rows = [["Mon", "Signups", "31"], ["Tue", "Payments", "7"], ["Wed", "Refunds", "1"], ["Thu", "Signups", "44"], ["Fri", "Payments", "12"]];
document.getElementById("rows").innerHTML = rows.map(function (r) {
  return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>";
}).join("");`,
      },
    ],
  },
  {
    id: "pricing",
    name: "Pricing Page",
    description: "Dark-mode pricing page with three tiers and a monthly/yearly toggle.",
    emoji: "🎨",
    files: [
      {
        path: "index.html",
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pricing</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="container">
    <h1>Simple pricing</h1>
    <button id="billingToggle" class="btn btn-outline" aria-pressed="false">Show yearly (save 20%)</button>
    <div class="tiers" id="tiers"></div>
  </main>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: "styles.css",
        content: `:root { --primary:#8b5cf6; --bg:#0f172a; --card:#1e293b; --text:#e2e8f0; --muted:#94a3b8; --radius:14px; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: system-ui, sans-serif; background:var(--bg); color:var(--text); line-height:1.6; }
.container { max-width: 960px; margin: 0 auto; padding: 56px 20px; text-align: center; }
h1 { margin-bottom: 16px; }
.btn { padding: 10px 20px; border-radius: 999px; background: var(--primary); color:#fff; border:none; cursor:pointer; font-weight:600; }
.btn-outline { background: transparent; color: var(--primary); border: 2px solid var(--primary); }
.tiers { display:grid; gap:16px; grid-template-columns:1fr; margin-top:32px; }
@media (min-width: 768px) { .tiers { grid-template-columns: repeat(3, 1fr); } }
.tier { background: var(--card); border:1px solid #334155; border-radius:var(--radius); padding:24px; text-align:left; }
.tier.featured { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
.tier h2 { font-size:16px; color:var(--muted); }
.price { font-size:38px; font-weight:800; margin:6px 0 16px; }
.price span { font-size:14px; color:var(--muted); font-weight:400; }
.tier ul { list-style:none; margin: 0 0 20px; }
.tier li { padding: 5px 0; color: var(--muted); }
.tier li::before { content:"✓ "; color: var(--primary); font-weight:700; }
.tier .btn { width: 100%; }
.badge { background: var(--primary); color:#fff; font-size:11px; padding:2px 10px; border-radius:999px; margin-left:6px; }`,
      },
      {
        path: "app.js",
        content: `var yearly = false;
var tiers = [
  { name: "Starter", m: 0, y: 0, feats: ["1 project", "Community support"], featured: false },
  { name: "Pro", m: 12, y: 115, feats: ["Unlimited projects", "Priority support", "Custom domains"], featured: true },
  { name: "Team", m: 39, y: 374, feats: ["Everything in Pro", "5 seats", "SSO + audit log"], featured: false },
];
function render() {
  document.getElementById("tiers").innerHTML = tiers.map(function (t) {
    var price = yearly ? t.y : t.m;
    var per = price === 0 ? "" : yearly ? "/year" : "/month";
    return '<div class="tier' + (t.featured ? " featured" : "") + '"><h2>' + t.name + (t.featured ? '<span class="badge">Popular</span>' : "") +
      '</h2><div class="price">' + (price === 0 ? "Free" : "$" + price) + "<span>" + per + '</span></div><ul>' +
      t.feats.map(function (f) { return "<li>" + f + "</li>"; }).join("") +
      '</ul><button class="btn">Choose ' + t.name + "</button></div>";
  }).join("");
}
document.getElementById("billingToggle").addEventListener("click", function () {
  yearly = !yearly;
  this.textContent = yearly ? "Show monthly" : "Show yearly (save 20%)";
  this.setAttribute("aria-pressed", String(yearly));
  render();
});
render();`,
      },
    ],
  },
  {
    id: "product",
    name: "Product Page",
    description: "E-commerce product page with image, variants, and a buy button.",
    emoji: "🛒",
    files: [
      {
        path: "index.html",
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AeroHead Pro — Buy</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="container">
    <div class="photo" id="photo">🎧</div>
    <div class="info">
      <h1>AeroHead Pro</h1>
      <p class="rating">★★★★★ <span>(312 reviews)</span></p>
      <p class="price" id="price">$199</p>
      <p class="desc">Wireless over-ear headphones with 40h battery, active noise cancelling, and a hard travel case.</p>
      <p class="label">Color</p>
      <div class="variants" id="variants"></div>
      <button class="btn" id="buyBtn">Add to cart</button>
      <p id="buyMsg" aria-live="polite"></p>
    </div>
  </main>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: "styles.css",
        content: BASE_CSS + `
.container { display: grid; gap: 24px; padding: 40px 20px 64px; grid-template-columns: 1fr; }
@media (min-width: 768px) { .container { grid-template-columns: 1fr 1fr; align-items: center; } }
.photo { background: linear-gradient(135deg, #e0e7ff, #fce7f3); border-radius: 20px;
  display: flex; align-items: center; justify-content: center; font-size: 96px; min-height: 280px; transition: transform .2s; }
.photo:hover { transform: scale(1.02); }
.rating { color: #f59e0b; margin: 6px 0; }
.rating span { color: var(--muted); font-size: 14px; }
.price { font-size: 32px; font-weight: 800; }
.desc { color: var(--muted); margin: 10px 0 16px; }
.label { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.variants { display: flex; gap: 10px; margin-bottom: 20px; }
.variant { width: 38px; height: 38px; border-radius: 50%; border: 2px solid var(--border); cursor: pointer; }
.variant.active { border-color: var(--primary); box-shadow: 0 0 0 2px #c7d2fe; }
#buyMsg { margin-top: 10px; color: #059669; font-weight: 600; }`,
      },
      {
        path: "app.js",
        content: `var colors = [
  { name: "Midnight", css: "#111827", price: 199 },
  { name: "Cloud", css: "#e5e7eb", price: 199 },
  { name: "Sunset", css: "#fb923c", price: 219 },
];
var active = 0;
function render() {
  document.getElementById("variants").innerHTML = colors.map(function (c, i) {
    return '<button class="variant' + (i === active ? " active" : "") + '" style="background:' + c.css + '" data-i="' + i + '" aria-label="' + c.name + '"></button>';
  }).join("");
  document.getElementById("price").textContent = "$" + colors[active].price;
}
document.getElementById("variants").addEventListener("click", function (e) {
  var b = e.target.closest("[data-i]");
  if (!b) return;
  active = Number(b.getAttribute("data-i"));
  render();
});
document.getElementById("buyBtn").addEventListener("click", function () {
  document.getElementById("buyMsg").textContent = "Added " + colors[active].name + " AeroHead Pro to cart (demo).";
});
render();`,
      },
    ],
  },
  {
    id: "school",
    name: "School Homepage",
    description: "School site with hero, three program cards, and an announcement banner.",
    emoji: "🏫",
    files: [
      {
        path: "index.html",
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Greenfield Academy</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="banner" id="banner">📢 Term 3 opening dates are out — <a href="#">read the notice</a></div>
  <header class="hero">
    <div class="container">
      <h1>Greenfield Academy</h1>
      <p>Curiosity, character, community — CBC-aligned learning from Grade 1 to Grade 9.</p>
      <a class="btn" href="#programs">Explore programs</a>
    </div>
  </header>
  <section id="programs" class="programs">
    <div class="container grid" id="cards"></div>
  </section>
  <footer><div class="container"><p>© 2026 Greenfield Academy · Nairobi, Kenya</p></div></footer>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: "styles.css",
        content: BASE_CSS + `
:root { --primary: #059669; --primary-dark: #047857; }
.banner { background: #fef3c7; padding: 10px 20px; text-align: center; font-size: 14px; }
.banner a { color: var(--primary-dark); font-weight: 600; }
.hero { background: linear-gradient(160deg, #065f46, #059669); color: #fff; text-align: center; padding: 72px 0; }
.hero h1 { font-size: clamp(30px, 5vw, 48px); margin-bottom: 10px; }
.hero .btn { background: #fff; color: var(--primary-dark); margin-top: 16px; }
.programs { padding: 48px 0 64px; }
.grid { display: grid; gap: 16px; grid-template-columns: 1fr; margin-top: 20px; }
@media (min-width: 640px) { .grid { grid-template-columns: repeat(3, 1fr); } }
.card { border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.card h3 { color: var(--primary-dark); margin-bottom: 6px; }
.card p { color: var(--muted); font-size: 14px; }
footer { border-top: 1px solid var(--border); padding: 20px 0; color: var(--muted); font-size: 13px; }`,
      },
      {
        path: "app.js",
        content: `var programs = [
  { icon: "🔢", name: "STEM Track", text: "Hands-on maths and science with weekly lab sessions." },
  { icon: "📖", name: "Languages", text: "English, Kiswahili and French with reading clinics." },
  { icon: "⚽", name: "Sports & Arts", text: "Football, athletics, music and drama every term." },
];
document.getElementById("cards").innerHTML = programs.map(function (p) {
  return '<div class="card"><div style="font-size:26px">' + p.icon + '</div><h3>' + p.name + '</h3><p>' + p.text + '</p></div>';
}).join("");`,
      },
    ],
  },
  {
    id: "newsletter",
    name: "Newsletter Signup",
    description: "Focused signup page with email validation and success state.",
    emoji: "📧",
    files: [
      {
        path: "index.html",
        isEntry: true,
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join the newsletter</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="card">
    <div class="emoji">📬</div>
    <h1>The Weekly Byte</h1>
    <p>One practical coding tip every Friday. Free, no spam, unsubscribe anytime.</p>
    <form id="form" novalidate>
      <input type="email" id="email" placeholder="you@example.com" aria-label="Email address" required>
      <button class="btn" type="submit">Subscribe</button>
    </form>
    <p id="msg" aria-live="polite"></p>
  </main>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: "styles.css",
        content: BASE_CSS + `
body { display: flex; align-items: center; justify-content: center; min-height: 100vh;
  background: linear-gradient(160deg, #eef2ff, #fdf2f8); }
.card { background: #fff; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,.08);
  padding: 40px 32px; max-width: 420px; text-align: center; margin: 20px; }
.emoji { font-size: 44px; }
h1 { margin: 8px 0; }
.card p { color: var(--muted); }
form { display: flex; gap: 8px; margin: 20px 0 8px; flex-direction: column; }
@media (min-width: 480px) { form { flex-direction: row; } }
input { flex: 1; padding: 12px 16px; border-radius: 999px; border: 1px solid var(--border); font-size: 15px; outline: none; }
input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px #e0e7ff; }
#msg { font-weight: 600; min-height: 24px; }
#msg.ok { color: #059669; }
#msg.err { color: #dc2626; }`,
      },
      {
        path: "app.js",
        content: `document.getElementById("form").addEventListener("submit", function (e) {
  e.preventDefault();
  var input = document.getElementById("email");
  var msg = document.getElementById("msg");
  var value = input.value.trim();
  var valid = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(value);
  msg.className = valid ? "ok" : "err";
  if (!valid) { msg.textContent = "Please enter a valid email address."; return; }
  msg.textContent = "🎉 Subscribed! Check your inbox for a confirmation.";
  input.value = "";
});`,
      },
    ],
  },
];

export function getTemplate(id: string): WebTemplate | undefined {
  return WEB_TEMPLATES.find((t) => t.id === id);
}
