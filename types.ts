
export interface ProductItem {
  retailer_id: string;
  name: string;
  price: number; // Price in currency units (e.g. 100.50 for 100 rub 50 kop), NOT cents
  description?: string;
  image_url?: string;
  brand?: string;
  category?: string;
  url?: string; // Product URL
  availability?: 'in stock' | 'out of stock';
  condition?: 'new' | 'refurbished' | 'used';
  currency?: string;
}

export interface AppConfig {
  accessToken: string;
  catalogId: string;
  businessId?: string;
  websiteUrl: string;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  details?: string;
}

export interface UploadStats {
  total: number;
  processed: number;
  success: number;
  failed: number;
}

export interface BatchRequestItem {
  method: string;
  retailer_id: string;
  data: any;
}

export interface BatchResponse {
  handles: string[];
  validation_status: any[];
  errors?: any[];
}

export interface Catalog {
  id: string;
  name: string;
  vertical?: string;
  business_id?: string;
}
