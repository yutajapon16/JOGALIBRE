import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 市場レート取得
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    
    // TTBレート相当の計算: 市場レート - 3円
    const marketRate = data.rates.JPY;
    const ttbRate = marketRate - 3;
    
    return NextResponse.json({
      usdToJpy: ttbRate,
      marketRate: marketRate,
      ttbAdjustment: -3,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch exchange rate' },
      { status: 500 }
    );
  }
}