import 'leaflet/dist/leaflet.css';
import React, { useState, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { TripConditions, fetchTripConditions, BuoyDetail, fetchBuoyDetail } from '../services/weatherWaterService';
import WeatherWaterCard from './WeatherWaterCard';
import { celsiusToFahrenheit } from '../utils/formatters';

function cToF(c: number | null): string {
  if (c === null) return '—';
  return `${Math.round(celsiusToFahrenheit(c))}°F`;
}

function trendArrow(trend: TripConditions['pressure_trend']): string {
  if (trend === 'rising')  return ' · Rising ↑';
  if (trend === 'falling') return ' · Falling ↓';
  if (trend === 'steady')  return ' · Steady';
  return '';
}

const GEORGIAN_BAY_CENTER: [number, number] = [45.0, -80.5];
const GEORGIAN_BAY_ZOOM = 9;

function createPinIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#4fc3f7;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function MapClickHandler({ onTap }: { onTap: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onTap(e.latlng.lat, e.latlng.lng); } });
  return null;
}

const GB_BUOY_MARKERS = [
  { id: '45143', latitude: 44.940, longitude: -80.627, name: 'South Georgian Bay' },
  { id: '45137', latitude: 45.540, longitude: -81.020, name: 'Central Georgian Bay' },
];

