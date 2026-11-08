import type { BusinessType } from '@/types';
import { DISH_CATEGORIES, DISH_IMAGES, type DishImage } from './dishImages';
import { SALON_CATEGORIES, SALON_IMAGES } from './salonImages';

/** A set of built-in pictures a business can pick from instead of uploading a photo. */
export interface PictureLibrary {
  id: 'dishes' | 'salon';
  categories: readonly string[];
  images: DishImage[];
  url: (key: string) => string;
  searchHint: string;
}

export const DISH_LIBRARY: PictureLibrary = { id: 'dishes', categories: DISH_CATEGORIES, images: DISH_IMAGES, url: (k) => `/dishes/${k}.svg`, searchHint: 'Search biryani, cola, dosa, tea…' };
export const SALON_LIBRARY: PictureLibrary = { id: 'salon', categories: SALON_CATEGORIES, images: SALON_IMAGES, url: (k) => `/salon/${k}.svg`, searchHint: 'Search haircut, facial, manicure, spa…' };

/** The library that fits a business: dishes for food, salon & spa pictures for salons. */
export function libraryFor(type: BusinessType | string): PictureLibrary | null {
  if (type === 'restaurant' || type === 'hotel') return DISH_LIBRARY;
  if (type === 'salon') return SALON_LIBRARY;
  return null;
}

/** Pictures whose tags appear in the name, best match first. */
export function suggestPictures(lib: PictureLibrary, name: string, limit = 6): DishImage[] {
  const text = name.toLowerCase();
  if (text.trim().length < 3) return [];
  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return lib.images
    .map((d) => ({ d, score: d.tags.reduce((s, t) => s + (text.includes(t) ? t.length + 5 : words.some((w) => t.startsWith(w) || w.startsWith(t)) ? 2 : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.d);
}
