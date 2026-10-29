# Case Study — FeedbackOps AI untuk Holding Company

> **Status:** kerangka case study untuk pilot internal. Nama perusahaan dan unit
> bisnis sengaja memakai placeholder agar mudah diganti dengan branding PT kamu.
> Angka pada bagian KPI adalah target, bukan hasil pengukuran.

## Ringkasan

Holding company biasanya punya satu masalah yang berulang di banyak unit:
feedback pelanggan masuk lewat channel berbeda, dibaca oleh tim berbeda, dan
diselesaikan dengan standar yang berbeda pula. Akibatnya manajemen sulit melihat
prioritas lintas unit, sulit mengukur SLA, dan sulit menjawab "siapa yang sudah
menangani ini?".

FeedbackOps AI memakai pola **central intake, local resolution**:

1. Semua feedback masuk ke satu webhook.
2. AI mengklasifikasi sentimen, kategori, urgensi, dan ringkasan.
3. Rule deterministik menentukan `normal`, `high_priority`, atau `review`.
4. Setiap request dicatat ke audit trail.
5. Reviewer unit menangani item yang butuh keputusan manusia.
6. Manajemen mendapat jejak audit, bukan status chat yang hilang.

Prinsip utamanya: **LLM proposes, deterministic code disposes.** AI tidak
mengirim refund, tidak menutup tiket, dan tidak mengambil keputusan bisnis.

## Konteks yang diasumsikan

- `[Nama Holding]` memiliki beberapa unit usaha, misalnya `[Unit Retail]`,
  `[Unit Logistik]`, dan `[Unit SaaS]`.
- Feedback pelanggan masuk dari form, email, chat, atau aplikasi.
- Group Customer Operations menjadi pintu masuk bersama; tiap unit tetap punya
  reviewer yang memahami konteks bisnisnya.
- Manajemen butuh visibilitas lintas unit tanpa membangun satu sistem berbeda
  untuk setiap anak perusahaan.

Jika struktur PT kamu berbeda, bagian ini yang pertama diganti. Jangan memakai
angka volume atau nama unit tanpa data nyata.

## Masalah yang diselesaikan

| Masalah | Dampak ke holding | Cara project ini membantu |
|---|---|---|
| Triage manual dan tidak konsisten | Prioritas berbeda antar unit | Rule routing yang sama untuk semua unit |
| Feedback tersebar di banyak channel | Manajemen tidak punya satu gambaran | Satu intake + audit trail |
| Item penting tenggelam | SLA dan eskalasi tidak jelas | `high_priority` dan `review` masuk queue |
| Tidak ada jejak keputusan | Sulit audit dan evaluasi | Event review append-only + identitas reviewer |
| AI dipakai tanpa kontrol | Risiko jawaban atau aksi yang salah | AI hanya proposal; validasi dan routing oleh kode |
| Biaya operasional support | Waktu habis untuk baca dan routing | Manusia fokus pada item yang benar-benar perlu |

## Contoh alur lintas unit

| Skenario | Unit | Kategori | Routing | Penanganan |
|---|---|---|---|---|
| Pelanggan ditagih dua kali dan minta selesai hari ini | `[Unit Retail]` | billing | `high_priority` + review | Reviewer unit retail |
| Refund belum diproses setelah 10 hari | `[Unit Logistik]` | billing | review | Reviewer unit logistik |
| Export laporan konsolidasi gagal | `[Unit SaaS]` | technical_issue | review | Tim teknis unit SaaS |
| Apresiasi dashboard baru | `[Unit Retail]` | product_feedback | normal | Auto-response draft |
| Pesan kosong atau tidak jelas | Group intake | unknown | review/reject | Group ops |

Catatan penting: versi saat ini **belum** memiliki field `business_unit` dan
belum membatasi reviewer per unit. Untuk pilot, pemisahan unit masih dilakukan
lewat kategori, sumber, atau proses operasional. Penambahan unit scoping adalah
pekerjaan Phase 2, bukan fitur yang sudah ada.

## Operating model yang disarankan

| Layer | Peran | Tanggung jawab |
|---|---|---|
| L1 — Group Customer Operations | Shared service | Menerima feedback, menjaga intake, memantau queue dan SLA |
| L2 — Unit reviewer | `[Unit Retail]`, `[Unit Logistik]`, `[Unit SaaS]` | Menyelesaikan item sesuai konteks unit |
| L3 — Management | Group ops / risk / CX | Melihat tren, audit, dan kualitas keputusan |
| Platform | n8n + Next.js + audit store | Validasi, klasifikasi, routing, pencatatan |

Rekomendasi tata kelola:

- Satu kebijakan routing untuk seluruh grup.
- Kalibrasi mingguan terhadap sampel review manusia.
- Reviewer hanya boleh menutup item yang menjadi tanggung jawabnya.
- Perubahan rule harus melalui review dan tercatat.
- Item `high_priority` punya SLA yang berbeda dari `normal`.

## KPI pilot

Ini target awal untuk diukur, bukan klaim hasil:

