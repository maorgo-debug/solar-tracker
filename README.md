# Solar Tracker 🌞

Real-time solar power generation tracker with image analysis and ROI projections.

## Features

- 📸 **Image Analysis** — Upload SolarEdge screenshots to extract kWh readings
- 📊 **Three Views** — Today (hourly), Week (7-day chart), ROI (loan payback)
- 💾 **Local Storage** — All data persists in browser
- 🎯 **Projections** — End-of-day and annual revenue forecasts
- 📈 **Loan Tracking** — Monitor financing progress toward 80k₪ repayment

## Quick Start

### Local Development

```bash
npm install
npm run dev
```

Visit http://localhost:5173

### Build for Production

```bash
npm run build
```

## Deploy to Vercel

1. **Push to GitHub** (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Solar tracker"
   git remote add origin https://github.com/YOUR_USERNAME/solar-tracker.git
   git push -u origin main
   ```

2. **Deploy to Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repo
   - Click "Deploy"
   - Your app is live at `https://[your-app].vercel.app`

**Alternative:** Deploy without GitHub by running `npm install -g vercel`, then `vercel` in the project directory.

## Using Claude Vision API

The image upload feature requires a Claude API key. Set it as an environment variable:

```bash
# .env.local
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Then update the fetch URL in `src/App.jsx` to read from `import.meta.env.VITE_ANTHROPIC_API_KEY`.

## Configuration

Edit `src/App.jsx` constants:
- `TARIFF` — ₪ per kWh
- `SYSTEM_KWP` — System size
- `LOAN_AMOUNT` — Total financing
- `LOAN_MONTHLY` — Monthly payment

---

Built with React + Vite + Recharts
