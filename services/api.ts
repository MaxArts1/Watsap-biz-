import { ProductItem, BatchRequestItem, Catalog } from '../types';

const API_VERSION = 'v20.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

/**
 * Utility to wait for a specified duration (ms)
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Handles API fetch with retry logic for Rate Limits (80014)
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<any> {
  try {
    // Explicitly set mode to cors to ensure browser handles it correctly
    const fetchOptions: RequestInit = {
      ...options,
      mode: 'cors',
      credentials: 'omit', // Usually needed to avoid cookie issues with some APIs
    };

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    if (!response.ok) {
      // Handle Rate Limit (User reached limit)
      if (data.error && data.error.code === 80014) {
        if (retries > 0) {
          console.warn(`Rate limit hit. Retrying in ${backoff}ms...`);
          await wait(backoff);
          return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
      }
      throw data.error || new Error(`API Error: ${response.statusText}`);
    }

    return data;
  } catch (error: any) {
    // Detect "Failed to fetch" which usually means AdBlocker or Network issue
    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      throw new Error(
        'Сетевая ошибка (Failed to fetch). Обычно это вызвано БЛОКИРОВЩИКОМ РЕКЛАМЫ (AdBlock, uBlock, и т.д.). Пожалуйста, отключите расширения блокировки для этого сайта или graph.facebook.com и попробуйте снова.'
      );
    }
    throw error;
  }
}

export const MetaService = {
  /**
   * Validates the Access Token
   */
  validateToken: async (token: string) => {
    try {
      const url = `${BASE_URL}/me?access_token=${token}`;
      return await fetchWithRetry(url, { method: 'GET' });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Fetches catalogs assigned to the user
   */
  getUserCatalogs: async (token: string): Promise<Catalog[]> => {
    try {
      // Try to get assigned product catalogs. This usually works for System Users.
      // We request 'business' field to get the Business ID for deep links
      const url = `${BASE_URL}/me/assigned_product_catalogs?fields=name,vertical,business&access_token=${token}`;
      const response = await fetchWithRetry(url, { method: 'GET' });
      
      const list = response.data || [];
      return list.map((item: any) => ({
        id: item.id,
        name: item.name,
        vertical: item.vertical,
        business_id: item.business?.id // Extract business ID
      }));
    } catch (error) {
      console.warn("Could not fetch assigned catalogs, user might not have permissions to list them.", error);
      return [];
    }
  },

  /**
   * Validates access to a specific Catalog
   */
  validateCatalog: async (catalogId: string, token: string) => {
    try {
      const url = `${BASE_URL}/${catalogId}?fields=name,vertical&access_token=${token}`;
      return await fetchWithRetry(url, { method: 'GET' });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Uploads a batch of products (Max 50 per request implied by caller)
   */
  uploadBatch: async (catalogId: string, token: string, products: ProductItem[], websiteUrl: string) => {
    const requests: BatchRequestItem[] = products.map((p) => {
      // Meta Catalog Batch API Structure
      // https://developers.facebook.com/docs/commerce-platform/catalog/batch-api
      
      const payload: any = {
        name: p.name,
        description: p.description || p.name, // Description is highly recommended for WhatsApp
        availability: p.availability || 'in stock',
        condition: p.condition || 'new',
        price: p.price, // Should be number (e.g. 1500) or string ("1500.00")
        currency: p.currency || 'RUB',
        retailer_id: p.retailer_id,
        image_url: p.image_url || undefined,
        brand: p.brand || undefined,
        category: p.category || undefined,
        url: p.url || websiteUrl || undefined, // Required: Link to product on website
      };

      // Remove undefined keys (Meta API validator can be strict about nulls/empty strings)
      Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

      return {
        method: 'UPDATE', // UPSERT behavior: Create if not exists, Update if exists
        retailer_id: p.retailer_id,
        data: payload,
      };
    });

    const body = {
      requests,
    };

    const url = `${BASE_URL}/${catalogId}/batch?access_token=${token}`;
    
    return await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
};