export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { getResilientExchangeRate } from '@/lib/exchange';

export async function GET() {
  try {
    const rateData = await getResilientExchangeRate();

    return NextResponse.json(
      {
        usdToJpy: rateData.rates.JPY,
        rates: rateData.rates,
        lastUpdated: rateData.lastUpdated,
        isCached: rateData.isCached,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    console.error('Exchange rate route error:', error);
    return NextResponse.json(
      {
        usdToJpy: 150,
        rates: {
          JPY: 150,
          BRL: 5.6,
          PYG: 7500,
          CLP: 930,
          BOB: 6.9,
          ARS: 935,
        },
        lastUpdated: new Date().toISOString(),
        isCached: true,
        fallback: true,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }
}