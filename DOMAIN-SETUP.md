# Custom .com domain — setup guide

Live site: https://anshmishra765487-sketch.github.io/ram-darbar-tracker/

## 1. Domain kharido (aapko karna hai)

`ramdarbartracker.com` abhi **available** hai (checked 26 Oct 2026, RDAP).

| Registrar | Approx price (1st year) | Notes |
|---|---|---|
| Cloudflare Registrar | ~₹950/yr | At-cost price, renewal bhi same. No upsell. |
| Namecheap | ~₹1000–1200/yr | Simple UI, free WHOIS privacy. |
| GoDaddy / Hostinger India | ₹500–900 first year | Renewal ₹1200+, upsell zyada. |

> Student ho? GitHub Student Developer Pack me Namecheap se free `.me` / `.tech` milta hai (`.com` nahi).

## 2. GitHub Pages + DNS (ye main kar dunga)

Domain kharidne ke baad bas ye 3 cheezein change hoti hain:

**a) `frontend/public/CNAME` banao:**
```
ramdarbartracker.com
```

**b) DNS records (registrar ke DNS panel me):**

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `anshmishra765487-sketch.github.io` |

**c) GitHub → Settings → Pages → Custom domain** me `ramdarbartracker.com` daalo, phir
**Enforce HTTPS** tick karo (certificate 10–30 min me aa jata hai).

## 3. Code me URL update (ye bhi main kar dunga)

- `frontend/vite.config.js` → `VITE_BASE` `/` (project sub-path hat jata hai)
- `frontend/index.html` → canonical, `og:url`, JSON-LD `url`
- `frontend/public/robots.txt` → `Sitemap:` line
- `frontend/public/sitemap.xml` → `<loc>`

## 4. Google par laane ke steps (Search Console — aapke Google account se)

1. https://search.google.com/search-console → **Add property** → **URL prefix**
2. URL daalo: `https://ramdarbartracker.com/`
3. Verify: **HTML tag** method → jo meta tag mile use `frontend/index.html` me
   `google-site-verification` placeholder ki jagah paste karna hai (mujhe bhej dena, main laga dunga)
4. Verify hone ke baad → **Sitemaps** → `sitemap.xml` submit karo
5. **URL Inspection** → homepage URL → **Request indexing**

Index hone me **3 din se 3 hafte** lag sakte hai. "Ram Darbar Tracker" brand search me
aane ke baad Google Business Profile (free) bhi bana lena — local search me madad karta hai.

## Important

- `robots.txt` aur `sitemap.xml` domain change hone par update karna **zaroori** hai, warna
  Google purana URL index karta rahega.
- GitHub Pages par custom domain lagne ke baad purana `github.io/ram-darbar-tracker/` URL
  automatically naye domain par redirect ho jata hai.
