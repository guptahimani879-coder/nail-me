export type SkinTone  = 'fair' | 'light' | 'medium' | 'tan' | 'deep' | 'rich';
export type Undertone = 'warm' | 'cool' | 'neutral';
export type Complexity = 'easy' | 'intermediate' | 'advanced';
export type Occasion  = 'casual' | 'work' | 'wedding' | 'holiday' | 'fun';

export interface ColorRecommendation {
  name: string;
  hex: string;
  brand: string;
  productName: string;
  reason: string;
}

export interface NailArtSuggestion {
  style: string;
  complexity: Complexity;
  description: string;
  toolsNeeded: string[];
  estimatedTime: string;
}

export interface NailRecommendation {
  skinTone: SkinTone;
  undertone: Undertone;
  nailLength: string;
  occasion: Occasion;
  colorRecommendations: ColorRecommendation[];
  nailArtSuggestions: NailArtSuggestion[];
  stylistNote: string;
}

// One mask per nail click — stored as a 2D boolean array or ImageData
export interface NailMask {
  pointX: number;       // click x in original image pixels
  pointY: number;       // click y in original image pixels
  maskImageUrl: string; // URL of the binary mask PNG returned by SAM
}
