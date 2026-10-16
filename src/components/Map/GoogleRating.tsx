import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Path, Rect, G, ClipPath, Circle } from 'react-native-svg';

// A Google rating: the number, five stars with the filled part matching the rating, and the Google mark. A simplified
// Google "G" drawn here (not the official artwork). Rendered in place of the location column when a rating exists.

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G>
        <Path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4" />
        <Path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853" />
        <Path d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" fill="#FBBC05" />
        <Path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.7 9.4 6 12 6z" fill="#EA4335" />
      </G>
    </Svg>
  );
}

// Five stars, the filled part set to the rating (so 4.3 fills four stars and 30% of the fifth).
export function RatingStars({ rating, size = 12 }: { rating: number; size?: number }) {
  const gid = `rs${Math.round(rating * 100)}`;
  const pct = Math.max(0, Math.min(1, rating / 5)) * 100;
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[0, 1, 2, 3, 4].map(i => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <Svg key={i} width={size} height={size} viewBox="0 0 24 24">
            <Defs>
              <SvgLinearGradient id={`${gid}-${i}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset={`${fill * 100}%`} stopColor="#F59E0B" />
                <Stop offset={`${fill * 100}%`} stopColor="#D1D5DB" />
              </SvgLinearGradient>
            </Defs>
            <Path d={STAR} fill={`url(#${gid}-${i})`} />
          </Svg>
        );
      })}
    </View>
  );
}

export default function GoogleRating({ rating, count }: { rating: number; count?: number }) {
  return (
    <View style={st.wrap}>
      <View style={st.top}>
        <GoogleMark size={16} />
        <Text style={st.num}>{rating.toFixed(1)}</Text>
      </View>
      <RatingStars rating={rating} size={12} />
      {count ? <Text style={st.count}>{count.toLocaleString()} reviews</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 3 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  num: { fontSize: 16, fontWeight: '700', color: '#111827' },
  count: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
});
