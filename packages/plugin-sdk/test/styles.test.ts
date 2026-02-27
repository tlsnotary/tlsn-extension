/**
 * Tests for Tailwind-like style utilities
 */

import { describe, it, expect } from 'vitest';
import {
  color,
  bgColor,
  borderColor,
  bg,
  padding,
  paddingX,
  paddingY,
  paddingTop,
  paddingBottom,
  paddingLeft,
  paddingRight,
  p,
  px,
  py,
  pt,
  pb,
  pl,
  pr,
  margin,
  marginX,
  marginY,
  marginTop,
  marginBottom,
  marginLeft,
  marginRight,
  m,
  mx,
  my,
  mt,
  mb,
  ml,
  mr,
  fontSize,
  fontWeight,
  textAlign,
  fontFamily,
  display,
  position,
  width,
  height,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  flex,
  flexDirection,
  alignItems,
  justifyContent,
  flexWrap,
  top,
  bottom,
  left,
  right,
  border,
  borderRadius,
  borderWidth,
  boxShadow,
  opacity,
  overflow,
  zIndex,
  cursor,
  pointerEvents,
  transition,
  background,
  inlineStyle,
  defaultFontFamily,
} from '../src/styles';

describe('styles', () => {
  describe('color helpers', () => {
    it('resolves a color token', () => {
      expect(color('gray-500')).toEqual({ color: '#6b7280' });
    });

    it('passes through an unknown color value', () => {
      expect(color('#ff0000')).toEqual({ color: '#ff0000' });
    });

    it('bgColor resolves a color token', () => {
      expect(bgColor('blue-500')).toEqual({ backgroundColor: '#3b82f6' });
    });

    it('bgColor passes through unknown value', () => {
      expect(bgColor('rgba(0,0,0,0.5)')).toEqual({ backgroundColor: 'rgba(0,0,0,0.5)' });
    });

    it('borderColor resolves a color token', () => {
      expect(borderColor('red-300')).toEqual({ borderColor: '#fca5a5' });
    });

    it('borderColor passes through unknown value', () => {
      expect(borderColor('currentColor')).toEqual({ borderColor: 'currentColor' });
    });

    it('bg is an alias for bgColor', () => {
      expect(bg).toBe(bgColor);
    });
  });

  describe('padding helpers', () => {
    it('padding resolves a spacing token', () => {
      expect(padding('4')).toEqual({ padding: '16px' });
    });

    it('padding passes through unknown value', () => {
      expect(padding('2rem')).toEqual({ padding: '2rem' });
    });

    it('paddingX sets both paddingLeft and paddingRight', () => {
      expect(paddingX('sm')).toEqual({ paddingLeft: '12px', paddingRight: '12px' });
    });

    it('paddingY sets both paddingTop and paddingBottom', () => {
      expect(paddingY('2')).toEqual({ paddingTop: '8px', paddingBottom: '8px' });
    });

    it('paddingTop', () => {
      expect(paddingTop('3')).toEqual({ paddingTop: '12px' });
    });

    it('paddingBottom', () => {
      expect(paddingBottom('md')).toEqual({ paddingBottom: '16px' });
    });

    it('paddingLeft', () => {
      expect(paddingLeft('1')).toEqual({ paddingLeft: '4px' });
    });

    it('paddingRight', () => {
      expect(paddingRight('xl')).toEqual({ paddingRight: '24px' });
    });

    it('aliases point to the correct functions', () => {
      expect(p).toBe(padding);
      expect(px).toBe(paddingX);
      expect(py).toBe(paddingY);
      expect(pt).toBe(paddingTop);
      expect(pb).toBe(paddingBottom);
      expect(pl).toBe(paddingLeft);
      expect(pr).toBe(paddingRight);
    });
  });

  describe('margin helpers', () => {
    it('margin resolves a spacing token', () => {
      expect(margin('4')).toEqual({ margin: '16px' });
    });

    it('margin passes through unknown value', () => {
      expect(margin('auto')).toEqual({ margin: 'auto' });
    });

    it('marginX sets both marginLeft and marginRight', () => {
      expect(marginX('8')).toEqual({ marginLeft: '32px', marginRight: '32px' });
    });

    it('marginY sets both marginTop and marginBottom', () => {
      expect(marginY('xs')).toEqual({ marginTop: '8px', marginBottom: '8px' });
    });

    it('marginTop', () => {
      expect(marginTop('6')).toEqual({ marginTop: '24px' });
    });

    it('marginBottom', () => {
      expect(marginBottom('0')).toEqual({ marginBottom: '0' });
    });

    it('marginLeft', () => {
      expect(marginLeft('lg')).toEqual({ marginLeft: '20px' });
    });

    it('marginRight', () => {
      expect(marginRight('5')).toEqual({ marginRight: '20px' });
    });

    it('aliases point to the correct functions', () => {
      expect(m).toBe(margin);
      expect(mx).toBe(marginX);
      expect(my).toBe(marginY);
      expect(mt).toBe(marginTop);
      expect(mb).toBe(marginBottom);
      expect(ml).toBe(marginLeft);
      expect(mr).toBe(marginRight);
    });
  });

  describe('typography helpers', () => {
    it('fontSize resolves a token', () => {
      expect(fontSize('sm')).toEqual({ fontSize: '14px' });
    });

    it('fontSize passes through unknown value', () => {
      expect(fontSize('1.25rem')).toEqual({ fontSize: '1.25rem' });
    });

    it('fontWeight resolves a token', () => {
      expect(fontWeight('bold')).toEqual({ fontWeight: '700' });
    });

    it('fontWeight passes through unknown value', () => {
      expect(fontWeight('900')).toEqual({ fontWeight: '900' });
    });

    it('textAlign passes through value', () => {
      expect(textAlign('center')).toEqual({ textAlign: 'center' });
    });

    it('fontFamily passes through value', () => {
      expect(fontFamily('monospace')).toEqual({ fontFamily: 'monospace' });
    });
  });

  describe('layout helpers', () => {
    it('display', () => {
      expect(display('flex')).toEqual({ display: 'flex' });
    });

    it('position', () => {
      expect(position('relative')).toEqual({ position: 'relative' });
    });

    it('width', () => {
      expect(width('100%')).toEqual({ width: '100%' });
    });

    it('height', () => {
      expect(height('48px')).toEqual({ height: '48px' });
    });

    it('minWidth', () => {
      expect(minWidth('200px')).toEqual({ minWidth: '200px' });
    });

    it('minHeight', () => {
      expect(minHeight('0')).toEqual({ minHeight: '0' });
    });

    it('maxWidth', () => {
      expect(maxWidth('640px')).toEqual({ maxWidth: '640px' });
    });

    it('maxHeight', () => {
      expect(maxHeight('100vh')).toEqual({ maxHeight: '100vh' });
    });
  });

  describe('flexbox helpers', () => {
    it('flex with default argument', () => {
      expect(flex()).toEqual({ flex: '1' });
    });

    it('flex with explicit value', () => {
      expect(flex('0 0 auto')).toEqual({ flex: '0 0 auto' });
    });

    it('flexDirection', () => {
      expect(flexDirection('column')).toEqual({ flexDirection: 'column' });
    });

    it('alignItems', () => {
      expect(alignItems('center')).toEqual({ alignItems: 'center' });
    });

    it('justifyContent', () => {
      expect(justifyContent('space-between')).toEqual({ justifyContent: 'space-between' });
    });

    it('flexWrap', () => {
      expect(flexWrap('wrap')).toEqual({ flexWrap: 'wrap' });
    });
  });

  describe('positioning helpers', () => {
    it('top resolves a spacing token', () => {
      expect(top('4')).toEqual({ top: '16px' });
    });

    it('top passes through unknown value', () => {
      expect(top('50%')).toEqual({ top: '50%' });
    });

    it('bottom resolves a spacing token', () => {
      expect(bottom('0')).toEqual({ bottom: '0' });
    });

    it('left resolves a spacing token', () => {
      expect(left('md')).toEqual({ left: '16px' });
    });

    it('right resolves a spacing token', () => {
      expect(right('2')).toEqual({ right: '8px' });
    });
  });

  describe('border helpers', () => {
    it('border passes through value', () => {
      expect(border('1px solid #ccc')).toEqual({ border: '1px solid #ccc' });
    });

    it('borderRadius resolves a token', () => {
      expect(borderRadius('md')).toEqual({ borderRadius: '8px' });
    });

    it('borderRadius with full token', () => {
      expect(borderRadius('full')).toEqual({ borderRadius: '9999px' });
    });

    it('borderRadius passes through unknown value', () => {
      expect(borderRadius('4px')).toEqual({ borderRadius: '4px' });
    });

    it('borderWidth passes through value', () => {
      expect(borderWidth('2px')).toEqual({ borderWidth: '2px' });
    });
  });

  describe('visual helpers', () => {
    it('boxShadow resolves a token', () => {
      expect(boxShadow('sm')).toEqual({ boxShadow: '0 2px 4px rgba(0,0,0,0.1)' });
    });

    it('boxShadow passes through unknown value', () => {
      expect(boxShadow('none')).toEqual({ boxShadow: 'none' });
    });

    it('opacity passes through value', () => {
      expect(opacity('0.5')).toEqual({ opacity: '0.5' });
    });

    it('overflow passes through value', () => {
      expect(overflow('hidden')).toEqual({ overflow: 'hidden' });
    });

    it('zIndex passes through value', () => {
      expect(zIndex('10')).toEqual({ zIndex: '10' });
    });
  });

  describe('interaction helpers', () => {
    it('cursor passes through value', () => {
      expect(cursor('pointer')).toEqual({ cursor: 'pointer' });
    });

    it('pointerEvents passes through value', () => {
      expect(pointerEvents('none')).toEqual({ pointerEvents: 'none' });
    });
  });

  describe('transition helper', () => {
    it('transition with default argument', () => {
      expect(transition()).toEqual({ transition: 'all 0.2s ease' });
    });

    it('transition with explicit value', () => {
      expect(transition('opacity 0.3s linear')).toEqual({ transition: 'opacity 0.3s linear' });
    });
  });

  describe('background helper', () => {
    it('background passes through value', () => {
      expect(background('linear-gradient(to right, red, blue)')).toEqual({
        background: 'linear-gradient(to right, red, blue)',
      });
    });
  });

  describe('inlineStyle', () => {
    it('combines multiple style objects', () => {
      const result = inlineStyle(color('gray-500'), padding('4'));
      expect(result).toEqual({ color: '#6b7280', padding: '16px' });
    });

    it('filters out falsy values', () => {
      const result = inlineStyle(color('gray-500'), false, null, undefined, padding('4'));
      expect(result).toEqual({ color: '#6b7280', padding: '16px' });
    });

    it('returns empty object when called with no arguments', () => {
      expect(inlineStyle()).toEqual({});
    });

    it('later properties override earlier ones', () => {
      const result = inlineStyle(color('gray-500'), color('blue-500'));
      expect(result).toEqual({ color: '#3b82f6' });
    });

    it('works with all-falsy arguments', () => {
      const result = inlineStyle(false, null, undefined);
      expect(result).toEqual({});
    });
  });

  describe('defaultFontFamily', () => {
    it('is a non-empty string', () => {
      expect(typeof defaultFontFamily).toBe('string');
      expect(defaultFontFamily.length).toBeGreaterThan(0);
    });
  });
});
