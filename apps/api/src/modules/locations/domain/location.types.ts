export type LocationType =
  | 'CLIENT_SITE'
  | 'OPERATIONAL_BASE'
  | 'STOP_POINT'
  | 'PASSENGER_PICKUP';

export type LocationStatus = 'ACTIVE' | 'INACTIVE';

export interface StructuredAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export class LocationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationDomainError';
  }
}

/**
 * Valida se latitude e longitude estão nos limites do elipsoide WGS 84.
 */
export function validateGeoPoint(point: GeoPoint): boolean {
  if (point.latitude === undefined || point.longitude === undefined) {
    return false;
  }
  if (typeof point.latitude !== 'number' || typeof point.longitude !== 'number') {
    return false;
  }
  if (Number.isNaN(point.latitude) || Number.isNaN(point.longitude)) {
    return false;
  }
  return (
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

/**
 * Valida integridade do anel linear de um polígono geofence:
 * - Pelo menos 4 vértices
 * - Primeiro vértice igual ao último
 * - Todos os vértices válidos WGS 84
 */
export function validateGeofencePolygon(polygon: GeoPoint[]): boolean {
  if (!Array.isArray(polygon) || polygon.length < 4) {
    return false;
  }

  for (const pt of polygon) {
    if (!validateGeoPoint(pt)) {
      return false;
    }
  }

  const first = polygon[0];
  const last = polygon[polygon.length - 1];

  // Tolerância de ponto flutuante para fechamento de anel
  const isClosed =
    Math.abs(first.latitude - last.latitude) < 1e-6 &&
    Math.abs(first.longitude - last.longitude) < 1e-6;

  return isClosed;
}

/**
 * Distância Haversine entre dois pontos em metros.
 */
export function calculateHaversineDistanceMeters(p1: GeoPoint, p2: GeoPoint): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;
  const lat1 = (p1.latitude * Math.PI) / 180;
  const lat2 = (p2.latitude * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Algoritmo Ray-Casting para avaliar se uma coordenada está dentro de um polígono no domínio.
 */
export function isPointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  if (!validateGeofencePolygon(polygon)) {
    return false;
  }

  let inside = false;
  const x = point.longitude;
  const y = point.latitude;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}
