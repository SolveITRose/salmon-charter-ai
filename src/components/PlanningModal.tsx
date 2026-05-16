import React, { useState, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
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

const GEORGIAN_BAY_REGION = {
  latitude: 45.0,
  longitude: -80.5,
  latitudeDelta: 1.8,
  longitudeDelta: 1.4,
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PlanningModal({ visible, onClose }: Props) {
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [conditions, setConditions] = useState<TripConditions | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    setPin(null);
    setConditions(null);
    onClose();
  }, [onClose]);

  const handleTap = useCallback(async (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPin({ latitude, longitude });
    setConditions(null);
    setLoading(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      const data = await fetchTripConditions(latitude, longitude, date);
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

        <MapView
          style={styles.map}
          initialRegion={GEORGIAN_BAY_REGION}
          onPress={handleTap}
        >
          {pin && <Marker coordinate={pin} />}
        </MapView>

        <Text style={styles.hint}>
          {pin
            ? `${pin.latitude.toFixed(3)}°N  ${Math.abs(pin.longitude).toFixed(3)}°W  —  tap anywhere to move`
            : 'Tap anywhere on the map to load conditions for that spot'}
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
  map: { height: '42%' },
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
