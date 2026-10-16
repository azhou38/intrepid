import React from 'react';
import Svg, { Defs, ClipPath, Path, Rect, Circle, G, Polygon } from 'react-native-svg';

// Small, simplified marks for the two map apps the spot sheet links to. They suggest each app's icon (Google's four-colour
// pin, Apple's map tile with a road and a blue route marker) rather than reproduce the official artwork.

const PIN = 'M12 1.5C7.86 1.5 4.5 4.86 4.5 9c0 5.6 7.5 13.5 7.5 13.5S19.5 14.6 19.5 9c0-4.14-3.36-7.5-7.5-7.5z';

export function GoogleMapsIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <ClipPath id="gmPin"><Path d={PIN} /></ClipPath>
      </Defs>
      <G clipPath="url(#gmPin)">
        <Rect x="0" y="0" width="12" height="9" fill="#4285F4" />
        <Rect x="12" y="0" width="12" height="9" fill="#EA4335" />
        <Rect x="12" y="9" width="12" height="16" fill="#FBBC04" />
        <Rect x="0" y="9" width="12" height="16" fill="#34A853" />
      </G>
      <Circle cx="12" cy="9" r="3" fill="white" />
    </Svg>
  );
}

export function AppleMapsIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <ClipPath id="amTile"><Rect x="1" y="1" width="22" height="22" rx="5.5" /></ClipPath>
      </Defs>
      <G clipPath="url(#amTile)">
        <Rect x="1" y="1" width="22" height="22" fill="#F2F0EA" />
        <Polygon points="1,1 11,1 1,11" fill="#8FD18A" />
        <Polygon points="23,23 23,13 13,23" fill="#7DC0F2" />
        <Polygon points="1,16 3.4,18.4 18.4,3.4 16,1" fill="#FFFFFF" />
        <Path d="M6 20 L12 12 L18 6" stroke="#2F7DF6" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <Circle cx="18.2" cy="5.8" r="2.1" fill="#2F7DF6" />
      </G>
    </Svg>
  );
}
