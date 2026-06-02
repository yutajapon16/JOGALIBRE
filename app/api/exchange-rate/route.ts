import { NextResponse } from 'next/server';
import { getResilientExchangeRate } from '@/lib/exchange';

export async function GET() {
  try {
    const rateData = await getResilientExchangeRate();

    return NextResponse.json({
      usdToJpy: rateData.rates.JPY,
      rates: rateData.rates,
      lastUpdated: rateData.lastUpdated,
      isCached: rateData.isCached
    });
  } catch (error) {
    console.error('Exchange rate route error:', error);
    return NextResponse.json({
      usdToJpy: 150,
      rates: {
        JPY: 150,
        BRL: 5.6,
        PYG: 7500,
        CLP: 930,
        BOB: 6.9,
        ARS: 935
      },
      lastUpdated: new Date().toISOString(),
      isCached: true,
      fallback: true
    });
  }
}