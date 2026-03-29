/**
 * Default starter files loaded when a new Build workspace opens.
 * Dog-walker landing page so agents have something to start with.
 */

export interface WorkspaceFile {
  name: string;
  language: string;
  content: string;
}

export const DEFAULT_FILES: WorkspaceFile[] = [
  {
    name: 'index.html',
    language: 'html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PawPal — Professional Dog Walking</title>
  <link rel="stylesheet" href="style.css" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 font-sans">

  <!-- NAV -->
  <nav class="bg-white shadow-sm sticky top-0 z-50">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-2xl">🐾</span>
        <span class="text-xl font-bold text-amber-700">PawPal</span>
      </div>
      <div class="hidden md:flex items-center gap-8 text-sm text-gray-600">
        <a href="#services" class="hover:text-amber-700 transition">Services</a>
        <a href="#why" class="hover:text-amber-700 transition">Why Us</a>
        <a href="#pricing" class="hover:text-amber-700 transition">Pricing</a>
        <a href="#contact" class="hover:text-amber-700 transition">Contact</a>
      </div>
      <a href="#book" class="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-full text-sm font-semibold transition">
        Book Now
      </a>
    </div>
  </nav>

  <!-- HERO -->
  <section class="hero-bg text-white py-24 px-6 text-center">
    <div class="max-w-3xl mx-auto">
      <div class="text-6xl mb-4">🐕</div>
      <h1 class="text-4xl md:text-5xl font-extrabold mb-4">Your Dog Deserves the Best Walks</h1>
      <p class="text-lg md:text-xl text-amber-100 mb-8">
        Certified, insured, GPS-tracked walks — every single time. Your pup comes home happy and tired.
      </p>
      <a href="#book" class="inline-block bg-white text-amber-800 px-8 py-3 rounded-full font-bold text-lg shadow-lg hover:bg-amber-50 transition">
        Book Your First Walk →
      </a>
    </div>
  </section>

  <!-- SERVICES -->
  <section id="services" class="py-20 px-6 bg-white">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-3xl font-bold text-center text-gray-800 mb-12">Our Services</h2>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="service-card p-6 rounded-2xl border border-amber-100 shadow-sm hover:shadow-md transition">
          <div class="text-4xl mb-4">🚶</div>
          <h3 class="text-xl font-bold text-gray-800 mb-2">Daily Walks</h3>
          <p class="text-gray-500">30 or 60-minute walks on your schedule. Solo or small groups of 3.</p>
        </div>
        <div class="service-card p-6 rounded-2xl border border-amber-100 shadow-sm hover:shadow-md transition">
          <div class="text-4xl mb-4">🏠</div>
          <h3 class="text-xl font-bold text-gray-800 mb-2">Home Visits</h3>
          <p class="text-gray-500">Feeding, playtime, and bathroom breaks while you're at work.</p>
        </div>
        <div class="service-card p-6 rounded-2xl border border-amber-100 shadow-sm hover:shadow-md transition">
          <div class="text-4xl mb-4">🛏️</div>
          <h3 class="text-xl font-bold text-gray-800 mb-2">Overnight Boarding</h3>
          <p class="text-gray-500">Your dog sleeps at our sitter's home — not a kennel.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- WHY US -->
  <section id="why" class="py-20 px-6 bg-amber-50">
    <div class="max-w-4xl mx-auto text-center">
      <h2 class="text-3xl font-bold text-gray-800 mb-12">Why Dog Owners Trust PawPal</h2>
      <div class="grid md:grid-cols-2 gap-6 text-left">
        <div class="flex items-start gap-4 bg-white p-5 rounded-2xl shadow-sm">
          <span class="text-2xl mt-1">📍</span>
          <div>
            <h4 class="font-bold text-gray-800 mb-1">GPS Tracking</h4>
            <p class="text-sm text-gray-500">Watch the walk live. Get a report with photos after every session.</p>
          </div>
        </div>
        <div class="flex items-start gap-4 bg-white p-5 rounded-2xl shadow-sm">
          <span class="text-2xl mt-1">✅</span>
          <div>
            <h4 class="font-bold text-gray-800 mb-1">Fully Insured</h4>
            <p class="text-sm text-gray-500">All walkers are background-checked, certified, and insured.</p>
          </div>
        </div>
        <div class="flex items-start gap-4 bg-white p-5 rounded-2xl shadow-sm">
          <span class="text-2xl mt-1">⭐</span>
          <div>
            <h4 class="font-bold text-gray-800 mb-1">5-Star Reviews</h4>
            <p class="text-sm text-gray-500">2,400+ five-star reviews from dog owners in your neighborhood.</p>
          </div>
        </div>
        <div class="flex items-start gap-4 bg-white p-5 rounded-2xl shadow-sm">
          <span class="text-2xl mt-1">💬</span>
          <div>
            <h4 class="font-bold text-gray-800 mb-1">24/7 Support</h4>
            <p class="text-sm text-gray-500">Questions at midnight? We're awake. Text, call, or chat.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- PRICING -->
  <section id="pricing" class="py-20 px-6 bg-white">
    <div class="max-w-4xl mx-auto">
      <h2 class="text-3xl font-bold text-center text-gray-800 mb-12">Simple Pricing</h2>
      <div class="grid md:grid-cols-3 gap-6">
        <div class="border-2 border-gray-200 rounded-2xl p-6 text-center">
          <h3 class="font-bold text-gray-700 mb-2">30-Min Walk</h3>
          <div class="text-4xl font-extrabold text-amber-700 mb-4">$20</div>
          <ul class="text-sm text-gray-500 space-y-2 mb-6">
            <li>Solo walk</li>
            <li>GPS tracking</li>
            <li>Photo report</li>
          </ul>
          <a href="#book" class="block bg-amber-100 text-amber-800 rounded-full py-2 font-semibold text-sm hover:bg-amber-200 transition">Book Now</a>
        </div>
        <div class="border-2 border-amber-500 rounded-2xl p-6 text-center relative">
          <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs px-3 py-1 rounded-full font-bold">Most Popular</div>
          <h3 class="font-bold text-gray-700 mb-2">60-Min Walk</h3>
          <div class="text-4xl font-extrabold text-amber-700 mb-4">$35</div>
          <ul class="text-sm text-gray-500 space-y-2 mb-6">
            <li>Solo walk</li>
            <li>GPS tracking</li>
            <li>Photo report</li>
            <li>Off-leash park time</li>
          </ul>
          <a href="#book" class="block bg-amber-600 text-white rounded-full py-2 font-semibold text-sm hover:bg-amber-700 transition">Book Now</a>
        </div>
        <div class="border-2 border-gray-200 rounded-2xl p-6 text-center">
          <h3 class="font-bold text-gray-700 mb-2">Monthly Plan</h3>
          <div class="text-4xl font-extrabold text-amber-700 mb-4">$250</div>
          <ul class="text-sm text-gray-500 space-y-2 mb-6">
            <li>10 walks/month</li>
            <li>Priority scheduling</li>
            <li>Free meet &amp; greet</li>
            <li>Dedicated walker</li>
          </ul>
          <a href="#book" class="block bg-amber-100 text-amber-800 rounded-full py-2 font-semibold text-sm hover:bg-amber-200 transition">Get Started</a>
        </div>
      </div>
    </div>
  </section>

  <!-- BOOKING CTA -->
  <section id="book" class="py-20 px-6 bg-amber-700 text-white text-center">
    <div class="max-w-xl mx-auto">
      <h2 class="text-3xl font-bold mb-4">Book Your First Walk Today</h2>
      <p class="text-amber-100 mb-8">No commitment. Cancel any time. First walk is 20% off.</p>
      <form id="bookForm" class="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto" onsubmit="handleBook(event)">
        <input type="email" id="emailInput" placeholder="your@email.com"
          class="flex-1 px-4 py-3 rounded-full text-gray-800 focus:outline-none focus:ring-2 focus:ring-white" />
        <button type="submit" class="bg-white text-amber-800 font-bold px-6 py-3 rounded-full hover:bg-amber-50 transition">
          Get Started
        </button>
      </form>
      <div id="bookConfirm" class="hidden mt-4 text-amber-100 font-semibold">
        🎉 You're on the list! We'll reach out within 24 hours.
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="bg-gray-900 text-gray-400 py-8 px-6 text-center text-sm">
    <div class="flex items-center justify-center gap-2 mb-3">
      <span class="text-lg">🐾</span>
      <span class="text-white font-bold">PawPal</span>
    </div>
    <p>© 2026 PawPal Dog Walking. All rights reserved.</p>
    <div class="flex justify-center gap-6 mt-3">
      <a href="#" class="hover:text-white transition">Privacy</a>
      <a href="#" class="hover:text-white transition">Terms</a>
      <a href="#" class="hover:text-white transition">Instagram</a>
    </div>
  </footer>

  <script src="script.js"></script>
</body>
</html>`,
  },
  {
    name: 'style.css',
    language: 'css',
    content: `/* PawPal Dog Walking — Custom Styles */

* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Hero gradient background */
.hero-bg {
  background: linear-gradient(135deg, #92400e 0%, #b45309 50%, #d97706 100%);
}

/* Service cards subtle hover */
.service-card {
  background: #fffbf5;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.service-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
}

/* Smooth scrolling */
html {
  scroll-behavior: smooth;
}

/* Focus visible styles */
a:focus-visible,
button:focus-visible,
input:focus-visible {
  outline: 3px solid #f59e0b;
  outline-offset: 2px;
  border-radius: 4px;
}`,
  },
  {
    name: 'script.js',
    language: 'javascript',
    content: `// PawPal Dog Walking — Page Interactions

// Booking form handler
function handleBook(event) {
  event.preventDefault();
  const email = document.getElementById('emailInput').value.trim();
  if (!email || !email.includes('@')) {
    alert('Please enter a valid email address.');
    return;
  }
  document.getElementById('bookForm').classList.add('hidden');
  document.getElementById('bookConfirm').classList.remove('hidden');
  console.log('Booking email captured:', email);
}

// Smooth nav link scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const targetId = this.getAttribute('href').slice(1);
    const target = document.getElementById(targetId);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Animate elements into view as user scrolls
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.service-card').forEach(card => {
  card.style.opacity = '0';
  card.style.transform = 'translateY(16px)';
  card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
  observer.observe(card);
});`,
  },
];

export function getLanguage(filename: string): string {
  if (filename.endsWith('.html')) return 'html';
  if (filename.endsWith('.css')) return 'css';
  if (filename.endsWith('.js')) return 'javascript';
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.md')) return 'markdown';
  if (filename.endsWith('.py')) return 'python';
  return 'plaintext';
}

/**
 * Console bridge script injected into every preview document.
 * Intercepts console.log/warn/error and window runtime errors,
 * then relays them to the parent frame via postMessage.
 * Injected before </head> so it is always present regardless of
 * what the user code does.
 */
const CONSOLE_BRIDGE_SCRIPT = `<script>
(function() {
  var _start = Date.now();
  function _relay(level, args) {
    try {
      var serialized = Array.prototype.slice.call(args).map(function(a) {
        if (a === null) return 'null';
        if (a === undefined) return 'undefined';
        if (typeof a === 'object') {
          try { return JSON.stringify(a, null, 0); } catch(e) { return String(a); }
        }
        return String(a);
      });
      window.parent.postMessage({
        type: 'console',
        level: level,
        args: serialized,
        ts: Date.now() - _start
      }, '*');
    } catch(e) {}
  }
  var _log = console.log.bind(console);
  var _warn = console.warn.bind(console);
  var _error = console.error.bind(console);
  console.log = function() { _log.apply(console, arguments); _relay('log', arguments); };
  console.warn = function() { _warn.apply(console, arguments); _relay('warn', arguments); };
  console.error = function() { _error.apply(console, arguments); _relay('error', arguments); };
  window.addEventListener('error', function(e) {
    var msg = e.message || 'Unknown error';
    var loc = (e.filename ? e.filename.replace(/^.*[\\/]/, '') : '') + (e.lineno ? ':' + e.lineno : '');
    _relay('error', [msg + (loc ? ' (' + loc + ')' : '')]);
  });
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    var msg = reason instanceof Error ? reason.message : String(reason);
    _relay('error', ['Unhandled promise rejection: ' + msg]);
  });
})();
<\/script>`;

/** Combine HTML + CSS + JS files into a single renderable document */
export function buildPreviewDoc(files: WorkspaceFile[]): string {
  const html = files.find(f => f.name === 'index.html');

  if (!html) {
    // If no index.html, render whatever the active file is
    const anyHtml = files.find(f => f.language === 'html');
    if (anyHtml) {
      // Still inject the console bridge into non-index HTML files
      return anyHtml.content.replace(/<\/head>/i, CONSOLE_BRIDGE_SCRIPT + '</head>');
    }
    return '<p style="font-family:sans-serif;padding:24px;color:#666">No HTML file to preview.</p>';
  }

  let doc = html.content;

  // Inline every CSS file referenced via <link rel="stylesheet" href="filename.css">
  // Handles any filename — style.css, styles.css, app.css, theme.css, etc.
  doc = doc.replace(
    /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+\.css)["'][^>]*\/?>/gi,
    (_match, href) => {
      const cssFile = files.find(f => f.name === href);
      return cssFile ? `<style>${cssFile.content}</style>` : _match;
    },
  );

  // Inline every local JS file referenced via <script src="filename.js">
  // Handles any filename — script.js, app.js, game.js, scene.js, charts.js, dashboard.js, etc.
  // Does NOT inline CDN scripts (http/https URLs are left untouched).
  doc = doc.replace(
    /<script([^>]*)src=["'](?!https?:\/\/)([^"']+\.js)["']([^>]*)><\/script>/gi,
    (_match, pre, src, post) => {
      const jsFile = files.find(f => f.name === src);
      // Preserve any attributes (e.g. type="text/babel") other than src
      const attrs = (pre + post).trim();
      return jsFile ? `<script${attrs ? ' ' + attrs : ''}>${jsFile.content}<\/script>` : _match;
    },
  );

  // Inject console bridge before </head>
  doc = doc.replace(/<\/head>/i, CONSOLE_BRIDGE_SCRIPT + '</head>');

  return doc;
}
