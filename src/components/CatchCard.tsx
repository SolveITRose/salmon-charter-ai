import React, { memo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { CatchEvent } from '../models/Event';
import { formatRelativeTime } from '../utils/formatters';
import { getScoreColor, getSpeciesConfidenceColor } from '../utils/scoring';

interface CatchCardProps {
  event: CatchEvent;
  onPress?: (event: CatchEvent) => void;
}

const CatchCard = memo(function CatchCard({ event, onPress }: CatchCardProps) {
  const scoreColor = getScoreColor(event.hydroScore.total);
  const confColor = getSpeciesConfidenceColor(event.confidence);
  const relativeTime = formatRelativeTime(event.timestamp);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(event)}
      activeOpacity={0.75}
    >
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {event.photo ? (
          <Image
            source={{ uri: event.photo }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Text style={styles.placeholderText}>No Photo</Text>
          </View>
        )}
        {/* Synced indicator */}
        <View
          style={[
            styles.syncDot,
            { backgroundColor: event.synced ? '#00c853' : '#ffab00' },
          ]}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.species} numberOfLines={1}>
            {event.species || 'Unknown Species'}
          </Text>
          <View style={[styles.confBadge, { borderColor: confColor }]}>
            <Text style={[styles.confText, { color: confColor }]}>
              {Math.round(event.confidence * 100)}%
            </Text>
          </View>
        </View>

        <Text style={styles.time}>{relativeTime}</Text>

        {event.sizeEstimate && event.sizeEstimate !== 'Unknown' && (
          <Text style={styles.size} numberOfLines={1}>
            {event.sizeEstimate}
          </Text>
        )}
      </View>

      {/* HydroScore mini gauge */}
      <View style={styles.scoreContainer}>
        <Text style={[styles.scoreValue, { color: scoreColor }]}>
          {Math.round(event.hydroScore.total)}
        </Text>
        <Text style={styles.scoreLabel}>Hydro</Text>
        <View style={styles.scoreMiniBar}>
          <View
            style={[
              styles.scoreMiniBarFill,
              {
                width: `${event.hydroScore.total}%` as `${number}%`,
                backgroundColor: scoreColor,
              },
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
    backgroundColor: '#122040',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1a2d4a',
  },
  thumbnailContainer: {
    position: 'relative',
    marginRight: 12,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#0a1628',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#8899aa',
    fontSize: 9,
    textAlign: 'center',
  },
  syncDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#0a1628',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  species: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 6,
  },
  confBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  confText: {
    fontSize: 11,
    fontWeight: '600',
  },
  time: {
    color: '#8899aa',
    fontSize: 12,
    marginBottom: 2,
  },
  size: {
    color: '#8899aa',
    fontSize: 12,
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

export default CatchCard;
