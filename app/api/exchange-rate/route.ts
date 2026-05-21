import { NextResponse } from 'next/server';
import { getResilientExchangeRate } from '@/lib/exchange';

export async function GET() {
  try {
    const rateData = await getResilientExchangeRate();

    return NextResponse.json({
      usdToJpy: rateData.usdToJpy,
      marketRate: rateData.usdToJpy + 4,
      ttbAdjustment: -4,
      lastUpdated: rateData.lastUpdated,
      isCached: rateData.isCached
    });
  } catch (error) {
    console.error('Exchange rate route error:', error);
    return NextResponse.json({
      usdToJpy: 150,
      marketRate: 154,
      ttbAdjustment: -4,
      lastUpdated: new Date().toISOString(),
      isCached: true,
      fallback: true
    });
  }
}