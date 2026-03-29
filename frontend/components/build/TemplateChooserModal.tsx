'use client';

/**
 * TemplateChooserModal — "New project from template" picker.
 *
 * Displays 8 starter templates in a 2-column grid. Single click on a card
 * immediately calls onSelect with the template's WorkspaceFile[]. No two-step
 * confirm. Real, runnable code in every template — no placeholder strings.
 *
 * Usage:
 *   <TemplateChooserModal onSelect={(files) => loadFiles(files)} onClose={() => setOpen(false)} />
 */

import * as React from 'react';
import { X, Search } from 'lucide-react';
import type { WorkspaceFile } from './defaultFiles';

// ─── Props ────────────────────────────────────────────────────────────────────

interface TemplateChooserModalProps {
  onSelect: (files: WorkspaceFile[]) => void;
  onClose: () => void;
}

// ─── Template definition ──────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tags: string[];
  files: WorkspaceFile[];
}

// ─── Template definitions with full working code ─────────────────────────────

const TEMPLATES: Template[] = [
  // ── 1. Blank HTML ──────────────────────────────────────────────────────────
  {
    id: 'blank',
    name: 'Blank HTML',
    description: 'Clean HTML5 boilerplate. A blank canvas to start from scratch.',
    emoji: '📄',
    tags: ['HTML5', 'Starter'],
    files: [
      {
        name: 'index.html',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Page</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f9fafb;
      color: #111827;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 40px 48px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,.08);
    }
    h1 { margin: 0 0 8px; font-size: 1.75rem; }
    p  { margin: 0; color: #6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hello, world!</h1>
    <p>Edit this file to get started.</p>
  </div>
</body>
</html>`,
      },
    ],
  },

  // ── 2. Landing Page ────────────────────────────────────────────────────────
  {
    id: 'landing',
    name: 'Landing Page',
    description: 'SaaS product landing — hero, features grid, pricing table, CTA. Tailwind CDN, sticky nav, smooth scroll.',
    emoji: '🚀',
    tags: ['Tailwind', 'Landing', 'SaaS', 'CDN'],
    files: [
      {
        name: 'index.html',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FlowAI — Automate Smarter</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="styles.css" />
</head>
<body class="bg-white text-gray-900 antialiased">

  <!-- NAV -->
  <header class="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 shadow-sm">
    <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2 font-bold text-lg text-indigo-600">
        <span class="text-2xl">⚡</span> FlowAI
      </div>
      <nav class="hidden md:flex items-center gap-8 text-sm text-gray-600">
        <a href="#features" class="hover:text-indigo-600 transition">Features</a>
        <a href="#pricing"  class="hover:text-indigo-600 transition">Pricing</a>
        <a href="#faq"      class="hover:text-indigo-600 transition">FAQ</a>
      </nav>
      <a href="#cta"
         class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-full transition shadow-md">
        Start Free Trial
      </a>
    </div>
  </header>

  <!-- HERO -->
  <section class="hero-section text-center py-28 px-6">
    <div class="max-w-3xl mx-auto">
      <span class="inline-block px-4 py-1.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full mb-5 tracking-wider uppercase">
        Now with GPT-4o integration
      </span>
      <h1 class="text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
        Automate Your Workflows<br/>
        <span class="text-indigo-600">10x Faster</span>
      </h1>
      <p class="text-xl text-gray-500 mb-10 max-w-xl mx-auto">
        FlowAI connects your apps, automates repetitive tasks, and surfaces AI insights — no code required.
      </p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <a href="#cta"
           class="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg rounded-full transition shadow-lg">
          Get Started Free
        </a>
        <a href="#features"
           class="px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-lg rounded-full transition">
          See How It Works →
        </a>
      </div>
      <p class="mt-5 text-sm text-gray-400">No credit card required · 14-day free trial · Cancel any time</p>
    </div>
  </section>

  <!-- SOCIAL PROOF BAR -->
  <div class="bg-gray-50 border-y border-gray-100 py-8 px-6 text-center text-sm text-gray-400">
    Trusted by <strong class="text-gray-700">12,000+</strong> teams at&nbsp;
    <span class="font-semibold text-gray-600">Stripe · Notion · Linear · Vercel · Figma</span>
  </div>

  <!-- FEATURES -->
  <section id="features" class="py-24 px-6">
    <div class="max-w-6xl mx-auto">
      <div class="text-center mb-16">
        <h2 class="text-4xl font-extrabold text-gray-900 mb-4">Everything you need to ship faster</h2>
        <p class="text-lg text-gray-500">Built for modern teams who move fast and break fewer things.</p>
      </div>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="feature-card p-7 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition">
          <div class="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-2xl mb-5">🔗</div>
          <h3 class="text-xl font-bold mb-2">Connect Anything</h3>
          <p class="text-gray-500 text-sm leading-relaxed">
            200+ native integrations. Slack, GitHub, Salesforce, Jira, PostgreSQL — they all talk to each other instantly.
          </p>
        </div>
        <div class="feature-card p-7 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition">
          <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-2xl mb-5">🧠</div>
          <h3 class="text-xl font-bold mb-2">AI-Powered Logic</h3>
          <p class="text-gray-500 text-sm leading-relaxed">
            Embed GPT-4o, Claude, or Gemini directly into your workflows. Classify data, draft emails, summarise tickets automatically.
          </p>
        </div>
        <div class="feature-card p-7 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition">
          <div class="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-2xl mb-5">📊</div>
          <h3 class="text-xl font-bold mb-2">Real-time Analytics</h3>
          <p class="text-gray-500 text-sm leading-relaxed">
            See every automation run, error rate, and time saved. Built-in dashboards you can share with stakeholders.
          </p>
        </div>
        <div class="feature-card p-7 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition">
          <div class="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center text-2xl mb-5">🔒</div>
          <h3 class="text-xl font-bold mb-2">Enterprise Security</h3>
          <p class="text-gray-500 text-sm leading-relaxed">
            SOC 2 Type II, GDPR, HIPAA-ready. End-to-end encryption, SSO, and audit logs for every action.
          </p>
        </div>
        <div class="feature-card p-7 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition">
          <div class="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-2xl mb-5">⚡</div>
          <h3 class="text-xl font-bold mb-2">Sub-second Triggers</h3>
          <p class="text-gray-500 text-sm leading-relaxed">
            Webhooks processed in under 200ms. Event-driven architecture scales to billions of executions per month.
          </p>
        </div>
        <div class="feature-card p-7 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition">
          <div class="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center text-2xl mb-5">🧩</div>
          <h3 class="text-xl font-bold mb-2">No-Code Builder</h3>
          <p class="text-gray-500 text-sm leading-relaxed">
            Drag-and-drop canvas. If you can draw a flowchart, you can build a production automation in minutes.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- PRICING -->
  <section id="pricing" class="py-24 px-6 bg-gray-50">
    <div class="max-w-5xl mx-auto">
      <div class="text-center mb-14">
        <h2 class="text-4xl font-extrabold text-gray-900 mb-3">Simple, transparent pricing</h2>
        <p class="text-gray-500">Scale up. Cancel any time. No hidden fees.</p>
      </div>
      <div class="grid md:grid-cols-3 gap-6">
        <!-- Starter -->
        <div class="bg-white border-2 border-gray-200 rounded-2xl p-8 text-center">
          <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Starter</p>
          <p class="text-5xl font-extrabold text-gray-900 mb-1">$0</p>
          <p class="text-sm text-gray-400 mb-6">Free forever</p>
          <ul class="text-sm text-gray-500 space-y-3 mb-8 text-left">
            <li>✓ 500 automation runs/mo</li>
            <li>✓ 5 workflows</li>
            <li>✓ 10 integrations</li>
            <li>✓ Community support</li>
          </ul>
          <a href="#cta" class="block w-full py-3 border-2 border-indigo-600 text-indigo-600 font-bold rounded-full hover:bg-indigo-50 transition text-sm">
            Get Started
          </a>
        </div>
        <!-- Pro (highlighted) -->
        <div class="bg-indigo-600 border-2 border-indigo-600 rounded-2xl p-8 text-center relative">
          <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-amber-400 text-gray-900 text-xs px-3 py-1 rounded-full font-bold">
            Most Popular
          </div>
          <p class="text-sm font-semibold text-indigo-200 uppercase tracking-wide mb-1">Pro</p>
          <p class="text-5xl font-extrabold text-white mb-1">$49</p>
          <p class="text-sm text-indigo-300 mb-6">per seat / month</p>
          <ul class="text-sm text-indigo-100 space-y-3 mb-8 text-left">
            <li>✓ 50,000 runs/mo</li>
            <li>✓ Unlimited workflows</li>
            <li>✓ All 200+ integrations</li>
            <li>✓ AI logic nodes</li>
            <li>✓ Priority support</li>
          </ul>
          <a href="#cta" class="block w-full py-3 bg-white text-indigo-700 font-bold rounded-full hover:bg-indigo-50 transition text-sm">
            Start Free Trial
          </a>
        </div>
        <!-- Enterprise -->
        <div class="bg-white border-2 border-gray-200 rounded-2xl p-8 text-center">
          <p class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">Enterprise</p>
          <p class="text-5xl font-extrabold text-gray-900 mb-1">Custom</p>
          <p class="text-sm text-gray-400 mb-6">Annual contract</p>
          <ul class="text-sm text-gray-500 space-y-3 mb-8 text-left">
            <li>✓ Unlimited everything</li>
            <li>✓ SSO + SCIM</li>
            <li>✓ HIPAA / SOC 2</li>
            <li>✓ Dedicated CSM</li>
            <li>✓ SLA guarantee</li>
          </ul>
          <a href="#cta" class="block w-full py-3 border-2 border-gray-300 text-gray-700 font-bold rounded-full hover:bg-gray-50 transition text-sm">
            Contact Sales
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section id="faq" class="py-24 px-6">
    <div class="max-w-3xl mx-auto">
      <h2 class="text-4xl font-extrabold text-center mb-12">Frequently Asked Questions</h2>
      <div id="faqList" class="space-y-4"></div>
    </div>
  </section>

  <!-- CTA -->
  <section id="cta" class="py-24 px-6 bg-indigo-600 text-white text-center">
    <div class="max-w-xl mx-auto">
      <h2 class="text-4xl font-extrabold mb-4">Ready to automate smarter?</h2>
      <p class="text-indigo-200 mb-8">Join 12,000+ teams saving 20+ hours per week with FlowAI.</p>
      <form id="ctaForm" onsubmit="handleCta(event)" class="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
        <input type="email" placeholder="your@company.com" required
          class="flex-1 px-5 py-3.5 rounded-full text-gray-900 focus:outline-none focus:ring-2 focus:ring-white text-sm" />
        <button type="submit"
          class="px-6 py-3.5 bg-white text-indigo-700 font-bold rounded-full hover:bg-indigo-50 transition text-sm whitespace-nowrap">
          Start Free Trial
        </button>
      </form>
      <p id="ctaConfirm" class="hidden mt-5 text-indigo-200 font-semibold text-sm">
        🎉 You're in! Check your inbox for next steps.
      </p>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="bg-gray-900 text-gray-400 py-10 px-6 text-center text-sm">
    <div class="flex items-center justify-center gap-2 mb-3 text-white font-bold text-base">
      <span>⚡</span> FlowAI
    </div>
    <p class="mb-3">© 2026 FlowAI Inc. All rights reserved.</p>
    <div class="flex justify-center gap-6 text-xs">
      <a href="#" class="hover:text-white transition">Privacy</a>
      <a href="#" class="hover:text-white transition">Terms</a>
      <a href="#" class="hover:text-white transition">Status</a>
      <a href="#" class="hover:text-white transition">Twitter</a>
    </div>
  </footer>

  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        name: 'styles.css',
        language: 'css',
        content: `/* FlowAI Landing — Custom styles (Tailwind handles utilities) */

html { scroll-behavior: smooth; }

*, *::before, *::after { box-sizing: border-box; }

.hero-section {
  background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 50%, #ede9fe 100%);
}

.feature-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.feature-card:hover {
  transform: translateY(-4px);
}

/* Focus styles */
a:focus-visible,
button:focus-visible,
input:focus-visible {
  outline: 3px solid #6366f1;
  outline-offset: 2px;
  border-radius: 4px;
}`,
      },
      {
        name: 'app.js',
        language: 'javascript',
        content: `// FlowAI Landing — Interactivity

// CTA form
function handleCta(e) {
  e.preventDefault();
  document.getElementById('ctaForm').classList.add('hidden');
  document.getElementById('ctaConfirm').classList.remove('hidden');
}

// FAQ accordion data
const faqs = [
  { q: 'Do I need a credit card to sign up?', a: 'No. The Starter plan is free forever — just an email address.' },
  { q: 'Can I upgrade or downgrade at any time?', a: 'Yes. Changes take effect on your next billing cycle. No penalties.' },
  { q: 'What happens when I hit my run limit?', a: 'Automations pause and you get an email. Upgrade or wait for the monthly reset.' },
  { q: 'Is my data encrypted?', a: 'Yes. All data is encrypted at rest (AES-256) and in transit (TLS 1.3).' },
  { q: 'Do you offer discounts for startups or nonprofits?', a: 'Yes — up to 50% off for qualifying organizations. Contact sales.' },
];

const faqList = document.getElementById('faqList');
faqs.forEach((item, i) => {
  const el = document.createElement('div');
  el.className = 'border border-gray-200 rounded-xl overflow-hidden';
  el.innerHTML = \`
    <button onclick="toggleFaq(\${i})" class="w-full flex items-center justify-between px-6 py-4 text-left font-semibold text-gray-800 hover:bg-gray-50 transition text-sm">
      <span>\${item.q}</span>
      <span id="faq-icon-\${i}" class="text-indigo-600 text-lg font-light select-none">+</span>
    </button>
    <div id="faq-body-\${i}" class="hidden px-6 pb-5 text-sm text-gray-500 leading-relaxed">
      \${item.a}
    </div>
  \`;
  faqList.appendChild(el);
});

function toggleFaq(i) {
  const body = document.getElementById('faq-body-' + i);
  const icon = document.getElementById('faq-icon-' + i);
  const open = !body.classList.contains('hidden');
  body.classList.toggle('hidden', open);
  icon.textContent = open ? '+' : '−';
}

// Animate feature cards on scroll
const observer = new IntersectionObserver(
  entries => entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
    }
  }),
  { threshold: 0.1 }
);

document.querySelectorAll('.feature-card').forEach(card => {
  card.style.opacity = '0';
  card.style.transform = 'translateY(20px)';
  card.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
  observer.observe(card);
});`,
      },
    ],
  },

  // ── 3. React App ───────────────────────────────────────────────────────────
  {
    id: 'react',
    name: 'React App',
    description: 'React 18 via CDN. Counter + Todo list demonstrating useState and useEffect. Babel standalone for JSX.',
    emoji: '⚛️',
    tags: ['React 18', 'Hooks', 'CDN', 'Babel'],
    files: [
      {
        name: 'index.html',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>React App</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; }
    #root { max-width: 640px; margin: 0 auto; padding: 32px 16px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" src="app.js"></script>
</body>
</html>`,
      },
      {
        name: 'app.js',
        language: 'javascript',
        content: `// React 18 — Counter + Todo list (Babel JSX, no build step)
const { useState, useEffect, useRef } = React;

// ── Counter ───────────────────────────────────────────────────────────────────
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = count === 0 ? 'React App' : \`Count: \${count}\`;
    return () => { document.title = 'React App'; };
  }, [count]);

  const colour = count > 0 ? '#22c55e' : count < 0 ? '#ef4444' : '#64748b';

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '28px 32px', marginBottom: 24, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#334155' }}>Counter</h2>
      <div style={{ fontSize: 72, fontWeight: 800, color: colour, lineHeight: 1, margin: '16px 0' }}>{count}</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {[
          { label: '−', delta: -1, bg: '#fee2e2', fg: '#dc2626' },
          { label: 'Reset', delta: null, bg: '#f1f5f9', fg: '#64748b' },
          { label: '+', delta: 1, bg: '#dcfce7', fg: '#16a34a' },
        ].map(({ label, delta, bg, fg }) => (
          <button key={label}
            onClick={() => delta === null ? setCount(0) : setCount(c => c + delta)}
            style={{ background: bg, color: fg, border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 20, fontWeight: 700, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Todo List ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'react_todos';

function TodoApp() {
  const [todos, setTodos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || getDefaults(); }
    catch { return getDefaults(); }
  });
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  function getDefaults() {
    return [
      { id: 1, text: 'Build something with React', done: true },
      { id: 2, text: 'Add state with useState', done: true },
      { id: 3, text: 'Persist data in localStorage', done: false },
      { id: 4, text: 'Ship it 🚀', done: false },
    ];
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  function addTodo(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setTodos(prev => [...prev, { id: Date.now(), text, done: false }]);
    setInput('');
    inputRef.current?.focus();
  }

  function toggle(id) {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }

  function remove(id) {
    setTodos(prev => prev.filter(t => t.id !== id));
  }

  const done = todos.filter(t => t.done).length;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '28px 32px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#334155' }}>Todo List</h2>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>{done}/{todos.length} done</span>
      </div>

      <form onSubmit={addTodo} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Add a new task…"
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', color: '#1e293b' }}
        />
        <button type="submit"
          style={{ padding: '10px 18px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          Add
        </button>
      </form>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {todos.length === 0 && (
          <li style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0', fontSize: 14 }}>
            No tasks yet. Add one above!
          </li>
        )}
        {todos.map(todo => (
          <li key={todo.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: todo.done ? '#f8fafc' : '#fff', border: '1px solid #f1f5f9' }}>
            <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)}
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#6366f1' }} />
            <span style={{ flex: 1, fontSize: 14, color: todo.done ? '#94a3b8' : '#1e293b', textDecoration: todo.done ? 'line-through' : 'none' }}>
              {todo.text}
            </span>
            <button onClick={() => remove(todo.id)}
              style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}
              title="Delete">×</button>
          </li>
        ))}
      </ul>

      {todos.some(t => t.done) && (
        <button
          onClick={() => setTodos(prev => prev.filter(t => !t.done))}
          style={{ marginTop: 14, width: '100%', padding: '9px 0', border: '1px dashed #e2e8f0', borderRadius: 10, background: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
          Clear completed
        </button>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <div>
      <h1 style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, marginBottom: 28, color: '#1e293b' }}>
        ⚛️ React 18 Starter
      </h1>
      <Counter />
      <TodoApp />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);`,
      },
    ],
  },

  // ── 4. Vue 3 App ───────────────────────────────────────────────────────────
  {
    id: 'vue',
    name: 'Vue 3 App',
    description: 'Vue 3 Composition API via CDN. Note-taking app with add, delete, and live search.',
    emoji: '💚',
    tags: ['Vue 3', 'Composition API', 'CDN'],
    files: [
      {
        name: 'index.html',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vue Notes</title>
  <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
  <link rel="stylesheet" href="app.css" />
</head>
<body>
  <div id="app">
    <div class="container">
      <header class="header">
        <h1>📝 Vue Notes</h1>
        <span class="badge">{{ filteredNotes.length }} note{{ filteredNotes.length !== 1 ? 's' : '' }}</span>
      </header>

      <!-- Search -->
      <div class="search-row">
        <input v-model="search" class="search-input" placeholder="Search notes…" />
        <button @click="clearSearch" v-if="search" class="btn-ghost">✕</button>
      </div>

      <!-- Add note -->
      <form @submit.prevent="addNote" class="add-form">
        <input v-model="newTitle" class="text-input" placeholder="Note title" required />
        <textarea v-model="newBody" class="textarea" placeholder="Write something…" rows="3"></textarea>
        <div class="add-row">
          <select v-model="newColor" class="color-select">
            <option value="#fef9c3">🟡 Yellow</option>
            <option value="#dcfce7">🟢 Green</option>
            <option value="#ede9fe">🟣 Purple</option>
            <option value="#fee2e2">🔴 Red</option>
            <option value="#e0f2fe">🔵 Blue</option>
          </select>
          <button type="submit" class="btn-primary">Add Note</button>
        </div>
      </form>

      <!-- Notes grid -->
      <div v-if="filteredNotes.length === 0" class="empty-state">
        <span>{{ search ? 'No notes match your search.' : 'No notes yet. Add one above!' }}</span>
      </div>
      <div class="notes-grid">
        <div
          v-for="note in filteredNotes"
          :key="note.id"
          class="note-card"
          :style="{ background: note.color }"
        >
          <div class="note-header">
            <strong class="note-title">{{ note.title }}</strong>
            <button @click="deleteNote(note.id)" class="delete-btn" title="Delete">×</button>
          </div>
          <p class="note-body">{{ note.body }}</p>
          <time class="note-time">{{ formatDate(note.createdAt) }}</time>
        </div>
      </div>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        name: 'app.css',
        language: 'css',
        content: `/* Vue Notes — Styles */
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f1f5f9;
  color: #1e293b;
  min-height: 100vh;
}

.container {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 16px 64px;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.header h1 { margin: 0; font-size: 26px; font-weight: 800; }
.badge {
  background: #6366f1;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
}

.search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.search-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
  outline: none;
  color: #1e293b;
}
.search-input:focus { border-color: #6366f1; }
.btn-ghost {
  padding: 8px 14px;
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  color: #64748b;
  cursor: pointer;
  font-size: 16px;
}

.add-form {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 28px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.text-input, .textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  color: #1e293b;
  resize: vertical;
}
.text-input:focus, .textarea:focus { border-color: #6366f1; }
.add-row { display: flex; gap: 10px; align-items: center; }
.color-select {
  padding: 9px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  background: #fff;
  cursor: pointer;
}
.btn-primary {
  margin-left: auto;
  padding: 10px 22px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
}
.btn-primary:hover { background: #4f46e5; }

.empty-state {
  text-align: center;
  color: #94a3b8;
  padding: 40px 0;
  font-size: 14px;
}

.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}
.note-card {
  border-radius: 14px;
  padding: 16px;
  border: 1px solid rgba(0,0,0,.06);
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
  transition: transform .15s ease, box-shadow .15s ease;
}
.note-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.1); }
.note-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; margin-bottom: 8px; }
.note-title { font-size: 14px; font-weight: 700; color: #1e293b; word-break: break-word; }
.delete-btn { background: none; border: none; font-size: 18px; line-height: 1; cursor: pointer; color: rgba(0,0,0,.3); flex-shrink: 0; padding: 0; }
.delete-btn:hover { color: #ef4444; }
.note-body { font-size: 13px; color: #475569; margin: 0 0 10px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.note-time { font-size: 11px; color: rgba(0,0,0,.35); display: block; }`,
      },
      {
        name: 'app.js',
        language: 'javascript',
        content: `// Vue 3 Notes app — Composition API

const { createApp, ref, computed } = Vue;

const STORAGE_KEY = 'vue_notes_v1';

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [
    { id: 1, title: 'Welcome to Vue Notes!', body: 'Click × to delete. Use the search bar to filter. Notes are saved automatically.', color: '#ede9fe', createdAt: Date.now() - 5000 },
    { id: 2, title: 'Vue 3 Composition API', body: 'Using ref(), computed(), and reactive state in a clean setup() function.', color: '#dcfce7', createdAt: Date.now() - 3000 },
    { id: 3, title: 'No build step!', body: 'This runs entirely from CDN in the browser. No Vite, no Webpack needed.', color: '#e0f2fe', createdAt: Date.now() },
  ];
}

createApp({
  setup() {
    const notes    = ref(loadNotes());
    const search   = ref('');
    const newTitle = ref('');
    const newBody  = ref('');
    const newColor = ref('#fef9c3');

    const filteredNotes = computed(() => {
      const q = search.value.toLowerCase().trim();
      if (!q) return [...notes.value].reverse();
      return [...notes.value]
        .reverse()
        .filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
    });

    function save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes.value));
    }

    function addNote() {
      const title = newTitle.value.trim();
      const body  = newBody.value.trim();
      if (!title) return;
      notes.value.push({ id: Date.now(), title, body, color: newColor.value, createdAt: Date.now() });
      newTitle.value = '';
      newBody.value  = '';
      save();
    }

    function deleteNote(id) {
      notes.value = notes.value.filter(n => n.id !== id);
      save();
    }

    function clearSearch() { search.value = ''; }

    function formatDate(ts) {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    return { notes, search, newTitle, newBody, newColor, filteredNotes, addNote, deleteNote, clearSearch, formatDate };
  },
}).mount('#app');`,
      },
    ],
  },

  // ── 5. Chart Dashboard ────────────────────────────────────────────────────
  {
    id: 'charts',
    name: 'Chart Dashboard',
    description: 'Chart.js 4 dark dashboard with line, bar, doughnut and radar charts. Responsive grid, realistic sales data.',
    emoji: '📊',
    tags: ['Chart.js 4', 'Dashboard', 'Dark Theme', 'CDN'],
    files: [
      {
        name: 'index.html',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Analytics Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="app">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="logo">📈 Metrics</div>
      <nav>
        <a class="nav-item active" href="#">Dashboard</a>
        <a class="nav-item" href="#">Revenue</a>
        <a class="nav-item" href="#">Users</a>
        <a class="nav-item" href="#">Products</a>
        <a class="nav-item" href="#">Reports</a>
      </nav>
    </aside>

    <!-- Main -->
    <main class="main">
      <header class="top-bar">
        <h1>Analytics Overview</h1>
        <span class="period">Jan – Dec 2025</span>
      </header>

      <!-- KPI row -->
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-value">$2.4M</div><div class="kpi-label">Total Revenue</div><div class="kpi-delta positive">+18% vs 2024</div></div>
        <div class="kpi"><div class="kpi-value">14,820</div><div class="kpi-label">New Customers</div><div class="kpi-delta positive">+7%</div></div>
        <div class="kpi"><div class="kpi-value">68.3%</div><div class="kpi-label">Gross Margin</div><div class="kpi-delta negative">−1.2pp</div></div>
        <div class="kpi"><div class="kpi-value">4.7★</div><div class="kpi-label">Avg Rating</div><div class="kpi-delta positive">+0.2</div></div>
      </div>

      <!-- Charts grid -->
      <div class="charts-grid">
        <div class="chart-card wide"><h2>Monthly Revenue</h2><canvas id="lineChart"></canvas></div>
        <div class="chart-card"><h2>Sales by Channel</h2><canvas id="barChart"></canvas></div>
        <div class="chart-card"><h2>Revenue Mix</h2><canvas id="doughnutChart"></canvas></div>
        <div class="chart-card"><h2>Performance Radar</h2><canvas id="radarChart"></canvas></div>
      </div>
    </main>
  </div>
  <script src="charts.js"></script>
</body>
</html>`,
      },
      {
        name: 'styles.css',
        language: 'css',
        content: `/* Analytics Dashboard — Dark theme */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f1117;
  color: #e2e8f0;
}

.app {
  display: flex;
  min-height: 100vh;
}

/* Sidebar */
.sidebar {
  width: 200px;
  background: #161b2e;
  border-right: 1px solid #1e2240;
  padding: 24px 0;
  flex-shrink: 0;
}
.logo {
  padding: 0 20px 24px;
  font-size: 18px;
  font-weight: 800;
  color: #818cf8;
  border-bottom: 1px solid #1e2240;
  margin-bottom: 12px;
}
.nav-item {
  display: block;
  padding: 10px 20px;
  color: #64748b;
  text-decoration: none;
  font-size: 14px;
  transition: all .15s;
}
.nav-item:hover { color: #e2e8f0; background: #1e2240; }
.nav-item.active { color: #818cf8; background: #1e2240; font-weight: 600; border-left: 3px solid #818cf8; }

/* Main */
.main { flex: 1; padding: 28px 32px; overflow-y: auto; }

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.top-bar h1 { margin: 0; font-size: 22px; font-weight: 700; }
.period { font-size: 13px; color: #475569; background: #1e2240; padding: 6px 14px; border-radius: 20px; }

/* KPI row */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.kpi {
  background: #161b2e;
  border: 1px solid #1e2240;
  border-radius: 14px;
  padding: 20px 22px;
}
.kpi-value { font-size: 26px; font-weight: 800; color: #f1f5f9; margin-bottom: 4px; }
.kpi-label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
.kpi-delta { font-size: 12px; font-weight: 600; }
.kpi-delta.positive { color: #4ade80; }
.kpi-delta.negative { color: #f87171; }

/* Charts grid */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}
.chart-card {
  background: #161b2e;
  border: 1px solid #1e2240;
  border-radius: 16px;
  padding: 22px 24px;
}
.chart-card.wide { grid-column: 1 / -1; }
.chart-card h2 { margin: 0 0 16px; font-size: 15px; font-weight: 600; color: #94a3b8; }

@media (max-width: 700px) {
  .sidebar { display: none; }
  .charts-grid { grid-template-columns: 1fr; }
  .chart-card.wide { grid-column: 1; }
}`,
      },
      {
        name: 'charts.js',
        language: 'javascript',
        content: `// Analytics Dashboard — Chart.js 4 charts

Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = '#1e2240';
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ACCENT = '#818cf8';
const ACCENT2 = '#34d399';
const ACCENT3 = '#f472b6';

// ── Line Chart — Monthly Revenue ─────────────────────────────────────────────
new Chart(document.getElementById('lineChart'), {
  type: 'line',
  data: {
    labels: MONTHS,
    datasets: [
      {
        label: 'Revenue 2025',
        data: [148000, 162000, 195000, 188000, 220000, 245000, 232000, 259000, 271000, 248000, 290000, 310000],
        borderColor: ACCENT,
        backgroundColor: 'rgba(129,140,248,.12)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
      },
      {
        label: 'Revenue 2024',
        data: [120000, 135000, 158000, 152000, 175000, 198000, 185000, 212000, 225000, 201000, 238000, 260000],
        borderColor: '#475569',
        backgroundColor: 'transparent',
        borderDash: [5, 4],
        tension: 0.4,
        pointRadius: 0,
      },
    ],
  },
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { usePointStyle: true, pointStyleWidth: 10, padding: 20 } },
      tooltip: {
        callbacks: {
          label: ctx => ' $' + ctx.parsed.y.toLocaleString(),
        },
      },
    },
    scales: {
      y: {
        grid: { color: '#1e2240' },
        ticks: {
          callback: v => '$' + (v/1000).toFixed(0) + 'k',
        },
      },
      x: { grid: { display: false } },
    },
  },
});

// ── Bar Chart — Sales by Channel ─────────────────────────────────────────────
new Chart(document.getElementById('barChart'), {
  type: 'bar',
  data: {
    labels: ['Direct', 'Organic', 'Paid', 'Referral', 'Social', 'Affiliate'],
    datasets: [{
      label: 'Revenue ($k)',
      data: [680, 520, 410, 310, 240, 190],
      backgroundColor: [ACCENT, ACCENT2, '#f472b6', '#facc15', '#38bdf8', '#a78bfa'],
      borderRadius: 8,
      borderSkipped: false,
    }],
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      y: {
        grid: { color: '#1e2240' },
        ticks: { callback: v => '$' + v + 'k' },
      },
      x: { grid: { display: false } },
    },
  },
});

// ── Doughnut — Revenue Mix ────────────────────────────────────────────────────
new Chart(document.getElementById('doughnutChart'), {
  type: 'doughnut',
  data: {
    labels: ['Enterprise', 'Pro', 'Starter', 'Services'],
    datasets: [{
      data: [42, 31, 17, 10],
      backgroundColor: [ACCENT, ACCENT2, ACCENT3, '#facc15'],
      hoverOffset: 10,
      borderWidth: 0,
      spacing: 3,
      borderRadius: 6,
    }],
  },
  options: {
    responsive: true,
    cutout: '70%',
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + ctx.parsed + '%' } },
    },
  },
});

// ── Radar — Performance ───────────────────────────────────────────────────────
new Chart(document.getElementById('radarChart'), {
  type: 'radar',
  data: {
    labels: ['Revenue', 'Growth', 'Retention', 'NPS', 'Efficiency', 'Innovation'],
    datasets: [
      {
        label: '2025',
        data: [88, 76, 82, 90, 70, 84],
        borderColor: ACCENT,
        backgroundColor: 'rgba(129,140,248,.2)',
        pointBackgroundColor: ACCENT,
        pointRadius: 4,
      },
      {
        label: '2024',
        data: [72, 65, 78, 80, 66, 71],
        borderColor: '#475569',
        backgroundColor: 'rgba(71,85,105,.1)',
        borderDash: [4, 3],
        pointBackgroundColor: '#475569',
        pointRadius: 3,
      },
    ],
  },
  options: {
    responsive: true,
    scales: {
      r: {
        min: 0,
        max: 100,
        grid: { color: '#1e2240' },
        angleLines: { color: '#1e2240' },
        ticks: { display: false, stepSize: 20 },
        pointLabels: { font: { size: 12 } },
      },
    },
    plugins: {
      legend: { labels: { usePointStyle: true, padding: 16 } },
    },
  },
});`,
      },
    ],
  },

  // ── 6. Canvas Game ─────────────────────────────────────────────────────────
  {
    id: 'game',
    name: 'Canvas Game',
    description: 'Fully playable Snake game. Arrow keys to move, score counter, game-over screen, restart. 60fps canvas.',
    emoji: '🎮',
    tags: ['Canvas 2D', 'Game', 'Vanilla JS', 'RAF'],
    files: [
      {
        name: 'index.html',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Snake</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      background: #0f0f1a;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #e2e8f0;
      user-select: none;
    }
    h1 { margin: 0 0 12px; font-size: 28px; letter-spacing: 4px; color: #4ade80; text-transform: uppercase; }
    #scoreboard { display: flex; gap: 40px; margin-bottom: 18px; font-size: 15px; color: #94a3b8; }
    #scoreboard span { font-size: 24px; font-weight: 700; color: #f1f5f9; display: block; }
    canvas { border: 2px solid #1e3a2e; border-radius: 10px; display: block; }
    #msg { margin-top: 20px; font-size: 14px; color: #64748b; }
  </style>
</head>
<body>
  <h1>🐍 Snake</h1>
  <div id="scoreboard">
    <div><span id="scoreDisplay">0</span>Score</div>
    <div><span id="highDisplay">0</span>Best</div>
    <div><span id="levelDisplay">1</span>Level</div>
  </div>
  <canvas id="gameCanvas" width="400" height="400"></canvas>
  <p id="msg">Arrow keys to move · R to restart</p>
  <script src="game.js"></script>
</body>
</html>`,
      },
      {
        name: 'game.js',
        language: 'javascript',
        content: `// Snake game — pure canvas 2D, 60fps requestAnimationFrame

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

const GRID  = 20;            // cell size px
const COLS  = canvas.width  / GRID;
const ROWS  = canvas.height / GRID;

const scoreEl = document.getElementById('scoreDisplay');
const highEl  = document.getElementById('highDisplay');
const levelEl = document.getElementById('levelDisplay');

let snake, dir, nextDir, food, score, highScore, level, speed;
let lastTime = 0, accumulator = 0;
let gameOver = false;

// Colours
const BG_CELL_EVEN  = '#0d1a0d';
const BG_CELL_ODD   = '#0f1f0f';
const SNAKE_HEAD    = '#4ade80';
const SNAKE_BODY    = '#22c55e';
const SNAKE_TAIL    = '#16a34a';
const FOOD_COLOUR   = '#f87171';
const FOOD_GLOW     = 'rgba(248,113,113,.5)';
const WALL_COLOUR   = '#1e3a2e';

function init() {
  snake    = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  dir      = { x: 1, y: 0 };
  nextDir  = { x: 1, y: 0 };
  score    = 0;
  level    = 1;
  speed    = 150;           // ms per tick
  gameOver = false;
  spawnFood();
  updateHUD();
}

function spawnFood() {
  let pos;
  do {
    pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  food = pos;
}

function updateHUD() {
  scoreEl.textContent = score;
  highEl.textContent  = highScore || 0;
  levelEl.textContent = level;
}

function tick() {
  dir = { ...nextDir };
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  // Wall collision
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
    triggerGameOver(); return;
  }
  // Self collision
  if (snake.some(s => s.x === head.x && s.y === head.y)) {
    triggerGameOver(); return;
  }

  snake.unshift(head);

  const ate = head.x === food.x && head.y === food.y;
  if (ate) {
    score += level * 10;
    if (score > (highScore || 0)) highScore = score;
    // Level up every 5 foods
    if (score % 50 === 0) { level++; speed = Math.max(50, speed - 15); }
    spawnFood();
    updateHUD();
  } else {
    snake.pop();
  }
}

function triggerGameOver() {
  gameOver = true;
  if (score > (highScore || 0)) highScore = score;
  updateHUD();
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function drawGrid() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? BG_CELL_EVEN : BG_CELL_ODD;
      ctx.fillRect(c * GRID, r * GRID, GRID, GRID);
    }
  }
}

function drawFood() {
  const cx = food.x * GRID + GRID / 2;
  const cy = food.y * GRID + GRID / 2;
  // Glow
  const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, GRID * .8);
  grd.addColorStop(0, FOOD_GLOW);
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.fillRect(food.x * GRID - GRID, food.y * GRID - GRID, GRID * 3, GRID * 3);
  // Apple
  ctx.fillStyle = FOOD_COLOUR;
  ctx.beginPath();
  ctx.roundRect(food.x * GRID + 3, food.y * GRID + 3, GRID - 6, GRID - 6, 5);
  ctx.fill();
}

function drawSnake() {
  snake.forEach((seg, i) => {
    const fraction = i / (snake.length - 1);
    if (i === 0)      ctx.fillStyle = SNAKE_HEAD;
    else if (i === snake.length - 1) ctx.fillStyle = SNAKE_TAIL;
    else {
      // Interpolate body colour
      const g = Math.round(0xce - fraction * 0x34);
      ctx.fillStyle = \`rgb(34,\${g},80)\`;
    }
    ctx.beginPath();
    ctx.roundRect(seg.x * GRID + 1, seg.y * GRID + 1, GRID - 2, GRID - 2, i === 0 ? 8 : 5);
    ctx.fill();
    // Eyes on head
    if (i === 0) {
      ctx.fillStyle = '#0d1a0d';
      const ex = seg.x * GRID + (dir.x === 0 ? 4  : dir.x > 0 ? GRID - 7 : 4);
      const ey = seg.y * GRID + (dir.y === 0 ? 4  : dir.y > 0 ? GRID - 7 : 4);
      const ex2 = seg.x * GRID + (dir.x === 0 ? GRID - 7 : dir.x > 0 ? GRID - 7 : 4);
      const ey2 = seg.y * GRID + (dir.y === 0 ? GRID - 7 : dir.y > 0 ? GRID - 7 : 4);
      ctx.fillRect(ex, ey, 4, 4);
      ctx.fillRect(ex2, ey2, 4, 4);
    }
  });
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f87171';
  ctx.font = 'bold 36px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 24);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(\`Score: \${score}   Best: \${highScore}\`, canvas.width / 2, canvas.height / 2 + 12);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Press R to play again', canvas.width / 2, canvas.height / 2 + 44);
  ctx.textAlign = 'left';
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = timestamp - lastTime;
  lastTime = timestamp;

  if (!gameOver) {
    accumulator += delta;
    while (accumulator >= speed) {
      tick();
      accumulator -= speed;
      if (gameOver) break;
    }
  }

  drawGrid();
  if (!gameOver) {
    drawFood();
    drawSnake();
  } else {
    drawFood();
    drawSnake();
    drawGameOver();
  }

  requestAnimationFrame(loop);
}

// ── Input ─────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  switch (e.key) {
    case 'ArrowUp':    if (dir.y !== 1)  nextDir = { x: 0, y: -1 }; e.preventDefault(); break;
    case 'ArrowDown':  if (dir.y !== -1) nextDir = { x: 0, y: 1 };  e.preventDefault(); break;
    case 'ArrowLeft':  if (dir.x !== 1)  nextDir = { x: -1, y: 0 }; e.preventDefault(); break;
    case 'ArrowRight': if (dir.x !== -1) nextDir = { x: 1, y: 0 };  e.preventDefault(); break;
    case 'r': case 'R': if (gameOver) { init(); accumulator = 0; lastTime = 0; } break;
  }
});

// Polyfill roundRect for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arcTo(x + w, y, x + w, y + r, r);
    this.lineTo(x + w, y + h - r);
    this.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.lineTo(x + r, y + h);
    this.arcTo(x, y + h, x, y + h - r, r);
    this.lineTo(x, y + r);
    this.arcTo(x, y, x + r, y, r);
    this.closePath();
  };
}

// Start!
init();
requestAnimationFrame(loop);`,
      },
    ],
  },

  // ── 7. Three.js 3D Scene ──────────────────────────────────────────────────
  {
    id: 'threejs',
    name: 'Three.js 3D Scene',
    description: 'Rotating cube, torus and sphere with OrbitControls, lighting, fog, and dark background.',
    emoji: '🎲',
    tags: ['Three.js', 'WebGL', '3D', 'CDN'],
    files: [
      {
        name: 'index.html',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Three.js Scene</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #07090f; }
    canvas { display: block; }
    #hint {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(255,255,255,.35);
      font-family: system-ui, sans-serif;
      font-size: 13px;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="hint">Left-click drag to orbit · Scroll to zoom</div>
  <script src="https://unpkg.com/three@0.158.0/build/three.min.js"></script>
  <script src="https://unpkg.com/three@0.158.0/examples/js/controls/OrbitControls.js"></script>
  <script src="scene.js"></script>
</body>
</html>`,
      },
      {
        name: 'scene.js',
        language: 'javascript',
        content: `// Three.js r158 — rotating geometric shapes scene

// ── Setup ─────────────────────────────────────────────────────────────────────
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
document.body.appendChild(renderer.domElement);

// Camera position
camera.position.set(0, 3, 10);

// Fog
scene.fog = new THREE.FogExp2(0x07090f, 0.04);
scene.background = new THREE.Color(0x07090f);

// OrbitControls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 3;
controls.maxDistance = 30;
controls.autoRotate = false;

// ── Lighting ──────────────────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0x8888cc, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x4466ff, 0.8);
fill.position.set(-8, 2, -4);
scene.add(fill);

const rim = new THREE.PointLight(0xff44aa, 1.5, 20);
rim.position.set(-4, 6, -3);
scene.add(rim);

// ── Ground plane ──────────────────────────────────────────────────────────────
const groundGeo = new THREE.PlaneGeometry(40, 40);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 1, metalness: 0 });
const ground    = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -2.5;
ground.receiveShadow = true;
scene.add(ground);

// ── Grid helper ───────────────────────────────────────────────────────────────
const grid = new THREE.GridHelper(40, 40, 0x1e2240, 0x111827);
grid.position.y = -2.49;
scene.add(grid);

// ── Geometries ────────────────────────────────────────────────────────────────
function makeMesh(geo, color, roughness, metalness) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Cube
const cube = makeMesh(new THREE.BoxGeometry(2, 2, 2), 0x6366f1, 0.3, 0.5);
cube.position.set(-3.5, 0, 0);
scene.add(cube);

// Torus
const torus = makeMesh(new THREE.TorusGeometry(1.2, 0.45, 24, 80), 0xf472b6, 0.2, 0.7);
torus.position.set(0, 0, 0);
scene.add(torus);

// Sphere
const sphere = makeMesh(new THREE.SphereGeometry(1.2, 64, 64), 0x34d399, 0.1, 0.9);
sphere.position.set(3.5, 0, 0);
scene.add(sphere);

// Octahedron (bonus shape)
const oct = makeMesh(new THREE.OctahedronGeometry(0.9, 0), 0xfbbf24, 0.2, 0.6);
oct.position.set(0, 0, -3.5);
scene.add(oct);

// Small floating spheres
const smallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 1.0, emissive: 0x334455, emissiveIntensity: 0.3 });
for (let i = 0; i < 20; i++) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.15, 12, 12), smallMat);
  const angle = (i / 20) * Math.PI * 2;
  const r = 6 + Math.random() * 3;
  s.position.set(Math.cos(angle) * r, -1 + Math.random() * 3, Math.sin(angle) * r);
  s.castShadow = true;
  scene.add(s);
}

