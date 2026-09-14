import { GoogleAuth } from 'google-auth-library';

// アクセストークンのインメモリキャッシュ
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * サービスアカウント情報から Google OAuth 2.0 アクセストークンを取得（有効期限内はキャッシュ）
 */
async function getVertexAccessToken(): Promise<string | null> {
  const now = Date.now();
  // 有効期限の5分前まではキャッシュを利用
  if (cachedAccessToken && now < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedAccessToken;
  }

  try {
    const serviceAccountKey = process.env.GCP_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) return null;

    let credentials: any;
    const raw = serviceAccountKey.trim();
    if (raw.startsWith('{')) {
      credentials = JSON.parse(raw);
    } else {
      credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    }

    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token || null;

    if (token) {
      cachedAccessToken = token;
      // トークン有効期間はおよそ1時間 (3600秒)
      tokenExpiresAt = now + 3600 * 1000;
    }

    return token;
  } catch (error) {
    console.warn('[Gemini Service] Failed to obtain Vertex AI access token:', error);
    return null;
  }
}

/**
 * AI Studio 用モデル名から Vertex AI 互換のモデル名へマッピング
 */
function mapModelForVertex(model: string): string {
  const map: Record<string, string> = {
    'gemini-flash-lite-latest': 'gemini-2.5-flash-lite',
    'gemini-flash-latest': 'gemini-2.5-flash',
    'gemini-3.5-flash-lite': 'gemini-2.5-flash-lite',
  };
  return map[model] || model;
}

export interface GeminiRequestOptions {
  models?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  thinkingBudget?: number;
  timeoutMs?: number;
  apiKey?: string;
}

export interface GeminiResponse {
  text: string;
  model: string;
  provider: 'vertex' | 'ai-studio';
}

/**
 * Gemini API を呼び出す共通関数
 * 
 * 1. USE_VERTEX_AI=true の場合: Vertex AI（R$1,744のGoogle Cloudクレジット対象）を優先呼出
 * 2. Vertex AI が失敗、または USE_VERTEX_AI=false の場合: 従来の Google AI Studio (APIキー) へ自動フォールバック
 * 3. 既存のプロンプト・生成パラメータ・フォールバック機構は100%保持
 */
export async function generateWithGemini(
  prompt: string,
  options: GeminiRequestOptions = {}
): Promise<GeminiResponse | null> {
  const {
    models = ['gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest'],
    temperature = 0.2,
    maxOutputTokens = 2000,
    responseMimeType,
    thinkingBudget,
    timeoutMs = 7000,
    apiKey = process.env.GEMINI_API_KEY || '',
  } = options;

  const useVertex = process.env.USE_VERTEX_AI === 'true';
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

  // --- ルート 1: Vertex AI (Google Cloud クレジット消費) ---
  if (useVertex && projectId) {
    const token = await getVertexAccessToken();
    if (token) {
      for (const rawModel of models) {
        const vertexModel = mapModelForVertex(rawModel);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);

          const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${vertexModel}:generateContent`;

          const generationConfig: Record<string, any> = {
            temperature,
            maxOutputTokens,
          };
          if (responseMimeType) {
            generationConfig.responseMimeType = responseMimeType;
          }
          if (thinkingBudget !== undefined) {
            generationConfig.thinkingConfig = { thinkingBudget };
          }

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                role: 'user',
                parts: [{ text: prompt }]
              }],
              generationConfig
            }),
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (response.ok) {
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text && text.trim()) {
              return {
                text: text.trim(),
                model: vertexModel,
                provider: 'vertex'
              };
            }
          } else {
            const errBody = await response.text();
            console.warn(`[Gemini Vertex AI] ${vertexModel} failed (${response.status}):`, errBody.substring(0, 150));
          }
        } catch (err: any) {
          console.warn(`[Gemini Vertex AI] ${vertexModel} exception:`, err?.message || err);
        }
      }
      console.warn('[Gemini Service] Vertex AI failed or not yet enabled. Falling back to AI Studio...');
    }
  }

  // --- ルート 2: Google AI Studio (従来のAPIキー / 自動フェイルオーバー) ---
  if (!apiKey) {
    console.error('[Gemini Service] Neither Vertex AI nor GEMINI_API_KEY is available.');
    return null;
  }

  for (const model of models) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const isThinkingModel = model.includes('2.5') || model.includes('thinking');
      const generationConfig: Record<string, any> = {
        temperature,
        maxOutputTokens,
      };
      if (responseMimeType) {
        generationConfig.responseMimeType = responseMimeType;
      }
      if (thinkingBudget !== undefined) {
        generationConfig.thinkingConfig = { thinkingBudget };
      } else if (isThinkingModel) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim()) {
          return {
            text: text.trim(),
            model,
            provider: 'ai-studio'
          };
        }
      } else {
        const errBody = await response.text();
        console.warn(`[Gemini AI Studio] ${model} failed (${response.status}):`, errBody.substring(0, 150));
        if (response.status === 429 || response.status === 503) {
          await new Promise(r => setTimeout(r, 800));
        }
      }
    } catch (err: any) {
      console.warn(`[Gemini AI Studio] ${model} exception:`, err?.message || err);
    }
  }

  return null;
}
