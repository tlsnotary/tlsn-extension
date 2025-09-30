/**
 * Tests for UUID generation functionality
 *
 * Verifies that the uuid package is correctly installed and
 * generates valid UUIDs for WindowManager use.
 */

import { describe, it, expect } from 'vitest';
import {
  v4 as uuidv4,
  validate as uuidValidate,
  version as uuidVersion,
} from 'uuid';

describe('UUID Generation', () => {
  it('should generate valid UUID v4', () => {
    const uuid = uuidv4();

    expect(uuid).toBeDefined();
    expect(typeof uuid).toBe('string');
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('should generate unique UUIDs', () => {
    const uuid1 = uuidv4();
    const uuid2 = uuidv4();
    const uuid3 = uuidv4();

    expect(uuid1).not.toBe(uuid2);
    expect(uuid2).not.toBe(uuid3);
    expect(uuid1).not.toBe(uuid3);
  });

  it('should validate correct UUIDs', () => {
    const uuid = uuidv4();

    expect(uuidValidate(uuid)).toBe(true);
  });

  it('should reject invalid UUIDs', () => {
    expect(uuidValidate('not-a-uuid')).toBe(false);
    expect(uuidValidate('12345')).toBe(false);
    expect(uuidValidate('')).toBe(false);
  });

  it('should identify UUID version', () => {
    const uuid = uuidv4();

    expect(uuidVersion(uuid)).toBe(4);
  });

  it('should generate UUIDs suitable for WindowManager', () => {
    // Simulate what WindowManager will do
    const windowUUIDs = new Set<string>();

    // Generate 100 UUIDs
    for (let i = 0; i < 100; i++) {
      const uuid = uuidv4();

      // Verify it's valid
      expect(uuidValidate(uuid)).toBe(true);

      // Verify it's unique
      expect(windowUUIDs.has(uuid)).toBe(false);

      windowUUIDs.add(uuid);
    }

    expect(windowUUIDs.size).toBe(100);
  });

  it('should work with ManagedWindow type structure', () => {
    interface ManagedWindowSimple {
      id: number;
      uuid: string;
      url: string;
    }

    const window: ManagedWindowSimple = {
      id: 123,
      uuid: uuidv4(),
      url: 'https://example.com',
    };

    expect(window.uuid).toBeDefined();
    expect(uuidValidate(window.uuid)).toBe(true);
    expect(window.uuid.length).toBe(36); // UUID v4 format with dashes
  });
});
