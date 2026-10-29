# DEMO — cara nampilin FeedbackOps AI pas presentasi

> File ini buat SIAPA SAJA (termasuk si interviewernya) yang mau liat project
> ini hidup. Artefak utama = video rekaman; live demo = backup opsional.

## Framing holding company

Kalau dibawa ke konteks `[Nama Holding]`, jangan mulai dari "ini project AI".
Mulai dari masalah grup: feedback pelanggan masuk dari beberapa unit, dibaca tim
yang berbeda, dan tidak punya jejak keputusan yang seragam. Posisikan project ini
sebagai **central intake + local resolution**: AI mengklasifikasi, rule
deterministik merouting, reviewer unit menyelesaikan, dan manajemen mendapat
audit. Detail lengkap ada di [`CASE_STUDY.md`](CASE_STUDY.md).

Kalimat yang aman: "Siap pilot internal, belum production penuh." Jangan klaim
sudah multi-tenant, SSO/RBAC, HA, atau penghematan angka tanpa baseline.

## Mode 1 — Video (paling direkomendasi) 🎬

Demo utama direkam sebagai screen recording (tidak ada demo live yang
berisiko). Rencana rekaman 8-step + pembicaraan 2 menit ada di
[`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).

**Link video: `TODO: paste URL video unlisted di sini setelah rekam`**

## Mode 2 — Live di laptop (Day-of checklist)

Semua jalan lokal di laptop ini. Butuh ±2 menit sebelum presentasi:

```bash
# 1. n8n (workflow "FeedbackOps AI - Feedback Triage" sudah ter-import & active)
docker start n8n          # → http://localhost:5678

# 2. Frontend demo UI (butuh frontend/.env.local - lihat SETUP.md)
cd frontend && npm run dev   # → http://localhost:3000

# 3. (opsional) seed data review + sanity check dengan header auth
python3 scripts/seed_demo.py
export WEBHOOK_SECRET="$(sed -n 's/^WEBHOOK_SECRET=//p' ../.env)"
curl -s -X POST http://localhost:5678/webhook/feedbackops \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d '{"feedback":"warm-up probe","source":"pre-interview","request_id":"probe-1"}'
```

Urutan menampilkan ke interviewer (fallback kalau tertarik live):

1. Buka **http://localhost:3000** → pencet tombol **"Urgent billing"** →
   tunjukkan `routing_decision: high_priority` + human-review badge.
2. Buka **http://localhost:5678** (n8n) → tunjukkan node utama dan klik
   **Gemini Classify** & **Deterministic Routing** — "AI proposes, code disposes".
3. Pencet tombol **"Prompt injection"** → payload diperlakukan sebagai data,
   diarahkan ke review, BUKAN diikuti.
4. Pencet **"Invalid request (empty)"** → ditolak <20 ms, nol token AI terpakai.
5. (Opsional) tunjukkan bahwa request tanpa `X-Webhook-Secret` ditolak HTTP 403.
6. Buka Executions list → tunjukkan baris audit `[AUDIT]` satu baris per eksekusi.
7. Buka **http://localhost:3000/review** → login sebagai `reviewer` dengan
   password dari `.env` → tunjukkan antrean review persisten (counts + baris
   high-priority), lalu klik **Mark resolved**. Jelaskan bahwa aksi review
   menambah event, bukan menimpa baris audit, mencatat username reviewer, dan
   halaman ini tidak terbuka tanpa sesi reviewer.

## Mode 3 — Test suite (bukti engineering, bukan klaim)

```bash
export N8N_API_KEY=...   # Settings → n8n API (lihat SETUP.md)
export N8N_WORKFLOW_ID=... # lihat SETUP.md
python3 scripts/run_tests.py --full

# offline + built-app evidence
node scripts/evaluate_policy.mjs
make test-api
```

Lihat [`TESTING.md`](TESTING.md) untuk tabel bukti per skenario dan apa yang
sengaja TIDAK dijalankan (diungkapkan, tidak disembunyikan).

## Klaim yang aman vs tidak aman di presentasi

| Aman dikatakan ✅ | Jangan dikatakan ❌ |
|---|---|
| "Klasifikasi Gemini live end-to-end gratis tier" | "Google Sheets sudah terhubung" (belum) |
| "Fail-safe teruji, termasuk kejadian rate-limit nyata" | "Audit store sudah produksi skala besar" (SQLite satu instance) |
| "Audit SQLite persisten + review queue dengan reviewer bernama" | "SSO/MFA atau direktori user terpusat" (masih `REVIEW_USERS` lokal) |
| "Rate limit per IP untuk triage/audit/review/login" | "Rate limit terdistribusi" (masih in-memory per instance) |
| "Webhook pakai shared secret, browser tidak pernah pegang secret" | "Sudah benar tepat-satu-kali" (dedupe masih di memori) |
| "20 documented live/mock checks + 30 policy cases + 25 API assertions" | "CI menjalankan live test" (CI tidak memakai API key) |

## Catatan operasional

- Gemini free tier kadang throttle → responsnya JADI demo fail-safe
  (`review_required: true` + `llm_error`), tunggu 30-60 detik lalu coba lagi.
- Laptop tidur = demo mati; n8n sudah `--restart unless-stopped` + frontend
  butuh `npm run dev` dengan `frontend/.env.local`.
- Workflow export: [`n8n/feedbackops_ai.json`](n8n/feedbackops_ai.json), panduan
  import per node: [`n8n/WORKFLOW_GUIDE.md`](n8n/WORKFLOW_GUIDE.md).
