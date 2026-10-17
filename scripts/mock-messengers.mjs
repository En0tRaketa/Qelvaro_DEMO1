// Тестовый двойник API Telegram и ВКонтакте (для проверки и записи демо-видео без реальных ботов).
// Запуск: node scripts/mock-messengers.mjs 4010  →  сервер сайта с TELEGRAM_API_BASE=http://127.0.0.1:4010 VK_API_BASE=http://127.0.0.1:4010
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 4010);
const messages = [];
createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/__messages') return res.end(JSON.stringify(messages));
    if (/^\/bot[^/]+\/sendMessage$/.test(req.url)) {
      const { chat_id, text } = JSON.parse(body || '{}');
      messages.push({ channel: 'telegram', to: chat_id, text });
      return res.end(JSON.stringify({ ok: true, result: { message_id: messages.length } }));
    }
    if (req.url === '/method/messages.send') {
      const p = new URLSearchParams(body);
      messages.push({ channel: 'vk', to: p.get('peer_id'), text: p.get('message') });
      return res.end(JSON.stringify({ response: messages.length }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
}).listen(port, '127.0.0.1', () => console.log(`mock messengers on :${port}`));
