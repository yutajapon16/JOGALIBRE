export type CategoryCostSettings = {
  fob?: number;
  shipping?: number;
  localCost?: {
    fob?: number;
    asuncion?: number;
    encarnacion?: number;
    pjc?: number;
  };
};

export const CATEGORY_COSTS: Record<string, CategoryCostSettings> = {
  // --- JDM車 ---
  'supra':   { fob: 54000 },
  'skyline': { fob: 54000 },
  'lancer':  { fob: 54000 },
  'rx7':     { fob: 54000 },
  'silvia':  { fob: 54000 },
  'impreza': { fob: 54000 },
  
  // --- その他車両 ---
  'desarme': { fob: 65000 },
  'moto':    { fob: 10000 },
  
  // --- 自動車部品（送料） ---
  'motor':       { shipping: 10000 },
  'transmision': { shipping: 8000 },
  'llantas':     { shipping: 8000 },
  'll16':        { shipping: 8000 },
  'll17':        { shipping: 8000 },
  'll18':        { shipping: 8000 },
  'aros':        { shipping: 6000 },
  'ar16':        { shipping: 6000 },
  'ar17':        { shipping: 6000 },
  'ar18':        { shipping: 6000 },
  'suspension':  { shipping: 2000 },
  'asiento':     { shipping: 9000 },
  'barras':      { shipping: 3000 },
  'freno':       { shipping: 4000 },
  'caraudio':    { shipping: 3000 },
  'reproductor': { shipping: 3000 },
  'amplificador':{ shipping: 3000 },
  'subwoofer':   { shipping: 3000 },
  'altavoz':     { shipping: 3000 },
};
