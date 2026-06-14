import { calculateDefaultFobCost, calculateDefaultShippingCost } from './lib/utils.ts';
console.log('FOB for supra URL:', calculateDefaultFobCost("some title", "https://example.com?jcat=supra"));
console.log('Shipping for motor URL:', calculateDefaultShippingCost("some title", "https://example.com?jcat=motor"));
