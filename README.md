# fallenzone.io

Personal portfolio. Twenty shipped projects arranged as a CSS3D periodic table.

- **Astro 5** static build, zero framework runtime; the only client script is the three.js scene
- **three.js CSS3DRenderer** with table / sphere / helix / grid layouts, adapted from the
  [css3d_periodictable](https://threejs.org/examples/css3d_periodictable.html) example (MIT)
- Tiles are server-rendered HTML, so the project list works without JavaScript and stays crawlable
- Click a tile: the rest of the table scatters into a slow-turning shell and a detail panel opens

## Develop

```sh
npm install
npm run dev
```

## Deploy

Pushes to `main` build and deploy to Cloudflare Workers (static assets) via GitHub Actions.
Requires repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit) and `CLOUDFLARE_ACCOUNT_ID`.

Manual deploy: `npm run deploy`
