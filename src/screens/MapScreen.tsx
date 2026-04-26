import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';

import { CatchEvent } from '../models/Event';
import { getAllEvents } from '../storage/localDB';
import { getCurrentPosition } from '../services/gpsService';
import { fetchWeatherData, fetchWindHistory, fetchPressureHistory } from '../services/weatherService';
import { fetchPreyData } from '../services/weatherWaterService';
import { computeHydroScore } from '../agents/hydrodynamicAgent';
import { HydroScore } from '../models/Event';
import { getScoreColor, getScoreLabel } from '../utils/scoring';
import { formatGPS, formatTimestamp } from '../utils/formatters';

const GEORGIAN_BAY_CENTER = {
  latitude: 45.0,
  longitude: -80.5,
  latitudeDelta: 1.5,
  longitudeDelta: 1.2,
};

interface MarkerData {
  event: CatchEvent;
  visible: boolean;
}

// Maps chlorophyll µg/L to a green-scale color for the prey circle
function getPreyCircleColor(chl: number, opacity: number): string {
  const hex = Math.round(opacity * 255).toString(16).padStart(2, '0');
  if (chl >= 2 && chl <= 8) return `#00e676${hex}`; // bright green — productive zone
  if (chl >= 0.5 && chl < 2)  return `#69f0ae${hex}`; // light green — low productivity
  if (chl > 8)                 return `#ffab00${hex}`; // amber — high bloom, baitfish may disperse
  return `#546e7a${hex}`;                              // grey — very low
}

