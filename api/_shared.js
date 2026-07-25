import * as StellarSdk from '@stellar/stellar-sdk';
import crypto from 'node:crypto';

export const HORIZON_URL = 'https://api.testnet.minepi.com';
export const NETWORK_PASSPHRASE = 'Pi Testnet';
export const server = new StellarSdk.Horizon.Server(HORIZON_URL);

export function setCors(res, methods = 'GET,POST,OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password');
}

export function sendError(res, status, message, details) {
  return res.status(status).json({ ok: false, error: message, ...(details ? { details } : {}) });
}

export function parseJsonBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export function validateTokenCode(code) {
  return typeof code === 'string' && /^[A-Za-z0-9]{1,12}$/.test(code);
}

export function validatePublicKey(key) {
  return typeof key === 'string' && /^G[A-Z2-7]{55}$/.test(key);
}

export function validateAmount(amount) {
  if (typeof amount !== 'string' && typeof amount !== 'number') return false;
  const value = String(amount).trim();
  return /^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(value) && Number(value) > 0;
}

export function normalizeHomeDomain(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

export function normalizeGithubImageUrl(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i);
  return match ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}` : raw;
}

export function validateHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export function secureEqual(provided, expected) {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function verifyPiAccessToken(authHeader) {
  if (!String(authHeader || '').startsWith('Bearer ')) throw new Error('Missing Pi access token.');
  const response = await fetch('https://api.minepi.com/v2/me', { headers: { Authorization: authHeader } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Pi authentication failed.');
  return data;
}

export function safeHorizonError(error) {
  return error?.response?.data?.extras?.result_codes || error?.response?.data?.detail || error?.message || 'Unknown blockchain error';
}

export { StellarSdk };
