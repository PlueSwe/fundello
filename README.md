# Fundello

Statisk webbplats för Global Child Foundations finansieringsarbete.
Finansieringskatalogen ligger på startsidan `index.html`.

## Lokal utveckling

Starta en lokal webbserver i repots rot:

```bash
python -m http.server 8080
```

Öppna sedan `http://localhost:8080`.

## Data

Webbplatsen läser följande filer vid sidladdning:

- `news.json`
- `applications.json`
- `funding_sources.json`

Filerna kan ersättas av agentsystemet utan att webbplatsen behöver byggas om.
Botens motsvarande Python-konstanter finns i `bot/funding_sources.py`.

## Publicering

Push till `main` startar `.github/workflows/deploy.yml`, som publicerar webbplatsen
via FTP. Inloggningsuppgifterna lagras som GitHub Actions-secrets:

- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`

Webbplatsen publiceras till `/public_html/`.
