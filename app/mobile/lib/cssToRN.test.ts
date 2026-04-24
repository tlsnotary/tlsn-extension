import { describe, it, expect } from 'vitest';
import { cssToRN } from './cssToRN';

describe('cssToRN', () => {
  it('returns empty object for undefined input', () => {
    expect(cssToRN(undefined)).toEqual({});
  });

  it('converts px values to numbers', () => {
    expect(cssToRN({ fontSize: '14px' })).toEqual({ fontSize: 14 });
    expect(cssToRN({ padding: '12px' })).toEqual({ padding: 12 });
  });

  it('handles shorthand padding with 2 values', () => {
    const result = cssToRN({ padding: '12px 16px' });
    expect(result).toEqual({ paddingVertical: 12, paddingHorizontal: 16 });
  });

  it('handles shorthand padding with 4 values', () => {
    const result = cssToRN({ padding: '10px 20px 30px 40px' });
    expect(result).toEqual({
      paddingTop: 10,
      paddingRight: 20,
      paddingBottom: 30,
      paddingLeft: 40,
    });
  });

  it('converts position fixed to absolute', () => {
    expect(cssToRN({ position: 'fixed' })).toEqual({ position: 'absolute' });
  });

  it('converts borderRadius 50% to large number', () => {
    expect(cssToRN({ borderRadius: '50%' })).toEqual({ borderRadius: 9999 });
  });

  it('extracts first color from gradient for background', () => {
    const result = cssToRN({
      background: 'linear-gradient(135deg, #1DB954 0%, #1AA34A 100%)',
    });
    expect(result).toEqual({ backgroundColor: '#1DB954' });
  });

  it('passes through plain backgroundColor', () => {
    expect(cssToRN({ backgroundColor: '#fff' })).toEqual({
      backgroundColor: '#fff',
    });
  });

  it('ignores cursor property', () => {
    expect(cssToRN({ cursor: 'pointer' })).toEqual({});
  });

  it('ignores transition property', () => {
    expect(cssToRN({ transition: 'all 0.3s ease' })).toEqual({});
  });

  it('converts opacity string to number', () => {
    expect(cssToRN({ opacity: '0.5' })).toEqual({ opacity: 0.5 });
  });

  it('converts zIndex string to number', () => {
    expect(cssToRN({ zIndex: '999999' })).toEqual({ zIndex: 999999 });
  });

  it('parses border shorthand', () => {
    const result = cssToRN({ border: '1px solid #c3e6cb' });
    expect(result).toEqual({ borderWidth: 1, borderColor: '#c3e6cb' });
  });

  it('strips font-family fallbacks', () => {
    const result = cssToRN({
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
    });
    expect(result).toEqual({ fontFamily: '-apple-system' });
  });

  it('parses boxShadow', () => {
    const result = cssToRN({ boxShadow: '0 4px 8px rgba(0,0,0,0.3)' });
    expect(result.shadowOffset).toEqual({ width: 0, height: 4 });
    expect(result.shadowRadius).toBe(8);
    expect(result.shadowOpacity).toBe(0.3);
    expect(result.elevation).toBeGreaterThan(0);
  });

  it('maps display flex to flexDirection row (web default)', () => {
    expect(cssToRN({ display: 'flex' })).toEqual({ flexDirection: 'row' });
  });

  it('does not override explicit flexDirection when display flex', () => {
    expect(cssToRN({ display: 'flex', flexDirection: 'column' })).toEqual({
      flexDirection: 'column',
    });
  });
});
