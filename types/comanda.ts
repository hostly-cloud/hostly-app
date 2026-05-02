export type ComandaItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

export type CatalogProduct = {
  id: string;
  name: string;
  price: number;
  category: string;
};

export type PastOrder = {
  id: string;
  total: number;
  createdAt?: number;
  items: ComandaItem[];
};