export default function MapScreen() {
  const [events, setEvents] = useState<CatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [currentScore, setCurrentScore] = useState<HydroScore | null>(null);
  const [scoringLocation, setScoringLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [computingScore, setComputingScore] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CatchEvent | null>(null);
  const [preyData, setPreyData] = useState<{ chlorophyll: number | null; turbidity: number | null } | null>(null);

  const mapRef = useRef<MapView>(null);
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadEvents();
    return () => {
      if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    };
  }, []);

  const loadEvents = async () => {
    try {
      const all = await getAllEvents();
      const withGps = all.filter(
        (e) => e.gps.lat !== 0 && e.gps.lng !== 0
      );
      setEvents(withGps);
      setMarkers(withGps.map((e) => ({ event: e, visible: true })));
    } catch (error) {
      console.error('[Map] loadEvents error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Trip replay: reveal markers one by one in chronological order
  const startReplay = useCallback(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    setMarkers(sorted.map((e) => ({ event: e, visible: false })));
    setReplayMode(true);
    setReplayIndex(0);

    let idx = 0;
    const revealNext = () => {
      if (idx >= sorted.length) {
        setReplayMode(false);
        return;
      }
      setMarkers((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], visible: true };
        return next;
      });

      // Animate map to this marker
      if (mapRef.current && sorted[idx]) {
        mapRef.current.animateToRegion(
          {
            latitude: sorted[idx].gps.lat,
            longitude: sorted[idx].gps.lng,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          },
          800
        );
      }

      idx++;
      replayTimerRef.current = setTimeout(revealNext, 1500);
    };

    revealNext();
  }, [events]);

  const stopReplay = useCallback(() => {
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    setReplayMode(false);
    setMarkers(events.map((e) => ({ event: e, visible: true })));
    mapRef.current?.animateToRegion(GEORGIAN_BAY_CENTER, 800);
  }, [events]);

  const handleComputeCurrentScore = useCallback(async () => {
    setComputingScore(true);
    try {
      const gps = await getCurrentPosition();
      const lat = gps?.lat || GEORGIAN_BAY_CENTER.latitude;
      const lng = gps?.lng || GEORGIAN_BAY_CENTER.longitude;

      setScoringLocation({ lat, lng });

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

      // Animate to current location
      mapRef.current?.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.3,
          longitudeDelta: 0.3,
        },
        800
      );
    } catch (error) {
      console.error('[Map] computeScore error:', error);
      Alert.alert('Error', 'Failed to compute HydroScore for current location.');
    } finally {
      setComputingScore(false);
    }
  }, []);

  const getCircleColor = (score: number) => {
    const color = getScoreColor(score);
    return color + '55'; // 33% opacity
  };

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
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={GEORGIAN_BAY_CENTER}
        mapType="satellite"
        showsUserLocation
        showsCompass
        showsScale
      >
        {/* Catch event markers */}
        {markers
          .filter((m) => m.visible)
          .map((m) => (
            <React.Fragment key={m.event.id}>
              <Marker
                coordinate={{
                  latitude: m.event.gps.lat,
                  longitude: m.event.gps.lng,
                }}
                onPress={() => setSelectedEvent(m.event)}
                pinColor={getScoreColor(m.event.hydroScore.total)}
                title={m.event.species}
                description={`Score: ${m.event.hydroScore.total} · ${formatTimestamp(m.event.timestamp)}`}
              />
              {/* HydroScore radius circle */}
              <Circle
                center={{
                  latitude: m.event.gps.lat,
                  longitude: m.event.gps.lng,
                }}
                radius={800}
                fillColor={getCircleColor(m.event.hydroScore.total)}
                strokeColor={getScoreColor(m.event.hydroScore.total)}
                strokeWidth={1}
              />
            </React.Fragment>
          ))}

        {/* Current location score circle */}
        {currentScore && scoringLocation && (
          <Circle
            center={{
              latitude: scoringLocation.lat,
              longitude: scoringLocation.lng,
            }}
            radius={2000}
            fillColor={getCircleColor(currentScore.total)}
            strokeColor={getScoreColor(currentScore.total)}
            strokeWidth={2}
          />
        )}

        {/* Prey availability circle (green = high chlorophyll / baitfish zone) */}
        {preyData && preyData.chlorophyll != null && scoringLocation && (
          <Circle
            center={{
              latitude: scoringLocation.lat,
              longitude: scoringLocation.lng,
            }}
            radius={3200}
            fillColor={getPreyCircleColor(preyData.chlorophyll, 0.18)}
            strokeColor={getPreyCircleColor(preyData.chlorophyll, 0.8)}
            strokeWidth={1}
          />
        )}
      </MapView>

      {/* Top controls */}
      <View style={styles.topBar}>
        <Text style={styles.mapTitle}>Georgian Bay Hotspots</Text>
        <Text style={styles.markerCount}>
          {events.length} catch{events.length !== 1 ? 'es' : ''} mapped
        </Text>
      </View>

      {/* Current score banner */}
      {currentScore && (
        <View
          style={[
            styles.scoreBanner,
            { borderLeftColor: getScoreColor(currentScore.total) },
          ]}
        >
          <Text style={styles.scoreBannerTitle}>Current Location</Text>
          <Text
            style={[
              styles.scoreBannerValue,
              { color: getScoreColor(currentScore.total) },
            ]}
          >
            {currentScore.total}/100 — {getScoreLabel(currentScore.total)}
          </Text>
          <Text style={styles.scoreBannerReasoning} numberOfLines={2}>
            {currentScore.reasoning}
          </Text>
          {preyData && (
            <Text style={styles.preyReadout}>
              {preyData.chlorophyll != null
                ? `Chlorophyll: ${preyData.chlorophyll.toFixed(1)} µg/L`
                : 'Chlorophyll: no satellite data'}
              {preyData.turbidity != null
                ? `  ·  Turbidity: ${preyData.turbidity.toFixed(3)} mg/L`
                : ''}
            </Text>
          )}
          <TouchableOpacity onPress={() => { setCurrentScore(null); setPreyData(null); }}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Selected event popup */}
      {selectedEvent && (
        <View style={styles.eventPopup}>
          <View style={styles.eventPopupRow}>
            <Text style={styles.eventPopupSpecies}>
              {selectedEvent.species}
            </Text>
            <TouchableOpacity onPress={() => setSelectedEvent(null)}>
              <Text style={styles.eventPopupClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.eventPopupTime}>
            {formatTimestamp(selectedEvent.timestamp)}
          </Text>
          <Text style={styles.eventPopupGps}>
            {formatGPS(selectedEvent.gps.lat, selectedEvent.gps.lng)}
          </Text>
          <View style={styles.eventPopupScoreRow}>
            <Text style={styles.eventPopupScoreLabel}>HydroScore:</Text>
            <Text
              style={[
                styles.eventPopupScoreValue,
                { color: getScoreColor(selectedEvent.hydroScore.total) },
              ]}
            >
              {selectedEvent.hydroScore.total}/100
            </Text>
          </View>
          {selectedEvent.setup.lureType && (
            <Text style={styles.eventPopupSetup}>
              {selectedEvent.setup.lureType}{' '}
              {selectedEvent.setup.lureColor
                ? `(${selectedEvent.setup.lureColor})`
                : ''}{' '}
              @ {Math.round(selectedEvent.setup.downriggerDepth)}ft
            </Text>
          )}
        </View>
      )}

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            computingScore && styles.controlButtonDisabled,
          ]}
          onPress={handleComputeCurrentScore}
          disabled={computingScore}
        >
          {computingScore ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.controlButtonText}>Score My Location</Text>
          )}
        </TouchableOpacity>

        {events.length > 1 && (
          <TouchableOpacity
            style={[
              styles.controlButton,
              styles.replayButton,
              replayMode && styles.replayButtonActive,
            ]}
            onPress={replayMode ? stopReplay : startReplay}
          >
            <Text style={styles.controlButtonText}>
              {replayMode ? 'Stop Replay' : 'Trip Replay'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Score</Text>
        {[
          { label: '80+', color: '#00c853' },
          { label: '60+', color: '#69f0ae' },
          { label: '40+', color: '#ffab00' },
          { label: '20+', color: '#ff6d00' },
          { label: '<20', color: '#ff5252' },
        ].map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: item.color }]}
            />
            <Text style={styles.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8899aa',
    marginTop: 12,
    fontSize: 15,
  },
  map: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(10,22,40,0.9)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  mapTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  markerCount: {
    color: '#8899aa',
    fontSize: 12,
    marginTop: 2,
  },
  scoreBanner: {
    position: 'absolute',
    top: 90,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(10,22,40,0.95)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderLeftWidth: 4,
  },
  scoreBannerTitle: {
    color: '#8899aa',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  scoreBannerValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  scoreBannerReasoning: {
    color: '#c0d0e0',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
  preyReadout: {
    color: '#69f0ae',
    fontSize: 11,
    marginBottom: 6,
  },
  dismissText: {
    color: '#1e90ff',
    fontSize: 12,
  },
  eventPopup: {
    position: 'absolute',
    bottom: 110,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(18,32,64,0.97)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  eventPopupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventPopupSpecies: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  eventPopupClose: {
    color: '#8899aa',
    fontSize: 18,
    padding: 4,
  },
  eventPopupTime: {
    color: '#8899aa',
    fontSize: 12,
    marginBottom: 2,
  },
  eventPopupGps: {
    color: '#8899aa',
    fontSize: 12,
    marginBottom: 6,
  },
  eventPopupScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventPopupScoreLabel: {
    color: '#8899aa',
    fontSize: 13,
    marginRight: 6,
  },
  eventPopupScoreValue: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  eventPopupSetup: {
    color: '#c0d0e0',
    fontSize: 13,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 10,
  },
  controlButton: {
    flex: 1,
    backgroundColor: '#1e90ff',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    shadowColor: '#1e90ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  controlButtonDisabled: {
    opacity: 0.6,
  },
  controlButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  replayButton: {
    backgroundColor: '#7c4dff',
  },
  replayButtonActive: {
    backgroundColor: '#ff5252',
  },
  legend: {
    position: 'absolute',
    right: 12,
    top: '45%',
    backgroundColor: 'rgba(10,22,40,0.9)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  legendTitle: {
    color: '#8899aa',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  legendLabel: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
});
