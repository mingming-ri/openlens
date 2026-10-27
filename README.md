# OpenLens

OpenLens reads text from a photo or screenshot and speaks it aloud. It's built for people with low vision.

- **Text recognition (OCR)** with Tesseract.js. It runs in your browser, so images aren't uploaded. Languages: English, Spanish, Chinese (Simplified), Arabic (shown right-to-left) and Hindi.
- **Read aloud** using the browser's built-in voices: voice picker, speed control, pause/resume/stop, and Esc to stop.
- **Accessibility**: works fully by keyboard, skip link, visible focus, screen-reader announcements, four text sizes, high contrast, large touch targets, and reduced-motion support.
- **Image input**: file picker, drag and drop, paste (Ctrl+V / ⌘V), and the camera on phones. You can also **type or paste text** to have it read aloud.
- **Better recognition**: images are automatically turned upright, resized and contrast-boosted before scanning. Optional **cropping** (none, crop it yourself, or automatic) and a **High accuracy** mode.
- **Reading view**: each sentence is highlighted as it's spoken. You can edit the text before listening.
- **Built-in guide** at the top of the page, with a Listen button that reads it aloud. It can be hidden.
- **Light and dark mode**, plus high contrast in either.
- **Word choices**: words the scanner wasn't sure about (common with bubble, decorative or handwritten-style lettering) are underlined. Select one to pick from other likely readings, type it yourself, or ask AI to read just that word.
- **App language**: the whole interface, guide and spoken guide in English, Español, 简体中文, العربية (right-to-left) or हिन्दी. Starts from the device language; picker in the header.
- **One text-language picker** above the image, with flags. Changing it rescans. After a scan, OpenLens suggests a better-fitting language if the text looks like another one.
- **Cleaner results**: "The image has: words / numbers / both" stops I-1, O-0, S-$ mix-ups; **Fix likely mistakes** checks words against a common-word list; random capitals ("cAsA") and picture bits read as text (logos, borders) are removed.
- **Translate** the text into any of the other four languages and have the translation read aloud. Uses Chrome's built-in on-device translator when available, otherwise your AI provider.
- **Optional AI** via Groq, Anthropic or OpenAI. It can **read text** (better with blurry photos and handwriting), **describe pictures**, **read a single unsure word**, and **translate** when the browser has no built-in translator. This is **off until you add a key in Cloudflare**, and the key never reaches the browser.

## Costs
- **Free:** GitHub, Cloudflare Pages (free plan), OCR, and read aloud. The core app needs no API keys.
- **AI (optional):** Groq has a free tier with rate limits. Anthropic and OpenAI need prepaid credit and charge per image. Set a spend limit on your provider account.

---

## Deploy (no coding, no install)

### 1. Upload to GitHub
1. Unzip the download.
2. Open github.com/mingming-ri/openlens. On an empty repo, click **uploading an existing file**; otherwise click **Add file → Upload files**.
3. Select **all files and the `extras` folder** in the unzipped folder, and drag them in together.
4. Click **Commit changes**.

There are no hidden files to worry about.

### 2. Connect Cloudflare Pages
1. Log in at **dash.cloudflare.com** (the free plan is fine).
2. Go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Click **Connect GitHub**. Choose **Only select repositories** → **openlens** → **Install & Authorize**.
4. Select the repo → **Begin setup**:
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variables → add `NODE_VERSION` = `20`
5. Click **Save and Deploy**. Your link appears when the build finishes (for example `https://openlens-xyz.pages.dev`).

**Tests run inside every build.** If any test fails, Cloudflare stops and doesn't publish a broken version. If a build fails, open it in **Deployments**, copy the red error text, and send it to me.

Every new commit to `main` redeploys automatically.

