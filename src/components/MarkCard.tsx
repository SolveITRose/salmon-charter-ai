import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GpsMark, MarkType } from '../models/Event';
import { formatRelativeTime, celsiusToFahrenheit } from '../utils/formatters';
import { getScoreColor } from '../utils/scoring';

interface MarkCardProps {
  mark: GpsMark;
  onPress?: (mark: GpsMark) => void;
}

const MARK_META: Record<MarkType, { icon: string; label: string; color: string }> = {
  bait:      { icon: '🦐', label: 'Bait',         color: '#ffab00' },
  fish:      { icon: '🐟', label: 'Fish',         color: '#00bcd4' },
  fish_bait: { icon: '🎯', label: 'Fish + Bait',  color: '#ff7043' },
  structure: { icon: '⛰️', label: 'Structure',    color: '#8d6e63' },
  other:     { icon: '📍', label: 'Other',        color: '#9c27b0' },
};

const MarkCard = memo(function MarkCard({ mark, onPress }: MarkCardProps) {
  const meta = MARK_META[mark.markType];
  const scoreColor = getScoreColor(mark.hydroScore.total);

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: meta.color }]}
      onPress={() => onPress?.(mark)}
      activeOpacity={0.75}
    >
      <View style={styles.iconCol}>
        <Text style={styles.icon}>{meta.icon}</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
        <Text style={styles.time}>{formatRelativeTime(mark.timestamp)}</Text>
        {mark.notes ? <Text style={styles.notes} numberOfLines={1}>{mark.notes}</Text> : null}
        <Text style={styles.conditions}>
          {mark.weather.conditions} · {Math.round(celsiusToFahrenheit(mark.weather.airTemp))}°F
        </Text>
        {mark.fishFinder && (
          <Text style={styles.fishFinder}>
            🖥{mark.fishFinder.depth != null ? ` ${mark.fishFinder.depth}ft` : ''}
            {mark.fishFinder.waterTemp != null ? ` · ${Math.round(celsiusToFahrenheit(mark.fishFinder.waterTemp))}°F` : ''}
            {mark.fishFinder.speedOverGround != null ? ` · ${mark.fishFinder.speedOverGround}mph` : ''}
            {mark.fishFinder.baitOnScreen === true ? ' · bait ✓' : ''}
          </Text>
        )}
      </View>

      <View style={styles.scoreContainer}>
        <Text style={[styles.scoreValue, { color: scoreColor }]}>
          {mark.hydroScore.total}
        </Text>
        <Text style={styles.scoreLabel}>Hydro</Text>
        <View style={styles.scoreMiniBar}>
          <View
            style={[
              styles.scoreMiniBarFill,
              { width: `${mark.hydroScore.total}%` as `${number}%`, backgroundColor: scoreColor },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#0e1a2e',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a2d4a',
    borderLeftWidth: 4,
  },
  iconCol: {
    width: 44,
    alignItems: 'center',
    marginRight: 10,
  },
  icon: {
    fontSize: 28,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  time: {
    color: '#8899aa',
    fontSize: 12,
    marginBottom: 2,
  },
  notes: {
    color: '#c0d0e0',
    fontSize: 12,
    marginBottom: 2,
  },
  conditions: {
    color: '#8899aa',
    fontSize: 11,
  },
  fishFinder: {
    color: '#1e90ff',
    fontSize: 11,
    marginTop: 2,
  },
  scoreContainer: {
    alignItems: 'center',
    marginLeft: 10,
    width: 48,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  scoreLabel: {
    color: '#8899aa',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  scoreMiniBar: {
    width: 40,
    height: 4,
    backgroundColor: '#1a2d4a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreMiniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
});

export default MarkCard;
