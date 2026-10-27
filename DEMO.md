# DEMO — cara nampilin FeedbackOps AI pas presentasi

> File ini buat SIAPA SAJA (termasuk si interviewernya) yang mau liat project
> ini hidup. Artefak utama = video rekaman; live demo = backup opsional.

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

# 2. Frontend demo UI
cd frontend && npm run dev   # → http://localhost:3000

# 3. (opsional) sanity check
curl -s -X POST http://localhost:5678/webhook/feedbackops \
  -H "Content-Type: application/json" \
  -d '{"feedback":"warm-up probe","source":"pre-interview","request_id":"probe-1"}'
```

Urutan menampilkan ke interviewer (fallback kalau tertarik live):

1. Buka **http://localhost:3000** → pencet tombol **"Urgent billing"** →
   tunjukkan `routing_decision: high_priority` + human-review badge.
2. Buka **http://localhost:5678** (n8n) → tunjukkan 10 node dan klik
   **Gemini Classify** & **Deterministic Routing** — "AI proposes, code disposes".
3. Pencet tombol **"Prompt injection"** → payload diperlakukan sebagai data,
   diarahkan ke review, BUKAN diikuti.
4. Pencet **"Invalid request (empty)"** → ditolak <20 ms, nol token AI terpakai.
5. Buka Executions list → tunjukkan baris audit `[AUDIT]` satu baris per eksekusi.

## Mode 3 — Test suite (bukti engineering, bukan klaim)

```bash
export N8N_API_KEY=...   # Settings → n8n API (lihat SETUP.md)
export N8N_WORKFLOW_ID=... # lihat SETUP.md
python3 scripts/run_tests.py --full
```

Lihat [`TESTING.md`](TESTING.md) untuk tabel bukti per skenario dan apa yang
sengaja TIDAK dijalankan (diungungkap, tidak disembunyikan).

## Klaim yang aman vs tidak aman di presentasi

| Aman dikatakan ✅ | Jangan dikatakan ❌ |
|---|---|
| "Klasifikasi Gemini live end-to-end gratis tier" | "Google Sheets sudah terhubung" (belum — jalur audit konsol) |
| "Fail-safe teruji, termasuk kejadian rate-limit nyata" | "Webhook sudah satu tingkat keamanan produksi" (SECURITY.md mendokumentasikan celah) |
| "20 skenario pengujian dengan fase live + mock" | "Sudah benar tepat-satu-kali" (dedupe masih di memori) |

## Catatan operasional

- Gemini free tier kadang throttle → responsnya JADI demo fail-safe
  (`review_required: true` + `llm_error`), tunggu 30-60 detik lalu coba lagi.
- Laptop tidur = demo mati; n8n sudah `--restart unless-stopped` + frontend
  butuh `npm run dev`.
- Workflow export: [`n8n/feedbackops_ai.json`](n8n/feedbackops_ai.json), panduan
  import per node: [`n8n/WORKFLOW_GUIDE.md`](n8n/WORKFLOW_GUIDE.md).
