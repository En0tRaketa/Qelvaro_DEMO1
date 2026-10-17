/**
 * Запись промо-видео С НАСТОЯЩЕГО САЙТА (видео = продукт).
 *
 * Что делает: собирает сайт, запускает сервер на временной копии ваших настроек
 * (data/settings.json и загруженные картинки, если есть), подменяет Telegram/ВК
 * тестовым двойником (настоящие боты не трогаются), проходит сценарий в браузере
 * и склеивает ролик 1920×1080 → demo/potolok-profi-demo.mp4.
 *
 * Нужно один раз:
 *   npm i -D playwright-core
 *   npx playwright-core install chromium      (или укажите свой Chrome: CHROMIUM_PATH=…)
 *   ffmpeg в PATH (Windows: winget install ffmpeg)
 * Запуск:  npm run build && npm run video
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { chromium } = await import('playwright-core');
const ROOT = resolve('.');
const OUT_DIR = join(ROOT, 'demo');
const WORK = mkdtempSync(join(tmpdir(), 'pp-video-'));
const PORT = 4100;
const MOCK_PORT = 4110;
const BASE = `http://localhost:${PORT}/`;
const PASSWORD = 'video-demo-pass';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. Тестовый двойник Telegram/ВК
const delivered = [];
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (/sendMessage$/.test(req.url)) {
      delivered.push({ ch: 'telegram', text: JSON.parse(body).text });
      return res.end('{"ok":true,"result":{}}');
    }
    if (req.url === '/method/messages.send') {
      delivered.push({ ch: 'vk', text: new URLSearchParams(body).get('message') });
      return res.end('{"response":1}');
    }
    res.end('{}');
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

// ---------- 2. Копия настроек и сервер
const DATA = join(WORK, 'data');
mkdirSync(DATA, { recursive: true });
if (existsSync('data/settings.json')) {
  const s = JSON.parse(readFileSync('data/settings.json', 'utf8'));
  delete s.integrations;
  writeFileSync(join(DATA, 'settings.json'), JSON.stringify(s));
}
if (existsSync('data/uploads')) cpSync('data/uploads', join(DATA, 'uploads'), { recursive: true });
const server = spawn(process.execPath, ['server/index.ts'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: DATA, ADMIN_PASSWORD: PASSWORD, TELEGRAM_API_BASE: `http://127.0.0.1:${MOCK_PORT}`, VK_API_BASE: `http://127.0.0.1:${MOCK_PORT}` },
  stdio: 'ignore',
});
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE + 'api/config')).ok) break;
  } catch {}
  await sleep(200);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--font-render-hinting=none', '--disable-gpu', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])],
});

// Подключаем «боты» через админку — как это сделает владелец.
{
  const ctx = await browser.newContext();
  const H = { Origin: BASE.slice(0, -1), 'Content-Type': 'application/json' };
  await ctx.request.post(BASE + 'api/admin/login', { headers: H, data: { password: PASSWORD } });
  const s = await (await ctx.request.get(BASE + 'api/admin/settings')).json();
  s.integrations.telegram = { enabled: true, botToken: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', chatId: '@potolok_zayavki' };
  s.integrations.vk = { enabled: true, groupToken: 'vk1.a.' + 'demo'.repeat(12), peerIds: '100000001' };
  const r = await ctx.request.put(BASE + 'api/admin/settings', { headers: H, data: { config: s.config, integrations: s.integrations } });
  if (!r.ok()) throw new Error('Не удалось настроить демо: ' + (await r.text()));
  await ctx.close();
}

// ---------- 3. Запись кадров через screencast (чётче, чем встроенная запись видео)
async function recorder(page, dir) {
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const file = join(dir, `${String(frames.length).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: Date.now() / 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const size = page.viewportSize();
  const dpr = await page.evaluate(() => devicePixelRatio);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(size.width * dpr), maxHeight: Math.round(size.height * dpr) });
  // Кадр приходит только при изменении экрана; длительность кадра = время до следующего.
  return {
    async stop() {
      await sleep(300);
      const end = Date.now() / 1000;
      await cdp.send('Page.stopScreencast').catch(() => {});
      const list = frames.map((f, i) => `file '${f.file.replace(/'/g, "'\\''")}'\nduration ${((i + 1 < frames.length ? frames[i + 1].t : end) - f.t).toFixed(4)}`).join('\n');
      writeFileSync(join(dir, 'list.txt'), list + `\nfile '${frames.at(-1).file}'\n`);
      return join(dir, 'list.txt');
    },
  };
}

// Курсор и титры — только для видео, на сайт не влияют.
const OVERLAY = () => {
  const make = () => {
    if (document.getElementById('__cur')) return;
    const st = document.createElement('style');
    st.textContent = `#__cur{position:fixed;left:-60px;top:-60px;width:28px;height:28px;z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
#__cur.click::after{content:'';position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;background:rgba(255,106,19,.45);animation:__p .5s ease-out}
@keyframes __p{from{transform:scale(.3);opacity:1}to{transform:scale(2.2);opacity:0}}
#__cap{position:fixed;left:50%;bottom:34px;transform:translate(-50%,16px);opacity:0;z-index:2147483646;pointer-events:none;max-width:86vw;background:rgba(27,32,36,.94);color:#fff;font:600 22px/1.35 'Golos Text',system-ui,sans-serif;padding:14px 26px 14px 22px;border-radius:16px;border-left:5px solid #ff6a13;box-shadow:0 18px 40px -16px rgba(0,0,0,.5);transition:opacity .35s,transform .35s;text-align:left}
#__cap.on{opacity:1;transform:translate(-50%,0)}`;
    document.head.appendChild(st);
    const c = document.createElement('div');
    c.id = '__cur';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.3-3.4-6.6L4 20z" fill="#fff" stroke="#1b2024" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const cap = document.createElement('div');
    cap.id = '__cap';
    document.body.appendChild(cap);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', make);
  else make();
};

function director(page) {
  let cur = { x: 640, y: 400 };
  const d = {
    async caption(text, hold = 0) {
      await page.evaluate((t) => {
        const c = document.getElementById('__cap');
        if (!t) return c.classList.remove('on');
        c.textContent = t;
        c.classList.add('on');
      }, text);
      if (hold) await sleep(hold);
    },
    async move(loc) {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      cur = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      await page.evaluate(({ x, y }) => {
        const c = document.getElementById('__cur');
        c.style.left = x + 'px';
        c.style.top = y + 'px';
      }, cur);
      await sleep(750);
    },
    async click(loc, pause = 450) {
      await d.move(loc);
      await page.evaluate(() => {
        const c = document.getElementById('__cur');
        c.classList.remove('click');
        void c.offsetWidth;
        c.classList.add('click');
      });
      await loc.click();
      await sleep(pause);
    },
    async type(loc, text) {
      await d.click(loc, 150);
      await loc.pressSequentially(text, { delay: 85 });
      await sleep(250);
    },
    /** Плавная прокрутка к элементу за ms. */
    async scrollTo(selectorOrY, ms = 1400, offset = 80) {
      await page.evaluate(
        ({ target, ms, offset }) =>
          new Promise((done) => {
            const el = typeof target === 'string' ? document.querySelector(target) : null;
            const to = el ? el.getBoundingClientRect().top + scrollY - offset : target;
            const from = scrollY;
            const t0 = performance.now();
            const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
            const step = (now) => {
              const t = Math.min(1, (now - t0) / ms);
              scrollTo(0, from + (to - from) * ease(t));
              t < 1 ? requestAnimationFrame(step) : done();
            };
            requestAnimationFrame(step);
          }),
        { target: selectorOrY, ms, offset },
      );
      await sleep(200);
    },
  };
  return d;
}

