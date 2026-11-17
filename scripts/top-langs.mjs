// Generates dist/top-langs.svg: "Most Used Languages" across my repositories.
// Runs in GitHub Actions (see .github/workflows/profile.yml). No dependencies (Node 20+).
//
// Env:
//   GH_USER         GitHub username
//   GH_TOKEN        token used for the API calls
//   INCLUDE_PRIVATE "true" when GH_TOKEN is a personal token that can read private repos
//   EXCLUDE_REPOS   comma-separated repo names to skip
import { mkdir, writeFile } from "node:fs/promises";

const USER = process.env.GH_USER;
const TOKEN = process.env.GH_TOKEN;
const PRIVATE = process.env.INCLUDE_PRIVATE === "true";
const SKIP_REPOS = new Set((process.env.EXCLUDE_REPOS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
// Languages that only come from Flutter's generated desktop/iOS build files, or from tooling.
const SKIP_LANGS = new Set(["C++", "C", "CMake", "Swift", "Objective-C", "Ruby", "Kotlin", "Batchfile", "Shell", "PowerShell", "Dockerfile", "Makefile", "Procfile"]);
const COLORS = { Dart: "#00B4AB", TypeScript: "#3178C6", JavaScript: "#F1E05A", CSS: "#663399", HTML: "#E34C26", Python: "#3572A5", Java: "#B07219", SCSS: "#C6538C", PLpgSQL: "#336790", Vue: "#41B883" };

async function api(path) {
  const res = await fetch("https://api.github.com" + path, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "profile-top-langs", Authorization: `Bearer ${TOKEN}` }
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function listRepos() {
  const repos = [];
  for (let page = 1; page < 20; page++) {
    const path = PRIVATE
      ? `/user/repos?per_page=100&page=${page}&affiliation=owner&visibility=all`
      : `/users/${USER}/repos?per_page=100&page=${page}&type=owner`;
    const batch = await api(path);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((r) => !r.fork && !SKIP_REPOS.has(r.name.toLowerCase()));
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

function card(langs) {
  const W = 350, pad = 25, barY = 55, rowH = 25;
  const rows = Math.ceil(langs.length / 2), H = barY + 30 + rows * rowH + 10;
  let x = pad, bar = "";
  const barW = W - pad * 2;
  langs.forEach((l, i) => {
    const w = i === langs.length - 1 ? pad + barW - x : Math.max(2, (l.pct / 100) * barW);
    bar += `<rect x="${x.toFixed(2)}" y="${barY}" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`;
    x += w;
  });
  const items = langs.map((l, i) => {
    const cx = pad + (i % 2) * (barW / 2), cy = barY + 38 + Math.floor(i / 2) * rowH;
    return `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${l.color}"/><text x="${cx + 16}" y="${cy}" class="t">${esc(l.name)} <tspan class="m">${l.pct.toFixed(1)}%</tspan></text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Most used languages">
<style>.h{font:600 18px 'Segoe UI',Ubuntu,Sans-Serif;fill:#58A6FF}.t{font:400 12px 'Segoe UI',Ubuntu,Sans-Serif;fill:#C9D1D9}.m{fill:#8B949E}</style>
<rect x="0.5" y="0.5" rx="6" width="${W - 1}" height="${H - 1}" fill="#0D1117" stroke="#30363D"/>
<text x="${pad}" y="35" class="h">Most Used Languages</text>
<clipPath id="r"><rect x="${pad}" y="${barY}" width="${barW}" height="8" rx="4"/></clipPath><g clip-path="url(#r)">${bar}</g>
${items}
</svg>`;
}

const repos = await listRepos();
const totals = {};
for (const r of repos) {
  const langs = await api(`/repos/${r.owner.login}/${r.name}/languages`);
  for (const [name, bytes] of Object.entries(langs)) if (!SKIP_LANGS.has(name)) totals[name] = (totals[name] || 0) + bytes;
}
const sum = Object.values(totals).reduce((a, b) => a + b, 0);
if (!sum) throw new Error("No language data found.");
const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
const topSum = top.reduce((a, [, b]) => a + b, 0);
const langs = top.map(([name, bytes]) => ({ name, pct: (bytes / topSum) * 100, color: COLORS[name] || "#8B949E" }));

await mkdir("dist", { recursive: true });
await writeFile("dist/top-langs.svg", card(langs));
console.log(`${repos.length} repos (${PRIVATE ? "public + private" : "public only"}):`, langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", "));
