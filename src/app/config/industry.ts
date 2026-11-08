import type { BusinessType } from '@/types';

/** An industry-specific detail stored in an item's `attributes`. */
export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  options?: string[];
  placeholder?: string;
  hint?: string;
  /** Shown as a column in the list. */
  column?: boolean;
}

export interface GoodsConfig {
  /** Page and menu title, e.g. "Menu". */
  title: string;
  /** One item, e.g. "Dish". */
  singular: string;
  description: string;
  emptyText: string;
  namePlaceholder: string;
  categoryPlaceholder: string;
  units: string[];
  defaultUnit: string;
  defaultGst: number;
  defaultHsn: string;
  /** New items don't track stock by default (dishes). */
  noStockDefault: boolean;
  features: {
    /** "Sell as" options with their own price, e.g. Half / Full, Box of 10. */
    options?: { label: string; hint: string; namePlaceholder: string; withFactor: boolean };
    addons?: boolean;
    /** Sold in fractions (kg, metre). */
    looseSale?: boolean;
    tradePrice?: boolean;
    mrp?: boolean;
    expiry?: boolean;
    /** Create one item per size × colour. */
    variants?: boolean;
    /** Products used inside the business (salon shampoo, wax), never sold; services use them up. */
    inHouse?: boolean;
  };
  fields: FieldSpec[];
}

export interface ServicesConfig {
  title: string;
  singular: string;
  description: string;
  emptyText: string;
  namePlaceholder: string;
  categoryPlaceholder: string;
  defaultSac: string;
  defaultGst: number;
  /** What the price is for. The first one is the default. */
  priceUnits: { value: string; label: string }[];
  showDuration: boolean;
  showStaff: boolean;
  showCommission: boolean;
  /** Pick who gave each service while billing, and set in-house products each service uses. */
  staffOnBill?: boolean;
  fields: FieldSpec[];
}

export interface PackagesConfig {
  title: string;
  singular: string;
  description: string;
  emptyText: string;
  namePlaceholder: string;
}

export interface IndustryConfig {
  goods: GoodsConfig;
  services: ServicesConfig;
  packages: PackagesConfig;
}

export const PRICE_UNIT_LABEL: Record<string, string> = {
  service: 'per service', page: 'per page', copy: 'per copy', plate: 'per plate', person: 'per person', day: 'per day', night: 'per night',
  visit: 'per visit', hour: 'per hour', point: 'per point', trip: 'per trip', piece: 'per piece',
};
const unit = (value: string, label = PRICE_UNIT_LABEL[value]) => ({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });

const GENERAL_UNITS = ['Pcs', 'Pack', 'Box', 'Set', 'Pair', 'Kg', 'Gram', 'Litre', 'ml', 'Metre', 'Dozen'];

const GENERAL: IndustryConfig = {
  goods: {
    title: 'Products',
    singular: 'Product',
    description: 'Your catalogue with pricing, tax and stock levels.',
    emptyText: 'Add the products you sell with their price and GST.',
    namePlaceholder: 'e.g. Product name',
    categoryPlaceholder: 'Choose or type',
    units: GENERAL_UNITS,
    defaultUnit: 'Pcs',
    defaultGst: 18,
    defaultHsn: '',
    noStockDefault: false,
    features: { mrp: true, options: { label: 'Sell as', hint: 'Sell the same item in another pack size, e.g. "Box of 10".', namePlaceholder: 'Box of 10', withFactor: true }, looseSale: true },
    fields: [],
  },
  services: {
    title: 'Services',
    singular: 'Service',
    description: 'Work you do for customers, billed from POS.',
    emptyText: 'Add the services you offer so you can bill them.',
    namePlaceholder: 'e.g. Installation',
    categoryPlaceholder: 'Choose or type',
    defaultSac: '',
    defaultGst: 18,
    priceUnits: [unit('service'), unit('hour'), unit('visit'), unit('piece')],
    showDuration: true,
    showStaff: true,
    showCommission: true,
    fields: [],
  },
  packages: {
    title: 'Packages',
    singular: 'Package',
    description: 'Combos of products and services sold at one price.',
    emptyText: 'Bundle products and services into one package with a special price.',
    namePlaceholder: 'e.g. Starter combo',
  },
};

