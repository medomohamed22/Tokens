import { list } from '@vercel/blob';
import { setCors } from './_shared.js';

const clean = value => String(value || '').replace(/[\r\n"]/g, ' ').trim();

export default async function handler(req, res) {
  setCors(res, 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  try {
    const result = await list({ prefix: 'config/pi-token-metadata.json', limit: 1 });
    const blob = result.blobs.find(item => item.pathname === 'config/pi-token-metadata.json');
    if (!blob) return res.status(503).send('# Token metadata has not been saved from the website yet.\n');
    const response = await fetch(blob.url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not read metadata blob.');
    const metadata = await response.json();
    const code = clean(metadata.code), issuer = clean(metadata.issuer), name = clean(metadata.name), desc = clean(metadata.desc), image = clean(metadata.image);
    if (!code || !issuer || !name || !desc || !image) return res.status(503).send('# Saved token metadata is incomplete.\n');
    return res.status(200).send(`[[CURRENCIES]]\ncode="${code}"\nissuer="${issuer}"\nname="${name}"\ndesc="${desc}"\nimage="${image}"\n`);
  } catch (error) {
    return res.status(503).send(`# Unable to load token metadata: ${clean(error.message)}\n`);
  }
}