// ── Animation ─────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  cube.rotation.x = t * 0.5;
  cube.rotation.y = t * 0.7;

  torus.rotation.x = t * 0.4;
  torus.rotation.z = t * 0.6;

  sphere.rotation.y = t * 0.9;

  oct.rotation.x = t * 0.6;
  oct.rotation.y = t * 0.4;
  oct.position.y = Math.sin(t * 1.2) * 0.6;

  // Gentle float for all shapes
  cube.position.y   = Math.sin(t * 0.8) * 0.3;
  torus.position.y  = Math.sin(t * 0.8 + 1.0) * 0.3;
  sphere.position.y = Math.sin(t * 0.8 + 2.0) * 0.3;

  // Pulsing rim light
  rim.intensity = 1.2 + Math.sin(t * 2) * 0.4;

  controls.update();
  renderer.render(scene, camera);
}

// ── Resize handler ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();`,
      },
    ],
  },

  // ── 8. API Dashboard ──────────────────────────────────────────────────────
  {
    id: 'api',
    name: 'API Dashboard',
    description: 'Fetches real data from JSONPlaceholder. Users table, posts feed, todos list. Tabs, loading states, error handling.',
    emoji: '🔌',
    tags: ['Fetch API', 'Dashboard', 'Vanilla JS', 'CSS Grid'],
    files: [
      {
        name: 'index.html',
        language: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API Dashboard</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="app">
    <header class="app-header">
      <div class="header-left">
        <h1>🔌 API Dashboard</h1>
        <span class="api-badge">JSONPlaceholder</span>
      </div>
      <button id="refreshBtn" class="btn-refresh" title="Reload data">↻ Refresh</button>
    </header>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active" data-tab="users">👤 Users</button>
      <button class="tab" data-tab="posts">📝 Posts</button>
      <button class="tab" data-tab="todos">✅ Todos</button>
    </div>

    <!-- Panels -->
    <main class="panels">
      <div id="panel-users"  class="panel active"></div>
      <div id="panel-posts"  class="panel"></div>
      <div id="panel-todos"  class="panel"></div>
    </main>
  </div>
  <script src="dashboard.js"></script>
</body>
</html>`,
      },
      {
        name: 'styles.css',
        language: 'css',
        content: `/* API Dashboard */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; min-height: 100vh; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f1117;
  color: #e2e8f0;
  font-size: 14px;
}

.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 28px 20px 60px;
}

/* Header */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.app-header h1 { margin: 0; font-size: 22px; font-weight: 800; }
.api-badge {
  font-size: 11px;
  background: #1e3a5f;
  color: #7dd3fc;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 600;
  white-space: nowrap;
}
.btn-refresh {
  padding: 9px 18px;
  background: #1e2240;
  color: #e2e8f0;
  border: 1px solid #2d3555;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all .15s;
}
.btn-refresh:hover { background: #2d3555; }
.btn-refresh.spinning { opacity: .6; cursor: not-allowed; }

/* Tabs */
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #1e2240;
  margin-bottom: 20px;
}
.tab {
  padding: 10px 20px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all .15s;
  white-space: nowrap;
}
.tab:hover { color: #94a3b8; }
.tab.active { color: #818cf8; border-bottom-color: #818cf8; }

/* Panels */
.panel { display: none; }
.panel.active { display: block; }

/* Loading / error / empty states */
.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #475569;
  text-align: center;
  gap: 12px;
}
.state-box .icon { font-size: 36px; }
.state-box.error .icon { font-size: 30px; }
.state-box.error { color: #f87171; }
.state-box button {
  margin-top: 8px;
  padding: 8px 18px;
  background: #1e2240;
  color: #94a3b8;
  border: 1px solid #2d3555;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}

/* Users table */
.data-table { width: 100%; border-collapse: collapse; }
.data-table th {
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid #1e2240;
  color: #64748b;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .06em;
  font-weight: 600;
}
.data-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #111827;
  vertical-align: top;
}
.data-table tr:hover td { background: #111827; }
.user-name { font-weight: 600; color: #f1f5f9; margin-bottom: 2px; }
.user-email { color: #64748b; font-size: 12px; }
.user-username { color: #818cf8; font-size: 12px; }
.company-name { color: #94a3b8; font-size: 12px; }
.website-link { color: #38bdf8; font-size: 12px; text-decoration: none; }
.website-link:hover { text-decoration: underline; }

/* Posts */
.posts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.post-card {
  background: #161b2e;
  border: 1px solid #1e2240;
  border-radius: 14px;
  padding: 18px 20px;
  transition: border-color .15s, transform .15s;
}
.post-card:hover { border-color: #818cf8; transform: translateY(-2px); }
.post-id { font-size: 10px; color: #475569; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .06em; }
.post-title { font-size: 14px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; line-height: 1.4; text-transform: capitalize; }
.post-body { font-size: 13px; color: #64748b; line-height: 1.55; }

/* Todos */
.todos-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 8px; }
.todos-header span { font-size: 12px; color: #64748b; }
.filter-btns { display: flex; gap: 4px; }
.filter-btn {
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid #1e2240;
  background: none;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
  transition: all .15s;
}
.filter-btn.active { background: #818cf8; color: #fff; border-color: #818cf8; }
.todo-list { display: flex; flex-direction: column; gap: 6px; }
.todo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #161b2e;
  border: 1px solid #1e2240;
  border-radius: 10px;
}
.todo-check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #475569;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}
.todo-check.done { background: #4ade80; border-color: #4ade80; color: #0f1117; font-weight: 700; }
.todo-text { flex: 1; font-size: 13px; color: #94a3b8; }
.todo-text.done { text-decoration: line-through; color: #475569; }
.todo-user { font-size: 11px; color: #475569; flex-shrink: 0; }`,
      },
      {
        name: 'dashboard.js',
        language: 'javascript',
        content: `// API Dashboard — fetch from JSONPlaceholder

const BASE = 'https://jsonplaceholder.typicode.com';

// ── State ─────────────────────────────────────────────────────────────────────
let cache  = {};
let todoFilter = 'all';

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function setPanel(panelId, html) {
  $(panelId).innerHTML = html;
}

function loadingHTML() {
  return \`<div class="state-box"><div class="icon">⏳</div><span>Loading data…</span></div>\`;
}

function errorHTML(msg, retryFn) {
  return \`<div class="state-box error"><div class="icon">⚠️</div><span>\${msg}</span><button onclick="(\${retryFn.toString()})()">Try again</button></div>\`;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────
async function fetchJSON(path) {
  if (cache[path]) return cache[path];
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  const data = await res.json();
  cache[path] = data;
  return data;
}

// ── Users panel ───────────────────────────────────────────────────────────────
async function loadUsers() {
  setPanel('panel-users', loadingHTML());
  try {
    const users = await fetchJSON('/users');
    const rows = users.map(u => \`
      <tr>
        <td>
          <div class="user-name">\${u.name}</div>
          <div class="user-username">@\${u.username}</div>
        </td>
        <td><div class="user-email">\${u.email}</div></td>
        <td><div class="company-name">\${u.company.name}</div></td>
        <td><a class="website-link" href="https://\${u.website}" target="_blank">\${u.website}</a></td>
        <td style="font-size:12px;color:#475569">\${u.address.city}</td>
      </tr>
    \`).join('');

    setPanel('panel-users', \`
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr>
            <th>Name</th><th>Email</th><th>Company</th><th>Website</th><th>City</th>
          </tr></thead>
          <tbody>\${rows}</tbody>
        </table>
      </div>
    \`);
  } catch (e) {
    setPanel('panel-users', errorHTML('Failed to load users: ' + e.message, loadUsers));
  }
}

// ── Posts panel ───────────────────────────────────────────────────────────────
async function loadPosts() {
  setPanel('panel-posts', loadingHTML());
  try {
    const posts = await fetchJSON('/posts?_limit=24');
    const cards = posts.map(p => \`
      <div class="post-card">
        <div class="post-id">Post #\${p.id} · User \${p.userId}</div>
        <div class="post-title">\${p.title}</div>
        <div class="post-body">\${p.body.slice(0, 100)}\${p.body.length > 100 ? '…' : ''}</div>
      </div>
    \`).join('');
    setPanel('panel-posts', \`<div class="posts-grid">\${cards}</div>\`);
  } catch (e) {
    setPanel('panel-posts', errorHTML('Failed to load posts: ' + e.message, loadPosts));
  }
}

// ── Todos panel ───────────────────────────────────────────────────────────────
async function loadTodos() {
  setPanel('panel-todos', loadingHTML());
  try {
    const todos = await fetchJSON('/todos?_limit=40');
    renderTodos(todos);
  } catch (e) {
    setPanel('panel-todos', errorHTML('Failed to load todos: ' + e.message, loadTodos));
  }
}

function renderTodos(todos) {
  const filtered = todos.filter(t => {
    if (todoFilter === 'done')    return t.completed;
    if (todoFilter === 'pending') return !t.completed;
    return true;
  });
  const done    = todos.filter(t => t.completed).length;
  const pending = todos.length - done;

  const items = filtered.map(t => \`
    <div class="todo-item">
      <div class="todo-check \${t.completed ? 'done' : ''}">
        \${t.completed ? '✓' : ''}
      </div>
      <span class="todo-text \${t.completed ? 'done' : ''}">\${t.title}</span>
      <span class="todo-user">user \${t.userId}</span>
    </div>
  \`).join('');

  setPanel('panel-todos', \`
    <div class="todos-header">
      <span>\${done} done · \${pending} pending · showing \${filtered.length}</span>
      <div class="filter-btns">
        <button class="filter-btn \${todoFilter === 'all' ? 'active' : ''}" onclick="setFilter('all')">All</button>
        <button class="filter-btn \${todoFilter === 'done' ? 'active' : ''}" onclick="setFilter('done')">Done</button>
        <button class="filter-btn \${todoFilter === 'pending' ? 'active' : ''}" onclick="setFilter('pending')">Pending</button>
      </div>
    </div>
    <div class="todo-list">\${items.length ? items : '<div class="state-box"><span>No items match this filter.</span></div>'}</div>
  \`);
}

window.setFilter = function(f) {
  todoFilter = f;
  // Re-render from cache without refetching
  const cached = cache['/todos?_limit=40'];
  if (cached) renderTodos(cached);
};

// ── Tab switching ─────────────────────────────────────────────────────────────
const loaders = { users: loadUsers, posts: loadPosts, todos: loadTodos };
let activeTab = 'users';

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('panel-' + tab).classList.add('active');
    activeTab = tab;
    loaders[tab]();
  });
});

// ── Refresh button ────────────────────────────────────────────────────────────
$('refreshBtn').addEventListener('click', () => {
  cache = {};
  todoFilter = 'all';
  const btn = $('refreshBtn');
  btn.classList.add('spinning');
  btn.textContent = '↻ Loading…';
  loaders[activeTab]().finally(() => {
    btn.classList.remove('spinning');
    btn.textContent = '↻ Refresh';
  });
});

// ── Initial load ─────────────────────────────────────────────────────────────
loadUsers();`,
      },
    ],
  },
];

// ─── TemplateChooserModal ─────────────────────────────────────────────────────

export function TemplateChooserModal({ onSelect, onClose }: TemplateChooserModalProps) {
  const [search, setSearch] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Focus search on mount
  React.useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape / backdrop close
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered: Template[] = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return TEMPLATES;
    return TEMPLATES.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [search]);

  function handleSelect(template: Template) {
    onSelect(template.files);
    onClose();
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.70)' }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Choose a template"
    >
      {/* Modal */}
      <div
        className="relative flex flex-col w-full overflow-hidden rounded-xl border"
        style={{
          maxWidth: 680,
          maxHeight: '90vh',
          backgroundColor: '#1e2030',
          borderColor: '#2a2d4a',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: '#2a2d4a' }}
        >
          <div>
            <h2 className="text-base font-bold" style={{ color: '#E8E8F0', margin: 0 }}>
              Choose a Template
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#8B90B8', margin: 0 }}>
              Pick a starter — your workspace opens with working code instantly.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-lg transition p-1.5"
            style={{ color: '#8B90B8' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 shrink-0 border-b" style={{ borderColor: '#2a2d4a' }}>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: '#4A5070' }}
            />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full rounded-lg text-sm outline-none transition pl-9 pr-4 py-2 border"
              style={{
                backgroundColor: '#0d0f1d',
                borderColor: '#2a2d4a',
                color: '#E8E8F0',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#7C6BF2')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#2a2d4a')}
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 text-sm"
              style={{ color: '#4A5070' }}
            >
              <span className="text-3xl mb-3">🔍</span>
              No templates match your search.
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {filtered.map((tpl) => (
                <TemplateCard key={tpl.id} template={tpl} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-center px-6 py-3 border-t shrink-0"
          style={{ borderColor: '#2a2d4a' }}
        >
          <button
            onClick={onClose}
            className="text-xs transition"
            style={{ color: '#4A5070' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#8B90B8')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#4A5070')}
          >
            Or import from GitHub →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onSelect,
}: {
  template: Template;
  onSelect: (t: Template) => void;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      className="relative flex flex-col rounded-lg p-4 cursor-pointer transition-all"
      style={{
        backgroundColor: hovered ? '#16172A' : '#13141F',
        border: `1px solid ${hovered ? '#7C6BF2' : '#1E2240'}`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(template)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(template)}
      aria-label={`Use ${template.name} template`}
    >
      {/* Icon + title row */}
      <div className="flex items-start gap-3 mb-2">
        <span className="text-3xl leading-none shrink-0 select-none">{template.emoji}</span>
        <div className="min-w-0">
          <div className="font-bold text-sm leading-tight" style={{ color: '#E8E8F0' }}>
            {template.name}
          </div>
          {/* File count badge */}
          <span
            className="inline-block text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded"
            style={{ backgroundColor: '#1E2240', color: '#8B90B8' }}
          >
            {template.files.length} {template.files.length === 1 ? 'file' : 'files'}
          </span>
        </div>
      </div>

      {/* Description */}
      <p
        className="text-xs leading-relaxed mb-3 line-clamp-2 flex-1"
        style={{ color: '#8B90B8', margin: '0 0 10px' }}
      >
        {template.description}
      </p>

      {/* Tag chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {template.tags.map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-2 py-0.5 rounded font-medium"
            style={{ backgroundColor: '#1E2240', color: '#8B90B8' }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* "Use Template" button — visible on hover */}
      <button
        className="w-full text-xs font-semibold py-2 rounded-lg transition-all"
        style={{
          backgroundColor: hovered ? '#7C6BF2' : '#1E2240',
          color: hovered ? '#ffffff' : '#4A5070',
          border: 'none',
          cursor: 'pointer',
          opacity: hovered ? 1 : 0.7,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#6C5BE2')}
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = hovered ? '#7C6BF2' : '#1E2240')
        }
        onClick={(e) => {
          e.stopPropagation();
          onSelect(template);
        }}
      >
        Use Template
      </button>
    </div>
  );
}