const CONFIG: Partial<Record<BusinessType, IndustryConfig>> = {
  restaurant: {
    goods: {
      title: 'Menu',
      singular: 'Dish',
      description: 'Dishes and drinks with portions, add-ons and veg marks.',
      emptyText: 'Add your dishes and drinks to start billing tables and takeaway.',
      namePlaceholder: 'e.g. Chicken Biriyani',
      categoryPlaceholder: 'Starters, Main Course, Drinks…',
      units: ['Plate', 'Bowl', 'Piece', 'Glass', 'Cup', 'Bottle', 'Kg'],
      defaultUnit: 'Plate',
      defaultGst: 5,
      defaultHsn: '996331',
      noStockDefault: true,
      features: { options: { label: 'Portions', hint: 'Half / Full, Small / Medium / Large — each with its own price.', namePlaceholder: 'Half', withFactor: false }, addons: true },
      fields: [{ key: 'foodType', label: 'Food type', type: 'select', options: ['Veg', 'Non-veg', 'Egg'], column: true }],
    },
    services: {
      title: 'Catering & Events',
      singular: 'Catering package',
      description: 'Per-plate catering menus, party hall and outdoor events.',
      emptyText: 'Add catering menus and event packages priced per plate or per event.',
      namePlaceholder: 'e.g. Wedding Veg Menu (12 items)',
      categoryPlaceholder: 'Wedding, Birthday, Corporate…',
      defaultSac: '996334',
      defaultGst: 18,
      priceUnits: [unit('plate'), unit('person'), unit('service', 'per event')],
      showDuration: false,
      showStaff: false,
      showCommission: false,
      fields: [
        { key: 'minGuests', label: 'Minimum guests', type: 'number', column: true },
        { key: 'includes', label: 'Menu / what is included', type: 'text', placeholder: 'Welcome drink, 2 starters, biriyani, dessert' },
      ],
    },
    packages: { title: 'Combos & Thalis', singular: 'Combo', description: 'Meal deals billed as one item.', emptyText: 'Create combos like "Biriyani + Coke" at a special price.', namePlaceholder: 'e.g. Biriyani Combo' },
  },
  hotel: {
    goods: {
      ...GENERAL.goods,
      title: 'Minibar & Shop',
      singular: 'Item',
      description: 'Minibar, snacks and shop items charged to guests.',
      emptyText: 'Add minibar and shop items you charge guests for.',
      namePlaceholder: 'e.g. Mineral Water 1L',
      units: ['Pcs', 'Bottle', 'Pack', 'Can'],
      features: { mrp: true },
    },
    services: {
      title: 'Guest Services',
      singular: 'Guest service',
      description: 'Laundry, room service, pickup, extra bed and other charges.',
      emptyText: 'Add the services you charge guests for.',
      namePlaceholder: 'e.g. Laundry – shirt',
      categoryPlaceholder: 'Laundry, Transport, Food…',
      defaultSac: '9963',
      defaultGst: 18,
      priceUnits: [unit('piece'), unit('service'), unit('day'), unit('night'), unit('person'), unit('trip')],
      showDuration: false,
      showStaff: false,
      showCommission: false,
      fields: [],
    },
    packages: { title: 'Stay Packages', singular: 'Stay package', description: 'Stays bundled with meals, pickup and extras.', emptyText: 'Create stay packages like "2 nights + breakfast + pickup".', namePlaceholder: 'e.g. Weekend Getaway (2N/3D)' },
  },
  salon: {
    goods: {
      ...GENERAL.goods,
      title: 'Retail Products',
      singular: 'Product',
      description: 'Shampoos, creams and other products you sell.',
      emptyText: 'Add the products you sell over the counter.',
      namePlaceholder: 'e.g. Anti-dandruff Shampoo 200ml',
      categoryPlaceholder: 'Hair care, Skin care…',
      units: ['Pcs', 'Bottle', 'Tube', 'Pack', 'ml', 'Litre', 'Gram', 'Kg'],
      features: { mrp: true, expiry: true, inHouse: true, looseSale: true },
    },
    services: {
      title: 'Services',
      singular: 'Service',
      description: 'Haircuts, facials, spa and every service you offer.',
      emptyText: 'Add your services with duration, staff and commission.',
      namePlaceholder: 'e.g. Haircut & Styling',
      categoryPlaceholder: 'Hair, Skin, Spa, Nails…',
      defaultSac: '999721',
      defaultGst: 18,
      priceUnits: [unit('service')],
      showDuration: true,
      showStaff: true,
      showCommission: true,
      staffOnBill: true,
      fields: [{ key: 'gender', label: 'For', type: 'select', options: ['Unisex', 'Men', 'Women', 'Kids'], column: true }],
    },
    packages: { title: 'Packages', singular: 'Package', description: 'Service combos like Haircut + Facial at one price.', emptyText: 'Create packages like "Haircut + Face Massage" or a bridal package.', namePlaceholder: 'e.g. Haircut + Face Massage' },
  },
  grocery: {
    goods: {
      ...GENERAL.goods,
      description: 'Packed and loose items with MRP, batch and expiry.',
      namePlaceholder: 'e.g. Basmati Rice',
      categoryPlaceholder: 'Rice & Grains, Oil, Snacks…',
      units: ['Pcs', 'Pack', 'Kg', 'Gram', 'Litre', 'ml', 'Dozen', 'Box'],
      defaultGst: 5,
      features: {
        mrp: true,
        expiry: true,
        looseSale: true,
        tradePrice: true,
        options: { label: 'Pack sizes', hint: 'Sell the same item as "1 kg pack", "5 kg bag" — each uses that much stock.', namePlaceholder: '5 kg bag', withFactor: true },
      },
      fields: [{ key: 'batch', label: 'Batch no.', type: 'text' }],
    },
    services: { ...GENERAL.services, title: 'Services', description: 'Home delivery and other charges.', namePlaceholder: 'e.g. Home delivery', priceUnits: [unit('service'), unit('trip')], showDuration: false, showStaff: false, showCommission: false },
    packages: { title: 'Offers & Combo Packs', singular: 'Combo pack', description: 'Combo packs and bundle offers.', emptyText: 'Create combo packs like "Breakfast pack" at a special price.', namePlaceholder: 'e.g. Breakfast Combo Pack' },
  },
  stationery: {
    goods: {
      ...GENERAL.goods,
      title: 'Products & Books',
      description: 'Stationery and books with sizes, colours and box / single pricing.',
      namePlaceholder: 'e.g. Classmate Notebook 172 pages',
      categoryPlaceholder: 'Notebooks, Pens, Books, Art…',
      units: ['Pcs', 'Box', 'Pack', 'Ream', 'Set', 'Dozen'],
      defaultGst: 12,
      features: { mrp: true, tradePrice: true, options: { label: 'Sell as', hint: 'Sell singly or by the box, e.g. "Box of 10".', namePlaceholder: 'Box of 10', withFactor: true } },
      fields: [
        { key: 'isbn', label: 'ISBN (books)', type: 'text' },
        { key: 'author', label: 'Author (books)', type: 'text' },
        { key: 'publisher', label: 'Publisher', type: 'text' },
        { key: 'colour', label: 'Colour', type: 'text' },
      ],
    },
    services: {
      title: 'Print & Xerox',
      singular: 'Print service',
      description: 'Xerox, printing, lamination, binding and scanning.',
      emptyText: 'Add print and xerox rates per page or per copy.',
      namePlaceholder: 'e.g. Xerox A4 B/W',
      categoryPlaceholder: 'Xerox, Print, Lamination, Binding…',
      defaultSac: '998912',
      defaultGst: 18,
      priceUnits: [unit('page'), unit('copy'), unit('piece'), unit('service')],
      showDuration: false,
      showStaff: false,
      showCommission: false,
      fields: [
        { key: 'colourMode', label: 'Colour', type: 'select', options: ['B/W', 'Colour'], column: true },
        { key: 'paperSize', label: 'Paper size', type: 'select', options: ['A4', 'A3', 'Legal', 'Letter', 'A5'], column: true },
      ],
    },
    packages: { title: 'School Kits', singular: 'Kit', description: 'Book and stationery kits by class or school.', emptyText: 'Create kits like "Class 5 – ABC School" billed as one item.', namePlaceholder: 'e.g. Class 5 Kit – ABC School' },
  },
  mobile: {
    goods: {
      ...GENERAL.goods,
      title: 'Phones & Accessories',
      description: 'Phones with model, colour, RAM, storage and warranty, plus accessories.',
      namePlaceholder: 'e.g. Redmi Note 13 5G',
      categoryPlaceholder: 'Smartphones, Chargers, Covers…',
      units: ['Pcs', 'Set', 'Pack'],
      features: { mrp: true, tradePrice: true },
      fields: [
        { key: 'model', label: 'Model', type: 'text' },
        { key: 'colour', label: 'Colour', type: 'text' },
        { key: 'ram', label: 'RAM', type: 'select', options: ['', '2 GB', '3 GB', '4 GB', '6 GB', '8 GB', '12 GB', '16 GB'], column: true },
        { key: 'storage', label: 'Storage', type: 'select', options: ['', '32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB'], column: true },
        { key: 'warrantyMonths', label: 'Warranty (months)', type: 'number' },
        { key: 'imeiTracking', label: 'Track IMEI / serial for each piece', type: 'boolean' },
      ],
    },
    services: {
      title: 'Repairs & Services',
      singular: 'Service',
      description: 'Screen and battery replacement, software, recharge and other services.',
      emptyText: 'Add repair and service rates.',
      namePlaceholder: 'e.g. Screen replacement (labour)',
      categoryPlaceholder: 'Repair, Software, Recharge…',
      defaultSac: '998713',
      defaultGst: 18,
      priceUnits: [unit('service'), unit('piece')],
      showDuration: true,
      showStaff: true,
      showCommission: true,
      fields: [],
    },
    packages: { title: 'Combos', singular: 'Combo', description: 'Phone + cover + screen guard and other bundles.', emptyText: 'Create combos like "Phone + cover + tempered glass".', namePlaceholder: 'e.g. Phone + Cover + Glass' },
  },
  pharmacy: {
    goods: {
      ...GENERAL.goods,
      title: 'Medicines & Products',
      singular: 'Item',
      description: 'Medicines with composition, schedule, batch and expiry, plus other products.',
      namePlaceholder: 'e.g. Dolo 650',
      categoryPlaceholder: 'Tablets, Syrups, Ointments, FMCG…',
      units: ['Strip', 'Tablet', 'Bottle', 'Tube', 'Pcs', 'Box'],
      defaultUnit: 'Strip',
      defaultGst: 12,
      features: { mrp: true, expiry: true, options: { label: 'Sell as', hint: 'Sell loose or by the box, e.g. "Box of 10 strips".', namePlaceholder: 'Box of 10', withFactor: true } },
      fields: [
        { key: 'composition', label: 'Composition', type: 'text', placeholder: 'Paracetamol 650 mg', column: true },
        { key: 'schedule', label: 'Schedule', type: 'select', options: ['OTC', 'H', 'H1', 'X'], column: true, hint: 'H, H1 and X need a prescription.' },
        { key: 'batch', label: 'Batch no.', type: 'text' },
        { key: 'rack', label: 'Rack', type: 'text' },
      ],
    },
    services: { ...GENERAL.services, title: 'Health Services', description: 'BP / sugar checks, home delivery and other services.', namePlaceholder: 'e.g. Blood sugar test', priceUnits: [unit('service'), unit('visit'), unit('trip')], showDuration: false, showStaff: false, showCommission: false },
    packages: { ...GENERAL.packages, title: 'Health Kits', singular: 'Kit', description: 'Bundles like first-aid or diabetic care kits.', namePlaceholder: 'e.g. First Aid Kit' },
  },
  jewellery: {
    goods: {
      ...GENERAL.goods,
      title: 'Products',
      description: 'Coins, silver articles and fixed-price items. Ornaments priced by weight are in Jewellery.',
      namePlaceholder: 'e.g. Silver Coin 10g',
      categoryPlaceholder: 'Coins, Silver articles, Gift items…',
      units: ['Pcs', 'Gram', 'Set'],
      defaultGst: 3,
      features: { mrp: false },
      fields: [
        { key: 'purity', label: 'Purity', type: 'select', options: ['', '24K', '22K', '18K', '999', '925'], column: true },
        { key: 'weight', label: 'Weight (g)', type: 'number' },
        { key: 'huid', label: 'HUID', type: 'text' },
      ],
    },
    services: {
      title: 'Repairs & Custom Orders',
      singular: 'Service',
      description: 'Polishing, resizing, repairs and making charges.',
      emptyText: 'Add repair and making-charge rates.',
      namePlaceholder: 'e.g. Ring resizing',
      categoryPlaceholder: 'Repair, Polishing, Making…',
      defaultSac: '998898',
      defaultGst: 5,
      priceUnits: [unit('service'), unit('piece')],
      showDuration: false,
      showStaff: true,
      showCommission: false,
      fields: [],
    },
    packages: { ...GENERAL.packages, title: 'Gift Combos', singular: 'Combo', description: 'Gift sets and combos at one price.', namePlaceholder: 'e.g. Silver Pooja Set' },
  },
  clothing: {
    goods: {
      ...GENERAL.goods,
      description: 'Clothes and footwear in sizes and colours, each with its own stock and barcode.',
      namePlaceholder: 'e.g. Cotton Kurta',
      categoryPlaceholder: 'Shirts, Kurtas, Sarees, Footwear…',
      units: ['Pcs', 'Pair', 'Set', 'Metre'],
      defaultGst: 5,
      features: { mrp: true, variants: true, looseSale: true },
      fields: [
        { key: 'gender', label: 'For', type: 'select', options: ['', 'Men', 'Women', 'Kids', 'Unisex'], column: true },
        { key: 'fabric', label: 'Fabric / material', type: 'text' },
        { key: 'size', label: 'Size', type: 'text', column: true },
        { key: 'colour', label: 'Colour', type: 'text', column: true },
      ],
    },
    services: {
      title: 'Tailoring & Alterations',
      singular: 'Tailoring service',
      description: 'Stitching and alteration rates.',
      emptyText: 'Add stitching and alteration rates.',
      namePlaceholder: 'e.g. Blouse stitching',
      categoryPlaceholder: 'Stitching, Alteration…',
      defaultSac: '998821',
      defaultGst: 5,
      priceUnits: [unit('piece'), unit('service')],
      showDuration: false,
      showStaff: true,
      showCommission: true,
      fields: [{ key: 'deliveryDays', label: 'Usual delivery (days)', type: 'number', column: true }],
    },
    packages: { title: 'Combos & Sets', singular: 'Combo', description: 'Sets and bundle offers like "Buy 2 at ₹999".', emptyText: 'Create sets and combos at a special price.', namePlaceholder: 'e.g. Kurta + Pyjama Set' },
  },
  hardware: {
    goods: {
      ...GENERAL.goods,
      description: 'Items sold by piece, box, kg, metre or bundle, with trade prices for contractors.',
      namePlaceholder: 'e.g. PVC Pipe 1/2 inch',
      categoryPlaceholder: 'Plumbing, Electrical, Paint, Cement…',
      units: ['Pcs', 'Box', 'Kg', 'Metre', 'Feet', 'Bag', 'Bundle', 'Litre', 'Set', 'Coil'],
      features: {
        mrp: true,
        tradePrice: true,
        looseSale: true,
        options: { label: 'Sell as', hint: 'Sell by another unit, e.g. "Box of 10" or "Coil (90 m)" — each uses that much stock.', namePlaceholder: 'Box of 10', withFactor: true },
      },
      fields: [{ key: 'spec', label: 'Size / spec', type: 'text', placeholder: '1/2 inch, 2.5 sq mm…', column: true }],
    },
    services: {
      title: 'Installation & Fitting',
      singular: 'Service',
      description: 'Electrician and plumber visits, fitting, cutting and transport.',
      emptyText: 'Add installation, fitting and transport charges.',
      namePlaceholder: 'e.g. Fan installation',
      categoryPlaceholder: 'Electrical, Plumbing, Transport…',
      defaultSac: '995461',
      defaultGst: 18,
      priceUnits: [unit('visit'), unit('point'), unit('hour'), unit('piece'), unit('trip'), unit('service')],
      showDuration: false,
      showStaff: true,
      showCommission: true,
      fields: [],
    },
    packages: { title: 'Kits', singular: 'Kit', description: 'Fitting kits and packages at one price.', emptyText: 'Create kits like "Bathroom fitting kit".', namePlaceholder: 'e.g. Bathroom Fitting Kit' },
  },
};

