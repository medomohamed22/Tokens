import {
  StellarSdk, server, NETWORK_PASSPHRASE, setCors, sendError, parseJsonBody,
  validateTokenCode, validatePublicKey, validateAmount, safeHorizonError
} from './_shared.js';

function validateSlippage(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0.1 && n <= 50;
}

function formatPrice(value) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid liquidity price.');
  return value.toFixed(7).replace(/0+$/, '').replace(/\.$/, '') || '0.0000001';
}

export default async function handler(req, res) {
  setCors(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');

  const body = parseJsonBody(req);
  const tokenCode = String(body.tokenCode || '').trim();
  const issuerAddress = String(body.issuerAddress || '').trim();
  const distributorAddress = String(body.distributorAddress || '').trim();
  const tokenAmount = String(body.tokenAmount || '').trim();
  const piAmount = String(body.piAmount || '').trim();
  const slippage = String(body.slippage || '5').trim();

  if (!validateTokenCode(tokenCode)) return sendError(res, 400, 'Token code must be 1–12 alphanumeric characters.');
  if (!validatePublicKey(issuerAddress) || !validatePublicKey(distributorAddress)) return sendError(res, 400, 'Invalid public wallet address.');
  if (!validateAmount(tokenAmount) || !validateAmount(piAmount)) return sendError(res, 400, 'Liquidity amounts must be positive with at most 7 decimal places.');
  if (!validateSlippage(slippage)) return sendError(res, 400, 'Slippage must be between 0.1% and 50%.');

  const distributorSecret = process.env.DISTRIBUTOR_SECRET;
  if (!distributorSecret) return sendError(res, 503, 'Configure DISTRIBUTOR_SECRET in Vercel.');

  let distributorKeypair;
  try {
    distributorKeypair = StellarSdk.Keypair.fromSecret(distributorSecret.trim());
  } catch {
    return sendError(res, 503, 'The distributor secret configured in Vercel is invalid.');
  }
  if (distributorKeypair.publicKey() !== distributorAddress) {
    return sendError(res, 400, 'The distributor address does not match DISTRIBUTOR_SECRET configured in Vercel.');
  }

  const tokenAsset = new StellarSdk.Asset(tokenCode, issuerAddress);
  const nativeAsset = StellarSdk.Asset.native();
  const tokenFirst = StellarSdk.Asset.compare(tokenAsset, nativeAsset) < 0;
  const assetA = tokenFirst ? tokenAsset : nativeAsset;
  const assetB = tokenFirst ? nativeAsset : tokenAsset;
  const amountA = tokenFirst ? tokenAmount : piAmount;
  const amountB = tokenFirst ? piAmount : tokenAmount;

  const numericA = Number(amountA);
  const numericB = Number(amountB);
  if (!Number.isFinite(numericA) || !Number.isFinite(numericB)) return sendError(res, 400, 'Liquidity amounts are too large.');

  const poolAsset = new StellarSdk.LiquidityPoolAsset(assetA, assetB, StellarSdk.LiquidityPoolFeeV18);
  const poolId = StellarSdk.getLiquidityPoolId('constant_product', poolAsset.getLiquidityPoolParameters()).toString('hex');
  const exactPrice = numericA / numericB;
  const tolerance = Number(slippage) / 100;
  const minPrice = formatPrice(Math.max(exactPrice * (1 - tolerance), 0.0000001));
  const maxPrice = formatPrice(exactPrice * (1 + tolerance));

  try {
    const account = await server.loadAccount(distributorAddress);
    const tokenBalance = account.balances.find(balance =>
      balance.asset_code === tokenCode && balance.asset_issuer === issuerAddress
    );
    if (!tokenBalance) return sendError(res, 400, 'Distributor does not have a trustline for this token.');
    if (Number(tokenBalance.balance) < Number(tokenAmount)) return sendError(res, 400, 'Distributor token balance is lower than the requested liquidity amount.');

    const nativeBalance = account.balances.find(balance => balance.asset_type === 'native');
    if (!nativeBalance || Number(nativeBalance.balance) <= Number(piAmount)) {
      return sendError(res, 400, 'Distributor Pi balance is not enough for the deposit plus account reserves and fees.');
    }

    const fee = await server.fetchBaseFee();
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: String(fee),
      networkPassphrase: NETWORK_PASSPHRASE,
      timebounds: await server.fetchTimebounds(120)
    })
      .addOperation(StellarSdk.Operation.changeTrust({ asset: poolAsset }))
      .addOperation(StellarSdk.Operation.liquidityPoolDeposit({
        liquidityPoolId: poolId,
        maxAmountA: amountA,
        maxAmountB: amountB,
        minPrice,
        maxPrice
      }))
      .build();

    tx.sign(distributorKeypair);
    const result = await server.submitTransaction(tx);

    return res.status(200).json({
      ok: true,
      liquidityPoolId: poolId,
      transaction: result.hash,
      pair: `${tokenCode}/Pi`,
      deposited: { token: tokenAmount, pi: piAmount },
      slippagePercent: Number(slippage),
      poolUrl: `${server.serverURL}/liquidity_pools/${poolId}`,
      notice: 'Liquidity was deposited on Pi Testnet. Pool shares are held by the distributor account.'
    });
  } catch (error) {
    return sendError(res, 502, 'Pi Testnet liquidity transaction failed.', { blockchain: safeHorizonError(error), liquidityPoolId: poolId });
  }
}
