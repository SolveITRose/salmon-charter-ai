import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HydroScore } from '../models/Event';
import {
  getScoreColor,
  getScoreLabel,
  getConfidenceColor,
  normalizeScore,
} from '../utils/scoring';

interface HydroScoreCardProps {
  hydroScore: HydroScore;
  compact?: boolean;
}

interface SubScoreRowProps {
  label: string;
  value: number;
  max: number;
}

const SubScoreRow = memo(function SubScoreRow({
  label,
  value,
  max,
}: SubScoreRowProps) {
  const pct = normalizeScore(value, max);
  const color = getScoreColor(pct * 100);

  return (
    <View style={styles.subScoreRow}>
      <Text style={styles.subScoreLabel}>{label}</Text>
      <View style={styles.subScoreBarTrack}>
        <View
          style={[
            styles.subScoreBarFill,
            {
              width: `${pct * 100}%` as `${number}%`,
              backgroundColor: color,
            },
          ]}
        />
      </View>
      <Text style={[styles.subScoreValue, { color }]}>
        {value}/{max}
      </Text>
    </View>
  );
});

const HydroScoreCard = memo(function HydroScoreCard({
  hydroScore,
  compact = false,
}: HydroScoreCardProps) {
  const scoreColor = getScoreColor(hydroScore.total);
  const scoreLabel = getScoreLabel(hydroScore.total);
  const confColor = getConfidenceColor(hydroScore.confidence);
  const hotspotPct = Math.round(hydroScore.hotspotProbability * 100);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        {/* Row 1: score + confidence */}
        <View style={styles.headerRow}>
          <View style={styles.scoreNumRow}>
            <Text style={[styles.scoreNumber, { color: scoreColor }]}>
              {hydroScore.total}
            </Text>
            <Text style={styles.scoreMax}>/100</Text>
          </View>
          <View style={[styles.confBadge, { backgroundColor: confColor + '22', borderColor: confColor }]}>
            <Text style={[styles.confText, { color: confColor }]}>
              {hydroScore.confidence.toUpperCase()}
            </Text>
            <Text style={[styles.confText, { color: confColor }]}>
              CONFIDENCE
            </Text>
          </View>
        </View>
        {/* Row 2: hotspot probability */}
        <Text style={styles.hotspotText}>
          {hotspotPct}% Hotspot Probability
        </Text>
      </View>

      {/* Sub-scores */}
      {!compact && (
        <View style={styles.subScores}>
          <SubScoreRow
            label="Wind"
            value={hydroScore.windTransport}
            max={25}
          />
          <SubScoreRow
            label="Mixing"
            value={hydroScore.mixingStratification}
            max={20}
          />
          <SubScoreRow
            label="Residence Time"
            value={hydroScore.residenceTime}
            max={20}
          />
          <SubScoreRow
            label="Storm Pulse"
            value={hydroScore.stormPulse}
            max={20}
          />
          <SubScoreRow
            label="Shoreline"
            value={hydroScore.shorelineWetland}
            max={15}
          />
        </View>
      )}


      {/* Reasoning */}
      {!compact && hydroScore.reasoning ? (
        <View style={styles.reasoningBox}>
          <Text style={styles.reasoningLabel}>AI Analysis</Text>
          <Text style={styles.reasoningText}>{hydroScore.reasoning}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#122040',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  header: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  scoreNumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  scoreNumber: {
    fontSize: 40,
    fontWeight: 'bold',
    lineHeight: 44,
  },
  scoreMax: {
    color: '#8899aa',
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 6,
    marginLeft: 2,
    marginRight: 10,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  scoreLabel: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  hotspotText: {
    color: '#8899aa',
    fontSize: 13,
  },
  confBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
    width: 72,
  },
  confText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    lineHeight: 13,
  },
  subScores: {
    gap: 10,
    marginBottom: 14,
  },
  subScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subScoreLabel: {
    color: '#8899aa',
    fontSize: 12,
    width: 100,
    flexShrink: 0,
  },
  subScoreBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#0a1628',
    borderRadius: 3,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  subScoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  subScoreValue: {
    fontSize: 12,
    fontWeight: '600',
    width: 64,
    textAlign: 'right',
  },
  reasoningBox: {
    backgroundColor: '#0a1628',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  reasoningLabel: {
    color: '#8899aa',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  reasoningText: {
    color: '#c0d0e0',
    fontSize: 13,
    lineHeight: 19,
  },
});

export default HydroScoreCard;