function createBuoyIcon(isSelected: boolean) {
  const color = isSelected ? '#4fc3f7' : '#6b7f99';
  const size = isSelected ? 16 : 12;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PlanningModal({ visible, onClose }: Props) {
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [conditions, setConditions] = useState<TripConditions | null>(null);
  const [loading, setLoading] = useState(false);
  const [tappedBuoyId, setTappedBuoyId] = useState<string | null>(null);
  const [buoyDetail, setBuoyDetail] = useState<BuoyDetail | null>(null);
  const [buoyDetailLoading, setBuoyDetailLoading] = useState(false);

  const handleClose = useCallback(() => {
    setPin(null);
    setConditions(null);
    setTappedBuoyId(null);
    setBuoyDetail(null);
    onClose();
  }, [onClose]);

  const handleTap = useCallback(async (lat: number, lng: number) => {
    setPin([lat, lng]);
    setConditions(null);
    setLoading(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      const data = await fetchTripConditions(lat, lng, date);
      setConditions(data);
    } catch (err) {
      console.warn('[PlanningModal] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBuoyTap = useCallback(async (buoyId: string) => {
    setTappedBuoyId(buoyId);
    setBuoyDetail(null);
    setBuoyDetailLoading(true);
    try {
      const data = await fetchBuoyDetail(buoyId);
      setBuoyDetail(data);
    } catch (err) {
      console.warn('[PlanningModal] buoy fetch failed:', err);
    } finally {
      setBuoyDetailLoading(false);
    }
  }, []);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title}>Trip Planner  ·  Georgian Bay</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.close}>✕  Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mapContainer}>
          <MapContainer
            center={GEORGIAN_BAY_CENTER}
            zoom={GEORGIAN_BAY_ZOOM}
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            />
            <MapClickHandler onTap={handleTap} />
            {pin && <Marker position={pin} icon={createPinIcon()} />}
            {GB_BUOY_MARKERS.map(b => {
              const isSelected = b.id === conditions?.selected_buoy_id;
              return (
                <Marker
                  key={b.id}
                  position={[b.latitude, b.longitude]}
                  icon={createBuoyIcon(isSelected)}
                  eventHandlers={{ click: () => handleBuoyTap(b.id) }}
                >
                  <Popup>
                    <div style={{ fontFamily: 'sans-serif', minWidth: 140 }}>
                      <div style={{ fontWeight: 'bold' }}>{b.name}</div>
                      <div style={{ color: '#666', fontSize: '12px' }}>{b.id}</div>
                      {isSelected && (
                        <div style={{ color: '#4fc3f7', fontSize: '12px', marginTop: '4px' }}>📡 AI Selected</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </View>

        <Text style={styles.hint}>
          {pin
            ? `${pin[0].toFixed(3)}°N  ${Math.abs(pin[1]).toFixed(3)}°W  —  click anywhere to move`
            : 'Click anywhere on the map to load conditions for that spot'}
        </Text>

        <ScrollView style={styles.results} contentContainerStyle={{ paddingBottom: 40 }}>
          {loading && (
            <ActivityIndicator color="#4fc3f7" size="large" style={{ marginTop: 28 }} />
          )}
          {tappedBuoyId && (
            <View style={styles.buoyDetailPanel}>
              <Text style={styles.buoyDetailTitle}>
                📡 {GB_BUOY_MARKERS.find(b => b.id === tappedBuoyId)?.name}
                {tappedBuoyId === conditions?.selected_buoy_id ? '  ·  AI Selected' : ''}
              </Text>
              {buoyDetailLoading && <ActivityIndicator color="#4fc3f7" style={{ marginVertical: 8 }} />}
              {buoyDetail && !buoyDetailLoading && (
                <>
                  <View style={styles.buoyDetailRow}>
                    <Text style={styles.buoyDetailLabel}>Wind</Text>
                    <Text style={styles.buoyDetailValue}>
                      {buoyDetail.wind_speed_ms !== null
                        ? `${Math.round(buoyDetail.wind_speed_ms * 3.6)} km/h ${buoyDetail.wind_direction_label ?? ''}`
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.buoyDetailRow}>
                    <Text style={styles.buoyDetailLabel}>Gusts</Text>
                    <Text style={styles.buoyDetailValue}>
                      {buoyDetail.wind_gust_ms !== null ? `${Math.round(buoyDetail.wind_gust_ms * 3.6)} km/h` : '—'}
                    </Text>
                  </View>
                  <View style={styles.buoyDetailRow}>
                    <Text style={styles.buoyDetailLabel}>Waves</Text>
                    <Text style={styles.buoyDetailValue}>
                      {buoyDetail.wave_height_m !== null ? `${buoyDetail.wave_height_m} m` : '—'}
                    </Text>
                  </View>
                  <View style={styles.buoyDetailRow}>
                    <Text style={styles.buoyDetailLabel}>Pressure</Text>
                    <Text style={styles.buoyDetailValue}>
                      {buoyDetail.pressure_hpa !== null ? `${buoyDetail.pressure_hpa} hPa` : '—'}
                    </Text>
                  </View>
                  <View style={styles.buoyDetailRow}>
                    <Text style={styles.buoyDetailLabel}>Air Temp</Text>
                    <Text style={styles.buoyDetailValue}>
                      {buoyDetail.air_temp_c !== null ? `${Math.round(buoyDetail.air_temp_c * 9 / 5 + 32)}°F` : '—'}
                    </Text>
                  </View>
                  <View style={styles.buoyDetailRow}>
                    <Text style={styles.buoyDetailLabel}>Water Temp</Text>
                    <Text style={styles.buoyDetailValue}>
                      {buoyDetail.water_temp_c !== null ? `${Math.round(buoyDetail.water_temp_c * 9 / 5 + 32)}°F` : '—'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}
          {conditions && !loading && (
            <>
              <View style={styles.buoyBanner}>
                <Text style={styles.buoyText}>
                  📡 {conditions.selected_buoy_name}  ·  {conditions.selected_buoy_id}
                </Text>
              </View>
              <View style={styles.statsGrid}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Pressure</Text>
                  <Text style={styles.statValue}>
                    {conditions.barometric_pressure_hpa
                      ? `${Math.round(conditions.barometric_pressure_hpa)} hPa${trendArrow(conditions.pressure_trend)}`
                      : '—'}
                  </Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Wind</Text>
                  <Text style={styles.statValue}>
                    {conditions.wind_speed_mph
                      ? `${Math.round(conditions.wind_speed_mph * 1.609)} km/h ${conditions.wind_direction_label ?? ''}`
                      : '—'}
                  </Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Waves</Text>
                  <Text style={styles.statValue}>
                    {conditions.wave_height_ft != null ? `${conditions.wave_height_ft} ft` : '—'}
                  </Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Surface Temp</Text>
                  <Text style={styles.statValue}>
                    {conditions.sst_buoy_c != null
                      ? cToF(conditions.sst_buoy_c)
                      : conditions.sst_satellite_c != null
                        ? cToF(conditions.sst_satellite_c)
                        : '—'}
                  </Text>
                </View>
              </View>
              <WeatherWaterCard conditions={conditions} loading={false} nearestCity={null} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#0a1628' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a2d4a',
  },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  close: { color: '#1e90ff', fontSize: 14, fontWeight: '600' },
  mapContainer: { height: '42%' },
  hint: {
    color: '#8899aa', fontSize: 12, textAlign: 'center',
    paddingVertical: 8, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#1a2d4a',
  },
  results: { flex: 1 },
  buoyDetailPanel: {
    backgroundColor: '#0d1f35',
    borderBottomWidth: 1,
    borderBottomColor: '#1a2d4a',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buoyDetailTitle: {
    color: '#4fc3f7',
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  buoyDetailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 3,
  },
  buoyDetailLabel: {
    color: '#8899aa',
    fontSize: 12,
  },
  buoyDetailValue: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500' as const,
  },
  buoyBanner: {
    backgroundColor: '#0d1f35', borderBottomWidth: 1, borderBottomColor: '#1a2d4a',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  buoyText: { color: '#4fc3f7', fontSize: 13, fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10,
    borderBottomWidth: 1, borderBottomColor: '#1a2d4a',
  },
  stat: { width: '47%' },
  statLabel: { color: '#8899aa', fontSize: 11, marginBottom: 2 },
  statValue: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});
