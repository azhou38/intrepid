import React from 'react';
import Svg, { Path } from 'react-native-svg';
import type { Continent } from '../../types';

// Simplified continent silhouettes — 24×24 viewBox.
// Key geographic features captured: Africa horn + gulf indent, Europe peninsulas,
// Asia Arabian + Indian + SE Asia, N.America Gulf of Mexico, S.America taper, Australia gulf indent.
const PATHS: Record<string, string> = {
  Africa:
    'M 10,1.5 L 14.5,1.5 L 17,3.5 L 18,7 C 20,9 20,11.5 18,12 ' +
    'L 19,15 L 17.5,20.5 L 14,23 L 11,23 ' +
    'L 7.5,20 L 6,15 C 5,11.5 5.5,9 7.5,7 L 9.5,4 Z',

  Europe:
    'M 8,5 L 10,2.5 L 13,2.5 L 16.5,3.5 L 18.5,5.5 L 17,7 ' +
    'L 19.5,9 L 17.5,11 L 15,12 L 15,14.5 L 12.5,15.5 ' +
    'L 11,14 L 10,16.5 L 8,17 L 7.5,14 ' +
    'L 5,14 L 4,11.5 L 3.5,9 L 5.5,6.5 Z',

  Asia:
    'M 4,3 L 8,1 L 13.5,1 L 19,2 L 22.5,4.5 L 23,8 ' +
    'L 21,11.5 L 23,14.5 L 20,17.5 ' +
    'L 16.5,21 L 14,23 L 11,21.5 ' +
    'L 8.5,18.5 L 6,16 L 3,12 L 2,8 L 3,5 Z',

  'North America':
    'M 5,3 L 10,1.5 L 17,2 L 21,5 L 22,9 ' +
    'L 20,13.5 L 17.5,17.5 L 14,22 L 12.5,23 ' +
    'L 11.5,21.5 L 13.5,18 L 11,15 ' +
    'L 8,14.5 L 5,11 L 3.5,8 Z',

  Oceania:
    'M 4,8.5 L 8.5,6.5 L 14,6.5 L 18.5,7.5 L 21,10.5 ' +
    'L 20.5,14.5 L 18,17.5 L 13.5,19 L 8,18.5 L 5,16 L 3.5,13 Z',

  'South America':
    'M 9.5,2 L 14,2 L 17.5,4.5 L 18.5,8.5 ' +
    'L 18,13 L 15.5,18 L 13,22 L 12,23.5 ' +
    'L 10.5,22.5 L 9,19.5 L 7.5,15 L 7,10.5 L 8.5,6.5 Z',
};

interface Props {
  continent: Continent;
  size?: number;
  color?: string;
}

export default function ContinentIcon({ continent, size = 16, color = '#6B7280' }: Props) {
  const path = PATHS[continent];
  if (!path) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={path} fill={color} />
    </Svg>
  );
}
