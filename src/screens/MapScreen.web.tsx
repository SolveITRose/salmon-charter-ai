import 'leaflet/dist/leaflet.css';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MapContainer, TileLayer, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

import { CatchEvent } from '../models/Event';
import { HydroScore } from '../models/Event';
import { getAllEvents } from '../storage/localDB';
import { getCurrentPosition } from '../services/gpsService';
import { fetchWeatherData, fetchWindHistory, fetchPressureHistory } from '../services/weatherService';
import { fetchPreyData } from '../services/weatherWaterService';
import { computeHydroScore } from '../agents/hydrodynamicAgent';
import { getScoreColor, getScoreLabel } from '../utils/scoring';
import { formatGPS, formatTimestamp } from '../utils/formatters';

const GEORGIAN_BAY_CENTER: [number, number] = [45.0, -80.5];
const GEORGIAN_BAY_ZOOM = 9;

// Colored dot marker using Leaflet divIcon — no image file dependency
function createDotIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function getPreyColor(chl: number): string {
  if (chl >= 2 && chl <= 8) return '#00e676';
  if (chl >= 0.5) return '#69f0ae';
  if (chl > 8) return '#ffab00';
  return '#546e7a';
}

// Moves the map view to a new center
function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}

export default function MapScreen() {
  const [events, setEvents] = useState<CatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentScore, setCurrentScore] = useState<HydroScore | null>(null);
  const [scoringLocation, setScoringLocation] = useState<[number, number] | null>(null);
  const [preyData, setPreyData] = useState<{ chlorophyll: number | null; turbidity: number | null } | null>(null);
  const [computingScore, setComputingScore] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const all = await getAllEvents();
      setEvents(all.filter((e) => e.gps.lat !== 0 && e.gps.lng !== 0));
    } catch (err) {
      console.error('[WebMap] loadEvents error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleComputeCurrentScore = useCallback(async () => {
    setComputingScore(true);
    try {
      const gps = await getCurrentPosition();
      const lat = gps?.lat ?? GEORGIAN_BAY_CENTER[0];
      const lng = gps?.lng ?? GEORGIAN_BAY_CENTER[1];

      setScoringLocation([lat, lng]);

      const [weather, windHistory, pressureHistory, prey] = await Promise.all([
        fetchWeatherData(lat, lng),
        fetchWindHistory(lat, lng),
        fetchPressureHistory(lat, lng),
        fetchPreyData(lat, lng),
      ]);

      if (!weather) {
        Alert.alert('Weather Unavailable', 'Could not fetch conditions for scoring.');
        return;
      }

      setPreyData(prey);

      const score = computeHydroScore({
        windSpeed: weather.windSpeed,
        windDirection: weather.windDirection,
        waveHeight: weather.waveHeight,
        airTemp: weather.airTemp,
        waterTemp: weather.waterTemp,
        pressure: weather.pressure,
        lat,
        lng,
        chlorophyll: prey.chlorophyll,
        turbidity: prey.turbidity,
        windHistory,
        pressureHistory,
      });

      setCurrentScore(score);
      setFlyTarget({ center: [lat, lng], zoom: 11 });
    } catch (err) {
      console.error('[WebMap] computeScore error:', err);
      Alert.alert('Error', 'Failed to compute HydroScore.');
    } finally {
      setComputingScore(false);
    }
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#1e90ff" size="large" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapContainer
        center={GEORGIAN_BAY_CENTER}
        zoom={GEORGIAN_BAY_ZOOM}
        style={{ flex: 1, width: '100%', height: '100%' }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
        />

        {flyTarget && <FlyTo center={flyTarget.center} zoom={flyTarget.zoom} />}

        {/* Catch event markers */}
        {events.map((e) => {
          const color = getScoreColor(e.hydroScore.total);
          return (
            <React.Fragment key={e.id}>
              <Circle
                center={[e.gps.lat, e.gps.lng]}
                radius={600}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.25, weight: 1.5 }}
              >
                <Popup>
                  <div style={{ minWidth: 180, fontFamily: 'sans-serif' }}>
                    <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 4 }}>{e.species}</div>
                    <div style={{ color: '#666', fontSize: 12, marginBottom: 2 }}>{formatTimestamp(e.timestamp)}</div>
                    <div style={{ color: '#666', fontSize: 12, marginBottom: 6 }}>{formatGPS(e.gps.lat, e.gps.lng)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#888', fontSize: 12 }}>HydroScore:</span>
                      <span style={{ color, fontWeight: 'bold', fontSize: 14 }}>{e.hydroScore.total}/100</span>
                    </div>
                    {e.setup.lureType ? (
                      <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>
                        {e.setup.lureType} {e.setup.lureColor ? `(${e.setup.lureColor})` : ''} @ {Math.round(e.setup.downriggerDepth)}ft
                      </div>
                    ) : null}
                  </div>
                </Popup>
              </Circle>
            </React.Fragment>
          );
        })}

        {/* Current location HydroScore circle */}
        {currentScore && scoringLocation && (() => {
          const color = getScoreColor(currentScore.total);
          return (
            <Circle
              center={scoringLocation}
              radius={2000}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2 }}
            />
          );
        })()}

        {/* Prey availability circle */}
        {preyData && preyData.chlorophyll != null && scoringLocation && (
          <Circle
            center={scoringLocation}
            radius={3200}
            pathOptions={{
              color: getPreyColor(preyData.chlorophyll),
              fillColor: getPreyColor(preyData.chlorophyll),
              fillOpacity: 0.1,
              weight: 1,
              dashArray: '6 4',
            }}
          />
        )}
      </MapContainer>

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.mapTitle}>Georgian Bay Hotspots</Text>
        <Text style={styles.markerCount}>{events.length} catch{events.length !== 1 ? 'es' : ''} mapped</Text>
      </View>

      {/* Score banner */}
      {currentScore && (
        <View style={[styles.scoreBanner, { borderLeftColor: getScoreColor(currentScore.total) }]}>
          <Text style={styles.scoreBannerTitle}>Current Location</Text>
          <Text style={[styles.scoreBannerValue, { color: getScoreColor(currentScore.total) }]}>
            {currentScore.total}/100 — {getScoreLabel(currentScore.total)}
          </Text>
          <Text style={styles.scoreBannerReasoning} numberOfLines={2}>{currentScore.reasoning}</Text>
          {preyData && (
            <Text style={styles.preyReadout}>
              {preyData.chlorophyll != null ? `Chlorophyll: ${preyData.chlorophyll.toFixed(1)} µg/L` : 'Chlorophyll: no satellite data'}
              {preyData.turbidity != null ? `  ·  Turbidity: ${preyData.turbidity.toFixed(3)} mg/L` : ''}
            </Text>
          )}
          <TouchableOpacity onPress={() => { setCurrentScore(null); setPreyData(null); setScoringLocation(null); }}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.controlButton, computingScore && styles.controlButtonDisabled]}
          onPress={handleComputeCurrentScore}
          disabled={computingScore}
        >
          {computingScore
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.controlButtonText}>Score My Location</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Score legend */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Score</Text>
        {[{ label: '80+', color: '#00c853' }, { label: '60+', color: '#69f0ae' }, { label: '40+', color: '#ffab00' }, { label: '20+', color: '#ff6d00' }, { label: '<20', color: '#ff5252' }].map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#8899aa', marginTop: 12, fontSize: 15 },
  topBar: {
    position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1000,
    backgroundColor: 'rgba(10,22,40,0.92)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#1a2d4a',
  },
  mapTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  markerCount: { color: '#8899aa', fontSize: 12, marginTop: 2 },
  scoreBanner: {
    position: 'absolute', top: 90, left: 12, right: 12, zIndex: 1000,
    backgroundColor: 'rgba(10,22,40,0.95)', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#1a2d4a', borderLeftWidth: 4,
  },
  scoreBannerTitle: { color: '#8899aa', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  scoreBannerValue: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  scoreBannerReasoning: { color: '#c0d0e0', fontSize: 12, lineHeight: 16, marginBottom: 6 },
  preyReadout: { color: '#69f0ae', fontSize: 11, marginBottom: 6 },
  dismissText: { color: '#1e90ff', fontSize: 12 },
  bottomBar: {
    position: 'absolute', bottom: 16, left: 12, right: 12, zIndex: 1000, flexDirection: 'row',
  },
  controlButton: {
    flex: 1, backgroundColor: '#1e90ff', borderRadius: 10, padding: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  controlButtonDisabled: { opacity: 0.6 },
  controlButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  legend: {
    position: 'absolute', right: 12, top: '45%', zIndex: 1000,
    backgroundColor: 'rgba(10,22,40,0.9)', borderRadius: 8, padding: 8,
    borderWidth: 1, borderColor: '#1a2d4a',
  },
  legendTitle: { color: '#8899aa', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, textAlign: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  legendLabel: { color: '#fff', fontSize: 10, fontWeight: '600' },
});