const card = (html) => `
<div style="position:fixed;inset:0;z-index:2147483645;display:grid;place-items:center;background:#f2f3f1;font-family:'Golos Text',system-ui,sans-serif;color:#1b2024">
  <div style="width:min(1060px,88vw)">${html}</div>
</div>`;
const LOGO = `<svg viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#1B2024"/><path d="M10 22 L32 12 L54 22" fill="none" stroke="#FF6A13" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><rect x="14" y="30" width="36" height="22" rx="3" fill="none" stroke="#fff" stroke-width="4"/></svg>`;

const segments = [];

// ---------- 4. Десктоп
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, locale: 'ru-RU' });
  await ctx.addInitScript(OVERLAY);
  const H = { Origin: BASE.slice(0, -1), 'Content-Type': 'application/json' };
  await ctx.request.post(BASE + 'api/admin/login', { headers: H, data: { password: PASSWORD } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const d = director(page);
  const rec = await recorder(page, join(WORK, 'desk'));

  // Заставка
  await page.evaluate(
    (h) => document.body.insertAdjacentHTML('beforeend', h),
    card(`${LOGO}
      <h1 style="font-family:Unbounded,sans-serif;font-size:56px;line-height:1.08;margin:28px 0 18px;letter-spacing:-.02em">Сайт для компании<br>натяжных потолков</h1>
      <p style="font-size:26px;color:#4a5157;max-width:30em;margin:0">Клиент сам считает цену в калькуляторе — готовая заявка сразу приходит вам в Telegram и ВКонтакте.</p>`).replace('<div style="position:fixed', '<div id="__intro" style="position:fixed'),
  );
  await sleep(3800);
  await page.evaluate(() => {
    const el = document.getElementById('__intro');
    el.style.transition = 'opacity .6s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 650);
  });
  await sleep(700);

  await d.caption('Продающий лендинг: цена и заявка — на первом экране', 2600);
  await d.move(page.getByRole('button', { name: 'Рассчитать стоимость' }));
  await sleep(500);
  await d.caption('');
  await d.scrollTo('#services', 1500);
  await d.caption('Услуги с фото, описанием и ценой', 1200);
  await d.move(page.locator('.svc').nth(0));
  await d.move(page.locator('.svc').nth(1));
  await d.move(page.locator('.svc').nth(2));
  await sleep(600);
  await d.scrollTo('#why', 1300);
  await d.caption('Почему выбирают вас', 1800);
  await d.scrollTo('.section--process', 1000);
  await d.caption('Понятные этапы работы', 1600);
  await d.scrollTo('#contacts', 1400);
  await d.caption('Телефон и кнопки соцсетей: ВКонтакте, Telegram, Instagram', 1200);
  await d.move(page.locator('.social').first());
  await sleep(1400);
  await d.caption('');
  await d.scrollTo('#services', 1400);

  await d.caption('Кнопка на карточке сразу подставляет услугу в калькулятор', 600);
  await d.click(page.locator('.svc').nth(1).getByRole('button', { name: 'Рассчитать' }), 1300);
  await d.caption('Калькулятор в 5 шагов — без звонков и регистрации');
  await d.type(page.locator('#area'), '18');
  await sleep(400);
  await d.move(page.locator('.ticket__total'));
  await sleep(900);
  await d.click(page.getByRole('button', { name: 'Дальше' }), 700);
  await d.caption('Цена пересчитывается сразу');
  for (let i = 0; i < 6; i++) await d.click(page.getByRole('button', { name: 'Больше: Светильники' }), 120);
  await d.click(page.getByRole('button', { name: 'Больше: Люстры' }), 400);
  await d.move(page.locator('.ticket__total'));
  await sleep(800);
  await d.click(page.getByRole('button', { name: 'Дальше' }), 700);
  await d.type(page.locator('#qty-cornice'), '3');
  await d.click(page.locator('label.toggle-row', { hasText: 'Демонтаж' }), 500);
  await d.caption('');
  await d.click(page.getByRole('button', { name: 'Рассчитать стоимость потолка' }), 900);
  await d.caption('Подробная расшифровка: полотно, свет, карнизы, демонтаж', 600);
  await d.scrollTo('.breakdown', 1600, 220);
  await sleep(1500);
  await d.click(page.getByRole('button', { name: 'Оставить заявку на замер' }), 1000);
  await d.caption('Клиент оставляет имя и телефон');
  await d.type(page.getByLabel('Имя'), 'Анна');
  await d.type(page.getByLabel('Телефон'), '+7 917 123-45-67');
  await d.click(page.locator('.consent input'), 300);
  await d.caption('');
  await d.click(page.getByRole('button', { name: 'Отправить заявку' }), 300);
  await page.waitForSelector('.contact--done');
  await page.locator('.contact--done').scrollIntoViewIfNeeded();
  await d.caption('Готово: заявка уже у менеджера', 2600);

  // Админка
  await d.caption('');
  await page.goto(BASE + '#/admin/leads');
  await page.waitForSelector('.lead');
  await sleep(500);
  await d.caption('Та же заявка — в Telegram, во ВКонтакте и в админке', 1200);
  await d.move(page.locator('.lead__pills').first());
  await sleep(1000);
  await d.click(page.locator('.lead__head').first(), 900);
  await d.scrollTo('.lead__body', 1600, 120);
  await sleep(2200);
  await d.caption('Фото, услуги и цены владелец меняет сам — без программиста');
  await d.click(page.getByRole('button', { name: 'Услуги', exact: true }), 1200);
  await d.scrollTo(160, 1500);
  await sleep(900);
  await d.click(page.getByRole('button', { name: 'Цены' }), 900);
  await d.scrollTo('.admin-table', 1400, 140);
  await sleep(1200);
  await d.caption('Подключение ботов и проверка в один клик');
  await d.click(page.getByRole('button', { name: 'Telegram и ВК' }), 900);
  await d.scrollTo('.test-res, .admin-panel:last-child', 1200, 260);
  await d.click(page.getByRole('button', { name: 'Отправить тестовую заявку' }), 400);
  await page.waitForSelector('.test-res');
  await d.caption('');
  await d.scrollTo('.test-res', 900, 330);
  await d.move(page.locator('.test-res'));
  await d.caption('Тест прошёл: Telegram и ВК — доставлено', 2600);
  await d.caption('');
  segments.push({ list: await rec.stop(), kind: 'full' });
  await ctx.close();
}

// ---------- 5. Телефон
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU' });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const d = director(page);
  const rec = await recorder(page, join(WORK, 'mob'));
  await sleep(1600);
  await d.scrollTo('#services', 1400, 70);
  await sleep(1200);
  await d.click(page.locator('.svc').first().getByRole('button', { name: 'Рассчитать' }), 1200);
  await d.type(page.locator('#area'), '14');
  await d.click(page.getByRole('button', { name: 'Дальше' }), 600);
  for (let i = 0; i < 4; i++) await d.click(page.getByRole('button', { name: 'Больше: Светильники' }), 150);
  await sleep(1500);
  segments.push({ list: await rec.stop(), kind: 'phone' });

  // Фон для кадра с телефоном
  const bg = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await bg.goto(BASE, { waitUntil: 'networkidle' });
  await bg.evaluate(
    (h) => {
      document.body.innerHTML = h;
    },
    card(`<div style="max-width:760px">
      <h2 style="font-family:Unbounded,sans-serif;font-size:72px;line-height:1.08;margin:0 0 28px;letter-spacing:-.02em">Удобно<br>с телефона</h2>
      <p style="font-size:34px;color:#4a5157;margin:0;line-height:1.4">Большая часть клиентов приходит с мобильного — калькулятор, кнопки и заявка подстроены под палец.</p></div>`),
  );
  await bg.evaluate(() => document.fonts.ready);
  await bg.screenshot({ path: join(WORK, 'phone-bg.png') });
  await bg.close();
  await ctx.close();
}

