import { query } from './escape.js';
import type { PayloadType } from './types.js';
import { val } from './types.js';

/**
 * Payment codes are scanned once, usually off a printed surface, and a misread
 * sends money to the wrong place. Every type here pins a high error correction
 * floor.
 */
export const PAYMENT_TYPES: PayloadType[] = [
  {
    id: 'bitcoin',
    label: 'Bitcoin',
    group: 'payment',
    blurb: 'Opens a wallet with the address and amount filled in.',
    fields: [
      { name: 'address', label: 'Address', type: 'text', required: true },
      { name: 'amount', label: 'Amount (BTC)', type: 'text', half: true },
      { name: 'label', label: 'Label', type: 'text', half: true },
      { name: 'message', label: 'Message', type: 'text' },
    ],
    // BIP-21.
    serialize: (v) =>
      `bitcoin:${val(v, 'address')}${query({
        amount: val(v, 'amount') || undefined,
        label: val(v, 'label') || undefined,
        message: val(v, 'message') || undefined,
      })}`,
    sample: { address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amount: '0.001' },
    minEcc: 'Q',
  },
  {
    id: 'ethereum',
    label: 'Ethereum',
    group: 'payment',
    blurb: 'Opens a wallet for an ETH transfer.',
    fields: [
      { name: 'address', label: 'Address', type: 'text', required: true },
      { name: 'amount', label: 'Amount (ETH)', type: 'text', half: true },
      { name: 'chainId', label: 'Chain ID', type: 'text', half: true, placeholder: '1' },
    ],
    // EIP-681. Amounts are expressed in wei.
    serialize: (v) => {
      const chain = val(v, 'chainId');
      const target = `ethereum:${val(v, 'address')}${chain ? `@${chain}` : ''}`;
      const amount = val(v, 'amount');
      if (!/^\d*\.?\d*$/.test(amount) || amount === '' || amount === '.') return target;
      // Convert to wei by decimal-string arithmetic. Floats cannot represent
      // 18 significant digits, and a wallet that reads an off-by-one wei
      // amount is a bug worth avoiding entirely.
      const [whole, fraction = ''] = amount.split('.');
      const padded = `${fraction}${'0'.repeat(18)}`.slice(0, 18);
      const wei = BigInt(whole || '0') * 10n ** 18n + BigInt(padded);
      return `${target}${query({ value: wei.toString() })}`;
    },
    sample: { address: '0x0000000000000000000000000000000000000000', amount: '0.05' },
    minEcc: 'Q',
  },
  {
    id: 'lightning',
    label: 'Lightning invoice',
    group: 'payment',
    blurb: 'Pays a Lightning invoice.',
    fields: [
      {
        name: 'invoice',
        label: 'BOLT11 invoice',
        type: 'textarea',
        required: true,
        placeholder: 'lnbc...',
      },
    ],
    // Uppercased: BOLT11 is case-insensitive, and uppercase lets the encoder use
    // alphanumeric mode, which is materially smaller than byte mode.
    serialize: (v) =>
      val(v, 'invoice')
        .replace(/^lightning:/i, '')
        .toUpperCase(),
    sample: { invoice: 'lnbc10u1p3pj257pp5' },
    minEcc: 'Q',
  },
  {
    id: 'upi',
    label: 'UPI payment',
    group: 'payment',
    blurb: 'Opens a UPI app with the payee and amount set.',
    fields: [
      { name: 'pa', label: 'UPI ID', type: 'text', required: true, placeholder: 'name@bank' },
      { name: 'pn', label: 'Payee name', type: 'text', required: true },
      { name: 'am', label: 'Amount', type: 'text', half: true },
      { name: 'cu', label: 'Currency', type: 'text', half: true, placeholder: 'INR' },
      { name: 'tn', label: 'Note', type: 'text' },
    ],
    serialize: (v) =>
      `upi://pay${query({
        pa: val(v, 'pa'),
        pn: val(v, 'pn'),
        am: val(v, 'am') || undefined,
        cu: val(v, 'cu') || undefined,
        tn: val(v, 'tn') || undefined,
      })}`,
    sample: { pa: 'name@bank', pn: 'Krishna Adhikari', cu: 'INR' },
    minEcc: 'Q',
  },
  {
    id: 'sepa',
    label: 'SEPA transfer',
    group: 'payment',
    blurb: 'Fills a European bank transfer. EPC069-12 format.',
    fields: [
      { name: 'name', label: 'Beneficiary name', type: 'text', required: true },
      { name: 'iban', label: 'IBAN', type: 'text', required: true },
      { name: 'bic', label: 'BIC', type: 'text', half: true },
      { name: 'amount', label: 'Amount (EUR)', type: 'text', half: true },
      { name: 'reference', label: 'Reference', type: 'text' },
      { name: 'info', label: 'Information', type: 'text' },
    ],
    serialize: (v) => {
      const amount = val(v, 'amount');
      // The spec is strictly positional: every line must be present, even empty.
      return [
        'BCD',
        '002',
        '1',
        'SCT',
        val(v, 'bic'),
        val(v, 'name'),
        val(v, 'iban').replace(/\s/g, ''),
        amount ? `EUR${Number(amount).toFixed(2)}` : '',
        '',
        val(v, 'reference'),
        val(v, 'info'),
      ].join('\n');
    },
    sample: { name: 'Example GmbH', iban: 'DE89370400440532013000', amount: '25.00' },
    minEcc: 'M',
  },
];
