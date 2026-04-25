import React, { memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WeatherData } from '../models/Event';
import { formatWindDirection, celsiusToFahrenheit } from '../utils/formatters';

interface WeatherWidgetProps {
  weather: WeatherData | null;
  loading?: boolean;
}

const WeatherWidget = memo(function WeatherWidget({
  weather,
  loading,
}: WeatherWidgetProps) {
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator color="#1e90ff" size="small" />
        <Text style={styles.loadingText}>Fetching weather...</Text>
      </View>
    );
  }

  if (!weather) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <Text style={styles.emptyText}>Weather unavailable</Text>
      </View>
    );
  }

  const windDir = formatWindDirection(weather.windDirection);
  const windArrow = getWindArrow(weather.windDirection);

  return (
    <View style={styles.container}>
      {/* Wind */}
      <View style={styles.item}>
        <Text style={styles.itemLabel}>Wind</Text>
        <Text style={styles.itemValue}>
          {windArrow} {weather.windSpeed.toFixed(0)} km/h {windDir}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* Waves */}
      <View style={styles.item}>
        <Text style={styles.itemLabel}>Waves</Text>
        <Text style={styles.itemValue}>{Math.round(weather.waveHeight * 3.281)} ft</Text>
      </View>

      <View style={styles.divider} />

      {/* Air Temp */}
      <View style={styles.item}>
        <Text style={styles.itemLabel}>Air</Text>
        <Text style={styles.itemValue}>{Math.round(celsiusToFahrenheit(weather.airTemp))}°F</Text>
      </View>

      <View style={styles.divider} />

      {/* Water Temp */}
      <View style={styles.item}>
        <Text style={styles.itemLabel}>Water</Text>
        <Text style={styles.itemValue}>{Math.round(celsiusToFahrenheit(weather.waterTemp))}°F</Text>
      </View>

      <View style={styles.divider} />

      {/* Pressure */}
      <View style={styles.item}>
        <Text style={styles.itemLabel}>Pressure</Text>
        <Text style={styles.itemValue}>{weather.pressure.toFixed(0)} hPa</Text>
      </View>

      <View style={styles.divider} />

      {/* Cloud Cover */}
      <View style={styles.item}>
        <Text style={styles.itemLabel}>Cloud</Text>
        <Text style={styles.itemValue}>{weather.cloudCover ?? 0}%</Text>
      </View>
    </View>
  );
});

/**
 * Get directional arrow character based on wind direction (direction wind blows TO).
 */
function getWindArrow(fromDeg: number): string {
  // Wind direction in meteorology = where wind comes FROM
  // Arrow should point where wind is going
  const toDeg = (fromDeg + 180) % 360;
  const idx = Math.round(toDeg / 45) % 8;
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  return arrows[idx];
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#122040',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1a2d4a',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  loadingContainer: {
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
  },
  loadingText: {
    color: '#8899aa',
    fontSize: 13,
  },
  emptyContainer: {
    justifyContent: 'center',
    minHeight: 44,
  },
  emptyText: {
    color: '#8899aa',
    fontSize: 13,
    textAlign: 'center',
    flex: 1,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    minWidth: 60,
    paddingVertical: 2,
  },
  itemLabel: {
    color: '#8899aa',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  itemValue: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: '#1a2d4a',
  },
});

export default WeatherWidget;