// ---------- 6. Финальная заставка
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(
    (h) => document.body.insertAdjacentHTML('beforeend', h),
    card(`${LOGO}
      <h2 style="font-family:Unbounded,sans-serif;font-size:46px;line-height:1.1;margin:26px 0 26px;letter-spacing:-.02em">Ваш логотип, цены и фото —<br>и сайт принимает заявки</h2>
      <ul style="list-style:none;padding:0;margin:0;display:grid;gap:12px;font-size:25px;color:#1b2024">
        <li><b style="color:#ff6a13">—</b> Лендинг с услугами и калькулятором</li>
        <li><b style="color:#ff6a13">—</b> Заявки автоматически в Telegram и ВКонтакте</li>
        <li><b style="color:#ff6a13">—</b> Админка: фото, цены, тексты, соцсети</li>
        <li><b style="color:#ff6a13">—</b> Без абонентской платы за конструктор</li>
      </ul>`),
  );
  await page.evaluate(() => document.fonts.ready);
  const rec = await recorder(page, join(WORK, 'outro'));
  await sleep(4500);
  segments.push({ list: await rec.stop(), kind: 'full' });
  await ctx.close();
}

await browser.close();
server.kill();
mock.close();

// ---------- 7. Склейка
mkdirSync(OUT_DIR, { recursive: true });
const parts = [];
const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30'];
segments.forEach((s, i) => {
  const out = join(WORK, `seg${i}.mp4`);
  if (s.kind === 'full') {
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', s.list, '-vf', 'scale=1920:1080:flags=lanczos,setsar=1', ...enc, out]);
  } else {
    // телефон: скругляем углы и ставим справа на фон
    execFileSync(FFMPEG, [
      '-y', '-loglevel', 'error',
      '-loop', '1', '-i', join(WORK, 'phone-bg.png'),
      '-f', 'concat', '-safe', '0', '-i', s.list,
      '-filter_complex',
      "[1:v]scale=-2:940:flags=lanczos,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(abs(W/2-X),W/2-36)*gt(abs(H/2-Y),H/2-36),if(lte(hypot(36-(W/2-abs(W/2-X)),36-(H/2-abs(H/2-Y))),36),255,0),255)'[ph];[0:v][ph]overlay=x=W-w-230:y=(H-h)/2:shortest=1,setsar=1",
      ...enc, out,
    ]);
  }
  parts.push(out);
});
const concatList = join(WORK, 'parts.txt');
writeFileSync(concatList, parts.map((p) => `file '${p}'`).join('\n'));
const final = join(OUT_DIR, 'potolok-profi-demo.mp4');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', '-movflags', '+faststart', final]);
console.log(`Готово: ${final}`);
console.log(`Сообщений «доставлено» тестовому двойнику: ${delivered.length}`);
if (!process.env.KEEP_FRAMES) rmSync(WORK, { recursive: true, force: true });
