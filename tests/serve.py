#!/usr/bin/env python3
"""Serves the family site for UI tests with a mocked Supabase client.

Usage: python3 tests/serve.py [port]   (from family-home; default port 8124)
Every index.html gets the CDN supabase script replaced by tests/mock-supabase.js, with
tests/fixtures/money-seed.json (gitignored) loaded as window.__SEED__ first, and config.js is stubbed.
Open http://localhost:8124/?as=kevin (or ?as=lily, ?as=amy, ?as=janet) and /money/?as=lily etc.
"""
import http.server, json, os, sys, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, 'tests', 'fixtures', 'money-seed.json')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8124

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_GET(self):
        path = self.path.split('?')[0]
        if path.endswith('/'): path += 'index.html'
        if path == '/config.js':
            return self.send(b"window.APP_CONFIG={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'x',TIME_ZONE:'America/Detroit',ELECTION:{name:'Michigan General Election',date:'2026-11-03',guide:'/voter/'}};", 'text/javascript')
        if path == '/tests/mock.js':
            seed = open(SEED, 'rb').read() if os.path.exists(SEED) else b'{}'
            return self.send(b'window.__SEED__=' + seed + b';\n' + open(os.path.join(ROOT, 'tests', 'mock-supabase.js'), 'rb').read(), 'text/javascript')
        if path.endswith('index.html'):
            f = os.path.join(ROOT, path.lstrip('/'))
            if os.path.exists(f):
                html = open(f, encoding='utf-8').read()
                html = re.sub(r'<script src="https://cdn\.jsdelivr\.net/npm/@supabase[^"]*"></script>', '<script src="/tests/mock.js"></script>', html)
                return self.send(html.encode(), 'text/html; charset=utf-8')
        return super().do_GET()
    def send(self, body, ctype):
        self.send_response(200); self.send_header('content-type', ctype); self.send_header('cache-control', 'no-store'); self.end_headers(); self.wfile.write(body)
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*'); super().end_headers()
    def log_message(self, *a): pass

print(f'Serving {ROOT} with the mock Supabase client on http://localhost:{PORT}/')
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