| KPI | Target pilot | Cara mengukur |
|---|---|---|
| Auto-triage coverage | ≥ 60% item tidak perlu sentuhan awal manusia | Jumlah `normal` / total |
| Human review SLA (high priority) | ≤ 15 menit | Waktu audit → waktu resolved |
| Misroute rate | ≤ 5% | Sampling reviewer |
| Audit completeness | 100% request punya `request_id` dan event | Query audit store |
| Review attribution | 100% aksi punya `reviewed_by` | Event review |
| Cost per 1.000 request | Diukur, bukan diasumsikan | Log provider + durasi |
| CSAT / resolution quality | Baseline lalu dibandingkan | Survei atau sampling |

Jangan menampilkan angka penghematan sebagai fakta sebelum ada baseline dari PT
kamu. Waktu manual 2–4 menit per item adalah asumsi untuk diskusi, bukan hasil
pengukuran.

## Rollout yang realistis

### Phase 1 — Pilot satu unit (2–4 minggu)

- Pilih satu unit dengan volume cukup dan data non-sensitif.
- Gunakan data sintetis atau data yang sudah dianonimkan.
- Kumpulkan 100–300 contoh untuk mengukur misroute.
- Tetapkan reviewer dan SLA.
- Jangan hubungkan ke sistem yang bisa melakukan aksi finansial.

### Phase 2 — Tiga unit (4–8 minggu)

- Tambahkan unit scoping dan kategori spesifik grup.
- Pindahkan rate limit ke Redis dan audit store ke Postgres.
- Tambahkan SSO/RBAC dan sesi yang bisa dicabut.
- Buat dashboard tren lintas unit.
- Jalankan tabletop exercise untuk item salah routing.

### Phase 3 — Group-wide

- Integrasi tiket/email/chat resmi.
- Secrets manager, backup/PITR, dan disaster recovery drill.
- Security review, penetration test, dan DPA provider LLM.
- SLO, on-call, incident response, dan audit ke SIEM.
- Baru layak disebut production untuk perusahaan.

## Yang sudah ada vs yang belum

Sudah ada di repo:

- Webhook auth, server-side proxy, HMAC audit, rate limit per IP.
- Validasi input sebelum LLM dan fail-safe ke review.
- Audit SQLite, retensi, redaksi PII, dan review event append-only.
- Reviewer per-user dengan scrypt hash dan `reviewed_by`.
- Policy test, API test, Docker, CI, dan dokumentasi operasional.

Belum cukup untuk production perusahaan:

- Belum ada SSO/MFA/RBAC dan unit scoping.
- SQLite masih single-writer; belum HA, backup/PITR, atau multi-instance.
- Rate limit masih in-memory; belum Redis.
- Belum ada queue/dead-letter, SLO, on-call, atau load test.
- Belum ada WAF, SIEM, secrets manager, atau penetration test.
- Belum ada integrasi tiket/email/chat resmi.
- Belum ada DPA/provider review dan kebijakan data residency.

## Cara memakai case ini saat presentasi

Framing 90 detik:

> "Di holding company, masalahnya bukan kekurangan AI. Masalahnya adalah
> feedback yang sama harus dibaca ulang oleh unit yang berbeda, dengan standar
> yang berbeda, dan tanpa jejak keputusan yang bisa diaudit.
>
> FeedbackOps AI membuat satu pintu masuk untuk seluruh grup. AI hanya
> mengklasifikasi dan mengusulkan; rule deterministik yang menentukan routing.
> Item berisiko masuk ke review queue, reviewer unit menutupnya, dan setiap aksi
> tercatat dengan identitas reviewer.
>
> Jadi nilai utamanya bukan 'AI menjawab pelanggan', tetapi **konsistensi dan
> akuntabilitas lintas unit**. Untuk production, lapisan identitas, database,
> dan operasi masih perlu diperkuat — dan itu justru bagian dari roadmap."

Kalimat yang aman diklaim:

- "Pola central intake + local resolution untuk multi-unit group."
- "AI proposal, deterministic routing, human accountable."
- "Audit dan reviewer attribution sudah jalan di demo."
- "Siap pilot internal, belum siap production penuh."

Kalimat yang jangan diklaim:

- "Sudah multi-tenant / unit-scoped."
- "Sudah SSO, MFA, atau RBAC."
- "Sudah HA, backup, atau siap SLA 24/7."
- "Sudah menghemat X jam" tanpa baseline.

## Personalisasi branding

Ganti placeholder berikut saat membawa case ini ke PT kamu:

| Placeholder | Ganti dengan |
|---|---|
| `[Nama Holding]` | Nama legal/group brand |
| `[Unit Retail]` | Nama unit usaha retail |
| `[Unit Logistik]` | Nama unit logistik |
| `[Unit SaaS]` | Nama unit teknologi/SaaS |

Lalu sesuaikan:

1. Judul dan ringkasan di file ini.
2. Contoh skenario pada tabel dan `samples/synthetic_feedback.json`.
3. Nama reviewer di `REVIEW_USERS` (jangan pakai nama asli di repo publik).
4. Kebijakan retensi, klasifikasi data, dan daftar channel di `SECURITY.md`.
5. Target KPI setelah baseline pilot tersedia.

Untuk repo publik, tetap gunakan data sintetis dan jangan commit nama pelanggan,
kredensial, atau ID workflow live.
