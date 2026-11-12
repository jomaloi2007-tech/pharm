export type Pharmacy = {
  id: number;
  name: string;
  code: string;
  city: string;
  address: string;
  createdAt: string;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  category: string;
  manufacturer: string;
  price: number;
  createdAt: string;
};

export type InventoryItem = {
  id: number;
  pharmacyId: number;
  productId: number;
  quantity: number;
  minStock: number;
  abc: string;
  xyz: string;
  updatedAt: string;
};

export type Transfer = {
  id: number;
  productId: number;
  fromPharmacyId: number;
  toPharmacyId: number;
  quantity: number;
  status: string;
  note: string;
  createdAt: string;
  completedAt: string | null;
};

export type ImportBatch = {
  id: number;
  filename: string;
  rowsImported: number;
  pharmaciesCount: number;
  productsCount: number;
  totalUnits: number;
  fileSize: number;
  createdAt: string;
};

export type MatrixSnapshot = {
  id: number;
  batchId: number;
  pharmacyId: number;
  abc: string;
  xyz: string;
  positions: number;
  units: number;
};

export type Recommendation = {
  key: string;
  productId: number;
  fromPharmacyId: number;
  toPharmacyId: number;
  sourceInventoryId: number;
  targetInventoryId: number;
  sourceQuantity: number;
  targetQuantity: number;
  targetMinStock: number;
  quantity: number;
  value: number;
};

export type AppData = {
  pharmacies: Pharmacy[];
  products: Product[];
  inventory: InventoryItem[];
  transfers: Transfer[];
  imports: ImportBatch[];
  matrixSnapshots: MatrixSnapshot[];
  recommendations: Recommendation[];
};

export type View = "overview" | "matrix" | "recommendations" | "inventory" | "transfers" | "pharmacies" | "products" | "import";
