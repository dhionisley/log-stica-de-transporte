import { ServiceLocation } from '../src/modules/locations/domain/service-location.entity';
import {
  type GeoPoint,
  LocationDomainError,
  calculateHaversineDistanceMeters,
  isPointInPolygon,
  validateGeoPoint,
  validateGeofencePolygon,
} from '../src/modules/locations/domain/location.types';

describe('Locations & Geofences Domain', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';

  // Coordenadas de referência: Marco Zero da Praça da Sé, São Paulo (-23.55052, -46.633308)
  const sePoint: GeoPoint = { latitude: -23.55052, longitude: -46.633308 };

  const validAddress = {
    street: 'Praça da Sé',
    number: 'S/N',
    neighborhood: 'Sé',
    city: 'São Paulo',
    state: 'SP',
    postalCode: '01001-000',
  };

  describe('Geographic Coordinate Validation', () => {
    it('validates WGS 84 coordinates', () => {
      expect(validateGeoPoint({ latitude: 0, longitude: 0 })).toBe(true);
      expect(validateGeoPoint(sePoint)).toBe(true);

      expect(validateGeoPoint({ latitude: 91, longitude: 0 })).toBe(false);
      expect(validateGeoPoint({ latitude: -95, longitude: 0 })).toBe(false);
      expect(validateGeoPoint({ latitude: 0, longitude: 181 })).toBe(false);
      expect(validateGeoPoint({ latitude: 0, longitude: -185 })).toBe(false);
      expect(validateGeoPoint({ latitude: Number.NaN, longitude: 0 })).toBe(false);
    });

    it('calculates geodesic Haversine distance in meters', () => {
      // Ponto a ~500 metros ao norte
      const northPoint: GeoPoint = {
        latitude: -23.54602,
        longitude: -46.633308,
      };
      const dist = calculateHaversineDistanceMeters(sePoint, northPoint);
      expect(dist).toBeGreaterThan(450);
      expect(dist).toBeLessThan(550);
    });
  });

  describe('Geofence Polygon Validation & Ray-Casting', () => {
    // Quadrilátero fechado em torno da Sé
    const squareGeofence: GeoPoint[] = [
      { latitude: -23.550, longitude: -46.634 },
      { latitude: -23.550, longitude: -46.632 },
      { latitude: -23.552, longitude: -46.632 },
      { latitude: -23.552, longitude: -46.634 },
      { latitude: -23.550, longitude: -46.634 }, // Fechamento
    ];

    it('validates closed polygon ring', () => {
      expect(validateGeofencePolygon(squareGeofence)).toBe(true);

      // Polígono não fechado
      const openPolygon = squareGeofence.slice(0, 4);
      expect(validateGeofencePolygon(openPolygon)).toBe(false);

      // Menos de 4 pontos
      expect(validateGeofencePolygon(squareGeofence.slice(0, 3))).toBe(false);
    });

    it('detects point containment within polygon', () => {
      const insidePoint: GeoPoint = { latitude: -23.551, longitude: -46.633 };
      const outsidePoint: GeoPoint = { latitude: -23.560, longitude: -46.640 };

      expect(isPointInPolygon(insidePoint, squareGeofence)).toBe(true);
      expect(isPointInPolygon(outsidePoint, squareGeofence)).toBe(false);
    });
  });

  describe('ServiceLocation Aggregate', () => {
    it('creates an active location with valid coordinates', () => {
      const location = ServiceLocation.create({
        tenantId,
        name: 'Matriz Operacional Centro',
        locationType: 'OPERATIONAL_BASE',
        addressStructured: validAddress,
        point: sePoint,
        geofenceRadiusMeters: 200,
      });

      expect(location.id).toBeDefined();
      expect(location.tenantId).toBe(tenantId);
      expect(location.name).toBe('Matriz Operacional Centro');
      expect(location.locationType).toBe('OPERATIONAL_BASE');
      expect(location.point).toEqual(sePoint);
      expect(location.geofenceRadiusMeters).toBe(200);
      expect(location.status).toBe('ACTIVE');
    });

    it('throws error when coordinates are invalid', () => {
      expect(() => {
        ServiceLocation.create({
          tenantId,
          name: 'Ponto Inválido',
          addressStructured: validAddress,
          point: { latitude: 95, longitude: 0 },
        });
      }).toThrow(LocationDomainError);
    });

    it('evaluates containment with circular radius', () => {
      const location = ServiceLocation.create({
        tenantId,
        name: 'Ponto Circular',
        addressStructured: validAddress,
        point: sePoint,
        geofenceRadiusMeters: 100, // 100 metros
      });

      // Ponto a ~50 metros
      const nearPoint: GeoPoint = {
        latitude: -23.5501,
        longitude: -46.633308,
      };
      expect(location.containsPoint(nearPoint)).toBe(true);

      // Ponto a ~1 km
      const farPoint: GeoPoint = {
        latitude: -23.560,
        longitude: -46.633308,
      };
      expect(location.containsPoint(farPoint)).toBe(false);
    });

    it('evaluates containment with polygonal geofence', () => {
      const squareGeofence: GeoPoint[] = [
        { latitude: -23.550, longitude: -46.634 },
        { latitude: -23.550, longitude: -46.632 },
        { latitude: -23.552, longitude: -46.632 },
        { latitude: -23.552, longitude: -46.634 },
        { latitude: -23.550, longitude: -46.634 },
      ];

      const location = ServiceLocation.create({
        tenantId,
        name: 'Complexo Industrial Cliente',
        locationType: 'CLIENT_SITE',
        addressStructured: validAddress,
        point: sePoint,
        geofence: squareGeofence,
      });

      expect(location.containsPoint({ latitude: -23.551, longitude: -46.633 })).toBe(true);
      expect(location.containsPoint({ latitude: -23.555, longitude: -46.633 })).toBe(false);
    });

    it('supports activation and deactivation', () => {
      const location = ServiceLocation.create({
        tenantId,
        name: 'Ponto Desativável',
        addressStructured: validAddress,
        point: sePoint,
      });

      location.deactivate();
      expect(location.status).toBe('INACTIVE');

      location.activate();
      expect(location.status).toBe('ACTIVE');
    });
  });
});
