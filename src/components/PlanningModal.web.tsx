import 'leaflet/dist/leaflet.css';
import React, { useState, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { TripConditions, fetchTripConditions } from '../services/weatherWaterService';
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

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PlanningModal({ visible, onClose }: Props) {
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [conditions, setConditions] = useState<TripConditions | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    setPin(null);
    setConditions(null);
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
