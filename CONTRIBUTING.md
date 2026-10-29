# Contributing

This is a portfolio reference implementation, but small fixes and security
reports are welcome.

## Before opening a PR

```bash
make test
cd frontend && npm ci && npm run build
```

If you change the n8n workflow, regenerate the export instead of editing JSON by
hand:

```bash
python3 scripts/build_workflow.py \
  <GEMINI_CRED_ID> "Gemini API (header auth)" \
  <WEBHOOK_CRED_ID> "FeedbackOps Webhook Auth"
```

Never commit `.env`, real credentials, customer data, or generated `.data/`
files. Use synthetic feedback only.
