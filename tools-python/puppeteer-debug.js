#!/usr/bin/env node
// Usage: node tools/puppeteer-debug.js <url> <screenshot-path> <log-path>
// Example: node tools/puppeteer-debug.js http://127.0.0.1:8080/app build/debug.png build/console.log

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function run() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error('Usage: node tools/puppeteer-debug.js <url> [screenshot-path] [log-path]');
        process.exitCode = 2;
        return;
    }

    const url = args[0];
    const screenshotPath = args[1] || 'build/frontend-debug.png';
    const logPath = args[2] || 'build/frontend-console.log';

    // ensure output dir
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const logs = [];
    const networkFailures = [];
    const non200 = [];

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000);

        // Install early error handlers so we capture errors that happen
        // before page-level listeners can attach (e.g. during module execution).
        await page.evaluateOnNewDocument(() => {
            try {
                window.__jobtrack_capture_errors = [];
                window.addEventListener('error', e => {
                    try {
                        window.__jobtrack_capture_errors.push({
                            kind: 'error',
                            message: e.message,
                            filename: e.filename || (e.filename || null),
                            lineno: e.lineno || null,
                            colno: e.colno || null,
                            stack: e.error && e.error.stack ? e.error.stack : null,
                            timestamp: new Date().toISOString()
                        });
                    } catch (err) {
                        // ignore
                    }
                }, true);

                window.addEventListener('unhandledrejection', e => {
                    try {
                        const reason = e && e.reason;
                        window.__jobtrack_capture_errors.push({
                            kind: 'unhandledrejection',
                            message: reason && reason.message ? reason.message : String(reason),
                            stack: reason && reason.stack ? reason.stack : null,
                            timestamp: new Date().toISOString()
                        });
                    } catch (err) {
                        // ignore
                    }
                }, true);
            } catch (err) {
                // ignore
            }
        });

        page.on('console', msg => {
            try {
                const text = msg.text();
                const type = msg.type();
                const location = msg.location ? `${msg.location().url}:${msg.location().lineNumber || 0}` : '';
                const entry = { kind: 'console', type, text, location, timestamp: new Date().toISOString() };
                logs.push(entry);
                console.log('[console]', type, text);
            } catch (e) {
                console.log('console event error', e);
            }
        });

        page.on('pageerror', err => {
            const entry = { kind: 'pageerror', message: err.message, stack: err.stack, timestamp: new Date().toISOString() };
            logs.push(entry);
            console.error('[pageerror]', err.message);
        });

        page.on('requestfailed', req => {
            const entry = { kind: 'requestfailed', url: req.url(), method: req.method(), failure: req.failure && req.failure().errorText, timestamp: new Date().toISOString() };
            networkFailures.push(entry);
            logs.push(entry);
            console.error('[requestfailed]', req.url(), req.failure && req.failure().errorText);
        });

        page.on('response', resp => {
            const status = resp.status();
            if (status >= 400) {
                const entry = { kind: 'response-error', url: resp.url(), status, timestamp: new Date().toISOString() };
                non200.push(entry);
                logs.push(entry);
                console.warn('[response]', resp.status(), resp.url());
            }
        });

        console.log('Navigating to', url);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Give React some extra time to run effects — allow a bit more for deferred startup
        // Use a well-supported delay instead of Puppeteer's waitForTimeout
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Capture screenshot
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('Saved screenshot to', screenshotPath);
        // Capture DOM snapshot and computed styles for #root
        const outerHTML = await page.evaluate(() => {
            try {
                return document.documentElement.outerHTML;
            } catch (e) {
                return null;
            }
        });

        const rootComputed = await page.evaluate(() => {
            try {
                const el = document.getElementById('root');
                if (!el) return null;
                const cs = getComputedStyle(el);
                const out = {};
                for (let i = 0; i < cs.length; i++) {
                    const prop = cs[i];
                    out[prop] = cs.getPropertyValue(prop);
                }
                return out;
            } catch (e) {
                return null;
            }
        });

        // Truncate outerHTML to keep the log size reasonable
        const outerHTMLTrunc = outerHTML ? (outerHTML.length > 200000 ? outerHTML.slice(0, 200000) + '\n<!-- TRUNCATED -->' : outerHTML) : null;

        // Read any early-captured errors installed via evaluateOnNewDocument
        let earlyErrors = null;
        try {
            earlyErrors = await page.evaluate(() => {
                try { return window.__jobtrack_capture_errors || []; } catch (e) { return null; }
            });
        } catch (e) {
            earlyErrors = null;
        }

        // List script tags and capture excerpts of any same-origin asset scripts
        const scriptsList = await page.evaluate(async () => {
            try {
                const scripts = Array.from(document.scripts || []).map(s => ({ src: s.src || null, type: s.type || null, inline: !!s.innerText }));
                const assets = [];
                for (const s of scripts) {
                    if (!s.src) continue;
                    try {
                        const url = new URL(s.src, window.location.href);
                        if (url.origin === window.location.origin) {
                            const text = await fetch(url.href).then(r => r.text()).catch(e => null);
                            assets.push({ src: s.src, excerpt: text ? text.slice(0, 2000) : null });
                        }
                    } catch (e) {
                        // ignore
                    }
                }
                return { scripts, assets };
            } catch (e) {
                return null;
            }
        });

        // Save logs including DOM snapshot
        fs.writeFileSync(logPath, JSON.stringify({ capturedAt: new Date().toISOString(), url, logs, networkFailures, non200, earlyErrors, domSnapshot: { outerHTML: outerHTMLTrunc, rootComputed, scriptsList } }, null, 2));
        console.log('Saved logs to', logPath);

        // Print a short summary
        console.log('Summary:');
        console.log('  console messages:', logs.filter(l => l.kind === 'console').length);
        console.log('  page errors:', logs.filter(l => l.kind === 'pageerror').length);
        console.log('  request failures:', networkFailures.length);
        console.log('  non-2xx responses:', non200.length);
    } catch (err) {
        console.error('ERROR running Puppeteer script:', err);
        process.exitCode = 3;
    } finally {
        await browser.close();
    }
}

run();