/** Labels, fields and features for a business type's catalogue pages. */
export function industryConfig(type: BusinessType | undefined): IndustryConfig {
  return (type && CONFIG[type]) || GENERAL;
}

/** Work taken in and handed back later: repairs, tailoring, custom orders. */
export interface JobsConfig {
  title: string;
  singular: string;
  description: string;
  kind: 'repair' | 'tailoring' | 'custom' | 'service';
  itemLabel: string;
  itemPlaceholder: string;
  identifierLabel: string;
  problemLabel: string;
  problemPlaceholder: string;
  /** Free-form details captured on the card (measurements, lock code…). */
  detailsTitle: string;
  details: FieldSpec[];
  /** Status names in the language of the trade. */
  statusLabels: Record<'received' | 'in_progress' | 'ready' | 'delivered' | 'cancelled', string>;
}

const STATUS_LABELS: JobsConfig['statusLabels'] = { received: 'Received', in_progress: 'In progress', ready: 'Ready', delivered: 'Delivered', cancelled: 'Cancelled' };

const measure = (key: string, label: string): FieldSpec => ({ key, label, type: 'text', placeholder: 'inches' });

const JOBS: Partial<Record<BusinessType, JobsConfig>> = {
  mobile: {
    title: 'Repair Jobs',
    singular: 'Repair job',
    description: 'Phones taken in for repair — from receipt to delivery and billing.',
    kind: 'repair',
    itemLabel: 'Device',
    itemPlaceholder: 'e.g. Redmi Note 13 5G (Blue)',
    identifierLabel: 'IMEI / Serial',
    problemLabel: 'Problem reported',
    problemPlaceholder: 'e.g. Display broken, touch not working',
    detailsTitle: 'Device condition',
    details: [
      { key: 'lockCode', label: 'Screen lock / password', type: 'text' },
      { key: 'accessories', label: 'Accessories received', type: 'text', placeholder: 'SIM tray, cover, charger…' },
      { key: 'condition', label: 'Physical condition', type: 'text', placeholder: 'Scratches, back cracked…' },
      { key: 'warrantyRepair', label: 'Under warranty', type: 'boolean' },
    ],
    statusLabels: { ...STATUS_LABELS, in_progress: 'Repairing', ready: 'Ready for pickup' },
  },
  clothing: {
    title: 'Tailoring Orders',
    singular: 'Tailoring order',
    description: 'Stitching and alteration orders with measurements, trial and delivery dates.',
    kind: 'tailoring',
    itemLabel: 'Garment',
    itemPlaceholder: 'e.g. Blouse, Kurta, Pant alteration',
    identifierLabel: 'Fabric / reference',
    problemLabel: 'Design & instructions',
    problemPlaceholder: 'e.g. Boat neck, 3/4 sleeves, with lining',
    detailsTitle: 'Measurements',
    details: [
      measure('length', 'Length'), measure('chest', 'Chest / Bust'), measure('waist', 'Waist'), measure('hip', 'Hip'),
      measure('shoulder', 'Shoulder'), measure('sleeveLength', 'Sleeve length'), measure('sleeveRound', 'Sleeve round'), measure('armhole', 'Armhole'),
      measure('frontNeck', 'Front neck'), measure('backNeck', 'Back neck'), measure('inseam', 'Inseam'), measure('bottom', 'Bottom'),
      { key: 'trialDate', label: 'Trial date', type: 'text', placeholder: 'dd/mm' },
    ],
    statusLabels: { ...STATUS_LABELS, in_progress: 'Stitching', ready: 'Ready' },
  },
};

const GENERAL_JOBS: JobsConfig = {
  title: 'Job Cards',
  singular: 'Job card',
  description: 'Repairs, custom work and orders taken in and delivered later.',
  kind: 'service',
  itemLabel: 'Item received',
  itemPlaceholder: 'e.g. Mixer grinder',
  identifierLabel: 'Serial / reference',
  problemLabel: 'Work required',
  problemPlaceholder: 'Describe the problem or the work to be done',
  detailsTitle: 'Details',
  details: [{ key: 'accessories', label: 'Items received with it', type: 'text' }, { key: 'condition', label: 'Condition', type: 'text' }],
  statusLabels: STATUS_LABELS,
};

export function jobsConfig(type: BusinessType | undefined): JobsConfig {
  return (type && JOBS[type]) || GENERAL_JOBS;
}