### 3. (Optional) Turn on AI: where the API key goes
| Provider | Secret name | Get a key at |
|---|---|---|
| Groq (free tier) | `GROQ_API_KEY` | console.groq.com → API Keys |
| Anthropic | `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| OpenAI | `OPENAI_API_KEY` | platform.openai.com → API keys |

1. Create a key and copy it. Don't paste it into chat, GitHub or any file.
2. In Cloudflare, open the **openlens** project → **Settings → Variables and Secrets → + Add**.
3. Set **Type** to **Secret**, the **Name** to the exact secret name from the table (for example `GROQ_API_KEY`), and paste the key as the **Value**. Click **Save**.
4. Go to **Deployments** → on the top deployment click **⋯ → Retry deployment**. Secrets only take effect on a new deployment.
5. Open the site and reload the page. Under **Scan settings**, a new **Read text with: This device / AI** choice now appears. A **Describe the picture** section appears once you choose an image, underlined words get an **Ask Groq** button, and **Translate** works in every browser.

**Using AI reading:** set **Read text with** to **AI** and every scan is sent to your provider. If you leave it on **This device**, the app offers **Read with AI instead** whenever a scan looks unreliable or finds no text. Either way, the image only leaves the device when AI is used.

**If AI doesn't show up:** check that the secret name is spelled exactly right, that you retried the deployment after adding it, and that you're on the live site (not the preview).

If you set more than one key, the app uses the first it finds, in this order: Groq, Anthropic, OpenAI. To use a different model, add a plain variable `AI_MODEL` with the model name.

**Security:** keys are read only in `worker.js`, which runs on Cloudflare. The `/api/describe` address is public, so a spend limit on your provider account is your real safeguard.

---

## What each file does
| File | Purpose |
|---|---|
| `App.tsx` | The page: holds the image, the OCR progress and the text, and connects the pieces |
| `Header.tsx` | Name, app language, text size, contrast and light/dark controls |
| `i18n.ts` | All interface text in the five app languages |
| `noise.ts` | Removes picture bits (logos, borders, textures) that were read as text |
| `ImagePanel.tsx`, `CropBox.tsx` | Choosing an image, cropping, scan settings |
| `Reader.tsx` | The reading area: status, highlighted sentences, editing, typed text |
| `Intro.tsx` | The intro and how-to guide, with read-aloud |
| `translate.ts` | Translate the text: Chrome's built-in on-device translator first, then the AI service (`/api/describe`, mode `translate`) |
| `detectLanguage.ts` | After a scan, suggests a better-fitting language (by writing system, and English vs Spanish by common words) |
| `smart.ts` | Fix likely mistakes: checks words against a common-word list (Hermit Dave's FrequencyWords, CC BY-SA 4.0) and switches non-words to their real-word lookalike |
| `charset.ts` | Only words / only numbers: tells Tesseract which characters to expect and fixes I/1, O/0, S/5 mix-ups |
| `WordChoices.tsx`, `words.ts` | Other possible readings for unsure words |
| `PlaybackBar.tsx`, `useSpeech.ts` | Read aloud: play/pause/stop, speed, voices grouped by language |
| `DescribePanel.tsx`, `StatusMessage.tsx`, `Segmented.tsx` | AI description panel, messages, the shared choice buttons |
| `ocr.ts` | Runs Tesseract (Standard or High accuracy) and reports progress |
| `image.ts` | File checks, automatic/manual cropping, image clean-up before scanning |
| `speech.ts` | Speaks one sentence at a time, filters out novelty voices |
| `text.ts`, `languages.ts` | Text cleanup, splitting into sentences, the language list |
| `describe.ts` | Talks to the server for AI reading and descriptions |
| `useSettings.ts` | All settings, saved in the browser |
| `worker.js` | Server side on Cloudflare: the AI endpoint (keeps keys secret) and security headers |
| `styles.css` | All styling. Text size and contrast switch CSS variables |
| `main.tsx`, `index.html` | The app's entry point |
| `*.test.ts(x)`, `test-setup.ts` | Automated tests |
| `package.json`, `tsconfig.json`, `vite.config.ts` | Build settings |
| `extras/` | Not used by the build: `app-icon.svg` and `DEMO.md` (your video script) |

## Test by hand on the live site
- [ ] Chrome, Safari (Mac and iPhone), Firefox and Android: a scan works and the text is read aloud
- [ ] Each language works. With Arabic selected, the text box runs right to left.
- [ ] Paste, drag and drop, and **Take photo** on a phone
- [ ] Keyboard only, then a screen reader (VoiceOver or NVDA)
- [ ] 175% text on a phone: nothing is cut off
- [ ] A blank image and an offline first scan both show clear messages
- [ ] **Type or paste text instead**, then read it aloud
- [ ] Cropping: **I'll crop** (drag with a mouse, a finger, and the arrow keys), and **Automatic** on a photo of a page on a table
- [ ] **High accuracy**: the first scan downloads and works (it's slower), in each language
- [ ] App language: switch to each one; Arabic flips the page right-to-left; Listen to this guide speaks that language
- [ ] Translate: in Chrome on a computer (on-device), and in Safari/Firefox with an AI key set
- [ ] With an AI key set: **Read text with → AI**, **Read with AI instead** on a blurry photo, and **Describe the picture instead** on an image with no text

Known limits: the translations of the interface were written by AI; have a native speaker review them. Chrome's built-in translator needs Chrome 138+ on a computer; elsewhere translation needs an AI key. on-device OCR is poor on handwriting (use AI reading for that). Automatic cropping only trims plain background; it can't find text in a busy scene. The first scan downloads language data from the jsDelivr CDN. Voices depend on the device.
